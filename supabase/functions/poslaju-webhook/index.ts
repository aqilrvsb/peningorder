import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Image URL for successful delivery follow-up message
const DELIVERY_IMAGE_URL = 'https://wfvuxrhlrmpgzqgyjwxa.supabase.co/storage/v1/object/public/images/caramakan.jpg';
const DELIVERY_IMAGE_CAPTION = `Barang Golden Sari akak dah sampai kan? Ni cara penggunaan ya akak. Make sure cukup air masak tau. Masa period tak digalakkan consume , boleh stop sementara waktu . Kalau akak dah menopause , boleh consume hari2 macam biasa

join group ini : https://chat.whatsapp.com/H5pW50lXnF10ErOi2HAyRm`;

// Poslaju webhook payload interface
interface PoslajuWebhook {
  account_no?: string;
  tracking_number?: string;
  event_code?: string;
  event_name?: string;
  remark?: string;
  office?: string;
  office_name?: string;
  date_time?: string;
  weight?: string;
  length?: string;
  width?: string;
  height?: string;
  volumetric_weight?: string;
  reference_number?: string | null;
  order_number?: string | null;
  longitude?: string;
  latitude?: string;
  proof_image_url?: string[];
  reason_code?: string;
  reason_description?: string;
  signed_by?: {
    receiver_name?: string;
    receiver_id?: string;
  };
}

// Process Poslaju event_code to determine delivery status and seos
// Returns: status (delivery_status), seos (notification tracking), isSuccess, isReturn
function processPoslajuStatus(eventCode: string, eventName: string): { status: string; seos: string; isSuccess: boolean; isReturn: boolean } {
  switch (eventCode) {
    // === Successful Delivery ===
    case 'LM_SUCCESS':
    case 'WD_SUCCESS':
      return { status: 'Processed', seos: 'Successful Delivery', isSuccess: true, isReturn: false };

    // === Return ===
    case 'RTO_SUCCESS':
      return { status: 'Return', seos: 'Returned to Sender', isSuccess: false, isReturn: true };
    case 'RTO_INI':
      return { status: 'Return', seos: 'Return Initiated', isSuccess: false, isReturn: true };
    case 'RTO_ASSIGN':
      return { status: 'Return', seos: 'Return Assigned', isSuccess: false, isReturn: true };
    case 'RTO_OFR':
      return { status: 'Return', seos: 'Out for Return', isSuccess: false, isReturn: true };
    case 'RTO_FAIL':
      return { status: 'Return', seos: 'Return Failed', isSuccess: false, isReturn: true };

    // === Order Cancelled ===
    case 'O_CAN':
      return { status: 'Return', seos: 'Order Cancelled', isSuccess: false, isReturn: true };

    // === Failed Delivery ===
    case 'LM_FAIL_FIRST':
    case 'LM_FAIL':
      return { status: 'Pending', seos: eventName || 'Delivery Failed', isSuccess: false, isReturn: false };

    // === Other events - keep Pending, update seos ===
    default:
      return { status: 'Pending', seos: eventName || eventCode, isSuccess: false, isReturn: false };
  }
}

// Get WhatsApp template category based on event_code
// Only 3 categories send WhatsApp: delivered, on_vehicle (out for delivery), return
function getWhatsAppTemplateCategory(eventCode: string): string | null {
  switch (eventCode) {
    // Delivered
    case 'LM_SUCCESS':
    case 'WD_SUCCESS':
      return 'delivered';

    // Return
    case 'RTO_INI':
    case 'RTO_ASSIGN':
    case 'RTO_OFR':
    case 'RTO_FAIL':
    case 'RTO_SUCCESS':
    case 'O_CAN':
      return 'return';

    // Out for Delivery
    case 'LM_OFD':
    case 'LM_ASSIGN':
    case 'WD_ASSIGNED':
    case 'WD_REATTEMPT':
      return 'on_vehicle';

    default:
      return null;
  }
}

// Map seos string to template category for duplicate detection
// Only tracks the 3 categories we send WhatsApp for
function getTemplateCategoryFromSeos(seos: string): string | null {
  if (!seos) return null;
  const s = seos.toLowerCase();

  if (s.includes('successful delivery') || s.includes('delivered')) return 'delivered';
  if (s.includes('return') || s.includes('cancel')) return 'return';
  if (s.includes('out for delivery') || s.includes('delivery assigned') || s.includes('window delivery assigned') || s.includes('reattempt')) return 'on_vehicle';

  return null;
}

