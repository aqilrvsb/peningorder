-- Public bucket for Meta ad videos/thumbnails (Meta pulls media from a public URL).
-- Read is public via the bucket's public flag; writes only through signed upload
-- URLs minted by the service role (edge function ad-media-upload), so there is
-- no insert policy for anon/authenticated.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ad-media', 'ad-media', true, 104857600, array['video/mp4', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

insert into public.platform_secrets (key, value, updated_at)
values ('ad_media_upload', jsonb_build_object('secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')), now())
on conflict (key) do nothing;
