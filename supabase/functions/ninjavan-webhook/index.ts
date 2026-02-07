import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Image URL for successful delivery follow-up message
const DELIVERY_IMAGE_URL = 'https://dfrventure.com/caramakan.jpeg';
const DELIVERY_IMAGE_CAPTION = `Barang Golden Sari akak dah sampai kan? Ni cara penggunaan ya akak. Make sure cukup air masak tau. Masa period tak digalakkan consume , boleh stop sementara waktu . Kalau akak dah menopause , boleh consume hari2 macam biasa

join group ini : https://chat.whatsapp.com/H5pW50lXnF10ErOi2HAyRm`;

// NinjaVan webhook event interface (based on actual payload)
interface NinjaVanWebhook {
  tracking_id?: string;
  tracking_number?: string;
  status?: string;           // Short status: "Delivered", "On Vehicle for Delivery"
  event?: string;            // Detailed event: "Delivered, Received by Customer"
  event_name?: string;       // Legacy field
  shipper_order_ref_no?: string;  // Our merchant_order_number: "BISNESOWNER-DFR{id_sale}"
  timestamp?: string;
  is_parcel_on_rts_leg?: boolean;
  comments?: string;
  delivery_information?: {
    state?: string;
    proof?: {
      signature_uri?: string;
      image_uris?: string[];
      signed_by?: {
        name?: string;
        contact?: string;
      };
    };
  };
}

// Process NinjaVan status - matching your PHP logic exactly
// Returns: status (delivery_status), seos (notification tracking - ALL events)
// Note: seo (collection tracking) is only set for Successful Delivery or Return
function processNinjavanStatus(eventName: string): { status: string; seos: string; isSuccess: boolean; isReturn: boolean } {
  // Successful Delivery
  if (
    eventName.includes('Successful Delivery') ||
    eventName.includes('Completed') ||
    eventName.includes('Delivered')
  ) {
    return { status: 'Processed', seos: 'Successful Delivery', isSuccess: true, isReturn: false };
  }

  // Return
  if (
    eventName.includes('Returned to Sender') ||
    eventName.includes('Cancelled') ||
    eventName.includes('Return') ||
    eventName.includes('Return Success') ||
    eventName.includes('Return Assigned') ||
    eventName.includes('Order Cancelled')
  ) {
    return { status: 'Return', seos: 'Returned to Sender', isSuccess: false, isReturn: true };
  }

  // Pending Reschedule - keep as Pending but update SEOS
  if (eventName.includes('Pending Reschedule')) {
    return { status: 'Pending', seos: 'Pending Reschedule', isSuccess: false, isReturn: false };
  }

  // Other events - keep Pending status, update SEOS with event name
  return { status: 'Pending', seos: eventName, isSuccess: false, isReturn: false };
}

// Get WhatsApp template category based on event
// Used to prevent duplicate WhatsApp notifications for same category
function getWhatsAppTemplateCategory(eventName: string): string | null {
  const eventLower = eventName.toLowerCase();

  // Successful Delivery
  if (
    eventLower.includes('delivered') ||
    eventLower.includes('received by customer') ||
    eventLower.includes('left at doorstep') ||
    eventLower.includes('collected by customer')
  ) {
    return 'delivered';
  }

  // Return / Cancelled
  if (eventLower.includes('return') || eventLower.includes('cancelled')) {
    return 'return';
  }

  // Picked Up
  if (eventLower.includes('picked up')) {
    return 'picked_up';
  }

  // On Vehicle for Delivery
  if (eventLower.includes('on vehicle') || eventLower.includes('out for delivery')) {
    return 'on_vehicle';
  }

  // In Transit (includes hub events)
  if (eventLower.includes('transit') || eventLower.includes('hub')) {
    return 'in_transit';
  }

  // Failed Delivery / Exception
  if (eventLower.includes('exception') || eventLower.includes('failed') || eventLower.includes('pending reschedule')) {
    return 'failed';
  }

  return null;
}

