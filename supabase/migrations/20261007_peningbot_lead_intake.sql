-- PeningBot -> peningorder lead intake (edge function lead-intake).
-- PeningBot posts a lead with the marketer's email; we match it to a staff's
-- PeningBot email (set on the Team page) or a client's own login email.

-- Staff log in with a synthetic @staff.peningorder.local email, so the email
-- they use in PeningBot is stored separately. One account per email.
alter table public.profiles
  add column if not exists peningbot_email text;

create unique index if not exists profiles_peningbot_email_uniq
  on public.profiles (lower(peningbot_email))
  where peningbot_email is not null;

-- Shared API key PeningBot sends in the x-api-key header. platform_secrets is
-- superadmin-only (app_settings is world-readable).
insert into public.platform_secrets (key, value, updated_at)
values ('peningbot_lead', jsonb_build_object('secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')), now())
on conflict (key) do nothing;
