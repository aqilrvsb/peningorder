-- =====================================================
-- Auto Stock Adjustment - Daily Cron Job
-- =====================================================
-- Runs daily at 01:00 AM Malaysia time (UTC+8) = 17:00 UTC
--
-- Logic (same as Transaction tab):
-- 1. DEDUCT stock: Orders with date_processed = yesterday AND delivery_status = 'Shipped'
-- 2. INCREASE stock: Orders with date_return = yesterday AND delivery_status = 'Return'
--
-- Bundle SKU format: "SKU-qty + SKU-qty" (e.g., "GSI-1 + SBN-2")
-- =====================================================

-- 1. Create log table for audit trail
CREATE TABLE IF NOT EXISTS stock_adjustment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_date DATE NOT NULL,
  adjustment_type TEXT NOT NULL, -- 'DEDUCT' or 'INCREASE'
  product_sku TEXT NOT NULL,
  previous_qty INTEGER,
  adjusted_qty INTEGER,
  new_qty INTEGER,
  order_id UUID,
  bundle_sku TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_adjustment_logs_date ON stock_adjustment_logs(adjustment_date);
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_logs_sku ON stock_adjustment_logs(product_sku);

-- 2. Create the stock adjustment function
CREATE OR REPLACE FUNCTION auto_adjust_stock()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_yesterday DATE;
  v_shipped_count INTEGER := 0;
  v_return_count INTEGER := 0;
  v_adjustments jsonb := '[]'::jsonb;
  v_order RECORD;
  v_bundle_sku TEXT;
  v_sku_parts TEXT[];
  v_part TEXT;
  v_sku TEXT;
  v_qty INTEGER;
  v_unit INTEGER;
  v_total_qty INTEGER;
  v_product RECORD;
  v_new_qty INTEGER;
