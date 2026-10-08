-- HR login account: ONE per HQ (like the Logistic account), role 'hr', idstaff <HQ>-HR.
-- It manages only HR (User + Attendance) for its HQ and must not read any sales data.
-- (Applied via Supabase MCP on 2026-10-09 as three migrations: hr_staff_role,
--  hr_attendance_tenant_access, hr_staff_blocked_from_tenant_data. No DROP/REVOKE —
--  the MCP declines destructive statements in this setup.)

-- 1) hr_staff_role ---------------------------------------------------------------------
create or replace function public.is_hr_staff()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(
    select 1 from public.profiles p
    join public.user_roles r on r.user_id = p.id
    where p.id = auth.uid() and p.parent_user_id is not null and r.role = 'hr'
  );
$$;
grant execute on function public.is_hr_staff() to authenticated;

-- handle_new_user: staff_role 'hr' becomes the hr app_role (was: logistic | marketer only).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_full_name text := coalesce(NEW.raw_user_meta_data->>'full_name', '');
  v_staff_of text := NEW.raw_user_meta_data->>'staff_of';
  v_staff_idstaff text := NEW.raw_user_meta_data->>'staff_idstaff';
  v_staff_role text := coalesce(NEW.raw_user_meta_data->>'staff_role', 'marketer');
  v_idstaff   text;
  v_attempt   int := 0;
  v_constraint text;
  v_parent uuid;
  v_expiry timestamptz;
begin
  if v_staff_of is not null and v_staff_idstaff is not null then
    v_parent := v_staff_of::uuid;
    select plan_expires_at into v_expiry from public.profiles where id = v_parent;
    insert into public.profiles (id, email, username, full_name, business_name, whatsapp, whatsapp_number, idstaff, is_active, plan, plan_expires_at, parent_user_id)
    values (
      NEW.id, NEW.email,
      coalesce(NEW.raw_user_meta_data->>'username', v_staff_idstaff),
      v_full_name, '',
      coalesce(NEW.raw_user_meta_data->>'whatsapp', ''),
      coalesce(NEW.raw_user_meta_data->>'whatsapp', ''),
      v_staff_idstaff, true, 'staff', v_expiry, v_parent
    );
    insert into public.user_roles (user_id, role)
    values (NEW.id, (case when v_staff_role in ('logistic', 'hr') then v_staff_role else 'marketer' end)::app_role);
    return NEW;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_idstaff := public.gen_idstaff(v_full_name);
    begin
      insert into public.profiles (id, email, username, full_name, business_name, whatsapp, idstaff, is_active, plan, plan_expires_at)
      values (
        NEW.id, NEW.email,
        coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        v_full_name,
        coalesce(NEW.raw_user_meta_data->>'business_name', ''),
        coalesce(NEW.raw_user_meta_data->>'whatsapp', ''),
        v_idstaff, true, 'trial', now() + INTERVAL '14 days'
      );
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'profiles_idstaff_key' and v_attempt < 10 then
      else raise; end if;
    end;
  end loop;
  insert into public.user_roles (user_id, role) values (NEW.id, 'client');
  return NEW;
end;
$function$;

-- 2) hr_attendance_tenant_access -------------------------------------------------------
-- Attendance + extra staff belong to the HQ; the HQ and its HR account manage them.
alter table public.attendance_staff alter column owner_id set default public.tenant_owner();
alter table public.attendance alter column owner_id set default public.tenant_owner();
alter policy hr_owner_all on public.attendance_staff
  using (owner_id = (select public.tenant_owner()) and ((select auth.uid()) = owner_id or (select public.is_hr_staff())))
  with check (owner_id = (select public.tenant_owner()) and ((select auth.uid()) = owner_id or (select public.is_hr_staff())));
alter policy hr_owner_all on public.attendance
  using (owner_id = (select public.tenant_owner()) and ((select auth.uid()) = owner_id or (select public.is_hr_staff())))
  with check (owner_id = (select public.tenant_owner()) and ((select auth.uid()) = owner_id or (select public.is_hr_staff())));

-- 3) hr_staff_blocked_from_tenant_data -------------------------------------------------
-- The tenant tables let every non-marketer staff read the whole tenant (that's how the
-- Logistic account works). Block the HR account from all of them with a RESTRICTIVE
-- policy — it ANDs with the existing ones, so no other role is affected.
do $$
declare t text;
begin
  foreach t in array array[
    'customer_purchases','customers','device_setting','expenses','integration_product_map',
    'integration_unmatched','invoice_settings','invoices','logistic_bundles','parceldaily_config',
    'pnl_config','products','prospects','salary_lock','spends','stock_in_logistic',
    'stock_out_logistic','ticket_replies','tickets','tracking_status_setting','wa_notify_log'
  ] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'hr_staff_blocked') then
      execute format(
        'create policy hr_staff_blocked on public.%I as restrictive for all to authenticated '
        'using (not (select public.is_hr_staff())) with check (not (select public.is_hr_staff()))', t);
    end if;
  end loop;
end $$;
