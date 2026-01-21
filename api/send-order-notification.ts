import { createClient } from '@supabase/supabase-js'

export const config = {
  runtime: 'nodejs',
}

const WHACENTER_API = 'https://api.whacenter.com/api'

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY

// Send WhatsApp message via Whacenter
async function sendWhatsApp(instance: string, phone: string, message: string): Promise<{ success: boolean; response?: any; error?: string }> {
  try {
    let formattedPhone = phone.replace(/\D/g, '')
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '60' + formattedPhone.substring(1)
    }
    if (!formattedPhone.startsWith('60')) {
      formattedPhone = '60' + formattedPhone
    }

    const url = `${WHACENTER_API}/send?device_id=${encodeURIComponent(instance)}&number=${encodeURIComponent(formattedPhone)}&message=${encodeURIComponent(message)}`
    console.log('WhatsApp API URL:', url)

    const response = await fetch(url, { method: 'GET' })
    const data = await response.json()
    console.log('WhatsApp send result:', data)

    const success = data.status === true || data.success === true
    return { success, response: data }
  } catch (error: any) {
    console.error('Failed to send WhatsApp:', error)
    return { success: false, error: error.message }
  }
}

// Save notification log to database
async function saveNotificationLog(
  supabase: any,
  logData: {
    webhook_type: string
    request_method: string
    request_body: any
    device_id?: string
    message?: string
    parsed_data?: any
    response_status: number
    response_body: any
    error_message?: string
    processing_time_ms: number
  }
) {
  try {
    await supabase.from('webhook_logs').insert({
      webhook_type: logData.webhook_type,
      request_method: logData.request_method,
      request_body: logData.request_body,
      device_id: logData.device_id || null,
      message: logData.message || null,
      parsed_data: logData.parsed_data || null,
      response_status: logData.response_status,
      response_body: logData.response_body,
      error_message: logData.error_message || null,
      processing_time_ms: logData.processing_time_ms
    })
  } catch (err) {
    console.error('Failed to save notification log:', err)
  }
}

/**
 * API Endpoint to send order notification via WhatsApp
 * Called from frontend when order is created manually
 *
 * POST /api/send-order-notification
 * Body: { tracking_number: string } or { order: OrderData, marketer_id: string }
 */
