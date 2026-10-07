-- Leads follow-up sheet (same flow as the daily-report NP sheet):
-- STATUS BOT  : INTRO -> F.F -> PRESENT -> OFFER   (wa_*)
-- STATUS CALL : TIDAK ANGKAT (3x) + BLOCKED, INTRO -> F.F -> PRESENT -> OFFER (call_*)
-- BOOKING date. CLOSE (RM) / alamat / tracking come from the lead's orders
-- (sync_prospect_close keeps price_closed in step), so they are not stored here.
alter table public.prospects
  add column if not exists wa_intro boolean not null default false,
  add column if not exists wa_ff boolean not null default false,
  add column if not exists wa_present boolean not null default false,
  add column if not exists wa_offer boolean not null default false,
  add column if not exists call_intro boolean not null default false,
  add column if not exists call_ff boolean not null default false,
  add column if not exists call_present boolean not null default false,
  add column if not exists call_offer boolean not null default false,
  add column if not exists call_tidak_angkat smallint not null default 0,
  add column if not exists blocked boolean not null default false,
  add column if not exists wa_ff_note text,
  add column if not exists wa_present_note text,
  add column if not exists wa_offer_note text,
  add column if not exists call_ff_note text,
  add column if not exists call_present_note text,
  add column if not exists call_offer_note text,
  add column if not exists booking_date date,
  add column if not exists tidak_angkat_last timestamptz,
  add column if not exists ts_wa_intro timestamptz,
  add column if not exists ts_wa_ff timestamptz,
  add column if not exists ts_wa_present timestamptz,
  add column if not exists ts_wa_offer timestamptz,
  add column if not exists ts_call_intro timestamptz,
  add column if not exists ts_call_ff timestamptz,
  add column if not exists ts_call_present timestamptz,
  add column if not exists ts_call_offer timestamptz,
  add column if not exists ts_tidak_angkat timestamptz,
  add column if not exists ts_blocked timestamptz,
  add column if not exists ts_booking timestamptz;

-- Status times are system-set: stamped when a status is ticked, cleared when
-- unticked; whatever a client sends for ts_* is ignored. TIDAK ANGKAT goes up
-- one tick at a time (max 3) with at least 30 minutes between call attempts.
create or replace function public.prospect_followup_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_wait int;
begin
  new.ts_wa_intro     := case when new.wa_intro     is distinct from old.wa_intro     then case when new.wa_intro     then now() end else old.ts_wa_intro     end;
  new.ts_wa_ff        := case when new.wa_ff        is distinct from old.wa_ff        then case when new.wa_ff        then now() end else old.ts_wa_ff        end;
  new.ts_wa_present   := case when new.wa_present   is distinct from old.wa_present   then case when new.wa_present   then now() end else old.ts_wa_present   end;
  new.ts_wa_offer     := case when new.wa_offer     is distinct from old.wa_offer     then case when new.wa_offer     then now() end else old.ts_wa_offer     end;
  new.ts_call_intro   := case when new.call_intro   is distinct from old.call_intro   then case when new.call_intro   then now() end else old.ts_call_intro   end;
  new.ts_call_ff      := case when new.call_ff      is distinct from old.call_ff      then case when new.call_ff      then now() end else old.ts_call_ff      end;
  new.ts_call_present := case when new.call_present is distinct from old.call_present then case when new.call_present then now() end else old.ts_call_present end;
  new.ts_call_offer   := case when new.call_offer   is distinct from old.call_offer   then case when new.call_offer   then now() end else old.ts_call_offer   end;
  new.ts_blocked      := case when new.blocked      is distinct from old.blocked      then case when new.blocked      then now() end else old.ts_blocked      end;

  new.call_tidak_angkat := greatest(0, least(3, coalesce(new.call_tidak_angkat, 0)));
  if new.call_tidak_angkat > old.call_tidak_angkat then
    new.call_tidak_angkat := old.call_tidak_angkat + 1;
    if old.tidak_angkat_last is not null and now() < old.tidak_angkat_last + interval '30 minutes' then
      v_wait := ceil(extract(epoch from (old.tidak_angkat_last + interval '30 minutes' - now())) / 60);
      raise exception 'Tunggu % minit lagi sebelum tick TIDAK ANGKAT seterusnya (gap 30 minit setiap cubaan call)', v_wait;
    end if;
    new.tidak_angkat_last := now();
    new.ts_tidak_angkat := now();
  else
    new.tidak_angkat_last := old.tidak_angkat_last;
    new.ts_tidak_angkat := case when new.call_tidak_angkat = 0 then null else old.ts_tidak_angkat end;
  end if;

  new.ts_booking := case
    when new.booking_date is null then null
    when old.booking_date is null then now()
    else old.ts_booking
  end;
  return new;
end;
$$;

create trigger trg_prospect_followup_stamp
  before update on public.prospects
  for each row execute function public.prospect_followup_stamp();

-- Latest order per lead phone (alamat + tracking for the sheet). Runs as the
-- caller, so RLS still limits marketer staff to their own orders.
create or replace function public.lead_order_info(p_phones text[])
returns table (ph text, alamat text, tracking text, delivery_status text, date_order date)
language sql
stable
set search_path = public
as $$
  select distinct on (norm_phone(o.phone_customer))
    norm_phone(o.phone_customer),
    concat_ws(', ', nullif(o.address_customer, ''), nullif(o.postcode_customer, ''), nullif(o.city_customer, ''), nullif(o.state_customer, '')),
    o.tracking_number,
    o.delivery_status,
    o.date_order
  from customer_purchases o
  where o.owner_user_id = tenant_owner()
    and norm_phone(o.phone_customer) = any(p_phones)
  order by norm_phone(o.phone_customer), o.date_order desc, o.created_at desc;
$$;

grant execute on function public.lead_order_info(text[]) to authenticated;
