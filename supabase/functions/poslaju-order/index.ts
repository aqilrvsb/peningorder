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
  caraBayaran?: string;
  productName?: string;
  produk?: string;
  productSku?: string;
  quantity?: number;
  weight?: number;
  nota?: string;
  idSale?: string;
  marketerIdStaff?: string;
}

// Get Malaysia date and time
function getMalaysiaDateTime() {
  const now = new Date();
  const malaysiaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const date = malaysiaTime.toISOString().split('T')[0]; // YYYY-MM-DD
  const dateCompact = date.replace(/-/g, ''); // YYYYMMDD
  const timeStr = malaysiaTime.toISOString().split('T')[1].substring(0, 8); // HH:MM:SS
  return { date, dateCompact, timeStr, full: `${date.split('-').reverse().join('')}: ${timeStr}` };
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
    console.log('Received order data for Poslaju:', orderData);

    // Get Poslaju config (global config - single record)
    const { data: config, error: configError } = await supabase
      .from('poslaju_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (configError || !config) {
      console.error('Poslaju config not found:', configError);
      return new Response(
        JSON.stringify({ error: 'Poslaju configuration not found. Please configure in Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for valid token or get new one
    let accessToken: string;
    const now = new Date();

    // First check if we have a valid (non-expired) token
    const { data: tokenData, error: tokenError } = await supabase
      .from('poslaju_tokens')
      .select('*')
      .gt('expires_at', now.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenError) {
      console.log('Token query error (may be no tokens yet):', tokenError);
    }

    if (tokenData && tokenData.access_token) {
      accessToken = tokenData.access_token;
      console.log('Using existing valid Poslaju token, expires at:', tokenData.expires_at);
    } else {
      console.log('No valid token found, requesting new token from Pos Malaysia');

      const authBody = new URLSearchParams({
        client_id: config.client_id,
        client_secret: config.client_secret,
        grant_type: 'client_credentials'
      });

      const authResponse = await fetch('https://posapi.pos.com.my/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: authBody.toString()
      });

      if (!authResponse.ok) {
        const errorText = await authResponse.text();
        console.error('Pos Malaysia Auth failed:', errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to authenticate with Pos Malaysia API', details: errorText }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const authData = await authResponse.json();
      accessToken = authData.access_token;
      const expiresIn = authData.expires_in || 3600;

      const expiresAt = new Date(now.getTime() + ((expiresIn - 300) * 1000));

      console.log('New Poslaju token obtained, expires in:', expiresIn, 'seconds');

      const { error: insertError } = await supabase.from('poslaju_tokens').insert({
        access_token: accessToken,
        expires_at: expiresAt.toISOString()
      });

      if (insertError) {
        console.error('Failed to store Poslaju token:', insertError);
      }
    }

    // Get Malaysia date/time
    const { date: pickupDate, full: currentDateTime } = getMalaysiaDateTime();

    console.log('Pickup date:', pickupDate, 'Current datetime:', currentDateTime);

    // Prepare delivery instructions: packageDesc(id_staff)(date)
    const productName = orderData.productName || orderData.produk || 'Package';
    const idStaff = orderData.marketerIdStaff || '';
    const deliveryInstructions = `${productName}(${idStaff})(${pickupDate})`;

    // Check if COD
    const paymentMethod = orderData.paymentMethod || orderData.caraBayaran || '';
    const isCOD = paymentMethod === 'COD';

    // Build Poslaju order payload
    const poslajuPayload: any = {
      account_number: config.account_number,
      product_code: '80000000',
      item_type: '2',
      parcel: 'domestic',
      webhook: true,
      service_level: 'Standard',
      subscription_code: config.subscription_code,
      platform: 'API',
      mps: false,

      reference: {
        merchant_order_number: 'C' + (orderData.idSale || ''),
        merchant_reference_number: 'C' + (orderData.idSale || ''),
      },

      pickup: {
        required: true,
        date: pickupDate,
        timeslot: {
          start_time: '09:00',
          end_time: '18:00',
        },
      },

      sender: {
        display_address: '',
        name: config.sender_name,
        phone_number: config.sender_phone,
        email: config.sender_email,
        address: {
          address1: config.sender_address1,
          address2: config.sender_address2 || '',
          area: config.sender_city,
          city: config.sender_city,
          state: config.sender_state,
          address_type: 'Office',
          country: 'MY',
          postcode: config.sender_postcode,
        },
      },

      receiver: {
        name: orderData.customerName,
        phone_number: orderData.phone,
        email: '',
        address: {
          address1: orderData.address.substring(0, 200),
          address2: orderData.address.length > 200 ? orderData.address.substring(200, 400) : '',
          area: orderData.city,
          city: orderData.city,
          state: orderData.state,
          address_type: 'Others',
          country: 'MY',
          postcode: String(orderData.postcode),
        },
      },

      return_info: {
        name: config.sender_name,
        phone_number: config.sender_phone,
        email: config.sender_email,
        address: {
          address1: config.sender_address1,
          address2: config.sender_address2 || '',
          area: config.sender_city,
          city: config.sender_city,
          state: config.sender_state,
          address_type: 'Office',
          country: 'MY',
          postcode: config.sender_postcode,
        },
      },

      parcel_details: [
        {
          weight: orderData.weight || 0.5,
          length: 0.65,
          width: 0.5,
          height: 0.75,
          item_count: 1,
          parcel_notes: deliveryInstructions,
          details: [
            {
              item_description: deliveryInstructions,
              quantity: 1,
              hscode: '',
              value: orderData.price,
            },
          ],
        },
      ],

      // COD: add COD service, CASH: empty array
      added_services: isCOD ? [
        {
          added_code: 'COD',
          amount: String(orderData.price),
        },
      ] : [],
    };

    console.log('Sending to Poslaju:', JSON.stringify(poslajuPayload));
    console.log('Payment method:', paymentMethod, 'Is COD:', isCOD);

    // Send order to Pos Malaysia
    const orderResponse = await fetch('https://posapi.pos.com.my/api/order/v2.1/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(poslajuPayload)
    });

    const orderResult = await orderResponse.json();
    console.log('Poslaju response:', JSON.stringify(orderResult));

    if (!orderResponse.ok || orderResult.error) {
      return new Response(
        JSON.stringify({
          error: orderResult.message || orderResult.error || 'Failed to create Poslaju order',
          details: orderResult
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract tracking number and PDF from response
    // Response: { data: { tracking_no: '...', consignment: { pdf: '...' } } }
    const trackingNumber = orderResult.data?.tracking_no || '';
    const pdfLink = orderResult.data?.consignment?.pdf || '';

    console.log('Poslaju success - Tracking:', trackingNumber, 'PDF:', pdfLink);

    return new Response(
      JSON.stringify({
        success: true,
        trackingNumber: trackingNumber,
        pdfLink: pdfLink,
        message: 'Order sent to Poslaju successfully'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    console.error('Error in poslaju-order function:', err);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
