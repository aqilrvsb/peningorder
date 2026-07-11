// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
// Return 200 with { error } on application failures so callers can read the message
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: jsonHeaders });
const fail = (error: string, extra?: Record<string, unknown>) =>
  new Response(JSON.stringify({ error, ...(extra || {}) }), {
    status: 200,
    headers: jsonHeaders,
  });

type Courier = "ninjavan" | "poslaju" | "jnt" | "dhl";

interface OrderData {
  idSale?: string;
  customerName: string;
  phone: string;
  email?: string;
  address: string;
  postcode: string;
  city: string;
  state: string;
  price: number;
  weight?: number;
  paymentMethod?: string; // "COD" | "CASH"
  caraBayaran?: string;
  productName?: string;
  produk?: string;
  content?: string;
  courier?: Courier;
  serviceProvider?: Courier;
  isDropoff?: boolean;
  isNotify?: string; // "SMS" | "WhatsApp"
  isReschedule?: string; // "WhatsApp"
  marketerIdStaff?: string;
}

const clean = (v: unknown, fallback = ""): string => {
  if (v === null || v === undefined) return fallback;
  return String(v).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim() || fallback;
};

// Parcel Daily wants phone WITHOUT country code, digits only (e.g. "171425324")
const normalizeLocalPhone = (raw: string): string => {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("60")) return digits.slice(2);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
};

