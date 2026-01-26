-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.attendance (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['present'::text, 'absent'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT attendance_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.attendance_staff (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  ic_number text,
  phone text,
  address text,
  role text NOT NULL CHECK (role = ANY (ARRAY['Managing Director'::text, 'Business Support Exec'::text, 'Customer Support'::text, 'Logistic'::text, 'Multimedia'::text])),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT attendance_staff_pkey PRIMARY KEY (id)
);
CREATE TABLE public.customer_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  id_sale text,
  date_order date DEFAULT CURRENT_DATE,
  date_processed date,
  date_return date,
  marketer_id_staff text,
  total_sale numeric NOT NULL DEFAULT 0,
  unit integer NOT NULL DEFAULT 1,
  tracking_number text,
  delivery_status text DEFAULT 'Pending'::text,
  seo text,
  jenis_platform text,
  jenis_customer text,
  jenis_closing text,
  name_customer text,
  phone_customer text,
  address_customer text,
  city_customer text,
  postcode_customer text,
  state_customer text,
  kurier text,
  type_payment text,
  date_payment date,
  bank_payment text,
  receipt_payment_url text,
  nota_staff text,
  attachment_url text,
  bundle_id uuid,
  cost_postage numeric DEFAULT 0,
  cost_baseproduct numeric DEFAULT 0,
  waybill_url text,
  woo_order_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  date_approve date,
  shoppego_order_id text,
  CONSTRAINT customer_purchases_pkey PRIMARY KEY (id),
  CONSTRAINT customer_purchases_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES public.logistic_bundles(id)
);
CREATE TABLE public.device_setting (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text,
  instance text,
  webhook_id text,
  provider text DEFAULT 'whacenter'::text,
  api_key text,
  id_device text,
  phone_number text,
  status_wa text DEFAULT 'disconnected'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT device_setting_pkey PRIMARY KEY (id),
  CONSTRAINT device_setting_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category = ANY (ARRAY['Overhead'::text, 'Marketing'::text, 'Cost Product'::text, 'Other'::text])),
  description text NOT NULL,
  total numeric NOT NULL DEFAULT 0,
  date date NOT NULL,
  attachment_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT expenses_pkey PRIMARY KEY (id)
);
-- Migration SQL to update existing expenses table:
-- ALTER TABLE expenses ADD COLUMN category text CHECK (category = ANY (ARRAY['Overhead', 'Marketing', 'Cost Product', 'Other']));
-- ALTER TABLE expenses ADD COLUMN attachment_url text;
-- UPDATE expenses SET category = 'Other' WHERE category IS NULL;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS type;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS role;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS marketer_id_staff;

CREATE TABLE public.claims (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_name text NOT NULL,
  ic_number text NOT NULL,
  phone_number text,
  department text NOT NULL,
  employment_type text NOT NULL,
  pay_date date NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_deductions numeric NOT NULL DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  bank_account text NOT NULL,
  bank_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending', 'approved', 'rejected'])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT claims_pkey PRIMARY KEY (id)
);

