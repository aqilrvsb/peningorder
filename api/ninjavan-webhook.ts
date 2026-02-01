import { createClient } from '@supabase/supabase-js'

export const config = {
  runtime: 'nodejs',
}

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY

const WHACENTER_API = 'https://api.whacenter.com/api'

// Send WhatsApp message via Whacenter
async function sendWhatsApp(instance: string, phone: string, message: string): Promise<boolean> {
  try {
    // Format phone number (ensure it starts with country code)
    let formattedPhone = phone.replace(/\D/g, '')
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '60' + formattedPhone.substring(1)
    }
    if (!formattedPhone.startsWith('60')) {
      formattedPhone = '60' + formattedPhone
    }

    const url = `${WHACENTER_API}/send?device_id=${encodeURIComponent(instance)}&number=${encodeURIComponent(formattedPhone)}&message=${encodeURIComponent(message)}`

    const response = await fetch(url, { method: 'GET' })
    const data = await response.json()

    console.log('WhatsApp send result:', data)
    return data.status === true || data.success === true
  } catch (error) {
    console.error('Failed to send WhatsApp:', error)
    return false
  }
}

// Send WhatsApp message with image via Whacenter
async function sendWhatsAppWithImage(instance: string, phone: string, imageUrl: string, caption: string): Promise<boolean> {
  try {
    // Format phone number (ensure it starts with country code)
    let formattedPhone = phone.replace(/\D/g, '')
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '60' + formattedPhone.substring(1)
    }
    if (!formattedPhone.startsWith('60')) {
      formattedPhone = '60' + formattedPhone
    }

    const url = `${WHACENTER_API}/send?device_id=${encodeURIComponent(instance)}&number=${encodeURIComponent(formattedPhone)}&message=${encodeURIComponent(caption)}&file=${encodeURIComponent(imageUrl)}`

    const response = await fetch(url, { method: 'GET' })
    const data = await response.json()

    console.log('WhatsApp image send result:', data)
    return data.status === true || data.success === true
  } catch (error) {
    console.error('Failed to send WhatsApp image:', error)
    return false
  }
}

/**
 * Ninjavan Webhook Handler
 *
 * Webhook URL: https://your-domain.vercel.app/api/ninjavan-webhook
 *
 * Expected payload from Ninjavan:
 * {
 *   "tracking_id": "NJVMY123456789",
 *   "event": "On Vehicle for Delivery"
 * }
 *
 * Logic:
 * 1. Find order by tracking_id (no_tracking column)
 * 2. Update SEO column with event value
 * 3. If event contains "Delivered" -> SEO = "Successful Delivery", tarikh_bayaran = today
 * 4. If event = "Returned To Sender" -> delivery_status = "Return", date_return = today
 */

// Process event status
function processEvent(event: string): { seo: string; isSuccess: boolean; isReturn: boolean } {
  const eventLower = event.toLowerCase()

  // Check if event contains "delivered" (any delivered status)
  if (eventLower.includes('delivered')) {
    return { seo: 'Successful Delivery', isSuccess: true, isReturn: false }
  }

  // Check if event is "Returned To Sender"
  if (eventLower === 'returned to sender' || eventLower.includes('returned to sender')) {
    return { seo: 'Return', isSuccess: false, isReturn: true }
  }

  // All other events - just save as SEO
  return { seo: event, isSuccess: false, isReturn: false }
}

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    // Parse webhook data from POST body
    const webhookData = req.body || {}
    const { tracking_id, event } = webhookData

    console.log('Ninjavan webhook received:', { tracking_id, event })

    if (!tracking_id) {
      return res.status(400).json({
        success: false,
        error: 'tracking_id is required'
      })
    }

    if (!event) {
      return res.status(400).json({
        success: false,
        error: 'event is required'
      })
    }

    // Initialize Supabase
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase credentials not configured')
      return res.status(500).json({
        success: false,
        error: 'Database not configured'
      })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Find order by tracking number
    const { data: orders, error: orderError } = await supabase
      .from('customer_orders')
      .select('*, marketer_id')
      .eq('no_tracking', tracking_id)
      .limit(1)

    if (orderError) {
      console.error('Error finding order:', orderError)
      return res.status(500).json({
        success: false,
        error: 'Failed to find order'
      })
    }

    if (!orders || orders.length === 0) {
      console.log('Order not found for tracking_id:', tracking_id)
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        tracking_id
      })
    }

    const order = orders[0]

    // Process event status
    const processedEvent = processEvent(event)

    // Prepare update data
    const updateData: any = {
      seo: processedEvent.seo,
      updated_at: new Date().toISOString()
    }

    const today = new Date().toISOString().split('T')[0]

    // If delivered -> update tarikh_bayaran to today and delivery_status to Shipped
    if (processedEvent.isSuccess) {
      updateData.tarikh_bayaran = today
      updateData.delivery_status = 'Shipped'
    }

    // If returned -> update delivery_status to Return and date_return to today
    if (processedEvent.isReturn) {
      updateData.delivery_status = 'Return'
      updateData.date_return = today
    }

    console.log('Updating order:', order.id, 'with data:', updateData)

    // Update order
    const { error: updateError } = await supabase
      .from('customer_orders')
      .update(updateData)
      .eq('id', order.id)

    if (updateError) {
      console.error('Error updating order:', updateError)
      return res.status(500).json({
        success: false,
        error: 'Failed to update order'
      })
    }

    console.log('Order updated successfully:', order.no_tracking)

    // Send WhatsApp notification to customer
    let whatsappSent = false
    let usageInstructionsSent = false

    if (order.marketer_id && order.no_phone) {
      // Get marketer's device setting
      const { data: deviceSettings } = await supabase
        .from('device_setting')
        .select('instance, status_wa')
        .eq('user_id', order.marketer_id)
        .eq('status_wa', 'connected')
        .limit(1)

      if (deviceSettings && deviceSettings.length > 0 && deviceSettings[0].instance) {
        const instance = deviceSettings[0].instance

        // Send the event as the message
        whatsappSent = await sendWhatsApp(instance, order.no_phone, event)
        console.log('WhatsApp notification sent:', whatsappSent)

        // If successful delivery, send usage instructions with image
        if (processedEvent.isSuccess) {
          // Get base URL from environment or construct from request
          const baseUrl = process.env.VITE_APP_URL || process.env.APP_URL || process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'https://marketerpro-suite-main.vercel.app'

          const imageUrl = `${baseUrl}/caramakan.jpeg`
          const usageMessage = `Ni cara penggunaan ya akak. Make sure cukup air masak tau. Masa period tak digalakkan consume , boleh stop sementara waktu . Kalau akak dah menopause , boleh consume hari4 macam biasa

join group ini : https://chat.whatsapp.com/H5pW50lXnF10ErOi2HAyRm

tolong join yaa..`

          usageInstructionsSent = await sendWhatsAppWithImage(instance, order.no_phone, imageUrl, usageMessage)
          console.log('Usage instructions sent:', usageInstructionsSent)
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Order updated successfully',
      order_id: order.id,
      tracking_id: order.no_tracking,
      event: event,
      processed: processedEvent,
      whatsapp_sent: whatsappSent,
      usage_instructions_sent: usageInstructionsSent
    })

  } catch (error: any) {
    console.error('Ninjavan webhook error:', error)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    })
  }
}
