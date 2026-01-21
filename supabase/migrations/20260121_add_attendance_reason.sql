-- Migration: Add reason column to attendance table
-- This allows storing the reason for absence

-- Add reason column to attendance table
ALTER TABLE public.attendance
ADD COLUMN IF NOT EXISTS reason TEXT;

-- Add comment explaining the field
COMMENT ON COLUMN public.attendance.reason IS 'Reason for absence when status is absent';
