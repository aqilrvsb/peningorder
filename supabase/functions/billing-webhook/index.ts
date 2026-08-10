// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const CHIP_BASE = "https://gate.chip-in.asia/api/v1";

function mapChipStatus(s: string): "pending" | "paid" | "failed" | "refunded" {
  if (s === "paid") return "paid";
  if (["error", "cancelled", "expired", "charged_back", "overdue"].includes(s)) return "failed";
  if (["refunded", "pending_refund"].includes(s)) return "refunded";
  return "pending";
}

// ---- WhatsApp (Whacenter) --------------------------------------------------
const WHACENTER = "https://api.whacenter.com/api/send";
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://peningorder.com";
const LOGIN_URL = `${APP_ORIGIN}/auth`;

function toMalayDigits(raw: string): string | null {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (/^60\d{8,12}$/.test(d)) return d;
  if (/^0\d{8,11}$/.test(d)) return "6" + d;
  if (/^1\d{8,10}$/.test(d)) return "60" + d;
  return d.length >= 9 ? d : null;
}
async function sendWhatsApp(admin: any, toPhone: string, message: string): Promise<boolean> {
  const number = toMalayDigits(toPhone);
  if (!number) return false;
  const { data: device } = await admin.from("admin_device").select("instance").eq("active", true).limit(1).maybeSingle();
  if (!device?.instance) return false;
  const form = new URLSearchParams();
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
function fmtMY(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ms-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "long" });
  } catch (_) {
    return iso;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // CHIP key from admin-managed platform_secrets first, env fallback.
    const { data: chipRow } = await admin.from("platform_secrets").select("value").eq("key", "chip").maybeSingle();
    const chipCfg = (chipRow?.value ?? {}) as { api_key?: string };
    const chipKey = chipCfg.api_key || Deno.env.get("CHIP_API_KEY");
    if (!chipKey) {
      return new Response(JSON.stringify({ error: "CHIP not configured" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    // Chip POSTs the purchase object, we can also handle GET for manual polls
    let purchaseId: string | undefined;
    if (req.method === "GET") {
      const url = new URL(req.url);
      purchaseId = url.searchParams.get("id") || undefined;
    } else {
      const body = await req.json().catch(() => ({}));
      purchaseId = body?.id;
    }
    if (!purchaseId) {
      return new Response(JSON.stringify({ error: "Missing purchase id" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    // Re-verify against Chip
    const chipRes = await fetch(`${CHIP_BASE}/purchases/${purchaseId}/`, {
      headers: {
        Authorization: `Bearer ${chipKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!chipRes.ok) {
      const txt = await chipRes.text();
      console.error(`Chip fetch failed ${chipRes.status}:`, txt.slice(0, 500));
      return new Response(JSON.stringify({ error: "Chip verify failed" }), {
        status: 502,
        headers: jsonHeaders,
      });
    }
    const chip = await chipRes.json();
    const newStatus = mapChipStatus(chip.status);

    // Find our payment
    const { data: payment } = await admin
      .from("payments")
      .select("*")
      .eq("chip_purchase_id", purchaseId)
      .maybeSingle();
    if (!payment) {
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    // Short-circuit if already at target status
    if (payment.status === newStatus) {
      return new Response(JSON.stringify({ ok: true, status: newStatus, message: "already at target" }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // Atomic CAS: only transition if status !== newStatus (guards against duplicate webhook fires)
    const { data: claimed } = await admin
      .from("payments")
      .update({
        status: newStatus,
        paid_at: newStatus === "paid" ? new Date().toISOString() : null,
        chip_transaction_id: chip.transaction_data?.id || chip.transaction?.id || null,
        metadata: {
          ...(payment.metadata || {}),
          chip_status: chip.status,
          last_checked_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .neq("status", newStatus)
      .select("id");

    const transitioned = !!(claimed && claimed.length > 0);

    // Apply side effect (extend plan) only on the winning CAS
    if (newStatus === "paid" && transitioned && payment.type === "subscription") {
      const days = Number(payment.metadata?.days || 30);
      const plan = payment.plan as string;

      // Extend from the later of now / current expiry (so an early renewal
      // stacks instead of shrinking the remaining term).
      const { data: prof } = await admin
        .from("profiles")
        .select("email, full_name, whatsapp, whatsapp_number, plan_expires_at")
        .eq("id", payment.user_id)
        .maybeSingle();
      const cur = prof?.plan_expires_at ? new Date(prof.plan_expires_at) : null;
      const base = cur && cur.getTime() > Date.now() ? cur : new Date();
      const newExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

      await admin
        .from("profiles")
        .update({
          plan,
          plan_expires_at: newExpiry.toISOString(),
          is_active: true,
        })
        .eq("id", payment.user_id);

      // WhatsApp the client their login (credentials for a first-time signup;
      // a renewal confirmation otherwise) and alert admins.
      const phone = String(prof?.whatsapp || prof?.whatsapp_number || payment.metadata?.phone || "").trim();
      const name = String(prof?.full_name || "").trim();
      const email = String(prof?.email || "").trim();
      const label = String(payment.metadata?.label || plan);
      const tempPw = String(payment.metadata?.temp_password || "");
      const expires = fmtMY(newExpiry.toISOString());
      if (phone) {
        const msg = tempPw
          ? `*Selamat datang ke PeningOrder!* 🎉\n\nSalam ${name || "pelanggan"},\n\nPembayaran anda berjaya — akaun anda sudah aktif.\n\n*Login info anda:*\nEmail    : ${email}\nPassword : ${tempPw}\n\nPlan     : ${label}\nSah hingga: ${expires}\n\nLogin di: ${LOGIN_URL}\n\nSila tukar password selepas login pertama (Profile → Tukar Password).\n\nSebarang masalah? Reply WhatsApp ini.`
          : `*PeningOrder — Langganan Diperbaharui* ✅\n\nSalam ${name || "pelanggan"},\n\nPembayaran anda berjaya. Plan anda sudah aktif semula.\n\nPlan     : ${label}\nSah hingga: ${expires}\n\nLogin di: ${LOGIN_URL}\n(Guna email & password sedia ada anda.)\n\nTerima kasih!`;
        await sendWhatsApp(admin, phone, msg);
      }
      await notifyAdmins(admin,
        `💰 *PeningOrder — Langganan Berjaya (CHIP)* ✅\n\nSales   : RM${Number(payment.amount || 0).toFixed(2)}\nName    : ${name || "-"}\nEmail   : ${email || "-"}\nWhatsApp: ${phone || "-"}\nPlan    : ${label}\nTarikh  : ${fmtMY(new Date().toISOString())} MYT`,
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        status: newStatus,
        side_effects: transitioned ? "fired" : "skipped-race",
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err: any) {
    console.error("billing-webhook error:", err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || "Server error" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
