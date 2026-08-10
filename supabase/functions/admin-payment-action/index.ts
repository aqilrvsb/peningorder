/**
 * admin-payment-action — superadmin approve / reject of a pending subscription
 * payment, with WhatsApp notifications (via Whacenter).
 *
 * POST JSON { action: "approve" | "reject", payment_id }
 *
 *  approve -> mark payment paid, extend the client's plan, and WhatsApp the
 *             client their login (credentials for a first-time signup, or a
 *             renewal confirmation for an existing client). Also alerts admins.
 *  reject  -> mark payment failed and WhatsApp both the client and admins.
 *
 * The caller's JWT identifies them; we verify is_superadmin() before acting.
 */
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
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://peningorder.com";
const LOGIN_URL = `${APP_ORIGIN}/auth`;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ---- WhatsApp (Whacenter) --------------------------------------------------
const WHACENTER = "https://api.whacenter.com/api/send";

function toMalayDigits(raw: string): string | null {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (/^60\d{8,12}$/.test(d)) return d;
  if (/^0\d{8,11}$/.test(d)) return "6" + d;
  if (/^1\d{8,10}$/.test(d)) return "60" + d;
  return d.length >= 9 ? d : null;
}

// deno-lint-ignore no-explicit-any
async function sendWhatsApp(admin: any, toPhone: string, message: string): Promise<boolean> {
  const number = toMalayDigits(toPhone);
  if (!number) return false;
  const { data: device } = await admin.from("admin_device").select("instance, api_key").eq("active", true).limit(1).maybeSingle();
  if (!device?.instance) return false;
  const form = new URLSearchParams();
  // Whacenter only actually delivers (returns a real message id) when the
  // account api_key is included; without it the send is silently dropped.
  if (device.api_key) form.append("api_key", device.api_key);
  form.append("device_id", device.instance);
  form.append("number", number);
  form.append("message", message);
  try {
    const res = await fetch(WHACENTER, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

// deno-lint-ignore no-explicit-any
async function notifyAdmins(admin: any, message: string): Promise<void> {
  const { data: roles } = await admin.from("user_roles").select("user_id").eq("role", "superadmin");
  const ids = (roles || []).map((r: { user_id: string }) => r.user_id);
  if (!ids.length) return;
  const { data: profs } = await admin.from("profiles").select("whatsapp, whatsapp_number").in("id", ids);
  for (const p of profs || []) {
    const num = String(p.whatsapp_number || p.whatsapp || "").trim();
    if (num) await sendWhatsApp(admin, num, message);
  }
}

function fmtMY(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("ms-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "long" });
  } catch (_) {
    return iso;
  }
}

function buildLoginMessage(o: { name: string; email: string; password: string; planLabel: string; expires: string }) {
  return `*Selamat datang ke PeningOrder!* 🎉

Salam ${o.name || "pelanggan"},

Pembayaran anda berjaya — akaun anda sudah aktif.

*Login info anda:*
Email    : ${o.email}
Password : ${o.password}

Plan     : ${o.planLabel}
Sah hingga: ${o.expires}

Login di: ${LOGIN_URL}

Sila tukar password selepas login pertama (Profile → Tukar Password).

Sebarang masalah? Reply WhatsApp ini.`;
}

function buildRenewMessage(o: { name: string; planLabel: string; expires: string }) {
  return `*PeningOrder — Langganan Diperbaharui* ✅

Salam ${o.name || "pelanggan"},

Pembayaran anda berjaya. Plan anda sudah aktif semula.

Plan     : ${o.planLabel}
Sah hingga: ${o.expires}

Login di: ${LOGIN_URL}
(Guna email & password sedia ada anda.)

Terima kasih!`;
}

function buildRejectClientMessage(o: { name: string }) {
  return `*PeningOrder — Pembayaran Tidak Disahkan* ⚠️

Salam ${o.name || "pelanggan"},

Maaf, pembayaran langganan anda tidak dapat disahkan dan telah ditolak.
Jika anda rasa ini satu kesilapan, sila buat pembayaran semula atau hubungi kami.

Login di: ${LOGIN_URL}`;
}

function buildAdminAlert(o: { statusText: string; amount: number; name: string; email: string; whatsapp: string; planLabel: string }) {
  return `💰 *PeningOrder — Langganan*

Status  : ${o.statusText}
Sales   : RM${Number(o.amount || 0).toFixed(2)}
Name    : ${o.name || "-"}
Email   : ${o.email || "-"}
WhatsApp: ${o.whatsapp || "-"}
Plan    : ${o.planLabel}
Tarikh  : ${fmtMY(new Date().toISOString())} MYT`;
}

// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json(401, { error: "no_auth" });

    const authed = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await authed.auth.getUser();
    if (userErr || !user) return json(401, { error: "not_authenticated" });
    const { data: isAdmin } = await authed.rpc("is_superadmin");
    if (!isAdmin) return json(403, { error: "not_superadmin" });

    const admin = createClient(SUPABASE_URL, SERVICE);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const paymentId = String(body?.payment_id || "");
    if (!paymentId) return json(400, { error: "missing_payment_id" });

    const { data: payment } = await admin.from("payments").select("*").eq("id", paymentId).maybeSingle();
    if (!payment) return json(404, { error: "payment_not_found" });

    const { data: prof } = await admin
      .from("profiles")
      .select("email, full_name, whatsapp, whatsapp_number, plan_expires_at")
      .eq("id", payment.user_id)
      .maybeSingle();

    const clientPhone = String(prof?.whatsapp || prof?.whatsapp_number || payment.metadata?.phone || "").trim();
    const clientName = String(prof?.full_name || "").trim();
    const clientEmail = String(prof?.email || "").trim();
    const planLabel = String(payment.metadata?.label || payment.plan || "").toString();

    if (action === "approve") {
      // Mark paid.
      await admin.from("payments").update({
        status: "paid",
        paid_at: payment.paid_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", payment.id);

      // Extend plan: from the later of now / current expiry, add plan days.
      const days = Number(payment.metadata?.days) || 30;
      const cur = prof?.plan_expires_at ? new Date(prof.plan_expires_at) : null;
      const base = cur && cur.getTime() > Date.now() ? cur : new Date();
      const newExpiry = new Date(base.getTime() + days * 86400000);
      await admin.from("profiles").update({
        plan: payment.plan,
        plan_expires_at: newExpiry.toISOString(),
        is_active: true,
      }).eq("id", payment.user_id);

      // Notify client: first-time signups carry a temp password to reveal.
      const tempPw = String(payment.metadata?.temp_password || "");
      if (clientPhone) {
        const msg = tempPw
          ? buildLoginMessage({ name: clientName, email: clientEmail, password: tempPw, planLabel, expires: fmtMY(newExpiry.toISOString()) })
          : buildRenewMessage({ name: clientName, planLabel, expires: fmtMY(newExpiry.toISOString()) });
        await sendWhatsApp(admin, clientPhone, msg);
      }
      await notifyAdmins(admin, buildAdminAlert({
        statusText: "Diluluskan ✅", amount: payment.amount, name: clientName, email: clientEmail, whatsapp: clientPhone, planLabel,
      }));
      return json(200, { success: true, status: "paid", plan_expires_at: newExpiry.toISOString() });
    }

    if (action === "reject") {
      await admin.from("payments").update({
        status: "failed",
        updated_at: new Date().toISOString(),
      }).eq("id", payment.id);

      if (clientPhone) await sendWhatsApp(admin, clientPhone, buildRejectClientMessage({ name: clientName }));
      await notifyAdmins(admin, buildAdminAlert({
        statusText: "Ditolak ❌", amount: payment.amount, name: clientName, email: clientEmail, whatsapp: clientPhone, planLabel,
      }));
      return json(200, { success: true, status: "failed" });
    }

    return json(400, { error: "invalid_action" });
  } catch (e) {
    console.error("admin-payment-action fatal:", e);
    return json(500, { error: String((e as Error).message || e) });
  }
});
