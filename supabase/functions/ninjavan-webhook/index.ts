import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// NinjaVan webhook event interface
interface NinjaVanWebhook {
  tracking_id?: string;
  tracking_number?: string;
  status?: string;
  event_name?: string;
  previous_status?: string;
  timestamp?: string;
  shipper_id?: string;
  comments?: string;
}

// Process NinjaVan status - matching your PHP logic exactly
function processNinjavanStatus(eventName: string): { status: string; seo: string } {
  // Successful Delivery
  if (
    eventName.includes('Successful Delivery') ||
    eventName.includes('Completed') ||
    eventName.includes('Delivered')
  ) {
    return { status: 'Processed', seo: 'Successful Delivery' };
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
    return { status: 'Return', seo: 'Returned to Sender' };
  }

  // Pending Reschedule - keep as Pending but update SEO
  if (eventName.includes('Pending Reschedule')) {
    return { status: 'Pending', seo: 'Pending Reschedule' };
  }

  // Other events - keep Pending status, update SEO with event name
  return { status: 'Pending', seo: eventName };
}

// Get WhatsApp message template based on event (only for non-final events)
function getWhatsAppMessage(
  eventName: string,
  customerName: string,
  trackingNumber: string,
  idSale: string
): string | null {
  const eventLower = eventName.toLowerCase();

  // Don't send WhatsApp for Successful Delivery or Return - those are final statuses
  if (
    eventLower.includes('successful delivery') ||
    eventLower.includes('completed') ||
    eventLower.includes('delivered') ||
    eventLower.includes('return')
  ) {
    return null;
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
): Promise<{ success: boolean; error?: string }> {
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

    // Send message via Whacenter API
    const response = await fetch('https://app.whacenter.com/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceSetting.device_id,
        number: customerPhone,
        message: message
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('WhatsApp send failed:', errorText);
      return { success: false, error: errorText };
    }

    console.log('WhatsApp message sent successfully to:', customerPhone);
    return { success: true };
  } catch (error: any) {
    console.error('WhatsApp send error:', error);
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

    // Extract tracking number (NinjaVan sends either tracking_id or tracking_number)
    const trackingNumber = webhookData.tracking_id || webhookData.tracking_number;

    // Extract event/status (NinjaVan sends either status or event_name)
    const eventName = webhookData.status || webhookData.event_name;

    // Extract comments/reason
    const comments = webhookData.comments || null;

    console.log('=== NinjaVan Webhook Received ===');
    console.log('Tracking:', trackingNumber);
    console.log('Event:', eventName);
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
      .select('id, id_sale, marketer_id_staff, name_customer, phone_customer, delivery_status, seo')
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
      currentSeo: order.seo
    });

    // Process NinjaVan status using your PHP logic
    const { status: newDeliveryStatus, seo: newSeo } = processNinjavanStatus(eventName);
    const previousStatus = order.delivery_status;
    const previousSeo = order.seo;

    // Build update object
    const updateData: any = {
      seo: newSeo,  // Always update SEO with event
      nota_staff: comments || order.nota_staff  // Update nota_staff with comments if available
    };

    // Handle Successful Delivery - only update seo, don't change delivery_status or date_processed
    // date_processed is set by logistic when they process the order
    if (newDeliveryStatus === 'Processed') {
      // Only update seo to 'Successful Delivery', keep delivery_status as is
      console.log('Successful Delivery - updating seo only');
    }
    // Handle Return
    else if (newDeliveryStatus === 'Return') {
      updateData.delivery_status = 'Return';
      updateData.date_return = todayDate;
      console.log('Setting as Return with date_return:', todayDate);
    }
    // Other events - don't change delivery_status, just update SEO

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
        newSeo
      });
    }

    // Send WhatsApp notification for non-final events only
    let whatsappSent = false;
    let whatsappError = '';

    if (order.phone_customer && order.marketer_id_staff) {
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
      } else {
        console.log('No WhatsApp for this event (final status):', eventName);
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
        newSeo,
        whatsappSent,
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
        seo: newSeo,
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
