/**
 * channel-webhook — inbound orders from OnPay & Convertly (and any generic
 * form/salespage source). Public (no JWT). Keyed by ?marketer_id=<idstaff>.
 *
 *   POST /channel-webhook?marketer_id=PO-0002&channel=onpay
 *   POST /channel-webhook?marketer_id=PO-0002&channel=convertly
 *
 * Creates a PENDING customer_purchases row scoped to the tenant (owner_user_id
 * looked up from idstaff), kurier = the tenant's default courier. Tracking +
 * cost are handled later in the Order tab, matching the woocommerce-webhook
 * flow. Fields are matched flexibly because OnPay/Convertly post flat
 * Malay/English form fields.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function pick(obj: any, keys: string[]): string {
  for (const k of keys) {
    let v: any = obj;
    for (const p of k.split(".")) { v = v?.[p]; if (v == null) break; }
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}
function detectCOD(...vals: string[]): boolean {
  return /\bcod\b|cash on delivery|bayar semasa terima|tunai/.test(vals.join(" ").toLowerCase());
}
function formatPhone(phone: string): string {
  let f = (phone || "").replace(/\D/g, "");
  if (f.startsWith("0")) f = "6" + f;
  else if (!f.startsWith("60") && f.length >= 9) f = "60" + f;
  return f;
}
function malaysiaDate(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().split("T")[0];
}

function normalize(data: any) {
  const d = (data && typeof data === "object" && (data.data || data.order || data.sale)) ? (data.data || data.order || data.sale) : data;
  const payMethod = pick(d, ["payment_method", "payment", "method", "gateway", "cara_bayaran", "jenis_bayaran", "type"]);
  const isCOD = detectCOD(payMethod);
  return {
    platformOrderId: pick(d, ["id", "order_id", "sale_id", "reference", "ref", "invoice", "no_resit"]),
    name: pick(d, ["name", "nama", "customer_name", "full_name", "fullname", "buyer_name", "nama_penuh", "customer.name"]) || "Customer",
    phone: formatPhone(pick(d, ["phone", "telefon", "phone_number", "no_telefon", "notelefon", "contact", "hp", "mobile", "customer.phone"])),
    address: pick(d, ["address", "alamat", "address1", "alamat_penuh", "shipping_address", "street", "customer.address"]),
    city: pick(d, ["city", "bandar", "daerah", "town", "customer.city"]),
    state: pick(d, ["state", "negeri", "customer.state"]),
    postcode: pick(d, ["postcode", "poskod", "zip", "zipcode", "postal_code", "customer.postcode"]),
    total: Number(pick(d, ["total", "amount", "jumlah", "total_price", "price", "grand_total", "total_amount", "harga"]).replace(/[^0-9.]/g, "")) || 0,
    product: pick(d, ["product", "produk", "product_name", "item", "items", "nama_produk", "package", "pakej", "offer"]) || "Product",
    quantity: Number(pick(d, ["quantity", "qty", "kuantiti", "unit", "bilangan"])) || 1,
    isCOD,
  };
}

const COURIER_LABELS: Record<string, string> = { ninjavan: "Ninjavan", poslaju: "Poslaju", jnt: "JNT", dhl: "DHL" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const startTime = Date.now();
  const url = new URL(req.url);
  const marketerIdStaff = url.searchParams.get("marketer_id");
  const channel = (url.searchParams.get("channel") || "onpay").toLowerCase();

  try {
    const raw = await req.text();
    if (!raw || !raw.trim()) return json(200, { success: true, message: "Webhook endpoint is active" });
    let body: any;
    try { body = JSON.parse(raw); } catch { return json(200, { success: true, message: "Webhook endpoint is active" }); }

    if (!marketerIdStaff) return json(400, { error: "marketer_id (idstaff) is required as query parameter" });

    const { data: owner } = await supabase.from("profiles").select("id").eq("idstaff", marketerIdStaff).maybeSingle();
    if (!owner) return json(400, { error: `No account found with idstaff: ${marketerIdStaff}` });

    const order = normalize(body);

    const { data: pdConfig } = await supabase.from("parceldaily_config").select("default_courier").eq("owner_user_id", owner.id).maybeSingle();
    const defaultCourier = (pdConfig?.default_courier || "poslaju").toLowerCase();
    const courierLabel = COURIER_LABELS[defaultCourier] || "Poslaju";

    let idSale = "";
    try { const { data } = await supabase.rpc("generate_sale_id"); idSale = data || ""; } catch { /* fallback below */ }
    if (!idSale) idSale = `ON-${Date.now().toString().slice(-8)}`;

    const dateOrder = malaysiaDate();
    const insertData: Record<string, unknown> = {
      id_sale: idSale,
      date_order: dateOrder,
      marketer_id_staff: marketerIdStaff,
      total_sale: order.total,
      unit: order.quantity,
      tracking_number: "",
      delivery_status: "Pending",
      jenis_platform: "Facebook",
      jenis_customer: "NP",
      jenis_closing: "Website",
      name_customer: order.name,
      phone_customer: order.phone,
      address_customer: order.address,
      city_customer: order.city,
      postcode_customer: order.postcode,
      state_customer: order.state,
      kurier: `${courierLabel} ${order.isCOD ? "COD" : "CASH"}`,
      type_payment: order.isCOD ? "COD" : "CASH",
      date_payment: order.isCOD ? null : dateOrder,
      nota_staff: order.product,
      owner_user_id: owner.id,
      seos: "Pending",
    };

    const { data: newOrder, error: insertError } = await supabase.from("customer_purchases").insert(insertData).select("id, id_sale").single();

    try {
      await supabase.from("webhook_logs").insert({
        webhook_type: channel,
        request_method: "POST",
        request_body: body,
        parsed_data: { marketerIdStaff, ...order },
        error_message: insertError?.message || null,
        response_status: insertError ? 500 : 200,
        processing_time_ms: Date.now() - startTime,
      });
    } catch (_) { /* logging is best-effort */ }

    if (insertError) return json(500, { error: "Failed to create order", details: insertError.message });
    return json(200, { success: true, order_id: newOrder?.id, id_sale: newOrder?.id_sale, channel });
  } catch (e) {
    console.error("channel-webhook fatal:", e);
    return json(500, { error: String((e as Error).message || e) });
  }
});
