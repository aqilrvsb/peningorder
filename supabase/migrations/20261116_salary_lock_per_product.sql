-- Lock commission per main product too (Salary page product filter). product_id null = "Semua Produk".
-- Applied 2026-11-16.
alter table public.salary_lock add column if not exists product_id uuid;
comment on column public.salary_lock.product_id is 'Main product (products.id) the lock was taken for; null = all products.';
alter table public.salary_lock drop constraint if exists salary_lock_owner_user_id_idstaff_period_key;
create unique index if not exists salary_lock_owner_staff_period_product_key
  on public.salary_lock (owner_user_id, idstaff, period, coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid));
