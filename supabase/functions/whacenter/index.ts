import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
// PeningBot's Baileys gateway (replaced Whacenter). Same params as Whacenter;
// send as JSON (its multipart parser rejects FormData). HTTP is always 200 —
// read the body's `status`.
const WA_GATEWAY = "https://dev-muse-automaton-production.up.railway.app";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Malaysia digits for the gateway — exact copy of HCKCREA's toMalayDigits (proven
// working): 60XXXXXXXXX. Returns null for an invalid number.
const toMalayDigits = (raw: string): string | null => {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("60") && digits.length >= 11 && digits.length <= 13) return digits;
  if (digits.startsWith("0") && digits.length >= 10 && digits.length <= 12) return "6" + digits;
  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "send");
    const instance = String(body.instance || "").trim();
    if (!instance) return json(400, { success: false, error: "instance (device_id) diperlukan" });

    // Check device connection status.
    if (action === "status") {
      const res = await fetch(`${WA_GATEWAY}/api/statusDevice?device_id=${encodeURIComponent(instance)}`);
      const txt = await res.text();
      let data: any = {};
      try { data = JSON.parse(txt); } catch { /* keep {} */ }
      const status = data?.data?.status || (data?.status ? "UNKNOWN" : "NOT CONNECTED");
      return json(200, {
        success: true,
        connected: String(status).toUpperCase() === "CONNECTED",
        status,
        message: data?.message || "",
      });
    }

    // Send a WhatsApp message (used by the template + Profile Test buttons).
    // Optional imageUrl -> send as an image with `message` as the caption. This
    // supports image+text, text-only, and image-only (empty message + imageUrl).
    const number = toMalayDigits(String(body.phone || ""));
    const message = String(body.message || "");
    const imageUrl = String(body.imageUrl || "").trim();
    if (!number) return json(400, { success: false, error: "Nombor telefon Malaysia tidak sah" });
    if (!message && !imageUrl) return json(400, { success: false, error: "message atau imageUrl diperlukan" });

    // With imageUrl the gateway sends an image (`file` = public URL) and
    // `message` becomes the caption (may be empty = image-only).
    const payloadOut: Record<string, string> = { device_id: instance, number, message };
    if (imageUrl) payloadOut.file = imageUrl;
    const res = await fetch(`${WA_GATEWAY}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadOut),
    });
    const txt = await res.text();
    let payload: any = null;
    try { payload = JSON.parse(txt); } catch { /* non-JSON body */ }
    return json(200, { success: res.ok && payload?.status !== false, response: payload ?? txt });
  } catch (err) {
    return json(500, { success: false, error: err instanceof Error ? err.message : "error" });
  }
});
