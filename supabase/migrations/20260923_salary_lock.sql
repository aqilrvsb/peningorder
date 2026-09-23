-- Salary commission lock, keyed by MONTH (period 'YYYY-MM'). Freezes a staff's
-- computed commission for a month so it stops drifting as returns/collections come
-- in later. `snapshot` holds everything the frozen Bundle Lock modal + Slip Lock
-- need (row metrics, config flags, bundle groups). start_date/end_date keep the
-- range the snapshot was computed on. Tenant-scoped; only the owner (HQ, not staff)
-- may lock/unlock — all tenant members can read (staff see their own locked value).
DROP TABLE IF EXISTS public.salary_lock;
CREATE TABLE public.salary_lock (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid DEFAULT tenant_owner(),
  idstaff       text NOT NULL,
  period        text NOT NULL,                 -- 'YYYY-MM'
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  commission    numeric NOT NULL DEFAULT 0,
  snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, idstaff, period)
);
CREATE INDEX IF NOT EXISTS salary_lock_owner_period_idx ON public.salary_lock (owner_user_id, period);

ALTER TABLE public.salary_lock ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON public.salary_lock FOR SELECT USING (owner_user_id = tenant_owner());
CREATE POLICY tenant_insert ON public.salary_lock FOR INSERT WITH CHECK (owner_user_id = tenant_owner() AND NOT is_marketer_staff());
CREATE POLICY tenant_update ON public.salary_lock FOR UPDATE USING (owner_user_id = tenant_owner() AND NOT is_marketer_staff()) WITH CHECK (owner_user_id = tenant_owner());
CREATE POLICY tenant_delete ON public.salary_lock FOR DELETE USING (owner_user_id = tenant_owner() AND NOT is_marketer_staff());
