import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wc-webhook-signature, x-wc-webhook-source, x-wc-webhook-topic, x-wc-webhook-resource, x-wc-webhook-event, x-wc-webhook-id, x-wc-webhook-delivery-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const NINJAVAN_API = 'https://api.ninjavan.co/my';

// WooCommerce Order interface
interface WooOrder {
  id: number;
  status: string;
  currency: string;
  total: string;
  billing: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
    phone: string;
    email: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
    phone: string;
  };
  payment_method: string;
  payment_method_title: string;
  line_items: Array<{
    name: string;
    quantity: number;
    total: string;
    sku: string;
  }>;
  date_created: string;
}

// Shoppego Order interface (based on their webhook docs)
interface ShoppegoOrder {
  checkout: {
    id: string;
    domain: string;
    url: string;
    currency: string;
    total: number;
    shipping: number;
    rate: number;
    completed_at: string;
    created_at: string;
    customer: {
      first_name: string;
      last_name: string;
      phone: string;
      email: string;
    };
    shipping_address: {
      first_name: string;
      last_name: string;
      phone: string;
      email: string;
      address1: string;
      address2: string;
      zip: string;
      city: string;
      state: string;
    };
    items: Array<{
      product: {
        name: string;
        sku: string;
      };
      name: string;
      price: number;
      quantity: number;
      subtotal: number;
    }>;
  };
}

// Normalized order data (common format for both platforms)
interface NormalizedOrder {
  platformOrderId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  totalPrice: number;
  paymentMethod: string;
  productNames: string;
  sku: string;
  quantity: number;
}

// Verify WooCommerce webhook signature
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  try {
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('base64');
    return signature === expectedSignature;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// Get valid NinjaVan access token
async function getNinjavanToken(supabase: any): Promise<string | null> {
  try {
    // Get NinjaVan config (global config)
    const { data: config, error: configError } = await supabase
      .from('ninjavan_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (configError || !config) {
      console.error('NinjaVan config not found:', configError);
      return null;
    }

    const now = new Date();

    // Check for valid (non-expired) token
    const { data: tokenData } = await supabase
      .from('ninjavan_tokens')
      .select('*')
      .gt('expires_at', now.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenData && tokenData.access_token) {
      console.log('Using existing NinjaVan token');
      return tokenData.access_token;
    }

    // Get new token from NinjaVan OAuth
    console.log('Getting new NinjaVan token');
    const authResponse = await fetch(`${NINJAVAN_API}/2.0/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.client_id,
        client_secret: config.client_secret,
        grant_type: 'client_credentials'
      })
    });

    if (!authResponse.ok) {
      console.error('NinjaVan auth failed');
      return null;
    }

    const authData = await authResponse.json();
    const accessToken = authData.access_token;
    const expiresIn = authData.expires_in || 3600;

    // Store token
    const expiresAt = new Date(now.getTime() + ((expiresIn - 300) * 1000));
    await supabase.from('ninjavan_tokens').insert({
      access_token: accessToken,
      expires_at: expiresAt.toISOString()
    });

    return accessToken;
  } catch (error) {
    console.error('Error getting NinjaVan token:', error);
    return null;
  }
}

// Create NinjaVan order
async function createNinjavanOrder(
  supabase: any,
  config: any,
  orderData: {
    idSale: string;
    customerName: string;
    phone: string;
    address: string;
    postcode: string;
    city: string;
    state: string;
    price: number;
    paymentMethod: string;
    bundleSku: string;
    quantity: number;
    nota: string;
    marketerIdStaff: string;
    weight: number;
  }
): Promise<{ success: boolean; trackingNumber?: string; error?: string }> {
  try {
    const accessToken = await getNinjavanToken(supabase);
    if (!accessToken) {
      return { success: false, error: 'Failed to get NinjaVan access token' };
    }

    // Prepare address
    let address1 = orderData.address;
    let address2 = '';
    if (orderData.address.length > 100) {
      address1 = orderData.address.substring(0, 100);
      address2 = orderData.address.substring(100, 200);
    }

    // Calculate dates in Malaysia timezone (UTC+8)
    const nowUTC = new Date();
    const malaysiaOffset = 8 * 60 * 60 * 1000;
    const malaysiaTime = new Date(nowUTC.getTime() + malaysiaOffset);
    const pickupDate = malaysiaTime.toISOString().split('T')[0];
    const deliveryTime = new Date(malaysiaTime.getTime() + 2 * 24 * 60 * 60 * 1000);
    const deliveryDate = deliveryTime.toISOString().split('T')[0];

    // COD amount (only for COD payments)
    const codAmount = orderData.paymentMethod === 'COD' ? Math.round(orderData.price) : 0;

    // Format: SKU - unit, id_staff, nota
    const deliveryInstructions = `${orderData.bundleSku} - ${orderData.quantity}, ${orderData.marketerIdStaff}, ${orderData.nota}`;

    const ninjavanPayload = {
      service_type: "Parcel",
      service_level: "Standard",
      requested_tracking_number: orderData.idSale,
      reference: {
        merchant_order_number: `BISNESOWNER-DFR${orderData.idSale}`
      },
      from: {
        name: config.sender_name,
        phone_number: config.sender_phone,
        email: config.sender_email,
        address: {
          address1: config.sender_address1,
          address2: config.sender_address2 || '',
          country: "MY",
          postcode: config.sender_postcode,
          city: config.sender_city,
          state: config.sender_state
        }
      },
      to: {
        name: orderData.customerName,
        phone_number: orderData.phone,
        address: {
          address1: address1,
          address2: address2,
          country: "MY",
          postcode: orderData.postcode,
          city: orderData.city,
          state: orderData.state
        }
      },
      parcel_job: {
        is_pickup_required: true,
        pickup_service_type: "Scheduled",
        pickup_service_level: "Standard",
        pickup_date: pickupDate,
        pickup_timeslot: {
          start_time: "09:00",
          end_time: "18:00",
          timezone: "Asia/Kuala_Lumpur"
        },
        pickup_approx_volume: "Half-Van Load",
        delivery_start_date: deliveryDate,
        delivery_timeslot: {
          start_time: "09:00",
          end_time: "18:00",
          timezone: "Asia/Kuala_Lumpur"
        },
        delivery_instructions: deliveryInstructions,
        cash_on_delivery: codAmount,
        insured_value: Math.round(orderData.price),
        dimensions: {
          weight: orderData.weight
        }
      }
    };

    console.log('Sending to NinjaVan:', JSON.stringify(ninjavanPayload));

    const orderResponse = await fetch(`${NINJAVAN_API}/4.1/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(ninjavanPayload)
    });

    const orderResult = await orderResponse.json();
    console.log('NinjaVan response:', orderResult);

    if (!orderResponse.ok) {
      return {
        success: false,
        error: orderResult.message || 'Failed to create NinjaVan order'
      };
    }

    return {
      success: true,
      trackingNumber: orderResult.tracking_number
    };
  } catch (error: any) {
    console.error('NinjaVan order error:', error);
    return { success: false, error: error.message };
  }
}

