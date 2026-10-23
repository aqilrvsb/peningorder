// deno-lint-ignore-file no-explicit-any
// courier-webhook — tracking updates from a Bring Your Courier tenant's OWN courier account.
//
// URL (shown in Courier Settings → Kurier Sendiri):
//   /functions/v1/courier-webhook?c=<courier>&t=<own_courier_config.webhook_token>
// The token picks the tenant. Ninja Van calls are also verified with their HMAC header
// (X-Ninjavan-Hmac-Sha256 = base64(HMAC-SHA256(raw body, Client Secret))). Pos Laju doesn't sign,
// so its account_no must match the tenant's Account Number.
//
// Applies statuses exactly like parceldaily-webhook (the same per-status Track / Notify settings,
// keyed by the ParcelDaily status groups in src/lib/trackingStatuses.ts):
//   • only the final states change delivery_status: delivered → Success, returning → Return
//   • every other status only refreshes the raw label (seos); it never moves Pending → Shipped
//   • "Cancelled" is confirm-only (an edit re-book cancels the old parcel; the order must not vanish)
//   • events can arrive out of order, so a late scan never undoes Success / Return
// COD: Pos Laju's REMMIT ("Remittance Done By Rider") marks the COD collected (date_payment).
// Ninja Van sends no remittance event, so its COD collection stays manual.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const clean = (v: unknown) => String(v ?? "").trim();

// ---------------------------------------------------------------- WhatsApp (same as parceldaily-webhook)
const waPhone = (raw: string): string => {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0")) return "60" + digits.slice(1);
  return "60" + digits;
};

