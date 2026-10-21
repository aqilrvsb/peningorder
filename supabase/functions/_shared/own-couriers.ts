// deno-lint-ignore-file no-explicit-any
// BYOC ("Bring Your Courier") adapters: book with the tenant's OWN courier accounts instead of
// ParcelDaily. Shared by parceldaily-order / parceldaily-cancel (the only booking + cancel entry
// points), own-courier-test and courier-webhook. Built from the couriers' official docs:
//   Ninja Van  https://api-docs.ninjavan.co (OpenAPI)  — sandbox is ONLY api-sandbox.ninjavan.co/sg
//   Pos Laju   https://api-doc.pos.com.my (Postman)    — staging api-dev.pos.com.my
// Credentials live in public.own_courier_config (owner-only RLS); OAuth tokens are cached in
// public.own_courier_tokens (service role only). Callers pass a service-role Supabase client.

export type OwnCourier = "ninjavan" | "poslaju" | "jnt";
export const OWN_COURIERS: OwnCourier[] = ["ninjavan", "poslaju", "jnt"];

export interface OwnCourierConfig {
  id: string;
  owner_user_id: string;
  courier: OwnCourier;
  enabled: boolean;
  environment: "sandbox" | "production";
  client_id: string | null;
  client_secret: string | null;
  account_number: string | null;
  subscription_code: string | null;
  api_account: string | null;
  private_key: string | null;
  customer_code: string | null;
  password: string | null;
  webhook_token: string;
}

/** Couriers whose booking adapter is live. The settings UI marks the rest "Akan datang". */
export const OWN_COURIER_READY: Record<OwnCourier, boolean> = { ninjavan: true, poslaju: false, jnt: false };

export class CourierError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
  }
}

const clean = (v: unknown) => String(v ?? "").trim();

export async function loadOwnCourierConfig(service: any, ownerUserId: string, courier: OwnCourier): Promise<OwnCourierConfig | null> {
  const { data } = await service.from("own_courier_config").select("*")
    .eq("owner_user_id", ownerUserId).eq("courier", courier).maybeSingle();
  return (data as OwnCourierConfig) || null;
}

/** Tenant's provider: the owner's plan decides (plan 'byoc' → own couriers, never ParcelDaily). */
export async function providerOf(service: any, ownerUserId: string): Promise<"own" | "parceldaily"> {
  const { data } = await service.from("profiles").select("plan").eq("id", ownerUserId).maybeSingle();
  return data?.plan === "byoc" ? "own" : "parceldaily";
}

// ---------------------------------------------------------------- OAuth token cache
async function cachedToken(service: any, cfg: OwnCourierConfig): Promise<string | null> {
  const { data } = await service.from("own_courier_tokens").select("access_token, expires_at")
    .eq("owner_user_id", cfg.owner_user_id).eq("courier", cfg.courier).maybeSingle();
  if (data?.access_token && new Date(data.expires_at).getTime() > Date.now()) return data.access_token;
  return null;
}
async function storeToken(service: any, cfg: OwnCourierConfig, token: string, expiresInSec: number) {
  // Refresh 5 minutes early so a request never goes out with a token about to expire.
  const expiresAt = new Date(Date.now() + Math.max(60, expiresInSec - 300) * 1000).toISOString();
  await service.from("own_courier_tokens").upsert(
    { owner_user_id: cfg.owner_user_id, courier: cfg.courier, access_token: token, expires_at: expiresAt, updated_at: new Date().toISOString() },
    { onConflict: "owner_user_id,courier" },
  );
}
export async function dropToken(service: any, cfg: OwnCourierConfig) {
  await service.from("own_courier_tokens").delete().eq("owner_user_id", cfg.owner_user_id).eq("courier", cfg.courier);
}

// ---------------------------------------------------------------- Ninja Van
export const ninjavanBase = (cfg: OwnCourierConfig) =>
  cfg.environment === "sandbox" ? "https://api-sandbox.ninjavan.co/sg" : "https://api.ninjavan.co/my";

async function ninjavanNewToken(cfg: OwnCourierConfig): Promise<{ token: string; expiresIn: number }> {
  if (!clean(cfg.client_id) || !clean(cfg.client_secret)) throw new CourierError("Client ID / Client Secret Ninja Van belum diisi.");
  const res = await fetch(`${ninjavanBase(cfg)}/2.0/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clean(cfg.client_id), client_secret: clean(cfg.client_secret), grant_type: "client_credentials" }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json?.access_token) {
    throw new CourierError(`Ninja Van login gagal (HTTP ${res.status}): ${json?.error?.message || json?.message || "semak Client ID / Secret dan Sandbox/Production."}`, json);
  }
  return { token: json.access_token, expiresIn: Number(json.expires_in) || 3600 };
}

export async function ninjavanToken(service: any, cfg: OwnCourierConfig, forceNew = false): Promise<string> {
  if (!forceNew) {
    const cached = await cachedToken(service, cfg);
    if (cached) return cached;
  }
  const { token, expiresIn } = await ninjavanNewToken(cfg);
  await storeToken(service, cfg, token, expiresIn);
  return token;
}

// ---------------------------------------------------------------- Pos Laju
export const poslajuBase = (cfg: OwnCourierConfig) =>
  cfg.environment === "sandbox" ? "https://api-dev.pos.com.my" : "https://posapi.pos.com.my";

async function poslajuNewToken(cfg: OwnCourierConfig): Promise<{ token: string; expiresIn: number }> {
  if (!clean(cfg.client_id) || !clean(cfg.client_secret)) throw new CourierError("Client ID / Client Secret Pos Laju belum diisi.");
  const body = new URLSearchParams({ client_id: clean(cfg.client_id), client_secret: clean(cfg.client_secret), grant_type: "client_credentials" });
  const res = await fetch(`${poslajuBase(cfg)}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json?.access_token) {
    throw new CourierError(`Pos Laju login gagal (HTTP ${res.status}): ${json?.error?.description || json?.error || json?.message || "semak Client ID / Secret dan Staging/Production."}`, json);
  }
  return { token: json.access_token, expiresIn: Number(json.expires_in) || 86400 };
}

export async function poslajuToken(service: any, cfg: OwnCourierConfig, forceNew = false): Promise<string> {
  if (!forceNew) {
    const cached = await cachedToken(service, cfg);
    if (cached) return cached;
  }
  const { token, expiresIn } = await poslajuNewToken(cfg);
  await storeToken(service, cfg, token, expiresIn);
  return token;
}

// ---------------------------------------------------------------- Test connection
/** Proves the credentials work without creating a shipment (OAuth login only). */
export async function testConnection(service: any, cfg: OwnCourierConfig): Promise<string> {
  if (cfg.courier === "ninjavan") {
    await ninjavanToken(service, cfg, true);
    return `Berjaya login Ninja Van (${cfg.environment === "sandbox" ? "Sandbox" : "Production"}).`;
  }
  if (cfg.courier === "poslaju") {
    if (!clean(cfg.account_number)) throw new CourierError("Account Number Pos Laju belum diisi.");
    if (!clean(cfg.subscription_code)) throw new CourierError("Subscription Code Pos Laju belum diisi.");
    await poslajuToken(service, cfg, true);
    return `Berjaya login Pos Laju (${cfg.environment === "sandbox" ? "Staging" : "Production"}).`;
  }
  throw new CourierError("J&T belum disokong — menunggu akses J&T Open Platform.");
}
