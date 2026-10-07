-- Meta ads autopilot (edge fn ads-autopilot, hourly via pg_cron):
--   budget = base + step × purchases today (capped), auto-pause ads that spend
--   ≥ pause_spend today with 0 purchases, reset everything at 12am MYT, and
--   WhatsApp an hourly report (quiet 12am–4am).
-- Config + the Meta System User token live in platform_secrets (superadmin-only).
insert into public.platform_secrets (key, value, updated_at)
values ('meta_ads_autopilot', jsonb_build_object(
  'enabled', false,                 -- flips to true once access_token is set
  'access_token', null,             -- Meta System User token (ads_management)
  'ad_account_id', '4179806152242640',
  'campaign_ids', '[]'::jsonb,      -- empty = every CBO campaign in the account
  'base_budget', 3000,              -- sen (RM30)
  'step', 1000,                     -- +RM10 per purchase
  'max_budget', 10000,              -- RM100 cap
  'pause_spend', 6000,              -- pause an ad at RM60 spent today with 0 purchases
  'notify_phone', '60108924904',
  'quiet_start', 0,                 -- no WhatsApp report 00:00–03:59 MYT
  'quiet_end', 4
), now())
on conflict (key) do nothing;

-- Ads this autopilot paused, so the midnight reset only turns those back on.
create table if not exists public.ads_autopilot_paused (
  ad_id text primary key,
  campaign_id text,
  ad_name text,
  spend numeric,
  paused_at timestamptz not null default now()
);
alter table public.ads_autopilot_paused enable row level security;

create table if not exists public.ads_autopilot_log (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  mode text not null,
  summary jsonb
);
alter table public.ads_autopilot_log enable row level security;
-- No policies: only the service role (edge function) touches these tables.

-- Hourly at :00 (UTC schedule; the function works out the MYT hour itself).
select cron.schedule(
  'ads-autopilot-hourly',
  '0 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://ybtswwzunvuqildqscxk.supabase.co/functions/v1/ads-autopilot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value->>'secret' from public.platform_secrets where key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cmd$
);

-- Paused-ad rows belong to one autopilot profile (one ad account / token).
alter table public.ads_autopilot_paused add column if not exists profile text not null default 'meta_ads_autopilot';
