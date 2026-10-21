-- Bring Your Courier (BYOC): tenants on plan 'byoc' book with their OWN courier accounts
-- (Ninja Van / J&T Open Platform / Pos Laju) instead of ParcelDaily. The provider follows the
-- owner's plan (profiles.plan = 'byoc' -> 'own'), so there is nothing to keep in sync.
-- (Applied via Supabase MCP migration "own_courier_foundation" on 2026-10-21.)

-- Per-tenant courier credentials. Owner-only (like parceldaily_config); staff and HR never read
-- secrets — they go through my_courier_provider() / the edge functions.
create table if not exists public.own_courier_config (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  courier text not null check (courier in ('ninjavan', 'jnt', 'poslaju')),
  enabled boolean not null default true,
  environment text not null default 'production' check (environment in ('sandbox', 'production')),
  client_id text,          -- Ninja Van / Pos Laju OAuth
  client_secret text,
  account_number text,     -- Pos Laju
  subscription_code text,  -- Pos Laju
  api_account text,        -- J&T Open Platform
  private_key text,
  customer_code text,
  password text,
  webhook_token text not null default replace(gen_random_uuid()::text, '-', ''), -- in the callback URL
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, courier)
);
alter table public.own_courier_config enable row level security;
create policy tenant_select on public.own_courier_config for select using (owner_user_id = auth.uid());
create policy tenant_insert on public.own_courier_config for insert with check (owner_user_id = auth.uid());
create policy tenant_update on public.own_courier_config for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy tenant_delete on public.own_courier_config for delete using (owner_user_id = auth.uid());
create policy hr_staff_blocked on public.own_courier_config as restrictive for all
  using (not (select is_hr_staff())) with check (not (select is_hr_staff()));

-- OAuth token cache (Ninja Van / Pos Laju). Service role only: RLS on, no policies.
create table if not exists public.own_courier_tokens (
  owner_user_id uuid not null,
  courier text not null,
  access_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, courier)
);
alter table public.own_courier_tokens enable row level security;

-- What staff may know: provider + which own couriers are switched on (no secrets).
create or replace function public.my_courier_provider()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'provider', case when p.plan = 'byoc' then 'own' else 'parceldaily' end,
    'own_couriers', coalesce((
      select jsonb_agg(c.courier order by c.courier)
      from own_courier_config c where c.owner_user_id = p.id and c.enabled
    ), '[]'::jsonb)
  )
  from profiles p where p.id = tenant_owner()
$$;
revoke execute on function public.my_courier_provider() from public, anon;
grant execute on function public.my_courier_provider() to authenticated;

-- Labels from Ninja Van / J&T need courier auth to download, so the booking stores the PDF here
-- (unguessable path) and saves its URL in customer_purchases.waybill_url — print + merge work as today.
insert into storage.buckets (id, name, public) values ('courier-waybills', 'courier-waybills', true)
on conflict (id) do nothing;

-- BYOC package definition (inactive until the flow is live; admin turns it on in Pricing).
-- Order cap copied from Growth (same features).
insert into app_settings (key, value)
values ('plan_byoc', '{"label":"Bring Your Courier","price":300,"days":30,"max_orders_per_month":999999,"active":false}'::jsonb)
on conflict (key) do nothing;
