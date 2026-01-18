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
  // Additional fields that might be sent
  to_name?: string;
  to_address1?: string;
  to_postcode?: string;
}

// Map NinjaVan status to delivery_status in our database
function mapDeliveryStatus(ninjaStatus: string): string {
  const statusLower = ninjaStatus.toLowerCase();

  // Delivered statuses
  if (statusLower.includes('delivered') || statusLower.includes('completed')) {
    return 'Delivered';
  }

  // Out for delivery
  if (statusLower.includes('on vehicle') || statusLower.includes('out for delivery')) {
    return 'Out for Delivery';
  }

  // In transit
  if (statusLower.includes('transit') || statusLower.includes('arrived') || statusLower.includes('hub')) {
    return 'In Transit';
  }

  // Picked up
  if (statusLower.includes('picked up') || statusLower.includes('pickup')) {
    return 'Picked Up';
  }

  // Return / Failed
  if (statusLower.includes('return') || statusLower.includes('rts') || statusLower.includes('returned')) {
    return 'Returned';
  }

  // Cancelled
  if (statusLower.includes('cancel')) {
    return 'Cancelled';
  }

  // Exception / Problem
  if (statusLower.includes('exception') || statusLower.includes('failed') || statusLower.includes('lost')) {
    return 'Exception';
  }

  // Pending (default)
  return 'Pending';
}

// Get WhatsApp message template based on event
function getWhatsAppMessage(
  eventName: string,
  customerName: string,
  trackingNumber: string,
  idSale: string
): string | null {
  const eventLower = eventName.toLowerCase();

  // Picked Up
  if (eventLower.includes('picked up')) {
    return `Assalamualaikum ${customerName},

Pesanan anda telah dipickup oleh kurier!

No. Pesanan: ${idSale}
No. Tracking: ${trackingNumber}

Track di sini:
https://www.ninjavan.co/en-my/tracking?id=${trackingNumber}

Terima kasih!
DFR EMPIRE`;
  }

  // On Vehicle for Delivery
  if (eventLower.includes('on vehicle') || eventLower.includes('out for delivery')) {
    return `Assalamualaikum ${customerName},

Pesanan anda sedang dalam penghantaran!

No. Pesanan: ${idSale}
No. Tracking: ${trackingNumber}

Sila pastikan anda ada di rumah untuk menerima parcel.

Track di sini:
https://www.ninjavan.co/en-my/tracking?id=${trackingNumber}

Terima kasih!
DFR EMPIRE`;
  }

  // Delivered
  if (eventLower.includes('delivered') && !eventLower.includes('exception')) {
    return `Assalamualaikum ${customerName},

Pesanan anda telah berjaya dihantar!

No. Pesanan: ${idSale}
No. Tracking: ${trackingNumber}

Terima kasih kerana membeli dari kami. Jika ada sebarang masalah, sila hubungi kami.

DFR EMPIRE`;
  }

  // Failed Delivery / Exception
  if (eventLower.includes('exception') || eventLower.includes('failed')) {
    return `Assalamualaikum ${customerName},

Maaf, terdapat masalah dengan penghantaran pesanan anda.

No. Pesanan: ${idSale}
No. Tracking: ${trackingNumber}
Status: ${eventName}

Sila hubungi kami untuk maklumat lanjut.

DFR EMPIRE`;
  }

  // Return to Sender
  if (eventLower.includes('return') || eventLower.includes('rts')) {
    return `Assalamualaikum ${customerName},

Pesanan anda sedang dikembalikan kepada pengirim.

No. Pesanan: ${idSale}
No. Tracking: ${trackingNumber}

Sila hubungi kami untuk aturkan penghantaran semula.

DFR EMPIRE`;
  }

  // Don't send for other events
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

    console.log('=== NinjaVan Webhook Received ===');
    console.log('Tracking:', trackingNumber);
    console.log('Event:', eventName);
    console.log('Raw data:', JSON.stringify(webhookData).substring(0, 500));

    if (!trackingNumber) {
      console.log('No tracking number in webhook');

      // Log webhook even without tracking
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
      .select('id, id_sale, marketer_id_staff, name_customer, phone_customer, delivery_status')
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
      customer: order.name_customer
    });

    // Map NinjaVan status to our delivery_status
    const newDeliveryStatus = mapDeliveryStatus(eventName);
    const previousStatus = order.delivery_status;

    // Update order delivery status
    const { error: updateError } = await supabase
      .from('customer_purchases')
      .update({
        delivery_status: newDeliveryStatus,
        // If delivered, set date_processed
        ...(newDeliveryStatus === 'Delivered' ? { date_processed: new Date().toISOString().split('T')[0] } : {}),
        // If returned, set date_return
        ...(newDeliveryStatus === 'Returned' ? { date_return: new Date().toISOString().split('T')[0] } : {})
      })
      .eq('id', order.id);

    if (updateError) {
      console.error('Error updating order:', updateError);
    } else {
      console.log('Order status updated:', previousStatus, '->', newDeliveryStatus);
    }

    // Send WhatsApp notification to customer
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
        console.log('Sending WhatsApp notification...');
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
        console.log('No WhatsApp message template for event:', eventName);
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
        orderId: order.id,
        idSale: order.id_sale,
        marketerIdStaff: order.marketer_id_staff,
        customerName: order.name_customer,
        customerPhone: order.phone_customer,
        previousStatus,
        newStatus: newDeliveryStatus,
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
        previous_status: previousStatus,
        new_status: newDeliveryStatus,
        whatsapp_sent: whatsappSent
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('NinjaVan webhook error:', error);

    // Log error
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
