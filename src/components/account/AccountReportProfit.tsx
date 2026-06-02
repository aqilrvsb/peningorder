import React, { useState, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Search, Loader2, Filter, TrendingUp, DollarSign, Package, Truck, CreditCard, Globe, Video, ShoppingBag, Facebook, Database, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { parseISO, isWithinInterval, startOfMonth, endOfMonth, format } from 'date-fns';
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, fetchAllRows } from '@/lib/utils';

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

interface Expense {
  id: string;
  type: 'VAR' | 'FIX';
  role: 'company' | 'personal';
  marketer_id_staff: string | null;
  description: string;
  total: number;
  date: string;
  platform: string | null;
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
  personalExpenses: number;
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
  // Shopee
  salesShopee: number;
  collectionShopee: number;
  spendShopee: number;
  costProductShopee: number;
  postageShopee: number;
  unitBundleShopee: number;
  profitShopee: number;
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
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [spends, setSpends] = useState<Spend[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Date filter state - default to current month (Malaysia timezone)
  // pendingStart/End are what the user picks; startDate/endDate are applied on "Filter" click
  const [pendingStart, setPendingStart] = useState(getMalaysiaStartOfMonth());
  const [pendingEnd, setPendingEnd] = useState(getMalaysiaEndOfMonth());
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingProfitBy, setPendingProfitBy] = useState<'sales' | 'collection'>('sales');
  const [pendingCogsBy, setPendingCogsBy] = useState<'base_cost' | 'hq_cost'>('base_cost');
  const [profitBy, setProfitBy] = useState<'sales' | 'collection'>('sales');
  const [cogsBy, setCogsBy] = useState<'base_cost' | 'hq_cost'>('base_cost');

  const applyFilter = () => {
    setStartDate(pendingStart);
    setEndDate(pendingEnd);
    setProfitBy(pendingProfitBy);
    setCogsBy(pendingCogsBy);
  };

