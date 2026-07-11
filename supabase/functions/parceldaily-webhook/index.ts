// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parcel Daily webhook events (union of Tracking Webhook + Checkout Webhook):
//   STATUS_UPDATED       — tracking status changed (all couriers)
//   WEIGHT_UPDATED       — weight adjusted
//   COD_REMITTED         — COD payout
//   CONNOTE_LINK         — bulk waybill PDF ready
//   CANCEL_STATUS_UPDATED — cancellation
//   (Checkout) data payload after successful pay: connoteURL + orderId + tracking (data.consign_no)

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const requestBodyText = await req.text();
  let payload: any;
  try {
    payload = JSON.parse(requestBodyText);
  } catch {
    payload = { raw: requestBodyText };
  }

  const clientIp = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "";
  const headersObj: Record<string, string> = {};
  req.headers.forEach((v, k) => (headersObj[k] = v));

  // Always log the webhook first so we can debug in production
  const logEntry: Record<string, unknown> = {
    webhook_type: "parceldaily",
    request_method: req.method,
    request_body: payload,
    request_headers: headersObj,
    ip_address: clientIp,
  };

  const event = String(payload?.event || "").toUpperCase();
  const consignNo = payload?.consign_no || payload?.data?.consign_no || null;
  const orderId = payload?.orderId || payload?.data?.orderId || null;

  try {
    // 1) Try to locate the customer_purchases row this webhook is about
    //    We stamp orderId at create-time and tracking_number after CHECKOUT/STATUS webhooks.
    let matched: any = null;
    if (consignNo) {
      const r = await supabase
        .from("customer_purchases")
        .select("id, tracking_number, delivery_status, kurier, name_customer, phone_customer, marketer_id_staff, id_sale")
        .eq("tracking_number", consignNo)
        .maybeSingle();
      matched = r.data;
    }
    if (!matched && orderId) {
      const r = await supabase
        .from("customer_purchases")
        .select("id, tracking_number, delivery_status, kurier, name_customer, phone_customer, marketer_id_staff, id_sale")
        .eq("id_sale", orderId)
        .maybeSingle();
      matched = r.data;
    }
    // Frontend also stores the Parcel Daily orderId in tracking_number
    // (as a placeholder until this webhook replaces it with the real consign_no).
    if (!matched && orderId) {
      const r = await supabase
        .from("customer_purchases")
        .select("id, tracking_number, delivery_status, kurier, name_customer, phone_customer, marketer_id_staff, id_sale")
        .eq("tracking_number", orderId)
        .maybeSingle();
      matched = r.data;
    }

    // 2) Dispatch by event
    let action = "none";
    if (event === "CHECKOUT_STATUS" || event === "CHECKOUT" || payload?.data?.connoteURL) {
      // Checkout completed → save tracking + waybill URL
      const d = payload.data || payload;
      const trackingNumber = d.consign_no || d.trackingNumber || consignNo;
      const connoteURL = d.connoteURL || d.thermalConnoteURL;
      if (matched && trackingNumber) {
        await supabase
          .from("customer_purchases")
          .update({
            tracking_number: trackingNumber,
            waybill_url: connoteURL || null,
            delivery_status: "Shipped",
          })
          .eq("id", matched.id);
        action = "checkout_updated";
      } else if (trackingNumber && orderId) {
        // Order row exists but we didn't find it — try id_sale match again with orderId
        await supabase
          .from("customer_purchases")
          .update({
            tracking_number: trackingNumber,
            waybill_url: connoteURL || null,
            delivery_status: "Shipped",
          })
          .eq("id_sale", orderId);
        action = "checkout_updated_by_orderid";
      }
    } else if (event === "STATUS_UPDATED") {
      // Tracking status changed
      if (matched) {
        const status = payload.status || payload.statusGroup || "";
        const isDelivered =
          /delivered|success/i.test(status) || /Delivered/i.test(payload.statusGroup || "");
        const isReturn = /return/i.test(status);
        await supabase
          .from("customer_purchases")
          .update({
            delivery_status: isDelivered ? "Success" : isReturn ? "Return" : "Shipped",
            seos: status,
            seo: isDelivered ? "Successful Delivery" : null,
          })
          .eq("id", matched.id);
        action = "status_updated";
      }
    } else if (event === "COD_REMITTED") {
      if (matched) {
        await supabase
          .from("customer_purchases")
          .update({
            date_payment: (payload.remittedAt || new Date().toISOString()).slice(0, 10),
          })
          .eq("id", matched.id);
        action = "cod_remitted";
      }
    } else if (event === "CANCEL_STATUS_UPDATED") {
      if (matched) {
        await supabase
          .from("customer_purchases")
          .update({ delivery_status: "Cancelled" })
          .eq("id", matched.id);
        action = "cancelled";
      }
    } else if (event === "CONNOTE_LINK") {
      // Bulk export URL — return in log only; frontend triggers this by orderIds so it can poll
      action = "connote_link";
    } else if (event === "WEIGHT_UPDATED") {
      action = "weight_updated";
    }

    logEntry.parsed_data = { event, consignNo, orderId, action, matched_id: matched?.id };
    logEntry.response_status = 200;
    logEntry.processing_time_ms = Date.now() - startedAt;
    await supabase.from("webhook_logs").insert(logEntry);

    return new Response(JSON.stringify({ ok: true, action }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    console.error("parceldaily-webhook error:", err);
    logEntry.error_message = errorMessage;
    logEntry.response_status = 500;
    logEntry.processing_time_ms = Date.now() - startedAt;
    await supabase.from("webhook_logs").insert(logEntry);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 200, // return 200 anyway so Parcel Daily doesn't spam-retry on our bug
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
