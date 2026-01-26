-- Add invoice_number column to claims table
ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS invoice_number TEXT DEFAULT '-';

-- Add comment to explain the column
COMMENT ON COLUMN public.claims.invoice_number IS 'Invoice number for the claim';