  // Fetch profiles and expenses once on mount (small datasets)
  useEffect(() => {
    const fetchStaticData = async () => {
      try {
        const [expensesRes, profilesRes] = await Promise.all([
          (supabase as any)
            .from('expenses')
            .select('id, type, role, marketer_id_staff, description, total, date, platform')
            .order('date', { ascending: false }),
          (supabase as any)
            .from('profiles')
            .select('idstaff, full_name'),
        ]);

        if (expensesRes.error) throw expensesRes.error;
        if (profilesRes.error) throw profilesRes.error;

        setExpenses(expensesRes.data || []);

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

  // Fetch orders and spends filtered by date range using pagination to bypass server row limits
  useEffect(() => {
    const fetchDateData = async () => {
      setIsLoading(true);
      try {
        const [ordersData, spendsData] = await Promise.all([
          fetchAllRows(() =>
            (supabase as any)
              .from('customer_purchases')
              .select('*, bundle:logistic_bundles(name, sku)')
              .gte('date_order', startDate)
              .lte('date_order', endDate)
              .order('created_at', { ascending: false })
          ),
          fetchAllRows(() =>
            (supabase as any)
              .from('spends')
              .select('id, marketer_id_staff, jenis_platform, total_spend, tarikh_spend')
              .gte('tarikh_spend', startDate)
              .lte('tarikh_spend', endDate)
              .order('created_at', { ascending: false })
          ),
        ]);

        setAllOrders(ordersData);
        setSpends(spendsData);
      } catch (error) {
        console.error('Error fetching date data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDateData();
  }, [startDate, endDate]);

  // Orders already filtered by date at DB level
  const filteredOrders = allOrders;

  // Spends already filtered by date at DB level
  const filteredSpends = spends;

  // Filter VAR expenses by date range (one-time expenses)
  const filteredVarExpenses = useMemo(() => {
    return expenses.filter(expense => {
      if (!expense.date || expense.type !== 'VAR') return false;
      try {
        const expenseDate = parseISO(expense.date);
        return isWithinInterval(expenseDate, {
          start: parseISO(startDate),
          end: parseISO(endDate)
        });
      } catch {
        return false;
      }
    });
  }, [expenses, startDate, endDate]);

  // Calculate FIX expenses (monthly recurring) - multiply by months in range
  const calculateFixExpenseTotal = useMemo(() => {
    const fixExpenses = expenses.filter(e => e.type === 'FIX');
    const start = new Date(startDate);
    const end = new Date(endDate);

    let companyFixTotal = 0;
    const personalFixMap: Record<string, number> = {};

    fixExpenses.forEach(expense => {
      const expenseDate = new Date(expense.date);

      // Only count if expense date is before or within the range
      if (expenseDate <= end) {
        // Start counting from the later of: expense date or start date
        const countStart = expenseDate > start ? expenseDate : start;

        // Calculate months between countStart and end
        const startYear = countStart.getFullYear();
        const startMonth = countStart.getMonth();
        const endYear = end.getFullYear();
        const endMonth = end.getMonth();

        const monthsDiff = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;

        if (monthsDiff > 0) {
          const totalForPeriod = (Number(expense.total) || 0) * monthsDiff;

          if (!expense.role || expense.role === 'company') {
            companyFixTotal += totalForPeriod;
          } else if (expense.role === 'personal' && expense.marketer_id_staff) {
            personalFixMap[expense.marketer_id_staff] = (personalFixMap[expense.marketer_id_staff] || 0) + totalForPeriod;
          }
        }
      }
    });

    return { companyFixTotal, personalFixMap };
  }, [expenses, startDate, endDate]);

  // Calculate total expenses (VAR and FIX) - COMPANY ONLY
  const totalExpenses = useMemo(() => {
    // VAR expenses (one-time) - company only
    const companyVarExpenses = filteredVarExpenses.filter(e => !e.role || e.role === 'company');
    const varTotal = companyVarExpenses.reduce((sum, e) => sum + (Number(e.total) || 0), 0);

    // FIX expenses (monthly) - already calculated with months multiplier
    const fixTotal = calculateFixExpenseTotal.companyFixTotal;

    return { var: varTotal, fix: fixTotal, total: varTotal + fixTotal };
  }, [filteredVarExpenses, calculateFixExpenseTotal]);

  // Calculate company expenses by platform (from expenses table platform field)
  const expensesByPlatform = useMemo(() => {
    const platformMap: Record<string, number> = { facebook: 0, tiktok: 0, shopee: 0, database: 0, google: 0 };

    // Helper to normalize platform string to key
    const normalizePlatform = (p: string | null): string | null => {
      if (!p) return null;
      const lower = p.toLowerCase();
      if (lower === 'facebook') return 'facebook';
      if (lower === 'tiktok') return 'tiktok';
      if (lower === 'shopee') return 'shopee';
      if (lower === 'database') return 'database';
      if (lower === 'google') return 'google';
      return null;
    };

    // VAR company expenses with platform
    filteredVarExpenses
      .filter(e => !e.role || e.role === 'company')
      .forEach(e => {
        const key = normalizePlatform(e.platform);
        if (key) platformMap[key] += Number(e.total) || 0;
      });

    // FIX company expenses with platform - multiply by months in range
    const fixExpenses = expenses.filter(e => e.type === 'FIX' && (!e.role || e.role === 'company'));
    const start = new Date(startDate);
    const end = new Date(endDate);

    fixExpenses.forEach(expense => {
      const key = normalizePlatform(expense.platform);
      if (!key) return;

      const expenseDate = new Date(expense.date);
      if (expenseDate <= end) {
        const countStart = expenseDate > start ? expenseDate : start;
        const monthsDiff = (end.getFullYear() - countStart.getFullYear()) * 12 + (end.getMonth() - countStart.getMonth()) + 1;
        if (monthsDiff > 0) {
          platformMap[key] += (Number(expense.total) || 0) * monthsDiff;
        }
      }
    });

    return platformMap;
  }, [filteredVarExpenses, expenses, startDate, endDate]);

  // Calculate personal expenses by marketer
  const personalExpensesByMarketer = useMemo(() => {
    const expenseMap: Record<string, number> = {};

    // Add VAR expenses (one-time)
    filteredVarExpenses
      .filter(e => e.role === 'personal' && e.marketer_id_staff)
      .forEach(e => {
        const idStaff = e.marketer_id_staff!;
        expenseMap[idStaff] = (expenseMap[idStaff] || 0) + (Number(e.total) || 0);
      });

    // Add FIX expenses (monthly - already calculated with months multiplier)
    Object.entries(calculateFixExpenseTotal.personalFixMap).forEach(([idStaff, total]) => {
      expenseMap[idStaff] = (expenseMap[idStaff] || 0) + total;
    });

    return expenseMap;
  }, [filteredVarExpenses, calculateFixExpenseTotal]);

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
          personalExpenses: 0,
          roas: 0,
          profit: 0,
          salesFB: 0, collectionFB: 0, spendFB: 0, costProductFB: 0, postageFB: 0, unitBundleFB: 0, profitFB: 0,
          salesDatabase: 0, collectionDatabase: 0, spendDatabase: 0, costProductDatabase: 0, postageDatabase: 0, unitBundleDatabase: 0, profitDatabase: 0,
          salesShopee: 0, collectionShopee: 0, spendShopee: 0, costProductShopee: 0, postageShopee: 0, unitBundleShopee: 0, profitShopee: 0,
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
      const isMarketplace = platform === 'Shopee' || platform === 'Tiktok';

      // Cost product uses base_cost or hq_cost based on dropdown
      const costProduct = cogsBy === 'hq_cost'
        ? (Number(order.cost_hq) || 0)
        : (Number(order.cost_baseproduct) || 0);
      const postage = isMarketplace
        ? Math.abs(Number(order.cost_postage) || 0)
        : (Number(order.cost_postage) || 0);

      // Unit Bundle = order.unit × first SKU number (e.g., "GSI-4 + ..." → 4)
      const skuMatch = order.bundle?.sku?.match(/-(\d+)/);
      const firstSkuQty = skuMatch ? parseInt(skuMatch[1], 10) : 0;
      const unitBundle = (Number(order.unit) || 0) * firstSkuQty;

      initStats(idStaff, name);

      stats[idStaff].totalSales += sale;
      if (order.seo === 'Successful Delivery') {
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
        if (order.seo === 'Successful Delivery') stats[idStaff].collectionFB += sale;
        stats[idStaff].costProductFB += costProduct;
        stats[idStaff].postageFB += postage;
        stats[idStaff].unitBundleFB += unitBundle;
      } else if (platform === 'Database') {
        stats[idStaff].salesDatabase += sale;
        if (order.seo === 'Successful Delivery') stats[idStaff].collectionDatabase += sale;
        stats[idStaff].costProductDatabase += costProduct;
        stats[idStaff].postageDatabase += postage;
        stats[idStaff].unitBundleDatabase += unitBundle;
      } else if (platform === 'Shopee') {
        stats[idStaff].salesShopee += sale;
        if (order.seo === 'Successful Delivery') stats[idStaff].collectionShopee += sale;
        stats[idStaff].costProductShopee += costProduct;
        stats[idStaff].postageShopee += postage;
        stats[idStaff].unitBundleShopee += unitBundle;
      } else if (platform === 'Tiktok') {
        stats[idStaff].salesTiktok += sale;
        if (order.seo === 'Successful Delivery') stats[idStaff].collectionTiktok += sale;
        stats[idStaff].costProductTiktok += costProduct;
        stats[idStaff].postageTiktok += postage;
        stats[idStaff].unitBundleTiktok += unitBundle;
      } else if (platform === 'Google') {
        stats[idStaff].salesGoogle += sale;
        if (order.seo === 'Successful Delivery') stats[idStaff].collectionGoogle += sale;
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
      } else if (platform === 'Shopee') {
        stats[idStaff].spendShopee += amount;
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
      stat.personalExpenses = personalExpensesByMarketer[stat.idStaff] || 0;

      const revenue = profitBy === 'collection' ? stat.totalCollection : stat.totalSales;
      stat.profit = revenue - stat.totalSpend - stat.totalCostProduct - stat.totalPostage - stat.personalExpenses;

      // Platform profit uses same profitBy logic
      const revFB = profitBy === 'collection' ? stat.collectionFB : stat.salesFB;
      const revDB = profitBy === 'collection' ? stat.collectionDatabase : stat.salesDatabase;
      const revShopee = profitBy === 'collection' ? stat.collectionShopee : stat.salesShopee;
      const revTiktok = profitBy === 'collection' ? stat.collectionTiktok : stat.salesTiktok;
      const revGoogle = profitBy === 'collection' ? stat.collectionGoogle : stat.salesGoogle;

      stat.profitFB = revFB - stat.spendFB - stat.costProductFB - stat.postageFB;
      stat.profitDatabase = revDB - stat.spendDatabase - stat.costProductDatabase - stat.postageDatabase;
      stat.profitShopee = revShopee - stat.costProductShopee - stat.postageShopee;
      stat.profitTiktok = revTiktok - stat.costProductTiktok - stat.postageTiktok;
      stat.profitGoogle = revGoogle - stat.spendGoogle - stat.costProductGoogle - stat.postageGoogle;
    });

    // Convert to array and sort by total sales (highest first)
    return Object.values(stats).sort((a, b) => b.totalSales - a.totalSales);
  }, [filteredOrders, filteredSpends, profiles, personalExpensesByMarketer, profitBy, cogsBy]);

  // Filter by search term
  const filteredStats = useMemo(() => {
    if (!searchTerm) return marketerStats;
    const term = searchTerm.toLowerCase();
    return marketerStats.filter(stat =>
      stat.idStaff.toLowerCase().includes(term) ||
      stat.name.toLowerCase().includes(term)
    );
  }, [marketerStats, searchTerm]);

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
        salesShopee: acc.salesShopee + stat.salesShopee, collectionShopee: acc.collectionShopee + stat.collectionShopee,
        spendShopee: acc.spendShopee + stat.spendShopee, costProductShopee: acc.costProductShopee + stat.costProductShopee, postageShopee: acc.postageShopee + stat.postageShopee, unitBundleShopee: acc.unitBundleShopee + stat.unitBundleShopee,
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
        salesShopee: 0, collectionShopee: 0, spendShopee: 0, costProductShopee: 0, postageShopee: 0, unitBundleShopee: 0,
        salesTiktok: 0, collectionTiktok: 0, spendTiktok: 0, costProductTiktok: 0, postageTiktok: 0, unitBundleTiktok: 0,
        salesGoogle: 0, collectionGoogle: 0, spendGoogle: 0, costProductGoogle: 0, postageGoogle: 0, unitBundleGoogle: 0,
      }
    );

    const roas = base.totalSpend > 0 ? base.totalSales / base.totalSpend : 0;
    const revenue = profitBy === 'collection' ? base.totalCollection : base.totalSales;
    const profit = revenue - base.totalSpend - base.totalCostProduct - base.totalPostage - totalExpenses.total;

    return { ...base, roas, profit };
  }, [filteredStats, totalExpenses, profitBy]);

