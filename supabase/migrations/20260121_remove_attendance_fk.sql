-- Migration: Remove foreign key constraint from attendance table
-- This allows attendance records to reference both profiles AND attendance_staff tables
-- The attendance.user_id can now store IDs from either table

-- Drop the existing foreign key constraint
ALTER TABLE public.attendance
DROP CONSTRAINT IF EXISTS attendance_user_id_fkey;

-- Add a comment explaining the change
COMMENT ON COLUMN public.attendance.user_id IS 'References either profiles.id or attendance_staff.id - no FK constraint to allow flexibility';
