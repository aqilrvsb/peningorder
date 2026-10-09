-- HR → Database Staff (DFR): personal / bank / next-of-kin / academic details per person.
-- person_id = profiles.id (Team marketer) or attendance_staff.id (extra staff), like attendance.user_id.
-- IC numbers and bank accounts live here, so only the HQ and its HR account can read it.
-- (Applied via Supabase MCP migration "hr_staff_details" on 2026-10-09.)
create table if not exists public.staff_details (
  owner_id uuid not null default public.tenant_owner(),
  person_id uuid not null,
  diri jsonb,       -- Maklumat Diri
  bank jsonb,       -- Maklumat Perbankan
  waris jsonb,      -- Maklumat Waris: [waris 1, waris 2]
  akademik jsonb,   -- Maklumat Akademik: [kelayakan …]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, person_id)
);

alter table public.staff_details enable row level security;
create policy hr_owner_all on public.staff_details
  for all to authenticated
  using (owner_id = (select public.tenant_owner()) and ((select auth.uid()) = owner_id or (select public.is_hr_staff())))
  with check (owner_id = (select public.tenant_owner()) and ((select auth.uid()) = owner_id or (select public.is_hr_staff())));
grant select, insert, update, delete on public.staff_details to authenticated;
