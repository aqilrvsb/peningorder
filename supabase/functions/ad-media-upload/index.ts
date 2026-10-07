// ad-media-upload — mints a signed upload URL for the public `ad-media` bucket
// (ad videos/thumbnails that Meta Ads pulls by URL).
//
// POST { path }  with header x-upload-key = platform_secrets.ad_media_upload.secret
// -> { signed_url, public_url }. PUT the file bytes to signed_url.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: sec } = await admin.from("platform_secrets").select("value").eq("key", "ad_media_upload").maybeSingle();
  // deno-lint-ignore no-explicit-any
  const expected = (sec?.value as any)?.secret || "";
  const key = req.headers.get("x-upload-key") || "";
  if (!expected || key !== expected) return json(401, { error: "unauthorized" });

  const body = await req.json().catch(() => ({}));
  const path = String(body?.path || "");
  if (!/^[a-z0-9][a-z0-9/_.-]{2,120}\.(mp4|jpg|jpeg|png)$/i.test(path) || path.includes("..")) return json(400, { error: "invalid_path" });

  const { data, error } = await admin.storage.from("ad-media").createSignedUploadUrl(path, { upsert: true });
  if (error) return json(500, { error: error.message });
  const public_url = admin.storage.from("ad-media").getPublicUrl(path).data.publicUrl;
  return json(200, { signed_url: data.signedUrl, public_url });
});
