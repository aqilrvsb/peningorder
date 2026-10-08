-- HR → Role tab + Half Day attendance.
-- (Applied via Supabase MCP migrations "hr_roles_free_text_role", "hr_attendance_half_day",
--  "hr_roles" on 2026-10-09; attendance_staff and attendance had no rows yet.)

-- Roles now come from hr_roles (per HQ), so the fixed DFR list can't be a CHECK any more.
alter table public.attendance_staff drop constraint if exists attendance_staff_role_check;

-- Third attendance status: half day (yellow in the grid). Click cycle in the UI:
-- Not Marked → Present → Half Day → Absent → Not Marked.
alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance add constraint attendance_status_check
  check (status = any (array['present','half_day','absent']));

-- Each HQ keeps its own list of staff roles (the dropdown in Add/Edit Staff).
-- attendance_staff.role stores the role name; renaming a role renames it on that HQ's staff,
-- and a role still used by an active staff can't be deleted.
create table if not exists public.hr_roles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.tenant_owner(),
  name text not null check (length(btrim(name)) between 1 and 60 and lower(btrim(name)) <> 'marketer'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists hr_roles_owner_name_uniq on public.hr_roles (owner_id, lower(btrim(name)));

alter table public.hr_roles enable row level security;
create policy hr_owner_all on public.hr_roles
  for all to authenticated
  using (owner_id = (select public.tenant_owner()) and ((select auth.uid()) = owner_id or (select public.is_hr_staff())))
  with check (owner_id = (select public.tenant_owner()) and ((select auth.uid()) = owner_id or (select public.is_hr_staff())));
grant select, insert, update, delete on public.hr_roles to authenticated;

create or replace function public.hr_roles_rename()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update public.attendance_staff set role = new.name, updated_at = now()
    where owner_id = old.owner_id and role = old.name;
  end if;
  return new;
end $$;

create or replace function public.hr_roles_guard_delete()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.attendance_staff
             where owner_id = old.owner_id and role = old.name and is_active is not false) then
    raise exception 'role_in_use' using hint = 'Tukar role staff tersebut dahulu.';
  end if;
  return old;
end $$;

create trigger hr_roles_rename after update of name on public.hr_roles
  for each row execute function public.hr_roles_rename();
create trigger hr_roles_guard_delete before delete on public.hr_roles
  for each row execute function public.hr_roles_guard_delete();
