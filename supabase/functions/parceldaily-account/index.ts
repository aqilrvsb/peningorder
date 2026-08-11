// deno-lint-ignore-file no-explicit-any
// parceldaily-account — returns the caller's ParcelDaily credit balance.
// Reads the client's own parceldaily_config (via RLS with their JWT) and calls
// ParcelDaily /account-info. Routed to sandbox/production per config.environment.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json(401, { error: "no_auth" });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    // RLS ensures we only read the caller's own config row.
    const { data: config } = await supabase
      .from("parceldaily_config")
      .select("token, merchant_id, environment")
      .maybeSingle();
    if (!config?.token || !config?.merchant_id) return json(200, { configured: false });

    const base = (config.environment || "sandbox") === "production"
      ? "https://api.parceldaily.com"
      : "https://api.sandbox.parceldaily.com";
    const res = await fetch(`${base}/v1/partner/account-info`, {
      headers: { "Content-Type": "application/json", token: config.token, merchantid: config.merchant_id },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return json(200, { configured: true, ok: false, message: body?.message || `HTTP ${res.status}` });
    }
    const d = body?.data ?? body ?? {};
    return json(200, {
      configured: true,
      ok: true,
      credit: d.credit ?? null,
      topup_package: d.topupPackage ?? null,
      expires_in: d.expiresIn ?? null,
    });
  } catch (e) {
    return json(200, { configured: true, ok: false, message: String((e as Error).message || e) });
  }
});
