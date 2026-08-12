-- Run this in the peningorder Supabase SQL editor (project ybtswwzunvuqildqscxk).
-- Adds staff commission modes + bundle commission + cash-receipt classification.

-- Bundle-level commission (RM) paid per order for commission-order staff.
alter table logistic_bundles add column if not exists commission_rm numeric not null default 0;

-- Per-staff payout mode: 'commission_order' (default) pays the bundle commission
-- per order; 'gross_profit' pays commission_percent % of gross profit.
alter table profiles add column if not exists pay_mode text not null default 'commission_order';
alter table profiles add column if not exists commission_percent numeric not null default 0;

-- Snapshot the bundle commission onto each order at key-in (frozen; later bundle
-- edits do not change past orders).
alter table customer_purchases add column if not exists commission_amount numeric not null default 0;

-- CASH payment proof type: 'image' (uploaded receipt) or 'link' (pasted URL).
alter table customer_purchases add column if not exists receipt_payment_type text;

-- Constrain pay_mode to known values (safe to re-run).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_pay_mode_check') then
    alter table profiles add constraint profiles_pay_mode_check
      check (pay_mode in ('commission_order','gross_profit'));
  end if;
end $$;
