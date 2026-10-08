-- Auto-off verdicts (jaga spend + ROAS): besides "off today" (re-enabled at 12am), the autopilot
-- now turns ads off for good when, over the last verdict_days, they spent ≥ kill_spend with no
-- purchase or ≥ roas_min_spend with ROAS < min_roas. kind tells the midnight reset which to restore.
alter table public.ads_autopilot_paused add column if not exists kind text not null default 'daily';
alter table public.ads_autopilot_paused add column if not exists reason text;

update public.platform_secrets
set value = jsonb_build_object(
      'kill_spend', 10000,      -- RM100 in 7 days, 0 purchase → off
      'roas_min_spend', 15000,  -- after RM150 in 7 days …
      'min_roas', 1,            -- … ROAS below 1.0x → off
      'verdict_days', 7
    ) || value,                 -- keep any values already set
    updated_at = now()
where key like 'meta_ads_autopilot%';
