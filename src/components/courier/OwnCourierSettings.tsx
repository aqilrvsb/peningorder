import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { IconTile, type Tone } from '@/components/common/SoftUI';
import { Check, Copy, Loader2, PlugZap, Save, Truck, Webhook } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OWN_COURIERS, type OwnCourier } from '@/hooks/useCourierProvider';

// Couriers whose booking is live (keep in sync with OWN_COURIER_READY in
// supabase/functions/_shared/own-couriers.ts). Others can be filled in but not switched on yet.
const READY: Record<OwnCourier, boolean> = { ninjavan: true, poslaju: false, jnt: false };

type Field = { key: keyof Row; label: string; secret?: boolean; placeholder?: string };
const META: Record<OwnCourier, {
  name: string; tone: Tone; fields: Field[]; sandboxLabel: string; soon?: string; webhookHelp: string; credHelp: string;
}> = {
  ninjavan: {
    name: 'Ninja Van', tone: 'red',
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'Dari Ninja Van (akses API)' },
      { key: 'client_secret', label: 'Client Secret', secret: true },
    ],
    sandboxLabel: 'Sandbox (test)',
    credHelp: 'Client ID & Secret diberi oleh Ninja Van bila akses API diaktifkan (bukan password dashboard). Akaun production perlu lulus semakan integrasi Ninja Van.',
    webhookHelp: 'Daftar URL ini di Ninja Van (Webhook) untuk semua status — status order akan masuk automatik.',
  },
  poslaju: {
    name: 'Pos Laju', tone: 'blue',
    fields: [
      { key: 'client_id', label: 'Client ID' },
      { key: 'client_secret', label: 'Client Secret', secret: true },
      { key: 'account_number', label: 'Account Number' },
      { key: 'subscription_code', label: 'Subscription Code' },
    ],
    sandboxLabel: 'Staging (test)',
    soon: 'Akan datang — sambungan Pos Laju sedang disiapkan. Boleh isi maklumat dahulu.',
    credHelp: 'Production: dapatkan di SendParcel Pro → Store Integration. Staging: dari pasukan integrasi Pos.',
    webhookHelp: 'Daftar URL ini di SendParcel Pro (tracking subscription) — status order akan masuk automatik.',
  },
  jnt: {
    name: 'J&T Express', tone: 'orange',
    fields: [
      { key: 'api_account', label: 'API Account' },
      { key: 'private_key', label: 'Private Key', secret: true },
      { key: 'customer_code', label: 'Customer Code', placeholder: 'cth: JTMY030079' },
      { key: 'password', label: 'Password', secret: true },
    ],
    sandboxLabel: 'Sandbox (test)',
    soon: 'Akan datang — menunggu akses J&T Open Platform. Boleh isi maklumat dahulu.',
    credHelp: 'Minta dari IT J&T: API Account, Private Key, Customer Code & Password untuk J&T Open Platform Malaysia.',
    webhookHelp: 'Daftar URL ini di J&T Open Platform (callback status).',
  },
};

interface Row {
  id?: string;
  courier: OwnCourier;
  enabled: boolean;
  environment: 'sandbox' | 'production';
  client_id: string;
  client_secret: string;
  account_number: string;
  subscription_code: string;
  api_account: string;
  private_key: string;
  customer_code: string;
  password: string;
  webhook_token?: string;
  last_test_at?: string | null;
  last_test_ok?: boolean | null;
  last_test_message?: string | null;
}
const emptyRow = (courier: OwnCourier): Row => ({
  courier, enabled: false, environment: 'production',
  client_id: '', client_secret: '', account_number: '', subscription_code: '',
  api_account: '', private_key: '', customer_code: '', password: '',
});
const SECRET_FIELDS: (keyof Row)[] = ['client_id', 'client_secret', 'account_number', 'subscription_code', 'api_account', 'private_key', 'customer_code', 'password'];