const SUPPORTED_COURIERS: Courier[] = ["ninjavan", "poslaju", "jnt", "dhl"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    // Build supabase client with the caller's JWT so RLS applies (multi-tenant).
    // Config lookup respects owner_user_id = auth.uid() automatically.
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify caller is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return fail("Not authenticated. Sign in and try again.");
    }

    const orderData: OrderData = await req.json();

    // Resolve courier
    const courier = (orderData.courier || orderData.serviceProvider || "poslaju").toLowerCase() as Courier;
    if (!SUPPORTED_COURIERS.includes(courier)) {
      return fail(`Unsupported courier '${courier}'. Use one of: ${SUPPORTED_COURIERS.join(", ")}`);
    }

    // Load Parcel Daily config
    const { data: config, error: configError } = await supabase
      .from("parceldaily_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (configError || !config) {
      console.error("Parcel Daily config not found:", configError);
      return fail("Parcel Daily configuration not found. Please configure in Settings.");
    }

    const apiBase =
      (config.environment || "sandbox") === "production"
        ? "https://api.parceldaily.com"
        : "https://api.sandbox.parceldaily.com";

    // Build addresses
    const senderPhone = normalizeLocalPhone(clean(config.sender_phone));
    const receiverPhone = normalizeLocalPhone(clean(orderData.phone));

    const rawAddress = clean(orderData.address);
    const line1 = rawAddress.slice(0, 200);
    const line2 = rawAddress.length > 200 ? rawAddress.slice(200, 400) : "";

    const paymentMethod = clean(orderData.paymentMethod || orderData.caraBayaran).toUpperCase();
    const isCOD = paymentMethod === "COD";
    const codAmount = isCOD ? Math.max(0, Math.round(Number(orderData.price) || 0)) : undefined;

    const contentDescription =
      clean(orderData.content) ||
      clean(orderData.productName) ||
      clean(orderData.produk) ||
      "Parcel";
    const contentValue = Number(orderData.price) || 0;

    // Notify features require receiver email. Account may force notifications on,
    // so fall back to sender email (or a safe default) if none provided.
    const receiverEmail =
      clean(orderData.email) ||
      clean(config.sender_email) ||
      "noreply@peningorder.local";

    const senderAddress = {
      fullName: clean(config.sender_name),
      countryCode: clean(config.sender_country_code, "+60"),
      phone: senderPhone,
      email: clean(config.sender_email),
      line1: clean(config.sender_line1),
      line2: clean(config.sender_line2),
      city: clean(config.sender_city),
      postcode: clean(config.sender_postcode),
      state: clean(config.sender_state),
      country: clean(config.sender_country, "Malaysia"),
    };
    const receiverAddress = {
      fullName: clean(orderData.customerName, "Customer"),
      countryCode: "+60",
      phone: receiverPhone,
      email: receiverEmail,
      line1: line1 || "-",
      line2,
      city: clean(orderData.city),
      postcode: clean(orderData.postcode),
      state: clean(orderData.state),
      country: "Malaysia",
    };

    const kg = Number(orderData.weight) || 0.5;

    const authHeadersEarly = {
      "Content-Type": "application/json",
      token: config.token,
      merchantid: config.merchant_id,
    };

    // 0) Pricing quote — Parcel Daily validates order.price against their quote.
    //    Quote endpoint takes just postcodes+weight and returns prices for every courier.
    //    IMPORTANT: pass ALL params that affect price (isNotify, isReschedule, isNextDayRemittance)
    //    or the create endpoint's calculated price will differ.
    const notifyValue = orderData.isNotify ?? config.is_notify ?? "SMS";
    const rescheduleValue =
      (courier === "dhl" || courier === "jnt" || courier === "ninjavan")
        ? (orderData.isReschedule || null)
        : null;
    const nextDayRemit = isCOD ? Boolean(config.is_next_day_remittance) : null;

    const quotePayload: Record<string, unknown> = {
      origin: clean(config.sender_postcode),
      destination: clean(orderData.postcode),
      originCountry: clean(config.sender_country, "Malaysia"),
      destinationCountry: "Malaysia",
      weight: kg,
    };
    if (isCOD) quotePayload.cod = codAmount;
    if (notifyValue) quotePayload.isNotify = notifyValue;
    if (rescheduleValue) quotePayload.isReschedule = rescheduleValue;
    if (nextDayRemit !== null) quotePayload.isNextDayRemittance = nextDayRemit;

    const quoteRes = await fetch(`${apiBase}/v1/partner/merchant/quote`, {
      method: "POST",
      headers: authHeadersEarly,
      body: JSON.stringify(quotePayload),
    });
    const quoteText = await quoteRes.text();
    let quoteResult: any;
    try {
      quoteResult = JSON.parse(quoteText);
    } catch {
      quoteResult = { raw: quoteText };
    }
    console.log(
      `[parceldaily] quote status=${quoteRes.status} body=${quoteText.slice(0, 500)}`,
    );

    if (!quoteRes.ok) {
      const msg =
        quoteResult?.message ||
        (typeof quoteResult?.error === "string" ? quoteResult.error : null) ||
        JSON.stringify(quoteResult?.error || {}) ||
        `Quote failed (HTTP ${quoteRes.status})`;
      return fail(`Parcel Daily quote: ${msg}`, { details: quoteResult, courier });
    }

    // Extract per-courier price. Response shape: { success: { <courier>Price: "10.00", ... } }
    const quoteRoot = quoteResult?.success || quoteResult?.data || quoteResult;
    const priceKey = `${courier}Price`;
    const rawPrice = quoteRoot?.[priceKey];
    const shippingPrice = rawPrice != null ? Number(rawPrice) : NaN;
    if (!isFinite(shippingPrice)) {
      return fail(
        `Parcel Daily quote: no price returned for courier '${courier}' (key=${priceKey})`,
        { details: quoteResult, courier },
      );
    }

    const createPayload: Record<string, unknown> = {
      serviceProvider: courier,
      pickupAddress: senderAddress,
      clientAddress: receiverAddress,
      kg,
      price: shippingPrice, // MUST match quote API
      content: contentDescription,
      content_value: contentValue,
      contentValueCurrency: "MYR",
      isDropoff: orderData.isDropoff ?? false,
      isNotify: notifyValue,
    };
    // Ninjavan requires a quantity field
    if (courier === "ninjavan") {
      (createPayload as any).quantity = 1;
    }

    if (isCOD) {
      createPayload.cod = codAmount;
      createPayload.isNextDayRemittance = Boolean(config.is_next_day_remittance);
    }
    // Reschedule notify only supported for dhl / jnt / ninjavan
    if (
      (courier === "dhl" || courier === "jnt" || courier === "ninjavan") &&
      orderData.isReschedule
    ) {
      (createPayload as any).isReschdule = orderData.isReschedule; // Parcel Daily uses this spelling
    }

    const authHeaders = authHeadersEarly;

    // 1) Create Order (adds to cart, returns orderId)
    const createRes = await fetch(`${apiBase}/v1/partner/order/create`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(createPayload),
    });
    const createText = await createRes.text();
    let createResult: any;
    try {
      createResult = JSON.parse(createText);
    } catch {
      createResult = { raw: createText };
    }
    console.log(
      `[parceldaily] create status=${createRes.status} body=${createText.slice(0, 500)}`,
    );

    if (!createRes.ok) {
      const msg =
        createResult?.message ||
        createResult?.error ||
        `Create failed (HTTP ${createRes.status})`;
      return fail(`Parcel Daily create: ${msg}`, { details: createResult, courier });
    }

    // Extract orderId from response (Parcel Daily returns { success: { objectId: "..." } })
    const orderId =
      createResult?.success?.objectId ||
      createResult?.success?.orderId ||
      createResult?.data?.orderId ||
      createResult?.data?.id ||
      createResult?.orderId ||
      createResult?.id;
    if (!orderId) {
      return fail("Parcel Daily create: response missing orderId", {
        details: createResult,
      });
    }

    // 2) Checkout Order (pay + book the shipment)
    // NOTE: PD's pay endpoint sometimes returns HTTP 400 / times out even though
    // the checkout actually succeeded server-side (observed on dhl/ninjavan).
    // So on failure we retry once — if the retry says "already been checked out",
    // the original pay DID succeed and we treat it as success.
    const doPay = async (): Promise<{ ok: boolean; result: any; status: number }> => {
      const res = await fetch(`${apiBase}/v1/partner/order/pay`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ orderId }),
      });
      const txt = await res.text();
      let result: any;
      try {
        result = JSON.parse(txt);
      } catch {
        result = { raw: txt };
      }
      console.log(`[parceldaily] pay status=${res.status} body=${txt.slice(0, 300)}`);
      return { ok: res.ok, result, status: res.status };
    };

    let pay = await doPay();
    if (!pay.ok) {
      await new Promise((r) => setTimeout(r, 2000));
      const retry = await doPay();
      const alreadyPaid = String(retry.result?.message || "").toLowerCase().includes("already been checked out");
      if (retry.ok || alreadyPaid) {
        pay = { ok: true, result: retry.ok ? retry.result : { data: { status: "checkout_pending" } }, status: 200 };
      } else {
        const msg =
          retry.result?.message ||
          retry.result?.error ||
          `Checkout failed (HTTP ${retry.status})`;
        return fail(`Parcel Daily checkout: ${msg}`, {
          details: retry.result,
          orderId,
          courier,
        });
      }
    }
    const payResult = pay.result;

    // After pay, tracking number arrives via Checkout Webhook (async).
    // Return orderId immediately; caller stores it and waits for webhook to fill tracking.
    return ok({
      success: true,
      orderId,
      courier,
      shippingPrice, // caller stores this in customer_purchases.cost_postage
      status: payResult?.data?.status || "checkout_pending",
      message:
        "Order created and checked out. Tracking number will arrive via webhook.",
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    console.error("Error in parceldaily-order function:", err);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
