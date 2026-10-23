// deno-lint-ignore-file no-explicit-any
// admin-login-as — superadmin "log in as client" (Admin → Clients, click the email).
// Same technique as PeningBot's admin-login-as-user: create a one-time magic link for the client
// with the admin API and exchange it for a real session right here (no email is sent). The
// browser keeps the superadmin's own session aside and switches back with "Kembali ke Admin".
// POST { userId }   (caller JWT must be a superadmin)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const noPersist = { auth: { autoRefreshToken: false, persistSession: false } };

    // 1) Caller must be a superadmin.
    const caller = createClient(url, anon, { ...noPersist, global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Sila log masuk semula." });
    const { data: isSuper } = await caller.rpc("is_superadmin");
    if (isSuper !== true) return json({ error: "Hanya superadmin boleh log masuk sebagai client." });

    const { userId } = await req.json().catch(() => ({}));
    if (!userId || typeof userId !== "string") return json({ error: "userId diperlukan." });
    if (userId === user.id) return json({ error: "Itu akaun anda sendiri." });

    // 2) Target: an existing, non-superadmin account.
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, noPersist);
    const { data: target, error: targetErr } = await admin.auth.admin.getUserById(userId);
    const email = target?.user?.email;
    if (targetErr || !email) return json({ error: "Client tidak dijumpai." });
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    if ((roles || []).some((r: any) => String(r.role) === "superadmin")) return json({ error: "Tidak boleh log masuk sebagai superadmin." });

    // 3) One-time magic link → session (no email sent).
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = (link as any)?.properties?.hashed_token;
    if (linkErr || !tokenHash) return json({ error: `Gagal jana sesi: ${linkErr?.message || "tiada token"}` });
    const pub = createClient(url, anon, noPersist);
    const { data: verified, error: verifyErr } = await pub.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    const session = verified?.session;
    if (verifyErr || !session) return json({ error: `Gagal jana sesi: ${verifyErr?.message || "tiada sesi"}` });

    console.log(`[admin-login-as] superadmin ${user.email} -> ${email}`);
    return json({ success: true, email, access_token: session.access_token, refresh_token: session.refresh_token });
  } catch (e) {
    return json({ error: (e as Error).message || String(e) });
  }
});