BEGIN
  -- Get yesterday's date in Malaysia timezone (UTC+8)
  v_yesterday := (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur' - INTERVAL '1 day')::DATE;

  RAISE NOTICE 'Processing stock adjustments for date: %', v_yesterday;

  -- ========================================
  -- PART 1: DEDUCT stock for Shipped orders
  -- ========================================
  FOR v_order IN
    SELECT
      cp.id,
      cp.unit,
      lb.sku as bundle_sku
    FROM customer_purchases cp
    LEFT JOIN logistic_bundles lb ON cp.bundle_id = lb.id
    WHERE cp.date_processed = v_yesterday
      AND cp.delivery_status = 'Shipped'
      AND lb.sku IS NOT NULL
  LOOP
    v_shipped_count := v_shipped_count + 1;
    v_bundle_sku := v_order.bundle_sku;
    v_unit := COALESCE(v_order.unit, 1);

    -- Parse bundle SKU: "SKU-qty + SKU-qty" or "SKU-qty+SKU-qty"
    -- Split by '+' and process each part
    v_sku_parts := string_to_array(replace(v_bundle_sku, ' ', ''), '+');

    FOREACH v_part IN ARRAY v_sku_parts
    LOOP
      -- Extract SKU and qty from format "SKU-qty" (e.g., "GSI-1")
      IF v_part ~ '^[A-Za-z0-9]+-[0-9]+$' THEN
        v_sku := upper(split_part(v_part, '-', 1));
        v_qty := split_part(v_part, '-', 2)::INTEGER;
      ELSE
        -- Single SKU without quantity (assume qty = 1)
        v_sku := upper(v_part);
        v_qty := 1;
      END IF;

      -- Calculate total quantity to deduct
      v_total_qty := v_qty * v_unit;

      -- Get current product quantity
      SELECT id, sku, quantity INTO v_product
      FROM products
      WHERE upper(sku) = v_sku
      LIMIT 1;

      IF v_product.id IS NOT NULL THEN
        -- Calculate new quantity (prevent negative)
        v_new_qty := GREATEST(0, COALESCE(v_product.quantity, 0) - v_total_qty);

        -- Update product quantity
        UPDATE products
        SET quantity = v_new_qty
        WHERE id = v_product.id;

        -- Log the adjustment
        INSERT INTO stock_adjustment_logs (
          adjustment_date, adjustment_type, product_sku,
          previous_qty, adjusted_qty, new_qty,
          order_id, bundle_sku
        ) VALUES (
          v_yesterday, 'DEDUCT', v_sku,
          v_product.quantity, v_total_qty, v_new_qty,
          v_order.id, v_bundle_sku
        );

        -- Add to adjustments array
        v_adjustments := v_adjustments || jsonb_build_object(
          'type', 'DEDUCT',
          'sku', v_sku,
          'previous', v_product.quantity,
          'change', -v_total_qty,
          'new', v_new_qty
        );

        RAISE NOTICE 'DEDUCT: % | % -> % (-%)', v_sku, v_product.quantity, v_new_qty, v_total_qty;
      END IF;
    END LOOP;
  END LOOP;

  -- ========================================
  -- PART 2: INCREASE stock for Return orders
  -- ========================================
  FOR v_order IN
    SELECT
      cp.id,
      cp.unit,
      lb.sku as bundle_sku
    FROM customer_purchases cp
    LEFT JOIN logistic_bundles lb ON cp.bundle_id = lb.id
    WHERE cp.date_return = v_yesterday
      AND cp.delivery_status = 'Return'
      AND lb.sku IS NOT NULL
  LOOP
    v_return_count := v_return_count + 1;
    v_bundle_sku := v_order.bundle_sku;
    v_unit := COALESCE(v_order.unit, 1);

    -- Parse bundle SKU
    v_sku_parts := string_to_array(replace(v_bundle_sku, ' ', ''), '+');

    FOREACH v_part IN ARRAY v_sku_parts
    LOOP
      IF v_part ~ '^[A-Za-z0-9]+-[0-9]+$' THEN
        v_sku := upper(split_part(v_part, '-', 1));
        v_qty := split_part(v_part, '-', 2)::INTEGER;
      ELSE
        v_sku := upper(v_part);
        v_qty := 1;
      END IF;

      v_total_qty := v_qty * v_unit;

      SELECT id, sku, quantity INTO v_product
      FROM products
      WHERE upper(sku) = v_sku
      LIMIT 1;

      IF v_product.id IS NOT NULL THEN
        v_new_qty := COALESCE(v_product.quantity, 0) + v_total_qty;

        UPDATE products
        SET quantity = v_new_qty
        WHERE id = v_product.id;

        INSERT INTO stock_adjustment_logs (
          adjustment_date, adjustment_type, product_sku,
          previous_qty, adjusted_qty, new_qty,
          order_id, bundle_sku
        ) VALUES (
          v_yesterday, 'INCREASE', v_sku,
          v_product.quantity, v_total_qty, v_new_qty,
          v_order.id, v_bundle_sku
        );

        v_adjustments := v_adjustments || jsonb_build_object(
          'type', 'INCREASE',
          'sku', v_sku,
          'previous', v_product.quantity,
          'change', v_total_qty,
          'new', v_new_qty
        );

        RAISE NOTICE 'INCREASE: % | % -> % (+%)', v_sku, v_product.quantity, v_new_qty, v_total_qty;
      END IF;
    END LOOP;
  END LOOP;

  -- Return summary
  RETURN jsonb_build_object(
    'date', v_yesterday,
    'shipped_orders_processed', v_shipped_count,
    'return_orders_processed', v_return_count,
    'adjustments', v_adjustments
  );
END;
$$;

-- 3. Enable pg_cron extension (run this in Supabase Dashboard if needed)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 4. Schedule the cron job
-- 01:00 AM Malaysia (UTC+8) = 17:00 UTC (previous day)
-- Run this in Supabase SQL Editor:
/*
SELECT cron.schedule(
  'auto-stock-adjustment',
  '0 17 * * *',
  'SELECT auto_adjust_stock();'
);
*/

-- =====================================================
-- SETUP INSTRUCTIONS
-- =====================================================
--
-- Step 1: Run this entire SQL file in Supabase SQL Editor
--         (Database -> SQL Editor -> New Query -> Paste -> Run)
--
-- Step 2: Enable pg_cron extension
--         Go to: Database -> Extensions -> Search "pg_cron" -> Enable
--
-- Step 3: Schedule the cron job (run in SQL Editor):
--
--         SELECT cron.schedule(
--           'auto-stock-adjustment',
--           '0 17 * * *',
--           'SELECT auto_adjust_stock();'
--         );
--
-- Step 4: Verify cron is scheduled:
--         SELECT * FROM cron.job;
--
-- Step 5: Test manually (run in SQL Editor):
--         SELECT auto_adjust_stock();
--
-- Step 6: Check logs:
--         SELECT * FROM stock_adjustment_logs ORDER BY created_at DESC LIMIT 50;
--
-- To unschedule:
--         SELECT cron.unschedule('auto-stock-adjustment');
-- =====================================================
