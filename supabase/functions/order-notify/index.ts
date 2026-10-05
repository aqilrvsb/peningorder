// order-notify — WhatsApp the customer when a new order is keyed in, IF the
// client enabled "Order Keyed In" notify in Courier Settings → Tracking Webhook.
//
// Called by the AFTER INSERT trigger on customer_purchases (queue_keyin_notify,
// via pg_net) for EVERY order source — order form, website/WooCommerce,
// integration map, channel webhook, Logistic Add Customer. Bulk Import, Pospada
// bookings and TikTok/Shopee marketplace orders are skipped by the trigger.
//
// POST { order_uuid }  with header x-internal-key = platform_secrets.internal_notify.secret
//
// The order form used to call this directly with the user's JWT; that path is
// now a no-op (the trigger already handles the order) so nothing sends twice.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEYIN_KEY = "Order Keyed In";
// PeningBot Baileys gateway: JSON body; HTTP is always 200, success is `status`.
const WA_SEND = "https://dev-muse-automaton-production.up.railway.app/api/send";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE);

    // Only the database trigger may send. Legacy JWT calls from the order form
    // are acknowledged without sending (the trigger already queued that order).
    const key = req.headers.get("x-internal-key") || "";
    if (!key) return json(200, { success: true, skipped: "handled_by_trigger" });
    const { data: sec } = await admin.from("platform_secrets").select("value").eq("key", "internal_notify").maybeSingle();
    if (!sec?.value?.secret || key !== sec.value.secret) return json(401, { success: false, error: "unauthorized" });

    const body = await req.json().catch(() => ({}));
    const orderUuid = String(body?.order_uuid || "");
    if (!orderUuid) return json(400, { success: false, error: "order_uuid required" });

    const { data: order } = await admin
      .from("customer_purchases")
      .select("id, owner_user_id, marketer_id_staff, name_customer, phone_customer, address_customer, city_customer, postcode_customer, state_customer, total_sale, kurier, id_sale, tracking_number, nota_staff, bundle:logistic_bundles(name)")
      .eq("id", orderUuid)
      .maybeSingle();
    if (!order) return json(200, { success: false, skipped: "order_not_found" });
    const owner = order.owner_user_id as string;

    // Once per order: a retried trigger call must not message the customer twice.
    const { data: prior } = await admin
      .from("wa_notify_log").select("id").eq("order_id", order.id).eq("status_key", KEYIN_KEY).limit(1).maybeSingle();
    if (prior) return json(200, { success: true, skipped: "already_logged" });

    const { data: pref } = await admin
      .from("tracking_status_setting")
      .select("notify, message_template, message_image_url")
      .eq("owner_user_id", owner)
      .eq("status_key", KEYIN_KEY)
      .maybeSingle();
    if (!pref?.notify) return json(200, { success: true, skipped: "keyin_notify_off" });

    const log = async (success: boolean, messageId: string | null, error: string | null) => {
      try {
        await admin.from("wa_notify_log").insert({
          owner_user_id: owner, order_id: order.id, status_key: KEYIN_KEY,
          success, message_id: messageId, error, source: "auto",
        });
      } catch (_e) { /* ignore */ }
    };

    const phone = waPhone(String(order.phone_customer || ""));
    if (!phone) { await log(false, null, "Tiada nombor telefon"); return json(200, { success: false, skipped: "no_phone" }); }

    // The order's marketer's own device if set, else the HQ device.
    let instance = "";
    const staff = String(order.marketer_id_staff || "");
    if (staff && /^[\w-]+$/.test(staff)) {
      const { data: rows } = await admin
        .from("profiles").select("whacenter_instance, parent_user_id, id")
        .or(`username.eq.${staff},idstaff.eq.${staff}`);
      // deno-lint-ignore no-explicit-any
      const row = (rows || []).find((p: any) => p.parent_user_id === owner || p.id === owner);
      instance = (row?.whacenter_instance || "").trim();
    }
    if (!instance) {
      const { data: cfg } = await admin
        .from("parceldaily_config").select("whacenter_instance").eq("owner_user_id", owner).maybeSingle();
      instance = (cfg?.whacenter_instance || "").trim();
    }
    if (!instance) { await log(false, null, "Tiada device WhatsApp (instance kosong)"); return json(200, { success: false, skipped: "no_device" }); }

    const vars: Record<string, string> = {
      name: order.name_customer || "",
      phone: order.phone_customer || "",
      address: [order.address_customer, order.city_customer, order.postcode_customer, order.state_customer].filter(Boolean).join(", "),
      // deno-lint-ignore no-explicit-any
      product: (order as any).bundle?.name || order.nota_staff || "",
      price: Number(order.total_sale || 0).toFixed(2),
      courier: (order.kurier || "").replace(/\s+(COD|CASH)$/i, ""),
      order_id: order.id_sale || "",
      tracking: order.tracking_number || "",
    };
    // With an image set, an empty template means image-only (same as the webhook).
    const image = (pref.message_image_url || "").trim();
    const message = pref.message_template
      ? renderTemplate(pref.message_template, vars)
      : image ? "" : `Salam ${vars.name}! 😊\n\nKami telah menerima tempahan anda.\n\n` +
        `Order ID : ${vars.order_id}\nProduk : ${vars.product}\nHarga : RM${vars.price}\n\n` +
        `Terima kasih! Kami akan proses pesanan anda secepat mungkin. 🙏`;

    const res = await fetch(WA_SEND, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: instance, number: phone, message, ...(image ? { file: image } : {}) }),
    });
    const txt = await res.text();
    let sent = res.ok;
    let messageId: string | null = null;
    let error: string | null = res.ok ? null : `HTTP ${res.status}`;
    try {
      const j = JSON.parse(txt);
      sent = !!j.status;
      messageId = j.data?.id ? String(j.data.id) : null;
      error = sent ? null : String(j.message || "Gagal hantar");
    } catch { /* keep HTTP result */ }
    await log(sent, messageId, error);
    return json(200, { success: true, sent });
  } catch (e) {
    return json(200, { success: false, error: String((e as Error).message || e) });
  }
});