// Get WhatsApp message template based on event_code
function getWhatsAppMessage(
  eventCode: string,
  eventName: string,
  customerName: string,
  trackingNumber: string,
  idSale: string,
  reasonDescription?: string
): string | null {
  const trackUrl = `https://www.pos.com.my/track-trace-item?trackingNo=${trackingNumber}`;

  // Successful Delivery
  if (eventCode === 'LM_SUCCESS' || eventCode === 'WD_SUCCESS') {
    return `Alhamdulillah! Pesanan anda telah berjaya dihantar! 🎉

No. Pesanan: ${idSale}
No. Tracking: ${trackingNumber}

Terima kasih kerana membeli dari kami. Kami amat menghargai sokongan anda!

Jika ada sebarang masalah dengan produk, sila hubungi kami.

Jumpa lagi! 💚
DFR EMPIRE`;
  }

  // Return / Cancelled
  if (eventCode.startsWith('RTO_') || eventCode === 'O_CAN') {
    return `Maaf, pesanan anda telah dipulangkan kepada kami. 😔

No. Pesanan: ${idSale}
No. Tracking: ${trackingNumber}
Status: ${eventName}${reasonDescription ? `\nSebab: ${reasonDescription}` : ''}

Kami mohon maaf atas kesulitan ini. Sila hubungi kami jika anda masih berminat untuk menerima pesanan ini.

DFR EMPIRE`;
  }

  // Out for Delivery
  if (eventCode === 'LM_OFD' || eventCode === 'LM_ASSIGN' || eventCode === 'WD_ASSIGNED' || eventCode === 'WD_REATTEMPT') {
    return `Pesanan anda sedang dalam penghantaran hari ini!

No. Pesanan: ${idSale}
No. Tracking: ${trackingNumber}

Sila pastikan anda ada di rumah untuk menerima parcel.

Track di sini:
${trackUrl}

Terima kasih!
DFR EMPIRE`;
  }

  // All other events - no WhatsApp notification
  return null;
}

// Send WhatsApp message using Whacenter API
async function sendWhatsAppMessage(
  supabase: any,
  marketerIdStaff: string,
  customerPhone: string,
  message: string
): Promise<{ success: boolean; error?: string; instanceId?: string }> {
  try {
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
      console.log('No connected WhatsApp device for marketer:', marketerIdStaff);
      return { success: false, error: 'No connected WhatsApp device' };
    }

    const instanceId = deviceSetting.instance || deviceSetting.device_id;
    if (!instanceId) {
      console.log('No instance ID found in device settings');
      return { success: false, error: 'No WhatsApp instance ID configured' };
    }

    console.log('Sending WhatsApp via Whacenter:', { instance: instanceId, phone: customerPhone });

    const apiUrl = `https://api.whacenter.com/api/send?device_id=${encodeURIComponent(instanceId)}&number=${encodeURIComponent(customerPhone)}&message=${encodeURIComponent(message)}`;

    const response = await fetch(apiUrl, { method: 'GET' });
    const data = await response.json();

    console.log('Whacenter response:', data);

    const success = data.status === true || data.success === true;

    if (!success) {
      console.error('WhatsApp send failed:', data);
      return { success: false, error: data.message || 'Failed to send WhatsApp' };
    }

    console.log('WhatsApp message sent successfully to:', customerPhone);
    return { success: true, instanceId };
  } catch (error: any) {
    console.error('WhatsApp send error:', error);
    return { success: false, error: error.message };
  }
}

// Send WhatsApp image message using Whacenter API (POST with FormData)
async function sendWhatsAppImage(
  instanceId: string,
  customerPhone: string,
  imageUrl: string,
  caption: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('Sending WhatsApp image via Whacenter:', { instance: instanceId, phone: customerPhone, imageUrl });

    const formData = new FormData();
    formData.append('device_id', instanceId);
    formData.append('number', customerPhone);
    formData.append('message', caption);
    formData.append('file', imageUrl);

    const response = await fetch('https://api.whacenter.com/api/send', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();

    console.log('Whacenter image response:', data);

    const success = data.status === true || data.success === true;

    if (!success) {
      console.error('WhatsApp image send failed:', data);
      return { success: false, error: data.message || 'Failed to send WhatsApp image' };
    }

    console.log('WhatsApp image sent successfully to:', customerPhone);
    return { success: true };
  } catch (error: any) {
    console.error('WhatsApp image send error:', error);
    return { success: false, error: error.message };
  }
}

