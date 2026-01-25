# DFR Empire Webhook Documentation

## Base URL
```
https://your-domain.vercel.app
```

---

## 1. Ninjavan Webhook (Delivery Status Updates)

### Endpoint
```
POST /api/ninjavan-webhook
```

### Description
Receives delivery status updates from Ninjavan and updates order status accordingly. Also sends WhatsApp notification to customer.

### Headers
```
Content-Type: application/json
```

### Request Body
```json
{
  "tracking_id": "NJVMY123456789",
  "event": "On Vehicle for Delivery"
}
```

### Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tracking_id | string | Yes | Ninjavan tracking number (matches `no_tracking` in database) |
| event | string | Yes | Delivery event/status from Ninjavan |

### Event Processing Logic
| Event Contains | SEO Value | delivery_status | Other Updates |
|----------------|-----------|-----------------|---------------|
| "delivered" (case insensitive) | Successful Delivery | Shipped | tarikh_bayaran = today |
| "returned to sender" (case insensitive) | Return | Return | date_return = today |
| Other events | [event value] | (unchanged) | - |

### Postman Test
```
Method: POST
URL: https://your-domain.vercel.app/api/ninjavan-webhook
Headers:
  Content-Type: application/json
Body (raw JSON):
{
  "tracking_id": "NJVMY123456789",
  "event": "On Vehicle for Delivery"
}
```

### Test Scenarios

**Test 1: Normal status update**
```json
{
  "tracking_id": "NJVMY123456789",
  "event": "On Vehicle for Delivery"
}
```

**Test 2: Delivered (triggers success)**
```json
{
  "tracking_id": "NJVMY123456789",
  "event": "Delivered, Received By Customer"
}
```

**Test 3: Returned (triggers return)**
```json
{
  "tracking_id": "NJVMY123456789",
  "event": "Returned To Sender"
}
```

### Success Response
```json
{
  "success": true,
  "message": "Order updated successfully",
  "order_id": "uuid-here",
  "tracking_id": "NJVMY123456789",
  "event": "On Vehicle for Delivery",
  "processed": {
    "seo": "On Vehicle for Delivery",
    "isSuccess": false,
    "isReturn": false
  },
  "whatsapp_sent": true
}
```

### Error Responses
```json
// Missing tracking_id
{
  "success": false,
  "error": "tracking_id is required"
}

// Missing event
{
  "success": false,
  "error": "event is required"
}

// Order not found
{
  "success": false,
  "error": "Order not found",
  "tracking_id": "NJVMY123456789"
}
```

---

## 2. Order Webhook (Auto Key-in from WhatsApp)

### Endpoint
```
POST /api/webhook-order
```

### Description
Automatically creates orders from WhatsApp messages via Whacenter webhook. Parses `#order` format messages and creates order in database.

### Headers
```
Content-Type: application/json
```

### Request Body (from Whacenter)
```json
{
  "device_id": "whacenter-device-id",
  "message": "#order\nnama: AHMAD BIN ALI\nphone: 60123456789\nalamat: NO 123 JALAN ABC TAMAN XYZ\nposkod: 50000\nbandar: KUALA LUMPUR\nnegeri: Selangor\nproduk: Bundle A\nkuantiti: 1\nharga: 150\nplatform: FB\nbayaran: COD"
}
```

### Message Format
```
#order
nama: [Customer Name]
phone: [Phone Number - 60xxxxxxxxx]
alamat: [Full Address]
poskod: [Postcode]
bandar: [City]
negeri: [State]
produk: [Product/Bundle Name]
kuantiti: [Quantity]
harga: [Price]
platform: [FB/Shopee/Tiktok/Database/Google]
bayaran: [CASH/COD]
```

### Field Aliases (Alternative Keywords)
| Field | Aliases |
|-------|---------|
| nama | name |
| phone | telefon, hp |
| alamat | address |
| poskod | postcode |
| bandar | city |
| negeri | state |
| produk | product |
| kuantiti | qty, quantity |
| harga | price |

