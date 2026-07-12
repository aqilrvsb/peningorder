import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Tags, Loader2, Save, Clock, Zap, Rocket, Crown } from 'lucide-react';

interface PlanCfg {
  label: string;
  price: number;
  days: number;
  max_orders_per_month: number;
}

const PLAN_KEYS = ['trial', 'starter', 'growth', 'scale'] as const;
const PLAN_ICONS: Record<string, React.ReactNode> = {
  trial: <Clock className="w-5 h-5" />,
  starter: <Zap className="w-5 h-5" />,
  growth: <Rocket className="w-5 h-5" />,
  scale: <Crown className="w-5 h-5" />,
};

const AdminPricing: React.FC = () => {
  const { profile } = useAuth();
  const [plans, setPlans] = useState<Record<string, PlanCfg>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const isSuperadmin = profile?.role === 'superadmin';

  useEffect(() => {
    if (!isSuperadmin) return;
    (async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', PLAN_KEYS.map((k) => `plan_${k}`));
      if (error) {
        toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
      } else {
        const map: Record<string, PlanCfg> = {};
        (data || []).forEach((r: any) => { map[r.key.replace('plan_', '')] = r.value as PlanCfg; });
        setPlans(map);
      }
      setLoading(false);
    })();
  }, [isSuperadmin]);

  const setField = (key: string, field: keyof PlanCfg, value: string) => {
    setPlans((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: field === 'label' ? value : Number(value),
      },
    }));
  };

  const savePlan = async (key: string) => {
    const cfg = plans[key];
    if (!cfg?.label || cfg.days <= 0) {
      toast({ title: 'Invalid plan', description: 'Label required, days must be > 0.', variant: 'destructive' });
      return;
    }
    setSavingKey(key);
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: `plan_${key}`, value: cfg as any, updated_at: new Date().toISOString() });
    setSavingKey(null);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Plan saved', description: `${cfg.label} — RM ${cfg.price} / ${cfg.days} days` });
    }
  };

  if (!isSuperadmin) return <div className="p-6 text-muted-foreground">Not authorized.</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Tags className="w-7 h-7 text-primary" /> Pricing Plans
        </h1>
        <p className="text-muted-foreground mt-2">
          Dynamic pricing — changes apply instantly to Billing page, checkout, and the landing page
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {PLAN_KEYS.map((key) => {
            const cfg = plans[key];
            if (!cfg) return null;
            return (
              <Card key={key}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-2 text-primary">
                    {PLAN_ICONS[key]}
                    <span className="font-semibold text-lg capitalize">{key}</span>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase">Label</label>
                    <Input value={cfg.label} onChange={(e) => setField(key, 'label', e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase">Price (RM)</label>
                    <Input type="number" value={cfg.price} onChange={(e) => setField(key, 'price', e.target.value)} className="mt-1" disabled={key === 'trial'} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase">Duration (days)</label>
                    <Input type="number" value={cfg.days} onChange={(e) => setField(key, 'days', e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase">Max Orders / Month</label>
                    <Input type="number" value={cfg.max_orders_per_month} onChange={(e) => setField(key, 'max_orders_per_month', e.target.value)} className="mt-1" />
                  </div>
                  <Button className="w-full" onClick={() => savePlan(key)} disabled={savingKey === key}>
                    {savingKey === key ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminPricing;
