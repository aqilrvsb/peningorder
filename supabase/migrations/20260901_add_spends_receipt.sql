-- Optional payment/ad-spend receipt attachment on spends (image or PDF).
-- receipt_url: Vercel Blob URL of the uploaded file (or a pasted link).
-- receipt_type: 'image' | 'link' — matches the customer_purchases receipt convention.
ALTER TABLE public.spends
  ADD COLUMN IF NOT EXISTS receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS receipt_type TEXT;
