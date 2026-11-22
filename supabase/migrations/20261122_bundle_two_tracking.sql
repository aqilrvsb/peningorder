-- "2 Tracking" bundles (Bring Your Courier): one order ships as two boxes, each with its own
-- courier booking. The booking function stores both in pd_order_id as
-- "own:<courier>:<tracking 1>,<tracking 2>"; tracking_number keeps box 1 (it carries the full COD),
-- and this trigger copies box 2 into tracking_number_2 so every caller (key-in, edit, Logistic,
-- WooCommerce, Integration) gets it without saving it itself. seos_2 = box 2's latest courier status.

alter table public.logistic_bundles
  add column if not exists two_tracking boolean not null default false;

alter table public.customer_purchases
  add column if not exists tracking_number_2 text,
  add column if not exists seos_2 text;

create index if not exists customer_purchases_tracking_number_2_idx
  on public.customer_purchases (tracking_number_2)
  where tracking_number_2 is not null;

create or replace function public.sync_tracking_number_2()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.tracking_number_2 := nullif(substring(coalesce(new.pd_order_id, '') from '^own:[a-z]+:[^,]+,([^,]+)$'), '');
  -- A new booking (or none) → the old box 2 status no longer applies.
  if tg_op = 'UPDATE' and new.tracking_number_2 is distinct from old.tracking_number_2 then
    new.seos_2 := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_tracking_number_2 on public.customer_purchases;
create trigger trg_sync_tracking_number_2
  before insert or update of pd_order_id on public.customer_purchases
  for each row execute function public.sync_tracking_number_2();
