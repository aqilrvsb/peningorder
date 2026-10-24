-- Optional per-bundle Profit Sharing %. When PNL Config = profit sharing, the team's commission
-- for orders of this bundle = % x Collection (Cash + COD collected; Return never), and the bundle's
-- sales/costs/ad spend leave the normal PNL calc. Empty = follow PNL Config. (Applied 2026-10-24.)
alter table public.logistic_bundles add column if not exists profit_share_percent numeric
  check (profit_share_percent is null or (profit_share_percent >= 0 and profit_share_percent <= 100));
comment on column public.logistic_bundles.profit_share_percent is
  'Optional per-bundle Profit Sharing %. When PNL Config = profit sharing, team commission for this bundle = % x Collection (Cash + COD collected); empty = follow PNL Config.';

-- Data (owner request): every AJWA bundle of akhirulnaim@gmail.com = 30%.
-- update logistic_bundles set profit_share_percent = 30
--   where owner_user_id = '95f2d1be-6608-4456-a721-9c0b6807bc63' and name ilike '%ajwa%';
