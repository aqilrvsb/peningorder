-- HR (HQ only): extra non-login staff + daily attendance, ported from DFR (HRAttendance).
-- Multi-tenant: every row belongs to the HQ that created it (owner_id = auth.uid() by default)
-- and only that HQ can read/write it. attendance.user_id = profiles.id (Team marketers) or
-- attendance_staff.id (extra staff); no FK, as in DFR.
-- (Applied via Supabase MCP migration "hr_attendance" on 2026-10-09; neither table existed.)

create table if not exists public.attendance_staff (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid(),
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
  owner_id uuid default auth.uid(),
  user_id uuid not null,
  date date not null,
  status text not null check (status = any (array['present','absent'])),
  reason text,                    -- required by the UI when absent
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One mark per person per day (the UI upserts on user_id,date).
create unique index if not exists attendance_user_date_uniq on public.attendance (user_id, date);
create index if not exists attendance_owner_date_idx on public.attendance (owner_id, date);
create index if not exists attendance_staff_owner_idx on public.attendance_staff (owner_id);

alter table public.attendance_staff enable row level security;
alter table public.attendance enable row level security;

create policy hr_owner_all on public.attendance_staff
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy hr_owner_all on public.attendance
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on public.attendance_staff, public.attendance to authenticated;
