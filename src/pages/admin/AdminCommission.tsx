import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRM, formatDMY, getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, fetchAllRows } from '@/lib/utils';
import { Coins, Package, Users, Download, Calendar } from 'lucide-react';
import { PageHeader, StatCard, IconTile, TableSkeleton, EmptyState } from '@/components/common/SoftUI';
import * as XLSX from 'xlsx';

import UnappliedDateNote from '@/components/UnappliedDateNote';
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
        // Paged: an RPC is capped at 1000 rows like any PostgREST read; the detail
        // list is one row per tracking across every client, so it outgrows that.
        fetchAllRows(() => (supabase as any).rpc('admin_pd_commission', { p_start: startDate, p_end: endDate }).order('owner_user_id'), false).then((data) => ({ data, error: null as any }), (error) => ({ data: null as any, error })),
        fetchAllRows(() => (supabase as any).rpc('admin_pd_commission_detail', { p_start: startDate, p_end: endDate }).order('owner_user_id').order('tracking_number').order('id_sale'), false).then((data) => ({ data, error: null as any }), (error) => ({ data: null as any, error })),
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
    <div className="space-y-6">
      <PageHeader
        title="ParcelDaily Commission"
        description={<>Komisen RM{RATE.toFixed(2)} setiap tracking yang kurier ambil (termasuk return). Ikut tarikh proses.</>}
        icon={Coins}
        tone="brand"
      />

      {/* Date range */}
      <div className="bg-card border border-border/80 rounded-xl shadow-sm p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
          <div className="flex items-center gap-2 sm:self-center"><Calendar className="w-5 h-5 text-muted-foreground" /><span className="text-sm font-medium">Tarikh:</span></div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
            <div className="min-w-0">
              <label className="section-label block mb-1">Dari</label>
              <Input type="date" value={pendingStart} onChange={(e) => setPendingStart(e.target.value)} className="w-full sm:w-40" />
            </div>
            <div className="min-w-0">
              <label className="section-label block mb-1">Hingga</label>
              <Input type="date" value={pendingEnd} onChange={(e) => setPendingEnd(e.target.value)} className="w-full sm:w-40" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={apply}>Apply</Button>
            <UnappliedDateNote pendingStart={pendingStart} pendingEnd={pendingEnd} startDate={startDate} endDate={endDate} />
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          icon={Coins}
          tone="amber"
          label="Total Komisen"
          value={<span className="text-amber-700 dark:text-amber-300">RM {formatRM(totals.commission)}</span>}
          hint={`${totals.tracking} × RM${RATE.toFixed(2)}`}
          className="border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30"
        />
        <StatCard icon={Package} tone="blue" label="Total Tracking" value={totals.tracking} hint="kurier ambil barang (incl. return)" />
        <StatCard icon={Users} tone="green" label="Total Client" value={totals.clientCount} hint="client aktif guna ParcelDaily" />
      </div>

      {loading ? (
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm"><TableSkeleton rows={6} cols={4} /></div>
      ) : (
        <>
          {/* Per-client — click to filter the tracking list */}
          <div className="bg-card border border-border/80 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border font-semibold"><IconTile icon={Users} tone="purple" size="sm" />Komisen ikut Client</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
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
                      className={`border-t border-border cursor-pointer hover:bg-muted/40 ${clientFilter === c.owner_user_id ? 'bg-primary/5' : ''}`}
                    >
                      <td className="p-3 font-medium">{c.client}</td>
                      <td className="p-3 text-right tabular-nums">{c.tracking_count}</td>
                      <td className="p-3 text-right tabular-nums whitespace-nowrap text-amber-600 dark:text-amber-400">RM {formatRM(c.commission)}</td>
                    </tr>
                  ))}
                  {clients.length === 0 && (
                    <tr><td colSpan={3} className="text-muted-foreground"><EmptyState icon={Coins} title="Tiada komisen dalam tempoh ini." /></td></tr>
                  )}
                </tbody>
                {clients.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border bg-muted/30 font-semibold">
                      <td className="p-3">JUMLAH</td>
                      <td className="p-3 text-right tabular-nums">{totals.tracking}</td>
                      <td className="p-3 text-right tabular-nums whitespace-nowrap text-amber-600 dark:text-amber-400">RM {formatRM(totals.commission)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Tracking list */}
          <div className="bg-card border border-border/80 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-semibold flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-3"><IconTile icon={Package} tone="blue" size="sm" /><span>Senarai Tracking {clientFilter !== 'all' && <span className="text-muted-foreground font-normal">— {clients.find((c) => c.owner_user_id === clientFilter)?.client}</span>}</span></span>
              <span className="text-sm text-muted-foreground">{shownDetails.length} tracking</span>
            </div>
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
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
                    <tr key={`${d.tracking_number}-${i}`} className="border-t border-border hover:bg-muted/40">
                      <td className="p-3">{i + 1}</td>
                      <td className="p-3 whitespace-nowrap">{d.client}</td>
                      <td className="p-3 whitespace-nowrap">{d.id_sale || '-'}</td>
                      <td className="p-3 whitespace-nowrap font-mono text-xs">{d.tracking_number || '-'}</td>
                      <td className="p-3 whitespace-nowrap">{d.kurier || '-'}</td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${d.delivery_status === 'Success' ? 'bg-green-100 text-green-700' : d.delivery_status === 'Return' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{d.delivery_status || '-'}</span>
                      </td>
                      <td className="p-3 whitespace-nowrap">{formatDMY(d.remark_date)}</td>
                      <td className="p-3 text-right tabular-nums whitespace-nowrap text-amber-600 dark:text-amber-400">RM {RATE.toFixed(2)}</td>
                    </tr>
                  ))}
                  {shownDetails.length === 0 && (
                    <tr><td colSpan={8} className="text-muted-foreground"><EmptyState icon={Package} title="Tiada tracking." /></td></tr>
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
