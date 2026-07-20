import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Package, Loader2, ShieldCheck, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// Public checkout. Collects the visitor's details + chosen plan, then calls the
// sales-checkout edge function which:
//   1. creates a confirmed account (14-day trial via handle_new_user),
//   2. opens a CHIP payment intent for the plan.
// We then sign the user in client-side (so they're always logged in, even if
// they abandon payment) and forward to CHIP. On CHIP success they land back on
// /dashboard/billing with their plan upgraded by the billing-webhook.
type PlanKey = 'starter' | 'growth' | 'scale';
type PlanCfg = { price: number; days: number; label: string; max_orders_per_month: number };
const VALID: PlanKey[] = ['starter', 'growth', 'scale'];

function friendlyError(err: string): string {
  if (err === 'email_exists') return 'Email ni dah ada akaun. Sila log masuk.';
  if (err.includes('invalid email')) return 'Email tak sah.';
  if (err.includes('invalid phone')) return 'Nombor WhatsApp tak sah. Format: 60xxxxxxxxx (mula 60, tiada +).';
  if (err.includes('password')) return 'Password terlalu pendek (minimum 6 aksara).';
  if (err.includes('full_name')) return 'Nama penuh terlalu pendek.';
  if (err.includes('business_name')) return 'Nama bisnes terlalu pendek.';
  return err;
}

