-- Optional attachment (MC slip, letter…) on a Half Day / Absent day.
-- (Applied via Supabase MCP migration "hr_attendance_attachments" on 2026-10-09.)
alter table public.attendance
  add column if not exists attachment_path text,  -- object in bucket hr-attachments
  add column if not exists attachment_name text;  -- original file name, for display

-- Private bucket (MC slips are medical data); files are viewed through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hr-attachments', 'hr-attachments', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

-- Path = <HQ id>/<person id>/<date>-<random>.<ext>. Same rule as the attendance rows:
-- only that HQ, or its HR account.
create policy hr_attachments_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'hr-attachments'
    and (storage.foldername(name))[1] = (select public.tenant_owner())::text
    and ((select auth.uid()) = (select public.tenant_owner()) or (select public.is_hr_staff()))
  )
  with check (
    bucket_id = 'hr-attachments'
    and (storage.foldername(name))[1] = (select public.tenant_owner())::text
    and ((select auth.uid()) = (select public.tenant_owner()) or (select public.is_hr_staff()))
  );
