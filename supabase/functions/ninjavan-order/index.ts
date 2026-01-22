import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OrderData {
  customerName: string;
  phone: string;
  address: string;
  postcode: string;
  city: string;
  state: string;
  price: number;
  paymentMethod?: string;
  caraBayaran?: string; // Alternative field name for payment method
  productName?: string;
  produk?: string; // Alternative field name for product
  productSku?: string; // Product SKU for delivery instructions
  quantity?: number;
  weight?: number; // Weight in KG for parcel
  nota?: string; // Staff notes for delivery instructions
  idSale?: string; // Optional sale ID for tracking (max 9 chars)
  marketerIdStaff?: string; // Optional marketer ID for delivery instructions
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const orderData: OrderData = await req.json();
    console.log('Received order data:', orderData);

    // Get NinjaVan config (global config - single record)
    const { data: config, error: configError } = await supabase
      .from('ninjavan_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (configError || !config) {
      console.error('Config not found:', configError);
      return new Response(
        JSON.stringify({ error: 'NinjaVan configuration not found. Please configure in Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for valid token or get new one
    let accessToken: string;
    const now = new Date();

    // First check if we have a valid (non-expired) token (global token)
    const { data: tokenData, error: tokenError } = await supabase
      .from('ninjavan_tokens')
      .select('*')
      .gt('expires_at', now.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenError) {
      console.log('Token query error (may be no tokens yet):', tokenError);
    }

    if (tokenData && tokenData.access_token) {
      // Use existing valid token
      accessToken = tokenData.access_token;
      console.log('Using existing valid token, expires at:', tokenData.expires_at);
    } else {
      // No valid token found, get new one from NinjaVan OAuth
      console.log('No valid token found, requesting new token from NinjaVan');

      const authResponse = await fetch('https://api.ninjavan.co/my/2.0/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: config.client_id,
          client_secret: config.client_secret,
          grant_type: 'client_credentials'
        })
      });

      if (!authResponse.ok) {
        const errorText = await authResponse.text();
        console.error('NinjaVan Auth failed:', errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to authenticate with NinjaVan API', details: errorText }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const authData = await authResponse.json();
      accessToken = authData.access_token;
      const expiresIn = authData.expires_in || 3600; // default 1 hour if not provided

      // Calculate expiry time (subtract 5 minutes buffer for safety)
      const expiresAt = new Date(now.getTime() + ((expiresIn - 300) * 1000));

      console.log('New token obtained, expires in:', expiresIn, 'seconds, stored expiry:', expiresAt.toISOString());

      // Store new token in database (global token)
      const { error: insertError } = await supabase.from('ninjavan_tokens').insert({
        access_token: accessToken,
        expires_at: expiresAt.toISOString()
      });

      if (insertError) {
        console.error('Failed to store token:', insertError);
        // Continue anyway, token is still valid for this request
      } else {
        console.log('New token stored successfully');
      }
    }

    // Generate unique tracking ID (max 9 chars for NinjaVan API)
    // Use idSale if provided, otherwise generate short ID
    let trackingId: string;
    if (orderData.idSale && orderData.idSale.length <= 9) {
      trackingId = orderData.idSale;
    } else {
      // Generate short ID: OJ + 5 digit sequence (e.g., "OJ12345" = 7 chars)
      const ts = Date.now().toString().slice(-5);
      trackingId = `OJ${ts}`;
    }

    // Prepare address (split if > 100 chars)
    let address1 = orderData.address;
    let address2 = '';
    if (orderData.address.length > 100) {
      address1 = orderData.address.substring(0, 100);
      address2 = orderData.address.substring(100, 200);
    }

    // Calculate dates in Malaysia timezone (UTC+8)
    // Edge functions run in UTC, so we need to add 8 hours to get Malaysia time
    const nowUTC = new Date();
    const malaysiaOffset = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
    const malaysiaTime = new Date(nowUTC.getTime() + malaysiaOffset);

    // Format as YYYY-MM-DD
    const pickupDate = malaysiaTime.toISOString().split('T')[0];
    const deliveryTime = new Date(malaysiaTime.getTime() + 2 * 24 * 60 * 60 * 1000);
    const deliveryDate = deliveryTime.toISOString().split('T')[0];

    console.log('Malaysia time:', malaysiaTime.toISOString(), 'Pickup date:', pickupDate, 'Delivery date:', deliveryDate);

    // COD amount (only for COD payments) - support both field names
    const paymentMethod = orderData.paymentMethod || orderData.caraBayaran || '';
    const codAmount = paymentMethod === 'COD' ? Math.round(orderData.price) : 0;

    // Delivery instructions format: SKU - unit, id_staff, nota
    const productName = orderData.productName || orderData.produk || '';
    const sku = orderData.productSku || productName;
    const idStaff = orderData.marketerIdStaff || '';
    const nota = orderData.nota || '';
    const quantity = orderData.quantity || 1;
    const deliveryInstructions = `${sku} - ${quantity}, ${idStaff}, ${nota}`.trim();

    // Create order payload
    const ninjavanPayload = {
      service_type: "Parcel",
      service_level: "Standard",
      requested_tracking_number: trackingId,
      reference: {
        merchant_order_number: `BISNESOWNER-DFR${trackingId}`
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
          weight: orderData.weight || 0.5
        }
      }
    };

    console.log('Sending to NinjaVan:', JSON.stringify(ninjavanPayload));

    // Send order to NinjaVan
    const orderResponse = await fetch('https://api.ninjavan.co/my/4.1/orders', {
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
      return new Response(
        JSON.stringify({ error: orderResult.message || 'Failed to create NinjaVan order', details: orderResult }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        trackingNumber: orderResult.tracking_number || trackingId,
        message: 'Order sent to NinjaVan successfully'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    console.error('Error in ninjavan-order function:', err);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
