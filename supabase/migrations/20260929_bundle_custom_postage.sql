-- Per-bundle optional postage overrides (NULL = not set -> ParcelDaily price is the main cost).
alter table public.logistic_bundles
  add column if not exists custom_postage numeric,
  add column if not exists custom_cod_charge numeric,
  add column if not exists custom_pickup numeric;

-- The courier's (ParcelDaily) real price, kept as an HQ reference even when the
-- bundle's own postage is used as the main cost.
alter table public.customer_purchases
  add column if not exists cost_postage_pd numeric;

update public.customer_purchases
   set cost_postage_pd = cost_postage
 where cost_postage_pd is null and coalesce(cost_postage, 0) > 0
   and coalesce(kurier, '') not ilike 'pickup%' and coalesce(type_payment, '') not ilike 'pickup';

-- One place that decides the main cost_postage for every write path
-- (order form, logistic edits, ParcelDaily webhook, Woo/integration):
--   pickup + bundle.custom_pickup  -> custom_pickup
--   bundle.custom_postage          -> custom_postage + custom_cod_charge (if COD)
--   otherwise                      -> courier price (a 0 write never wipes it)
create or replace function public.apply_bundle_postage()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b record;
  incoming numeric;
  is_pickup boolean;
  is_cod boolean;
begin
  if tg_op = 'UPDATE'
     and new.cost_postage is not distinct from old.cost_postage
     and new.bundle_id   is not distinct from old.bundle_id
     and new.type_payment is not distinct from old.type_payment
     and new.kurier      is not distinct from old.kurier then
    return new;
  end if;

  incoming := coalesce(new.cost_postage, 0);
  if incoming > 0 and (tg_op = 'INSERT' or new.cost_postage is distinct from old.cost_postage) then
    new.cost_postage_pd := incoming;
  end if;

  select custom_postage, custom_cod_charge, custom_pickup into b
    from public.logistic_bundles where id = new.bundle_id;

  is_pickup := coalesce(new.kurier, '') ilike 'pickup%' or coalesce(new.type_payment, '') ilike 'pickup';
  is_cod := upper(coalesce(new.type_payment, '')) = 'COD';

  if is_pickup then
    if b.custom_pickup is not null then new.cost_postage := b.custom_pickup; end if;
    return new;
  end if;

  if b.custom_postage is not null then
    new.cost_postage := b.custom_postage + case when is_cod then coalesce(b.custom_cod_charge, 0) else 0 end;
  elsif incoming = 0 and coalesce(new.cost_postage_pd, 0) > 0 then
    new.cost_postage := new.cost_postage_pd;
  end if;
  return new;
end $$;

drop trigger if exists trg_apply_bundle_postage on public.customer_purchases;
create trigger trg_apply_bundle_postage
  before insert or update of cost_postage, bundle_id, type_payment, kurier
  on public.customer_purchases
  for each row execute function public.apply_bundle_postage();
