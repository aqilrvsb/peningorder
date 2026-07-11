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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const chipKey = Deno.env.get("CHIP_API_KEY")!;
    if (!chipKey) {
      return new Response(JSON.stringify({ error: "CHIP_API_KEY missing" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

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

      // Cycle resets to fresh N days from now (matches HCKCREA policy)
      const now = new Date();
      const newExpiry = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      await admin
        .from("profiles")
        .update({
          plan,
          plan_expires_at: newExpiry.toISOString(),
        })
        .eq("id", payment.user_id);
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