// Send WhatsApp message using Whacenter API
async function sendWhatsAppMessage(
  supabase: any,
  marketerIdStaff: string,
  customerPhone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get marketer's device settings
    const { data: marketer } = await supabase
      .from('profiles')
      .select('id')
      .eq('idstaff', marketerIdStaff)
      .single();

    if (!marketer) {
      return { success: false, error: 'Marketer not found' };
    }

    const { data: deviceSetting } = await supabase
      .from('device_setting')
      .select('*')
      .eq('user_id', marketer.id)
      .eq('status_wa', 'connected')
      .maybeSingle();

    if (!deviceSetting) {
      console.log('No connected WhatsApp device for marketer');
      return { success: false, error: 'No connected WhatsApp device' };
    }

    // Use instance field for Whacenter API
    const instanceId = deviceSetting.instance || deviceSetting.device_id;
    if (!instanceId) {
      console.log('No instance ID found in device settings');
      return { success: false, error: 'No WhatsApp instance ID configured' };
    }

    console.log('Sending WhatsApp via Whacenter:', { instance: instanceId, phone: customerPhone });

    // Send message via Whacenter API (GET method with query params)
    const apiUrl = `https://api.whacenter.com/api/send?device_id=${encodeURIComponent(instanceId)}&number=${encodeURIComponent(customerPhone)}&message=${encodeURIComponent(message)}`;

    const response = await fetch(apiUrl, { method: 'GET' });
    const data = await response.json();

    console.log('Whacenter response:', data);

    // Check if actually successful
    const success = data.status === true || data.success === true;

    if (!success) {
      console.error('WhatsApp send failed:', data);
      return { success: false, error: data.message || 'Failed to send WhatsApp' };
    }

    console.log('WhatsApp message sent successfully');
    return { success: true };
  } catch (error: any) {
    console.error('WhatsApp send error:', error);
    return { success: false, error: error.message };
  }
}

// Generate Sale ID
async function generateSaleId(supabase: any): Promise<string> {
  // Try to use database function if exists
  const { data, error } = await supabase.rpc('generate_sale_id');
  if (!error && data) {
    return data;
  }
  // Fallback: generate unique ID
  const ts = Date.now().toString().slice(-6);
  return `DFR${ts}`;
}

