import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRM, formatDMY, getMalaysiaStartOfMonth, getMalaysiaEndOfMonth } from '@/lib/utils';
import { Coins, Package, Users, Loader2, Download, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';

// RM earned by the platform per ParcelDaily tracking the courier collected.
const RATE = 0.40;

interface ClientRow { owner_user_id: string; client: string; tracking_count: number; commission: number; }
interface DetailRow { owner_user_id: string; client: string; id_sale: string | null; tracking_number: string | null; kurier: string | null; delivery_status: string | null; remark_date: string | null; }

const AdminCommission: React.FC = () => {
  const { profile } = useAuth();
  const isSuperadmin = profile?.role === 'superadmin';

  const [pendingStart, setPendingStart] = useState(getMalaysiaStartOfMonth());
  const [pendingEnd, setPendingEnd] = useState(getMalaysiaEndOfMonth());
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    try {
      const [sum, det] = await Promise.all([
        (supabase as any).rpc('admin_pd_commission', { p_start: startDate, p_end: endDate }),
        (supabase as any).rpc('admin_pd_commission_detail', { p_start: startDate, p_end: endDate }),
      ]);
      if (sum.error) throw sum.error;
      if (det.error) throw det.error;
      setClients((sum.data || []) as ClientRow[]);
      setDetails((det.data || []) as DetailRow[]);
    } catch (e) {
      console.error('AdminCommission load failed:', e);
      setClients([]); setDetails([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isSuperadmin) load(); /* eslint-disable-next-line */ }, [startDate, endDate, isSuperadmin]);

  const totals = useMemo(() => {
    const tracking = clients.reduce((s, c) => s + Number(c.tracking_count || 0), 0);
    const commission = clients.reduce((s, c) => s + Number(c.commission || 0), 0);
    return { tracking, commission, clientCount: clients.length };
  }, [clients]);

  const shownDetails = useMemo(
    () => (clientFilter === 'all' ? details : details.filter((d) => d.owner_user_id === clientFilter)),
    [details, clientFilter],
  );

  const apply = () => { setStartDate(pendingStart); setEndDate(pendingEnd); };

  const exportRows = () =>
    shownDetails.map((d, i) => ({
      No: i + 1,
      Client: d.client,
      'Id Sales': d.id_sale || '-',
      Tracking: d.tracking_number || '-',
      Kurier: d.kurier || '-',
      Status: d.delivery_status || '-',
      Tarikh: d.remark_date || '-',
      'Komisen (RM)': RATE.toFixed(2),
    }));

  const exportExcel = () => {
    if (shownDetails.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(exportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PD Commission');
    XLSX.writeFile(wb, `PD_Commission_${startDate}_${endDate}.xlsx`);
  };

  const exportCSV = () => {
    if (shownDetails.length === 0) return;
    const rows = exportRows();
    const headers = Object.keys(rows[0]);
    const esc = (v: any) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc((r as any)[h])).join(','))].join('\n');
    // Prepend BOM so Excel opens UTF-8 correctly.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PD_Commission_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isSuperadmin) return <div className="p-6 text-muted-foreground">Not authorized.</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Coins className="w-7 h-7 text-amber-500" /> ParcelDaily Commission</h1>
        <p className="text-muted-foreground mt-1">Komisen RM{RATE.toFixed(2)} setiap tracking yang kurier ambil (termasuk return). Ikut tarikh proses.</p>
      </div>

      {/* Date range */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2"><Calendar className="w-5 h-5 text-muted-foreground" /><span className="text-sm font-medium">Tarikh:</span></div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Dari</label>
            <Input type="date" value={pendingStart} onChange={(e) => setPendingStart(e.target.value)} className="w-40" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Hingga</label>
            <Input type="date" value={pendingEnd} onChange={(e) => setPendingEnd(e.target.value)} className="w-40" />
          </div>
          <Button onClick={apply}>Apply</Button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={exportCSV} disabled={shownDetails.length === 0}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
            <Button variant="outline" onClick={exportExcel} disabled={shownDetails.length === 0}>
              <Download className="w-4 h-4 mr-2" /> Export Excel
            </Button>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-1"><Coins className="w-5 h-5" /><span className="text-xs uppercase font-semibold tracking-wide">Total Komisen</span></div>
          <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">RM {formatRM(totals.commission)}</p>
          <p className="text-xs text-muted-foreground mt-1">{totals.tracking} × RM{RATE.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1"><Package className="w-5 h-5" /><span className="text-xs uppercase font-semibold tracking-wide">Total Tracking</span></div>
          <p className="text-3xl font-bold text-foreground">{totals.tracking}</p>
          <p className="text-xs text-muted-foreground mt-1">kurier ambil barang (incl. return)</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1"><Users className="w-5 h-5" /><span className="text-xs uppercase font-semibold tracking-wide">Total Client</span></div>
          <p className="text-3xl font-bold text-foreground">{totals.clientCount}</p>
          <p className="text-xs text-muted-foreground mt-1">client aktif guna ParcelDaily</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Per-client — click to filter the tracking list */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-semibold">Komisen ikut Client</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-3 text-left">Client</th>
                    <th className="p-3 text-right">Tracking</th>
                    <th className="p-3 text-right">Komisen (RM)</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr
                      key={c.owner_user_id}
                      onClick={() => setClientFilter(clientFilter === c.owner_user_id ? 'all' : c.owner_user_id)}
                      className={`border-t border-border cursor-pointer hover:bg-muted/30 ${clientFilter === c.owner_user_id ? 'bg-primary/5' : ''}`}
                    >
                      <td className="p-3 font-medium">{c.client}</td>
                      <td className="p-3 text-right tabular-nums">{c.tracking_count}</td>
                      <td className="p-3 text-right tabular-nums text-amber-600 dark:text-amber-400">RM {formatRM(c.commission)}</td>
                    </tr>
                  ))}
                  {clients.length === 0 && (
                    <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">Tiada komisen dalam tempoh ini.</td></tr>
                  )}
                </tbody>
                {clients.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border bg-muted/30 font-semibold">
                      <td className="p-3">JUMLAH</td>
                      <td className="p-3 text-right tabular-nums">{totals.tracking}</td>
                      <td className="p-3 text-right tabular-nums text-amber-600 dark:text-amber-400">RM {formatRM(totals.commission)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Tracking list */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-semibold flex items-center justify-between">
              <span>Senarai Tracking {clientFilter !== 'all' && <span className="text-muted-foreground font-normal">— {clients.find((c) => c.owner_user_id === clientFilter)?.client}</span>}</span>
              <span className="text-sm text-muted-foreground">{shownDetails.length} tracking</span>
            </div>
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-3 text-left">No</th>
                    <th className="p-3 text-left">Client</th>
                    <th className="p-3 text-left">Id Sales</th>
                    <th className="p-3 text-left">Tracking</th>
                    <th className="p-3 text-left">Kurier</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Tarikh</th>
                    <th className="p-3 text-right">Komisen</th>
                  </tr>
                </thead>
                <tbody>
                  {shownDetails.map((d, i) => (
                    <tr key={`${d.tracking_number}-${i}`} className="border-t border-border hover:bg-muted/30">
                      <td className="p-3">{i + 1}</td>
                      <td className="p-3 whitespace-nowrap">{d.client}</td>
                      <td className="p-3 whitespace-nowrap">{d.id_sale || '-'}</td>
                      <td className="p-3 whitespace-nowrap font-mono text-xs">{d.tracking_number || '-'}</td>
                      <td className="p-3 whitespace-nowrap">{d.kurier || '-'}</td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${d.delivery_status === 'Success' ? 'bg-green-100 text-green-700' : d.delivery_status === 'Return' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{d.delivery_status || '-'}</span>
                      </td>
                      <td className="p-3 whitespace-nowrap">{formatDMY(d.remark_date)}</td>
                      <td className="p-3 text-right tabular-nums text-amber-600 dark:text-amber-400">RM {RATE.toFixed(2)}</td>
                    </tr>
                  ))}
                  {shownDetails.length === 0 && (
                    <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Tiada tracking.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminCommission;
