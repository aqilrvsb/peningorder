// Unified ParcelDaily "Status Groups" (statusGroup), same set across Ninjavan /
// DHL / PosLaju / J&T — taken verbatim from ParcelDaily's OpenAPI spec. A client
// can Track / Notify on each (Courier Settings → Tracking Webhook). The key IS
// the exact statusGroup string the Tracking webhook sends.
export const TRACKING_STATUSES: { key: string; label: string }[] = [
  { key: 'Waiting Pickup', label: 'Waiting Pickup' },
  { key: 'Shipment Data Received', label: 'Shipment Data Received' },
  { key: 'Picked up', label: 'Picked Up' },
  { key: 'In transit', label: 'In Transit' },
  { key: 'Processing', label: 'Processing' },
  { key: 'On Delivery', label: 'On Delivery' },
  { key: 'Delivered', label: 'Delivered' },
  { key: 'Self Collect', label: 'Self Collect' },
  { key: 'Problematic Processing', label: 'Problematic Processing' },
  { key: 'Custom matter', label: 'Custom Matter' },
  { key: 'Return in transit', label: 'Return In Transit' },
  { key: 'Returned', label: 'Returned' },
  { key: 'Cancel Requested by User', label: 'Cancel Requested by User' },
  { key: 'Cancelled by User', label: 'Cancelled by User' },
  { key: 'Cancelled', label: 'Cancelled' },
  { key: 'Refunded', label: 'Refunded' },
  { key: 'Closed', label: 'Closed' },
  // NOTE: "COD amount remitted" and "Weight Update" are intentionally NOT here —
  // they are seller-facing (money received / postage cost), always tracked, and
  // notify the CLIENT via the admin device, not the customer.
];

// The order-key-in notification (order-notify), shown before the courier statuses.
export const KEYIN_STATUS = { key: 'Order Keyed In', label: 'Order Keyed In' };
