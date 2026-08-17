/**
 * team-staff — a CLIENT manages their marketer staff (team).
 *
 * POST JSON { action, ... } (caller's JWT = the client):
 *   create   { name, whatsapp, password }  -> new staff (id = <clientId>-N, role marketer)
 *   list                                    -> the client's staff
 *   reset_password { user_id, password }
 *   set_active { user_id, active }
 *   delete   { user_id }
 *
 * Staff log in with their ID staff (mapped to a synthetic email) + password.
 * Staff share the client's tenant data via parent_user_id (see tenant_owner()).
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Staff auth email is derived deterministically from the ID staff so they can
// "log in by ID staff" without us storing a real email.
const STAFF_EMAIL_DOMAIN = "staff.peningorder.local";
const staffEmail = (idstaff: string) => `${idstaff.toLowerCase().replace(/[^a-z0-9-]/g, "")}@${STAFF_EMAIL_DOMAIN}`;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json(401, { error: "no_auth" });
    const authed = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await authed.auth.getUser();
    if (uErr || !user) return json(401, { error: "not_authenticated" });

    const admin = createClient(SUPABASE_URL, SERVICE);

    // The caller must be a CLIENT (owns a tenant) — not a staff, not superadmin.
    const { data: me } = await admin.from("profiles").select("id, idstaff, parent_user_id, plan, plan_expires_at").eq("id", user.id).maybeSingle();
    if (!me) return json(404, { error: "profile_not_found" });
    if (me.parent_user_id) return json(403, { error: "staff_cannot_manage_team" });
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).limit(1).maybeSingle();
    if (roleRow?.role === "superadmin") return json(403, { error: "admin_not_a_tenant" });

    const clientId = me.id;
    const clientIdstaff = me.idstaff as string;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "list") {
      const { data } = await admin
        .from("profiles")
        .select("id, idstaff, full_name, whatsapp, whatsapp_number, is_active, pay_mode, commission_percent, created_at")
        .eq("parent_user_id", clientId)
        .order("idstaff", { ascending: true });
      const staff = data || [];
      // Attach each staff's role (marketer | logistic) from user_roles.
      const ids = staff.map((s: any) => s.id);
      const roleBy = new Map<string, string>();
      if (ids.length) {
        const { data: roles } = await admin.from("user_roles").select("user_id, role").in("user_id", ids);
        for (const r of roles || []) roleBy.set(r.user_id, r.role);
      }
      return json(200, { success: true, staff: staff.map((s: any) => ({ ...s, role: roleBy.get(s.id) || "marketer" })) });
    }

    if (action === "create") {
      const name = String(body?.name || "").trim();
      const whatsapp = String(body?.whatsapp || "").replace(/\D/g, "");
      const password = String(body?.password || "");
      const staffRole = body?.staff_role === "logistic" ? "logistic" : "marketer";
      if (name.length < 2) return json(400, { error: "invalid_name" });
      // Password is optional: blank → default to the generated ID staff (below).
      // Only reject an explicitly-typed password that is too short.
      if (password && password.length < 6) return json(400, { error: "password_min_6" });

      const { data: existing } = await admin.from("profiles").select("id, idstaff").eq("parent_user_id", clientId);

      let newIdstaff: string;
      if (staffRole === "logistic") {
        // Only ONE logistic account per client.
        const staffIds = (existing || []).map((s: any) => s.id);
        if (staffIds.length) {
          const { data: logRoles } = await admin.from("user_roles").select("user_id").eq("role", "logistic").in("user_id", staffIds);
          if ((logRoles || []).length >= 1) return json(400, { error: "logistic_exists" });
        }
        newIdstaff = `${clientIdstaff}-LOG`;
      } else {
        // Next sequential numeric suffix: max existing N + 1 (robust to deletions).
        let maxN = 0;
        for (const s of existing || []) {
          const m = String(s.idstaff || "").match(/-(\d+)$/);
          if (m) maxN = Math.max(maxN, Number(m[1]));
        }
        newIdstaff = `${clientIdstaff}-${maxN + 1}`;
      }
      const email = staffEmail(newIdstaff);
      // Blank password → use the ID staff as the password (always ≥6 chars).
      const finalPassword = password || newIdstaff;

      // handle_new_user sees staff_of + staff_idstaff + staff_role and provisions
      // the profile as a staff of this client (idstaff set at INSERT — a BEFORE
      // UPDATE trigger locks idstaff, so it cannot be changed afterwards).
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password: finalPassword,
        email_confirm: true,
        user_metadata: { username: newIdstaff, full_name: name, whatsapp, staff_of: clientId, staff_idstaff: newIdstaff, staff_role: staffRole },
      });
      if (cErr || !created?.user) {
        return json(500, { error: "create_failed", detail: cErr?.message });
      }
      return json(200, { success: true, id: created.user.id, idstaff: newIdstaff, login: newIdstaff, password: finalPassword, role: staffRole });
    }

    // Remaining actions target a staff the caller owns.
    const targetId = String(body?.user_id || "");
    if (!targetId) return json(400, { error: "missing_user_id" });
    const { data: target } = await admin.from("profiles").select("id, parent_user_id").eq("id", targetId).maybeSingle();
    if (!target || target.parent_user_id !== clientId) return json(403, { error: "not_your_staff" });

    if (action === "reset_password") {
      const password = String(body?.password || "");
      if (password.length < 6) return json(400, { error: "password_min_6" });
      const { error } = await admin.auth.admin.updateUserById(targetId, { password });
      if (error) return json(500, { error: error.message });
      return json(200, { success: true });
    }

    if (action === "set_active") {
      const active = !!body?.active;
      await admin.from("profiles").update({ is_active: active }).eq("id", targetId);
      return json(200, { success: true, active });
    }

    if (action === "set_pay_mode") {
      const mode = String(body?.pay_mode || "");
      if (mode !== "commission_order" && mode !== "gross_profit") return json(400, { error: "invalid_pay_mode" });
      // Percent only meaningful for gross_profit; clamp 0–100. Reset to 0 for commission_order.
      let pct = Number(body?.commission_percent);
      if (!Number.isFinite(pct)) pct = 0;
      pct = Math.max(0, Math.min(100, pct));
      const patch: Record<string, unknown> = { pay_mode: mode, commission_percent: mode === "gross_profit" ? pct : 0 };
      await admin.from("profiles").update(patch).eq("id", targetId);
      return json(200, { success: true, pay_mode: mode, commission_percent: patch.commission_percent });
    }

    if (action === "delete") {
      await admin.from("profiles").delete().eq("id", targetId);
      await admin.auth.admin.deleteUser(targetId).catch(() => {});
      return json(200, { success: true });
    }

    return json(400, { error: "invalid_action" });
  } catch (e) {
    console.error("team-staff fatal:", e);
    return json(500, { error: String((e as Error).message || e) });
  }
});