export default function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const planParam = (searchParams.get('plan') || 'starter').toLowerCase();
  const plan: PlanKey = (VALID.includes(planParam as PlanKey) ? planParam : 'starter') as PlanKey;
  const status = searchParams.get('status');

  const [cfg, setCfg] = useState<PlanCfg | null>(null);
  const [loadingCfg, setLoadingCfg] = useState(true);

  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('60');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Daftar — PeningOrder';
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCfg(true);
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', `plan_${plan}`)
        .maybeSingle();
      if (cancelled) return;
      setCfg((data?.value as PlanCfg) ?? null);
      setLoadingCfg(false);
    })();
    return () => { cancelled = true; };
  }, [plan]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error: fnErr } = await supabase.functions.invoke('sales-checkout', {
        body: {
          full_name: fullName.trim(),
          business_name: businessName.trim(),
          email: cleanEmail,
          phone: phone.replace(/\D/g, ''),
          password,
          plan,
        },
      });

      // functions.invoke surfaces non-2xx as fnErr with a context response.
      if (fnErr) {
        let detail = fnErr.message;
        try {
          const body = await (fnErr as unknown as { context: Response }).context?.json?.();
          if (body?.error) detail = body.error === 'validation' ? body.detail : body.error;
        } catch { /* keep default */ }
        if (String(detail).includes('email_exists')) {
          setError(friendlyError('email_exists'));
          setBusy(false);
          setTimeout(() => navigate(`/auth?email=${encodeURIComponent(cleanEmail)}`), 1500);
          return;
        }
        setError(friendlyError(String(detail)));
        setBusy(false);
        return;
      }

      if (!data?.success) {
        setError('Gagal daftar. Cuba lagi.');
        setBusy(false);
        return;
      }

      // Account exists & is confirmed — sign in so the user is always logged in.
      await supabase.auth.signInWithPassword({ email: cleanEmail, password });

      if (data.chip_url) {
        window.location.href = data.chip_url; // pay via CHIP
        return;
      }
      // CHIP not configured / init failed — go straight to the dashboard on trial.
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal sambung ke server. Cuba lagi.');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-po-surface">
      <header className="border-b border-po-border bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-po-blue">
              <Package className="h-5 w-5 text-white" strokeWidth={2.5} />
            </span>
            <span className="text-lg font-bold tracking-tight text-po-ink">Pening<span className="text-po-blue">Order</span></span>
          </Link>
          <Link to="/#pricing" className="flex items-center gap-1.5 text-sm font-medium text-po-ink-soft hover:text-po-ink">
            <ArrowLeft className="h-4 w-4" />Tukar plan
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 py-10 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-extrabold tracking-tight text-po-ink sm:text-4xl">Daftar akaun</h1>
          <p className="mt-2 text-po-ink-soft">Isi detail di bawah. Akaun anda aktif serta-merta dengan trial 14 hari percuma — bayar untuk plan bila puas hati.</p>

          {status === 'failed' && (
            <div className="mt-4 rounded-lg border border-po-danger/30 bg-po-danger/5 px-4 py-3 text-sm text-po-danger">
              ❌ Pembayaran sebelum ini gagal atau di-cancel. Akaun anda masih aktif — cuba bayar semula dari dashboard.
            </div>
          )}

          <div className="mt-8 grid gap-8 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <div className="rounded-2xl border border-po-border bg-white p-6 shadow-sm">
                <form onSubmit={onSubmit} className="space-y-5">
                  <h2 className="text-lg font-bold text-po-ink">Detail anda</h2>
                  {error && <div className="rounded-lg border border-po-danger/30 bg-po-danger/5 px-3 py-2 text-sm text-po-danger">{error}</div>}

                  <Field id="full_name" label="Nama Penuh" value={fullName} onChange={setFullName} placeholder="cth: Ali bin Abu" autoComplete="name" minLength={2} />
                  <Field id="business_name" label="Nama Bisnes / Brand" value={businessName} onChange={setBusinessName} placeholder="cth: Kedai Ali" minLength={2} />
                  <Field id="email" label="Email" value={email} onChange={setEmail} placeholder="anda@email.com" type="email" autoComplete="email" hint="Guna email ni untuk log masuk." />
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-po-ink">Nombor WhatsApp</label>
                    <input
                      id="phone" type="tel" required inputMode="numeric" pattern="60\d{8,11}" autoComplete="tel"
                      value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                      className="mt-1 block w-full rounded-lg border border-po-border bg-white px-3 py-2 text-sm focus:border-po-blue focus:outline-none focus:ring-2 focus:ring-po-blue/30"
                      placeholder="60123456789"
                    />
                    <p className="mt-1 text-xs text-po-ink-muted">Format: <span className="font-mono">60123456789</span></p>
                  </div>
                  <Field id="password" label="Password" value={password} onChange={setPassword} placeholder="Minimum 6 aksara" type="password" autoComplete="new-password" minLength={6} hint="Guna password ni untuk log masuk ke dashboard." />

                  <button
                    type="submit" disabled={busy}
                    className="flex w-full items-center justify-center rounded-lg bg-po-blue px-4 py-3 text-base font-bold text-white shadow-sm transition-colors hover:bg-po-blue-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Memproses…</>) : cfg ? `Daftar & Bayar RM${cfg.price} →` : 'Daftar →'}
                  </button>
                  <p className="text-center text-xs text-po-ink-muted">
                    Akaun dibuat serta-merta. Anda akan dibawa ke CHIP untuk bayar plan. Batalkan pembayaran pun, akaun trial anda tetap aktif.
                  </p>
                </form>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="sticky top-4 rounded-2xl border border-po-border bg-white p-6 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-po-ink-muted">Ringkasan</h2>
                {loadingCfg ? (
                  <div className="mt-4 text-sm text-po-ink-muted">Loading…</div>
                ) : cfg ? (
                  <>
                    <div className="mt-4 flex items-start justify-between gap-3 border-b border-po-border pb-4">
                      <div>
                        <div className="font-semibold text-po-ink">Plan {cfg.label}</div>
                        <div className="text-xs text-po-ink-muted">{cfg.days} hari · {cfg.max_orders_per_month >= 999999 ? 'order tanpa had' : `${cfg.max_orders_per_month.toLocaleString('en-MY')} order/bulan`}</div>
                      </div>
                      <div className="whitespace-nowrap text-sm font-semibold text-po-ink">RM {cfg.price.toFixed(2)}</div>
                    </div>
                    <div className="mt-4 flex items-baseline justify-between">
                      <span className="text-sm font-semibold uppercase tracking-wide text-po-ink-muted">Jumlah</span>
                      <span className="text-2xl font-extrabold text-po-ink">RM {cfg.price.toFixed(2)}</span>
                    </div>
                    <ul className="mt-5 space-y-2 border-t border-po-border pt-4 text-xs text-po-ink-soft">
                      <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-po-success" />14 hari trial percuma dulu</li>
                      <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-po-success" />Cancel bila-bila, tiada kontrak</li>
                      <li className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-po-success" />Bayaran selamat via CHIP</li>
                    </ul>
                  </>
                ) : (
                  <div className="mt-4 text-sm text-po-ink-muted">Plan tak dijumpai. <Link to="/#pricing" className="text-po-blue underline">Pilih plan</Link> dulu.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  id, label, value, onChange, placeholder, type = 'text', autoComplete, minLength, hint,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; autoComplete?: string; minLength?: number; hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-po-ink">{label}</label>
      <input
        id={id} type={type} required value={value} minLength={minLength} autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-po-border bg-white px-3 py-2 text-sm focus:border-po-blue focus:outline-none focus:ring-2 focus:ring-po-blue/30"
        placeholder={placeholder}
      />
      {hint && <p className="mt-1 text-xs text-po-ink-muted">{hint}</p>}
    </div>
  );
}
