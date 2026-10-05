-- cron_secret lived in app_settings, which is readable by everyone (policy
-- `true`, anon included), so anyone could fetch it and trigger
-- parceldaily-sync-cron. It now lives in platform_secrets (superadmin-only)
-- under a freshly generated value; the function no longer accepts the old,
-- exposed one (verified: old secret -> 401, new -> 200).
insert into public.platform_secrets (key, value, updated_at)
values ('cron_secret', jsonb_build_object('secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')), now())
on conflict (key) do nothing;

select cron.alter_job(
  (select jobid from cron.job where jobname = 'parceldaily-sync-30min'),
  command := $cmd$
  select net.http_post(
    url := 'https://ybtswwzunvuqildqscxk.supabase.co/functions/v1/parceldaily-sync-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value->>'secret' from public.platform_secrets where key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cmd$
);

-- Optional cleanup (not applied; the old value is already useless):
-- delete from public.app_settings where key = 'cron_secret';
