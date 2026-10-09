import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRM, getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, fetchAllRows } from '@/lib/utils';
import {
  LayoutDashboard, Users, ShoppingBag, DollarSign, PackageCheck, RotateCcw,
  Wallet, Clock, Download, Calendar, BarChart3,
} from 'lucide-react';
import { PageHeader, StatCard, IconTile, TableSkeleton, EmptyState } from '@/components/common/SoftUI';
import * as XLSX from 'xlsx';

import UnappliedDateNote from '@/components/UnappliedDateNote';
interface Row {
  owner_user_id: string; client: string;
  orders: number; sales: number;
  delivered: number; returned: number; pending: number; shipped: number;
  collection_orders: number; collection_sales: number;
  remaining_orders: number; remaining_sales: number;
  cod_count: number; cash_count: number;
}

const AdminDashboard: React.FC = () => {
  const { profile } = useAuth();
  const isSuperadmin = profile?.role === 'superadmin';

  const [pendingStart, setPendingStart] = useState(getMalaysiaStartOfMonth());
  const [pendingEnd, setPendingEnd] = useState(getMalaysiaEndOfMonth());
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await fetchAllRows(() => (supabase as any).rpc('admin_dashboard_summary', { p_start: startDate, p_end: endDate }).order('owner_user_id'), false).then((data) => ({ data, error: null as any }), (error) => ({ data: null as any, error }));
      if (error) throw error;
      setRows(((data || []) as any[]).map((r) => ({
        ...r,
        orders: Number(r.orders), sales: Number(r.sales),
        delivered: Number(r.delivered), returned: Number(r.returned), pending: Number(r.pending), shipped: Number(r.shipped),
        collection_orders: Number(r.collection_orders), collection_sales: Number(r.collection_sales),
        remaining_orders: Number(r.remaining_orders), remaining_sales: Number(r.remaining_sales),
        cod_count: Number(r.cod_count), cash_count: Number(r.cash_count),
      })));
    } catch (e) {
      console.error('AdminDashboard load failed:', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isSuperadmin) load(); /* eslint-disable-next-line */ }, [startDate, endDate, isSuperadmin]);

  const t = useMemo(() => {
    const sum = (k: keyof Row) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
    return {
      clients: rows.length,
      orders: sum('orders'), sales: sum('sales'),
      delivered: sum('delivered'), returned: sum('returned'), pending: sum('pending'), shipped: sum('shipped'),
      collection: sum('collection_sales'), remaining: sum('remaining_sales'),
      cod: sum('cod_count'), cash: sum('cash_count'),
    };
  }, [rows]);

  const apply = () => { setStartDate(pendingStart); setEndDate(pendingEnd); };

  const exportRows = () => rows.map((r, i) => ({
    No: i + 1, Client: r.client, Orders: r.orders, 'Sales (RM)': r.sales.toFixed(2),
    Delivered: r.delivered, Return: r.returned, Pending: r.pending, Shipped: r.shipped,
    'Collection (RM)': r.collection_sales.toFixed(2), 'Remaining (RM)': r.remaining_sales.toFixed(2),
    COD: r.cod_count, Cash: r.cash_count,
  }));

  const exportExcel = () => {
    if (rows.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(exportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Client Summary');
    XLSX.writeFile(wb, `Admin_Client_Summary_${startDate}_${endDate}.xlsx`);
  };

  const exportCSV = () => {
    if (rows.length === 0) return;
    const data = exportRows();
    const headers = Object.keys(data[0]);
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [headers.join(','), ...data.map((r) => headers.map((h) => esc((r as any)[h])).join(','))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Admin_Client_Summary_${startDate}_${endDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (!isSuperadmin) return <div className="p-6 text-muted-foreground">Not authorized.</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard (All Clients)"
        description={<>Ringkasan semua client — jumlah keseluruhan &amp; setiap client. Ikut tarikh order.</>}
        icon={LayoutDashboard}
        tone="brand"
      />

      {/* Date range */}
      <div className="bg-card border border-border/80 rounded-xl shadow-sm p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
          <div className="flex items-center gap-2 sm:self-center"><Calendar className="w-5 h-5 text-muted-foreground" /><span className="text-sm font-medium">Tarikh:</span></div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
            <div className="min-w-0"><label className="section-label block mb-1">Dari</label><Input type="date" value={pendingStart} onChange={(e) => setPendingStart(e.target.value)} className="w-full sm:w-40" /></div>
            <div className="min-w-0"><label className="section-label block mb-1">Hingga</label><Input type="date" value={pendingEnd} onChange={(e) => setPendingEnd(e.target.value)} className="w-full sm:w-40" /></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={apply}>Apply</Button>
            <UnappliedDateNote pendingStart={pendingStart} pendingEnd={pendingEnd} startDate={startDate} endDate={endDate} />
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button variant="outline" onClick={exportCSV} disabled={rows.length === 0}><Download className="w-4 h-4 mr-2" /> CSV</Button>
            <Button variant="outline" onClick={exportExcel} disabled={rows.length === 0}><Download className="w-4 h-4 mr-2" /> Excel</Button>
          </div>
        </div>
      </div>

      {/* Platform totals */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Users} tone="indigo" label="Clients" value={t.clients} />
        <StatCard icon={ShoppingBag} tone="blue" label="Total Orders" value={t.orders} />
        <StatCard icon={DollarSign} tone="amber" label="Total Sales" value={`RM ${formatRM(t.sales)}`} />
        <StatCard icon={PackageCheck} tone="green" label="Delivered" value={t.delivered} />
        <StatCard icon={RotateCcw} tone="red" label="Return" value={t.returned} />
        <StatCard icon={Wallet} tone="green" label="Collection" value={`RM ${formatRM(t.collection)}`} hint={`${t.cod} COD · ${t.cash} Cash`} />
        <StatCard icon={Clock} tone="purple" label="Remaining Coll" value={`RM ${formatRM(t.remaining)}`} />
        <StatCard icon={Clock} tone="orange" label="Pending / Shipped" value={`${t.pending} / ${t.shipped}`} />
      </div>

      {/* Per-client table */}
      <div className="bg-card border border-border/80 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border font-semibold"><IconTile icon={BarChart3} tone="blue" size="sm" />Ringkasan Setiap Client</div>
        {loading ? (
          <TableSkeleton rows={6} cols={8} className="p-4" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-3 text-left">Client</th>
                  <th className="p-3 text-right">Orders</th>
                  <th className="p-3 text-right">Sales (RM)</th>
                  <th className="p-3 text-right text-green-600">Delivered</th>
                  <th className="p-3 text-right text-red-600">Return</th>
                  <th className="p-3 text-right">Pending</th>
                  <th className="p-3 text-right">Shipped</th>
                  <th className="p-3 text-right text-emerald-600">Collection</th>
                  <th className="p-3 text-right text-purple-600">Remaining</th>
                  <th className="p-3 text-right">COD</th>
                  <th className="p-3 text-right">Cash</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.owner_user_id} className="border-t border-border hover:bg-muted/40">
                    <td className="p-3 font-medium whitespace-nowrap">{r.client}</td>
                    <td className="p-3 text-right tabular-nums">{r.orders}</td>
                    <td className="p-3 text-right tabular-nums whitespace-nowrap">RM {formatRM(r.sales)}</td>
                    <td className="p-3 text-right tabular-nums text-green-600">{r.delivered}</td>
                    <td className="p-3 text-right tabular-nums text-red-600">{r.returned}</td>
                    <td className="p-3 text-right tabular-nums">{r.pending}</td>
                    <td className="p-3 text-right tabular-nums">{r.shipped}</td>
                    <td className="p-3 text-right tabular-nums whitespace-nowrap text-emerald-600">RM {formatRM(r.collection_sales)}</td>
                    <td className="p-3 text-right tabular-nums whitespace-nowrap text-purple-600">RM {formatRM(r.remaining_sales)}</td>
                    <td className="p-3 text-right tabular-nums">{r.cod_count}</td>
                    <td className="p-3 text-right tabular-nums">{r.cash_count}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={11} className="text-muted-foreground"><EmptyState icon={BarChart3} title="Tiada data dalam tempoh ini." /></td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-border bg-muted/30 font-semibold">
                    <td className="p-3 whitespace-nowrap">JUMLAH ({t.clients} client)</td>
                    <td className="p-3 text-right tabular-nums">{t.orders}</td>
                    <td className="p-3 text-right tabular-nums whitespace-nowrap">RM {formatRM(t.sales)}</td>
                    <td className="p-3 text-right tabular-nums text-green-600">{t.delivered}</td>
                    <td className="p-3 text-right tabular-nums text-red-600">{t.returned}</td>
                    <td className="p-3 text-right tabular-nums">{t.pending}</td>
                    <td className="p-3 text-right tabular-nums">{t.shipped}</td>
                    <td className="p-3 text-right tabular-nums whitespace-nowrap text-emerald-600">RM {formatRM(t.collection)}</td>
                    <td className="p-3 text-right tabular-nums whitespace-nowrap text-purple-600">RM {formatRM(t.remaining)}</td>
                    <td className="p-3 text-right tabular-nums">{t.cod}</td>
                    <td className="p-3 text-right tabular-nums">{t.cash}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
