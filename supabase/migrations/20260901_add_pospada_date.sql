-- Pospada = a booking / scheduled-dispatch order. When set, the order is held
-- as a booking (no tracking generated at key-in); logistic generates the
-- tracking from the "Order Pospada" tab once this date arrives, then it flows
-- to Processed like a normal order.
-- NULL pospada_date  -> normal order (logistic "Order" tab)
-- set  pospada_date  -> booking      (logistic "Order Pospada" tab)
ALTER TABLE public.customer_purchases
  ADD COLUMN IF NOT EXISTS pospada_date DATE;

-- Fast filtering of pending bookings in the Order Pospada tab.
CREATE INDEX IF NOT EXISTS idx_customer_purchases_pospada
  ON public.customer_purchases (owner_user_id, pospada_date)
  WHERE pospada_date IS NOT NULL;
