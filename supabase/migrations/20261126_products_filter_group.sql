-- Products with the same filter_group show as ONE option in the product filter dropdowns
-- (Salary, Report Profit, Logistic Order / Shipped). Picking it matches every order whose
-- bundle holds any product of the group. Stock stays per product.
alter table public.products add column if not exists filter_group text;

-- akhirulnaim: the three Al Kaussar products → one "AL KAUSSAR" option (owner 2026-11-26).
update public.products set filter_group = 'AL KAUSSAR'
where owner_user_id = '95f2d1be-6608-4456-a721-9c0b6807bc63'
  and sku in ('KAUSSAR', 'KAUSAR', 'KAUSSARR');
