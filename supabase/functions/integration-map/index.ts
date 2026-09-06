// integration-map — manually map an unmatched integration order to a bundle.
// Creates the real customer_purchases order (Pending), LEARNS the mapping so the
// same product auto-tallies next time, and removes the unmatched row.
//
// POST { unmatchedId, bundleId, kurier, typePayment: 'CASH'|'COD', totalSale }
// (caller JWT = the client/marketer who owns the tenant)
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
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const authed = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json(401, { error: "not_authenticated" });

    const { data: ownerUuid } = await authed.rpc("tenant_owner");
    if (!ownerUuid) return json(400, { error: "no_owner" });

    const body = await req.json().catch(() => ({}));
    const unmatchedId = String(body.unmatchedId || "");
    const bundleId = String(body.bundleId || "");
    const kurier = String(body.kurier || "Poslaju").trim(); // base courier label
    const isCOD = String(body.typePayment || "").toUpperCase() === "COD";
    const totalSale = Number(body.totalSale) || 0;
    if (!unmatchedId || !bundleId) return json(400, { error: "unmatchedId and bundleId are required" });

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Load the unmatched row (must belong to this tenant).
    const { data: row } = await admin.from("integration_unmatched").select("*").eq("id", unmatchedId).maybeSingle();
    if (!row || row.owner_user_id !== ownerUuid) return json(404, { error: "unmatched order not found" });

    // Load the bundle (costs) — must belong to this tenant.
    const { data: bundle } = await admin
      .from("logistic_bundles")
      .select("id, name, sku, weight, base_cost, hq_cost, owner_user_id")
      .eq("id", bundleId)
      .maybeSingle();
    if (!bundle || bundle.owner_user_id !== ownerUuid) return json(404, { error: "bundle not found" });

    const qty = Number(row.quantity) || 1;
    const { data: saleId } = await admin.rpc("generate_sale_id");
    const idSale = saleId || `PO${Date.now().toString().slice(-6)}`;
    const dateOrder = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

    const insert = {
      id_sale: idSale,
      date_order: dateOrder,
      marketer_id_staff: row.marketer_id_staff,
      total_sale: totalSale || Number(row.amount) || 0,
      unit: qty,
      tracking_number: "",
      delivery_status: "Pending",
      jenis_platform: "Facebook",
      jenis_customer: "NP",
      jenis_closing: "Website",
      name_customer: row.name_customer,
      phone_customer: row.phone_customer,
      address_customer: row.address_customer,
      city_customer: row.city_customer,
      postcode_customer: row.postcode_customer,
      state_customer: row.state_customer,
      kurier: `${kurier} ${isCOD ? "COD" : "CASH"}`,
      type_payment: isCOD ? "COD" : "CASH",
      date_payment: isCOD ? null : dateOrder,
      nota_staff: row.raw_product,
      bundle_id: bundle.id,
      cost_postage: 0,
      cost_baseproduct: (Number(bundle.base_cost) || 0) * qty,
      cost_hq: (Number(bundle.hq_cost) || 0) * qty,
      owner_user_id: ownerUuid,
      seos: "Pending",
      ...(row.source_platform === "shoppego"
        ? { shoppego_order_id: row.platform_order_id }
        : { woo_order_id: parseInt(row.platform_order_id) || null }),
    };
    const { data: order, error: insErr } = await admin.from("customer_purchases").insert(insert).select("id, id_sale").single();
    if (insErr) return json(500, { error: "insert_failed", details: insErr.message });

    // Learn the mapping so the same product auto-tallies next time.
    if (row.product_signature) {
      await admin.from("integration_product_map").upsert({
        owner_user_id: ownerUuid,
        product_signature: row.product_signature,
        bundle_id: bundle.id,
        kurier,
        updated_at: new Date().toISOString(),
      }, { onConflict: "owner_user_id,product_signature" });
    }

    // Remove from the unmatched queue.
    await admin.from("integration_unmatched").delete().eq("id", unmatchedId);

    return json(200, { success: true, order });
  } catch (e) {
    return json(500, { error: String((e as Error).message || e) });
  }
});
