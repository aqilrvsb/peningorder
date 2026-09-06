import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Inbox, Loader2, Wand2, Trash2, RefreshCw } from 'lucide-react';

type Unmatched = {
  id: string;
  source_platform: string | null;
  raw_product: string | null;
  quantity: number | null;
  amount: number | null;
  type_payment: string | null;
  name_customer: string | null;
  phone_customer: string | null;
  state_customer: string | null;
  created_at: string;
};
type Bundle = { id: string; name: string; sku: string | null };

const COURIERS = ['Poslaju', 'Ninjavan', 'JNT', 'DHL', 'SPX'];

// Orders from an integration channel that couldn't be auto-matched to a bundle.
// Map one -> it becomes a real order AND teaches the system, so the same product
// auto-tallies next time. Marketers should keep this list empty.
const IntegrationUnmatched: React.FC = () => {
  const [rows, setRows] = useState<Unmatched[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapping, setMapping] = useState<Unmatched | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ bundleId: '', kurier: 'Poslaju', typePayment: 'CASH', totalSale: '' });

  const load = async () => {
    setLoading(true);
    try {
      const [u, b] = await Promise.all([
        supabase.from('integration_unmatched').select('*').order('created_at', { ascending: false }),
        supabase.from('logistic_bundles').select('id, name, sku').eq('is_active', true).order('name'),
      ]);
      setRows((u.data as any) || []);
      setBundles((b.data as any) || []);
    } catch (e) {
      console.error('load unmatched failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openMap = (r: Unmatched) => {
    setForm({
      bundleId: '',
      kurier: 'Poslaju',
      typePayment: r.type_payment === 'COD' ? 'COD' : 'CASH',
      totalSale: String(r.amount ?? ''),
    });
    setMapping(r);
  };

  const saveMap = async () => {
    if (!mapping) return;
    if (!form.bundleId) { toast({ title: 'Pilih bundle', description: 'Sila pilih produk bundle.', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('integration-map', {
        body: {
          unmatchedId: mapping.id,
          bundleId: form.bundleId,
          kurier: form.kurier,
          typePayment: form.typePayment,
          totalSale: Number(form.totalSale) || 0,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: 'Order dicipta', description: 'Order telah tally & mapping disimpan. Order sama akan auto-tally selepas ini.' });
      setMapping(null);
      setRows((prev) => prev.filter((x) => x.id !== mapping.id));
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message || 'Cuba lagi.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const discard = async (r: Unmatched) => {
    if (!window.confirm('Padam order ini dari senarai belum match? (Tidak akan dicipta sebagai order)')) return;
    const { error } = await supabase.from('integration_unmatched').delete().eq('id', r.id);
    if (error) { toast({ title: 'Gagal padam', description: error.message, variant: 'destructive' }); return; }
    setRows((prev) => prev.filter((x) => x.id !== r.id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Belum Match</p>
          {rows.length > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[11px] font-semibold h-5 min-w-5 px-1.5">{rows.length}</span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <Inbox className="w-8 h-8 mb-2 opacity-60" />
            <p className="text-sm">Tiada order belum match. Semua order platform tally automatik. 🎉</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-left">Tarikh</th>
                  <th className="p-3 text-left">Sumber</th>
                  <th className="p-3 text-left">Pelanggan</th>
                  <th className="p-3 text-left">Produk (raw)</th>
                  <th className="p-3 text-center">Qty</th>
                  <th className="p-3 text-right">Amaun</th>
                  <th className="p-3 text-left">Bayaran</th>
                  <th className="p-3 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">{(r.created_at || '').slice(0, 10)}</td>
                    <td className="p-3 whitespace-nowrap capitalize">{r.source_platform || '-'}</td>
                    <td className="p-3">
                      <div className="font-medium">{r.name_customer || '-'}</div>
                      <div className="text-xs text-muted-foreground">{r.phone_customer} · {r.state_customer}</div>
                    </td>
                    <td className="p-3"><span className="block max-w-[240px] truncate" title={r.raw_product || ''}>{r.raw_product || '-'}</span></td>
                    <td className="p-3 text-center">{r.quantity ?? 1}</td>
                    <td className="p-3 text-right tabular-nums">RM {(Number(r.amount) || 0).toFixed(2)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.type_payment === 'COD' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                        {r.type_payment === 'COD' ? 'COD' : 'CASH'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" className="h-7 px-2 text-xs" onClick={() => openMap(r)}>
                          <Wand2 className="w-3.5 h-3.5 mr-1" /> Map
                        </Button>
                        <button onClick={() => discard(r)} title="Padam" className="p-1.5 rounded-md text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Map dialog */}
      <Dialog open={!!mapping} onOpenChange={(o) => { if (!o) setMapping(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Map ke Bundle</DialogTitle>
          </DialogHeader>
          {mapping && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <div className="font-medium">{mapping.name_customer}</div>
                <div className="text-xs text-muted-foreground">{mapping.raw_product}</div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Produk Bundle *</label>
                <Select value={form.bundleId} onValueChange={(v) => setForm((f) => ({ ...f, bundleId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih bundle" /></SelectTrigger>
                  <SelectContent>
                    {bundles.map((b) => <SelectItem key={b.id} value={b.id}>{b.sku ? `${b.sku} — ` : ''}{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Kos (produk/HQ) auto dari bundle. Postage dijana masa proses.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Kurier</label>
                  <Select value={form.kurier} onValueChange={(v) => setForm((f) => ({ ...f, kurier: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{COURIERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Cara Bayaran</label>
                  <Select value={form.typePayment} onValueChange={(v) => setForm((f) => ({ ...f, typePayment: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">CASH</SelectItem>
                      <SelectItem value="COD">COD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Harga Jual (RM)</label>
                <Input type="number" step="0.01" value={form.totalSale} onChange={(e) => setForm((f) => ({ ...f, totalSale: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMapping(null)}>Batal</Button>
            <Button onClick={saveMap} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Cipta Order & Simpan Mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default IntegrationUnmatched;
