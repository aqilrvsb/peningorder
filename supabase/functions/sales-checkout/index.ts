/**
 * PeningOrder Sales-Page Checkout (public, no JWT)
 *
 * Front door for a brand-new visitor coming from the marketing landing page.
 * It provisions the account IMMEDIATELY (email pre-confirmed), then opens a
 * CHIP payment intent for the chosen plan. The auto-generated login password
 * is WhatsApp'd to the customer only after payment succeeds.
 *
 * Flow:
 *   1. Validate { full_name, business_name, email, phone, plan } (password is
 *      auto-generated server-side — never collected from the visitor).
 *   2. Create the auth user with email_confirm=true, then mark the profile
 *      expired-until-paid (no free ride) and stash the temp password on the
 *      pending payment row.
 *   3. Alert admins of the new pending subscriber.
 *   4. Create a CHIP purchase; on payment the billing-webhook activates the
 *      plan and WhatsApps the client their login. If CHIP can't auto-confirm,
 *      the admin approves in Transactions (admin-payment-action) which does the
 *      same activation + WhatsApp.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHIP_BASE = "https://gate.chip-in.asia/api/v1";
const VALID_PLANS = ["starter", "growth", "scale"];

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Auto-generated login password — no OCR-confusable chars (users read it off a
// phone screen) and one of each class so Supabase's strong-password check can't
// reject it (which would leave a WhatsApp'd password that was never saved).
function generatePassword(len = 12): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const sym = "!@#$";
  const all = upper + lower + digit + sym;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const out = [pick(upper), pick(lower), pick(digit), pick(sym)];
  for (let i = out.length; i < len; i++) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

// ---- WhatsApp (Whacenter) admin alert on new pending signup ----------------
const WHACENTER = "https://api.whacenter.com/api/send";
function toMalayDigits(raw: string): string | null {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (/^60\d{8,12}$/.test(d)) return d;
  if (/^0\d{8,11}$/.test(d)) return "6" + d;
  if (/^1\d{8,10}$/.test(d)) return "60" + d;
  return d.length >= 9 ? d : null;
}
async function sendWhatsApp(toPhone: string, message: string): Promise<boolean> {
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
    const res = await fetch(WHACENTER, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
    return res.ok;
  } catch (_) {
    return false;
  }
}
async function notifyAdmins(message: string): Promise<void> {
  const { data: roles } = await admin.from("user_roles").select("user_id").eq("role", "superadmin");
  const ids = (roles || []).map((r: { user_id: string }) => r.user_id);
  if (!ids.length) return;
  const { data: profs } = await admin.from("profiles").select("whatsapp, whatsapp_number").in("id", ids);
  for (const p of profs || []) {
    const num = String(p.whatsapp_number || p.whatsapp || "").trim();
    if (num) await sendWhatsApp(num, message);
  }
}

type Intent = {
  full_name: string;
  business_name: string;
  email: string;
  phone: string;
  password: string;
  plan: string;
};

function validate(input: unknown): { ok: true; data: Intent } | { ok: false; detail: string } {
  if (!input || typeof input !== "object") return { ok: false, detail: "missing body" };
  const i = input as Record<string, unknown>;
  const full_name = typeof i.full_name === "string" ? i.full_name.trim() : "";
  const business_name = typeof i.business_name === "string" ? i.business_name.trim() : "";
  const email = typeof i.email === "string" ? i.email.trim().toLowerCase() : "";
  const phone = typeof i.phone === "string" ? i.phone.replace(/\D/g, "") : "";
  // Password is no longer collected from the visitor — we auto-generate one and
  // WhatsApp it on payment success. Any client-sent value is ignored.
  const password = generatePassword(12);
  const plan = typeof i.plan === "string" ? i.plan.trim().toLowerCase() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, detail: "invalid email" };
  if (full_name.length < 2) return { ok: false, detail: "invalid full_name" };
  if (business_name.length < 2) return { ok: false, detail: "invalid business_name" };
  if (!/^60\d{8,11}$/.test(phone)) return { ok: false, detail: "invalid phone (expected 60xxxxxxxxx)" };
  if (!VALID_PLANS.includes(plan)) return { ok: false, detail: `invalid plan (expected ${VALID_PLANS.join("/")})` };

  return { ok: true, data: { full_name, business_name, email, phone, password, plan } };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const appOrigin = Deno.env.get("APP_ORIGIN") || "https://peningorder.com";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const body = await req.json().catch(() => null);
    const v = validate(body);
    if (!v.ok) return json(400, { error: "validation", detail: v.detail });
    const intent = v.data;

    // Bail early if the email already has an account.
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", intent.email)
      .maybeSingle();
    if (existing) {
      return json(409, { error: "email_exists", message: "Akaun dengan email ni dah wujud. Sila log masuk." });
    }

    // Provision the account. email_confirm=true so the customer can log in
    // straight away regardless of the project's confirm-email setting.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: intent.email,
      password: intent.password,
      email_confirm: true,
      user_metadata: {
        username: intent.email.split("@")[0],
        full_name: intent.full_name,
        business_name: intent.business_name,
        whatsapp: intent.phone,
      },
    });
    if (createErr || !created?.user) {
      const msg = createErr?.message || "create_user_failed";
      if (/already|exist|registered/i.test(msg)) {
        return json(409, { error: "email_exists", message: "Akaun dengan email ni dah wujud. Sila log masuk." });
      }
      console.error("createUser failed:", msg);
      return json(500, { error: "create_user_failed", detail: msg });
    }
    const userId = created.user.id;

    // No free ride: mark the fresh account expired until payment clears. The
    // freeze-gate keeps them on Billing only until the plan is activated.
    await admin.from("profiles").update({ plan_expires_at: new Date().toISOString() }).eq("id", userId);

    // Load plan config.
    const { data: settingRow } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", `plan_${intent.plan}`)
      .maybeSingle();
    if (!settingRow) return json(500, { error: "plan_config_missing", detail: `plan_${intent.plan}` });
    const cfg = settingRow.value as { price: number; days: number; label: string };

    // Pending payment row for this subscription.
    const { data: payment, error: payErr } = await admin
      .from("payments")
      .insert({
        user_id: userId,
        type: "subscription",
        plan: intent.plan,
        amount: cfg.price,
        currency: "MYR",
        status: "pending",
        metadata: {
          plan: intent.plan, days: cfg.days, label: cfg.label, source: "sales_page",
          phone: intent.phone,
          // Stashed so payment success (webhook or admin approve) can WhatsApp
          // the client their auto-generated login. Service-role only.
          temp_password: intent.password,
        },
      })
      .select()
      .single();
    if (payErr || !payment) {
      console.error("payment insert failed:", payErr);
      // Account still created — let them log in and pay from the dashboard.
      return json(200, { success: true, account_created: true, chip_url: null, email: intent.email, warning: "payment_init_failed" });
    }

    // Alert admins a new subscriber is waiting (they may need manual approval
    // if CHIP can't auto-confirm via webhook).
    await notifyAdmins(
      `🆕 *PeningOrder — Pendaftaran Baru (Pending)*\n\n` +
      `Name    : ${intent.full_name}\n` +
      `Bisnes  : ${intent.business_name}\n` +
      `Email   : ${intent.email}\n` +
      `WhatsApp: ${intent.phone}\n` +
      `Plan    : ${cfg.label} (RM${Number(cfg.price).toFixed(2)})\n\n` +
      `Semak di Admin → Transactions.`,
    ).catch(() => {});

    // Create the CHIP purchase. If CHIP isn't configured we still return
    // success — the account exists and the user can subscribe later.
    // CHIP creds come from the admin-managed platform_secrets row first
    // (dynamic config), falling back to env secrets.
    const { data: chipRow } = await admin.from("platform_secrets").select("value").eq("key", "chip").maybeSingle();
    const chipCfg = (chipRow?.value ?? {}) as { api_key?: string; brand_id?: string };
    const chipKey = chipCfg.api_key || Deno.env.get("CHIP_API_KEY");
    const chipBrand = chipCfg.brand_id || Deno.env.get("CHIP_BRAND_ID");
    if (!chipKey || !chipBrand) {
      console.warn("CHIP not configured — returning account without checkout URL");
      return json(200, { success: true, account_created: true, chip_url: null, email: intent.email, warning: "chip_not_configured" });
    }

    const reference = `SUB-${payment.id.substring(0, 8)}`;
    const purchasePayload = {
      brand_id: chipBrand,
      client: { email: intent.email, full_name: intent.full_name },
      purchase: {
        currency: "MYR",
        products: [
          { name: `PeningOrder ${cfg.label} Plan — ${cfg.days} hari`, price: Math.round(cfg.price * 100), quantity: 1 },
        ],
        notes: `${intent.business_name} · ${intent.plan} plan`,
        metadata: { type: "subscription", user_id: userId, payment_id: payment.id, plan: intent.plan, days: cfg.days },
      },
      success_redirect: `${appOrigin}/auth?payment=success`,
      failure_redirect: `${appOrigin}/checkout?plan=${intent.plan}&status=failed`,
      success_callback: `${supabaseUrl}/functions/v1/billing-webhook`,
      reference,
      send_receipt: true,
    };

    const res = await fetch(`${CHIP_BASE}/purchases/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${chipKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(purchasePayload),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error(`CHIP create failed ${res.status}:`, txt.slice(0, 400));
      // Non-fatal: account exists, let them retry payment from the dashboard.
      return json(200, { success: true, account_created: true, chip_url: null, email: intent.email, warning: "chip_create_failed" });
    }
    const purchase = await res.json();

    await admin
      .from("payments")
      .update({ chip_purchase_id: purchase.id, chip_checkout_url: purchase.checkout_url })
      .eq("id", payment.id);

    return json(200, {
      success: true,
      account_created: true,
      chip_url: purchase.checkout_url,
      payment_id: payment.id,
      email: intent.email,
      amount: cfg.price,
    });
  } catch (e) {
    console.error("sales-checkout fatal:", e);
    return json(500, { error: String((e as Error).message || e) });
  }
});
