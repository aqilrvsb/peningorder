import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { Settings, Plus, Trash2, Loader2, Save, DollarSign, Percent, TrendingUp } from 'lucide-react';

type RevenueBasis = 'nett_sales' | 'collection';
type CommissionMode = 'profit_sharing' | 'percent_direct';
type KpiType = 'roas' | 'range_sales';

interface Tier {
  start: number;
  end: number | null; // null = "Above" (no upper limit)
  value: number;      // commission %
}

interface PnlConfig {
  id: string | null;
  revenue_basis: RevenueBasis;
  commission_mode: CommissionMode;
  deduct_postage: boolean;
  deduct_product: boolean;
  deduct_spend: boolean;
  kpi_type: KpiType;
  tiers: Tier[];
}

const DEFAULT_CONFIG: PnlConfig = {
  id: null,
  revenue_basis: 'nett_sales',
  commission_mode: 'profit_sharing',
  deduct_postage: true,
  deduct_product: true,
  deduct_spend: true,
  kpi_type: 'roas',
  tiers: [{ start: 0, end: null, value: 0 }],
};

const AccountPNLConfig: React.FC = () => {
  const [config, setConfig] = useState<PnlConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await (supabase as any).from('pnl_config').select('*').maybeSingle();
      if (error) throw error;
      if (data) {
        setConfig({
          id: data.id,
          revenue_basis: data.revenue_basis,
          commission_mode: data.commission_mode,
          deduct_postage: !!data.deduct_postage,
          deduct_product: !!data.deduct_product,
          deduct_spend: !!data.deduct_spend,
          kpi_type: data.kpi_type,
          tiers: Array.isArray(data.tiers) && data.tiers.length ? data.tiers : DEFAULT_CONFIG.tiers,
        });
      } else {
        setConfig(DEFAULT_CONFIG);
      }
    } catch (error) {
      console.error('Error loading PNL config:', error);
      toast({ title: 'Error', description: 'Gagal memuatkan konfigurasi PNL.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (patch: Partial<PnlConfig>) => setConfig((c) => ({ ...c, ...patch }));

  const addTier = () => set({ tiers: [...config.tiers, { start: 0, end: null, value: 0 }] });
  const removeTier = (i: number) => set({ tiers: config.tiers.filter((_, idx) => idx !== i) });
  const updateTier = (i: number, field: keyof Tier, raw: string) => {
    const tiers = config.tiers.map((t, idx) => {
      if (idx !== i) return t;
      if (field === 'end') return { ...t, end: raw === '' ? null : Number(raw) };
      return { ...t, [field]: Number(raw) } as Tier;
    });
    set({ tiers });
  };

  const handleSave = async () => {
    // Basic validation: tiers need a value and a sane range.
    for (const t of config.tiers) {
      if (t.end != null && t.end < t.start) {
        toast({ title: 'Ralat', description: 'End tidak boleh kurang daripada Start.', variant: 'destructive' });
        return;
      }
    }
    setIsSaving(true);
    try {
      const payload = {
        revenue_basis: config.revenue_basis,
        commission_mode: config.commission_mode,
        deduct_postage: config.deduct_postage,
        deduct_product: config.deduct_product,
        deduct_spend: config.deduct_spend,
        kpi_type: config.kpi_type,
        tiers: config.tiers,
        updated_at: new Date().toISOString(),
      };
      if (config.id) {
        const { error } = await (supabase as any).from('pnl_config').update(payload).eq('id', config.id);
        if (error) throw error;
      } else {
        // owner_user_id defaults to tenant_owner() at the DB level.
        const { data, error } = await (supabase as any).from('pnl_config').insert(payload).select('id').single();
        if (error) throw error;
        set({ id: data.id });
      }
      toast({ title: 'Berjaya', description: 'Konfigurasi PNL disimpan.' });
    } catch (error: any) {
      console.error('Error saving PNL config:', error);
      toast({ title: 'Error', description: error.message || 'Gagal menyimpan konfigurasi.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isProfitSharing = config.commission_mode === 'profit_sharing';
  const isRoas = config.kpi_type === 'roas';
  const unit = isRoas ? 'x' : 'RM';

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Settings className="w-6 h-6" />
            PNL Configuration
          </h1>
          <p className="text-muted-foreground mt-1">Konfigurasi cara kira komisyen staf</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Simpan
        </Button>
      </div>

      {/* 1. Revenue basis */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
          <DollarSign className="w-4 h-4 text-blue-500" />
          Asas Jualan (Revenue)
        </div>
        <RadioGroup value={config.revenue_basis} onValueChange={(v: RevenueBasis) => set({ revenue_basis: v })} className="grid sm:grid-cols-2 gap-3">
          <label htmlFor="rb-nett" className="flex items-start gap-3 border border-border rounded-lg p-3 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <RadioGroupItem value="nett_sales" id="rb-nett" className="mt-0.5" />
            <div>
              <div className="font-medium">Nett Sales</div>
              <div className="text-xs text-muted-foreground">Total Sales − Return</div>
            </div>
          </label>
          <label htmlFor="rb-coll" className="flex items-start gap-3 border border-border rounded-lg p-3 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <RadioGroupItem value="collection" id="rb-coll" className="mt-0.5" />
            <div>
              <div className="font-medium">Collection</div>
              <div className="text-xs text-muted-foreground">Duit yang benar-benar dikutip (COD selepas remit)</div>
            </div>
          </label>
        </RadioGroup>
      </div>

      {/* 2. Commission mode */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
          <Percent className="w-4 h-4 text-primary" />
          Jenis Komisyen
        </div>
        <RadioGroup value={config.commission_mode} onValueChange={(v: CommissionMode) => set({ commission_mode: v })} className="grid sm:grid-cols-2 gap-3">
          <label htmlFor="cm-profit" className="flex items-start gap-3 border border-border rounded-lg p-3 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <RadioGroupItem value="profit_sharing" id="cm-profit" className="mt-0.5" />
            <div>
              <div className="font-medium">Profit Sharing (Gross)</div>
              <div className="text-xs text-muted-foreground">% daripada gross profit (asas jualan tolak kos dipilih)</div>
            </div>
          </label>
          <label htmlFor="cm-direct" className="flex items-start gap-3 border border-border rounded-lg p-3 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <RadioGroupItem value="percent_direct" id="cm-direct" className="mt-0.5" />
            <div>
              <div className="font-medium">By Percent Direct</div>
              <div className="text-xs text-muted-foreground">% terus daripada asas jualan (tiada tolak kos)</div>
            </div>
          </label>
        </RadioGroup>

        {isProfitSharing && (
          <div className="mt-2 pt-3 border-t border-border space-y-3">
            <div className="text-sm font-medium text-muted-foreground">Tolak kos berikut untuk kira Gross:</div>
            <div className="grid sm:grid-cols-3 gap-3">
              <label htmlFor="d-postage" className="flex items-center gap-2 border border-border rounded-lg p-3 cursor-pointer hover:bg-muted/40">
                <Checkbox id="d-postage" checked={config.deduct_postage} onCheckedChange={(v) => set({ deduct_postage: !!v })} />
                <div>
                  <div className="text-sm font-medium">Kos Postage</div>
                  <div className="text-[11px] text-muted-foreground">termasuk postage order return</div>
                </div>
              </label>
              <label htmlFor="d-product" className="flex items-center gap-2 border border-border rounded-lg p-3 cursor-pointer hover:bg-muted/40">
                <Checkbox id="d-product" checked={config.deduct_product} onCheckedChange={(v) => set({ deduct_product: !!v })} />
                <div className="text-sm font-medium">Kos Product</div>
              </label>
              <label htmlFor="d-spend" className="flex items-center gap-2 border border-border rounded-lg p-3 cursor-pointer hover:bg-muted/40">
                <Checkbox id="d-spend" checked={config.deduct_spend} onCheckedChange={(v) => set({ deduct_spend: !!v })} />
                <div className="text-sm font-medium">Kos Spend</div>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* 3. KPI */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
          <TrendingUp className="w-4 h-4 text-amber-500" />
          KPI
        </div>
        <RadioGroup value={config.kpi_type} onValueChange={(v: KpiType) => set({ kpi_type: v })} className="grid sm:grid-cols-2 gap-3">
          <label htmlFor="kpi-roas" className="flex items-start gap-3 border border-border rounded-lg p-3 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <RadioGroupItem value="roas" id="kpi-roas" className="mt-0.5" />
            <div>
              <div className="font-medium">By ROAS</div>
              <div className="text-xs text-muted-foreground">Tier ikut ROAS (Total Sales / Spend)</div>
            </div>
          </label>
          <label htmlFor="kpi-range" className="flex items-start gap-3 border border-border rounded-lg p-3 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <RadioGroupItem value="range_sales" id="kpi-range" className="mt-0.5" />
            <div>
              <div className="font-medium">By Range Sales</div>
              <div className="text-xs text-muted-foreground">Tier ikut julat jualan (asas jualan di atas)</div>
            </div>
          </label>
        </RadioGroup>
      </div>

      {/* 4. Tiers */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">4</span>
            Tiers ({isRoas ? 'ROAS' : 'Range Sales'})
          </div>
          <Button size="sm" variant="outline" onClick={addTier} className="gap-1">
            <Plus className="w-3 h-3" /> Tambah Tier
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-left w-12">No</th>
                <th className="p-2 text-left">Start {isRoas ? '(ROAS)' : '(RM)'}</th>
                <th className="p-2 text-left">End {isRoas ? '(ROAS)' : '(RM)'}</th>
                <th className="p-2 text-left">Value (%)</th>
                <th className="p-2 text-center w-16">Action</th>
              </tr>
            </thead>
            <tbody>
              {config.tiers.map((t, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-2">{i + 1}</td>
                  <td className="p-2">
                    <Input type="number" step="0.01" value={String(t.start)} onChange={(e) => updateTier(i, 'start', e.target.value)} className="h-9 w-28" placeholder="0" />
                  </td>
                  <td className="p-2">
                    <Input type="number" step="0.01" value={t.end == null ? '' : String(t.end)} onChange={(e) => updateTier(i, 'end', e.target.value)} className="h-9 w-28" placeholder="Kosong = Above" />
                  </td>
                  <td className="p-2">
                    <Input type="number" step="0.1" value={String(t.value)} onChange={(e) => updateTier(i, 'value', e.target.value)} className="h-9 w-24" placeholder="0" />
                  </td>
                  <td className="p-2 text-center">
                    <Button size="sm" variant="ghost" onClick={() => removeTier(i)} className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {config.tiers.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Tiada tier. Klik "Tambah Tier".</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          {unit === 'x'
            ? 'Contoh: Start 2.5, End 2.7, Value 4 → jika ROAS staf antara 2.5x–2.7x, komisyen = 4% daripada asas.'
            : 'Contoh: Start 0, End 9999, Value 3 → jika jualan staf RM0–9,999, komisyen = 3% daripada asas.'}
          {' '}Kosongkan End untuk tier terakhir (tiada had atas).
        </p>
      </div>

      {/* How it works — reflects the current config */}
      <div className="bg-card border border-border rounded-lg p-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Cara kira: </span>
        Asas = <b>{config.revenue_basis === 'nett_sales' ? 'Nett Sales (Sales − Return)' : 'Collection'}</b>.{' '}
        {isProfitSharing
          ? <>Gross = Asas − {[config.deduct_postage && 'Postage', config.deduct_product && 'Product', config.deduct_spend && 'Spend'].filter(Boolean).join(' − ') || '(tiada kos dipilih)'}. Komisyen = Value% × Gross.</>
          : <>Komisyen = Value% × Asas (terus, tiada tolak kos).</>}
        {' '}Tier dipilih ikut <b>{isRoas ? 'ROAS (Sales / Spend)' : 'julat jualan'}</b>.
      </div>
    </div>
  );
};

export default AccountPNLConfig;
