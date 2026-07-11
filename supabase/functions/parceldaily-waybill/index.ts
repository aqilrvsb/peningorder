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

// Two modes:
//   1) mode="single": returns a PDF URL for a single consign_no (uses POST /v1/partner/consign-pdf/)
//   2) mode="bulk":   requests bulk PDF, returns immediately.
//                     Actual URL arrives via webhook CONNOTE_LINK — caller polls the row.
//
// Payload shape:
//   { mode: "single" | "bulk", trackingNumbers: string[], callbackUrl?: string, thermal?: boolean }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: {
      mode?: "single" | "bulk";
      trackingNumbers?: string[];
      callbackUrl?: string;
      thermal?: boolean;
    } = await req.json();

    const mode = body.mode || (Array.isArray(body.trackingNumbers) && body.trackingNumbers.length === 1 ? "single" : "bulk");
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
