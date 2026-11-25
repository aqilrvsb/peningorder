-- Rejected orders (fake receipt, duplicate…) were never shipped, so they are not sales
-- (owner 2026-11-25). Same rule as the frontend (src/lib/pospada.ts → REJECTED):
-- Top Ranking, admin stats and the Leads "closed" figures leave them out.

-- 1) Top Ranking
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
      and coalesce(cp.delivery_status,'') <> 'Rejected' -- Rejected = never shipped, not a sale
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

-- 2) Admin → Reporting (per client)
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
    AND COALESCE(delivery_status, '') <> 'Rejected' -- Rejected = never shipped, not a sale
  GROUP BY owner_user_id;
$function$;

-- 3) Admin → Dashboard
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
      and coalesce(cp.delivery_status, '') <> 'Rejected' -- Rejected = never shipped, not a sale
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

-- 4) Leads: a lead isn't "closed" by a Rejected order. The trigger now also runs when the status
--    changes, so Reject / un-reject updates the lead.
create or replace function public.sync_prospect_close()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT owner, ph FROM (
      SELECT (CASE WHEN TG_OP <> 'DELETE' THEN NEW.owner_user_id END) AS owner,
             norm_phone(CASE WHEN TG_OP <> 'DELETE' THEN NEW.phone_customer END) AS ph
      UNION ALL
      SELECT (CASE WHEN TG_OP <> 'INSERT' THEN OLD.owner_user_id END),
             norm_phone(CASE WHEN TG_OP <> 'INSERT' THEN OLD.phone_customer END)
    ) s
    WHERE s.owner IS NOT NULL AND s.ph <> ''
  LOOP
    -- Skip the aggregate entirely for orders with no matching lead (the common case).
    IF EXISTS (
      SELECT 1 FROM prospects p
      WHERE p.owner_user_id = r.owner AND norm_phone(p.no_telefon) = r.ph
    ) THEN
      UPDATE prospects p SET
        count_order   = agg.orders,
        price_closed  = agg.rm,
        status_closed = CASE WHEN agg.orders > 0 THEN 'closed' ELSE NULL END,
        updated_at    = now()
      FROM (
        SELECT count(*) AS orders, coalesce(sum(total_sale),0) AS rm
        FROM customer_purchases o
        WHERE o.owner_user_id = r.owner AND norm_phone(o.phone_customer) = r.ph
          AND coalesce(o.delivery_status, '') <> 'Rejected' -- Rejected = never shipped, not a sale
      ) agg
      WHERE p.owner_user_id = r.owner AND norm_phone(p.no_telefon) = r.ph;
    END IF;
  END LOOP;
  RETURN NULL;
END $function$;

drop trigger if exists trg_sync_prospect_close on public.customer_purchases;
create trigger trg_sync_prospect_close
  after insert or delete or update of phone_customer, total_sale, owner_user_id, delivery_status
  on public.customer_purchases
  for each row execute function public.sync_prospect_close();

-- 5) One-off: recount the leads of customers that have a Rejected order.
update public.prospects p set
  count_order   = agg.orders,
  price_closed  = agg.rm,
  status_closed = case when agg.orders > 0 then 'closed' else null end,
  updated_at    = now()
from (
  select o.owner_user_id as owner, norm_phone(o.phone_customer) as ph,
    count(*) filter (where coalesce(o.delivery_status, '') <> 'Rejected') as orders,
    coalesce(sum(o.total_sale) filter (where coalesce(o.delivery_status, '') <> 'Rejected'), 0) as rm
  from public.customer_purchases o
  where exists (
    select 1 from public.customer_purchases x
    where x.delivery_status = 'Rejected' and x.owner_user_id = o.owner_user_id
      and norm_phone(x.phone_customer) = norm_phone(o.phone_customer)
  )
  group by 1, 2
) agg
where p.owner_user_id = agg.owner and norm_phone(p.no_telefon) = agg.ph;
