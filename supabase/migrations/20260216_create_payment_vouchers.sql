-- Payment Vouchers table
CREATE TABLE IF NOT EXISTS public.payment_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_number text NOT NULL,
  date text NOT NULL,
  pay_to text NOT NULL,
  pay_by text NOT NULL,
  payment_method text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  purpose_of_payment text,
  note text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_vouchers ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated access
CREATE POLICY "Allow all authenticated access" ON public.payment_vouchers
  FOR ALL USING (true) WITH CHECK (true);