export default async function handler(req: any, res: any) {
  const startTime = Date.now()

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Initialize Supabase early for logging
  let supabase: any = null
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey)
  }

  try {
    const { tracking_number, order, marketer_id } = req.body

    console.log('=== SEND ORDER NOTIFICATION ===')
    console.log('Request body:', JSON.stringify(req.body, null, 2))

    if (!tracking_number && !order) {
      const response = {
        success: false,
        error: 'tracking_number or order object is required'
      }

      if (supabase) {
        await saveNotificationLog(supabase, {
          webhook_type: 'notification',
          request_method: req.method,
          request_body: req.body,
          response_status: 400,
          response_body: response,
          error_message: 'tracking_number or order object is required',
          processing_time_ms: Date.now() - startTime
        })
      }

      return res.status(400).json(response)
    }

    // Initialize Supabase
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase credentials not configured')
      return res.status(500).json({
        success: false,
        error: 'Database not configured'
      })
    }

    let orderData = order
    let orderMarketerId = marketer_id

    // If tracking_number provided, fetch from database
    if (tracking_number) {
      console.log('Fetching order by tracking_number:', tracking_number)
      const { data: fetchedOrder, error: orderError } = await supabase
        .from('customer_orders')
        .select('*')
        .eq('no_tracking', tracking_number)
        .single()

      if (orderError || !fetchedOrder) {
        console.log('Order not found:', orderError)
        const response = {
          success: false,
          error: 'Order not found'
        }

        if (supabase) {
          await saveNotificationLog(supabase, {
            webhook_type: 'notification',
            request_method: req.method,
            request_body: req.body,
            response_status: 404,
            response_body: response,
            error_message: 'Order not found',
            processing_time_ms: Date.now() - startTime
          })
        }

        return res.status(404).json(response)
      }

      orderData = fetchedOrder
      orderMarketerId = fetchedOrder.marketer_id
      console.log('Found order:', fetchedOrder.no_tempahan)
    }

    if (!orderMarketerId) {
      console.log('No marketer_id provided')
      const response = {
        success: false,
        error: 'Marketer ID is required'
      }

      if (supabase) {
        await saveNotificationLog(supabase, {
          webhook_type: 'notification',
          request_method: req.method,
          request_body: req.body,
          parsed_data: orderData,
          response_status: 400,
          response_body: response,
          error_message: 'Marketer ID is required',
          processing_time_ms: Date.now() - startTime
        })
      }

      return res.status(400).json(response)
    }

    console.log('Looking for device setting for marketer_id:', orderMarketerId)

    // Get marketer's device setting
    const { data: deviceSettings, error: deviceError } = await supabase
      .from('device_setting')
      .select('instance, status_wa, device_id, phone_number')
      .eq('user_id', orderMarketerId)
      .limit(1)

    console.log('Device settings query result:', { deviceSettings, deviceError })

    if (!deviceSettings || deviceSettings.length === 0) {
      console.log('No device setting found for marketer')
      const response = {
        success: false,
        error: 'Marketer does not have a WhatsApp device configured',
        whatsapp_sent: false,
        debug: {
          marketer_id: orderMarketerId,
          device_found: false
        }
      }

      if (supabase) {
        await saveNotificationLog(supabase, {
          webhook_type: 'notification',
          request_method: req.method,
          request_body: req.body,
          parsed_data: orderData,
          response_status: 200,
          response_body: response,
          error_message: 'No WhatsApp device configured',
          processing_time_ms: Date.now() - startTime
        })
      }

      return res.status(200).json(response)
    }

    const deviceSetting = deviceSettings[0]
    console.log('Device setting found:', {
      instance: deviceSetting.instance,
      status_wa: deviceSetting.status_wa,
      device_id: deviceSetting.device_id
    })

    if (deviceSetting.status_wa !== 'connected') {
      console.log('Device not connected. Status:', deviceSetting.status_wa)
      const response = {
        success: false,
        error: `WhatsApp device is not connected. Current status: ${deviceSetting.status_wa}`,
        whatsapp_sent: false,
        debug: {
          marketer_id: orderMarketerId,
          device_found: true,
          status_wa: deviceSetting.status_wa,
          instance: deviceSetting.instance
        }
      }

      if (supabase) {
        await saveNotificationLog(supabase, {
          webhook_type: 'notification',
          request_method: req.method,
          request_body: req.body,
          device_id: deviceSetting.instance,
          parsed_data: orderData,
          response_status: 200,
          response_body: response,
          error_message: `Device not connected: ${deviceSetting.status_wa}`,
          processing_time_ms: Date.now() - startTime
        })
      }

      return res.status(200).json(response)
    }

    if (!deviceSetting.instance) {
      console.log('Device instance is empty')
      const response = {
        success: false,
        error: 'WhatsApp device instance ID is missing',
        whatsapp_sent: false,
        debug: {
          marketer_id: orderMarketerId,
          device_found: true,
          status_wa: deviceSetting.status_wa,
          instance: null
        }
      }

      if (supabase) {
        await saveNotificationLog(supabase, {
          webhook_type: 'notification',
          request_method: req.method,
          request_body: req.body,
          parsed_data: orderData,
          response_status: 200,
          response_body: response,
          error_message: 'Device instance ID is missing',
          processing_time_ms: Date.now() - startTime
        })
      }

      return res.status(200).json(response)
    }

    // Generate message using new template
    const customerName = orderData.customer_name || orderData.marketer_name || '';
    const phoneCustomer = orderData.phone_customer || orderData.no_phone || '';
    const addressFull = orderData.address_full || '';
    const productName = orderData.product_name || orderData.produk || '';
    const bundleName = orderData.bundle_name || orderData.produk || '';
    const totalPrice = parseFloat(orderData.total_price || orderData.harga_jualan_sebenar || 0).toFixed(2);
    const paymentMethod = orderData.payment_method || orderData.cara_bayaran || '';
    const idSale = orderData.id_sale || '-';

    const message = `Salam ${customerName}. Kami telah menerima Tempahan Cik berkenaan ${productName}. 😊

Berikut adalah detail tempahan cik ${customerName} ✅

ORDER ID : ${idSale}
NAMA : ${customerName}
ALAMAT : ${addressFull}
NO TELEFON : ${phoneCustomer}
PRODUK : ${bundleName}
HARGA : RM${totalPrice}
CARA BAYARAN : ${paymentMethod}

Sila Semak Maklumat berikut. Sekiranya Anda Dapati Ada Kesalahan Maklumat Sila Maklumkan Pada Su Yer...

✅ 𝐍𝐚𝐧𝐭𝐢 𝐚𝐤𝐚𝐧 𝐚𝐝𝐚 penghantaran status parcel dari semasa ke semasa 𝐧𝐚𝐧𝐭𝐢 𝐲𝐞..

Oh Yaaa! Jangan Lupa Save Nombor Saya Yer...`

    console.log('Sending WhatsApp message to:', orderData.no_phone)
    console.log('Using instance:', deviceSetting.instance)

    // Send WhatsApp
    const whatsappResult = await sendWhatsApp(
      deviceSetting.instance,
      orderData.no_phone,
      message
    )

    const response = {
      success: true,
      whatsapp_sent: whatsappResult.success,
      message: whatsappResult.success ? 'Notification sent successfully' : 'Failed to send notification',
      debug: {
        marketer_id: orderMarketerId,
        device_found: true,
        status_wa: deviceSetting.status_wa,
        instance: deviceSetting.instance,
        whacenter_response: whatsappResult.response,
        whacenter_error: whatsappResult.error
      }
    }

    if (supabase) {
      await saveNotificationLog(supabase, {
        webhook_type: 'notification',
        request_method: req.method,
        request_body: req.body,
        device_id: deviceSetting.instance,
        message: message,
        parsed_data: orderData,
        response_status: 200,
        response_body: response,
        error_message: whatsappResult.success ? null : (whatsappResult.error || 'WhatsApp send failed'),
        processing_time_ms: Date.now() - startTime
      })
    }

    console.log('=== NOTIFICATION RESULT ===')
    console.log(JSON.stringify(response, null, 2))

    return res.status(200).json(response)

  } catch (error: any) {
    console.error('Send notification error:', error)
    const response = {
      success: false,
      error: 'Internal server error',
      details: error.message
    }

    if (supabase) {
      await saveNotificationLog(supabase, {
        webhook_type: 'notification',
        request_method: req.method,
        request_body: req.body,
        response_status: 500,
        response_body: response,
        error_message: error.message,
        processing_time_ms: Date.now() - startTime
      })
    }

    return res.status(500).json(response)
  }
}