// Get Malaysia date (UTC+8)
function getMalaysiaDate(): string {
  const now = new Date();
  const malaysiaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return malaysiaTime.toISOString().split('T')[0];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const startTime = Date.now();
  const todayDate = getMalaysiaDate();

  // Capture request headers for full payload logging
  const requestHeaders: Record<string, string> = {};
  req.headers.forEach((value, key) => { requestHeaders[key] = value; });

  try {
    const rawBody = await req.text();

    // Handle empty body (ping test)
    if (!rawBody || rawBody.trim() === '') {
      console.log('Poslaju ping test received');
      return new Response(
        JSON.stringify({ success: true, message: 'Webhook endpoint is active' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let webhookData: PoslajuWebhook;

    try {
      webhookData = JSON.parse(rawBody);
    } catch {
      console.log('Invalid JSON received');
      return new Response(
        JSON.stringify({ error: 'Invalid JSON' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log full payload for debugging
    console.log('=== FULL POSLAJU PAYLOAD ===');
    console.log(JSON.stringify(webhookData, null, 2));
    console.log('=== END POSLAJU PAYLOAD ===');

    // Extract fields from Poslaju payload
    const trackingNumber = webhookData.tracking_number;
    const eventCode = webhookData.event_code || '';
    const eventName = webhookData.event_name || eventCode;
    const remark = webhookData.remark || null;
    const reasonDescription = webhookData.reason_description || null;
    const orderNumber = webhookData.order_number || webhookData.reference_number || null;

    console.log('=== Poslaju Webhook Received ===');
    console.log('Tracking:', trackingNumber);
    console.log('Event Code:', eventCode);
    console.log('Event Name:', eventName);
    console.log('Remark:', remark);
    console.log('Order Number:', orderNumber);

    if (!trackingNumber) {
      console.log('No tracking number in webhook');

      await supabase.from('webhook_logs').insert({
        webhook_type: 'poslaju',
        request_method: 'POST',
        request_body: webhookData,
        request_headers: requestHeaders,
        error_message: 'No tracking number provided',
        response_status: 400,
        processing_time_ms: Date.now() - startTime
      });

      return new Response(
        JSON.stringify({ error: 'No tracking number provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!eventCode) {
      console.log('No event_code in webhook');
      return new Response(
        JSON.stringify({ success: true, message: 'No event to process' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find the order by tracking number
    const { data: order, error: orderError } = await supabase
      .from('customer_purchases')
      .select('id, id_sale, marketer_id_staff, name_customer, phone_customer, delivery_status, seo, seos')
      .eq('tracking_number', trackingNumber)
      .maybeSingle();

    if (orderError) {
      console.error('Error finding order:', orderError);

      await supabase.from('webhook_logs').insert({
        webhook_type: 'poslaju',
        request_method: 'POST',
        request_body: webhookData,
        request_headers: requestHeaders,
        error_message: orderError.message,
        response_status: 500,
        processing_time_ms: Date.now() - startTime
      });

      return new Response(
        JSON.stringify({ error: 'Database error', details: orderError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!order) {
      console.log('Order not found for tracking:', trackingNumber);

      await supabase.from('webhook_logs').insert({
        webhook_type: 'poslaju',
        request_method: 'POST',
        request_body: webhookData,
        request_headers: requestHeaders,
        parsed_data: { trackingNumber, eventCode, eventName },
        error_message: 'Order not found',
        response_status: 404,
        processing_time_ms: Date.now() - startTime
      });

      return new Response(
        JSON.stringify({ success: true, message: 'Order not found - might be external order' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Order found:', {
      id: order.id,
      id_sale: order.id_sale,
      marketer: order.marketer_id_staff,
      customer: order.name_customer,
      currentStatus: order.delivery_status,
      currentSeo: order.seo,
      currentSeos: order.seos
    });

    // Process Poslaju status
    const { status: newDeliveryStatus, seos: newSeos, isSuccess, isReturn } = processPoslajuStatus(eventCode, eventName);
    const previousStatus = order.delivery_status;
    const previousSeo = order.seo;
    const previousSeos = order.seos;

    // Build update object
    const updateData: any = {
      seos: newSeos,
      nota_staff: remark || reasonDescription || order.nota_staff
    };

    // Handle Successful Delivery
    if (isSuccess) {
      updateData.seo = 'Successful Delivery';
      console.log('Successful Delivery - updating both seo and seos');
    }
    // Handle Return
    else if (isReturn) {
      updateData.seo = 'Return';
      updateData.delivery_status = 'Return';
      updateData.date_return = todayDate;
      console.log('Setting as Return with date_return:', todayDate);
    }
    else {
      console.log('Other event - updating seos only, seo unchanged for Collection tracking');
    }

    // Update order
    const { error: updateError } = await supabase
      .from('customer_purchases')
      .update(updateData)
      .eq('id', order.id);

    if (updateError) {
      console.error('Error updating order:', updateError);
    } else {
      console.log('Order updated:', {
        previousStatus,
        newStatus: updateData.delivery_status || previousStatus,
        previousSeo,
        newSeos
      });
    }

    // Send WhatsApp notification
    let whatsappSent = false;
    let whatsappError = '';
    let whatsappSkipped = false;

    // Duplicate detection using template categories
    const previousTemplateCategory = previousSeos ? getTemplateCategoryFromSeos(previousSeos) : null;
    const currentTemplateCategory = getWhatsAppTemplateCategory(eventCode);

    console.log('WhatsApp template check:', {
      previousSeos,
      newSeos,
      previousTemplateCategory,
      currentTemplateCategory
    });

    // Skip WhatsApp if same template category already sent
    if (previousTemplateCategory && currentTemplateCategory && previousTemplateCategory === currentTemplateCategory) {
      console.log('Skipping WhatsApp - same template category already sent:', {
        previousSeos,
        newSeos,
        category: currentTemplateCategory
      });
      whatsappSkipped = true;
    } else if (order.phone_customer && order.marketer_id_staff) {
      const message = getWhatsAppMessage(
        eventCode,
        eventName,
        order.name_customer || 'Pelanggan',
        trackingNumber,
        order.id_sale || '',
        reasonDescription || undefined
      );

      if (message) {
        console.log('Sending WhatsApp notification for event:', eventCode, eventName);
        const whatsappResult = await sendWhatsAppMessage(
          supabase,
          order.marketer_id_staff,
          order.phone_customer,
          message
        );

        whatsappSent = whatsappResult.success;
        whatsappError = whatsappResult.error || '';
        console.log('WhatsApp result:', whatsappResult.success ? 'sent' : whatsappResult.error);

        // Send 2nd message: image with product usage instructions (only for successful delivery)
        if (whatsappResult.success && whatsappResult.instanceId && isSuccess) {
          console.log('Sending delivery follow-up image message...');
          const imageResult = await sendWhatsAppImage(
            whatsappResult.instanceId,
            order.phone_customer,
            DELIVERY_IMAGE_URL,
            DELIVERY_IMAGE_CAPTION
          );
          console.log('Image message result:', imageResult.success ? 'sent' : imageResult.error);
        }
      } else {
        console.log('No WhatsApp template for this event:', eventCode);
      }
    }

    // Log successful webhook with full payload
    await supabase.from('webhook_logs').insert({
      webhook_type: 'poslaju',
      request_method: 'POST',
      request_body: webhookData,
      request_headers: requestHeaders,
      parsed_data: {
        trackingNumber,
        eventCode,
        eventName,
        remark,
        reasonDescription,
        orderId: order.id,
        idSale: order.id_sale,
        marketerIdStaff: order.marketer_id_staff,
        customerName: order.name_customer,
        customerPhone: order.phone_customer,
        previousStatus,
        newStatus: updateData.delivery_status || previousStatus,
        previousSeo,
        newSeo: updateData.seo || previousSeo,
        previousSeos,
        newSeos: newSeos,
        previousTemplateCategory,
        currentTemplateCategory,
        whatsappSent,
        whatsappSkipped,
        whatsappError
      },
      response_status: 200,
      response_body: { success: true },
      processing_time_ms: Date.now() - startTime
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook processed successfully',
        order_id: order.id,
        id_sale: order.id_sale,
        tracking_number: trackingNumber,
        event_code: eventCode,
        event_name: eventName,
        seo: updateData.seo || previousSeo,
        seos: newSeos,
        delivery_status: updateData.delivery_status || previousStatus,
        whatsapp_sent: whatsappSent
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Poslaju webhook error:', error);

    await supabase.from('webhook_logs').insert({
      webhook_type: 'poslaju',
      request_method: 'POST',
      request_headers: requestHeaders,
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
