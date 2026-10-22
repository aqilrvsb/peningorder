-- Pospada = booking only. An order with a pospada_date that is still Pending is NOT a sale
-- until it is Processed (pospada_date cleared, date_order = the day it was processed).
-- Every sales report excludes:  pospada_date IS NOT NULL AND delivery_status = 'Pending'.

-- 1) Data fix: rows that already left Pending (24 MOMMYHANA bookings moved to Shipped on
--    2026-10-19) or belong to a tenant with Pospada switched off are normal orders.
--    Owner's choice: keep their original date_order.
update public.customer_purchases cp
   set pospada_date = null, updated_at = now()
 where cp.pospada_date is not null
   and (cp.delivery_status <> 'Pending'
        or not exists (select 1 from public.parceldaily_config c
                        where c.owner_user_id = cp.owner_user_id and c.pospada_enabled));

-- 2) Top Ranking (client + marketers)
create or replace function public.team_ranking(p_start date, p_end date)
 returns table(idstaff text, name text, total_sales numeric, return_sales numeric, collection numeric, spend numeric, np numeric, ep numeric, ec numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with oid as (select public.tenant_owner() as o),
  ord as (
    select cp.marketer_id_staff as idstaff,
      sum(cp.total_sale) as total_sales,
      sum(case when cp.delivery_status = 'Return' then cp.total_sale else 0 end) as return_sales,
      sum(case
            when cp.delivery_status in ('Return','Failed') then 0
            when (cp.type_payment = 'COD' or coalesce(cp.kurier,'') ilike '%COD%')
              then case when cp.date_payment is not null then cp.total_sale else 0 end
            else cp.total_sale
          end) as collection,
      sum(cp.total_sale) filter (where upper(coalesce(cp.jenis_customer,'')) = 'NP') as np,
      sum(cp.total_sale) filter (where upper(coalesce(cp.jenis_customer,'')) = 'EP') as ep,
      sum(cp.total_sale) filter (where upper(coalesce(cp.jenis_customer,'')) = 'EC') as ec
    from public.customer_purchases cp, oid
    where cp.owner_user_id = oid.o
      and cp.date_order >= p_start and cp.date_order <= p_end
      and coalesce(cp.marketer_id_staff,'') <> ''
      and not (cp.pospada_date is not null and cp.delivery_status = 'Pending') -- Pospada booking ≠ sale
    group by cp.marketer_id_staff
  ),
  spd as (
    select s.marketer_id_staff as idstaff, sum(s.total_spend) as spend
    from public.spends s, oid
    where s.owner_user_id = oid.o
      and s.tarikh_spend >= p_start and s.tarikh_spend <= p_end
      and coalesce(s.marketer_id_staff,'') <> ''
    group by s.marketer_id_staff
  )
  select
    p.idstaff,
    coalesce(nullif(p.full_name,''), p.idstaff) as name,
    coalesce(o.total_sales,0), coalesce(o.return_sales,0), coalesce(o.collection,0),
    coalesce(sp.spend,0), coalesce(o.np,0), coalesce(o.ep,0), coalesce(o.ec,0)
  from public.profiles p
  left join ord o on o.idstaff = p.idstaff
  left join spd sp on sp.idstaff = p.idstaff
  where p.parent_user_id = public.tenant_owner()
    and coalesce(p.is_active, true)
    and coalesce((select ur.role::text from public.user_roles ur where ur.user_id = p.id limit 1),'marketer') = 'marketer'
  order by coalesce(o.total_sales,0) desc, p.idstaff;
$function$;

-- 3) Super-admin client stats
create or replace function public.admin_client_stats()
 returns table(user_id uuid, total_orders bigint, total_sales numeric, orders_this_month bigint, sales_this_month numeric, collected_sales numeric, last_order_date date)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  SELECT
    owner_user_id,
    count(*),
    COALESCE(sum(total_sale), 0),
    count(*) FILTER (WHERE date_order >= date_trunc('month', (now() AT TIME ZONE 'Asia/Kuala_Lumpur'))::date),
    COALESCE(sum(total_sale) FILTER (WHERE date_order >= date_trunc('month', (now() AT TIME ZONE 'Asia/Kuala_Lumpur'))::date), 0),
    COALESCE(sum(total_sale) FILTER (WHERE
      (type_payment <> 'COD' AND delivery_status NOT IN ('Return', 'Failed'))
      OR (type_payment = 'COD' AND date_payment IS NOT NULL)
    ), 0),
    max(date_order)
  FROM public.customer_purchases
  WHERE public.is_superadmin()
    AND NOT (pospada_date IS NOT NULL AND delivery_status = 'Pending') -- Pospada booking ≠ sale
  GROUP BY owner_user_id;
$function$;

-- 4) Super-admin dashboard summary
create or replace function public.admin_dashboard_summary(p_start date, p_end date)
 returns table(owner_user_id uuid, client text, orders bigint, sales numeric, delivered bigint, returned bigint, pending bigint, shipped bigint, collection_orders bigint, collection_sales numeric, remaining_orders bigint, remaining_sales numeric, cod_count bigint, cash_count bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with base as (
    select cp.*,
      (cp.type_payment = 'COD' or coalesce(cp.kurier, '') like '%COD%') as is_cod,
      (cp.delivery_status in ('Return', 'Failed')) as is_return
    from public.customer_purchases cp
    where coalesce(cp.date_order, cp.date_processed) >= p_start
      and coalesce(cp.date_order, cp.date_processed) <= p_end
      and not (cp.pospada_date is not null and cp.delivery_status = 'Pending') -- Pospada booking ≠ sale
  )
  select
    b.owner_user_id,
    coalesce(nullif(pr.business_name, ''), nullif(pr.full_name, ''), pr.email, b.owner_user_id::text) as client,
    count(*) as orders,
    coalesce(sum(b.total_sale), 0) as sales,
    count(*) filter (where b.delivery_status = 'Success') as delivered,
    count(*) filter (where b.is_return) as returned,
    count(*) filter (where b.delivery_status = 'Pending') as pending,
    count(*) filter (where b.delivery_status = 'Shipped') as shipped,
    count(*) filter (where not b.is_return and (not b.is_cod or b.date_payment is not null)) as collection_orders,
    coalesce(sum(b.total_sale) filter (where not b.is_return and (not b.is_cod or b.date_payment is not null)), 0) as collection_sales,
    count(*) filter (where b.is_cod and not b.is_return and b.date_payment is null) as remaining_orders,
    coalesce(sum(b.total_sale) filter (where b.is_cod and not b.is_return and b.date_payment is null), 0) as remaining_sales,
    count(*) filter (where b.is_cod) as cod_count,
    count(*) filter (where not b.is_cod) as cash_count
  from base b
  join public.profiles pr on pr.id = b.owner_user_id
  where public.is_superadmin()
    and coalesce(pr.plan, '') <> 'superadmin'
  group by b.owner_user_id, client
  order by sales desc;
$function$;
