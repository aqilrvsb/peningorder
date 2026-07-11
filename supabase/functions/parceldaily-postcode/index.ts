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

// Look up a Malaysian postcode via Parcel Daily.
// PD only returns the STATE (negeri) — it does NOT return city/daerah.
// Payload: { postcode: "50000" }  ->  { success: true, state: "Kuala Lumpur" }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return ok({ success: false, error: "Not authenticated" });

    const { postcode } = await req.json();
    const pc = String(postcode || "").trim();
    if (!/^\d{5}$/.test(pc)) return ok({ success: false, error: "Postcode must be 5 digits" });

    // RLS: caller's own PD config
    const { data: config } = await supabase
      .from("parceldaily_config")
      .select("token, merchant_id, environment")
      .maybeSingle();
    if (!config) return ok({ success: false, error: "No Parcel Daily config" });

    const apiBase = (config.environment || "sandbox") === "production"
      ? "https://api.parceldaily.com"
      : "https://api.sandbox.parceldaily.com";

    // Guard against PD's occasionally-slow postcode endpoint
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(`${apiBase}/v1/partner/postcode`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          token: config.token,
          merchantid: config.merchant_id,
        },
        body: JSON.stringify({ postcode: pc }),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      return ok({ success: false, error: "Postcode lookup timed out" });
    }
    clearTimeout(timer);

    const txt = await res.text();
    let result: any;
    try { result = JSON.parse(txt); } catch { result = { raw: txt }; }

    const state = result?.success?.state || result?.state || null;
    if (!res.ok || !state) {
      return ok({ success: false, error: "Postcode not found", details: result });
    }

    return ok({ success: true, state });
  } catch (err: any) {
    return ok({ success: false, error: err?.message || "Server error" });
  }
});
