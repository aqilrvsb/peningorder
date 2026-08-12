// deno-lint-ignore-file no-explicit-any
// parceldaily-sync-cron — scheduled reconciliation across ALL tenants.
//
// Runs on a pg_cron schedule (every ~30 min). For every client's ParcelDaily
// config, it finds recent orders still missing their waybill (webhook never
// landed, or the client hasn't configured the webhook at all) and backfills the
// real tracking number + waybill URL from ParcelDaily's Get Checkout Status API
// (POST /v1/partner/checkout-status, accepts { orderIds }). Covers clients AND
// their staff (orders are owned by the client tenant).
//
// Auth: caller must present header `x-cron-secret` matching app_settings.cron_secret.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret" };
const jsonHeaders = { ...cors, "Content-Type": "application/json" };
const PD_COURIERS = /poslaju|ninjavan|jnt|dhl|spx/i;
const chunk = <T>(a: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  // Auth: shared secret stored in app_settings (so no env-var provisioning needed).
  const provided = req.headers.get("x-cron-secret") || "";
  const { data: secretRow } = await service.from("app_settings").select("value").eq("key", "cron_secret").maybeSingle();
  const expected = (secretRow?.value as any)?.secret || "";
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: jsonHeaders });
  }

  const startedAt = Date.now();
  const MAX_MS = 45_000;          // wall-clock budget per run
  const PER_OWNER_LIMIT = 200;    // recent stuck orders per tenant per run
  const LOOKBACK_DAYS = 21;       // ignore older orders
  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);

  let ownersProcessed = 0, checked = 0, updated = 0;

  try {
    const { data: configs } = await service
      .from("parceldaily_config")
      .select("owner_user_id, token, merchant_id, environment");

    for (const cfg of (configs || [])) {
      if (Date.now() - startedAt > MAX_MS) break;
      if (!cfg?.token || !cfg?.merchant_id || !cfg?.owner_user_id) continue;

      const { data: rows } = await service.from("customer_purchases")
        .select("id, tracking_number, pd_order_id, waybill_url, kurier, delivery_status")
        .eq("owner_user_id", cfg.owner_user_id)
        .is("waybill_url", null)
        .gte("date_order", sinceIso)
        .order("created_at", { ascending: false })
        .limit(PER_OWNER_LIMIT);

      const candidates = (rows || []).filter((r: any) =>
        PD_COURIERS.test(r.kurier || "") && r.delivery_status !== "Return" && r.delivery_status !== "Failed");
      if (!candidates.length) continue;
      ownersProcessed++;

      const apiBase = (cfg.environment || "sandbox") === "production"
        ? "https://api.parceldaily.com" : "https://api.sandbox.parceldaily.com";
      const headers = { "Content-Type": "application/json", token: cfg.token, merchantid: cfg.merchant_id };
      const idOf = (r: any) => r.pd_order_id || r.tracking_number;
      const orderIds = [...new Set(candidates.map(idOf).filter(Boolean))];

      const items: any[] = [];
      for (const group of chunk(orderIds, 50)) {
        if (Date.now() - startedAt > MAX_MS) break;
        try {
          const res = await fetch(`${apiBase}/v1/partner/checkout-status`, { method: "POST", headers, body: JSON.stringify({ orderIds: group }) });
          const j = await res.json().catch(() => null);
          const arr = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : []);
          if (Array.isArray(arr)) items.push(...arr);
        } catch { /* skip this chunk */ }
      }

      const byOrderId = new Map<string, any>();
      const byConsign = new Map<string, any>();
      for (const it of items) {
        if (it?.orderId) byOrderId.set(String(it.orderId), it);
        if (it?.consign_no) byConsign.set(String(it.consign_no), it);
      }

      for (const r of candidates) {
        checked++;
        const m = byOrderId.get(String(idOf(r))) || byConsign.get(String(r.tracking_number));
        const consign = m?.consign_no || null;
        if (!consign) continue; // not shipped / refunded — nothing to fill
        const rawWb = m.connoteURL ? String(m.connoteURL) : "";
        const waybill = rawWb && !rawWb.includes("undefined") ? rawWb : null;
        const patch: Record<string, unknown> = {};
        if (consign !== r.tracking_number) patch.tracking_number = consign;
        if (waybill && !r.waybill_url) patch.waybill_url = waybill;
        if (m.orderId && !r.pd_order_id) patch.pd_order_id = m.orderId;
        if (Object.keys(patch).length) {
          const { error } = await service.from("customer_purchases").update(patch).eq("id", r.id).eq("owner_user_id", cfg.owner_user_id);
          if (!error) updated++;
        }
      }
    }

    return new Response(JSON.stringify({ success: true, ownersProcessed, checked, updated, ms: Date.now() - startedAt }), { headers: jsonHeaders });
  } catch (err) {
    console.error("parceldaily-sync-cron error:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err), ownersProcessed, checked, updated }), { status: 500, headers: jsonHeaders });
  }
});
