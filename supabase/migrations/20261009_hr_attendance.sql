-- HR (HQ only): extra non-login staff + daily attendance, ported from DFR (HRAttendance).
-- Multi-tenant: every row belongs to the HQ that created it (owner_id = auth.uid() by default)
-- and only that HQ can read/write it. The DFR schema these tables came from had open
-- "all authenticated" policies — those are dropped here so tenants never see each other.
-- attendance.user_id = profiles.id (Team marketers) or attendance_staff.id (extra staff); no FK, as in DFR.

create table if not exists public.attendance_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ic_number text,                 -- shown as "ID Staff"
  phone text,
  address text,
  role text not null check (role = any (array['Managing Director','Business Support Exec','Customer Support','Logistic','Multimedia'])),
  is_active boolean default true, -- delete = soft delete (false)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date date not null,
  status text not null check (status = any (array['present','absent'])),
  reason text,                    -- required by the UI when absent
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tenant owner on both tables.
alter table public.attendance_staff add column if not exists owner_id uuid default auth.uid();
alter table public.attendance add column if not exists owner_id uuid default auth.uid();
alter table public.attendance_staff alter column owner_id set default auth.uid();
alter table public.attendance alter column owner_id set default auth.uid();

-- One mark per person per day (the UI upserts on user_id,date).
create unique index if not exists attendance_user_date_uniq on public.attendance (user_id, date);
create index if not exists attendance_owner_date_idx on public.attendance (owner_id, date);
create index if not exists attendance_staff_owner_idx on public.attendance_staff (owner_id);

alter table public.attendance_staff enable row level security;
alter table public.attendance enable row level security;

-- Drop whatever policies came with the DFR schema (names unknown / open to all).
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('attendance', 'attendance_staff') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy hr_owner_all on public.attendance_staff
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy hr_owner_all on public.attendance
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on public.attendance_staff, public.attendance to authenticated;
