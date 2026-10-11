-- Courier by region (Courier Settings → "Kurier Ikut Kawasan"): one courier for
-- Semenanjung and one for Sabah / Sarawak / Labuan. At key-in the order form switches
-- the courier from the customer's negeri; WooCommerce, Integration map and
-- OnPay/Convertly orders follow the same rule (product-mapping override still wins).
-- Values are courier labels as offered at key-in ('Poslaju', 'Ninjavan', 'JNT', 'DHL',
-- 'SPX'); null = no rule (falls back to default_courier).
-- (Applied via Supabase MCP migration "courier_by_region" on 2026-10-11.)
alter table public.parceldaily_config
  add column if not exists courier_semenanjung text,
  add column if not exists courier_sabah_sarawak text;

-- Staff can't read parceldaily_config (it holds the tenant's ParcelDaily key), so the
-- order form reads only the two region couriers through this definer function.
create or replace function public.my_region_couriers()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('semenanjung', pc.courier_semenanjung, 'sabah_sarawak', pc.courier_sabah_sarawak)
  from parceldaily_config pc where pc.owner_user_id = tenant_owner()
$$;

revoke execute on function public.my_region_couriers() from public, anon;
grant execute on function public.my_region_couriers() to authenticated;
