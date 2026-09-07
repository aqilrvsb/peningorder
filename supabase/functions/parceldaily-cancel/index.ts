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
// Payload: { orderId?: string, trackingNumber?: string, purchaseId?: string }
// One of the three IDs must be provided. purchaseId lets the caller reference the DB row directly.
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

    // Resolve the tenant owner (client id even when the caller is a staff member)
    // and use the service role for config/row access — staff cannot read the
    // tenant's parceldaily_config directly (RLS), which previously made cancels
    // silently fail for staff and left the ParcelDaily booking active (double cost).
    const { data: ownerUuid } = await supabase.rpc("tenant_owner");
    if (!ownerUuid) return fail("Tenant not found.");
    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const body: {
      orderId?: string;
      trackingNumber?: string;
      purchaseId?: string;
      keepStatus?: boolean;
    } = await req.json();

    let orderId = body.orderId?.trim() || null;
    let trackingNumber = body.trackingNumber?.trim() || null;
    // keepStatus = cancel ONLY at Parcel Daily (release the old booking), do NOT
    // mark the order Cancelled. Used when an EDIT changes courier: the order is
    // being re-booked, not cancelled, and the edit itself sets the final status.
    // Without this the order could be stranded "Cancelled" if the re-book/status
    // reset raced or failed — the order then "disappeared" from the active list.
    const keepStatus = body.keepStatus === true;

    // If a purchaseId is given, look up its ids (scoped to this tenant).
    if (body.purchaseId) {
      const { data: row } = await service
        .from("customer_purchases")
        .select("id, id_sale, pd_order_id, tracking_number, owner_user_id")
        .eq("id", body.purchaseId)
        .maybeSingle();
      if (!row || row.owner_user_id !== ownerUuid) return fail("Order not found or not yours");
      orderId = orderId || row.pd_order_id || null;
      trackingNumber = trackingNumber || row.tracking_number || null;
    }

    if (!orderId && !trackingNumber) {
      return fail("orderId, trackingNumber, or purchaseId required");
    }

    const { data: config, error: configError } = await service
      .from("parceldaily_config")
      .select("*")
      .eq("owner_user_id", ownerUuid)
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

    // Parcel Daily cancel — try orderId first, then consign_no as fallback.
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

    // Mark the DB row as cancelled (service-scoped) — UNLESS this is a re-book
    // (edit changing courier), where the caller keeps ownership of the status.
    if (!keepStatus) {
      if (body.purchaseId) {
        await service.from("customer_purchases").update({ delivery_status: "Cancelled" }).eq("id", body.purchaseId);
      } else if (trackingNumber) {
        await service.from("customer_purchases").update({ delivery_status: "Cancelled" }).eq("tracking_number", trackingNumber).eq("owner_user_id", ownerUuid);
      } else if (orderId) {
        await service.from("customer_purchases").update({ delivery_status: "Cancelled" }).eq("pd_order_id", orderId).eq("owner_user_id", ownerUuid);
      }
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
