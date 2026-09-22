import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calendar, Loader2, Filter, Wallet, Download, Users } from 'lucide-react';
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
}

interface Spend {
  marketer_id_staff: string;
  total_spend: number;
}

interface PnlTier {
  role: string;
  min_gross_profit: number;
  max_gross_profit: number | null;
  commission_percent: number;
  bonus_amount: number;
}

interface SalaryRow {
  idStaff: string;
  name: string;
  role: string;
  collection: number;
  spend: number;
  costProduct: number;
  postage: number;
  grossProfit: number;
  roas: number;
  commissionPercent: number;
  commission: number;
  bonus: number;
  total: number;
  tierLabel: string;
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
          .select('marketer_id_staff, total_sale, delivery_status, type_payment, date_payment, kurier, cost_baseproduct, cost_postage')
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

  const { data: tiers = [], isLoading: tiersLoading } = useQuery<PnlTier[]>({
    queryKey: ['salary-pnl-tiers'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('pnl_config')
        .select('role, min_gross_profit, max_gross_profit, commission_percent, bonus_amount')
        .order('min_gross_profit', { ascending: true });
      if (error) throw error;
      return (data || []) as PnlTier[];
    },
  });

  const isLoading = ordersLoading || spendsLoading || tiersLoading;

  const formatNumber = (v: number) =>
    new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

  // Match a staff's gross profit to a tier for their role (fall back to marketer
  // tiers when the role has none of its own).
  const matchTier = (role: string, gp: number): PnlTier | null => {
    const forRole = tiers.filter((t) => t.role === role);
    const pool = forRole.length ? forRole : tiers.filter((t) => t.role === 'marketer');
    return pool.find((t) => gp >= t.min_gross_profit && (t.max_gross_profit == null || gp <= t.max_gross_profit)) || null;
  };

  const salaryRows = useMemo<SalaryRow[]>(() => {
    // Aggregate per staff from orders + spends.
    const agg: Record<string, { collection: number; spend: number; costProduct: number; postage: number }> = {};
    const ensure = (id: string) => (agg[id] ||= { collection: 0, spend: 0, costProduct: 0, postage: 0 });

    allOrders.forEach((o) => {
      const id = o.marketer_id_staff || '';
      if (!id) return;
      const a = ensure(id);
      if (isOrderCollected(o)) a.collection += Number(o.total_sale) || 0;
      a.costProduct += Number(o.cost_baseproduct) || 0;
      a.postage += Number(o.cost_postage) || 0;
    });
    spends.forEach((s) => {
      const id = s.marketer_id_staff || '';
      if (!id) return;
      ensure(id).spend += Number(s.total_spend) || 0;
    });

    // Salary applies to staff (marketer / admin), not the tenant owner.
    const staff = members.filter((m) => !m.is_client && (m.role === 'marketer' || m.role === 'admin' || !m.role));

    const rows = staff.map((m) => {
      const a = agg[m.idstaff] || { collection: 0, spend: 0, costProduct: 0, postage: 0 };
      const grossProfit = a.collection - a.spend - a.costProduct - a.postage;
      const roas = a.spend > 0 ? a.collection / a.spend : 0;
      const role = m.role || 'marketer';
      const tier = matchTier(role, grossProfit);
      const commissionPercent = tier?.commission_percent || 0;
      const commission = tier ? (grossProfit * commissionPercent) / 100 : 0;
      const bonus = tier?.bonus_amount || 0;
      const tierLabel = tier
        ? `RM ${formatNumber(tier.min_gross_profit)} - ${tier.max_gross_profit == null ? 'Above' : 'RM ' + formatNumber(tier.max_gross_profit)}`
        : '—';
      return {
        idStaff: m.idstaff,
        name: nameByIdstaff.get(m.idstaff) || m.name || m.idstaff,
        role,
        collection: a.collection,
        spend: a.spend,
        costProduct: a.costProduct,
        postage: a.postage,
        grossProfit,
        roas,
        commissionPercent,
        commission,
        bonus,
        total: commission + bonus,
        tierLabel,
      };
    });
    return rows.sort((x, y) => y.grossProfit - x.grossProfit);
  }, [allOrders, spends, members, nameByIdstaff, tiers]);

  const totals = useMemo(() => salaryRows.reduce(
    (acc, r) => ({
      collection: acc.collection + r.collection,
      spend: acc.spend + r.spend,
      costProduct: acc.costProduct + r.costProduct,
      postage: acc.postage + r.postage,
      grossProfit: acc.grossProfit + r.grossProfit,
      commission: acc.commission + r.commission,
      bonus: acc.bonus + r.bonus,
      total: acc.total + r.total,
    }),
    { collection: 0, spend: 0, costProduct: 0, postage: 0, grossProfit: 0, commission: 0, bonus: 0, total: 0 },
  ), [salaryRows]);

