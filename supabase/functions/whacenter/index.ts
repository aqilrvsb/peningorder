import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Normalise a Malaysian phone to Whacenter digits (60…).
const waPhone = (raw: string): string => {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("60")) return d;
  if (d.startsWith("0")) return "60" + d.slice(1);
  return "60" + d;
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

    // Send a WhatsApp message (used by the template Test button).
    const number = waPhone(String(body.phone || ""));
    const message = String(body.message || "");
    if (!number) return json(400, { success: false, error: "phone diperlukan" });
    if (!message) return json(400, { success: false, error: "message diperlukan" });

    const form = new URLSearchParams();
    form.append("device_id", instance);
    form.append("number", number);
    form.append("message", message);
    const res = await fetch("https://api.whacenter.com/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const txt = await res.text();
    let sent = res.ok;
    let payload: any = null;
    try { payload = JSON.parse(txt); sent = !!payload.status; } catch { /* keep res.ok */ }
    return json(200, { success: sent, response: payload ?? txt });
  } catch (err) {
    return json(500, { success: false, error: err instanceof Error ? err.message : "error" });
  }
});
