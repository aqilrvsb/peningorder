// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: jsonHeaders });
const fail = (error: string, status = 400) =>
  new Response(JSON.stringify({ error }), { status, headers: jsonHeaders });

const CHIP_BASE = "https://gate.chip-in.asia/api/v1";

const VALID_PLANS = ["starter", "growth", "scale"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const chipKey = Deno.env.get("CHIP_API_KEY")!;
    const chipBrand = Deno.env.get("CHIP_BRAND_ID")!;
    const appOrigin = Deno.env.get("APP_ORIGIN") || "https://peningorder.vercel.app";
    if (!chipKey || !chipBrand) {
      return fail("Server misconfigured: CHIP_API_KEY / CHIP_BRAND_ID missing", 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const authedSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userError } = await authedSupabase.auth.getUser();
    if (userError || !user) return fail("Not authenticated. Sign in first.", 401);

    const body = await req.json().catch(() => ({}));
    const plan = String(body?.plan || "").toLowerCase();
    if (!VALID_PLANS.includes(plan)) {
      return fail(`Invalid plan. Expected one of: ${VALID_PLANS.join(", ")}`);
    }

    // Load plan config from app_settings
    const { data: settingRow } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", `plan_${plan}`)
      .maybeSingle();
    if (!settingRow) return fail(`Plan config missing: plan_${plan}`, 500);
    const cfg = settingRow.value as { price: number; days: number; label: string };

    // Load profile for name / whatsapp
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, business_name, whatsapp")
      .eq("id", user.id)
      .maybeSingle();
    const fullName = profile?.full_name || user.email?.split("@")[0] || "User";

    // Create payment record in pending state
    const { data: payment, error: payErr } = await admin
      .from("payments")
      .insert({
        user_id: user.id,
        type: "subscription",
        plan,
        amount: cfg.price,
        currency: "MYR",
        status: "pending",
        metadata: { plan, days: cfg.days, label: cfg.label },
      })
      .select()
      .single();
    if (payErr || !payment) {
      console.error("payment insert failed:", payErr);
      return fail("Failed to create payment record", 500);
    }

    const reference = `SUB-${payment.id.substring(0, 8)}`;
    const webhookUrl = `${supabaseUrl}/functions/v1/billing-webhook`;

    const purchasePayload = {
      brand_id: chipBrand,
      client: { email: user.email!, full_name: fullName },
      purchase: {
        currency: "MYR",
        products: [
          {
            name: `PeningOrder ${cfg.label} Plan — ${cfg.days} days`,
            price: Math.round(cfg.price * 100),
            quantity: 1,
          },
        ],
        metadata: {
          type: "subscription",
          user_id: user.id,
          payment_id: payment.id,
          plan,
          days: cfg.days,
        },
      },
      success_redirect: `${appOrigin}/dashboard/billing?payment=success`,
      failure_redirect: `${appOrigin}/dashboard/billing?payment=failed`,
      success_callback: webhookUrl,
      reference,
      send_receipt: true,
    };

    const res = await fetch(`${CHIP_BASE}/purchases/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chipKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(purchasePayload),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error(`Chip create failed ${res.status}:`, txt.slice(0, 500));
      return fail(`Chip purchase failed: ${txt.slice(0, 300)}`, 500);
    }
    const purchase = await res.json();

    await admin
      .from("payments")
      .update({
        chip_purchase_id: purchase.id,
        chip_checkout_url: purchase.checkout_url,
      })
      .eq("id", payment.id);

    return ok({
      success: true,
      payment_id: payment.id,
      checkout_url: purchase.checkout_url,
    });
  } catch (err: any) {
    console.error("billing-subscribe error:", err?.message || err);
    return fail(err?.message || "Server error", 500);
  }
});
