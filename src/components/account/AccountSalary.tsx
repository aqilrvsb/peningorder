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
  revenue_basis: 'nett_sales' | 'collection' | 'komisyen_order';
  komisyen_basis: 'nett_sales' | 'collection';
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
  qualifyOrders: number;
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
  const fmtRM = (v: number) => `RM ${formatNumber(v)}`;

  const isRoas = config?.kpi_type === 'roas';
  const isKomisyenOrder = config?.revenue_basis === 'komisyen_order';
  const isProfitSharing = config?.commission_mode === 'profit_sharing';
  // Which revenue figure is the "basis" for this config.
  const basisIsCollection = isKomisyenOrder
    ? config?.komisyen_basis === 'collection'
    : config?.revenue_basis === 'collection';

  const salaryRows = useMemo<SalaryRow[]>(() => {
    if (!config) return [];
    const agg: Record<string, { totalSales: number; returnSales: number; collection: number; spend: number; costProduct: number; postage: number; komNett: number; komColl: number; cntNett: number; cntColl: number }> = {};
    const ensure = (id: string) => (agg[id] ||= { totalSales: 0, returnSales: 0, collection: 0, spend: 0, costProduct: 0, postage: 0, komNett: 0, komColl: 0, cntNett: 0, cntColl: 0 });

    allOrders.forEach((o) => {
      const id = o.marketer_id_staff || '';
      if (!id) return;
      const a = ensure(id);
      const sale = Number(o.total_sale) || 0;
      const comm = Number(o.commission_amount) || 0;
      a.totalSales += sale;
      if (o.delivery_status === 'Return') a.returnSales += sale;
      else { a.komNett += comm; a.cntNett += 1; }            // basis "Total Sales − Return": all except Return
      if (isOrderCollected(o)) { a.collection += sale; a.komColl += comm; a.cntColl += 1; } // basis "Collection": collected only
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

    const komOrder = config.revenue_basis === 'komisyen_order';
    const collBasis = komOrder ? config.komisyen_basis === 'collection' : config.revenue_basis === 'collection';

    const rows = staff.map((m) => {
      const a = agg[m.idstaff] || { totalSales: 0, returnSales: 0, collection: 0, spend: 0, costProduct: 0, postage: 0, komNett: 0, komColl: 0, cntNett: 0, cntColl: 0 };
      const nettSales = a.totalSales - a.returnSales;
      const roas = a.spend > 0 ? a.totalSales / a.spend : 0;
      const qualifyOrders = collBasis ? a.cntColl : a.cntNett;

      // Komisyen Order: commission = sum of per-bundle komisyen for qualifying orders.
      if (komOrder) {
        const commission = config.komisyen_basis === 'collection' ? a.komColl : a.komNett;
        return {
          idStaff: m.idstaff, name: nameByIdstaff.get(m.idstaff) || m.name || m.idstaff,
          totalSales: a.totalSales, returnSales: a.returnSales, nettSales,
          collection: a.collection, spend: a.spend, costProduct: a.costProduct, postage: a.postage,
          revenue: 0, base: 0, roas, kpiValue: 0, commissionPercent: 0, commission, qualifyOrders,
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
        idStaff: m.idstaff, name: nameByIdstaff.get(m.idstaff) || m.name || m.idstaff,
        totalSales: a.totalSales, returnSales: a.returnSales, nettSales,
        collection: a.collection, spend: a.spend, costProduct: a.costProduct, postage: a.postage,
        revenue, base, roas, kpiValue, commissionPercent, commission, qualifyOrders,
      };
    });
    return rows.sort((x, y) => y.commission - x.commission);
  }, [allOrders, spends, members, nameByIdstaff, config]);

  const totals = useMemo(() => salaryRows.reduce(
    (acc, r) => ({
      nettSales: acc.nettSales + r.nettSales,
      collection: acc.collection + r.collection,
      spend: acc.spend + r.spend,
      costProduct: acc.costProduct + r.costProduct,
      postage: acc.postage + r.postage,
      base: acc.base + r.base,
      commission: acc.commission + r.commission,
      qualifyOrders: acc.qualifyOrders + r.qualifyOrders,
    }),
    { nettSales: 0, collection: 0, spend: 0, costProduct: 0, postage: 0, base: 0, commission: 0, qualifyOrders: 0 },
  ), [salaryRows]);

  // Build the columns shown, driven entirely by the PNL config.
  type Col = { key: string; label: string; align: 'left' | 'right'; headClass?: string; cell: (r: SalaryRow) => React.ReactNode; total?: React.ReactNode };
  const columns: Col[] = useMemo(() => {
    if (!config) return [];
    const cols: Col[] = [
      { key: 'id', label: 'ID Staff', align: 'left', cell: (r) => <span className="font-mono">{r.idStaff}</span> },
      { key: 'name', label: 'Nama', align: 'left', cell: (r) => r.name },
    ];
    const nettCol: Col = { key: 'nett', label: 'Nett Sales', align: 'right', cell: (r) => fmtRM(r.nettSales), total: fmtRM(totals.nettSales) };
    const collCol: Col = { key: 'coll', label: 'Collection', align: 'right', headClass: 'text-green-600 dark:text-green-400', cell: (r) => <span className="text-green-600 dark:text-green-400">{fmtRM(r.collection)}</span>, total: <span className="text-green-600 dark:text-green-400">{fmtRM(totals.collection)}</span> };
    const spendCol: Col = { key: 'spend', label: 'Spend', align: 'right', headClass: 'text-red-600 dark:text-red-400', cell: (r) => <span className="text-red-600 dark:text-red-400">{fmtRM(r.spend)}</span>, total: <span className="text-red-600 dark:text-red-400">{fmtRM(totals.spend)}</span> };
    const productCol: Col = { key: 'product', label: 'Cost Product', align: 'right', cell: (r) => fmtRM(r.costProduct), total: fmtRM(totals.costProduct) };
    const postageCol: Col = { key: 'postage', label: 'Postage', align: 'right', cell: (r) => fmtRM(r.postage), total: fmtRM(totals.postage) };
    const baseCol: Col = { key: 'base', label: 'Base', align: 'right', cell: (r) => fmtRM(r.base), total: fmtRM(totals.base) };
    const roasCol: Col = { key: 'roas', label: 'ROAS', align: 'right', headClass: 'text-amber-600 dark:text-amber-400', cell: (r) => <span className="text-amber-600 dark:text-amber-400">{r.roas.toFixed(2)}x</span> };
    const pctCol: Col = { key: 'pct', label: 'Comm %', align: 'right', cell: (r) => `${r.commissionPercent}%` };
    const ordersCol: Col = { key: 'orders', label: 'Bil. Order', align: 'right', cell: (r) => r.qualifyOrders, total: totals.qualifyOrders };
    const commissionCol: Col = { key: 'commission', label: 'Commission', align: 'right', headClass: 'text-primary font-semibold', cell: (r) => <span className="font-bold text-primary">{fmtRM(r.commission)}</span>, total: <span className="font-bold text-primary">{fmtRM(totals.commission)}</span> };

    if (isKomisyenOrder) {
      cols.push(basisIsCollection ? collCol : nettCol);
      cols.push(ordersCol);
      cols.push(commissionCol);
      return cols;
    }
    cols.push(basisIsCollection ? collCol : nettCol);
    if (isProfitSharing) {
      if (config.deduct_spend) cols.push(spendCol);
      if (config.deduct_product) cols.push(productCol);
      if (config.deduct_postage) cols.push(postageCol);
      cols.push(baseCol);
    }
    if (isRoas) cols.push(roasCol);
    cols.push(pctCol);
    cols.push(commissionCol);
    return cols;
  }, [config, totals, isKomisyenOrder, isProfitSharing, isRoas, basisIsCollection]);

  // Summary cards, also config-driven.
  const cards = useMemo(() => {
    if (!config) return [];
    const out: { label: string; value: string; color: string }[] = [];
    out.push({ label: basisIsCollection ? 'Total Collection' : 'Total Nett Sales', value: fmtRM(basisIsCollection ? totals.collection : totals.nettSales), color: basisIsCollection ? 'green' : 'blue' });
    if (isKomisyenOrder) out.push({ label: 'Total Bil. Order', value: String(totals.qualifyOrders), color: 'slate' });
    else if (isProfitSharing) out.push({ label: 'Total Base', value: fmtRM(totals.base), color: 'slate' });
    out.push({ label: 'Total Commission', value: fmtRM(totals.commission), color: 'amber' });
    return out;
  }, [config, totals, isKomisyenOrder, isProfitSharing, basisIsCollection]);

  const exportToXLSX = () => {
    const data = salaryRows.map((r, i) => {
      const row: Record<string, any> = { No: i + 1 };
      columns.forEach((c) => {
        if (c.key === 'id') row['ID Staff'] = r.idStaff;
        else if (c.key === 'name') row['Nama'] = r.name;
        else if (c.key === 'nett') row['Nett Sales'] = r.nettSales.toFixed(2);
        else if (c.key === 'coll') row['Collection'] = r.collection.toFixed(2);
        else if (c.key === 'spend') row['Spend'] = r.spend.toFixed(2);
        else if (c.key === 'product') row['Cost Product'] = r.costProduct.toFixed(2);
        else if (c.key === 'postage') row['Postage'] = r.postage.toFixed(2);
        else if (c.key === 'base') row['Base'] = r.base.toFixed(2);
        else if (c.key === 'roas') row['ROAS'] = r.roas.toFixed(2);
        else if (c.key === 'pct') row['Comm %'] = r.commissionPercent;
        else if (c.key === 'orders') row['Bil. Order'] = r.qualifyOrders;
        else if (c.key === 'commission') row['Commission'] = r.commission.toFixed(2);
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salary');
    XLSX.writeFile(wb, `salary_${startDate}_to_${endDate}.xlsx`);
  };

  const cardColor: Record<string, string> = {
    blue: 'border-l-blue-500 text-blue-600', green: 'border-l-green-500 text-green-600',
    slate: 'border-l-slate-500 text-slate-600', amber: 'border-l-amber-500 text-amber-600',
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
          <span>Belum ada konfigurasi PNL. Pergi ke <b>PNL Config</b> untuk tetapkan cara kira komisyen dahulu.</span>
        </div>
      )}

      {config && (
        <div className="bg-card border border-border rounded-lg p-3 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          {isKomisyenOrder ? (
            <span>Asas: <b className="text-foreground">Komisyen Order</b> — komisyen bundle (setup Logistic), dikira untuk order <b className="text-foreground">{basisIsCollection ? 'yang dah Collect' : 'Total Sales − Return'}</b>.</span>
          ) : (
            <>
              <span>Asas: <b className="text-foreground">{basisIsCollection ? 'Collection' : 'Nett Sales'}</b></span>
              <span>Komisyen: <b className="text-foreground">{isProfitSharing ? 'Profit Sharing (Gross)' : 'Percent Direct'}</b></span>
              {isProfitSharing && (
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

      {/* Summary cards (config-driven) */}
      {cards.length > 0 && (
        <div className={`grid grid-cols-2 gap-3 ${cards.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          {cards.map((c) => (
            <div key={c.label} className={`stat-card border-l-4 ${cardColor[c.color] || 'border-l-slate-500 text-slate-600'}`}>
              <div className="text-muted-foreground text-xs uppercase mb-1">{c.label}</div>
              <div className={`text-lg font-bold ${(cardColor[c.color] || '').split(' ')[1] || ''}`}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Salary table (config-driven columns) */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Staff Commission</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={`p-3 ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.headClass || ''}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {salaryRows.map((r) => (
                <tr key={r.idStaff} className="border-t border-border hover:bg-muted/30">
                  {columns.map((c) => (
                    <td key={c.key} className={`p-3 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{c.cell(r)}</td>
                  ))}
                </tr>
              ))}
              {salaryRows.length === 0 && (
                <tr><td colSpan={columns.length || 1} className="p-6 text-center text-muted-foreground">Tiada staf untuk dikira.</td></tr>
              )}
            </tbody>
            {salaryRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                  {columns.map((c, idx) => (
                    <td key={c.key} className={`p-3 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                      {idx === 0 ? 'TOTAL' : (c.total ?? '')}
                    </td>
                  ))}
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
