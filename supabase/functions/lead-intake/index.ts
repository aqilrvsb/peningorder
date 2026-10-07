// lead-intake — PeningBot pushes a WhatsApp lead into the marketer's Prospects.
//
// POST JSON { idstaff, name, phone, niche?, type?, date? }
//   header x-api-key = platform_secrets.peningbot_lead.secret
//
// `idstaff` is the marketer's peningorder ID staff (e.g. PO-NL237-3, or the
// client's own PO-NL237), entered by the user in PeningBot. The lead lands in
// that tenant under that marketer (marketer_id_staff).
// Same phone already a lead for that marketer -> no new row (duplicate: true).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Prospects store phones as 60XXXXXXXXX.
const toPhone60 = (raw: string): string => {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("60")) return d;
  if (d.startsWith("0")) return "60" + d.slice(1);
  return "60" + d;
};

// Malaysia (UTC+8) calendar date.
const myToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { success: false, error: "method_not_allowed" });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE);

    const key = req.headers.get("x-api-key") || "";
    const { data: sec } = await admin.from("platform_secrets").select("value").eq("key", "peningbot_lead").maybeSingle();
    // deno-lint-ignore no-explicit-any
    const expected = (sec?.value as any)?.secret || "";
    if (!key || !expected || key !== expected) return json(401, { success: false, error: "unauthorized" });

    const body = await req.json().catch(() => ({}));
    const idIn = String(body?.idstaff || "").trim().toUpperCase();
    const phone = toPhone60(String(body?.phone ?? body?.no_telefon ?? ""));
    const name = String(body?.name ?? body?.nama ?? "").trim().slice(0, 200);
    const nicheIn = String(body?.niche || "").trim();
    const typeIn = String(body?.type || "NP").trim().toUpperCase();
    const dateIn = String(body?.date || "").trim();

    if (!/^[A-Z0-9-]{2,40}$/.test(idIn)) return json(400, { success: false, error: "invalid_idstaff" });
    if (phone.length < 10 || phone.length > 15) return json(400, { success: false, error: "invalid_phone" });
    if (typeIn !== "NP" && typeIn !== "EP") return json(400, { success: false, error: "invalid_type", hint: "type mesti NP atau EP" });
    if (dateIn && !/^\d{4}-\d{2}-\d{2}$/.test(dateIn)) return json(400, { success: false, error: "invalid_date", hint: "format YYYY-MM-DD" });

    // ID staff is unique across all tenants (stored uppercase).
    const { data: who } = await admin.from("profiles").select("id, idstaff, parent_user_id, is_active").eq("idstaff", idIn).maybeSingle();
    if (!who) return json(404, { success: false, error: "idstaff_not_found", hint: "ID staff tidak dijumpai dalam peningorder" });
    if (who.is_active === false) return json(403, { success: false, error: "staff_inactive" });
    // Leads belong to marketers / the client — not the logistic account or admin.
    const { data: role } = await admin.from("user_roles").select("role").eq("user_id", who.id).limit(1).maybeSingle();
    if (role?.role === "logistic" || role?.role === "superadmin") return json(403, { success: false, error: "not_a_marketer" });

    const owner = (who.parent_user_id || who.id) as string;
    const idstaff = String(who.idstaff);

    // Niche = product SKU (same as the Prospects form). Match name or SKU; a
    // tenant with one product gets it by default.
    const { data: products } = await admin.from("products").select("name, sku").eq("owner_user_id", owner);
    const list = products || [];
    let niche = nicheIn.toUpperCase();
    // deno-lint-ignore no-explicit-any
    const hit = nicheIn && list.find((p: any) => (p.sku || "").toUpperCase() === niche || (p.name || "").toUpperCase() === niche);
    if (hit) niche = hit.sku || hit.name;
    else if (!niche) niche = list.length === 1 ? (list[0].sku || list[0].name) : "-";

    // Already this marketer's lead -> keep the existing one.
    const local = phone.slice(2);
    const { data: existing } = await admin.from("prospects").select("id")
      .eq("owner_user_id", owner).eq("marketer_id_staff", idstaff)
      .in("no_telefon", [phone, "0" + local, local])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) return json(200, { success: true, duplicate: true, lead_id: existing.id, idstaff });

    const { data: row, error } = await admin.from("prospects").insert({
      owner_user_id: owner,
      created_by: who.id,
      marketer_id_staff: idstaff,
      nama_prospek: name || phone,
      no_telefon: phone,
      niche,
      jenis_prospek: typeIn,
      tarikh_phone_number: dateIn || myToday(),
      admin_id_staff: "",
      status_closed: "",
      price_closed: 0,
      count_order: 0,
    }).select("id").single();
    if (error) return json(500, { success: false, error: error.message });

    return json(200, { success: true, duplicate: false, lead_id: row.id, idstaff });
  } catch (e) {
    return json(500, { success: false, error: String((e as Error).message || e) });
  }
});
