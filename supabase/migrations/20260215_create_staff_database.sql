-- Staff Database table for detailed employee information
CREATE TABLE IF NOT EXISTS public.staff_database (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  staff_source text NOT NULL CHECK (staff_source IN ('attendance_staff', 'profiles')),

  -- Info Diri (Personal Info)
  nama text,
  jantina text,
  umur text,
  no_kad_pengenalan text,
  warganegara text,
  bangsa text,
  agama text,
  status_perkahwinan text,
  alamat_tetap text,
  alamat_surat text,
  no_telefon text,
  jawatan text,
  tarikh_mula_berkhidmat text,

  -- Info Bank (Banking Info)
  nama_bank text,
  nama_pemilik_bank text,
  no_akaun text,
  jenis_akaun text,

  -- Info Waris 1 (Next of Kin 1)
  waris1_nama text,
  waris1_hubungan text,
  waris1_telefon text,
  waris1_alamat text,

  -- Info Waris 2 (Next of Kin 2)
  waris2_nama text,
  waris2_hubungan text,
  waris2_telefon text,
  waris2_alamat text,

  -- Info Akademik (Academic Info) - stored as JSON array
  -- [{nama_kelayakan, nama_sekolah, tahun, keputusan}]
  akademik jsonb DEFAULT '[]'::jsonb,

  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT staff_database_unique_staff UNIQUE (staff_id, staff_source)
);

-- Enable RLS
ALTER TABLE public.staff_database ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read/write
CREATE POLICY "Allow all authenticated access" ON public.staff_database
  FOR ALL USING (true) WITH CHECK (true);
