-- Deactivated staff are hidden from per-staff listings (Report Profit "Profit Team",
-- Top Ranking, Salary); their orders still count in overall totals.
-- team_roster gains is_active; team_ranking lists active staff only.
-- (Applied via Supabase MCP migration "team_hide_inactive" on 2026-09-29.)
drop function if exists public.team_roster();
create function public.team_roster()
returns table(idstaff text, name text, is_self boolean, is_client boolean, commission_percent numeric, pay_mode text, roas_tiers jsonb, role text, invoice_full_name text, invoice_address text, invoice_phone text, is_active boolean)
language sql stable security definer set search_path to 'public' as $function$
  select p.idstaff,
    coalesce(nullif(p.full_name, ''), nullif(p.business_name, ''), p.idstaff),
    (p.id = auth.uid()), (p.parent_user_id is null),
    coalesce(p.commission_percent, 0), coalesce(p.pay_mode, 'commission_order'), p.roas_tiers,
    (select ur.role::text from public.user_roles ur where ur.user_id = p.id limit 1),
    p.invoice_full_name, p.invoice_address, p.invoice_phone,
    coalesce(p.is_active, true)
  from public.profiles p
  where p.id = public.tenant_owner() or p.parent_user_id = public.tenant_owner()
  order by (p.parent_user_id is null) desc, p.idstaff;
$function$;
grant execute on function public.team_roster() to authenticated;
-- team_ranking: same body as before plus `and coalesce(p.is_active, true)` in the final WHERE.
