import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRM, getMalaysiaStartOfMonth, getMalaysiaEndOfMonth } from '@/lib/utils';
import {
  LayoutDashboard, Users, ShoppingBag, DollarSign, PackageCheck, RotateCcw,
  Wallet, Clock, Loader2, Download, Calendar,
} from 'lucide-react';
import * as XLSX from 'xlsx';

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
      const { data, error } = await (supabase as any).rpc('admin_dashboard_summary', { p_start: startDate, p_end: endDate });
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

  const Box = ({ icon, label, value, sub, color }: any) => (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`flex items-center gap-2 mb-1 ${color}`}>{icon}<span className="text-xs uppercase font-semibold tracking-wide">{label}</span></div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><LayoutDashboard className="w-7 h-7 text-primary" /> Dashboard (All Clients)</h1>
        <p className="text-muted-foreground mt-1">Ringkasan semua client — jumlah keseluruhan &amp; setiap client. Ikut tarikh order.</p>
      </div>

      {/* Date range */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2"><Calendar className="w-5 h-5 text-muted-foreground" /><span className="text-sm font-medium">Tarikh:</span></div>
          <div><label className="block text-xs text-muted-foreground mb-1">Dari</label><Input type="date" value={pendingStart} onChange={(e) => setPendingStart(e.target.value)} className="w-40" /></div>
          <div><label className="block text-xs text-muted-foreground mb-1">Hingga</label><Input type="date" value={pendingEnd} onChange={(e) => setPendingEnd(e.target.value)} className="w-40" /></div>
          <Button onClick={apply}>Apply</Button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={exportCSV} disabled={rows.length === 0}><Download className="w-4 h-4 mr-2" /> CSV</Button>
            <Button variant="outline" onClick={exportExcel} disabled={rows.length === 0}><Download className="w-4 h-4 mr-2" /> Excel</Button>
          </div>
        </div>
      </div>

      {/* Platform totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <Box icon={<Users className="w-4 h-4" />} label="Clients" value={t.clients} color="text-primary" />
        <Box icon={<ShoppingBag className="w-4 h-4" />} label="Total Orders" value={t.orders} color="text-blue-600" />
        <Box icon={<DollarSign className="w-4 h-4" />} label="Total Sales" value={`RM ${formatRM(t.sales)}`} color="text-amber-600" />
        <Box icon={<PackageCheck className="w-4 h-4" />} label="Delivered" value={t.delivered} color="text-green-600" />
        <Box icon={<RotateCcw className="w-4 h-4" />} label="Return" value={t.returned} color="text-red-600" />
        <Box icon={<Wallet className="w-4 h-4" />} label="Collection" value={`RM ${formatRM(t.collection)}`} sub={`${t.cod} COD · ${t.cash} Cash`} color="text-emerald-600" />
        <Box icon={<Clock className="w-4 h-4" />} label="Remaining Coll" value={`RM ${formatRM(t.remaining)}`} color="text-purple-600" />
        <Box icon={<Clock className="w-4 h-4" />} label="Pending / Shipped" value={`${t.pending} / ${t.shipped}`} color="text-orange-600" />
      </div>

      {/* Per-client table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border font-semibold">Ringkasan Setiap Client</div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
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
                  <tr key={r.owner_user_id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3 font-medium whitespace-nowrap">{r.client}</td>
                    <td className="p-3 text-right tabular-nums">{r.orders}</td>
                    <td className="p-3 text-right tabular-nums">RM {formatRM(r.sales)}</td>
                    <td className="p-3 text-right tabular-nums text-green-600">{r.delivered}</td>
                    <td className="p-3 text-right tabular-nums text-red-600">{r.returned}</td>
                    <td className="p-3 text-right tabular-nums">{r.pending}</td>
                    <td className="p-3 text-right tabular-nums">{r.shipped}</td>
                    <td className="p-3 text-right tabular-nums text-emerald-600">RM {formatRM(r.collection_sales)}</td>
                    <td className="p-3 text-right tabular-nums text-purple-600">RM {formatRM(r.remaining_sales)}</td>
                    <td className="p-3 text-right tabular-nums">{r.cod_count}</td>
                    <td className="p-3 text-right tabular-nums">{r.cash_count}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Tiada data dalam tempoh ini.</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-border bg-muted/30 font-semibold">
                    <td className="p-3">JUMLAH ({t.clients} client)</td>
                    <td className="p-3 text-right tabular-nums">{t.orders}</td>
                    <td className="p-3 text-right tabular-nums">RM {formatRM(t.sales)}</td>
                    <td className="p-3 text-right tabular-nums text-green-600">{t.delivered}</td>
                    <td className="p-3 text-right tabular-nums text-red-600">{t.returned}</td>
                    <td className="p-3 text-right tabular-nums">{t.pending}</td>
                    <td className="p-3 text-right tabular-nums">{t.shipped}</td>
                    <td className="p-3 text-right tabular-nums text-emerald-600">RM {formatRM(t.collection)}</td>
                    <td className="p-3 text-right tabular-nums text-purple-600">RM {formatRM(t.remaining)}</td>
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
