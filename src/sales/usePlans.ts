import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Live plan config from app_settings (plan_starter/growth/scale), shared by every landing
// section that mentions a price — so the hero, calculator CTA and pricing cards always show
// what the superadmin set in /dashboard/admin/pricing (never a hard-coded price).
export type PlanKey = 'starter' | 'growth' | 'scale';
export type PlanCfg = {
  price: number; days: number; label: string; max_orders_per_month: number;
  original_price?: number; active?: boolean;
};

let cache: Promise<Record<string, PlanCfg>> | null = null;

function loadPlans(): Promise<Record<string, PlanCfg>> {
  cache ??= (async () => {
    // app_settings isn't in the generated types yet (same as the rest of the codebase).
    const { data } = await (supabase as any)
      .from('app_settings')
      .select('key, value')
      .in('key', ['plan_starter', 'plan_growth', 'plan_scale']);
    const map: Record<string, PlanCfg> = {};
    (data ?? []).forEach((r: { key: string; value: unknown }) => {
      map[r.key.replace('plan_', '')] = r.value as PlanCfg;
    });
    return map;
  })();
  return cache;
}

export function usePlans() {
  const [plans, setPlans] = useState<Record<string, PlanCfg>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    loadPlans().then((p) => { if (!cancelled) { setPlans(p); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);
  const active = (Object.entries(plans) as [PlanKey, PlanCfg][]).filter(([, p]) => p && p.active !== false);
  const cheapest = active.length ? active.reduce((a, b) => (b[1].price < a[1].price ? b : a))[1] : null;
  return { plans, loading, active, cheapest };
}

/** "RM100" — or a neutral fallback while prices load. */
export const priceLabel = (p: PlanCfg | null) => (p ? `RM${p.price}` : 'RM…');
