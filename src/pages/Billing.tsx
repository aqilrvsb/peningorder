import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Loader2, CreditCard, Check, Crown, Zap, Rocket, Clock, Truck } from 'lucide-react';
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

const PLAN_ORDER = ['starter', 'growth', 'scale', 'byoc'] as const;
const PLAN_ICONS: Record<string, React.ReactNode> = {
  starter: <Zap className="w-6 h-6" />,
  growth: <Rocket className="w-6 h-6" />,
  scale: <Crown className="w-6 h-6" />,
  byoc: <Truck className="w-6 h-6" />,
};

// Each package's look + its courier difference. Growth = brand blue (ParcelDaily), Custom (byoc) =
// green (own courier accounts) so the two are told apart at a glance.
interface PlanTheme {
  bar: string; border: string; ring: string; tile: string; check: string; button: string;
  box: string; boxTitle: string; tag?: string; tagClass?: string; tagline: string;
  courierTitle: string; courierLines: string[];
}
const PLAN_THEME: Record<string, PlanTheme> = {
  growth: {
    bar: 'bg-brand', border: 'border-primary/40', ring: 'ring-primary/20', tile: 'icon-tile-brand', check: 'text-primary',
    button: '', box: 'border-blue-200 bg-blue-50/70 dark:border-blue-500/30 dark:bg-blue-500/10', boxTitle: 'text-blue-700 dark:text-blue-300',
    tag: 'Paling Popular', tagClass: 'bg-brand text-white', tagline: 'Sedia guna — tak perlu akaun kurier',
    courierTitle: 'Kurier melalui ParcelDaily',
    courierLines: ['Poslaju, Ninja Van, J&T, DHL — sedia guna', 'Bayar pos guna kredit ParcelDaily'],
  },
  byoc: {
    bar: 'bg-gradient-to-r from-emerald-500 to-teal-500', border: 'border-emerald-300/70 dark:border-emerald-500/30', ring: 'ring-emerald-500/20',
    tile: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm', check: 'text-emerald-600',
    button: 'border-0 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700',
    box: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10', boxTitle: 'text-emerald-700 dark:text-emerald-300',
    tag: 'Kurier Sendiri', tagClass: 'bg-emerald-600 text-white', tagline: 'Untuk bisnes yang ada akaun kurier sendiri',
    courierTitle: 'Akaun kurier anda sendiri',
    courierLines: ['Ninja Van, Pos Laju · J&T akan datang', 'Kadar pos ikut kontrak anda — tanpa ParcelDaily'],
  },
  default: {
    bar: 'bg-slate-300', border: 'border-border/80', ring: 'ring-primary/20', tile: 'icon-tile-slate', check: 'text-emerald-600', button: '',
    box: 'border-border bg-muted/40', boxTitle: 'text-foreground', tagline: '',
    courierTitle: 'Kurier melalui ParcelDaily', courierLines: ['Poslaju, Ninja Van, J&T, DHL'],
  },
};
// Same in every package.
const COMMON_FEATURES = [
  'Print waybill pukal',
  'Tracking auto + notifikasi WhatsApp',
  'Report Profit & PNL ikut platform',
  'Gaji & komisyen auto',
  'Tambah team percuma',
];

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
        supabase.from('app_settings').select('key, value').in('key', ['plan_starter', 'plan_growth', 'plan_scale', 'plan_byoc']),
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
            <p className="text-xl font-bold capitalize">{plans[profilePlan]?.label || profilePlan}</p>
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

      {/* Plan grid — each package has its own colour, and the one thing that really differs
          (how parcels are sent) sits in a highlighted box near the top. */}
      {(() => {
        // Plans on sale, plus the client's own plan even if it was switched off later (so they can renew it).
        const visible = PLAN_ORDER.filter((key) => plans[key] && ((plans[key] as any).active !== false || profilePlan === key));
        const grid = visible.length >= 3 ? 'md:grid-cols-3' : visible.length === 2 ? 'mx-auto max-w-4xl md:grid-cols-2' : 'mx-auto max-w-md';
        return (
          <div className={`grid grid-cols-1 gap-5 mb-10 ${grid}`}>
            {visible.map((key) => {
              const cfg = plans[key];
              const t = PLAN_THEME[key] || PLAN_THEME.default;
              const isCurrent = profilePlan === key && !isExpired;
              const isOwnPlan = profilePlan === key;
              return (
                <div
                  key={key}
                  className={`relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${t.border} ${isCurrent ? 'ring-2 ' + t.ring : ''}`}
                >
                  <div className={`h-1.5 w-full ${t.bar}`} />
                  <div className="flex flex-1 flex-col p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className={`icon-tile ${t.tile}`}>{PLAN_ICONS[key]}</span>
                        <div>
                          <p className="text-lg font-bold leading-tight">{cfg.label}</p>
                          <p className="text-xs text-muted-foreground">{t.tagline}</p>
                        </div>
                      </div>
                      {isCurrent ? (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Plan Semasa</span>
                      ) : t.tag ? (
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${t.tagClass}`}>{t.tag}</span>
                      ) : null}
                    </div>

                    <div className="mt-5 flex flex-wrap items-baseline gap-1.5">
                      {Number((cfg as any).original_price) > cfg.price && (
                        <span className="text-lg font-semibold text-muted-foreground line-through decoration-red-500/70">RM{(cfg as any).original_price}</span>
                      )}
                      <span className="text-4xl font-extrabold tracking-tight">RM{cfg.price}</span>
                      <span className="text-sm text-muted-foreground">/ {cfg.days} hari</span>
                    </div>

                    {/* The real difference between the packages */}
                    <div className={`mt-5 rounded-xl border p-3.5 ${t.box}`}>
                      <p className={`flex items-center gap-2 text-sm font-semibold ${t.boxTitle}`}>
                        <Truck className="h-4 w-4 shrink-0" /> {t.courierTitle}
                      </p>
                      <ul className="mt-1.5 space-y-1 pl-6 text-xs text-muted-foreground">
                        {t.courierLines.map((l) => <li key={l} className="list-disc">{l}</li>)}
                      </ul>
                    </div>

                    <ul className="mt-5 mb-6 flex-1 space-y-2.5 text-sm">
                      <li className="flex items-start gap-2"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${t.check}`} />
                        {cfg.max_orders_per_month >= 999999 ? 'Order tanpa had' : `${cfg.max_orders_per_month.toLocaleString()} order / bulan`}
                      </li>
                      {COMMON_FEATURES.map((f) => (
                        <li key={f} className="flex items-start gap-2"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${t.check}`} />{f}</li>
                      ))}
                    </ul>

                    <Button
                      className={`w-full ${!isCurrent ? t.button : ''}`}
                      variant={isCurrent ? 'outline' : 'default'}
                      disabled={!!subscribing || isCurrent}
                      onClick={() => handleSubscribe(key)}
                    >
                      {subscribing === key ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Membuka pembayaran…</>
                      ) : isCurrent ? (
                        'Plan Semasa'
                      ) : isOwnPlan ? (
                        `Sambung ${cfg.label}`
                      ) : (
                        `Pilih ${cfg.label}`
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

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
