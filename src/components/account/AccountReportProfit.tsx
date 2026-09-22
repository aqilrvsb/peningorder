import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calendar, Loader2, Filter, TrendingUp, DollarSign, Package, Truck, Globe, Video, ShoppingBag, Facebook, Database, RotateCcw, Users, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, fetchAllRows } from '@/lib/utils';
import { isOrderCollected } from '@/lib/utils';
import { TeamFilter } from '@/components/TeamFilter';
import { useTeam } from '@/hooks/useTeam';
import { useAuth } from '@/context/AuthContext';

interface Order {
  id: string;
  marketer_id_staff: string;
  date_order: string;
  total_sale: number;
  unit: number;
  jenis_platform: string;
  delivery_status: string;
  seo: string;
  cost_baseproduct: number;
  cost_hq: number;
  bundle?: { name?: string; sku?: string } | null;
  cost_postage: number;
}

interface Spend {
  id: string;
  marketer_id_staff: string;
  jenis_platform: string;
  total_spend: number;
  tarikh_spend: string;
}

interface Profile {
  idstaff: string;
  full_name: string;
}

interface MarketerProfitStats {
  idStaff: string;
  name: string;
  totalSales: number;
  totalCollection: number;
  totalReturn: number;
  returnFB: number;
  returnDatabase: number;
  returnThreads: number;
  returnTiktok: number;
  returnGoogle: number;
  totalSpend: number;
  totalCostProduct: number;
  totalPostage: number;
  totalUnitBundle: number;
  roas: number;
  profit: number;
  totalCommission: number; // sum of per-order bundle commission (all orders)
  totalCommissionReturn: number; // commission of Return orders — deducted from Komisyen Sales
  // Facebook
  salesFB: number;
  collectionFB: number;
  spendFB: number;
  costProductFB: number;
  postageFB: number;
  unitBundleFB: number;
  profitFB: number;
  // Database
  salesDatabase: number;
  collectionDatabase: number;
  spendDatabase: number;
  costProductDatabase: number;
  postageDatabase: number;
  unitBundleDatabase: number;
  profitDatabase: number;
  // Threads
  salesThreads: number;
  collectionThreads: number;
  spendThreads: number;
  costProductThreads: number;
  postageThreads: number;
  unitBundleThreads: number;
  profitThreads: number;
  // Tiktok
  salesTiktok: number;
  collectionTiktok: number;
  spendTiktok: number;
  costProductTiktok: number;
  postageTiktok: number;
  unitBundleTiktok: number;
  profitTiktok: number;
  // Google
  salesGoogle: number;
  collectionGoogle: number;
  spendGoogle: number;
  costProductGoogle: number;
  postageGoogle: number;
  unitBundleGoogle: number;
  profitGoogle: number;
}

