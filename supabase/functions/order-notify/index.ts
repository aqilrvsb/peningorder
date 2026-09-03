// order-notify — send the customer a WhatsApp right after an order is keyed in,
// IF the client has enabled "Order Keyed In" notify in Courier Settings →
// Tracking Webhook. Sends from the tenant's own Whacenter device.
//
// POST { order: { name, phone, address, product, price, courier, order_id, tracking } }
// (caller's JWT = the marketer/client who created the order)
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const authed = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json(200, { success: false, skipped: "not_authenticated" });

    const body = await req.json().catch(() => ({}));
    const o = (body?.order ?? {}) as Record<string, string>;

    // Resolve the tenant owner (client), even when a staff created the order.
    const { data: ownerUuid } = await authed.rpc("tenant_owner");
    if (!ownerUuid) return json(200, { success: false, skipped: "no_owner" });

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Only send if the client turned ON notify for "Order Keyed In".
    const { data: pref } = await admin
      .from("tracking_status_setting")
      .select("notify, message_template")
      .eq("owner_user_id", ownerUuid)
      .eq("status_key", KEYIN_KEY)
      .maybeSingle();
    if (!pref?.notify) return json(200, { success: true, skipped: "keyin_notify_off" });

    const phone = waPhone(String(o.phone || ""));
    if (!phone) return json(200, { success: false, skipped: "no_phone" });

    // Tenant's own Whacenter device (instance pasted in Courier Settings; the
    // device is created/paired on peningbot.com).
    const { data: cfg } = await admin
      .from("parceldaily_config").select("whacenter_instance").eq("owner_user_id", ownerUuid).maybeSingle();
    const instance = (cfg?.whacenter_instance || "").trim();
    if (!instance) return json(200, { success: false, skipped: "no_device" });

    const vars: Record<string, string> = {
      name: o.name || "",
      phone: o.phone || "",
      address: o.address || "",
      product: o.product || "",
      price: o.price || "",
      courier: (o.courier || "").replace(/\s+(COD|CASH)$/i, ""),
      order_id: o.order_id || "",
      tracking: o.tracking || "",
    };
    const message = pref.message_template
      ? renderTemplate(pref.message_template, vars)
      : `Salam ${vars.name}! 😊\n\nKami telah menerima tempahan anda.\n\n` +
        `Order ID : ${vars.order_id}\nProduk : ${vars.product}\nHarga : RM${vars.price}\n\n` +
        `Terima kasih! Kami akan proses pesanan anda secepat mungkin. 🙏`;

    const form = new URLSearchParams();
    form.append("device_id", instance);
    form.append("number", phone);
    form.append("message", message);
    const res = await fetch("https://api.whacenter.com/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const txt = await res.text();
    let sent = res.ok;
    try { const j = JSON.parse(txt); sent = !!j.status; } catch { /* keep res.ok */ }
    return json(200, { success: true, sent });
  } catch (e) {
    return json(200, { success: false, error: String((e as Error).message || e) });
  }
});
