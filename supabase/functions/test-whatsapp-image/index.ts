import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DELIVERY_IMAGE_URL = 'https://wfvuxrhlrmpgzqgyjwxa.supabase.co/storage/v1/object/public/images/caramakan.jpg';
const DELIVERY_IMAGE_CAPTION = `Barang Golden Sari akak dah sampai kan? Ni cara penggunaan ya akak. Make sure cukup air masak tau. Masa period tak digalakkan consume , boleh stop sementara waktu . Kalau akak dah menopause , boleh consume hari2 macam biasa

join group ini : https://chat.whatsapp.com/H5pW50lXnF10ErOi2HAyRm`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const marketerIdStaff = pathParts[pathParts.length - 2] || '';
    const phone = pathParts[pathParts.length - 1] || '';

    if (!marketerIdStaff || !phone) {
      return new Response(
        JSON.stringify({ error: 'Usage: /test-whatsapp-image/{marketerIdStaff}/{phone}' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('=== TEST: Supabase .jpg ===');

    const { data: marketer } = await supabase.from('profiles').select('id').eq('idstaff', marketerIdStaff).single();
    if (!marketer) throw new Error(`Marketer not found: ${marketerIdStaff}`);

    const { data: device } = await supabase.from('device_setting').select('*').eq('user_id', marketer.id).eq('status_wa', 'connected').maybeSingle();
    if (!device) throw new Error(`No connected device for: ${marketerIdStaff}`);

    const instanceId = device.instance || device.device_id;

    console.log('Instance:', instanceId);
    console.log('Image URL:', DELIVERY_IMAGE_URL);

    const formData = new FormData();
    formData.append('device_id', instanceId);
    formData.append('number', phone);
    formData.append('message', DELIVERY_IMAGE_CAPTION);
    formData.append('file', DELIVERY_IMAGE_URL);

    const resp = await fetch('https://api.whacenter.com/api/send', { method: 'POST', body: formData });
    const data = await resp.json();
    console.log('Response:', JSON.stringify(data));

    return new Response(
      JSON.stringify({ success: true, imageUrl: DELIVERY_IMAGE_URL, whacenterResponse: data }, null, 2),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
