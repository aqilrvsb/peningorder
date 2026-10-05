-- Per-order, per-status record of every customer WhatsApp notification attempt
-- (auto from the tracking webhook / order key-in, or a manual resend from the
-- Notify Report tab). Written only by edge functions (service role).
create table if not exists public.wa_notify_log (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  order_id uuid not null references public.customer_purchases(id) on delete cascade,
  status_key text not null,
  success boolean not null,
  message_id text,
  error text,
  source text not null default 'auto' check (source in ('auto', 'manual', 'backfill')),
  sent_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists wa_notify_log_order_idx on public.wa_notify_log (order_id, status_key, created_at desc);
create index if not exists wa_notify_log_owner_idx on public.wa_notify_log (owner_user_id, created_at desc);

alter table public.wa_notify_log enable row level security;
-- Visible exactly when the order is visible: the EXISTS runs under
-- customer_purchases' own RLS, so marketer staff only see their own orders.
create policy wa_notify_log_select on public.wa_notify_log for select to authenticated
  using (owner_user_id = public.tenant_owner()
         and exists (select 1 from public.customer_purchases cp where cp.id = wa_notify_log.order_id));

-- Staff need to read which statuses notify (read-only; owner keeps write).
create policy tss_select_tenant on public.tracking_status_setting for select to authenticated
  using (owner_user_id = public.tenant_owner());

-- Backfill history from the ParcelDaily webhook log (orders from Sept 2026, when the report starts).
insert into public.wa_notify_log (owner_user_id, order_id, status_key, success, error, source, created_at)
select cp.owner_user_id, cp.id,
  case
    when w.parsed_data->>'event' = 'STATUS_UPDATED'
      then coalesce(nullif(w.request_body->>'statusGroup', ''), w.request_body->>'status')
    when w.parsed_data->>'event' = 'CANCEL_STATUS_UPDATED' then 'Cancelled'
    else 'Shipment Data Received'
  end,
  a.wa = 'wa_sent',
  case
    when a.wa = 'wa_sent' then null
    when a.wa like 'wa_failed_%' then substr(a.wa, 11)
    when a.wa = 'wa_skipped_no_device' then 'Tiada device WhatsApp (instance kosong)'
    when a.wa = 'wa_skipped_bad_phone' then 'Nombor telefon tidak sah'
    else 'Ralat sistem'
  end,
  'backfill', w.created_at
from public.webhook_logs w
cross join lateral (select substring(w.parsed_data->>'action' from '\+(wa_.*)$') as wa) a
join public.customer_purchases cp on cp.id::text = w.parsed_data->>'matched_id'
where w.webhook_type = 'parceldaily'
  and a.wa ~ '^wa_(sent|failed_|error|skipped_no_device|skipped_bad_phone)'
  and cp.date_order >= '2026-09-01';
