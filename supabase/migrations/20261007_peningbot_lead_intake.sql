-- PeningBot -> peningorder lead intake (edge function lead-intake).
-- PeningBot posts a lead with the marketer's ID staff.

-- peningbot_email was the first design (match by email). It is unused now that
-- PeningBot sends the ID staff; kept only because the column already exists.
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
