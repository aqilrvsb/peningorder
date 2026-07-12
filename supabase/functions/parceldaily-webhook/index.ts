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

// WhatsApp digits for Whacenter: "0139876543" -> "60139876543"
const waPhone = (raw: string): string => {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0")) return "60" + digits.slice(1);
  return "60" + digits;
};

// Fire-and-forget customer notification via the tenant's own Whacenter device.
// Never throws — a WhatsApp failure must not break webhook processing.
async function sendWhatsApp(
  supabase: any,
  ownerUserId: string | null | undefined,
  customerPhone: string | null | undefined,
  message: string,
): Promise<string> {
  try {
    if (!ownerUserId || !customerPhone) return "wa_skipped_no_target";
    const { data: device } = await supabase
      .from("device_setting")
      .select("instance, status_wa")
      .eq("user_id", ownerUserId)
      .maybeSingle();
    if (!device?.instance) return "wa_skipped_no_device";

    const number = waPhone(customerPhone);
    if (!number) return "wa_skipped_bad_phone";

    const url = `https://api.whacenter.com/api/send?device_id=${encodeURIComponent(device.instance)}&number=${encodeURIComponent(number)}&message=${encodeURIComponent(message)}`;
    const res = await fetch(url, { method: "GET" });
    const txt = await res.text();
    console.log(`[whatsapp] send status=${res.status} body=${txt.slice(0, 200)}`);
    return res.ok ? "wa_sent" : `wa_failed_${res.status}`;
  } catch (err) {
    console.error("[whatsapp] send error:", err);
    return "wa_error";
  }
}

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
    // 1) Try to locate the customer_purchases row this webhook is about.
    //    We stamp orderId at create-time and tracking_number after CHECKOUT/STATUS webhooks.
    const findRow = async (): Promise<any> => {
      const cols = "id, tracking_number, delivery_status, kurier, name_customer, phone_customer, marketer_id_staff, id_sale, pd_order_id, owner_user_id";
      if (consignNo) {
        const r = await supabase.from("customer_purchases").select(cols).eq("tracking_number", consignNo).maybeSingle();
        if (r.data) return r.data;
      }
      if (orderId) {
        const r = await supabase.from("customer_purchases").select(cols).eq("pd_order_id", orderId).maybeSingle();
        if (r.data) return r.data;
        // Frontend also stores the PD orderId in tracking_number as a placeholder
        const r2 = await supabase.from("customer_purchases").select(cols).eq("tracking_number", orderId).maybeSingle();
        if (r2.data) return r2.data;
      }
      return null;
    };

    let matched: any = await findRow();
    // RACE FIX: Parcel Daily's checkout webhook can arrive BEFORE the frontend
    // has inserted the customer_purchases row (webhook ~seconds after pay, insert
    // ~1-2s after the EF returns). Wait and retry the match once.
    if (!matched && (consignNo || orderId)) {
      await new Promise((resolve) => setTimeout(resolve, 8000));
      matched = await findRow();
    }

    // 2) Dispatch by event
    let action = "none";
    if (event === "CHECKOUT_STATUS" || event === "CHECKOUT" || payload?.data?.connoteURL) {
      // Checkout completed → save tracking + waybill URL
      const d = payload.data || payload;
      const trackingNumber = d.consign_no || d.trackingNumber || consignNo;
      const connoteURL = d.connoteURL || d.thermalConnoteURL;
      // Malaysia date (UTC+8) — date_processed drives the Processed tab
      const malaysiaDate = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (matched && trackingNumber) {
        await supabase
          .from("customer_purchases")
          .update({
            tracking_number: trackingNumber,
            waybill_url: connoteURL || null,
            delivery_status: "Shipped",
            date_processed: malaysiaDate,
          })
          .eq("id", matched.id);
        action = "checkout_updated";

        // Notify customer via the tenant's WhatsApp device
        const courierName = (matched.kurier || "").replace(/\s+(COD|CASH)$/i, "") || "kurier";
        const waMsg =
          `Salam ${matched.name_customer || ""}! 📦\n\n` +
          `Pesanan anda telah dihantar ke ${courierName}.\n\n` +
          `No Tracking: ${trackingNumber}\n\n` +
          `Terima kasih kerana membeli dengan kami! 🙏`;
        const waResult = await sendWhatsApp(supabase, matched.owner_user_id, matched.phone_customer, waMsg);
        action = `${action}+${waResult}`;
      } else if (trackingNumber && orderId) {
        // Order row exists but we didn't find it — try id_sale match again with orderId
        await supabase
          .from("customer_purchases")
          .update({
            tracking_number: trackingNumber,
            waybill_url: connoteURL || null,
            delivery_status: "Shipped",
            date_processed: malaysiaDate,
          })
          .eq("pd_order_id", orderId);
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

        // Delivered → thank-you WhatsApp (only on the transition, not repeats)
        if (isDelivered && matched.delivery_status !== "Success") {
          const waMsg =
            `Salam ${matched.name_customer || ""}! ✅\n\n` +
            `Pesanan anda (Tracking: ${matched.tracking_number || consignNo}) telah BERJAYA dihantar.\n\n` +
            `Terima kasih kerana membeli dengan kami! 🙏`;
          const waResult = await sendWhatsApp(supabase, matched.owner_user_id, matched.phone_customer, waMsg);
          action = `${action}+${waResult}`;
        }
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
