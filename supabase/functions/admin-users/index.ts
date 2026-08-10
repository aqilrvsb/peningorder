/**
 * admin-users — superadmin-only client management.
 *
 * Actions (POST JSON { action, ... }):
 *   create        { email, password, full_name, business_name, plan, days }
 *   set_password  { user_id, password }
 *   delete        { user_id }
 *   impersonate   { user_id }  -> returns { email, token_hash } for the caller
 *                                 to verifyOtp() and become that client.
 *
 * The caller's JWT (sent automatically by supabase.functions.invoke) identifies
 * them; we verify they are superadmin via is_superadmin() before doing anything
 * with the service role.
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

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Tables owned by a tenant via owner_user_id — cleaned on delete.
const OWNED_TABLES = [
  "customer_purchases", "prospects", "spends", "expenses", "products",
  "logistic_bundles", "stock_in_logistic", "stock_out_logistic",
  "parceldaily_config", "invoice_settings", "device_setting",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json(401, { error: "no_auth" });

    // Verify the caller is a superadmin (is_superadmin() uses their auth.uid()).
    const authed = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await authed.auth.getUser();
    if (userErr || !user) return json(401, { error: "not_authenticated" });
    const { data: isAdmin } = await authed.rpc("is_superadmin");
    if (!isAdmin) return json(403, { error: "not_superadmin" });

    const admin = createClient(SUPABASE_URL, SERVICE);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const full_name = String(body.full_name || "").trim();
      const business_name = String(body.business_name || "").trim();
      const plan = String(body.plan || "trial").toLowerCase();
      const days = Number(body.days) || 14;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "invalid_email" });
      if (password.length < 6) return json(400, { error: "password_min_6" });

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { username: email.split("@")[0], full_name, business_name, whatsapp: String(body.phone || "") },
      });
      if (cErr || !created?.user) {
        const msg = cErr?.message || "create_failed";
        return json(/already|exist|registered/i.test(msg) ? 409 : 500, { error: "create_failed", detail: msg });
      }
      const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
      await admin.from("profiles").update({
        plan, plan_expires_at: expiresAt,
        ...(business_name ? { business_name } : {}),
        ...(full_name ? { full_name } : {}),
      }).eq("id", created.user.id);
      return json(200, { success: true, user_id: created.user.id, email });
    }

    if (action === "set_password") {
      const user_id = String(body.user_id || "");
      const password = String(body.password || "");
      if (!user_id) return json(400, { error: "missing_user_id" });
      if (password.length < 6) return json(400, { error: "password_min_6" });
      const { error } = await admin.auth.admin.updateUserById(user_id, { password });
      if (error) return json(500, { error: "set_password_failed", detail: error.message });
      return json(200, { success: true });
    }

    if (action === "delete") {
      const user_id = String(body.user_id || "");
      if (!user_id) return json(400, { error: "missing_user_id" });
      if (user_id === user.id) return json(400, { error: "cannot_delete_self" });
      for (const t of OWNED_TABLES) {
        await admin.from(t).delete().eq("owner_user_id", user_id);
      }
      await admin.from("payments").delete().eq("user_id", user_id);
      await admin.from("user_roles").delete().eq("user_id", user_id);
      await admin.from("profiles").delete().eq("id", user_id);
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) return json(500, { error: "delete_failed", detail: error.message });
      return json(200, { success: true });
    }

    if (action === "impersonate") {
      const user_id = String(body.user_id || "");
      if (!user_id) return json(400, { error: "missing_user_id" });
      const { data: prof } = await admin.from("profiles").select("email").eq("id", user_id).maybeSingle();
      const email = prof?.email;
      if (!email) return json(404, { error: "client_not_found" });
      // Generate a magic-link token WITHOUT sending an email; the caller
      // exchanges token_hash via verifyOtp() to obtain the client's session.
      const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      if (error || !data?.properties?.hashed_token) {
        return json(500, { error: "impersonate_failed", detail: error?.message });
      }
      return json(200, { success: true, email, token_hash: data.properties.hashed_token });
    }

    return json(400, { error: "unknown_action" });
  } catch (e) {
    console.error("admin-users fatal:", e);
    return json(500, { error: String((e as Error).message || e) });
  }
});