// Get WhatsApp message template based on event
function getWhatsAppMessage(
  eventName: string,
  customerName: string,
  trackingNumber: string,
  idSale: string
): string | null {
  const eventLower = eventName.toLowerCase();

  // Successful Delivery - Thank you message
  if (
    eventLower.includes('delivered') ||
    eventLower.includes('received by customer') ||
    eventLower.includes('left at doorstep') ||
    eventLower.includes('collected by customer')
  ) {
    return `Alhamdulillah! Pesanan anda telah berjaya dihantar! 🎉

No. Pesanan: ${idSale}
No. Tracking: ${trackingNumber}

Terima kasih kerana membeli dari kami. Kami amat menghargai sokongan anda!

Jika ada sebarang masalah dengan produk, sila hubungi kami.

Jumpa lagi! 💚
DFR EMPIRE`;
  }

  // Return / Cancelled - Sorry message
  if (
    eventLower.includes('return') ||
    eventLower.includes('cancelled')
  ) {
    return `Maaf, pesanan anda telah dipulangkan kepada kami. 😔

No. Pesanan: ${idSale}
No. Tracking: ${trackingNumber}
Status: ${eventName}

Kami mohon maaf atas kesulitan ini. Sila hubungi kami jika anda masih berminat untuk menerima pesanan ini.

DFR EMPIRE`;
  }

  // Picked Up
  if (eventLower.includes('picked up')) {
    return `Pesanan anda telah dipickup oleh kurier!

No. Pesanan: ${idSale}
No. Tracking: ${trackingNumber}

Track di sini:
https://www.ninjavan.co/en-my/tracking?id=${trackingNumber}

Terima kasih!
DFR EMPIRE`;
  }

  // On Vehicle for Delivery
  if (eventLower.includes('on vehicle') || eventLower.includes('out for delivery')) {
    return `Pesanan anda sedang dalam penghantaran hari ini!

No. Pesanan: ${idSale}
No. Tracking: ${trackingNumber}

Sila pastikan anda ada di rumah untuk menerima parcel.

Track di sini:
https://www.ninjavan.co/en-my/tracking?id=${trackingNumber}

Terima kasih!
DFR EMPIRE`;
  }

  // In Transit
  if (eventLower.includes('transit') || eventLower.includes('hub')) {
    return `Pesanan anda sedang dalam perjalanan!

No. Pesanan: ${idSale}
No. Tracking: ${trackingNumber}

Track di sini:
https://www.ninjavan.co/en-my/tracking?id=${trackingNumber}

Terima kasih!
DFR EMPIRE`;
  }

  // Failed Delivery / Exception - need to reschedule
  if (eventLower.includes('exception') || eventLower.includes('failed') || eventLower.includes('pending reschedule')) {
    return `Maaf, terdapat masalah dengan penghantaran pesanan anda.

No. Pesanan: ${idSale}
No. Tracking: ${trackingNumber}
Status: ${eventName}

Kurier akan cuba hantar semula. Sila pastikan anda ada di rumah.

Track di sini:
https://www.ninjavan.co/en-my/tracking?id=${trackingNumber}

DFR EMPIRE`;
  }

  // For other events, don't send WhatsApp
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
    // Get marketer's profile
    const { data: marketer } = await supabase
      .from('profiles')
      .select('id')
      .eq('idstaff', marketerIdStaff)
      .single();

    if (!marketer) {
      return { success: false, error: 'Marketer not found' };
    }

    // Get marketer's device settings
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

    console.log('WhatsApp message sent successfully to:', customerPhone);
    return { success: true, instanceId };
  } catch (error: any) {
    console.error('WhatsApp send error:', error);
    return { success: false, error: error.message };
  }
}