const webhookUrl = (courier: OwnCourier, token?: string) =>
  token ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/courier-webhook?c=${courier}&t=${token}` : '';

/** BYOC Courier Settings: the tenant's own Ninja Van / Pos Laju / J&T accounts (ParcelDaily is not used). */
export default function OwnCourierSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Record<OwnCourier, Row>>(() =>
    Object.fromEntries(OWN_COURIERS.map((c) => [c, emptyRow(c)])) as Record<OwnCourier, Row>);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<OwnCourier | null>(null);
  const [testing, setTesting] = useState<OwnCourier | null>(null);
  const [copied, setCopied] = useState<OwnCourier | null>(null);

  const load = async () => {
    const { data, error } = await (supabase as any).from('own_courier_config').select('*');
    if (error) toast({ title: 'Gagal muat kurier', description: error.message, variant: 'destructive' });
    setRows((prev) => {
      const next = { ...prev };
      for (const r of (data || []) as Row[]) {
        const clean = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, SECRET_FIELDS.includes(k as keyof Row) ? (v ?? '') : v]));
        next[r.courier] = { ...emptyRow(r.courier), ...(clean as unknown as Row) };
      }
      return next;
    });
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const setField = (c: OwnCourier, key: keyof Row, value: unknown) =>
    setRows((prev) => ({ ...prev, [c]: { ...prev[c], [key]: value } }));

  const refreshGates = () => {
    queryClient.invalidateQueries({ queryKey: ['courier-provider'] });
    queryClient.invalidateQueries({ queryKey: ['courier-configured'] });
  };

  const save = async (c: OwnCourier) => {
    const r = rows[c];
    const missing = META[c].fields.filter((f) => !String(r[f.key] || '').trim()).map((f) => f.label);
    if (r.enabled && missing.length) {
      toast({ title: 'Maklumat belum lengkap', description: `Sila isi: ${missing.join(', ')}`, variant: 'destructive' });
      return;
    }
    if (!user?.id) return;
    setSaving(c);
    try {
      const payload: Record<string, unknown> = {
        owner_user_id: user.id,
        courier: c,
        enabled: READY[c] ? r.enabled : false,
        environment: r.environment,
        updated_at: new Date().toISOString(),
      };
      for (const f of META[c].fields) payload[f.key] = String(r[f.key] || '').trim() || null;
      const { error } = await (supabase as any).from('own_courier_config').upsert(payload, { onConflict: 'owner_user_id,courier' });
      if (error) throw error;
      toast({ title: 'Disimpan', description: `${META[c].name} dikemaskini.` });
      await load();
      refreshGates();
    } catch (err: any) {
      toast({ title: 'Gagal simpan', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const test = async (c: OwnCourier) => {
    setTesting(c);
    try {
      const { data, error } = await supabase.functions.invoke('own-courier-test', { body: { courier: c } });
      if (error) throw error;
      toast({
        title: data?.ok ? 'Sambungan berjaya' : 'Sambungan gagal',
        description: data?.message || '',
        variant: data?.ok ? undefined : 'destructive',
      });
      await load();
    } catch (err: any) {
      toast({ title: 'Test gagal', description: err.message, variant: 'destructive' });
    } finally {
      setTesting(null);
    }
  };

  const copy = async (c: OwnCourier, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(c); setTimeout(() => setCopied(null), 2000); } catch { /* ignore */ }
  };

  if (loading) {
    return <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat kurier…</div>;
  }

  return (
    <div className="space-y-4">
      {OWN_COURIERS.map((c) => {
        const m = META[c];
        const r = rows[c];
        const saved = !!r.id;
        const hook = webhookUrl(c, r.webhook_token);
        return (
          <div key={c} className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <IconTile icon={Truck} tone={m.tone} size="sm" />
                <div className="min-w-0">
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {!READY[c] ? 'Akan datang'
                      : r.last_test_ok ? '✓ Sambungan berjaya'
                      : r.last_test_ok === false ? 'Sambungan gagal — semak maklumat'
                      : saved ? 'Belum test' : 'Belum disetup'}
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Aktif</span>
                <Switch checked={READY[c] && r.enabled} disabled={!READY[c]} onCheckedChange={(v) => setField(c, 'enabled', v)} />
              </label>
            </div>

            {m.soon && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{m.soon}</p>}
            <p className="mt-3 text-xs text-muted-foreground">{m.credHelp}</p>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {m.fields.map((f) => (
                <div key={f.key}>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</label>
                  <Input
                    type={f.secret ? 'password' : 'text'}
                    autoComplete="off"
                    value={String(r[f.key] || '')}
                    placeholder={f.placeholder}
                    onChange={(e) => setField(c, f.key, e.target.value)}
                  />
                </div>
              ))}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Environment</label>
                <Select value={r.environment} onValueChange={(v) => setField(c, 'environment', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production (live)</SelectItem>
                    <SelectItem value="sandbox">{m.sandboxLabel}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {r.last_test_message && (
              <p className={`mt-3 text-xs ${r.last_test_ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>{r.last_test_message}</p>
            )}

            {saved && hook && (
              <div className="mt-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Webhook className="h-3.5 w-3.5" /> Webhook URL</p>
                <p className="mt-1 text-xs text-muted-foreground">{m.webhookHelp}</p>
                <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-border bg-background p-2">
                  <code className="min-w-0 flex-1 break-all text-xs">{hook}</code>
                  <Button type="button" size="sm" variant="outline" className="h-8 flex-shrink-0" onClick={() => copy(c, hook)}>
                    {copied === c ? <><Check className="mr-1 h-3.5 w-3.5 text-green-600" /> Disalin</> : <><Copy className="mr-1 h-3.5 w-3.5" /> Salin</>}
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={!saved || testing === c} onClick={() => test(c)}>
                {testing === c ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />} Test Connection
              </Button>
              <Button type="button" disabled={saving === c} onClick={() => save(c)}>
                {saving === c ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Simpan {m.name}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
