// notify-send — manual (re)send of ONE customer WhatsApp notification from the
// Notification tab. Uses the same template / image / device as the automatic
// send (parceldaily-webhook, order-notify) and logs the result to wa_notify_log.
//
// POST { order_id: uuid, status_key: string }   (caller's JWT)
// The order is read with the CALLER's RLS, so staff can only resend their own.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// PeningBot Baileys gateway: JSON body; HTTP is always 200, success is `status`.
const WA_SEND = "https://dev-muse-automaton-production.up.railway.app/api/send";
const KEYIN_KEY = "Order Keyed In";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const waPhone = (raw: string): string => {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("60")) return d;
  if (d.startsWith("0")) return "60" + d.slice(1);
  return "60" + d;
};

const renderTemplate = (tpl: string, vars: Record<string, string>): string =>
  tpl.replace(/\{(\w+)\}/g, (_m, k) => (k in vars ? vars[k] : `{${k}}`));

// Same variables as parceldaily-webhook's orderVars.
// deno-lint-ignore no-explicit-any
function orderVars(m: any, statusLabel: string): Record<string, string> {
  return {
    name: m.name_customer || "",
    phone: m.phone_customer || "",
    tracking: m.tracking_number || "",
    status: statusLabel || "",
    courier: (m.kurier || "").replace(/\s+(COD|CASH)$/i, ""),
    order_id: m.id_sale || "",
    product: m.bundle?.name || m.nota_staff || "",
    address: [m.address_customer, m.city_customer, m.postcode_customer, m.state_customer].filter(Boolean).join(", "),
    price: Number(m.total_sale || 0).toFixed(2),
  };
}

// Defaults kept in sync with parceldaily-webhook / order-notify.
function defaultMessage(statusKey: string, v: Record<string, string>): string {
  if (statusKey === KEYIN_KEY)
    return `Salam ${v.name}! 😊\n\nKami telah menerima tempahan anda.\n\nOrder ID : ${v.order_id}\nProduk : ${v.product}\nHarga : RM${v.price}\n\nTerima kasih! Kami akan proses pesanan anda secepat mungkin. 🙏`;
  if (statusKey === "Shipment Data Received")
    return `Salam ${v.name}! 📦\n\nPesanan anda telah dihantar ke ${v.courier || "kurier"}.\n\nNo Tracking: ${v.tracking}\n\nTerima kasih kerana membeli dengan kami! 🙏`;
  if (/deliver/i.test(statusKey))
    return `Salam ${v.name}! ✅\n\nPesanan anda (Tracking: ${v.tracking}) telah BERJAYA dihantar.\n\nTerima kasih kerana membeli dengan kami! 🙏`;
  if (/cancel/i.test(statusKey))
    return `Salam ${v.name}!\n\nPesanan anda (Tracking: ${v.tracking}) telah DIBATALKAN.\n\nHubungi kami jika ada sebarang pertanyaan.`;
  return `Salam ${v.name}! 📦\n\nStatus penghantaran pesanan anda (Tracking: ${v.tracking}):\n*${v.status}*\n\nTerima kasih!`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const authed = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json(401, { success: false, error: "not_authenticated" });

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.order_id || "");
    const statusKey = String(body?.status_key || "").trim();
    if (!orderId || !statusKey) return json(400, { success: false, error: "order_id dan status_key diperlukan" });

    // Read through the caller's RLS — staff can only touch their own orders.
    const { data: order } = await authed
      .from("customer_purchases")
      .select("id, owner_user_id, marketer_id_staff, name_customer, phone_customer, tracking_number, kurier, id_sale, total_sale, nota_staff, address_customer, city_customer, postcode_customer, state_customer, bundle:logistic_bundles(name)")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return json(404, { success: false, error: "Order tidak dijumpai" });

    const admin = createClient(SUPABASE_URL, SERVICE);
    const owner = order.owner_user_id as string;
    const log = async (success: boolean, messageId: string | null, error: string | null) => {
      await admin.from("wa_notify_log").insert({
        owner_user_id: owner, order_id: order.id, status_key: statusKey,
        success, message_id: messageId, error, source: "manual", sent_by: user.id,
      });
    };

    const { data: pref } = await admin
      .from("tracking_status_setting")
      .select("message_template, message_image_url")
      .eq("owner_user_id", owner).eq("status_key", statusKey).maybeSingle();

    const number = waPhone(String(order.phone_customer || ""));
    if (!number) { await log(false, null, "Nombor telefon tidak sah"); return json(200, { success: false, error: "Nombor telefon tidak sah" }); }

    // The order's marketer's own device if set, else the HQ device.
    let instance = "";
    // ID staff goes into a PostgREST or() filter — only plain ids (PO-AR782-3).
    if (order.marketer_id_staff && /^[\w-]+$/.test(String(order.marketer_id_staff))) {
      const { data: rows } = await admin
        .from("profiles").select("whacenter_instance, parent_user_id, id")
        .or(`username.eq.${order.marketer_id_staff},idstaff.eq.${order.marketer_id_staff}`);
      // deno-lint-ignore no-explicit-any
      const row = (rows || []).find((p: any) => p.parent_user_id === owner || p.id === owner);
      instance = (row?.whacenter_instance || "").trim();
    }
    if (!instance) {
      const { data: cfg } = await admin
        .from("parceldaily_config").select("whacenter_instance").eq("owner_user_id", owner).maybeSingle();
      instance = (cfg?.whacenter_instance || "").trim();
    }
    if (!instance) {
      await log(false, null, "Tiada device WhatsApp (instance kosong)");
      return json(200, { success: false, error: "Tiada device WhatsApp — isi PeningBot Instance di Courier Settings" });
    }

    const vars = orderVars(order, statusKey);
    const image = (pref?.message_image_url || "").trim();
    // An image with no template = image-only, same as the automatic send.
    const message = pref?.message_template
      ? renderTemplate(pref.message_template, vars)
      : (image ? "" : defaultMessage(statusKey, vars));

    const res = await fetch(WA_SEND, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: instance, number, message, ...(image ? { file: image } : {}) }),
    });
    const txt = await res.text();
    let success = res.ok;
    let messageId: string | null = null;
    let error: string | null = res.ok ? null : `HTTP ${res.status}`;
    try {
      const j = JSON.parse(txt);
      success = !!j.status;
      messageId = j.data?.id ? String(j.data.id) : null;
      error = success ? null : String(j.message || "Gagal hantar");
    } catch { /* non-JSON body: keep HTTP result */ }
    await log(success, messageId, error);
    return json(200, { success, message_id: messageId, error });
  } catch (e) {
    return json(500, { success: false, error: String((e as Error).message || e) });
  }
});
