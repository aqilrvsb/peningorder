// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: jsonHeaders });
const fail = (error: string, extra?: Record<string, unknown>) =>
  new Response(JSON.stringify({ error, ...(extra || {}) }), {
    status: 200,
    headers: jsonHeaders,
  });

// Three modes:
//   1) mode="urls":   INSTANT. Returns waybill_url list from customer_purchases (populated by CHECKOUT webhook).
//                     Payload: { mode: "urls", purchaseIds: number[] } OR { mode: "urls", trackingNumbers: string[] }
//   2) mode="single": returns a PDF URL for a single consign_no via POST /v1/partner/consign-pdf/
//   3) mode="bulk":   requests bulk PDF. URL arrives via CONNOTE_LINK webhook (async, ~30-60s).

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    // Use caller's JWT so RLS enforces owner_user_id = auth.uid()
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return fail("Not authenticated. Sign in and try again.");
    }

    const body: {
      mode?: "urls" | "single" | "bulk";
      trackingNumbers?: string[];
      purchaseIds?: string[]; // customer_purchases.id is a UUID
      callbackUrl?: string;
      thermal?: boolean;
    } = await req.json();

    const mode =
      body.mode ||
      (Array.isArray(body.purchaseIds) && body.purchaseIds.length ? "urls" : null) ||
      (Array.isArray(body.trackingNumbers) && body.trackingNumbers.length === 1 ? "single" : "bulk");

    // MODE: urls — instant lookup from our DB (no Parcel Daily call)
    if (mode === "urls") {
      const ids = (body.purchaseIds || []).map((v) => String(v).trim()).filter(Boolean);
      const tns = (body.trackingNumbers || []).map((t) => String(t).trim()).filter(Boolean);
      if (!ids.length && !tns.length) {
        return fail("purchaseIds[] or trackingNumbers[] is required for mode='urls'");
      }
      let query = supabase
        .from("customer_purchases")
        .select("id, tracking_number, waybill_url, kurier, name_customer, delivery_status");
      if (ids.length) query = query.in("id", ids);
      else query = query.in("tracking_number", tns);
      const { data: rows, error } = await query;
      if (error) return fail(`DB lookup failed: ${error.message}`);
      const withUrl = (rows || []).filter((r) => !!r.waybill_url);
      const missing = (rows || []).filter((r) => !r.waybill_url);
      return ok({
        success: true,
        mode: "urls",
        count: withUrl.length,
        waybills: withUrl.map((r) => ({
          id: r.id,
          trackingNumber: r.tracking_number,
          waybillUrl: r.waybill_url,
          courier: r.kurier,
          customer: r.name_customer,
        })),
        missing: missing.map((r) => ({ id: r.id, trackingNumber: r.tracking_number, status: r.delivery_status })),
      });
    }

    const trackingNumbers = (body.trackingNumbers || []).map((t) => String(t).trim()).filter(Boolean);
    if (!trackingNumbers.length) {
      return fail("trackingNumbers[] is required");
    }

    const { data: config, error: configError } = await supabase
      .from("parceldaily_config")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (configError || !config) {
      return fail("Parcel Daily configuration not found. Please configure in Settings.");
    }

    const apiBase =
      (config.environment || "sandbox") === "production"
        ? "https://api.parceldaily.com"
        : "https://api.sandbox.parceldaily.com";

    const authHeaders = {
      "Content-Type": "application/json",
      token: config.token,
      merchantid: config.merchant_id,
    };

    if (mode === "single") {
      const consignNo = trackingNumbers[0];
      const res = await fetch(`${apiBase}/v1/partner/consign-pdf/`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ consign_no: consignNo }),
      });
      const txt = await res.text();
      let result: any;
      try {
        result = JSON.parse(txt);
      } catch {
        result = { raw: txt };
      }
      if (!res.ok) {
        return fail(`Parcel Daily consign-pdf: HTTP ${res.status}`, {
          details: result,
        });
      }
      // Response typically includes { url } — mirror what Parcel Daily returns
      return ok({
        success: true,
        mode: "single",
        trackingNumber: consignNo,
        pdfUrl: result?.url || result?.data?.url || result?.data?.connoteURL,
        thermalPdfUrl: result?.thermalUrl || result?.data?.thermalUrl,
        raw: result,
      });
    }

    // BULK mode → POST /v2/partner/bulk-consign-pdf/, waits for CONNOTE_LINK webhook
    const bulkPayload: Record<string, unknown> = { consign_nos: trackingNumbers };
    if (body.callbackUrl) bulkPayload.callbackUrl = body.callbackUrl;
    if (body.thermal) bulkPayload.thermal = true;

    const res = await fetch(`${apiBase}/v2/partner/bulk-consign-pdf/`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(bulkPayload),
    });
    const txt = await res.text();
    let result: any;
    try {
      result = JSON.parse(txt);
    } catch {
      result = { raw: txt };
    }
    if (!res.ok) {
      return fail(`Parcel Daily bulk-consign-pdf: HTTP ${res.status}`, {
        details: result,
      });
    }
    // Response: { data: [trackingIds accepted] }. URL arrives via CONNOTE_LINK webhook.
    return ok({
      success: true,
      mode: "bulk",
      accepted: result?.data || [],
      note: "PDF URL will arrive via CONNOTE_LINK webhook to the configured callback",
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    console.error("parceldaily-waybill error:", err);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
