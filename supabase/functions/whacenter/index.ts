import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Malaysia digits for Whacenter — exact copy of HCKCREA's toMalayDigits (proven
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
      const res = await fetch(`https://api.whacenter.com/api/statusDevice?device_id=${encodeURIComponent(instance)}`);
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

    let res: Response;
    if (imageUrl) {
      // Whacenter sends an image when `file` is a public image URL; `message` is
      // the caption (may be empty). FormData, not urlencoded.
      const fd = new FormData();
      fd.append("device_id", instance);
      fd.append("number", number);
      fd.append("message", message);
      fd.append("file", imageUrl);
      res = await fetch("https://api.whacenter.com/api/send", { method: "POST", body: fd });
    } else {
      const form = new URLSearchParams();
      form.append("device_id", instance);
      form.append("number", number);
      form.append("message", message);
      res = await fetch("https://api.whacenter.com/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
    }
    // Whacenter accepts the message on HTTP 200 — match HCKCREA / Pening Bot,
    // which trust res.ok and do NOT inspect the JSON body (avoids false errors).
    const txt = await res.text();
    let payload: any = null;
    try { payload = JSON.parse(txt); } catch { /* non-JSON body */ }
    return json(200, { success: res.ok, response: payload ?? txt });
  } catch (err) {
    return json(500, { success: false, error: err instanceof Error ? err.message : "error" });
  }
});
