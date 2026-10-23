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
export const OWN_COURIER_READY: Record<OwnCourier, boolean> = { ninjavan: true, poslaju: true, jnt: false };

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

// ---------------------------------------------------------------- Booking (shared shape)
/** Where the parcel ships from — the tenant's Courier Settings (parceldaily_config sender_* + is_dropoff). */
export interface OwnSender {
  name: string; phone: string; email: string;
  line1: string; line2: string; city: string; postcode: string; state: string;
  isDropoff: boolean;
}
export interface OwnBookingInput {
  idSale: string;
  customerName: string; phone: string; email: string;
  address: string; postcode: string; city: string; state: string;
  isCOD: boolean; codAmount: number; contentValue: number;
  description: string; // delivery instructions / item description
  weightKg: number;
}
export interface OwnBookingResult {
  trackingNumber: string;
  /** Stored in customer_purchases.pd_order_id so cancel/print know it is an own-courier booking. */
  orderRef: string;
  waybillUrl: string | null;
}

/** pd_order_id format for own-courier bookings: "own:<courier>:<tracking>". */
export const ownRef = (courier: OwnCourier, tracking: string) => `own:${courier}:${tracking}`;
export function parseOwnRef(ref?: string | null): { courier: OwnCourier; tracking: string } | null {
  const m = /^own:(ninjavan|poslaju|jnt):(.+)$/.exec(String(ref || ""));
  return m ? { courier: m[1] as OwnCourier, tracking: m[2] } : null;
}

/** Malaysian phone → +60… (couriers want the international form). */
export const intlPhoneMY = (raw: string): string => {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("60")) return `+${d}`;
  if (d.startsWith("0")) return `+6${d}`;
  return `+60${d}`;
};
/** Today (+offset days) in Malaysia time, yyyy-MM-dd. */
const myDate = (offsetDays = 0) =>
  new Date(Date.now() + 8 * 3600 * 1000 + offsetDays * 86400 * 1000).toISOString().slice(0, 10);
/** 9-char unique id (Ninja Van requested_tracking_number limit: 1–9 alphanumeric, no prefix). */
const shortId = () => (Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 5)).toUpperCase();
const cut = (s: string, n: number) => String(s || "").slice(0, n);

/** Store a label PDF in the public courier-waybills bucket (unguessable path) and return its URL. */
export async function storeWaybillPdf(service: any, ownerId: string, courier: OwnCourier, tracking: string, pdf: Uint8Array): Promise<string> {
  const path = `${ownerId}/${courier}/${tracking}-${crypto.randomUUID().slice(0, 12)}.pdf`;
  const { error } = await service.storage.from("courier-waybills").upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (error) throw new CourierError(`Gagal simpan waybill: ${error.message}`);
  return service.storage.from("courier-waybills").getPublicUrl(path).data.publicUrl as string;
}

const isPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

// ---------------------------------------------------------------- Ninja Van booking
const nvErr = (j: any, status: number) =>
  j?.error?.message || j?.message || (Array.isArray(j?.error?.details) ? j.error.details.map((d: any) => d.message || d.reason).join("; ") : "") || `HTTP ${status}`;