// Format phone number to 60xxxxxxxxx format (Malaysian international format)
function formatPhoneNumber(phone: string): string {
  let formatted = phone.replace(/\D/g, '');
  if (formatted.startsWith('0')) {
    formatted = '60' + formatted.substring(1);
  }
  if (!formatted.startsWith('60')) {
    formatted = '60' + formatted;
  }
  return formatted;
}

// Parse Shoppego order to normalized format
function parseShoppegoOrder(data: any): NormalizedOrder {
  const checkout = data.checkout;
  const shipping = checkout.shipping_address || {};
  const customer = checkout.customer || {};

  // Log full payload structure to help debug COD detection
  console.log('=== FULL SHOPPEGO PAYLOAD ===');
  console.log(JSON.stringify(data, null, 2));
  console.log('=== END SHOPPEGO PAYLOAD ===');

  // Handle potentially undefined first_name/last_name with fallbacks
  const firstName = shipping.first_name || customer.first_name || '';
  const lastName = shipping.last_name || customer.last_name || '';
  const customerName = `${firstName} ${lastName}`.trim() || 'Customer';
  const customerPhone = formatPhoneNumber(shipping.phone || customer.phone || '');
  const fullAddress = [shipping.address1, shipping.address2].filter(Boolean).join(', ');

  // Get first item SKU and calculate total quantity
  const firstItem = checkout.items?.[0];
  const sku = firstItem?.product?.sku || '';
  const totalQuantity = checkout.items?.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0) || 1;
  // Use item.name (variant name) for bundle matching - contains SET/BOTOL info
  // Example: item.name = "SET 6 BOTOL +4 FREE GIFT"
  const productNames = checkout.items?.map((item: any) => item.name || item.product?.name || 'Product').join(', ') || 'Product';

  // Ensure totalPrice is a number
  const totalPrice = Number(checkout.total) || 0;

  // Detect COD from Shoppego - check the correct fields based on actual payload
  // Shoppego uses: gateway_code, gateway_name, rate
  console.log('=== COD DETECTION DEBUG ===');
  console.log('checkout.gateway_code:', checkout.gateway_code);
  console.log('checkout.gateway_name:', checkout.gateway_name);
  console.log('checkout.rate:', checkout.rate);
  console.log('=== END COD DEBUG ===');

  // Check gateway_code first (most reliable), then gateway_name, then rate
  const gatewayCode = checkout.gateway_code || '';
  const gatewayName = checkout.gateway_name || '';
  const rate = checkout.rate || '';

  const isCOD = gatewayCode.toLowerCase() === 'cod' ||
                gatewayName.toLowerCase().includes('cod') ||
                gatewayName.toLowerCase().includes('cash on delivery') ||
                rate.toLowerCase().includes('cod') ||
                rate.toLowerCase().includes('cash on delivery');

  console.log('COD Detection Result:', { gatewayCode, gatewayName, rate, isCOD });

  return {
    platformOrderId: String(checkout.id || ''),
    customerName,
    customerPhone,
    customerEmail: shipping.email || customer.email || '',
    address: fullAddress,
    city: shipping.city || '',
    state: mapState(shipping.state || ''),
    postcode: shipping.zip || '',
    totalPrice,
    paymentMethod: isCOD ? 'COD' : 'CASH',
    productNames,
    sku,
    quantity: totalQuantity
  };
}

// Parse WooCommerce order to normalized format
function parseWooCommerceOrder(wooOrder: WooOrder): NormalizedOrder {
  // Log full payload structure to help debug
  console.log('=== FULL WOOCOMMERCE PAYLOAD ===');
  console.log(JSON.stringify(wooOrder, null, 2));
  console.log('=== END WOOCOMMERCE PAYLOAD ===');

  const shipping = wooOrder.shipping.address_1 ? wooOrder.shipping : wooOrder.billing;
  const customerName = `${shipping.first_name} ${shipping.last_name}`.trim() ||
                       `${wooOrder.billing.first_name} ${wooOrder.billing.last_name}`.trim();
  const customerPhone = formatPhoneNumber(shipping.phone || wooOrder.billing.phone);
  const fullAddress = [shipping.address_1, shipping.address_2].filter(Boolean).join(', ');

  const firstLineItem = wooOrder.line_items[0];
  const wooSku = firstLineItem?.sku || '';
  const { sku, quantity } = parseWooCommerceSku(wooSku);
  const productNames = wooOrder.line_items.map(item => item.name).join(', ');

  // Log payment method for debugging
  console.log('=== WOOCOMMERCE COD DEBUG ===');
  console.log('payment_method:', wooOrder.payment_method);
  console.log('payment_method_title:', wooOrder.payment_method_title);
  console.log('=== END WOOCOMMERCE COD DEBUG ===');

  const isCOD = wooOrder.payment_method.toLowerCase() === 'cod';

  return {
    platformOrderId: String(wooOrder.id),
    customerName,
    customerPhone,
    customerEmail: wooOrder.billing.email || '',
    address: fullAddress,
    city: shipping.city,
    state: mapState(shipping.state),
    postcode: shipping.postcode,
    totalPrice: parseFloat(wooOrder.total),
    paymentMethod: isCOD ? 'COD' : 'CASH',
    productNames,
    sku,
    quantity
  };
}

