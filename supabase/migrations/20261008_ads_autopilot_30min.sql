-- Ads autopilot checks every 30 minutes (budget scale + auto-off); the function
-- sends the full WhatsApp report only on the :00 tick, and at :30 only if it changed something.
select cron.unschedule('ads-autopilot-hourly')
where exists (select 1 from cron.job where jobname = 'ads-autopilot-hourly');

select cron.schedule(
  'ads-autopilot',
  '0,30 * * * *',
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
