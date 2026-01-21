-- Migration: Add staff_type field to profiles table
-- This allows classifying marketer and admin users as either HQ or Fighter

-- Add staff_type column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS staff_type TEXT DEFAULT 'HQ';

-- Add comment explaining the field
COMMENT ON COLUMN public.profiles.staff_type IS 'Staff classification: HQ (headquarters) or Fighter (field). Only applicable for marketer and admin roles.';

-- Update existing profiles to default to HQ where staff_type is NULL
UPDATE public.profiles
SET staff_type = 'HQ'
WHERE staff_type IS NULL;
