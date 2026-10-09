import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Loader2, CreditCard, Check, Crown, Zap, Rocket, Clock } from 'lucide-react';
import { PageHeader, CardsSkeleton, TableSkeleton } from '@/components/common/SoftUI';

interface PlanCfg {
  price: number;
  days: number;
  label: string;
  max_orders_per_month: number;
}

interface PaymentRow {
  id: string;
  plan: string | null;
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
}

const PLAN_ORDER = ['starter', 'growth', 'scale'] as const;
const PLAN_ICONS: Record<string, React.ReactNode> = {
  starter: <Zap className="w-6 h-6" />,
  growth: <Rocket className="w-6 h-6" />,
  scale: <Crown className="w-6 h-6" />,
};

const Billing: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState<Record<string, PlanCfg>>({});
  const [profilePlan, setProfilePlan] = useState<string>('trial');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'success') {
      toast({ title: 'Payment received!', description: 'Your plan is being activated. Refresh in a few seconds.' });
    } else if (paymentStatus === 'failed') {
      toast({ title: 'Payment failed', description: 'No charge was made. Try again.', variant: 'destructive' });
    }
  }, [searchParams]);

  useEffect(() => {
    if (user) loadAll();
  }, [user]);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [settingsRes, profileRes, paymentsRes] = await Promise.all([
        supabase.from('app_settings').select('key, value').in('key', ['plan_starter', 'plan_growth', 'plan_scale']),
        supabase.from('profiles').select('plan, plan_expires_at').maybeSingle(),
        supabase.from('payments').select('id, plan, amount, status, paid_at, created_at').order('created_at', { ascending: false }).limit(20),
      ]);

      const map: Record<string, PlanCfg> = {};
      (settingsRes.data || []).forEach((r: any) => {
        map[r.key.replace('plan_', '')] = r.value as PlanCfg;
      });
      setPlans(map);

      if (profileRes.data) {
        setProfilePlan(profileRes.data.plan || 'trial');
        setExpiresAt(profileRes.data.plan_expires_at);
      }
      setPayments((paymentsRes.data as PaymentRow[]) || []);
    } catch (err: any) {
      toast({ title: 'Load failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubscribe = async (plan: string) => {
    setSubscribing(plan);
    try {
      const { data, error } = await supabase.functions.invoke('billing-subscribe', {
        body: { plan },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.checkout_url) {
        window.location.href = data.checkout_url; // Chip hosted checkout
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      toast({ title: 'Subscribe failed', description: err.message, variant: 'destructive' });
      setSubscribing(null);
    }
  };

  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : true;
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000))
    : 0;

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <CardsSkeleton count={3} className="lg:grid-cols-3" />
        <TableSkeleton rows={4} cols={4} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        className="mb-6"
        title="Billing & Subscription"
        description="Manage your PeningOrder plan"
        icon={CreditCard}
        tone="brand"
      />

      {/* Current plan card */}
      <div className={`rounded-xl border p-5 mb-8 shadow-sm ${isExpired ? 'border-red-300 bg-red-50 dark:bg-red-950/30' : 'border-green-300 bg-green-50 dark:bg-green-950/30'}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="section-label">Current plan</p>
            <p className="text-xl font-bold capitalize">{profilePlan}</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4" />
            {isExpired ? (
              <span className="text-red-600 font-semibold">Expired — subscribe to continue</span>
            ) : (
              <span>
                {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                {expiresAt && <> · until {new Date(expiresAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}</>}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Plan grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {PLAN_ORDER.map((key) => {
          const cfg = plans[key];
          if (!cfg || (cfg as any).active === false) return null;
          const isCurrent = profilePlan === key && !isExpired;
          const isBest = key === 'growth';
          return (
            <div
              key={key}
              className={`relative rounded-xl border bg-card p-6 flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${isBest ? 'border-primary/60 shadow-md ring-2 ring-primary/10' : 'border-border/80 shadow-sm'}`}
            >
              {isBest && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand text-primary-foreground text-xs font-semibold px-3 py-0.5 rounded-full shadow-sm">
                  Popular
                </span>
              )}
              <div className="flex items-center gap-3 mb-3"><span className="icon-tile icon-tile-brand">{PLAN_ICONS[key]}</span><span className="font-semibold text-lg">{cfg.label}</span></div>
              <div className="mb-4 flex flex-wrap items-baseline gap-1.5">
                {Number((cfg as any).original_price) > cfg.price && (
                  <span className="text-lg font-semibold text-muted-foreground line-through decoration-red-500/70">RM {(cfg as any).original_price}</span>
                )}
                <span className="text-3xl font-bold">RM {cfg.price}</span>
                <span className="text-muted-foreground text-sm"> / {cfg.days} days</span>
              </div>
              <ul className="text-sm space-y-2 mb-6 flex-1">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-600" />
                  {cfg.max_orders_per_month >= 999999 ? 'Unlimited orders' : `${cfg.max_orders_per_month.toLocaleString()} orders / month`}
                </li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-600" />All 4 couriers (PD)</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-600" />Waybill bulk print</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-600" />Auto tracking updates</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-600" />Profit & expense reports</li>
              </ul>
              <Button
                className="w-full"
                variant={isCurrent ? 'outline' : 'default'}
                disabled={!!subscribing || isCurrent}
                onClick={() => handleSubscribe(key)}
              >
                {subscribing === key ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redirecting...</>
                ) : isCurrent ? (
                  'Current Plan'
                ) : profilePlan === key ? (
                  'Renew'
                ) : (
                  `Get ${cfg.label}`
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Payment history */}
      <h2 className="font-semibold text-lg mb-3">Payment History</h2>
      <div className="rounded-xl border border-border/80 bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Plan</th>
              <th className="text-right p-3">Amount</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No payments yet</td></tr>
            )}
            {payments.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-muted/40">
                <td className="p-3 whitespace-nowrap">{new Date(p.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td className="p-3 capitalize">{p.plan || '-'}</td>
                <td className="p-3 text-right whitespace-nowrap">RM {Number(p.amount).toFixed(2)}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    p.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : p.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                  }`}>
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Billing;