### Platform Values
| Input | Stored Value |
|-------|--------------|
| fb, facebook | Facebook |
| shopee | Shopee |
| tiktok, tik tok | Tiktok |
| database, db | Database |
| google | Google |

### Postman Test
```
Method: POST
URL: https://your-domain.vercel.app/api/webhook-order
Headers:
  Content-Type: application/json
Body (raw JSON):
{
  "device_id": "your-whacenter-device-id",
  "message": "#order\nnama: AHMAD BIN ALI\nphone: 60123456789\nalamat: NO 123 JALAN ABC\nposkod: 50000\nbandar: KUALA LUMPUR\nnegeri: Selangor\nproduk: Bundle A\nkuantiti: 1\nharga: 150\nplatform: FB\nbayaran: COD"
}
```

### Success Response
```json
{
  "success": true,
  "message": "Order saved successfully",
  "order": {
    "id": "uuid-here",
    "no_tempahan": "081224-12345",
    "nama": "AHMAD BIN ALI",
    "phone": "0123456789",
    "produk": "Bundle A",
    "harga": 150,
    "platform": "Facebook",
    "bayaran": "COD",
    "marketer": "STAFF001"
  },
  "whatsapp_sent": true
}
```

### WhatsApp Notification Sent to Customer
```
*Pesanan Anda Sudah Ditempah*

Nama : AHMAD BIN ALI
Phone : 0123456789
Pakej : Bundle A
Tarikh Membeli : 8/12/2024
Harga Jualan : RM150.00
Cara Bayaran : COD
```

### Error Responses
```json
// Invalid message format
{
  "success": false,
  "message": "Message is not a valid order format",
  "hint": "Format: #order\nnama: [name]\n..."
}

// Cannot identify marketer
{
  "success": false,
  "error": "Could not identify marketer from device_id"
}
```

---

## 3. Send Order Notification (Manual Trigger)

### Endpoint
```
POST /api/send-order-notification
```

### Description
Sends WhatsApp notification to customer for an existing order. Used by frontend after manual order creation.

### Headers
```
Content-Type: application/json
```

### Request Body - Option 1: By Tracking Number
```json
{
  "tracking_number": "NJVMY123456789"
}
```

### Request Body - Option 2: By Order Data
```json
{
  "order": {
    "marketer_name": "AHMAD BIN ALI",
    "no_phone": "60123456789",
    "produk": "Bundle A",
    "tarikh_tempahan": "8/12/2024, 10:30 AM",
    "no_tracking": "NJVMY123456789",
    "harga_jualan_sebenar": 150,
    "cara_bayaran": "COD"
  },
  "marketer_id": "uuid-of-marketer"
}
```

### Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tracking_number | string | Option 1 | Tracking number to fetch order from database |
| order | object | Option 2 | Order data object |
| marketer_id | string | With Option 2 | UUID of marketer (to find WhatsApp device) |

### Postman Test - By Tracking Number
```
Method: POST
URL: https://your-domain.vercel.app/api/send-order-notification
Headers:
  Content-Type: application/json
Body (raw JSON):
{
  "tracking_number": "NJVMY123456789"
}
```

### Postman Test - By Order Data
```
Method: POST
URL: https://your-domain.vercel.app/api/send-order-notification
Headers:
  Content-Type: application/json
Body (raw JSON):
{
  "order": {
    "marketer_name": "AHMAD BIN ALI",
    "no_phone": "60123456789",
    "produk": "Bundle A",
    "tarikh_tempahan": "8/12/2024, 10:30 AM",
    "no_tracking": "NJVMY123456789",
    "harga_jualan_sebenar": 150,
    "cara_bayaran": "COD"
  },
  "marketer_id": "your-marketer-uuid"
}
```

### WhatsApp Message Sent
```
*Pesanan Anda Sudah Ditempah*

Nama : AHMAD BIN ALI
Phone : 60123456789
Pakej : Bundle A
Tarikh Membeli : 8/12/2024, 10:30 AM
Tracking Number : NJVMY123456789
Harga Jualan : RM150.00
Cara Bayaran : COD
```

### Success Response
```json
{
  "success": true,
  "whatsapp_sent": true,
  "message": "Notification sent successfully"
}
```

