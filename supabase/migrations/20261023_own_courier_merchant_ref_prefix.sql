-- Ninja Van "Bisnes Owner" commission tag, per BYOC client. Bookings send
-- merchant_order_number = merchant_ref_prefix + ID Sale (DFR's format was "BISNESOWNER-DFR" + ID Sale).
-- Empty = "BISNESOWNER-".
alter table public.own_courier_config add column if not exists merchant_ref_prefix text;

-- SM Agrotech / Lavella (lavellepayment@gmail.com)
update public.own_courier_config
   set merchant_ref_prefix = 'BISNESOWNER-Lavella', updated_at = now()
 where owner_user_id = 'e378afc0-200e-4bfe-878c-cbe2c6d4cac6' and courier = 'ninjavan';