// Parse WooCommerce SKU format: "BUNDLE-SKU-6" -> { sku: "BUNDLE-SKU", quantity: 6 }
function parseWooCommerceSku(wooSku: string): { sku: string; quantity: number } {
  if (!wooSku) {
    return { sku: '', quantity: 1 };
  }

  const lastHyphenIndex = wooSku.lastIndexOf('-');
  if (lastHyphenIndex === -1) {
    return { sku: wooSku, quantity: 1 };
  }

  const potentialQuantity = wooSku.substring(lastHyphenIndex + 1);
  const quantity = parseInt(potentialQuantity, 10);

  if (!isNaN(quantity) && quantity > 0) {
    const sku = wooSku.substring(0, lastHyphenIndex);
    return { sku, quantity };
  }

  return { sku: wooSku, quantity: 1 };
}

// Map Malaysian state names (includes full names and abbreviations)
function mapState(state: string): string {
  const stateMap: Record<string, string> = {
    // Full names
    'wp kuala lumpur': 'Kuala Lumpur',
    'kuala lumpur': 'Kuala Lumpur',
    'selangor': 'Selangor',
    'johor': 'Johor',
    'penang': 'Penang',
    'pulau pinang': 'Penang',
    'perak': 'Perak',
    'kedah': 'Kedah',
    'kelantan': 'Kelantan',
    'terengganu': 'Terengganu',
    'pahang': 'Pahang',
    'negeri sembilan': 'Negeri Sembilan',
    'melaka': 'Melaka',
    'malacca': 'Melaka',
    'sabah': 'Sabah',
    'sarawak': 'Sarawak',
    'perlis': 'Perlis',
    'labuan': 'Labuan',
    'putrajaya': 'Putrajaya',
    // Abbreviated state codes (used by some WooCommerce sites like akakgojes.com)
    'kl': 'Kuala Lumpur',
    'wpkl': 'Kuala Lumpur',
    'sgr': 'Selangor',
    'sel': 'Selangor',
    'jhr': 'Johor',
    'png': 'Penang',
    'prk': 'Perak',
    'kdh': 'Kedah',
    'ktn': 'Kelantan',
    'trg': 'Terengganu',
    'phg': 'Pahang',
    'nsn': 'Negeri Sembilan',
    'ns': 'Negeri Sembilan',
    'mlk': 'Melaka',
    'sbh': 'Sabah',
    'swk': 'Sarawak',
    'srw': 'Sarawak',
    'pls': 'Perlis',
    'lbn': 'Labuan',
    'pjy': 'Putrajaya'
  };
  return stateMap[state.toLowerCase()] || state;
}