CREATE TABLE public.invoice_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  registration_no text,
  address text,
  phone text,
  email text,
  website text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT invoice_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.logistic_bundles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  logistic_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  sku text,
  total_price numeric NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  base_cost numeric NOT NULL DEFAULT 0,
  kos_postage_sm numeric NOT NULL DEFAULT 0,
  kos_postage_ss numeric NOT NULL DEFAULT 0,
  price_online_np numeric NOT NULL DEFAULT 0,
  price_online_ep numeric NOT NULL DEFAULT 0,
  price_online_ec numeric NOT NULL DEFAULT 0,
  price_tiktok_np numeric NOT NULL DEFAULT 0,
  price_tiktok_ep numeric NOT NULL DEFAULT 0,
  price_tiktok_ec numeric NOT NULL DEFAULT 0,
  price_shopee_np numeric NOT NULL DEFAULT 0,
  price_shopee_ep numeric NOT NULL DEFAULT 0,
  price_shopee_ec numeric NOT NULL DEFAULT 0,
  postage_cod numeric NOT NULL DEFAULT 0,
  weight numeric NOT NULL DEFAULT 0.5,
  CONSTRAINT logistic_bundles_pkey PRIMARY KEY (id),
  CONSTRAINT logistic_bundles_logistic_id_fkey FOREIGN KEY (logistic_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.ninjavan_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  client_secret text NOT NULL,
  sender_name text NOT NULL,
  sender_phone text NOT NULL,
  sender_email text NOT NULL,
  sender_address1 text NOT NULL,
  sender_address2 text,
  sender_postcode text NOT NULL,
  sender_city text NOT NULL,
  sender_state text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ninjavan_config_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ninjavan_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  access_token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ninjavan_tokens_pkey PRIMARY KEY (id)
);
CREATE TABLE public.pnl_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  role text NOT NULL DEFAULT 'marketer'::text CHECK (role = ANY (ARRAY['marketer'::text, 'admin'::text])),
  min_sales numeric NOT NULL DEFAULT 0,
  max_sales numeric,
  roas_min numeric NOT NULL DEFAULT 0,
  roas_max numeric NOT NULL DEFAULT 99,
  commission_percent numeric NOT NULL DEFAULT 0,
  bonus_amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pnl_config_pkey PRIMARY KEY (id)
);
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text NOT NULL,
  base_cost numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 0,
  stock_in integer NOT NULL DEFAULT 0,
  stock_out integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT products_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  username text NOT NULL,
  full_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  password_hash text NOT NULL DEFAULT ''::text,
  idstaff text UNIQUE,
  is_active boolean DEFAULT true,
  whatsapp_number text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.prospects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nama_prospek text NOT NULL,
  no_telefon text NOT NULL,
  niche text NOT NULL,
  jenis_prospek text NOT NULL,
  tarikh_phone_number date,
  admin_id_staff text,
  created_by uuid,
  status_closed text,
  price_closed numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  marketer_id_staff text,
  count_order integer NOT NULL DEFAULT 0,
  profile text,
  admin_claimed_at timestamp with time zone,
  CONSTRAINT prospects_pkey PRIMARY KEY (id)
);
CREATE TABLE public.spends (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product text NOT NULL,
  jenis_platform text NOT NULL,
  total_spend numeric NOT NULL DEFAULT 0,
  tarikh_spend date NOT NULL DEFAULT CURRENT_DATE,
  marketer_id_staff text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  jenis_closing text,
  CONSTRAINT spends_pkey PRIMARY KEY (id)
);
CREATE TABLE public.stock_adjustment_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  adjustment_date date NOT NULL,
  adjustment_type text NOT NULL,
  product_sku text NOT NULL,
  previous_qty integer,
  adjusted_qty integer,
  new_qty integer,
  order_id uuid,
  bundle_sku text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT stock_adjustment_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.stock_in_logistic (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  logistic_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  description text,
  date timestamp with time zone NOT NULL DEFAULT now(),
  source_type text NOT NULL DEFAULT 'hq'::text CHECK (source_type = ANY (ARRAY['hq'::text, 'transfer'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT stock_in_logistic_pkey PRIMARY KEY (id),
  CONSTRAINT stock_in_logistic_logistic_id_fkey FOREIGN KEY (logistic_id) REFERENCES public.profiles(id),
  CONSTRAINT stock_in_logistic_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.stock_out_logistic (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  logistic_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  description text,
  date timestamp with time zone NOT NULL DEFAULT now(),
  recipient_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT stock_out_logistic_pkey PRIMARY KEY (id),
  CONSTRAINT stock_out_logistic_logistic_id_fkey FOREIGN KEY (logistic_id) REFERENCES public.profiles(id),
  CONSTRAINT stock_out_logistic_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT stock_out_logistic_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role USER-DEFINED NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (id),
  CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.webhook_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  webhook_type text NOT NULL,
  request_method text,
  request_body jsonb,
  request_headers jsonb,
  device_id text,
  sender text,
  message text,
  parsed_data jsonb,
  response_status integer,
  response_body jsonb,
  error_message text,
  processing_time_ms integer,
  ip_address text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT webhook_logs_pkey PRIMARY KEY (id)
);