// Send WhatsApp image message using Whacenter API (POST with JSON body + type field)
async function sendWhatsAppImage(
  instanceId: string,
  customerPhone: string,
  imageUrl: string,
  caption: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('Sending WhatsApp image via Whacenter:', { instance: instanceId, phone: customerPhone, imageUrl });

    // Use POST with JSON body - include "type": "image" to combine image+caption
    const payload = {
      device_id: instanceId,
      number: customerPhone,
      message: caption,
      file: imageUrl,
      type: 'image'
    };

    const response = await fetch('https://api.whacenter.com/api/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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

  try {
    const rawBody = await req.text();

    // Handle empty body (ping test)
    if (!rawBody || rawBody.trim() === '') {
      console.log('NinjaVan ping test received');
      return new Response(
        JSON.stringify({ success: true, message: 'Webhook endpoint is active' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let webhookData: NinjaVanWebhook;

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
    console.log('=== FULL NINJAVAN PAYLOAD ===');
    console.log(JSON.stringify(webhookData, null, 2));
    console.log('=== END NINJAVAN PAYLOAD ===');

    // Extract tracking number (NinjaVan sends either tracking_id or tracking_number)
    const trackingNumber = webhookData.tracking_id || webhookData.tracking_number;

    // Extract event - use 'event' field first (more detailed), fallback to 'status'
    // event: "Delivered, Received by Customer" vs status: "Delivered"
    const eventName = webhookData.event || webhookData.status || webhookData.event_name;

    // Extract comments/reason
    const comments = webhookData.comments || null;

    // Extract shipper reference (our merchant_order_number)
    const shipperRef = webhookData.shipper_order_ref_no || null;

    console.log('=== NinjaVan Webhook Received ===');
    console.log('Tracking:', trackingNumber);
    console.log('Event:', eventName);
    console.log('Shipper Ref:', shipperRef);
    console.log('Comments:', comments);

    if (!trackingNumber) {
      console.log('No tracking number in webhook');

      await supabase.from('webhook_logs').insert({
        webhook_type: 'ninjavan',
        request_method: 'POST',
        request_body: webhookData,
        error_message: 'No tracking number provided',
        response_status: 400,
        processing_time_ms: Date.now() - startTime
      });

      return new Response(
        JSON.stringify({ error: 'No tracking number provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!eventName) {
      console.log('No event/status in webhook');
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
        webhook_type: 'ninjavan',
        request_method: 'POST',
        request_body: webhookData,
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
        webhook_type: 'ninjavan',
        request_method: 'POST',
        request_body: webhookData,
        parsed_data: { trackingNumber, eventName },
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

    // Process NinjaVan status using your PHP logic
    // seos = notification tracking (ALL events), seo = collection tracking (only Success/Return)
    const { status: newDeliveryStatus, seos: newSeos, isSuccess, isReturn } = processNinjavanStatus(eventName);
    const previousStatus = order.delivery_status;
    const previousSeo = order.seo;
    const previousSeos = order.seos;

    // Build update object
    // - seos: Always update for notification tracking (all events)
    // - seo: Only update for Return or Successful Delivery (for Collection tracking)
    const updateData: any = {
      seos: newSeos,  // Always update SEOS with event (for notification tracking)
      nota_staff: comments || order.nota_staff  // Update nota_staff with comments if available
    };

    // Handle Successful Delivery - update seo for Collection tracking
    if (isSuccess) {
      updateData.seo = 'Successful Delivery';  // Collection confirmed
      console.log('Successful Delivery - updating both seo and seos');
    }
    // Handle Return - update seo for Collection tracking
    else if (isReturn) {
      updateData.seo = 'Return';  // Collection failed - returned
      updateData.delivery_status = 'Return';
      updateData.date_return = todayDate;
      console.log('Setting as Return with date_return:', todayDate);
    }
    // Other events - only update seos (notification), don't touch seo (Collection)
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

    // Get WhatsApp template categories to detect duplicates
    // Different NinjaVan events like "Arrived at Origin Hub" and "Arrived at Transit Hub"
    // have different SEO values but should only send ONE "In Transit" WhatsApp
    // NOTE: Use SEOS (notification column) for duplicate detection, not SEO (Collection column)
    const previousTemplateCategory = previousSeos ? getWhatsAppTemplateCategory(previousSeos) : null;
    const currentTemplateCategory = getWhatsAppTemplateCategory(eventName);

    console.log('WhatsApp template check:', {
      previousSeos,
      newSeos,
      previousTemplateCategory,
      currentTemplateCategory
    });

    // Skip WhatsApp if template category is the same (even if raw SEOS is different)
    // This prevents duplicate "In Transit" messages for different hub events
    if (previousTemplateCategory && currentTemplateCategory && previousTemplateCategory === currentTemplateCategory) {
      console.log('Skipping WhatsApp - same template category already sent:', {
        previousSeos,
        newSeos,
        category: currentTemplateCategory
      });
      whatsappSkipped = true;
    } else if (order.phone_customer && order.marketer_id_staff) {
      const message = getWhatsAppMessage(
        eventName,
        order.name_customer || 'Pelanggan',
        trackingNumber,
        order.id_sale || ''
      );

      if (message) {
        console.log('Sending WhatsApp notification for event:', eventName);
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
        console.log('No WhatsApp template for this event:', eventName);
      }
    }

    // Log successful webhook
    await supabase.from('webhook_logs').insert({
      webhook_type: 'ninjavan',
      request_method: 'POST',
      request_body: webhookData,
      parsed_data: {
        trackingNumber,
        eventName,
        comments,
        orderId: order.id,
        idSale: order.id_sale,
        marketerIdStaff: order.marketer_id_staff,
        customerName: order.name_customer,
        customerPhone: order.phone_customer,
        previousStatus,
        newStatus: updateData.delivery_status || previousStatus,
        previousSeo,
        newSeo: updateData.seo || previousSeo,  // seo only updates for Return/Successful Delivery (Collection)
        previousSeos,
        newSeos: newSeos,  // seos always updates (for notification tracking)
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
        event: eventName,
        seo: updateData.seo || previousSeo,  // Collection tracking (only Return/Successful Delivery)
        seos: newSeos,  // Notification tracking (all events)
        delivery_status: updateData.delivery_status || previousStatus,
        whatsapp_sent: whatsappSent
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('NinjaVan webhook error:', error);

    await supabase.from('webhook_logs').insert({
      webhook_type: 'ninjavan',
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
