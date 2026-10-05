-- "Order Keyed In" WhatsApp for EVERY order source, not just the order form.
-- Website / WooCommerce / integration-map / channel-webhook / Logistic Add
-- Customer orders never sent it before (only OrderForm called order-notify).
-- An AFTER INSERT trigger now queues order-notify through pg_net; the function
-- sends once per order and logs to wa_notify_log.

-- Bulk Import marks its rows so a pasted batch doesn't blast customers at once.
alter table public.customer_purchases
  add column if not exists skip_keyin_notify boolean not null default false;

-- Shared secret the trigger sends and order-notify checks. platform_secrets is
-- superadmin-only (unlike app_settings, which is world-readable).
insert into public.platform_secrets (key, value, updated_at)
values ('internal_notify', jsonb_build_object('secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')), now())
on conflict (key) do nothing;

create or replace function public.queue_keyin_notify()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  -- Same skips as the order form had: Pospada bookings, marketplace couriers
  -- (customer phone is masked), no phone; plus Bulk Import.
  if new.skip_keyin_notify
     or new.pospada_date is not null
     or coalesce(new.kurier, '') ~* '(tiktok|shopee)'
     or coalesce(new.phone_customer, '') = '' then
    return new;
  end if;
  if not exists (
    select 1 from public.tracking_status_setting
    where owner_user_id = new.owner_user_id and status_key = 'Order Keyed In' and notify
  ) then
    return new;
  end if;
  select value->>'secret' into v_secret from public.platform_secrets where key = 'internal_notify';
  if v_secret is null then
    return new;
  end if;
  perform net.http_post(
    url := 'https://ybtswwzunvuqildqscxk.supabase.co/functions/v1/order-notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-key', v_secret),
    body := jsonb_build_object('order_uuid', new.id),
    timeout_milliseconds := 60000
  );
  return new;
exception when others then
  -- A notification problem must never block saving the order.
  return new;
end;
$$;

create trigger trg_queue_keyin_notify
  after insert on public.customer_purchases
  for each row execute function public.queue_keyin_notify();