### Error Responses
```json
// No connected device
{
  "success": false,
  "error": "Marketer does not have a connected WhatsApp device",
  "whatsapp_sent": false
}

// Order not found
{
  "success": false,
  "error": "Order not found"
}
```

---

## 4. Lead Webhook (Auto Key-in Leads)

### Endpoint
```
POST /api/webhook-lead
```

### Description
Automatically creates leads/prospects from WhatsApp messages.

### Request Body
```json
{
  "device_id": "whacenter-device-id",
  "message": "#lead\nnama: AHMAD BIN ALI\nphone: 60123456789\nniche: Product A\njenis: NP"
}
```

---

## WhatsApp Device Requirements

For webhooks to send WhatsApp notifications, the marketer must have:

1. **Device configured** in `device_setting` table
2. **Instance ID** from Whacenter
3. **Status** = `connected`

The system finds the marketer's device using:
```sql
SELECT instance, status_wa
FROM device_setting
WHERE user_id = [marketer_id]
  AND status_wa = 'connected'
LIMIT 1
```

---

## Testing Checklist

### Before Testing
- [ ] Deploy latest code to Vercel
- [ ] Ensure environment variables are set (SUPABASE_URL, SUPABASE_ANON_KEY)
- [ ] Have a test order with known tracking number
- [ ] Have a marketer with connected WhatsApp device

### Ninjavan Webhook Test
- [ ] Test with valid tracking_id that exists in database
- [ ] Test "delivered" event - check SEO, tarikh_bayaran, delivery_status updated
- [ ] Test "returned to sender" event - check SEO, date_return, delivery_status updated
- [ ] Verify WhatsApp notification received

### Order Webhook Test
- [ ] Test with valid device_id linked to a marketer
- [ ] Test with complete #order message
- [ ] Verify order created in database
- [ ] Verify WhatsApp notification sent to customer

### Send Notification Test
- [ ] Test with valid tracking_number
- [ ] Test with order object + marketer_id
- [ ] Verify WhatsApp message received

---

## Postman Collection Import

Save this as `DFR_Webhooks.postman_collection.json`:

```json
{
  "info": {
    "name": "DFR Empire Webhooks",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "base_url",
      "value": "https://your-domain.vercel.app"
    }
  ],
  "item": [
    {
      "name": "Ninjavan Webhook - Normal Event",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/api/ninjavan-webhook",
        "header": [
          {"key": "Content-Type", "value": "application/json"}
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"tracking_id\": \"NJVMY123456789\",\n  \"event\": \"On Vehicle for Delivery\"\n}"
        }
      }
    },
    {
      "name": "Ninjavan Webhook - Delivered",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/api/ninjavan-webhook",
        "header": [
          {"key": "Content-Type", "value": "application/json"}
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"tracking_id\": \"NJVMY123456789\",\n  \"event\": \"Delivered, Received By Customer\"\n}"
        }
      }
    },
    {
      "name": "Ninjavan Webhook - Returned",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/api/ninjavan-webhook",
        "header": [
          {"key": "Content-Type", "value": "application/json"}
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"tracking_id\": \"NJVMY123456789\",\n  \"event\": \"Returned To Sender\"\n}"
        }
      }
    },
    {
      "name": "Order Webhook",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/api/webhook-order",
        "header": [
          {"key": "Content-Type", "value": "application/json"}
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"device_id\": \"your-device-id\",\n  \"message\": \"#order\\nnama: AHMAD BIN ALI\\nphone: 60123456789\\nalamat: NO 123 JALAN ABC\\nposkod: 50000\\nbandar: KUALA LUMPUR\\nnegeri: Selangor\\nproduk: Bundle A\\nkuantiti: 1\\nharga: 150\\nplatform: FB\\nbayaran: COD\"\n}"
        }
      }
    },
    {
      "name": "Send Notification - By Tracking",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/api/send-order-notification",
        "header": [
          {"key": "Content-Type", "value": "application/json"}
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"tracking_number\": \"NJVMY123456789\"\n}"
        }
      }
    }
  ]
}
```