  const exportToXLSX = () => {
    const data = salaryRows.map((r, i) => ({
      No: i + 1,
      'ID Staff': r.idStaff,
      Nama: r.name,
      Role: r.role,
      Collection: r.collection.toFixed(2),
      Spend: r.spend.toFixed(2),
      'Cost Product': r.costProduct.toFixed(2),
      Postage: r.postage.toFixed(2),
      'Gross Profit': r.grossProfit.toFixed(2),
      'Commission %': r.commissionPercent,
      Commission: r.commission.toFixed(2),
      Bonus: r.bonus.toFixed(2),
      'Total Salary': r.total.toFixed(2),
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
          <p className="text-muted-foreground mt-1">Gaji staf mengikut tier PNL (Gross Profit → Commission + Bonus)</p>
        </div>
        <Button onClick={exportToXLSX} className="bg-green-600 hover:bg-green-700 text-white w-fit">
          <Download className="w-4 h-4 mr-2" />Export XLSX
        </Button>
      </div>

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
        <div className="stat-card border-l-4 border-l-green-500">
          <div className="text-muted-foreground text-xs uppercase mb-1">Total Collection</div>
          <div className="text-lg font-bold text-green-600">RM {formatNumber(totals.collection)}</div>
        </div>
        <div className="stat-card border-l-4 border-l-blue-500">
          <div className="text-muted-foreground text-xs uppercase mb-1">Total Gross Profit</div>
          <div className="text-lg font-bold text-blue-600">RM {formatNumber(totals.grossProfit)}</div>
        </div>
        <div className="stat-card border-l-4 border-l-primary">
          <div className="text-muted-foreground text-xs uppercase mb-1">Total Commission</div>
          <div className="text-lg font-bold text-primary">RM {formatNumber(totals.commission)}</div>
        </div>
        <div className="stat-card border-l-4 border-l-amber-500">
          <div className="text-muted-foreground text-xs uppercase mb-1">Total Salary (Comm + Bonus)</div>
          <div className="text-lg font-bold text-amber-600">RM {formatNumber(totals.total)}</div>
        </div>
      </div>

      {/* Salary table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Staff Salary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left">ID Staff</th>
                <th className="p-3 text-left">Nama</th>
                <th className="p-3 text-left">Role</th>
                <th className="p-3 text-right text-green-600 dark:text-green-400">Collection</th>
                <th className="p-3 text-right text-red-600 dark:text-red-400">Spend</th>
                <th className="p-3 text-right">Cost Product</th>
                <th className="p-3 text-right">Postage</th>
                <th className="p-3 text-right text-blue-600 dark:text-blue-400">Gross Profit</th>
                <th className="p-3 text-left">Tier</th>
                <th className="p-3 text-right">Comm %</th>
                <th className="p-3 text-right text-primary">Commission</th>
                <th className="p-3 text-right text-green-600 dark:text-green-400">Bonus</th>
                <th className="p-3 text-right font-semibold">Total Salary</th>
              </tr>
            </thead>
            <tbody>
              {salaryRows.map((r) => (
                <tr key={r.idStaff} className="border-t border-border hover:bg-muted/30">
                  <td className="p-3 font-mono">{r.idStaff}</td>
                  <td className="p-3">{r.name}</td>
                  <td className="p-3 capitalize">{r.role}</td>
                  <td className="p-3 text-right tabular-nums text-green-600 dark:text-green-400">RM {formatNumber(r.collection)}</td>
                  <td className="p-3 text-right tabular-nums text-red-600 dark:text-red-400">RM {formatNumber(r.spend)}</td>
                  <td className="p-3 text-right tabular-nums">RM {formatNumber(r.costProduct)}</td>
                  <td className="p-3 text-right tabular-nums">RM {formatNumber(r.postage)}</td>
                  <td className={`p-3 text-right tabular-nums font-medium ${r.grossProfit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600'}`}>RM {formatNumber(r.grossProfit)}</td>
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{r.tierLabel}</td>
                  <td className="p-3 text-right tabular-nums">{r.commissionPercent}%</td>
                  <td className="p-3 text-right tabular-nums text-primary">RM {formatNumber(r.commission)}</td>
                  <td className="p-3 text-right tabular-nums text-green-600 dark:text-green-400">RM {formatNumber(r.bonus)}</td>
                  <td className={`p-3 text-right tabular-nums font-bold ${r.total >= 0 ? '' : 'text-red-600'}`}>RM {formatNumber(r.total)}</td>
                </tr>
              ))}
              {salaryRows.length === 0 && (
                <tr><td colSpan={13} className="p-6 text-center text-muted-foreground">Tiada staf untuk dikira. Tambah staf & tetapkan tier di PNL Config.</td></tr>
              )}
            </tbody>
            {salaryRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                  <td className="p-3" colSpan={3}>TOTAL</td>
                  <td className="p-3 text-right tabular-nums text-green-600 dark:text-green-400">RM {formatNumber(totals.collection)}</td>
                  <td className="p-3 text-right tabular-nums text-red-600 dark:text-red-400">RM {formatNumber(totals.spend)}</td>
                  <td className="p-3 text-right tabular-nums">RM {formatNumber(totals.costProduct)}</td>
                  <td className="p-3 text-right tabular-nums">RM {formatNumber(totals.postage)}</td>
                  <td className="p-3 text-right tabular-nums text-blue-600 dark:text-blue-400">RM {formatNumber(totals.grossProfit)}</td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3 text-right tabular-nums text-primary">RM {formatNumber(totals.commission)}</td>
                  <td className="p-3 text-right tabular-nums text-green-600 dark:text-green-400">RM {formatNumber(totals.bonus)}</td>
                  <td className="p-3 text-right tabular-nums font-bold">RM {formatNumber(totals.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-card border border-border rounded-lg p-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Cara kira: </span>
        Gross Profit = Collection − Spend − Cost Product − Postage. Commission = % Gross Profit (mengikut tier di PNL Config).
        Bonus = jumlah tetap per tier. Total Salary = Commission + Bonus.
      </div>
    </div>
  );
};

export default AccountSalary;
