-- Admin (platform-owner) ParcelDaily commission: RM0.40 per order that was
-- booked through ParcelDaily AND actually collected by the courier (Shipped /
-- Success / Return — a return still means the courier picked it up). Pending
-- (not collected) and Cancelled (refunded) do not earn commission; self-pickup
-- is not a ParcelDaily shipment. Superadmin-only via is_superadmin() guard.

-- Per-client summary.
create or replace function public.admin_pd_commission(p_start date, p_end date)
returns table(owner_user_id uuid, client text, tracking_count bigint, commission numeric)
language sql stable security definer set search_path to 'public'
as $$
  select
    cp.owner_user_id,
    coalesce(nullif(pr.business_name, ''), nullif(pr.full_name, ''), pr.email, cp.owner_user_id::text) as client,
    count(*) as tracking_count,
    round(count(*) * 0.40, 2) as commission
  from public.customer_purchases cp
  join public.profiles pr on pr.id = cp.owner_user_id
  where public.is_superadmin()
    and cp.delivery_status in ('Shipped', 'Success', 'Return')
    and coalesce(cp.pd_order_id, cp.tracking_number) is not null
    and upper(coalesce(cp.kurier, '')) not like '%PICKUP%'
    and coalesce(cp.date_processed, cp.date_order) >= p_start
    and coalesce(cp.date_processed, cp.date_order) <= p_end
  group by cp.owner_user_id, client
  order by tracking_count desc;
$$;

-- Detailed tracking list (client + tracking rows).
create or replace function public.admin_pd_commission_detail(p_start date, p_end date)
returns table(owner_user_id uuid, client text, id_sale text, tracking_number text, kurier text, delivery_status text, remark_date date)
language sql stable security definer set search_path to 'public'
as $$
  select
    cp.owner_user_id,
    coalesce(nullif(pr.business_name, ''), nullif(pr.full_name, ''), pr.email, cp.owner_user_id::text) as client,
    cp.id_sale,
    cp.tracking_number,
    cp.kurier,
    cp.delivery_status,
    coalesce(cp.date_processed, cp.date_order) as remark_date
  from public.customer_purchases cp
  join public.profiles pr on pr.id = cp.owner_user_id
  where public.is_superadmin()
    and cp.delivery_status in ('Shipped', 'Success', 'Return')
    and coalesce(cp.pd_order_id, cp.tracking_number) is not null
    and upper(coalesce(cp.kurier, '')) not like '%PICKUP%'
    and coalesce(cp.date_processed, cp.date_order) >= p_start
    and coalesce(cp.date_processed, cp.date_order) <= p_end
  order by remark_date desc
  limit 10000;
$$;

grant execute on function public.admin_pd_commission(date, date) to authenticated;
grant execute on function public.admin_pd_commission_detail(date, date) to authenticated;
