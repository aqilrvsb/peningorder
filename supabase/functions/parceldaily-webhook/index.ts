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
    // Client devices are Baileys on the Railway gateway — send from the client's
    // own connected WhatsApp via the partner gateway (not Whacenter).
    const { data: device } = await supabase
      .from("device_setting")
      .select("instance, status_wa")
      .eq("owner_user_id", ownerUserId)
      .eq("provider", "baileys")
      .maybeSingle();
    if (!device?.instance) return "wa_skipped_no_device";

    const { data: secretRow } = await supabase
      .from("platform_secrets").select("value").eq("key", "baileys_gateway").maybeSingle();
    const cfg = (secretRow?.value ?? {}) as { url?: string; api_key?: string };
    if (!cfg.url || !cfg.api_key) return "wa_skipped_no_gateway";

    const number = waPhone(customerPhone);
    if (!number) return "wa_skipped_bad_phone";

    const form = new URLSearchParams();
    form.append("api_key", cfg.api_key);
    form.append("device_id", device.instance);
    form.append("number", number);
    form.append("message", message);
    const res = await fetch(`${cfg.url.replace(/\/$/, "")}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const txt = await res.text();
    console.log(`[whatsapp] gateway send status=${res.status} body=${txt.slice(0, 200)}`);
    try { const j = JSON.parse(txt); return j.status ? "wa_sent" : `wa_failed_${j.message || res.status}`; }
    catch { return res.ok ? "wa_sent" : `wa_failed_${res.status}`; }
  } catch (err) {
    console.error("[whatsapp] send error:", err);
    return "wa_error";
  }
}

// Per-status Track/Notify, configured by the client in Courier Settings →
// Tracking Webhook (tracking_status_setting). TRACK = apply the status to the
// order; NOTIFY = WhatsApp the customer. Default when a status is unconfigured:
// Track ON, Notify ON only for "Delivered" (no-spam default; clients opt into
// notifying more statuses). Seller COD-remit / weight alerts are separate.
async function getTrackPref(
  supabase: any,
  ownerUserId: string | null | undefined,
  statusGroup: string,
): Promise<{ track: boolean; notify: boolean; template: string | null }> {
  const fallback = { track: true, notify: /deliver/i.test(statusGroup || ""), template: null };
  try {
    if (!ownerUserId || !statusGroup) return fallback;
    const { data } = await supabase
      .from("tracking_status_setting")
      .select("track, notify, message_template")
      .eq("owner_user_id", ownerUserId)
      .eq("status_key", statusGroup)
      .maybeSingle();
    if (!data) return fallback;
    return { track: data.track !== false, notify: !!data.notify, template: data.message_template || null };
  } catch (_e) {
    return fallback;
  }
}

// Fill {placeholders} in a client template with the order's values.
function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k) => (k in vars ? vars[k] : `{${k}}`));
}

// The seller's own WhatsApp number (for COD-remit / weight-update alerts to them).
async function clientPhone(supabase: any, ownerUserId: string | null | undefined): Promise<string> {
  if (!ownerUserId) return "";
  const { data } = await supabase.from("profiles").select("whatsapp, whatsapp_number").eq("id", ownerUserId).maybeSingle();
  return String(data?.whatsapp || data?.whatsapp_number || "").trim();
}

// Send a message to the CLIENT (seller) from the platform's ADMIN device
// (Whacenter admin_device). Used for seller-facing alerts, never the customer.
async function notifyClient(supabase: any, ownerUserId: string | null | undefined, message: string): Promise<string> {
  try {
    const to = await clientPhone(supabase, ownerUserId);
    const number = waPhone(to);
    if (!number) return "wa_skipped_no_client_phone";
    const { data: device } = await supabase
      .from("admin_device").select("instance, api_key").eq("active", true).limit(1).maybeSingle();
    if (!device?.instance) return "wa_skipped_no_admin_device";
    const form = new URLSearchParams();
    if (device.api_key) form.append("api_key", device.api_key);
    form.append("device_id", device.instance);
    form.append("number", number);
    form.append("message", message);
    const res = await fetch("https://api.whacenter.com/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const txt = await res.text();
    try { const j = JSON.parse(txt); return j.status ? "client_notified" : `client_notify_failed_${j.message || res.status}`; }
    catch { return res.ok ? "client_notified" : `client_notify_failed_${res.status}`; }
  } catch (_e) {
    return "client_notify_error";
  }
}

// Fetch the order's CURRENT postage price from ParcelDaily (the weight webhook
// carries no cost, so after a re-weigh we re-read the live price to keep
// cost_postage accurate). Returns null if unavailable.
async function fetchPdPostage(
  supabase: any,
  ownerUserId: string | null | undefined,
  consignNo: string | null | undefined,
): Promise<number | null> {
  try {
    if (!ownerUserId || !consignNo) return null;
    const { data: cfg } = await supabase
      .from("parceldaily_config").select("token, merchant_id").eq("owner_user_id", ownerUserId).maybeSingle();
    if (!cfg?.token || !cfg?.merchant_id) return null;
    const res = await fetch("https://api.parceldaily.com/v1/partner/checkout-status", {
      method: "POST",
      headers: { "Content-Type": "application/json", token: cfg.token, merchantid: cfg.merchant_id },
      body: JSON.stringify({ consign_nos: [consignNo] }),
    });
    const j = await res.json().catch(() => null);
    const item = Array.isArray(j?.data) ? j.data[0] : null;
    const price = item?.price ?? item?.shippingPrice ?? item?.postage;
    return price != null && !Number.isNaN(Number(price)) ? Number(price) : null;
  } catch (_e) {
    return null;
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
      if (matched && trackingNumber) {
        // The webhook NEVER moves an order to Shipped — Pending -> Shipped is a
        // manual logistic action. Checkout only backfills tracking + waybill;
        // delivery_status stays Pending until logistic processes the order.
        await supabase
          .from("customer_purchases")
          .update({
            tracking_number: trackingNumber,
            waybill_url: connoteURL || null,
          })
          .eq("id", matched.id);
        action = "checkout_tracking_saved";

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
          })
          .eq("pd_order_id", orderId);
        action = "checkout_tracking_saved_by_orderid";
      }
    } else if (event === "STATUS_UPDATED") {
      // Tracking status changed — gated by the client's per-status Track/Notify.
      if (matched) {
        const rawStatus = payload.status || payload.statusGroup || "";
        const statusGroup = payload.statusGroup || rawStatus || "";
        const isDelivered =
          /delivered|success/i.test(rawStatus) || /Delivered/i.test(statusGroup);
        const isReturn = /return/i.test(rawStatus) || /return/i.test(statusGroup);
        const pref = await getTrackPref(supabase, matched.owner_user_id, statusGroup);

        if (pref.track) {
          // The webhook only changes delivery_status to the TWO FINAL states:
          // Success (delivered) or Return. Intermediate statuses (Picked Up, In
          // Transit, Processing, etc.) only update the raw status label (seos) for
          // display -- they must NOT flip the order to "Shipped" (Pending -> Shipped
          // stays a manual logistic action; that path stamps date_processed).
          const mYmd = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
          if (isDelivered || isReturn) {
            await supabase
              .from("customer_purchases")
              .update({
                delivery_status: isDelivered ? "Success" : "Return",
                seos: rawStatus,
                seo: isDelivered ? "Successful Delivery" : null,
                // If it was still Pending (never manually processed), stamp a
                // processed date so it's recorded as handled.
                ...(matched.delivery_status === "Pending" ? { date_processed: mYmd } : {}),
              })
              .eq("id", matched.id);
          } else {
            await supabase.from("customer_purchases").update({ seos: rawStatus }).eq("id", matched.id);
          }
          action = "status_updated";
        } else {
          action = "status_untracked_skip";
        }

        if (pref.notify) {
          const vars: Record<string, string> = {
            name: matched.name_customer || "",
            tracking: matched.tracking_number || consignNo || "",
            status: statusGroup || rawStatus || "",
            courier: (matched.kurier || "").replace(/\s+(COD|CASH)$/i, ""),
            order_id: matched.id_sale || "",
            phone: matched.phone_customer || "",
          };
          let waMsg: string | null = null;
          if (isDelivered) {
            // thank-you only on the transition into delivered, never on repeats
            if (matched.delivery_status !== "Success") {
              waMsg = pref.template
                ? renderTemplate(pref.template, vars)
                : `Salam ${vars.name}! ✅\n\nPesanan anda (Tracking: ${vars.tracking}) telah BERJAYA dihantar.\n\nTerima kasih kerana membeli dengan kami! 🙏`;
            }
          } else {
            waMsg = pref.template
              ? renderTemplate(pref.template, vars)
              : `Salam ${vars.name}! 📦\n\nStatus penghantaran pesanan anda (Tracking: ${vars.tracking}):\n*${vars.status}*\n\nTerima kasih!`;
          }
          if (waMsg) {
            const waResult = await sendWhatsApp(supabase, matched.owner_user_id, matched.phone_customer, waMsg);
            action = `${action}+${waResult}`;
          }
        }
      }
    } else if (event === "WEIGHT_UPDATED") {
      // Courier re-weighed the parcel — a MERCHANT cost concern (postage is
      // charged by weight). Always recorded; the SELLER is alerted on their own
      // WhatsApp via the admin device. The customer is never messaged.
      if (matched) {
        const newWeight = Number(payload.newWeight ?? payload.weight);
        const prevWeight = Number(payload.previousWeight);
        // Re-read the live postage price (the webhook itself carries no cost).
        const newPostage = await fetchPdPostage(supabase, matched.owner_user_id, matched.tracking_number || consignNo);
        const upd: Record<string, unknown> = {};
        if (!Number.isNaN(newWeight)) upd.weight_kg = newWeight;
        if (newPostage != null) upd.cost_postage = newPostage;
        if (Object.keys(upd).length) await supabase.from("customer_purchases").update(upd).eq("id", matched.id);
        action = newPostage != null ? "weight_updated+postage" : "weight_updated";
        const msg =
          `📦 *PeningOrder — Berat Parcel Dikemaskini*\n\n` +
          `Tracking: ${matched.tracking_number || consignNo}\n` +
          (Number.isNaN(prevWeight) ? "" : `Berat lama: ${prevWeight} kg\n`) +
          `Berat baru: ${Number.isNaN(newWeight) ? "-" : newWeight} kg\n` +
          (newPostage != null ? `Kos penghantaran dikemaskini: RM${newPostage.toFixed(2)}\n` : "") +
          `\nKos penghantaran mengikut berat sebenar.`;
        const r = await notifyClient(supabase, matched.owner_user_id, msg);
        action = `${action}+${r}`;
      }
    } else if (event === "COD_REMITTED") {
      // ParcelDaily has PAID the collected COD to the seller. Always recorded
      // (drives collection reports); the SELLER is alerted on their own WhatsApp
      // via the admin device. The customer is never messaged.
      if (matched) {
        await supabase
          .from("customer_purchases")
          .update({
            date_payment: (payload.remittedAt || new Date().toISOString()).slice(0, 10),
          })
          .eq("id", matched.id);
        action = "cod_remitted";
        const amt = payload.amount ? `RM${payload.amount}` : "";
        const msg =
          `💰 *PeningOrder — COD Diremit*\n\n` +
          `Bayaran COD${amt ? ` ${amt}` : ""} untuk order (Tracking: ${matched.tracking_number || consignNo}) telah diremit ke akaun anda.\n` +
          `Pelanggan: ${matched.name_customer || "-"}`;
        const r = await notifyClient(supabase, matched.owner_user_id, msg);
        action = `${action}+${r}`;
      }
    } else if (event === "CANCEL_STATUS_UPDATED") {
      if (matched) {
        const pref = await getTrackPref(supabase, matched.owner_user_id, "Cancelled");
        if (pref.track) {
          await supabase
            .from("customer_purchases")
            .update({ delivery_status: "Cancelled" })
            .eq("id", matched.id);
        }
        action = "cancelled";
        if (pref.notify) {
          const vars: Record<string, string> = {
            name: matched.name_customer || "",
            tracking: matched.tracking_number || consignNo || "",
            status: "Cancelled",
            courier: (matched.kurier || "").replace(/\s+(COD|CASH)$/i, ""),
            order_id: matched.id_sale || "",
            phone: matched.phone_customer || "",
          };
          const waMsg = pref.template
            ? renderTemplate(pref.template, vars)
            : `Salam ${vars.name}!\n\nPesanan anda (Tracking: ${vars.tracking}) telah DIBATALKAN.\n\nHubungi kami jika ada sebarang pertanyaan.`;
          const waResult = await sendWhatsApp(supabase, matched.owner_user_id, matched.phone_customer, waMsg);
          action = `${action}+${waResult}`;
        }
      }
    } else if (event === "CONNOTE_LINK") {
      // Bulk export URL — return in log only; frontend triggers this by orderIds so it can poll
      action = "connote_link";
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
