// deno-lint-ignore-file no-explicit-any
// parceldaily-sync — reconcile orders whose Checkout Webhook never landed.
//
// ParcelDaily's "Get Checkout Status" (POST /v1/partner/checkout-status) accepts
// { orderIds } OR { consign_nos } and returns the same payload as the Checkout
// Webhook: { orderId, consign_no, status, connoteURL, ... }. So for any order
// still sitting on its orderId placeholder (or missing its waybill), we can pull
// the real tracking number + waybill URL on demand — no webhook required.
//
// Payload:
//   { purchaseIds?: string[] }  — sync just these orders (used by the print
//                                 fallback). If omitted/empty, auto-find the
//                                 tenant's stuck orders (Sync Tracking button).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: jsonHeaders });
const fail = (error: string, extra?: Record<string, unknown>) =>
  new Response(JSON.stringify({ error, ...(extra || {}) }), { status: 200, headers: jsonHeaders });

const PD_COURIERS = /poslaju|ninjavan|jnt|dhl/i;
const chunk = <T>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return fail("Not authenticated. Sign in and try again.");

    // Tenant owner (client id even when a staff calls) + config via service role.
    const { data: ownerUuid } = await supabase.rpc("tenant_owner");
    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: config } = await service
      .from("parceldaily_config").select("*").eq("owner_user_id", ownerUuid).maybeSingle();
    if (!config?.token || !config?.merchant_id) {
      return fail("Parcel Daily configuration not found. Please configure in Settings.");
    }
    const apiBase = (config.environment || "sandbox") === "production"
      ? "https://api.parceldaily.com"
      : "https://api.sandbox.parceldaily.com";
    const headers = { "Content-Type": "application/json", token: config.token, merchantid: config.merchant_id };

    const body = await req.json().catch(() => ({}));
    const purchaseIds: string[] = Array.isArray(body?.purchaseIds)
      ? body.purchaseIds.map((v: unknown) => String(v)).filter(Boolean) : [];

    // Candidate stuck orders: PD courier, no waybill yet, not a final failed state.
    let q = service.from("customer_purchases")
      .select("id, tracking_number, pd_order_id, waybill_url, kurier, delivery_status, date_order")
      .eq("owner_user_id", ownerUuid);
    if (purchaseIds.length) {
      q = q.in("id", purchaseIds);
    } else {
      q = q.is("waybill_url", null).order("created_at", { ascending: false }).limit(300);
    }
    const { data: rows, error: rowsErr } = await q;
    if (rowsErr) return fail(`DB lookup failed: ${rowsErr.message}`);

    const candidates = (rows || []).filter((r: any) =>
      PD_COURIERS.test(r.kurier || "") &&
      (purchaseIds.length ? true : !r.waybill_url) &&
      r.delivery_status !== "Return" && r.delivery_status !== "Failed");

    if (!candidates.length) return ok({ success: true, checked: 0, updated: 0, results: [] });

    // The ParcelDaily orderId to query with = pd_order_id, else the placeholder
    // tracking_number (un-reconciled orders store the orderId there).
    const idOf = (r: any) => r.pd_order_id || r.tracking_number;
    const orderIds = [...new Set(candidates.map(idOf).filter(Boolean))];

    // 1) Query Get Checkout Status by orderIds (chunked).
    const statusItems: any[] = [];
    for (const group of chunk(orderIds, 50)) {
      const res = await fetch(`${apiBase}/v1/partner/checkout-status`, {
        method: "POST", headers, body: JSON.stringify({ orderIds: group }),
      });
      const j = await res.json().catch(() => null);
      const arr = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : []);
      if (Array.isArray(arr)) statusItems.push(...arr);
    }

    // Index results by orderId AND consign_no for matching.
    const byOrderId = new Map<string, any>();
    const byConsign = new Map<string, any>();
    for (const it of statusItems) {
      if (it?.orderId) byOrderId.set(String(it.orderId), it);
      if (it?.consign_no) byConsign.set(String(it.consign_no), it);
    }

    let updated = 0;
    const results: any[] = [];
    for (const r of candidates) {
      const match = byOrderId.get(String(idOf(r))) || byConsign.get(String(r.tracking_number));
      if (!match) { results.push({ id: r.id, resolved: false }); continue; }
      // No consign_no = the shipment was never actually created (e.g. Refunded /
      // Cancelled — credit auto-refunded). Nothing to fill; skip safely.
      const consign = match.consign_no || null;
      if (!consign) { results.push({ id: r.id, resolved: false, status: match.status || null }); continue; }
      // Guard against ParcelDaily's placeholder ".../consign-pdf/undefined" URL.
      const rawWaybill = match.connoteURL ? String(match.connoteURL) : "";
      const waybill = rawWaybill && !rawWaybill.includes("undefined") ? rawWaybill : null;

      const patch: Record<string, unknown> = {};
      if (consign && consign !== r.tracking_number) patch.tracking_number = consign;
      if (waybill && !r.waybill_url) patch.waybill_url = waybill;
      if (match.orderId && !r.pd_order_id) patch.pd_order_id = match.orderId;
      if (Object.keys(patch).length) {
        const { error: upErr } = await service.from("customer_purchases")
          .update(patch).eq("id", r.id).eq("owner_user_id", ownerUuid);
        if (!upErr) updated++;
      }
      results.push({ id: r.id, resolved: true, tracking_number: consign || r.tracking_number, waybill_url: waybill || r.waybill_url });
    }

    return ok({ success: true, checked: candidates.length, updated, results });
  } catch (err) {
    console.error("parceldaily-sync error:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), { status: 500, headers: jsonHeaders });
  }
});
