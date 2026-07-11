import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Loader2, Filter, TrendingUp, DollarSign, Package, Truck, Globe, Video, ShoppingBag, Facebook, Database, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, fetchAllRows } from '@/lib/utils';
import { isOrderCollected } from '@/lib/utils';

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
  totalSpend: number;
  totalCostProduct: number;
  totalPostage: number;
  totalUnitBundle: number;
  roas: number;
  profit: number;
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

  // Date filter state - default to current month (Malaysia timezone)
  // pendingStart/End are what the user picks; startDate/endDate are applied on "Filter" click
  const [pendingStart, setPendingStart] = useState(getMalaysiaStartOfMonth());
  const [pendingEnd, setPendingEnd] = useState(getMalaysiaEndOfMonth());
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  const [pendingProfitBy, setPendingProfitBy] = useState<'sales' | 'collection'>('sales');
  const [profitBy, setProfitBy] = useState<'sales' | 'collection'>('sales');

  const applyFilter = () => {
    setStartDate(pendingStart);
    setEndDate(pendingEnd);
    setProfitBy(pendingProfitBy);
  };

  // Fetch profiles once on mount (small dataset)
  useEffect(() => {
    const fetchStaticData = async () => {
      try {
        const profilesRes = await (supabase as any)
          .from('profiles')
          .select('idstaff, full_name');

        if (profilesRes.error) throw profilesRes.error;

        const profileMap: Record<string, string> = {};
        (profilesRes.data || []).forEach((p: Profile) => {
          if (p.idstaff) {
            profileMap[p.idstaff] = p.full_name || p.idstaff;
          }
        });
        setProfiles(profileMap);
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

  const isLoading = ordersLoading || spendsLoading;

  // Orders already filtered by date at DB level
  const filteredOrders = allOrders;

  // Spends already filtered by date at DB level
  const filteredSpends = spends;

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
          totalSpend: 0,
          totalCostProduct: 0,
          totalPostage: 0,
          totalUnitBundle: 0,
          roas: 0,
          profit: 0,
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
      if (isOrderCollected(order)) {
        stats[idStaff].totalCollection += sale;
      }
      if (order.delivery_status === 'Return') {
        stats[idStaff].totalReturn += sale;
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

    // Calculate ROAS, Personal Expenses, and Profit for each marketer
    // profitBy dropdown: 'sales' uses totalSales, 'collection' uses totalCollection
    Object.values(stats).forEach(stat => {
      stat.roas = stat.totalSpend > 0 ? stat.totalSales / stat.totalSpend : 0;

      const revenue = profitBy === 'collection' ? stat.totalCollection : stat.totalSales;
      stat.profit = revenue - stat.totalSpend - stat.totalCostProduct - stat.totalPostage;

      // Platform profit uses same profitBy logic
      const revFB = profitBy === 'collection' ? stat.collectionFB : stat.salesFB;
      const revDB = profitBy === 'collection' ? stat.collectionDatabase : stat.salesDatabase;
      const revThreads = profitBy === 'collection' ? stat.collectionThreads : stat.salesThreads;
      const revTiktok = profitBy === 'collection' ? stat.collectionTiktok : stat.salesTiktok;
      const revGoogle = profitBy === 'collection' ? stat.collectionGoogle : stat.salesGoogle;

      stat.profitFB = revFB - stat.spendFB - stat.costProductFB - stat.postageFB;
      stat.profitDatabase = revDB - stat.spendDatabase - stat.costProductDatabase - stat.postageDatabase;
      stat.profitThreads = revThreads - stat.spendThreads - stat.costProductThreads - stat.postageThreads;
      stat.profitTiktok = revTiktok - stat.spendTiktok - stat.costProductTiktok - stat.postageTiktok;
      stat.profitGoogle = revGoogle - stat.spendGoogle - stat.costProductGoogle - stat.postageGoogle;
    });

    // Convert to array and sort by total sales (highest first)
    return Object.values(stats).sort((a, b) => b.totalSales - a.totalSales);
  }, [filteredOrders, filteredSpends, profiles, profitBy]);

  const filteredStats = marketerStats;

  // Calculate totals
  const totals = useMemo(() => {
    const base = filteredStats.reduce(
      (acc, stat) => ({
        totalSales: acc.totalSales + stat.totalSales,
        totalCollection: acc.totalCollection + stat.totalCollection,
        totalReturn: acc.totalReturn + stat.totalReturn,
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
        totalReturn: 0, totalSpend: 0, totalCostProduct: 0, totalPostage: 0, totalUnitBundle: 0,
        salesFB: 0, collectionFB: 0, spendFB: 0, costProductFB: 0, postageFB: 0, unitBundleFB: 0,
        salesDatabase: 0, collectionDatabase: 0, spendDatabase: 0, costProductDatabase: 0, postageDatabase: 0, unitBundleDatabase: 0,
        salesThreads: 0, collectionThreads: 0, spendThreads: 0, costProductThreads: 0, postageThreads: 0, unitBundleThreads: 0,
        salesTiktok: 0, collectionTiktok: 0, spendTiktok: 0, costProductTiktok: 0, postageTiktok: 0, unitBundleTiktok: 0,
        salesGoogle: 0, collectionGoogle: 0, spendGoogle: 0, costProductGoogle: 0, postageGoogle: 0, unitBundleGoogle: 0,
      }
    );

    const roas = base.totalSpend > 0 ? base.totalSales / base.totalSpend : 0;
    const revenue = profitBy === 'collection' ? base.totalCollection : base.totalSales;
    const profit = revenue - base.totalSpend - base.totalCostProduct - base.totalPostage;

    return { ...base, roas, profit };
  }, [filteredStats, profitBy]);

  // Platform totals with profit
  const platformTotals = useMemo(() => {
    const revFB = profitBy === 'collection' ? totals.collectionFB : totals.salesFB;
    const revDB = profitBy === 'collection' ? totals.collectionDatabase : totals.salesDatabase;
    const revThreads = profitBy === 'collection' ? totals.collectionThreads : totals.salesThreads;
    const revTiktok = profitBy === 'collection' ? totals.collectionTiktok : totals.salesTiktok;
    const revGoogle = profitBy === 'collection' ? totals.collectionGoogle : totals.salesGoogle;

    return {
      facebook: {
        sales: totals.salesFB,
        collection: totals.collectionFB,
        spend: totals.spendFB,
        costProduct: totals.costProductFB,
        postage: totals.postageFB,
        unitBundle: totals.unitBundleFB,
        roas: totals.spendFB > 0 ? totals.salesFB / totals.spendFB : 0,
        profit: revFB - totals.spendFB - totals.costProductFB - totals.postageFB,
      },
      database: {
        sales: totals.salesDatabase,
        collection: totals.collectionDatabase,
        spend: totals.spendDatabase,
        costProduct: totals.costProductDatabase,
        postage: totals.postageDatabase,
        unitBundle: totals.unitBundleDatabase,
        roas: totals.spendDatabase > 0 ? totals.salesDatabase / totals.spendDatabase : 0,
        profit: revDB - totals.spendDatabase - totals.costProductDatabase - totals.postageDatabase,
      },
      threads: {
        sales: totals.salesThreads,
        collection: totals.collectionThreads,
        spend: totals.spendThreads,
        costProduct: totals.costProductThreads,
        postage: totals.postageThreads,
        unitBundle: totals.unitBundleThreads,
        roas: totals.spendThreads > 0 ? totals.salesThreads / totals.spendThreads : 0,
        profit: revThreads - totals.spendThreads - totals.costProductThreads - totals.postageThreads,
      },
      tiktok: {
        sales: totals.salesTiktok,
        collection: totals.collectionTiktok,
        spend: totals.spendTiktok,
        costProduct: totals.costProductTiktok,
        postage: totals.postageTiktok,
        unitBundle: totals.unitBundleTiktok,
        roas: totals.spendTiktok > 0 ? totals.salesTiktok / totals.spendTiktok : 0,
        profit: revTiktok - totals.spendTiktok - totals.costProductTiktok - totals.postageTiktok,
      },
      google: {
        sales: totals.salesGoogle,
        collection: totals.collectionGoogle,
        spend: totals.spendGoogle,
        costProduct: totals.costProductGoogle,
        postage: totals.postageGoogle,
        unitBundle: totals.unitBundleGoogle,
        roas: totals.spendGoogle > 0 ? totals.salesGoogle / totals.spendGoogle : 0,
        profit: revGoogle - totals.spendGoogle - totals.costProductGoogle - totals.postageGoogle,
      },
    };
  }, [totals, profitBy]);

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
            <Select value={pendingProfitBy} onValueChange={(v: 'sales' | 'collection') => setPendingProfitBy(v)}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">Profit by Sales</SelectItem>
                <SelectItem value="collection">Profit by Collection</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={applyFilter} disabled={isLoading} size="sm" className="h-9">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Filter className="w-4 h-4 mr-1" />}
              Filter
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
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
            Total Unit Bundle
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
        <div className={`stat-card border-l-4 ${totals.profit >= 0 ? 'border-l-green-500' : 'border-l-red-500'}`}>
          <div className="flex items-center gap-1 text-muted-foreground text-xs uppercase mb-1">
            <DollarSign className="w-3 h-3" />
            Profit
          </div>
          <div className={`text-lg font-bold ${totals.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            RM {formatNumber(totals.profit)}
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
                <span className="text-muted-foreground">Unit Bundle:</span>
                <span className="font-semibold text-amber-600">{platformTotals.facebook.unitBundle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ROAS:</span>
                <span className="font-semibold text-amber-600">{platformTotals.facebook.roas.toFixed(2)}x</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-blue-200 dark:border-blue-800">
                <span className="font-semibold">Profit:</span>
                <span className={`font-bold ${platformTotals.facebook.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  RM {formatNumber(platformTotals.facebook.profit)}
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
                <span className="text-muted-foreground">Unit Bundle:</span>
                <span className="font-semibold text-amber-600">{platformTotals.tiktok.unitBundle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ROAS:</span>
                <span className="font-semibold text-amber-600">{platformTotals.tiktok.roas.toFixed(2)}x</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-pink-200 dark:border-pink-800">
                <span className="font-semibold">Profit:</span>
                <span className={`font-bold ${platformTotals.tiktok.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  RM {formatNumber(platformTotals.tiktok.profit)}
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
                <span className="text-muted-foreground">Unit Bundle:</span>
                <span className="font-semibold text-amber-600">{platformTotals.threads.unitBundle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ROAS:</span>
                <span className="font-semibold text-amber-600">{platformTotals.threads.roas.toFixed(2)}x</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="font-semibold">Profit:</span>
                <span className={`font-bold ${platformTotals.threads.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  RM {formatNumber(platformTotals.threads.profit)}
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
                <span className="text-muted-foreground">Unit Bundle:</span>
                <span className="font-semibold text-amber-600">{platformTotals.database.unitBundle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ROAS:</span>
                <span className="font-semibold text-amber-600">{platformTotals.database.roas.toFixed(2)}x</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-purple-200 dark:border-purple-800">
                <span className="font-semibold">Profit:</span>
                <span className={`font-bold ${platformTotals.database.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  RM {formatNumber(platformTotals.database.profit)}
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
                <span className="text-muted-foreground">Unit Bundle:</span>
                <span className="font-semibold text-amber-600">{platformTotals.google.unitBundle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ROAS:</span>
                <span className="font-semibold text-amber-600">{platformTotals.google.roas.toFixed(2)}x</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-red-200 dark:border-red-800">
                <span className="font-semibold">Profit:</span>
                <span className={`font-bold ${platformTotals.google.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  RM {formatNumber(platformTotals.google.profit)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountReportProfit;
