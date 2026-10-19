-- Optional "Bukti Confirmation" image per order (proof the customer confirmed, e.g. a
-- WhatsApp screenshot). Uploaded at key-in / edit (images only, Vercel Blob confirmations/),
-- shown as a thumbnail in History → Bukti.
-- (Applied via Supabase MCP migration "customer_purchases_confirmation_url" on 2026-10-19.)
alter table public.customer_purchases add column if not exists confirmation_url text;
comment on column public.customer_purchases.confirmation_url is
  'Optional "Bukti Confirmation" image (customer confirmed the order, e.g. WhatsApp screenshot) uploaded at key-in/edit. Vercel Blob URL under confirmations/. Shown in History > Bukti.';