  // Platform totals with profit (including expenses per platform)
  const platformTotals = useMemo(() => {
    const revFB = profitBy === 'collection' ? totals.collectionFB : totals.salesFB;
    const revDB = profitBy === 'collection' ? totals.collectionDatabase : totals.salesDatabase;
    const revShopee = profitBy === 'collection' ? totals.collectionShopee : totals.salesShopee;
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
        expenses: expensesByPlatform.facebook,
        roas: totals.spendFB > 0 ? totals.salesFB / totals.spendFB : 0,
        profit: revFB - totals.spendFB - totals.costProductFB - totals.postageFB - expensesByPlatform.facebook,
      },
      database: {
        sales: totals.salesDatabase,
        collection: totals.collectionDatabase,
        spend: totals.spendDatabase,
        costProduct: totals.costProductDatabase,
        postage: totals.postageDatabase,
        unitBundle: totals.unitBundleDatabase,
        expenses: expensesByPlatform.database,
        roas: totals.spendDatabase > 0 ? totals.salesDatabase / totals.spendDatabase : 0,
        profit: revDB - totals.spendDatabase - totals.costProductDatabase - totals.postageDatabase - expensesByPlatform.database,
      },
      shopee: {
        sales: totals.salesShopee,
        collection: totals.collectionShopee,
        spend: totals.spendShopee,
        costProduct: totals.costProductShopee,
        postage: totals.postageShopee,
        unitBundle: totals.unitBundleShopee,
        expenses: expensesByPlatform.shopee,
        roas: totals.spendShopee > 0 ? totals.salesShopee / totals.spendShopee : 0,
        profit: revShopee - totals.costProductShopee - totals.postageShopee - expensesByPlatform.shopee,
      },
      tiktok: {
        sales: totals.salesTiktok,
        collection: totals.collectionTiktok,
        spend: totals.spendTiktok,
        costProduct: totals.costProductTiktok,
        postage: totals.postageTiktok,
        unitBundle: totals.unitBundleTiktok,
        expenses: expensesByPlatform.tiktok,
        roas: totals.spendTiktok > 0 ? totals.salesTiktok / totals.spendTiktok : 0,
        profit: revTiktok - totals.costProductTiktok - totals.postageTiktok - expensesByPlatform.tiktok,
      },
      google: {
        sales: totals.salesGoogle,
        collection: totals.collectionGoogle,
        spend: totals.spendGoogle,
        costProduct: totals.costProductGoogle,
        postage: totals.postageGoogle,
        unitBundle: totals.unitBundleGoogle,
        expenses: expensesByPlatform.google,
        roas: totals.spendGoogle > 0 ? totals.salesGoogle / totals.spendGoogle : 0,
        profit: revGoogle - totals.spendGoogle - totals.costProductGoogle - totals.postageGoogle - expensesByPlatform.google,
      },
    };
  }, [totals, expensesByPlatform, profitBy]);

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
            <Select value={pendingCogsBy} onValueChange={(v: 'base_cost' | 'hq_cost') => setPendingCogsBy(v)}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="base_cost">COGS: Base Cost</SelectItem>
                <SelectItem value="hq_cost">COGS: HQ Cost</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={applyFilter} disabled={isLoading} size="sm" className="h-9">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Filter className="w-4 h-4 mr-1" />}
              Filter
            </Button>
          </div>
          <div className="relative w-full md:w-64 md:ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search marketer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
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
        <div className="stat-card border-l-4 border-l-pink-500">
          <div className="flex items-center gap-1 text-muted-foreground text-xs uppercase mb-1">
            <CreditCard className="w-3 h-3" />
            Expenses (Company)
          </div>
          <div className="text-lg font-bold text-pink-600">RM {formatNumber(totalExpenses.total)}</div>
          <div className="text-[10px] text-muted-foreground">VAR: {formatNumber(totalExpenses.var)} | FIX: {formatNumber(totalExpenses.fix)}</div>
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
                <span className="text-muted-foreground">Expenses:</span>
                <span className="font-semibold text-pink-600">RM {formatNumber(platformTotals.facebook.expenses)}</span>
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
                <span className="text-muted-foreground">Expenses:</span>
                <span className="font-semibold text-pink-600">RM {formatNumber(platformTotals.tiktok.expenses)}</span>
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

          {/* Shopee */}
          <div className="stat-card bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2 text-orange-600 font-semibold mb-3">
              <ShoppingBag className="w-5 h-5" />
              SHOPEE
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sales:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.shopee.sales)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Collection:</span>
                <span className="font-semibold text-green-600">RM {formatNumber(platformTotals.shopee.collection)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Spend:</span>
                <span className="font-semibold text-red-600">RM {formatNumber(platformTotals.shopee.spend)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cost Product:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.shopee.costProduct)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Postage:</span>
                <span className="font-semibold">RM {formatNumber(platformTotals.shopee.postage)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expenses:</span>
                <span className="font-semibold text-pink-600">RM {formatNumber(platformTotals.shopee.expenses)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit Bundle:</span>
                <span className="font-semibold text-amber-600">{platformTotals.shopee.unitBundle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ROAS:</span>
                <span className="font-semibold text-amber-600">{platformTotals.shopee.roas.toFixed(2)}x</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-orange-200 dark:border-orange-800">
                <span className="font-semibold">Profit:</span>
                <span className={`font-bold ${platformTotals.shopee.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  RM {formatNumber(platformTotals.shopee.profit)}
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
                <span className="text-muted-foreground">Expenses:</span>
                <span className="font-semibold text-pink-600">RM {formatNumber(platformTotals.database.expenses)}</span>
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
                <span className="text-muted-foreground">Expenses:</span>
                <span className="font-semibold text-pink-600">RM {formatNumber(platformTotals.google.expenses)}</span>
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

      {/* Profit Report Table by Marketer */}
      <div className="form-section">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Profit Report by Marketer
        </h2>

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full min-w-[1500px] border-collapse">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap border-r">ID STAFF</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap border-r">NAME</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-blue-600 uppercase tracking-wider whitespace-nowrap border-r">SALES</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-green-600 uppercase tracking-wider whitespace-nowrap border-r">COLLECTION</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-rose-600 uppercase tracking-wider whitespace-nowrap border-r">RETURN</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-red-600 uppercase tracking-wider whitespace-nowrap border-r">SPEND</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-purple-600 uppercase tracking-wider whitespace-nowrap border-r">COST PRODUCT</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-orange-600 uppercase tracking-wider whitespace-nowrap border-r">POSTAGE</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-pink-600 uppercase tracking-wider whitespace-nowrap border-r">EXPENSES</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-amber-600 uppercase tracking-wider whitespace-nowrap border-r">UNIT BUNDLE</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-amber-600 uppercase tracking-wider whitespace-nowrap border-r">ROAS</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-green-600 uppercase tracking-wider whitespace-nowrap bg-green-50 dark:bg-green-950/30">PROFIT</th>
              </tr>
            </thead>
            <tbody className="bg-background divide-y divide-border">
              {filteredStats.map((stat) => {
                // Marketer profit includes personal expenses: Sales - Spend - Cost Product - Postage - Personal Expenses
                const marketerProfit = stat.totalSales - stat.totalSpend - stat.totalCostProduct - stat.totalPostage - stat.personalExpenses;

                return (
                  <tr key={stat.idStaff} className="hover:bg-muted/50 transition-colors">
                    <td className="px-3 py-2 text-sm font-medium whitespace-nowrap border-r">{stat.idStaff}</td>
                    <td className="px-3 py-2 text-sm whitespace-nowrap border-r">{stat.name}</td>
                    <td className="px-3 py-2 text-sm text-right font-semibold text-blue-600 whitespace-nowrap border-r">{formatNumber(stat.totalSales)}</td>
                    <td className="px-3 py-2 text-sm text-right font-semibold text-green-600 whitespace-nowrap border-r">{formatNumber(stat.totalCollection)}</td>
                    <td className="px-3 py-2 text-sm text-right font-semibold text-rose-600 whitespace-nowrap border-r">{formatNumber(stat.totalReturn)}</td>
                    <td className="px-3 py-2 text-sm text-right font-semibold text-red-600 whitespace-nowrap border-r">{formatNumber(stat.totalSpend)}</td>
                    <td className="px-3 py-2 text-sm text-right font-semibold text-purple-600 whitespace-nowrap border-r">{formatNumber(stat.totalCostProduct)}</td>
                    <td className="px-3 py-2 text-sm text-right font-semibold text-orange-600 whitespace-nowrap border-r">{formatNumber(stat.totalPostage)}</td>
                    <td className="px-3 py-2 text-sm text-right font-semibold text-pink-600 whitespace-nowrap border-r">{formatNumber(stat.personalExpenses)}</td>
                    <td className="px-3 py-2 text-sm text-right font-semibold text-amber-600 whitespace-nowrap border-r">{stat.totalUnitBundle}</td>
                    <td className="px-3 py-2 text-sm text-center font-bold text-amber-600 whitespace-nowrap border-r">{stat.roas.toFixed(2)}x</td>
                    <td className={`px-3 py-2 text-sm text-right font-bold whitespace-nowrap bg-green-50/50 dark:bg-green-950/20 ${marketerProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatNumber(marketerProfit)}
                    </td>
                  </tr>
                );
              })}
              {filteredStats.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    No marketers found for the selected date range
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AccountReportProfit;
