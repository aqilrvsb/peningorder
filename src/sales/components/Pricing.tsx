import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Zap, Rocket, Crown, Sparkles, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// Pricing pulls live plan config from app_settings (plan_starter/growth/scale)
// so whatever the superadmin sets in /dashboard/admin/pricing shows here on the
// next visitor refresh. Each plan value = { price, days, label, max_orders_per_month }.
type PlanKey = 'starter' | 'growth' | 'scale';
type PlanCfg = { price: number; days: number; label: string; max_orders_per_month: number };

const ORDER: PlanKey[] = ['starter', 'growth', 'scale'];
const ICONS: Record<PlanKey, React.ReactNode> = {
  starter: <Zap className="h-5 w-5" />,
  growth: <Rocket className="h-5 w-5" />,
  scale: <Crown className="h-5 w-5" />,
};
const BLURB: Record<PlanKey, string> = {
  starter: 'Untuk usahawan solo yang baru nak kemaskan order.',
  growth: 'Untuk bisnes membesar dengan volume order tinggi.',
  scale: 'Untuk brand established & team yang perlukan skala penuh.',
};
const EXTRAS: Record<PlanKey, string[]> = {
  starter: ['Semua kurier (Poslaju, NinjaVan, J&T, DHL)', 'Print waybill pukal', 'Report untung asas'],
  growth: ['Semua dalam Starter', 'Import WooCommerce & Shopee', 'Multi-staff (marketer/logistik/akaun)', 'Report untung lanjutan'],
  scale: ['Semua dalam Growth', 'Order tanpa had', 'Priority support', 'Webhook & API access'],
};

export default function Pricing() {
  const [plans, setPlans] = useState<Record<string, PlanCfg>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['plan_starter', 'plan_growth', 'plan_scale']);
      if (cancelled) return;
      const map: Record<string, PlanCfg> = {};
      (data ?? []).forEach((r: { key: string; value: unknown }) => {
        map[r.key.replace('plan_', '')] = r.value as PlanCfg;
      });
      setPlans(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section id="pricing" className="bg-po-surface py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-po-blue/30 bg-po-blue/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-po-blue-dark">
            <Sparkles className="h-3.5 w-3.5" />
            14 hari percuma dulu — bayar bila puas hati
          </div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-po-ink sm:text-4xl">Harga jujur, tiada kontrak</h2>
          <p className="mt-4 text-po-ink-soft">
            Semua plan mula dengan trial 14 hari percuma. Cancel bila-bila. Bayar selamat via CHIP (FPX, e-wallet, kad kredit).
          </p>
        </div>

        {loading ? (
          <div className="mt-14 rounded-2xl border border-po-border bg-white p-8 text-center text-sm text-po-ink-muted">Loading harga…</div>
        ) : (
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {ORDER.map((key, idx) => {
              const p = plans[key];
              if (!p) return null;
              const isPopular = key === 'growth';
              const noCap = p.max_orders_per_month >= 999999;
              return (
                <div
                  key={key}
                  className={`relative flex flex-col rounded-2xl border p-6 ${isPopular ? 'border-po-blue bg-white shadow-2xl md:-translate-y-2' : 'border-po-border bg-white shadow-sm'}`}
                >
                  {isPopular && (
                    <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-po-blue px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-md">
                      <Sparkles className="h-3 w-3" />
                      Paling Popular
                    </span>
                  )}
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${isPopular ? 'bg-po-blue text-white' : 'bg-po-blue-tint text-po-blue'}`}>
                      {ICONS[key]}
                    </span>
                    <h3 className="text-lg font-bold text-po-ink">{p.label}</h3>
                  </div>
                  <p className="mt-3 min-h-[2.5rem] text-sm text-po-ink-soft">{BLURB[key]}</p>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-4xl font-extrabold text-po-ink">RM{p.price}</span>
                    <span className="text-sm font-medium text-po-ink-muted">/ {p.days} hari</span>
                  </div>

                  <ul className="mt-6 flex-1 space-y-2.5">
                    <li className="flex items-start gap-2 text-sm text-po-ink">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-po-success" />
                      <span><span className="font-semibold">{noCap ? 'Order tanpa had' : `${p.max_orders_per_month.toLocaleString('en-MY')} order`}</span>{noCap ? '' : ' / bulan'}</span>
                    </li>
                    {EXTRAS[key].map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-po-ink">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-po-success" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to={`/checkout?plan=${key}`}
                    className={`mt-6 block rounded-full px-5 py-3 text-center text-sm font-bold transition-colors ${isPopular ? 'bg-po-blue text-white hover:bg-po-blue-hover' : 'border border-po-border-strong bg-white text-po-ink hover:bg-po-surface'}`}
                  >
                    Mula dengan {p.label}
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-10 flex items-center justify-center gap-2 text-center text-sm text-po-ink-muted">
          <ShieldCheck className="h-4 w-4 text-po-success" />
          Semua harga MYR · Tiada setup fee · Cancel bila-bila · Bayaran diproses oleh <span className="font-semibold text-po-ink">CHIP</span>
        </p>
      </div>
    </section>
  );
}
