/**
 * wa-device — each client's own WhatsApp device, backed by the existing
 * Railway Baileys gateway (peningorder connects as a registered partner;
 * send-only, no inbound webhook).
 *
 * POST JSON { action, ... } (caller's JWT identifies the owner):
 *   create   -> ensure a device row + gateway slot; returns { instance }
 *   qr       -> returns { qr: <data-url> } to scan (or { connected } / { pending })
 *   status   -> { status: 'CONNECTED'|'NOT CONNECTED', phone }
 *   logout   -> unlink the phone, keep the slot (re-scan with qr)
 *   delete   -> remove the device + gateway slot
 *   send     -> { number, message?, file?, type? }  (text / media / both)
 *
 * Every device is scoped to the caller: a client can only touch the device
 * whose device_setting.owner_user_id = their uid.
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

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
async function gateway(cfg: { url: string; api_key: string }, path: string, params: Record<string, string>) {
  const form = new URLSearchParams();
  form.append("api_key", cfg.api_key);
  for (const [k, v] of Object.entries(params)) if (v != null) form.append(k, v);
  const res = await fetch(`${cfg.url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("image/")) {
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return { image: `data:${ct};base64,${btoa(bin)}` };
  }
  try { return await res.json(); } catch { return { status: false, message: await res.text() }; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json(401, { error: "no_auth" });
    const authed = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await authed.auth.getUser();
    if (uErr || !user) return json(401, { error: "not_authenticated" });

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Gateway config (URL + partner api_key) from platform_secrets.
    const { data: secretRow } = await admin.from("platform_secrets").select("value").eq("key", "baileys_gateway").maybeSingle();
    const cfg = (secretRow?.value ?? {}) as { url?: string; api_key?: string };
    if (!cfg.url || !cfg.api_key) return json(500, { error: "gateway_not_configured" });
    const G = { url: cfg.url.replace(/\/$/, ""), api_key: cfg.api_key };

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    // The caller's single device row (one WhatsApp device per client).
    const { data: existing } = await admin
      .from("device_setting")
      .select("id, instance, device_id, phone_number, status_wa")
      .eq("owner_user_id", user.id)
      .eq("provider", "baileys")
      .maybeSingle();

    if (action === "create") {
      if (existing?.instance) return json(200, { success: true, instance: existing.instance, existed: true });
      // Create a slot on the gateway, then persist the returned instance.
      const g = await gateway(G, "/api/addDevice", { name: `po-${(user.email || user.id).split("@")[0]}` });
      const instance = g?.data?.device_id || g?.device_id;
      if (!g?.status || !instance) return json(502, { error: "gateway_create_failed", detail: g?.message || "no instance" });
      const row = {
        owner_user_id: user.id,
        user_id: user.id,
        provider: "baileys",
        instance,
        device_id: instance,
        status_wa: "NOT CONNECTED",
      };
      if (existing?.id) await admin.from("device_setting").update(row).eq("id", existing.id);
      else await admin.from("device_setting").insert(row);
      return json(200, { success: true, instance });
    }

    // Everything else needs an existing, owned device.
    if (!existing?.instance) return json(404, { error: "no_device" });
    const instance = existing.instance;

    if (action === "qr") {
      const g = await gateway(G, "/api/qr", { device_id: instance });
      if (g?.image) return json(200, { success: true, qr: g.image });
      // JSON means "already connected" or "no qr yet"
      const msg = String(g?.message || "");
      if (/already connected/i.test(msg)) return json(200, { success: true, connected: true });
      return json(200, { success: true, pending: true, message: msg || "QR not ready yet" });
    }

    if (action === "status") {
      const g = await gateway(G, "/api/statusDevice", { device_id: instance });
      const st = g?.data?.status === "CONNECTED" ? "CONNECTED" : "NOT CONNECTED";
      const phone = g?.data?.nomor || null;
      await admin.from("device_setting")
        .update({ status_wa: st, ...(phone ? { phone_number: phone } : {}), updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      return json(200, { success: true, status: st, phone });
    }

    if (action === "logout") {
      const g = await gateway(G, "/api/logout", { device_id: instance });
      await admin.from("device_setting").update({ status_wa: "NOT CONNECTED", phone_number: null, updated_at: new Date().toISOString() }).eq("id", existing.id);
      return json(200, { success: !!g?.status, message: g?.message });
    }

    if (action === "delete") {
      await gateway(G, "/api/deleteDevice", { device_id: instance });
      await admin.from("device_setting").delete().eq("id", existing.id);
      return json(200, { success: true });
    }

    if (action === "send") {
      const number = String(body?.number || "").replace(/\D/g, "");
      const message = String(body?.message || "");
      const file = body?.file ? String(body.file) : "";
      const type = body?.type ? String(body.type) : "";
      if (!number) return json(400, { error: "number_required" });
      if (!message && !file) return json(400, { error: "message_or_file_required" });
      const g = await gateway(G, "/api/send", { device_id: instance, number, message, file, type });
      if (!g?.status) return json(200, { success: false, message: g?.message || "send failed" });
      return json(200, { success: true, id: g?.data?.id });
    }

    return json(400, { error: "invalid_action" });
  } catch (e) {
    console.error("wa-device fatal:", e);
    return json(500, { error: String((e as Error).message || e) });
  }
});
