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

// Cancel a Parcel Daily shipment.
// Payload: { orderId?: string, trackingNumber?: string, purchaseId?: number }
// One of the three IDs must be provided. purchaseId lets caller reference the DB row directly.

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return fail("Not authenticated. Sign in and try again.");

    const body: {
      orderId?: string;
      trackingNumber?: string;
      purchaseId?: number;
    } = await req.json();

    let orderId = body.orderId?.trim() || null;
    let trackingNumber = body.trackingNumber?.trim() || null;

    // If a purchaseId is given, look up its ids (RLS ensures own-row only)
    if (body.purchaseId) {
      const { data: row } = await supabase
        .from("customer_purchases")
        .select("id, id_sale, tracking_number")
        .eq("id", body.purchaseId)
        .maybeSingle();
      if (!row) return fail("Order not found or not yours");
      orderId = orderId || row.id_sale || null;
      trackingNumber = trackingNumber || row.tracking_number || null;
    }

    if (!orderId && !trackingNumber) {
      return fail("orderId, trackingNumber, or purchaseId required");
    }

    // RLS: only own row
    const { data: config, error: configError } = await supabase
      .from("parceldaily_config")
      .select("*")
      .maybeSingle();
    if (configError || !config) {
      return fail("Parcel Daily configuration not found. Configure in Courier Settings.");
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

    // Parcel Daily cancel — try orderId first, then consign_no as fallback
    const cancelPayload: Record<string, unknown> = {};
    if (orderId) cancelPayload.orderId = orderId;
    if (trackingNumber) cancelPayload.consign_no = trackingNumber;

    const res = await fetch(`${apiBase}/v1/partner/order/cancel`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(cancelPayload),
    });
    const txt = await res.text();
    let result: any;
    try {
      result = JSON.parse(txt);
    } catch {
      result = { raw: txt };
    }

    if (!res.ok) {
      const msg = result?.message || result?.error || `Cancel failed (HTTP ${res.status})`;
      return fail(`Parcel Daily cancel: ${msg}`, { details: result, orderId, trackingNumber });
    }

    // Mark the DB row as cancelled (RLS-scoped)
    if (body.purchaseId) {
      await supabase
        .from("customer_purchases")
        .update({ delivery_status: "Cancelled" })
        .eq("id", body.purchaseId);
    } else if (trackingNumber) {
      await supabase
        .from("customer_purchases")
        .update({ delivery_status: "Cancelled" })
        .eq("tracking_number", trackingNumber);
    } else if (orderId) {
      await supabase
        .from("customer_purchases")
        .update({ delivery_status: "Cancelled" })
        .eq("id_sale", orderId);
    }

    return ok({
      success: true,
      orderId,
      trackingNumber,
      message: "Order cancelled. Refund (if any) will be credited by Parcel Daily.",
      details: result,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    console.error("parceldaily-cancel error:", err);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