async function nvFetch(service: any, cfg: OwnCourierConfig, path: string, init: RequestInit): Promise<Response> {
  const go = async (token: string) =>
    fetch(`${ninjavanBase(cfg)}${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  let res = await go(await ninjavanToken(service, cfg));
  if (res.status === 401) res = await go(await ninjavanToken(service, cfg, true)); // token revoked/expired early
  return res;
}

export async function ninjavanWaybillPdf(service: any, cfg: OwnCourierConfig, tracking: string): Promise<Uint8Array> {
  // Documented params first (tid + hide_shipper_details), then the params DFR / Olive Jardin
  // ran in production (tids + h=0) — whichever returns a real PDF.
  const t = encodeURIComponent(tracking);
  let status = 0;
  for (const qs of [`tid=${t}&hide_shipper_details=false`, `tids=${t}&h=0`]) {
    const res = await nvFetch(service, cfg, `/2.0/reports/waybill?${qs}`, { method: "GET", headers: { Accept: "application/pdf" } });
    const bytes = new Uint8Array(await res.arrayBuffer());
    status = res.status;
    if (res.ok && isPdf(bytes)) return bytes;
  }
  throw new CourierError(`Ninja Van waybill belum tersedia (HTTP ${status}).`);
}

export async function ninjavanBook(service: any, cfg: OwnCourierConfig, s: OwnSender, o: OwnBookingInput): Promise<OwnBookingResult> {
  const tz = "Asia/Kuala_Lumpur";
  const addr = (line1: string, line2: string, postcode: string, city: string, state: string) => ({
    address1: cut(line1, 100), address2: cut(line2, 100), country: "MY", postcode: String(postcode || "").trim(), city, state,
  });
  const full = String(o.address || "").trim();
  const parcel_job: Record<string, unknown> = {
    is_pickup_required: !s.isDropoff,
    delivery_start_date: myDate(1),
    delivery_timeslot: { start_time: "09:00", end_time: "22:00", timezone: tz },
    delivery_instructions: cut(o.description, 250),
    dimensions: { weight: Math.max(0.1, Number(o.weightKg) || 0.5) },
  };
  if (!s.isDropoff) {
    Object.assign(parcel_job, {
      pickup_service_type: "Scheduled",
      pickup_service_level: "Standard",
      pickup_date: myDate(0),
      pickup_timeslot: { start_time: "09:00", end_time: "18:00", timezone: tz },
    });
  }
  if (o.isCOD && o.codAmount > 0) {
    parcel_job.cash_on_delivery = Number(o.codAmount.toFixed(2));
    parcel_job.cash_on_delivery_currency = "MYR";
  }
  const body = {
    service_type: "Parcel",
    service_level: "Standard",
    requested_tracking_number: shortId(),
    // Owner's Ninja Van "Bisnes Owner" commission tag — exactly the format DFR / Olive Jardin
    // book with ("BISNESOWNER-DFR" + ID Sale). Don't change it, or the commission stops tracking.
    reference: { merchant_order_number: cut(`BISNESOWNER-DFR${o.idSale || shortId()}`, 60) },
    from: { name: s.name, phone_number: intlPhoneMY(s.phone), email: s.email, address: addr(s.line1, s.line2, s.postcode, s.city, s.state) },
    to: {
      name: o.customerName, phone_number: intlPhoneMY(o.phone), email: o.email,
      address: addr(full.slice(0, 100), full.slice(100, 200), o.postcode, o.city, o.state),
    },
    parcel_job,
  };
  const res = await nvFetch(service, cfg, "/4.2/orders", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  const tracking = json?.tracking_number;
  if (!res.ok || !tracking) throw new CourierError(`Ninja Van: ${nvErr(json, res.status)}`, json);

  // Label right away so print/merge work like ParcelDaily. If Ninja Van isn't ready yet, print fetches it later.
  let waybillUrl: string | null = null;
  try {
    waybillUrl = await storeWaybillPdf(service, cfg.owner_user_id, "ninjavan", tracking, await ninjavanWaybillPdf(service, cfg, tracking));
  } catch (_) { /* backfilled on print */ }
  return { trackingNumber: tracking, orderRef: ownRef("ninjavan", tracking), waybillUrl };
}

export async function ninjavanCancel(service: any, cfg: OwnCourierConfig, tracking: string): Promise<void> {
  const res = await nvFetch(service, cfg, `/2.2/orders/${encodeURIComponent(tracking)}`, { method: "DELETE", headers: { Accept: "application/json" } });
  if (res.ok) return;
  const json: any = await res.json().catch(() => ({}));
  const msg = String(json?.error?.message || json?.message || json?.description || "");
  if (/already.*cancel/i.test(msg) || json?.description === "ORDER_ALREADY_CANCELLED") return;
  throw new CourierError(`Ninja Van cancel: ${msg || `HTTP ${res.status}`} (hanya order "Pending Pickup" boleh dibatalkan).`, json);
}

// ---------------------------------------------------------------- Pos Laju booking
// Order API v2.1 (api-doc.pos.com.my). Same field set DFR booked with in production; address
// lines follow the v2.3 limits (address1 5–80, address2/3 ≤ 80, area ≤ 20).
const posErr = (j: any, status: number) => {
  if (Array.isArray(j?.reason) && j.reason.length) return j.reason.join("; ");
  return j?.error?.description || j?.error?.code || (typeof j?.error === "string" ? j.error : "") ||
    (j?.message && j.message !== "error" ? j.message : "") || `HTTP ${status}`;
};

async function posFetch(service: any, cfg: OwnCourierConfig, path: string, body: unknown): Promise<{ res: Response; json: any }> {
  const go = async (token: string) => fetch(`${poslajuBase(cfg)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  let res = await go(await poslajuToken(service, cfg));
  if (res.status === 401) res = await go(await poslajuToken(service, cfg, true)); // token re-issued early
  const json: any = await res.json().catch(() => ({}));
  return { res, json };
}

/** Split a long address over Pos's 80-char lines. */
const posLines = (full: string) => {
  const s = String(full || "").replace(/\s+/g, " ").trim();
  return [s.slice(0, 80), s.slice(80, 160), s.slice(160, 240)];
};

export async function poslajuBook(service: any, cfg: OwnCourierConfig, s: OwnSender, o: OwnBookingInput): Promise<OwnBookingResult> {
  if (!clean(cfg.account_number) || !clean(cfg.subscription_code)) {
    throw new CourierError("Account Number / Subscription Code Pos Laju belum diisi.");
  }
  const [r1, r2, r3] = posLines(o.address);
  const desc = cut(o.description || "Parcel", 100);
  const body: Record<string, unknown> = {
    account_number: clean(cfg.account_number),
    product_code: "80000000", // Pos Laju domestic
    item_type: "2",           // Parcel
    parcel: "domestic",
    webhook: true,
    service_level: "Standard",
    subscription_code: clean(cfg.subscription_code),
    platform: "API",
    mps: false,
    reference: {
      // 5–50 chars, unique per merchant: a re-book of the same ID Sale needs a new one.
      merchant_order_number: cut(`${o.idSale || "PO"}-${shortId().slice(-5)}`, 50),
      merchant_reference_number: cut(o.idSale || "", 50),
    },
    // Pickup date left out on purpose: Pos assigns the next valid slot from the submission time.
    pickup: s.isDropoff ? { required: false } : { required: true, timeslot: { start_time: "09:00", end_time: "18:00" } },
    sender: {
      display_address: "",
      hide_sender_address: false,
      name: cut(s.name, 100),
      phone_number: intlPhoneMY(s.phone),
      email: s.email,
      address: {
        address1: cut(s.line1, 80), address2: cut(s.line2, 80), area: cut(s.city, 20),
        city: cut(s.city, 35), state: cut(s.state, 50), country: "MY", postcode: String(s.postcode || "").trim(),
      },
    },
    receiver: {
      name: cut(o.customerName, 100),
      phone_number: intlPhoneMY(o.phone),
      email: o.email,
      address: {
        address1: r1, address2: r2, address3: r3, area: cut(o.city, 20),
        city: cut(o.city, 35), state: cut(o.state, 50), country: "MY", postcode: String(o.postcode || "").trim(),
      },
    },
    parcel_details: [{
      weight: Math.min(30, Math.max(0.01, Number(o.weightKg) || 0.5)),
      length: 0.65, width: 0.5, height: 0.75, // DFR production values (domestic dimensions are optional)
      item_count: 1,
      parcel_notes: cut(o.description, 200),
      details: [{ item_description: desc.length >= 3 ? desc : "Parcel", quantity: 1, hscode: "", value: Number(o.contentValue.toFixed(2)) }],
    }],
  };
  if (o.isCOD && o.codAmount > 0) body.added_services = [{ added_code: "COD", amount: o.codAmount.toFixed(2) }];

  const { res, json } = await posFetch(service, cfg, "/api/order/v2.1/create", body);
  const tracking = json?.data?.tracking_no;
  if (!res.ok || !tracking) throw new CourierError(`Pos Laju: ${posErr(json, res.status)}`, json);

  // Pos returns a public label URL. Keep our own copy (stays valid), else use Pos's link.
  const posPdf: string | null = json?.data?.consignment?.pdf || null;
  let waybillUrl: string | null = posPdf;
  if (posPdf) {
    try {
      const r = await fetch(posPdf);
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (r.ok && isPdf(bytes)) waybillUrl = await storeWaybillPdf(service, cfg.owner_user_id, "poslaju", tracking, bytes);
    } catch (_) { /* Pos link is still usable */ }
  }
  return { trackingNumber: tracking, orderRef: ownRef("poslaju", tracking), waybillUrl };
}

export async function poslajuCancel(service: any, cfg: OwnCourierConfig, tracking: string): Promise<void> {
  const { res, json } = await posFetch(service, cfg, "/api/order/v2.1/cancel", {
    tracking_number: tracking, account_number: clean(cfg.account_number),
  });
  if (res.ok && json?.message !== "error") return;
  const msg = posErr(json, res.status);
  if (/already\s+cancel/i.test(msg)) return;
  throw new CourierError(`Pos Laju cancel: ${msg} (hanya order sebelum pickup boleh dibatalkan).`, json);
}

// ---------------------------------------------------------------- Dispatch (by courier)
export async function ownBook(service: any, cfg: OwnCourierConfig, s: OwnSender, o: OwnBookingInput): Promise<OwnBookingResult> {
  if (cfg.courier === "ninjavan") return ninjavanBook(service, cfg, s, o);
  if (cfg.courier === "poslaju") return poslajuBook(service, cfg, s, o);
  throw new CourierError(`Kurier ${cfg.courier} belum disokong untuk tempahan.`);
}
export async function ownCancel(service: any, cfg: OwnCourierConfig, tracking: string): Promise<void> {
  if (cfg.courier === "ninjavan") return ninjavanCancel(service, cfg, tracking);
  if (cfg.courier === "poslaju") return poslajuCancel(service, cfg, tracking);
  throw new CourierError(`Batal ${cfg.courier} belum disokong.`);
}
/**
 * Label for an existing booking (print-time backfill): the copy saved at booking if there is one
 * (callers like WooCommerce / Integration don't keep the link), else fetched from the courier.
 */
export async function ownWaybillUrl(service: any, cfg: OwnCourierConfig, tracking: string): Promise<string> {
  const folder = `${cfg.owner_user_id}/${cfg.courier}`;
  const { data: saved } = await service.storage.from("courier-waybills")
    .list(folder, { search: `${tracking}-`, limit: 1, sortBy: { column: "created_at", order: "desc" } });
  if (saved?.length && saved[0]?.name) {
    return service.storage.from("courier-waybills").getPublicUrl(`${folder}/${saved[0].name}`).data.publicUrl as string;
  }
  if (cfg.courier === "ninjavan") {
    return storeWaybillPdf(service, cfg.owner_user_id, "ninjavan", tracking, await ninjavanWaybillPdf(service, cfg, tracking));
  }
  // Pos Laju only hands out the label at booking; there is no label endpoint to re-fetch.
  throw new CourierError(`Waybill ${cfg.courier} tidak dapat dimuat semula.`);
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