const AccountReportProfit: React.FC = () => {
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  // Per-staff commission config (idstaff -> { percent, mode }) for the team table.
  const [staffMeta, setStaffMeta] = useState<Record<string, { percent: number; mode: string }>>({});
  // RLS-safe name + commission lookup via the team_roster RPC (the direct profiles
  // read only returns the caller's own row, so staff names/percent came back blank).
  const { nameByIdstaff, metaByIdstaff } = useTeam();
  const { profile } = useAuth();
  // A marketer staff sees ONLY their own data (no team filter, own row only).
  const isMarketer = profile?.role === 'marketer';
  const ownIdStaff = profile?.idstaff || '';

  // Date filter state - default to current month (Malaysia timezone)
  // pendingStart/End are what the user picks; startDate/endDate are applied on "Filter" click
  const [pendingStart, setPendingStart] = useState(getMalaysiaStartOfMonth());
  const [pendingEnd, setPendingEnd] = useState(getMalaysiaEndOfMonth());
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  const [teamFilter, setTeamFilter] = useState('');

  const applyFilter = () => {
    setStartDate(pendingStart);
    setEndDate(pendingEnd);
  };

  // Fetch profiles once on mount (small dataset)
  useEffect(() => {
    const fetchStaticData = async () => {
      try {
        const profilesRes = await (supabase as any)
          .from('profiles')
          .select('idstaff, full_name, commission_percent, pay_mode');

        if (profilesRes.error) throw profilesRes.error;

        const profileMap: Record<string, string> = {};
        const metaMap: Record<string, { percent: number; mode: string }> = {};
        (profilesRes.data || []).forEach((p: any) => {
          if (p.idstaff) {
            profileMap[p.idstaff] = p.full_name || p.idstaff;
            metaMap[p.idstaff] = { percent: Number(p.commission_percent) || 0, mode: p.pay_mode || 'commission_order' };
          }
        });
        setProfiles(profileMap);
        setStaffMeta(metaMap);
      } catch (error) {
        console.error('Error fetching static data:', error);
      }
    };
    fetchStaticData();
  }, []);

  // Fetch orders + spends via React Query so edits in other tabs invalidate this view too
  const { data: allOrders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ['report-profit-orders', startDate, endDate],
    queryFn: async () => {
      const data = await fetchAllRows(() =>
        (supabase as any)
          .from('customer_purchases')
          .select('*, bundle:logistic_bundles(name, sku)')
          .gte('date_order', startDate)
          .lte('date_order', endDate)
          .order('created_at', { ascending: false })
      );
      return data as Order[];
    },
  });

  const { data: spends = [], isLoading: spendsLoading } = useQuery<Spend[]>({
    queryKey: ['report-profit-spends', startDate, endDate],
    queryFn: async () => {
      const data = await fetchAllRows(() =>
        (supabase as any)
          .from('spends')
          .select('id, marketer_id_staff, jenis_platform, total_spend, tarikh_spend')
          .gte('tarikh_spend', startDate)
          .lte('tarikh_spend', endDate)
          .order('created_at', { ascending: false })
      );
      return data as Spend[];
    },
  });

  // HQ business expenses (Overhead / Marketing / Cost Product / Other) for the
  // period. Deducted from BOTH profit figures. Company-level overhead, so it does
  // NOT apply to a marketer's own view (they don't carry company expenses).
  const { data: expenses = [], isLoading: expensesLoading } = useQuery<{ total: number; platform: string | null }[]>({
    queryKey: ['report-profit-expenses', startDate, endDate, isMarketer],
    queryFn: async () => {
      if (isMarketer) return [];
      const data = await fetchAllRows(() =>
        (supabase as any)
          .from('expenses')
          .select('total, platform, date')
          .gte('date', startDate)
          .lte('date', endDate)
      );
      return (data || []).map((e: any) => ({ total: Number(e.total) || 0, platform: e.platform || null }));
    },
  });

  // Total expenses + per-platform split (platform-tagged ones attribute to that
  // platform's card; untagged expenses still count in the overall total).
  const expenseStats = useMemo(() => {
    const byPlatform: Record<string, number> = { Facebook: 0, Database: 0, Threads: 0, Tiktok: 0, Google: 0 };
    // Map any casing (Facebook / FACEBOOK / facebook) to our 5 platform buckets.
    const canon: Record<string, string> = { facebook: 'Facebook', database: 'Database', threads: 'Threads', tiktok: 'Tiktok', google: 'Google' };
    let total = 0;
    (expenses || []).forEach((e) => {
      const amt = Number(e.total) || 0;
      total += amt;
      const key = canon[(e.platform || '').toLowerCase()];
      if (key) byPlatform[key] += amt;
    });
    return { total, byPlatform };
  }, [expenses]);

  const isLoading = ordersLoading || spendsLoading || expensesLoading;

  // Orders already filtered by date at DB level
  // Marketers are locked to their own idstaff; clients use the team filter.
  const effectiveFilter = isMarketer ? ownIdStaff : teamFilter;
  const filteredOrders = effectiveFilter ? allOrders.filter((o: any) => (o.marketer_id_staff || '') === effectiveFilter) : allOrders;

  // Spends already filtered by date at DB level
  const filteredSpends = effectiveFilter ? spends.filter((s: any) => (s.marketer_id_staff || '') === effectiveFilter) : spends;

  // Calculate stats by marketer
  const marketerStats = useMemo(() => {
    const stats: Record<string, MarketerProfitStats> = {};

    const initStats = (idStaff: string, name: string) => {
      if (!stats[idStaff]) {
        stats[idStaff] = {
          idStaff,
          name,
          totalSales: 0,
          totalCollection: 0,
          totalReturn: 0,
          returnFB: 0, returnDatabase: 0, returnThreads: 0, returnTiktok: 0, returnGoogle: 0,
          totalSpend: 0,
          totalCostProduct: 0,
          totalPostage: 0,
          totalUnitBundle: 0,
          roas: 0,
          profit: 0,
          totalCommission: 0,
          totalCommissionReturn: 0,
          salesFB: 0, collectionFB: 0, spendFB: 0, costProductFB: 0, postageFB: 0, unitBundleFB: 0, profitFB: 0,
          salesDatabase: 0, collectionDatabase: 0, spendDatabase: 0, costProductDatabase: 0, postageDatabase: 0, unitBundleDatabase: 0, profitDatabase: 0,
          salesThreads: 0, collectionThreads: 0, spendThreads: 0, costProductThreads: 0, postageThreads: 0, unitBundleThreads: 0, profitThreads: 0,
          salesTiktok: 0, collectionTiktok: 0, spendTiktok: 0, costProductTiktok: 0, postageTiktok: 0, unitBundleTiktok: 0, profitTiktok: 0,
          salesGoogle: 0, collectionGoogle: 0, spendGoogle: 0, costProductGoogle: 0, postageGoogle: 0, unitBundleGoogle: 0, profitGoogle: 0,
        };
      }
    };

    // Process orders including Return (for sales, cost product)
    filteredOrders.forEach(order => {
      const idStaff = order.marketer_id_staff || "HQ";

      const name = profiles[idStaff] || idStaff;
      const sale = Number(order.total_sale) || 0;
      const platform = order.jenis_platform || 'Facebook';

      // Cost product always uses base_cost
      const costProduct = Number(order.cost_baseproduct) || 0;
      const postage = Number(order.cost_postage) || 0;

      // Unit Bundle = order.unit (already the MAIN product qty from the bundle SKU,
      // set at key-in time — do not multiply by the SKU number again)
      const unitBundle = Number(order.unit) || 0;

      initStats(idStaff, name);

      stats[idStaff].totalSales += sale;
      stats[idStaff].totalCommission += Number(order.commission_amount) || 0;
      if (isOrderCollected(order)) {
        stats[idStaff].totalCollection += sale;
      }
      if (order.delivery_status === 'Return') {
        stats[idStaff].totalReturn += sale;
        // Per-platform return, so each platform's Profit By Sales can net it out.
        if (platform === 'Facebook') stats[idStaff].returnFB += sale;
        else if (platform === 'Database') stats[idStaff].returnDatabase += sale;
        else if (platform === 'Threads') stats[idStaff].returnThreads += sale;
        else if (platform === 'Tiktok') stats[idStaff].returnTiktok += sale;
        else if (platform === 'Google') stats[idStaff].returnGoogle += sale;
        // A returned order earns no commission — track it to deduct from Komisyen Sales.
        stats[idStaff].totalCommissionReturn += Number(order.commission_amount) || 0;
      }
      stats[idStaff].totalCostProduct += costProduct;
      stats[idStaff].totalPostage += postage;
      stats[idStaff].totalUnitBundle += unitBundle;

      // Count by platform
      if (platform === 'Facebook') {
        stats[idStaff].salesFB += sale;
        if (isOrderCollected(order)) stats[idStaff].collectionFB += sale;
        stats[idStaff].costProductFB += costProduct;
        stats[idStaff].postageFB += postage;
        stats[idStaff].unitBundleFB += unitBundle;
      } else if (platform === 'Database') {
        stats[idStaff].salesDatabase += sale;
        if (isOrderCollected(order)) stats[idStaff].collectionDatabase += sale;
        stats[idStaff].costProductDatabase += costProduct;
        stats[idStaff].postageDatabase += postage;
        stats[idStaff].unitBundleDatabase += unitBundle;
      } else if (platform === 'Threads') {
        stats[idStaff].salesThreads += sale;
        if (isOrderCollected(order)) stats[idStaff].collectionThreads += sale;
        stats[idStaff].costProductThreads += costProduct;
        stats[idStaff].postageThreads += postage;
        stats[idStaff].unitBundleThreads += unitBundle;
      } else if (platform === 'Tiktok') {
        stats[idStaff].salesTiktok += sale;
        if (isOrderCollected(order)) stats[idStaff].collectionTiktok += sale;
        stats[idStaff].costProductTiktok += costProduct;
        stats[idStaff].postageTiktok += postage;
        stats[idStaff].unitBundleTiktok += unitBundle;
      } else if (platform === 'Google') {
        stats[idStaff].salesGoogle += sale;
        if (isOrderCollected(order)) stats[idStaff].collectionGoogle += sale;
        stats[idStaff].costProductGoogle += costProduct;
        stats[idStaff].postageGoogle += postage;
        stats[idStaff].unitBundleGoogle += unitBundle;
      }
    });

    // Process spends
    filteredSpends.forEach(spend => {
      const idStaff = spend.marketer_id_staff;
      if (!idStaff) return;

      const amount = Number(spend.total_spend) || 0;
      const name = profiles[idStaff] || idStaff;

      initStats(idStaff, name);

      stats[idStaff].totalSpend += amount;

      // Count spend by platform - default to Facebook if no platform set
      const platform = spend.jenis_platform || 'Facebook';
      if (platform === 'Facebook') {
        stats[idStaff].spendFB += amount;
      } else if (platform === 'Database') {
        stats[idStaff].spendDatabase += amount;
      } else if (platform === 'Threads') {
        stats[idStaff].spendThreads += amount;
      } else if (platform === 'Tiktok') {
        stats[idStaff].spendTiktok += amount;
      } else if (platform === 'Google') {
        stats[idStaff].spendGoogle += amount;
      }
    });

    // ROAS + a per-staff Profit used only by the Komisyen Team table below.
    // This stays on a Sales basis (Sales − Spend − Cost Product − Postage) and does
    // NOT deduct company Expenses — those are HQ overhead, not attributable to one
    // marketer — so commission payouts are unchanged by the Expenses feature.
    Object.values(stats).forEach(stat => {
      stat.roas = stat.totalSpend > 0 ? stat.totalSales / stat.totalSpend : 0;
      stat.profit = stat.totalSales - stat.totalSpend - stat.totalCostProduct - stat.totalPostage;
    });

    // Convert to array and sort by total sales (highest first)
    return Object.values(stats).sort((a, b) => b.totalSales - a.totalSales);
  }, [filteredOrders, filteredSpends, profiles]);

  const filteredStats = marketerStats;

  // Calculate totals
  const totals = useMemo(() => {
    const base = filteredStats.reduce(
      (acc, stat) => ({
        totalSales: acc.totalSales + stat.totalSales,
        totalCollection: acc.totalCollection + stat.totalCollection,
        totalReturn: acc.totalReturn + stat.totalReturn,
        returnFB: acc.returnFB + stat.returnFB, returnDatabase: acc.returnDatabase + stat.returnDatabase,
        returnThreads: acc.returnThreads + stat.returnThreads, returnTiktok: acc.returnTiktok + stat.returnTiktok, returnGoogle: acc.returnGoogle + stat.returnGoogle,
        totalSpend: acc.totalSpend + stat.totalSpend,
        totalCostProduct: acc.totalCostProduct + stat.totalCostProduct,
        totalPostage: acc.totalPostage + stat.totalPostage,
        totalUnitBundle: acc.totalUnitBundle + stat.totalUnitBundle,
        salesFB: acc.salesFB + stat.salesFB, collectionFB: acc.collectionFB + stat.collectionFB,
        spendFB: acc.spendFB + stat.spendFB, costProductFB: acc.costProductFB + stat.costProductFB, postageFB: acc.postageFB + stat.postageFB, unitBundleFB: acc.unitBundleFB + stat.unitBundleFB,
        salesDatabase: acc.salesDatabase + stat.salesDatabase, collectionDatabase: acc.collectionDatabase + stat.collectionDatabase,
        spendDatabase: acc.spendDatabase + stat.spendDatabase, costProductDatabase: acc.costProductDatabase + stat.costProductDatabase, postageDatabase: acc.postageDatabase + stat.postageDatabase, unitBundleDatabase: acc.unitBundleDatabase + stat.unitBundleDatabase,
        salesThreads: acc.salesThreads + stat.salesThreads, collectionThreads: acc.collectionThreads + stat.collectionThreads,
        spendThreads: acc.spendThreads + stat.spendThreads, costProductThreads: acc.costProductThreads + stat.costProductThreads, postageThreads: acc.postageThreads + stat.postageThreads, unitBundleThreads: acc.unitBundleThreads + stat.unitBundleThreads,
        salesTiktok: acc.salesTiktok + stat.salesTiktok, collectionTiktok: acc.collectionTiktok + stat.collectionTiktok,
        spendTiktok: acc.spendTiktok + stat.spendTiktok, costProductTiktok: acc.costProductTiktok + stat.costProductTiktok, postageTiktok: acc.postageTiktok + stat.postageTiktok, unitBundleTiktok: acc.unitBundleTiktok + stat.unitBundleTiktok,
        salesGoogle: acc.salesGoogle + stat.salesGoogle, collectionGoogle: acc.collectionGoogle + stat.collectionGoogle,
        spendGoogle: acc.spendGoogle + stat.spendGoogle, costProductGoogle: acc.costProductGoogle + stat.costProductGoogle, postageGoogle: acc.postageGoogle + stat.postageGoogle, unitBundleGoogle: acc.unitBundleGoogle + stat.unitBundleGoogle,
      }),
      {
        totalSales: 0, totalCollection: 0,
        totalReturn: 0, returnFB: 0, returnDatabase: 0, returnThreads: 0, returnTiktok: 0, returnGoogle: 0,
        totalSpend: 0, totalCostProduct: 0, totalPostage: 0, totalUnitBundle: 0,
        salesFB: 0, collectionFB: 0, spendFB: 0, costProductFB: 0, postageFB: 0, unitBundleFB: 0,
        salesDatabase: 0, collectionDatabase: 0, spendDatabase: 0, costProductDatabase: 0, postageDatabase: 0, unitBundleDatabase: 0,
        salesThreads: 0, collectionThreads: 0, spendThreads: 0, costProductThreads: 0, postageThreads: 0, unitBundleThreads: 0,
        salesTiktok: 0, collectionTiktok: 0, spendTiktok: 0, costProductTiktok: 0, postageTiktok: 0, unitBundleTiktok: 0,
        salesGoogle: 0, collectionGoogle: 0, spendGoogle: 0, costProductGoogle: 0, postageGoogle: 0, unitBundleGoogle: 0,
      }
    );

    const roas = base.totalSpend > 0 ? base.totalSales / base.totalSpend : 0;
    // Two profit figures, both net of company Expenses:
    //   By Sales      = Sales − Return − Cost Product − Postage − Spend − Expenses
    //   By Collection = Collection − Cost Product − Postage − Spend − Expenses
    // (Collection already excludes returns, so Return isn't subtracted again there.)
    const profitBySales = base.totalSales - base.totalReturn - base.totalCostProduct - base.totalPostage - base.totalSpend - expenseStats.total;
    const profitByCollection = base.totalCollection - base.totalCostProduct - base.totalPostage - base.totalSpend - expenseStats.total;

    return { ...base, roas, profitBySales, profitByCollection };
  }, [filteredStats, expenseStats]);

  // Platform totals with BOTH profit figures + that platform's Expenses slice.
  const platformTotals = useMemo(() => {
    const build = (
      sales: number, collection: number, ret: number, spend: number,
      costProduct: number, postage: number, unitBundle: number, expense: number,
    ) => ({
      sales, collection, spend, costProduct, postage, unitBundle, expense,
      roas: spend > 0 ? sales / spend : 0,
      profitBySales: sales - ret - costProduct - postage - spend - expense,
      profitByCollection: collection - costProduct - postage - spend - expense,
    });
    const ex = expenseStats.byPlatform;
    return {
      facebook: build(totals.salesFB, totals.collectionFB, totals.returnFB, totals.spendFB, totals.costProductFB, totals.postageFB, totals.unitBundleFB, ex.Facebook),
      database: build(totals.salesDatabase, totals.collectionDatabase, totals.returnDatabase, totals.spendDatabase, totals.costProductDatabase, totals.postageDatabase, totals.unitBundleDatabase, ex.Database),
      threads: build(totals.salesThreads, totals.collectionThreads, totals.returnThreads, totals.spendThreads, totals.costProductThreads, totals.postageThreads, totals.unitBundleThreads, ex.Threads),
      tiktok: build(totals.salesTiktok, totals.collectionTiktok, totals.returnTiktok, totals.spendTiktok, totals.costProductTiktok, totals.postageTiktok, totals.unitBundleTiktok, ex.Tiktok),
      google: build(totals.salesGoogle, totals.collectionGoogle, totals.returnGoogle, totals.spendGoogle, totals.costProductGoogle, totals.postageGoogle, totals.unitBundleGoogle, ex.Google),
    };
  }, [totals, expenseStats]);

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-MY', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
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
            <TrendingUp className="w-6 h-6" />
            Report Profit
          </h1>
          <p className="text-muted-foreground mt-1">Profit analysis by marketer (including Return orders)</p>
        </div>
      </div>

      {/* Date Filter */}
      <div className="stat-card">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-5 h-5" />
            <span className="font-medium text-foreground">Date Range:</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="space-y-1">
              <Label htmlFor="startDate" className="text-xs text-muted-foreground">From</Label>
              <Input
                id="startDate"
                type="date"
                value={pendingStart}
                onChange={(e) => setPendingStart(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endDate" className="text-xs text-muted-foreground">To</Label>
              <Input
                id="endDate"
                type="date"
                value={pendingEnd}
                onChange={(e) => setPendingEnd(e.target.value)}
                className="w-40"
              />
            </div>
            <Button onClick={applyFilter} disabled={isLoading} size="sm" className="h-9">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Filter className="w-4 h-4 mr-1" />}
              Filter
            </Button>
            {!isMarketer && <TeamFilter value={teamFilter} onChange={setTeamFilter} />}

          </div>
        </div>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="stat-card border-l-4 border-l-blue-500">
          <div className="flex items-center gap-1 text-muted-foreground text-xs uppercase mb-1">
            <DollarSign className="w-3 h-3" />
            Total Sales
          </div>
          <div className="text-lg font-bold text-blue-600">RM {formatNumber(totals.totalSales)}</div>
        </div>
        <div className="stat-card border-l-4 border-l-green-500">
          <div className="flex items-center gap-1 text-muted-foreground text-xs uppercase mb-1">
            <DollarSign className="w-3 h-3" />
            Total Collection
          </div>
          <div className="text-lg font-bold text-green-600">RM {formatNumber(totals.totalCollection)}</div>
        </div>
        <div className="stat-card border-l-4 border-l-amber-500">
          <div className="flex items-center gap-1 text-muted-foreground text-xs uppercase mb-1">
            <Package className="w-3 h-3" />
            Total Unit
          </div>
          <div className="text-lg font-bold text-amber-600">{totals.totalUnitBundle}</div>
        </div>
        <div className="stat-card border-l-4 border-l-rose-500">
          <div className="flex items-center gap-1 text-muted-foreground text-xs uppercase mb-1">
            <RotateCcw className="w-3 h-3" />
            Return
          </div>
          <div className="text-lg font-bold text-rose-600">RM {formatNumber(totals.totalReturn)}</div>
        </div>
        <div className="stat-card border-l-4 border-l-red-500">
          <div className="flex items-center gap-1 text-muted-foreground text-xs uppercase mb-1">
            <DollarSign className="w-3 h-3" />
            Total Spend
          </div>
          <div className="text-lg font-bold text-red-600">RM {formatNumber(totals.totalSpend)}</div>
        </div>
        <div className="stat-card border-l-4 border-l-purple-500">
          <div className="flex items-center gap-1 text-muted-foreground text-xs uppercase mb-1">
            <Package className="w-3 h-3" />
            Cost Product
          </div>
          <div className="text-lg font-bold text-purple-600">RM {formatNumber(totals.totalCostProduct)}</div>
        </div>
        <div className="stat-card border-l-4 border-l-orange-500">
          <div className="flex items-center gap-1 text-muted-foreground text-xs uppercase mb-1">
            <Truck className="w-3 h-3" />
            Postage
          </div>
          <div className="text-lg font-bold text-orange-600">RM {formatNumber(totals.totalPostage)}</div>
        </div>
        <div className="stat-card border-l-4 border-l-amber-500">
          <div className="flex items-center gap-1 text-muted-foreground text-xs uppercase mb-1">
            <TrendingUp className="w-3 h-3" />
            ROAS
          </div>
          <div className="text-lg font-bold text-amber-600">{totals.roas.toFixed(2)}x</div>
        </div>
        <div className="stat-card border-l-4 border-l-slate-500">
          <div className="flex items-center gap-1 text-muted-foreground text-xs uppercase mb-1">
            <Wallet className="w-3 h-3" />
            Expenses
          </div>
          <div className="text-lg font-bold text-slate-600">RM {formatNumber(expenseStats.total)}</div>
        </div>
        <div className={`stat-card border-l-4 ${totals.profitBySales >= 0 ? 'border-l-green-500' : 'border-l-red-500'}`}>
          <div className="flex items-center gap-1 text-muted-foreground text-xs uppercase mb-1">
            <DollarSign className="w-3 h-3" />
            Profit By Sales
          </div>
          <div className={`text-lg font-bold ${totals.profitBySales >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            RM {formatNumber(totals.profitBySales)}
          </div>
        </div>
        <div className={`stat-card border-l-4 ${totals.profitByCollection >= 0 ? 'border-l-green-500' : 'border-l-red-500'}`}>
          <div className="flex items-center gap-1 text-muted-foreground text-xs uppercase mb-1">
            <DollarSign className="w-3 h-3" />
            Profit By Collection
          </div>
          <div className={`text-lg font-bold ${totals.profitByCollection >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            RM {formatNumber(totals.profitByCollection)}
          </div>
        </div>
      </div>

      {/* Profit By Platform */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Profit By Platform</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Facebook */}
          <div className="stat-card bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 text-blue-600 font-semibold mb-3">
              <Facebook className="w-5 h-5" />
              FACEBOOK
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sales:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.facebook.sales)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Collection:</span>
                <span className="font-semibold text-green-600">RM {formatNumber(platformTotals.facebook.collection)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Spend:</span>
                <span className="font-semibold text-red-600">RM {formatNumber(platformTotals.facebook.spend)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cost Product:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.facebook.costProduct)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Postage:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.facebook.postage)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit:</span>
                <span className="font-semibold text-amber-600">{platformTotals.facebook.unitBundle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ROAS:</span>
                <span className="font-semibold text-amber-600">{platformTotals.facebook.roas.toFixed(2)}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expenses:</span>
                <span className="font-semibold text-slate-600">RM {formatNumber(platformTotals.facebook.expense)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-blue-200 dark:border-blue-800">
                <span className="font-semibold">Profit By Sales:</span>
                <span className={`font-bold ${platformTotals.facebook.profitBySales >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  RM {formatNumber(platformTotals.facebook.profitBySales)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Profit By Collection:</span>
                <span className={`font-bold ${platformTotals.facebook.profitByCollection >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  RM {formatNumber(platformTotals.facebook.profitByCollection)}
                </span>
              </div>
            </div>
          </div>

          {/* Tiktok */}
          <div className="stat-card bg-pink-50/50 dark:bg-pink-950/20 border border-pink-200 dark:border-pink-800">
            <div className="flex items-center gap-2 text-pink-600 font-semibold mb-3">
              <Video className="w-5 h-5" />
              TIKTOK
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sales:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.tiktok.sales)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Collection:</span>
                <span className="font-semibold text-green-600">RM {formatNumber(platformTotals.tiktok.collection)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Spend:</span>
                <span className="font-semibold text-red-600">RM {formatNumber(platformTotals.tiktok.spend)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cost Product:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.tiktok.costProduct)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Postage:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.tiktok.postage)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit:</span>
                <span className="font-semibold text-amber-600">{platformTotals.tiktok.unitBundle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ROAS:</span>
                <span className="font-semibold text-amber-600">{platformTotals.tiktok.roas.toFixed(2)}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expenses:</span>
                <span className="font-semibold text-slate-600">RM {formatNumber(platformTotals.tiktok.expense)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-pink-200 dark:border-pink-800">
                <span className="font-semibold">Profit By Sales:</span>
                <span className={`font-bold ${platformTotals.tiktok.profitBySales >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  RM {formatNumber(platformTotals.tiktok.profitBySales)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Profit By Collection:</span>
                <span className={`font-bold ${platformTotals.tiktok.profitByCollection >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  RM {formatNumber(platformTotals.tiktok.profitByCollection)}
                </span>
              </div>
            </div>
          </div>

          {/* Threads */}
          <div className="stat-card bg-slate-50/50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-600 font-semibold mb-3">
              <ShoppingBag className="w-5 h-5" />
              THREADS
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sales:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.threads.sales)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Collection:</span>
                <span className="font-semibold text-green-600">RM {formatNumber(platformTotals.threads.collection)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Spend:</span>
                <span className="font-semibold text-red-600">RM {formatNumber(platformTotals.threads.spend)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cost Product:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.threads.costProduct)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Postage:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.threads.postage)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit:</span>
                <span className="font-semibold text-amber-600">{platformTotals.threads.unitBundle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ROAS:</span>
                <span className="font-semibold text-amber-600">{platformTotals.threads.roas.toFixed(2)}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expenses:</span>
                <span className="font-semibold text-slate-600">RM {formatNumber(platformTotals.threads.expense)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="font-semibold">Profit By Sales:</span>
                <span className={`font-bold ${platformTotals.threads.profitBySales >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  RM {formatNumber(platformTotals.threads.profitBySales)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Profit By Collection:</span>
                <span className={`font-bold ${platformTotals.threads.profitByCollection >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  RM {formatNumber(platformTotals.threads.profitByCollection)}
                </span>
              </div>
            </div>
          </div>

          {/* Database */}
          <div className="stat-card bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 text-purple-600 font-semibold mb-3">
              <Database className="w-5 h-5" />
              DATABASE
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sales:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.database.sales)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Collection:</span>
                <span className="font-semibold text-green-600">RM {formatNumber(platformTotals.database.collection)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Spend:</span>
                <span className="font-semibold text-red-600">RM {formatNumber(platformTotals.database.spend)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cost Product:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.database.costProduct)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Postage:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.database.postage)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit:</span>
                <span className="font-semibold text-amber-600">{platformTotals.database.unitBundle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ROAS:</span>
                <span className="font-semibold text-amber-600">{platformTotals.database.roas.toFixed(2)}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expenses:</span>
                <span className="font-semibold text-slate-600">RM {formatNumber(platformTotals.database.expense)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-purple-200 dark:border-purple-800">
                <span className="font-semibold">Profit By Sales:</span>
                <span className={`font-bold ${platformTotals.database.profitBySales >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  RM {formatNumber(platformTotals.database.profitBySales)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Profit By Collection:</span>
                <span className={`font-bold ${platformTotals.database.profitByCollection >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  RM {formatNumber(platformTotals.database.profitByCollection)}
                </span>
              </div>
            </div>
          </div>

          {/* Google */}
          <div className="stat-card bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-600 font-semibold mb-3">
              <Globe className="w-5 h-5" />
              GOOGLE
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sales:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.google.sales)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Collection:</span>
                <span className="font-semibold text-green-600">RM {formatNumber(platformTotals.google.collection)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Spend:</span>
                <span className="font-semibold text-red-600">RM {formatNumber(platformTotals.google.spend)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cost Product:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.google.costProduct)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Postage:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.google.postage)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit:</span>
                <span className="font-semibold text-amber-600">{platformTotals.google.unitBundle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ROAS:</span>
                <span className="font-semibold text-amber-600">{platformTotals.google.roas.toFixed(2)}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expenses:</span>
                <span className="font-semibold text-slate-600">RM {formatNumber(platformTotals.google.expense)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-red-200 dark:border-red-800">
                <span className="font-semibold">Profit By Sales:</span>
                <span className={`font-bold ${platformTotals.google.profitBySales >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  RM {formatNumber(platformTotals.google.profitBySales)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">Profit By Collection:</span>
                <span className={`font-bold ${platformTotals.google.profitByCollection >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  RM {formatNumber(platformTotals.google.profitByCollection)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Per-staff profit breakdown — same metrics as the platform cards, per staff.
          Profit figures here exclude company Expenses (not attributable per staff). */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Profit Team</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left">ID Staff</th>
                <th className="p-3 text-left">Nama</th>
                <th className="p-3 text-right">Sales</th>
                <th className="p-3 text-right text-green-600 dark:text-green-400">Collection</th>
                <th className="p-3 text-right text-red-600 dark:text-red-400">Spend</th>
                <th className="p-3 text-right">Cost Product</th>
                <th className="p-3 text-right">Postage</th>
                <th className="p-3 text-right text-amber-600 dark:text-amber-400">ROAS</th>
                <th className="p-3 text-right">Profit By Sales</th>
                <th className="p-3 text-right">Profit By Collection</th>
              </tr>
            </thead>
            <tbody>
              {filteredStats.map((s) => {
                const nama = nameByIdstaff.get(s.idStaff) || (s.name !== s.idStaff ? s.name : (s.idStaff === 'HQ' ? 'HQ' : s.idStaff));
                const pbs = s.totalSales - s.totalReturn - s.totalCostProduct - s.totalPostage - s.totalSpend;
                const pbc = s.totalCollection - s.totalCostProduct - s.totalPostage - s.totalSpend;
                return (
                  <tr key={s.idStaff} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3 font-mono">{s.idStaff}</td>
                    <td className="p-3">{nama}</td>
                    <td className="p-3 text-right tabular-nums">RM {formatNumber(s.totalSales)}</td>
                    <td className="p-3 text-right tabular-nums text-green-600 dark:text-green-400">RM {formatNumber(s.totalCollection)}</td>
                    <td className="p-3 text-right tabular-nums text-red-600 dark:text-red-400">RM {formatNumber(s.totalSpend)}</td>
                    <td className="p-3 text-right tabular-nums">RM {formatNumber(s.totalCostProduct)}</td>
                    <td className="p-3 text-right tabular-nums">RM {formatNumber(s.totalPostage)}</td>
                    <td className="p-3 text-right tabular-nums text-amber-600 dark:text-amber-400">{(s.roas || 0).toFixed(2)}x</td>
                    <td className={`p-3 text-right tabular-nums font-medium ${pbs >= 0 ? 'text-green-600' : 'text-red-600'}`}>RM {formatNumber(pbs)}</td>
                    <td className={`p-3 text-right tabular-nums font-medium ${pbc >= 0 ? 'text-green-600' : 'text-red-600'}`}>RM {formatNumber(pbc)}</td>
                  </tr>
                );
              })}
              {filteredStats.length === 0 && (
                <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Tiada data untuk tempoh ini.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AccountReportProfit;