// Check if state is Sabah/Sarawak (East Malaysia)
function isEastMalaysia(state: string): boolean {
  const eastMalaysiaStates = ['sabah', 'sarawak', 'labuan'];
  return eastMalaysiaStates.includes(state.toLowerCase());
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Accept both GET (for ping) and POST
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Handle GET request as ping test
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ success: true, message: 'Webhook endpoint is active' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const startTime = Date.now();

  // Get webhook headers
  const signature = req.headers.get('x-wc-webhook-signature') || '';
  const source = req.headers.get('x-wc-webhook-source') || '';
  const topic = req.headers.get('x-wc-webhook-topic') || '';

  // Get query parameters
  const url = new URL(req.url);
  const marketerIdStaff = url.searchParams.get('marketer_id');
  const platform = url.searchParams.get('platform') || 'woocommerce'; // Default to woocommerce

  console.log('=== Ecommerce Webhook Request ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Platform:', platform);
  console.log('marketer_id:', marketerIdStaff);

  try {
    const rawBody = await req.text();
    console.log('Body length:', rawBody?.length || 0);

    // Handle empty body (ping test from WooCommerce)
    if (!rawBody || rawBody.trim() === '') {
      console.log('WooCommerce ping test received (empty body)');
      return new Response(
        JSON.stringify({ success: true, message: 'Webhook endpoint is active' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let parsedBody: any;

    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      console.log('Non-JSON body received, treating as ping test');
      return new Response(
        JSON.stringify({ success: true, message: 'Webhook endpoint is active' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle ping/test for both platforms
    const isWooPingTest = parsedBody && typeof parsedBody === 'object' && (
      'webhook_id' in parsedBody ||
      parsedBody.action === 'woocommerce_rest_api_test_connection' ||
      (platform === 'woocommerce' && (!parsedBody.id || !parsedBody.status))
    );

    // Shoppego ping test - no checkout data
    const isShoppegoPingTest = platform === 'shoppego' && (!parsedBody.checkout || !parsedBody.checkout.id);

    if (isWooPingTest || isShoppegoPingTest) {
      console.log(`${platform} webhook ping/test received`);
      return new Response(
        JSON.stringify({ success: true, message: 'Webhook test successful' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate marketer_id only for actual orders (not ping tests)
    if (!marketerIdStaff) {
      console.error('marketer_id missing for actual order');
      return new Response(
        JSON.stringify({ error: 'marketer_id (idstaff) is required as query parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Look up the marketer by idstaff
    const { data: marketerLookup, error: lookupError } = await supabase
      .from('profiles')
      .select('id, idstaff, full_name')
      .eq('idstaff', marketerIdStaff)
      .single();

    if (lookupError || !marketerLookup) {
      console.error('Marketer not found:', marketerIdStaff, lookupError);
      return new Response(
        JSON.stringify({ error: `Marketer not found with idstaff: ${marketerIdStaff}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse order based on platform
    let orderData: NormalizedOrder;

    if (platform === 'shoppego') {
      // Shoppego format
      const shoppegoData = parsedBody as ShoppegoOrder;
      orderData = parseShoppegoOrder(shoppegoData);
      console.log('=== Processing Shoppego Order ===');
    } else {
      // WooCommerce format (default)
      const wooOrder = parsedBody as WooOrder;

      // Only process orders with status 'processing' (payment confirmed) for WooCommerce
      if (wooOrder.status !== 'processing') {
        console.log('Skipping order - status is not processing:', wooOrder.status);
        return new Response(
          JSON.stringify({ success: true, message: `Skipped - order status is ${wooOrder.status}` }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      orderData = parseWooCommerceOrder(wooOrder);
      console.log('=== Processing WooCommerce Order ===');
    }

    console.log('Platform:', platform);
    console.log('Order ID:', orderData.platformOrderId);
    console.log('Customer:', orderData.customerName);
    console.log('Phone:', orderData.customerPhone);
    console.log('Marketer:', marketerIdStaff);

    // Skip signature verification - not needed for this integration
    if (signature) {
      console.log('Signature provided but skipping verification');
    }

    // Check for duplicate based on platform
    let existingOrder = null;
    console.log('Checking for duplicate order:', { platform, platformOrderId: orderData.platformOrderId });

    if (platform === 'shoppego') {
      // For Shoppego, check by shoppego_order_id (string)
      const { data, error } = await supabase
        .from('customer_purchases')
        .select('id, id_sale, tracking_number')
        .eq('shoppego_order_id', orderData.platformOrderId)
        .maybeSingle();

      if (error) {
        console.log('Shoppego duplicate check error (column may not exist):', error.message);
        // Column doesn't exist yet, continue with order creation
      } else {
        existingOrder = data;
      }
    } else {
      // For WooCommerce, check by woo_order_id (integer)
      const { data } = await supabase
        .from('customer_purchases')
        .select('id, id_sale, tracking_number')
        .eq('woo_order_id', parseInt(orderData.platformOrderId))
        .maybeSingle();
      existingOrder = data;
    }

    if (existingOrder) {
      console.log('Duplicate order detected:', { platform, platformOrderId: orderData.platformOrderId, existingId: existingOrder.id });
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Order already processed',
          platform,
          existing_order_id: existingOrder.id,
          id_sale: existingOrder.id_sale,
          tracking_number: existingOrder.tracking_number
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Look up bundle by matching "SET X" pattern in product name to bundle name
    // Example: Product "SET C (3 GOLDEN SARI+ SABUN +PERFUME+ SABUN V)" → extract "Set C" → find bundle with name containing "Set C"
    let bundleId: string | null = null;
    let bundleName = orderData.productNames;
    let bundleSku = orderData.sku || 'WEBSITE';
    let bundleWeight = 0.5;
    let baseCost = 0;
    let postageSmCost = 0;
    let postageSsCost = 0;

    // Extract SET identifier from product name (case insensitive)
    // Handles: "SET A", "SET B", "SET C", "SET D", "SET BUNDLE"
    // Example: "SET C (3 GOLDEN SARI+ SABUN +PERFUME+ SABUN V)" → setIdentifier = "SET C"
    // Example: "SET BUNDLE GOLDEN SARI" → setIdentifier = "SET BUNDLE"
    // Fallback: If no SET found, try BOTOL or UNIT pattern
    const productNameLower = orderData.productNames.toLowerCase();
    const setIndex = productNameLower.indexOf('set');
    let setIdentifier = '';

    if (setIndex >= 0) {
      // Check for "SET BUNDLE" first (longer match takes priority)
      if (productNameLower.substring(setIndex).startsWith('set bundle')) {
        setIdentifier = 'SET BUNDLE';
      } else if (setIndex + 5 <= orderData.productNames.length) {
        // Check for single letter sets: "SET A", "SET B", "SET C", "SET D"
        const afterSet = orderData.productNames.substring(setIndex + 3, setIndex + 5).trim();
        // Should be a single letter (A, B, C, D, etc.)
        if (afterSet.length >= 1 && /^[A-Za-z]$/.test(afterSet.charAt(0))) {
          setIdentifier = 'SET ' + afterSet.charAt(0).toUpperCase();
        }
      }
    }

    // Fallback: If no SET found, try BOTOL pattern first, then UNIT pattern
    // Logic: Find "botol" or "unit", take chars before it, extract the number
    // Example: "4 BOTOL" → digits before = "4" → unitCount = 4
    // Example: "6 UNIT" → digits before = "6" → unitCount = 6
    let unitCount = 0;
    if (!setIdentifier) {
      // Try BOTOL pattern first
      const botolIndex = productNameLower.indexOf('botol');
      if (botolIndex >= 2) {
        // Get characters before "botol" and extract digits
        const beforeBotol = orderData.productNames.substring(Math.max(0, botolIndex - 3), botolIndex);
        const digitsOnly = beforeBotol.replace(/\D/g, '');
        if (digitsOnly) {
          unitCount = parseInt(digitsOnly, 10);
          console.log('Found BOTOL pattern:', { beforeBotol, digitsOnly, unitCount });
        }
      }

      // If no BOTOL found, try UNIT pattern
      if (unitCount === 0) {
        const unitIndex = productNameLower.indexOf('unit');
        if (unitIndex >= 2) {
          // Get characters before "unit" and extract digits
          const beforeUnit = orderData.productNames.substring(Math.max(0, unitIndex - 3), unitIndex);
          const digitsOnly = beforeUnit.replace(/\D/g, '');
          if (digitsOnly) {
            unitCount = parseInt(digitsOnly, 10);
            console.log('Found UNIT pattern:', { beforeUnit, digitsOnly, unitCount });
          }
        }
      }
    }
    console.log('Bundle extraction:', { productName: orderData.productNames, setIndex, setIdentifier, unitCount });

    console.log('Bundle lookup:', { setIdentifier, unitCount, productName: orderData.productNames, originalSku: orderData.sku });

    // First try logistic_bundles for this marketer
    let { data: allBundles } = await supabase
      .from('logistic_bundles')
      .select('id, name, sku, weight, base_cost, kos_postage_sm, kos_postage_ss')
      .eq('is_active', true)
      .eq('logistic_id', marketerLookup.id);

    // If no bundles found for marketer, try ALL logistic_bundles as fallback
    if (!allBundles || allBundles.length === 0) {
      console.log('No logistic_bundles for marketer, trying all logistic_bundles');
      const { data: allLogisticBundles } = await supabase
        .from('logistic_bundles')
        .select('id, name, sku, weight, base_cost, kos_postage_sm, kos_postage_ss')
        .eq('is_active', true);
      allBundles = allLogisticBundles;
    }

    if (allBundles && allBundles.length > 0) {
      console.log('Available bundles:', allBundles.map((b: any) => ({ name: b.name, sku: b.sku })));

      let matchingBundle = null;

      if (setIdentifier) {
        // Method 1: Match by SET identifier (e.g., "SET C" matches "SET C GOLDEN SARI")
        console.log(`Searching for bundle with name containing: ${setIdentifier}`);
        matchingBundle = allBundles.find((b: any) =>
          b.name && b.name.toLowerCase().includes(setIdentifier.toLowerCase())
        );
      }

      if (!matchingBundle && unitCount > 0) {
        // Method 2: Match by BOTOL/UNIT count - find bundle where SKU starts with "GSI-{unitCount}"
        // Example: 4 BOTOL or 4 UNIT → find bundle with SKU starting with "GSI-4"
        // IMPORTANT: Use regex to match exact number, not just startsWith
        // e.g., "GSI-1" should NOT match "GSI-100", only "GSI-1" or "GSI-1+"
        console.log(`Searching for bundle with SKU matching GSI-${unitCount}`);
        const unitRegex = new RegExp(`^gsi-${unitCount}(\\+|$)`, 'i');
        matchingBundle = allBundles.find((b: any) => {
          if (!b.sku) return false;
          // Check if SKU matches "GSI-{unitCount}" followed by "+" or end of string
          return unitRegex.test(b.sku);
        });
      }

      if (matchingBundle) {
        bundleId = matchingBundle.id;
        bundleName = matchingBundle.name;
        bundleSku = matchingBundle.sku;
        bundleWeight = matchingBundle.weight || 0.5;
        baseCost = matchingBundle.base_cost || 0;
        postageSmCost = matchingBundle.kos_postage_sm || 0;
        postageSsCost = matchingBundle.kos_postage_ss || 0;
        console.log('Bundle found:', { bundleId, bundleName, bundleSku, setIdentifier, unitCount });
      } else {
        console.warn(`No bundle found with setIdentifier: ${setIdentifier}, unitCount: ${unitCount}`);
      }
    }

    if (!setIdentifier && unitCount === 0) {
      console.log('Cannot determine bundle - no SET identifier, BOTOL count, or UNIT count found in product name');
    }

    if (!bundleId) {
      console.warn('Bundle not found:', { sku: orderData.sku, productNames: orderData.productNames, setIdentifier });
    }

    // Determine payment method
    const isCOD = orderData.paymentMethod === 'COD';
    const typePayment = isCOD ? 'COD' : 'Online Payment';
    // For WhatsApp display: "Ninjavan COD" or "Ninjavan Online Payment"
    const kurierDisplay = isCOD ? 'Ninjavan COD' : 'Ninjavan Online Payment';

    // Generate Sale ID
    const idSale = await generateSaleId(supabase);

    // Malaysia timezone date
    const nowUTC = new Date();
    const malaysiaTime = new Date(nowUTC.getTime() + (8 * 60 * 60 * 1000));
    const dateOrder = malaysiaTime.toISOString().split('T')[0];

    // Calculate costs
    const isEastMY = isEastMalaysia(orderData.state);
    const postageCost = isEastMY ? postageSsCost : postageSmCost;
    const totalBaseCost = baseCost * orderData.quantity;

    // Get NinjaVan config
    const { data: ninjavanConfig } = await supabase
      .from('ninjavan_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    // Create NinjaVan order
    let trackingNumber = '';
    let ninjavanSuccess = false;

    if (ninjavanConfig) {
      console.log('Creating NinjaVan order...');
      const ninjavanResult = await createNinjavanOrder(supabase, ninjavanConfig, {
        idSale,
        customerName: orderData.customerName,
        phone: orderData.customerPhone,
        address: orderData.address,
        postcode: orderData.postcode,
        city: orderData.city,
        state: orderData.state,
        price: orderData.totalPrice,
        paymentMethod: typePayment,
        bundleSku,
        quantity: orderData.quantity,
        nota: orderData.productNames,
        marketerIdStaff,
        weight: bundleWeight * orderData.quantity
      });

      if (ninjavanResult.success && ninjavanResult.trackingNumber) {
        trackingNumber = ninjavanResult.trackingNumber;
        ninjavanSuccess = true;
        console.log('NinjaVan order created, tracking:', trackingNumber);
      } else {
        console.error('NinjaVan failed:', ninjavanResult.error);
      }
    }

    // Build insert data - common fields for both platforms
    const insertData: any = {
      id_sale: idSale,
      date_order: dateOrder,
      marketer_id_staff: marketerIdStaff,
      total_sale: orderData.totalPrice,
      unit: orderData.quantity,
      tracking_number: trackingNumber,
      delivery_status: 'Pending',
      jenis_platform: 'Facebook', // Both WooCommerce and Shoppego are from Facebook ads
      jenis_customer: 'NP', // New Prospect
      jenis_closing: 'Website',
      name_customer: orderData.customerName,
      phone_customer: orderData.customerPhone,
      address_customer: orderData.address,
      city_customer: orderData.city,
      postcode_customer: orderData.postcode,
      state_customer: orderData.state,
      kurier: isCOD ? 'Ninjavan COD' : 'Ninjavan CASH',
      type_payment: typePayment,
      date_payment: !isCOD ? dateOrder : null,
      produk: bundleName, // Product name from matched bundle
      nota_staff: orderData.productNames,
      bundle_id: bundleId,
      cost_postage: postageCost,
      cost_baseproduct: totalBaseCost
    };

    // Set platform-specific order ID field
    if (platform === 'shoppego') {
      insertData.shoppego_order_id = orderData.platformOrderId;
    } else {
      insertData.woo_order_id = parseInt(orderData.platformOrderId);
    }

    // Insert order into customer_purchases
    const { data: newOrder, error: insertError } = await supabase
      .from('customer_purchases')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting order:', insertError);

      // Log failed webhook
      await supabase.from('webhook_logs').insert({
        webhook_type: platform,
        request_method: 'POST',
        request_body: parsedBody,
        request_headers: { signature, source, topic },
        parsed_data: { marketerIdStaff, ...orderData },
        error_message: insertError.message,
        response_status: 500,
        processing_time_ms: Date.now() - startTime
      });

      return new Response(
        JSON.stringify({ error: 'Failed to create order', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Order created successfully:', { id: newOrder.id, idSale, trackingNumber });

    // Send WhatsApp notification to customer (always send, regardless of tracking number)
    let whatsappSent = false;

    // Format full address
    const fullAddress = [
      orderData.address,
      orderData.city,
      orderData.postcode,
      orderData.state
    ].filter(Boolean).join(', ');

    // SKU to product name mapping
    const skuToProductName: Record<string, string> = {
      'GSI': 'GOLDEN SARI',
      'PF': 'PERFUME RINDU SARI',
      'PF30': 'PERFUME RINDU SARI 30ML',
      'SBNM': 'SABUN MIRI',
      'SBNV': 'SABUN MISS V',
      'SRM2': 'SERUM 20 ML',
      'SRM3': 'SERUM 30ML',
      'SRM': 'SERUM CIK EPAL',
      'WLT': 'WALLET',
    };

    // Parse bundle SKU to create product breakdown
    // Example: "GSI-3 + SBNM-1 + SBNV-1 + PF-1" -> "3 GOLDEN SARI + SABUN MIRI + SABUN MISS V + PERFUME RINDU SARI"
    const formatProductBreakdown = (sku: string): string => {
      if (!sku) return '';

      const parts = sku.split('+').map(p => p.trim());
      const breakdown: string[] = [];

      for (const part of parts) {
        // Match pattern like "GSI-3" or "SBNM-1"
        const match = part.match(/^([A-Z0-9]+)-(\d+)$/i);
        if (match) {
          const skuCode = match[1].toUpperCase();
          const qty = parseInt(match[2], 10);
          const productName = skuToProductName[skuCode] || skuCode;

          // If qty is 1, just show product name. If qty > 1, show "X PRODUCT_NAME"
          if (qty === 1) {
            breakdown.push(productName);
          } else {
            breakdown.push(`${qty} ${productName}`);
          }
        }
      }

      return breakdown.join(' + ');
    };

    // Format product display: "SET C GOLDEN SARI (3 GOLDEN SARI + SABUN MIRI + SABUN MISS V + PERFUME RINDU SARI)"
    const productBreakdown = formatProductBreakdown(bundleSku);
    const productDisplay = productBreakdown ? `${bundleName} (${productBreakdown})` : bundleName;

    const whatsappMessage = `Salam ${orderData.customerName}. Kami telah menerima Tempahan Cik 😊

Berikut adalah detail tempahan cik ${orderData.customerName} ✅

ORDER ID : ${idSale}
NAMA : ${orderData.customerName}
ALAMAT : ${fullAddress}
NO TELEFON : ${orderData.customerPhone}
PRODUK : ${productDisplay}
HARGA : RM${Number(orderData.totalPrice).toFixed(2)}
CARA BAYARAN : ${kurierDisplay}
TRACKING : ${trackingNumber || '-'}

Sila Semak Maklumat berikut. Sekiranya Anda Dapati Ada Kesalahan Maklumat Sila Maklumkan Pada Kami Yer...

✅ 𝐍𝐚𝐧𝐭𝐢 𝐚𝐤𝐚𝐧 𝐚𝐝𝐚 penghantaran status parcel dari semasa ke semasa 𝐧𝐚𝐧𝐭𝐢 𝐲𝐞..

Oh Yaaa! Jangan Lupa Save Nombor Saya Yer...`;

    console.log('Attempting to send WhatsApp to:', orderData.customerPhone);

    const whatsappResult = await sendWhatsAppMessage(
      supabase,
      marketerIdStaff,
      orderData.customerPhone,
      whatsappMessage
    );

    whatsappSent = whatsappResult.success;
    console.log('WhatsApp notification:', whatsappResult.success ? 'sent' : whatsappResult.error)

    // Log successful webhook
    await supabase.from('webhook_logs').insert({
      webhook_type: platform,
      request_method: 'POST',
      request_body: parsedBody,
      request_headers: { signature, source, topic },
      parsed_data: {
        marketerIdStaff,
        platform,
        ...orderData,
        idSale,
        trackingNumber,
        ninjavanSuccess,
        whatsappSent
      },
      response_status: 200,
      response_body: { success: true, order_id: newOrder.id },
      processing_time_ms: Date.now() - startTime
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Order created successfully',
        order_id: newOrder.id,
        id_sale: idSale,
        tracking_number: trackingNumber,
        ninjavan_success: ninjavanSuccess,
        whatsapp_sent: whatsappSent
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('WooCommerce webhook error:', error);

    // Log error
    await supabase.from('webhook_logs').insert({
      webhook_type: 'woocommerce',
      request_method: 'POST',
      error_message: error.message,
      response_status: 500,
      processing_time_ms: Date.now() - startTime
    });

    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
