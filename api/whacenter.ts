export const config = {
  runtime: 'nodejs',
}

const API_BASE = 'https://api.whacenter.com'
const API_KEY = 'd44ac50f-0bd8-4ed0-b85f-55465e08d7cf'

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const { endpoint, device_id, name, number, webhook } = req.query

  try {
    // Handle QR endpoint separately (returns raw PNG as base64)
    if (endpoint === 'qr') {
      const url = `${API_BASE}/api/qr?device_id=${encodeURIComponent(device_id as string)}`
      const qrResponse = await fetch(url, { method: 'GET', redirect: 'follow' })
      const qrBuffer = await qrResponse.arrayBuffer()
      const qrBase64 = Buffer.from(qrBuffer).toString('base64')

      // Check if response is a valid PNG (starts with PNG header)
      if (qrBase64.startsWith('iVBOR')) {
        return res.status(200).json({
          success: true,
          data: { image: qrBase64 }
        })
      }

      // If not PNG, try to parse as JSON error
      try {
        const textDecoder = new TextDecoder()
        const text = textDecoder.decode(Buffer.from(qrBase64, 'base64'))
        const errorData = JSON.parse(text)
        return res.status(200).json(errorData)
      } catch {
        return res.status(200).json({
          success: false,
          error: 'QR code not available'
        })
      }
    }

    // Handle all other endpoints
    let url = ''

    switch (endpoint) {
      case 'addDevice':
        url = `${API_BASE}/api/addDevice?api_key=${encodeURIComponent(API_KEY)}&name=${encodeURIComponent(name as string)}&number=${encodeURIComponent(number as string || '')}`
        break

      case 'setWebhook':
        url = `${API_BASE}/api/setWebhook?device_id=${encodeURIComponent(device_id as string)}&webhook=${encodeURIComponent(webhook as string)}`
        break

      case 'statusDevice':
        url = `${API_BASE}/api/statusDevice?device_id=${encodeURIComponent(device_id as string)}`
        break

      case 'deleteDevice':
        url = `${API_BASE}/api/deleteDevice?api_key=${encodeURIComponent(API_KEY)}&device_id=${encodeURIComponent(device_id as string)}`
        break

      case 'logoutDevice':
        // Logout device uses POST method with body
        const logoutResponse = await fetch(`${API_BASE}/api/logoutDevice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: API_KEY,
            device_id: device_id
          })
        })
        const logoutData = await logoutResponse.json()
        return res.status(200).json(logoutData)

      case 'send':
        const { number: sendNumber, message } = req.query
        url = `${API_BASE}/api/send?device_id=${encodeURIComponent(device_id as string)}&number=${encodeURIComponent(sendNumber as string)}&message=${encodeURIComponent(message as string)}`
        break

      default:
        return res.status(404).json({ error: 'Endpoint not found', endpoint })
    }

    const response = await fetch(url, { method: 'GET', redirect: 'follow' })
    const text = await response.text()

    let data
    try {
      data = JSON.parse(text)
    } catch {
      return res.status(200).json({
        success: false,
        error: 'Invalid JSON response from Whacenter',
        raw: text
      })
    }

    return res.status(200).json(data)

  } catch (error: any) {
    console.error('Whacenter proxy error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    })
  }
}