const WA_GATEWAY = "https://dev-muse-automaton-production.up.railway.app";
const waGatewaySend = (body: Record<string, string>) =>
  fetch(`${WA_GATEWAY}/api/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function resolveInstance(supabase: any, ownerUserId: string, marketerIdStaff: string | null | undefined): Promise<string> {
  if (marketerIdStaff) {
    const { data: rows } = await supabase.from("profiles").select("whacenter_instance, parent_user_id, id").eq("username", marketerIdStaff);
    const row = (rows || []).find((p: any) => p.parent_user_id === ownerUserId || p.id === ownerUserId) || (rows || [])[0];
    const own = (row?.whacenter_instance || "").trim();
    if (own) return own;
  }
  const { data: cfg } = await supabase.from("parceldaily_config").select("whacenter_instance").eq("owner_user_id", ownerUserId).maybeSingle();
  return (cfg?.whacenter_instance || "").trim();
}

type WaResult = { code: string; success: boolean; messageId?: string; error?: string };

async function sendWhatsApp(
  supabase: any, m: any, message: string, imageUrl: string | null, statusKey: string,
): Promise<string> {
  let r: WaResult;
  try {
    const instance = m.phone_customer ? await resolveInstance(supabase, m.owner_user_id, m.marketer_id_staff) : "";
    const number = waPhone(m.phone_customer || "");
    if (!m.phone_customer) r = { code: "wa_skipped_no_target", success: false, error: "Tiada nombor telefon" };
    else if (!instance) r = { code: "wa_skipped_no_device", success: false, error: "Tiada device WhatsApp (instance kosong)" };
    else if (!number) r = { code: "wa_skipped_bad_phone", success: false, error: "Nombor telefon tidak sah" };
    else {
      const res = await waGatewaySend({ device_id: instance, number, message: message || "", ...(imageUrl ? { file: imageUrl } : {}) });
      const txt = await res.text();
      try {
        const j = JSON.parse(txt);
        r = j.status
          ? { code: "wa_sent", success: true, messageId: j.data?.id ? String(j.data.id) : undefined }
          : { code: `wa_failed_${j.message || res.status}`, success: false, error: String(j.message || res.status) };
      } catch {
        r = res.ok ? { code: "wa_sent", success: true } : { code: `wa_failed_${res.status}`, success: false, error: `HTTP ${res.status}` };
      }
    }
  } catch (_e) {
    r = { code: "wa_error", success: false, error: "Ralat sistem" };
  }
  try {
    await supabase.from("wa_notify_log").insert({
      owner_user_id: m.owner_user_id, order_id: m.id, status_key: statusKey,
      success: r.success, message_id: r.messageId || null, error: r.error || null, source: "auto",
    });
  } catch (_e) { /* logging must never break the webhook */ }
  return r.code;
}

async function getTrackPref(supabase: any, ownerUserId: string, statusKey: string) {
  const fallback = { track: true, notify: /deliver/i.test(statusKey), template: null as string | null, image: null as string | null };
  try {
    const { data } = await supabase.from("tracking_status_setting")
      .select("track, notify, message_template, message_image_url")
      .eq("owner_user_id", ownerUserId).eq("status_key", statusKey).maybeSingle();
    if (!data) return fallback;
    return { track: data.track !== false, notify: !!data.notify, template: data.message_template || null, image: data.message_image_url || null };
  } catch (_e) {
    return fallback;
  }
}

const renderTemplate = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{(\w+)\}/g, (_m, k) => (k in vars ? vars[k] : `{${k}}`));

const orderVars = (m: any, statusLabel: string): Record<string, string> => ({
  name: m.name_customer || "",
  phone: m.phone_customer || "",
  tracking: m.tracking_number || "",
  status: statusLabel || "",
  courier: (m.kurier || "").replace(/\s+(COD|CASH)$/i, ""),
  order_id: m.id_sale || "",
  product: m.bundle?.name || m.nota_staff || "",
  address: [m.address_customer, m.city_customer, m.postcode_customer, m.state_customer].filter(Boolean).join(", "),
  price: Number(m.total_sale || 0).toFixed(2),
});

// ---------------------------------------------------------------- Ninja Van
async function hmacBase64(secret: string, body: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  let bin = "";
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin);
}
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * Ninja Van status → the ParcelDaily status group used by tracking_status_setting.
 * Real values (DFR production log): Pending Pickup, Picked Up, Arrived at Origin Hub,
 * In Transit to Next Sorting Hub, Arrived at Transit Hub, Arrived at Destination Hub,
 * On Vehicle for Delivery, Delivered, Delivery Exception, Returned to Sender, Cancelled.
 * is_parcel_on_rts_leg = the parcel is heading back to the seller, so every event on that
 * leg is a return ("Delivered" there means delivered back to the seller).
 */
function ninjavanGroup(status: string, rts: boolean): string {
  const s = status.toLowerCase().trim();
  if (s === "cancelled") return "Cancelled";
  if (s === "returned to sender") return "Returned";
  if (rts) return s === "delivered" ? "Returned" : "Return in transit";
  if (s === "delivered") return "Delivered";
  if (s === "pending pickup") return "Shipment Data Received";
  if (/driver dispatched|en-route to pickup|pickup exception/.test(s)) return "Waiting Pickup";
  if (s.startsWith("picked up")) return "Picked up";
  if (s === "on vehicle for delivery") return "On Delivery";
  if (s === "at pudo") return "Self Collect";
  if (/exception/.test(s)) return "Problematic Processing";
  if (/hub|transit/.test(s)) return "In transit";
  return "Processing";
}

// ---------------------------------------------------------------- Pos Laju
/** Pos Laju event_code (Webhook Event List, api-doc.pos.com.my) → ParcelDaily status group. */
function poslajuGroup(code: string): string {
  if (code === "O_CAN") return "Cancelled";
  if (code === "O_CRE") return "Shipment Data Received";
  if (code === "LM_SUCCESS" || code === "WD_SUCCESS") return "Delivered";
  if (code === "RTO_SUCCESS" || code === "RTS_WD_SUCCESS") return "Returned";
  if (code.startsWith("RTO_")) return "Return in transit"; // RTO_INI / ASSIGN / OFR / FAIL
  if (code === "P_SUCCESS" || code.startsWith("DRP_OFF")) return "Picked up";
  if (code.startsWith("P_") || code === "PICKUP_CANCELLED") return "Waiting Pickup";
  if (["LM_ASSIGN", "LM_OFD", "WD_ASSIGNED", "WD_REATTEMPT"].includes(code)) return "On Delivery";
  if (code.startsWith("LM_FAIL") || code.endsWith("_EXC") || code === "SSE") return "Problematic Processing";
  return "In transit"; // hub / linehaul / inbound / international scans
}

// ---------------------------------------------------------------- Handler
const ORDER_COLS =
  "id, tracking_number, delivery_status, kurier, name_customer, phone_customer, marketer_id_staff, id_sale, pd_order_id, owner_user_id, address_customer, city_customer, postcode_customer, state_customer, total_sale, nota_staff, date_return, type_payment, date_payment, bundle:logistic_bundles(name)";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const url = new URL(req.url);
  const courier = (url.searchParams.get("c") || "").toLowerCase();
  const token = url.searchParams.get("t") || "";

  const raw = new Uint8Array(await req.arrayBuffer());
  const bodyText = new TextDecoder().decode(raw);
  let payload: any = null;
  try { payload = bodyText.trim() ? JSON.parse(bodyText) : null; } catch { payload = { raw: bodyText.slice(0, 2000) }; }

  const headersObj: Record<string, string> = {};
  req.headers.forEach((v, k) => (headersObj[k] = v));
  const log: Record<string, unknown> = {
    webhook_type: `own_${courier || "unknown"}`,
    request_method: req.method,
    request_body: payload,
    request_headers: headersObj,
    ip_address: req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "",
  };
  const finish = async (status: number, body: Record<string, unknown>, extra?: Record<string, unknown>) => {
    Object.assign(log, extra || {}, { response_status: status, response_body: body, processing_time_ms: Date.now() - startedAt });
    try { await supabase.from("webhook_logs").insert(log); } catch (_e) { /* ignore */ }
    return reply(status, body);
  };

  try {
    // Endpoint check / ping with no body.
    if (!payload) return reply(200, { ok: true, message: "Webhook endpoint is active" });

    if (!/^[0-9a-f]{32}$/i.test(token)) return await finish(401, { error: "unauthorized" }, { error_message: "missing or bad token" });
    const { data: cfg } = await supabase.from("own_courier_config")
      .select("owner_user_id, courier, client_secret, account_number").eq("courier", courier).eq("webhook_token", token).maybeSingle();
    if (!cfg) return await finish(401, { error: "unauthorized" }, { error_message: "unknown token" });
    const ownerId: string = cfg.owner_user_id;

    // Normalise each courier's event to: tracking, status group, display text.
    let tracking = "", group = "", detail = "", status = "", remit = false;
    if (courier === "ninjavan") {
      // Ninja Van signs every call with the tenant's Client Secret.
      const given = req.headers.get("x-ninjavan-hmac-sha256") || "";
      const expected = cfg.client_secret ? await hmacBase64(String(cfg.client_secret).trim(), raw) : "";
      if (!given || !expected || !safeEqual(given.trim(), expected)) {
        return await finish(401, { error: "invalid signature" }, { error_message: "bad X-Ninjavan-Hmac-Sha256", parsed_data: { owner: ownerId } });
      }
      tracking = String(payload.tracking_id || payload.tracking_number || "").trim();
      status = String(payload.status || "").trim();
      detail = String(payload.event || payload.status || "").trim(); // e.g. "Delivered, Received by Customer"
      const rts = payload.is_parcel_on_rts_leg === true || String(payload.is_parcel_on_rts_leg) === "true";
      // Re-weigh notices aren't delivery progress (BYOC postage comes from the bundle).
      if (/measurement/i.test(status)) {
        return await finish(200, { ok: true, action: "measurement_ignored" }, { parsed_data: { owner: ownerId, tracking, status } });
      }
      group = status ? ninjavanGroup(status, rts) : "";
    } else if (courier === "poslaju") {
      // Pos doesn't sign calls: the secret URL token picks the tenant, and the account must be theirs.
      const acct = String(payload.account_no || "").trim();
      if (acct && clean(cfg.account_number) && acct !== clean(cfg.account_number)) {
        return await finish(401, { error: "unauthorized" }, { error_message: "account_no mismatch", parsed_data: { owner: ownerId } });
      }
      tracking = String(payload.tracking_number || "").trim();
      status = String(payload.event_code || "").trim().toUpperCase();
      detail = [payload.event_name, payload.reason_description].map((v) => String(v || "").trim()).filter(Boolean).join(" - ");
      remit = status === "REMMIT"; // "Remittance Done By Rider" = COD collected
      group = status ? (remit ? "COD Remitted" : poslajuGroup(status)) : "";
    } else {
      return await finish(200, { ok: true, action: "courier_not_supported_yet" }, { parsed_data: { owner: ownerId } });
    }
    if (!tracking || !group) return await finish(200, { ok: true, action: "no_tracking_or_status" }, { parsed_data: { owner: ownerId } });

    const findRow = async () => {
      const a = await supabase.from("customer_purchases").select(ORDER_COLS)
        .eq("owner_user_id", ownerId).eq("tracking_number", tracking).order("created_at", { ascending: false }).limit(1);
      if (a.data?.length) return a.data[0];
      const b = await supabase.from("customer_purchases").select(ORDER_COLS)
        .eq("owner_user_id", ownerId).eq("pd_order_id", `own:${courier}:${tracking}`).order("created_at", { ascending: false }).limit(1);
      return b.data?.[0] || null;
    };
    let m: any = await findRow();
    // Ninja Van's "Pending Pickup" can land a moment before the key-in has saved the order row.
    // Only that first event waits (the account may also ship from other apps, e.g. Bizapp, whose
    // events never match here). Pos wants an answer within 5 seconds, so no wait there.
    if (!m && courier === "ninjavan" && /^pending pickup$/i.test(status)) {
      await new Promise((r) => setTimeout(r, 5000));
      m = await findRow();
    }
    const parsed = { owner: ownerId, tracking, status, detail, group, matched_id: m?.id || null };
    if (!m) return await finish(200, { ok: true, action: "order_not_found" }, { parsed_data: parsed });

    const mYmd = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

    // Pos Laju COD remittance: the rider has handed the COD cash to Pos → mark it collected.
    if (remit) {
      let action = "remit_ignored";
      if (String(m.type_payment || "").toUpperCase() === "COD" && !m.date_payment) {
        const at = String(payload.date_time || "").slice(0, 10);
        await supabase.from("customer_purchases")
          .update({ date_payment: /^\d{4}-\d{2}-\d{2}$/.test(at) ? at : mYmd }).eq("id", m.id);
        action = "cod_remitted";
      }
      await supabase.from("customer_purchases").update({ last_webhook_at: new Date().toISOString() }).eq("id", m.id);
      return await finish(200, { ok: true, action }, { parsed_data: { ...parsed, action } });
    }

    let action = "none";
    const isCancel = group === "Cancelled";
    const isDelivered = group === "Delivered";
    const isReturn = group === "Returned" || group === "Return in transit";
    // Events can arrive out of order (Pos says so): a late scan must not undo Success / Return.
    const stale = (m.delivery_status === "Success" && !isDelivered && !isReturn) ||
      (m.delivery_status === "Return" && !isReturn && !isDelivered);
    if (stale && !isCancel) {
      await supabase.from("customer_purchases").update({ last_webhook_at: new Date().toISOString() }).eq("id", m.id);
      return await finish(200, { ok: true, action: "stale_event_skip" }, { parsed_data: { ...parsed, action: "stale_event_skip" } });
    }
    const pref = await getTrackPref(supabase, ownerId, group);

    if (isCancel) {
      // Confirm-only: a cancel we made (Cancel / delete) already set Cancelled. An active order
      // is left alone — it may be an edit that cancelled its old parcel to re-book.
      if (m.delivery_status === "Cancelled") {
        await supabase.from("customer_purchases").update({ seos: "Cancelled" }).eq("id", m.id);
        action = "cancel_confirmed";
      } else {
        action = "cancel_ignored_active";
      }
    } else if (pref.track) {
      if (isDelivered || isReturn) {
        await supabase.from("customer_purchases").update({
          delivery_status: isDelivered ? "Success" : "Return",
          seos: detail,
          seo: isDelivered ? "Successful Delivery" : null,
          ...(isReturn && !m.date_return ? { date_return: mYmd } : {}),
          ...(m.delivery_status === "Pending" ? { date_processed: mYmd } : {}),
        }).eq("id", m.id);
      } else {
        await supabase.from("customer_purchases").update({ seos: detail }).eq("id", m.id);
      }
      action = "status_updated";
    } else {
      action = "status_untracked_skip";
    }

    // Customer WhatsApp — only for statuses the client turned Notify on for.
    const notifyCancel = isCancel && m.delivery_status === "Cancelled";
    if (pref.notify && (!isCancel || notifyCancel)) {
      const vars = orderVars(m, group);
      // Several Ninja Van events share one group (four hub scans = "In transit"): message once
      // per group in a row, and the delivered thank-you only on the change into Success.
      const { data: last } = await supabase.from("wa_notify_log").select("status_key")
        .eq("order_id", m.id).eq("success", true).order("created_at", { ascending: false }).limit(1);
      const repeat = last?.[0]?.status_key === group || (isDelivered && m.delivery_status === "Success");
      if (!repeat) {
        const fallbackText =
          isDelivered ? `Salam ${vars.name}! ✅\n\nPesanan anda (Tracking: ${vars.tracking}) telah BERJAYA dihantar.\n\nTerima kasih kerana membeli dengan kami! 🙏`
          : group === "Shipment Data Received" ? `Salam ${vars.name}! 📦\n\nPesanan anda telah dihantar ke ${vars.courier || "kurier"}.\n\nNo Tracking: ${vars.tracking}\n\nTerima kasih kerana membeli dengan kami! 🙏`
          : isCancel ? `Salam ${vars.name}!\n\nPesanan anda (Tracking: ${vars.tracking}) telah DIBATALKAN.\n\nHubungi kami jika ada sebarang pertanyaan.`
          : `Salam ${vars.name}! 📦\n\nStatus penghantaran pesanan anda (Tracking: ${vars.tracking}):\n*${vars.status}*\n\nTerima kasih!`;
        const waMsg = pref.template ? renderTemplate(pref.template, vars) : (pref.image ? "" : fallbackText);
        if (waMsg || pref.image) {
          action = `${action}+${await sendWhatsApp(supabase, m, waMsg, pref.image, group)}`;
        }
      }
    }

    // A webhook reached this order today, so the nightly reconcile can skip it.
    await supabase.from("customer_purchases").update({ last_webhook_at: new Date().toISOString() }).eq("id", m.id);
    return await finish(200, { ok: true, action }, { parsed_data: { ...parsed, action } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("courier-webhook error:", err);
    // 200 so the courier doesn't retry-storm on our bug; the log keeps the error.
    return await finish(200, { error: msg }, { error_message: msg });
  }
});
