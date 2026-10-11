-- Per-bundle switch: orders for this bundle are NOT sent to ParcelDaily (no tracking number
-- generated) — e.g. MOMMYHANA, which the brand ships itself.
-- Enforced in parceldaily-order (every path: key-in, WooCommerce, Integration map, manual
-- Generate Tracking); the order form also skips the call up front.
-- (Applied via Supabase MCP migration "bundle_skip_courier" on 2026-10-11.)
alter table public.logistic_bundles
  add column if not exists skip_courier boolean not null default false;

comment on column public.logistic_bundles.skip_courier is
  'true = never book this bundle with ParcelDaily (key-in, WooCommerce, Integration map, manual Generate Tracking). Order is saved without tracking.';

-- NL tenant's MOMMYHANA bundles.
update public.logistic_bundles
set skip_courier = true
where owner_user_id = '95f2d1be-6608-4456-a721-9c0b6807bc63'
  and sku in ('MH-2', 'MH-4', 'MH-6');
