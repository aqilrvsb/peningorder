// deno-lint-ignore-file no-explicit-any
// own-courier-test — BYOC Courier Settings "Test Connection". Logs in to the tenant's own courier
// account (OAuth only — never creates a shipment) and records the result on own_courier_config.
// POST { courier: 'ninjavan' | 'poslaju' | 'jnt' }  (caller JWT = the tenant owner)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CourierError, loadOwnCourierConfig, OWN_COURIERS, testConnection, type OwnCourier } from "../_shared/own-couriers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const authed = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ ok: false, message: "Sila log masuk semula." });
    // Only the tenant owner manages courier credentials (staff never see them).
    const { data: owner } = await authed.rpc("tenant_owner");
    if (!owner || owner !== user.id) return json({ ok: false, message: "Hanya pemilik akaun boleh test kurier." });

    const body = await req.json().catch(() => ({}));
    const courier = String(body.courier || "") as OwnCourier;
    if (!OWN_COURIERS.includes(courier)) return json({ ok: false, message: "Kurier tidak sah." });

    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cfg = await loadOwnCourierConfig(service, owner, courier);
    if (!cfg) return json({ ok: false, message: "Simpan maklumat kurier dahulu sebelum test." });

    let ok = false;
    let message = "";
    try {
      message = await testConnection(service, cfg);
      ok = true;
    } catch (e) {
      message = e instanceof CourierError ? e.message : `Ralat: ${(e as Error).message || e}`;
    }
    await service.from("own_courier_config")
      .update({ last_test_at: new Date().toISOString(), last_test_ok: ok, last_test_message: message.slice(0, 500) })
      .eq("id", cfg.id);
    return json({ ok, message });
  } catch (e) {
    return json({ ok: false, message: String((e as Error).message || e) });
  }
});
