-- Key-in "Jenis Bayaran" (Online Transfer / Credit Card / CDM / CASH / Billplz) is stored again.
-- DFR's Jan 2026 schema change (2aa667b) dropped the old jenis_bayaran column but kept the
-- dropdown, so the choice was silently discarded until now. type_payment stays = Cara Bayaran
-- (COD / CASH / Pickup). Orders before 2026-10-13 have null here (not recoverable).
-- (Applied via Supabase MCP migration "customer_purchases_jenis_bayaran" on 2026-10-13.)
alter table public.customer_purchases add column if not exists jenis_bayaran text;
comment on column public.customer_purchases.jenis_bayaran is
  'Key-in "Jenis Bayaran" (Online Transfer / Credit Card / CDM / CASH / Billplz) for paid (non-COD) orders. Separate from type_payment (= Cara Bayaran: COD / CASH / Pickup). Null for orders before 2026-10-13 (the field was not stored after the Jan 2026 schema change).';
