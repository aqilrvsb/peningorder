import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calendar, Loader2, Filter, Wallet, Download, Users, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, fetchAllRows, isOrderCollected } from '@/lib/utils';
import { useTeam } from '@/hooks/useTeam';

interface Order {
  marketer_id_staff: string;
  total_sale: number;
  delivery_status: string;
  type_payment: string;
  date_payment: string | null;
  kurier: string;
  cost_baseproduct: number;
  cost_postage: number;
  commission_amount: number;
}

interface Spend {
  marketer_id_staff: string;
  total_spend: number;
}

interface Tier { start: number; end: number | null; value: number; }

interface PnlConfig {
  revenue_basis: 'nett_sales' | 'collection';
  commission_mode: 'profit_sharing' | 'percent_direct';
  deduct_postage: boolean;
  deduct_product: boolean;
  deduct_spend: boolean;
  kpi_type: 'roas' | 'range_sales';
  tiers: Tier[];
}

interface SalaryRow {
  idStaff: string;
  name: string;
  totalSales: number;
  returnSales: number;
  nettSales: number;
  collection: number;
  spend: number;
  costProduct: number;
  postage: number;
  revenue: number;
  base: number;
  roas: number;
  kpiValue: number;
  commissionPercent: number;
  commission: number;
}

const AccountSalary: React.FC = () => {
  const { members, nameByIdstaff } = useTeam();

  const [pendingStart, setPendingStart] = useState(getMalaysiaStartOfMonth());
  const [pendingEnd, setPendingEnd] = useState(getMalaysiaEndOfMonth());
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());

  const applyFilter = () => { setStartDate(pendingStart); setEndDate(pendingEnd); };

  const { data: allOrders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ['salary-orders', startDate, endDate],
    queryFn: async () => {
      const data = await fetchAllRows(() =>
        (supabase as any)
          .from('customer_purchases')
          .select('marketer_id_staff, total_sale, delivery_status, type_payment, date_payment, kurier, cost_baseproduct, cost_postage, commission_amount')
          .gte('date_order', startDate)
          .lte('date_order', endDate)
      );
      return data as Order[];
    },
  });

  const { data: spends = [], isLoading: spendsLoading } = useQuery<Spend[]>({
    queryKey: ['salary-spends', startDate, endDate],
    queryFn: async () => {
      const data = await fetchAllRows(() =>
        (supabase as any)
          .from('spends')
          .select('marketer_id_staff, total_spend')
          .gte('tarikh_spend', startDate)
          .lte('tarikh_spend', endDate)
      );
      return data as Spend[];
    },
  });

  const { data: config, isLoading: configLoading } = useQuery<PnlConfig | null>({
    queryKey: ['salary-pnl-config'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('pnl_config').select('*').maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { ...data, tiers: Array.isArray(data.tiers) ? data.tiers : [] } as PnlConfig;
    },
  });

  const isLoading = ordersLoading || spendsLoading || configLoading;

  const formatNumber = (v: number) =>
    new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

  const isRoas = config?.kpi_type === 'roas';
  const isKomisyenOrder = config?.revenue_basis === 'komisyen_order';

  const salaryRows = useMemo<SalaryRow[]>(() => {
    if (!config) return [];
    const agg: Record<string, { totalSales: number; returnSales: number; collection: number; spend: number; costProduct: number; postage: number; komisyenOrder: number }> = {};
    const ensure = (id: string) => (agg[id] ||= { totalSales: 0, returnSales: 0, collection: 0, spend: 0, costProduct: 0, postage: 0, komisyenOrder: 0 });

    allOrders.forEach((o) => {
      const id = o.marketer_id_staff || '';
      if (!id) return;
      const a = ensure(id);
      const sale = Number(o.total_sale) || 0;
      a.totalSales += sale;
      if (o.delivery_status === 'Return') a.returnSales += sale;
      else a.komisyenOrder += Number(o.commission_amount) || 0; // bundle commission, returns earn none
      if (isOrderCollected(o)) a.collection += sale;
      a.costProduct += Number(o.cost_baseproduct) || 0;
      a.postage += Number(o.cost_postage) || 0; // includes return-order postage
    });
    spends.forEach((s) => {
      const id = s.marketer_id_staff || '';
      if (!id) return;
      ensure(id).spend += Number(s.total_spend) || 0;
    });

    const staff = members.filter((m) => !m.is_client);

    const matchTier = (kpi: number): Tier | null =>
      config.tiers.find((t) => kpi >= t.start && (t.end == null || kpi <= t.end)) || null;

    const isKomisyenOrder = config.revenue_basis === 'komisyen_order';

    const rows = staff.map((m) => {
      const a = agg[m.idstaff] || { totalSales: 0, returnSales: 0, collection: 0, spend: 0, costProduct: 0, postage: 0, komisyenOrder: 0 };
      const nettSales = a.totalSales - a.returnSales;
      const roas = a.spend > 0 ? a.totalSales / a.spend : 0;

      // Komisyen Order: commission is 100% the sum of per-bundle commission
      // (returns earn none) — the tier / revenue-basis / deductions don't apply.
      if (isKomisyenOrder) {
        return {
          idStaff: m.idstaff,
          name: nameByIdstaff.get(m.idstaff) || m.name || m.idstaff,
          totalSales: a.totalSales, returnSales: a.returnSales, nettSales,
          collection: a.collection, spend: a.spend, costProduct: a.costProduct, postage: a.postage,
          revenue: 0, base: 0, roas, kpiValue: 0, commissionPercent: 0,
          commission: a.komisyenOrder,
        };
      }

      const revenue = config.revenue_basis === 'collection' ? a.collection : nettSales;
      const kpiValue = config.kpi_type === 'roas' ? roas : revenue;
      const tier = matchTier(kpiValue);
      const commissionPercent = tier?.value || 0;
      const base = config.commission_mode === 'percent_direct'
        ? revenue
        : revenue
            - (config.deduct_postage ? a.postage : 0)
            - (config.deduct_product ? a.costProduct : 0)
            - (config.deduct_spend ? a.spend : 0);
      const commission = tier ? (base * commissionPercent) / 100 : 0;
      return {
        idStaff: m.idstaff,
        name: nameByIdstaff.get(m.idstaff) || m.name || m.idstaff,
        totalSales: a.totalSales,
        returnSales: a.returnSales,
        nettSales,
        collection: a.collection,
        spend: a.spend,
        costProduct: a.costProduct,
        postage: a.postage,
        revenue,
        base,
        roas,
        kpiValue,
        commissionPercent,
        commission,
      };
    });
    return rows.sort((x, y) => y.commission - x.commission);
  }, [allOrders, spends, members, nameByIdstaff, config]);

  const totals = useMemo(() => salaryRows.reduce(
    (acc, r) => ({
      nettSales: acc.nettSales + r.nettSales,
      collection: acc.collection + r.collection,
      spend: acc.spend + r.spend,
      base: acc.base + r.base,
      commission: acc.commission + r.commission,
    }),
    { nettSales: 0, collection: 0, spend: 0, base: 0, commission: 0 },
  ), [salaryRows]);

  const exportToXLSX = () => {
    const data = salaryRows.map((r, i) => ({
      No: i + 1,
      'ID Staff': r.idStaff,
      Nama: r.name,
      'Total Sales': r.totalSales.toFixed(2),
      Return: r.returnSales.toFixed(2),
      'Nett Sales': r.nettSales.toFixed(2),
      Collection: r.collection.toFixed(2),
      Spend: r.spend.toFixed(2),
      'Cost Product': r.costProduct.toFixed(2),
      Postage: r.postage.toFixed(2),
      [isRoas ? 'ROAS' : 'Range Sales']: isRoas ? r.roas.toFixed(2) : r.kpiValue.toFixed(2),
      'Comm %': r.commissionPercent,
      Base: r.base.toFixed(2),
      Commission: r.commission.toFixed(2),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salary');
    XLSX.writeFile(wb, `salary_${startDate}_to_${endDate}.xlsx`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Wallet className="w-6 h-6" />
            Salary
          </h1>
          <p className="text-muted-foreground mt-1">Komisyen staf mengikut konfigurasi PNL</p>
        </div>
        <Button onClick={exportToXLSX} className="bg-green-600 hover:bg-green-700 text-white w-fit">
          <Download className="w-4 h-4 mr-2" />Export XLSX
        </Button>
      </div>

      {!config && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg p-4 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Belum ada konfigurasi PNL. Pergi ke <b>PNL Config</b> untuk tetapkan asas jualan, jenis komisyen, KPI dan tier dahulu.</span>
        </div>
      )}

      {config && (
        <div className="bg-card border border-border rounded-lg p-3 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          {isKomisyenOrder ? (
            <span>Asas: <b className="text-foreground">Komisyen Order</b> — komisyen 100% ikut komisyen bundle (setup Logistic), tolak order Return.</span>
          ) : (
            <>
              <span>Asas: <b className="text-foreground">{config.revenue_basis === 'nett_sales' ? 'Nett Sales' : 'Collection'}</b></span>
              <span>Komisyen: <b className="text-foreground">{config.commission_mode === 'profit_sharing' ? 'Profit Sharing (Gross)' : 'Percent Direct'}</b></span>
              {config.commission_mode === 'profit_sharing' && (
                <span>Tolak: <b className="text-foreground">{[config.deduct_postage && 'Postage', config.deduct_product && 'Product', config.deduct_spend && 'Spend'].filter(Boolean).join(', ') || '—'}</b></span>
              )}
              <span>KPI: <b className="text-foreground">{isRoas ? 'ROAS' : 'Range Sales'}</b></span>
              <span>Tiers: <b className="text-foreground">{config.tiers.length}</b></span>
            </>
          )}
        </div>
      )}

      {/* Date filter */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-5 h-5" />
            <span className="font-medium text-foreground">Date Range:</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={pendingStart} onChange={(e) => setPendingStart(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={pendingEnd} onChange={(e) => setPendingEnd(e.target.value)} className="w-40" />
            </div>
            <Button onClick={applyFilter} size="sm" className="h-9">
              <Filter className="w-4 h-4 mr-1" />Filter
            </Button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card border-l-4 border-l-blue-500">
          <div className="text-muted-foreground text-xs uppercase mb-1">Total Nett Sales</div>
          <div className="text-lg font-bold text-blue-600">RM {formatNumber(totals.nettSales)}</div>
        </div>
        <div className="stat-card border-l-4 border-l-green-500">
          <div className="text-muted-foreground text-xs uppercase mb-1">Total Collection</div>
          <div className="text-lg font-bold text-green-600">RM {formatNumber(totals.collection)}</div>
        </div>
        <div className="stat-card border-l-4 border-l-slate-500">
          <div className="text-muted-foreground text-xs uppercase mb-1">Total Base</div>
          <div className="text-lg font-bold text-slate-600">RM {formatNumber(totals.base)}</div>
        </div>
        <div className="stat-card border-l-4 border-l-amber-500">
          <div className="text-muted-foreground text-xs uppercase mb-1">Total Commission</div>
          <div className="text-lg font-bold text-amber-600">RM {formatNumber(totals.commission)}</div>
        </div>
      </div>

      {/* Salary table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Staff Commission</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left">ID Staff</th>
                <th className="p-3 text-left">Nama</th>
                <th className="p-3 text-right">Nett Sales</th>
                <th className="p-3 text-right text-green-600 dark:text-green-400">Collection</th>
                <th className="p-3 text-right text-red-600 dark:text-red-400">Spend</th>
                <th className="p-3 text-right">Cost Product</th>
                <th className="p-3 text-right">Postage</th>
                <th className="p-3 text-right text-amber-600 dark:text-amber-400">{isKomisyenOrder ? 'KPI' : isRoas ? 'ROAS' : 'Range Sales'}</th>
                <th className="p-3 text-right">Base</th>
                <th className="p-3 text-right">Comm %</th>
                <th className="p-3 text-right font-semibold text-primary">Commission</th>
              </tr>
            </thead>
            <tbody>
              {salaryRows.map((r) => (
                <tr key={r.idStaff} className="border-t border-border hover:bg-muted/30">
                  <td className="p-3 font-mono">{r.idStaff}</td>
                  <td className="p-3">{r.name}</td>
                  <td className="p-3 text-right tabular-nums">RM {formatNumber(r.nettSales)}</td>
                  <td className="p-3 text-right tabular-nums text-green-600 dark:text-green-400">RM {formatNumber(r.collection)}</td>
                  <td className="p-3 text-right tabular-nums text-red-600 dark:text-red-400">RM {formatNumber(r.spend)}</td>
                  <td className="p-3 text-right tabular-nums">RM {formatNumber(r.costProduct)}</td>
                  <td className="p-3 text-right tabular-nums">RM {formatNumber(r.postage)}</td>
                  <td className="p-3 text-right tabular-nums text-amber-600 dark:text-amber-400">{isKomisyenOrder ? '—' : isRoas ? `${r.roas.toFixed(2)}x` : `RM ${formatNumber(r.kpiValue)}`}</td>
                  <td className="p-3 text-right tabular-nums">{isKomisyenOrder ? '—' : `RM ${formatNumber(r.base)}`}</td>
                  <td className="p-3 text-right tabular-nums">{isKomisyenOrder ? '—' : `${r.commissionPercent}%`}</td>
                  <td className="p-3 text-right tabular-nums font-bold text-primary">RM {formatNumber(r.commission)}</td>
                </tr>
              ))}
              {salaryRows.length === 0 && (
                <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Tiada staf untuk dikira.</td></tr>
              )}
            </tbody>
            {salaryRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                  <td className="p-3" colSpan={2}>TOTAL</td>
                  <td className="p-3 text-right tabular-nums">RM {formatNumber(totals.nettSales)}</td>
                  <td className="p-3 text-right tabular-nums text-green-600 dark:text-green-400">RM {formatNumber(totals.collection)}</td>
                  <td className="p-3 text-right tabular-nums text-red-600 dark:text-red-400">RM {formatNumber(totals.spend)}</td>
                  <td className="p-3" colSpan={3}></td>
                  <td className="p-3 text-right tabular-nums">RM {formatNumber(totals.base)}</td>
                  <td className="p-3"></td>
                  <td className="p-3 text-right tabular-nums font-bold text-primary">RM {formatNumber(totals.commission)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default AccountSalary;
