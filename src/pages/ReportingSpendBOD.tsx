import React, { useState, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Search, Loader2, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { parseISO, isWithinInterval } from 'date-fns';
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth } from '@/lib/utils';

interface Order {
  id: string;
  marketer_id_staff: string;
  date_order: string;
  total_sale: number;
  jenis_platform: string;
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

interface MarketerSpendStats {
  idStaff: string;
  name: string;
  totalSales: number;
  totalSpend: number;
  roas: number;
  totalLead: number;
  // Facebook
  salesFB: number;
  spendFB: number;
  roasFB: number;
  // Database
  salesDatabase: number;
  spendDatabase: number;
  roasDatabase: number;
  // Shopee
  salesShopee: number;
  spendShopee: number;
  roasShopee: number;
  // Tiktok
  salesTiktok: number;
  spendTiktok: number;
  roasTiktok: number;
  // Google
  salesGoogle: number;
  spendGoogle: number;
  roasGoogle: number;
}

const ReportingSpendBOD: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [spends, setSpends] = useState<Spend[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Date filter state - default to current month (Malaysia timezone)
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch all data
  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoading(true);
      try {
        const [ordersRes, spendsRes, profilesRes] = await Promise.all([
          (supabase as any)
            .from('customer_purchases')
            .select('id, marketer_id_staff, date_order, total_sale, jenis_platform')
            .order('created_at', { ascending: false }),
          (supabase as any)
            .from('spends')
            .select('id, marketer_id_staff, jenis_platform, total_spend, tarikh_spend')
            .order('created_at', { ascending: false }),
          (supabase as any)
            .from('profiles')
            .select('idstaff, full_name'),
        ]);

        if (ordersRes.error) throw ordersRes.error;
        if (spendsRes.error) throw spendsRes.error;
        if (profilesRes.error) throw profilesRes.error;

        setOrders(ordersRes.data || []);
        setSpends(spendsRes.data || []);

        // Create a mapping of idstaff to full_name
        const profileMap: Record<string, string> = {};
        (profilesRes.data || []).forEach((p: Profile) => {
          if (p.idstaff) {
            profileMap[p.idstaff] = p.full_name || p.idstaff;
          }
        });
        setProfiles(profileMap);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllData();
  }, []);

  // Filter orders by date range
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (!order.date_order) return false;
      try {
        const orderDate = parseISO(order.date_order);
        return isWithinInterval(orderDate, {
          start: parseISO(startDate),
          end: parseISO(endDate)
        });
      } catch {
        return false;
      }
    });
  }, [orders, startDate, endDate]);

  // Filter spends by date range
  const filteredSpends = useMemo(() => {
    return spends.filter(spend => {
      if (!spend.tarikh_spend) return false;
      try {
        const spendDate = parseISO(spend.tarikh_spend);
        return isWithinInterval(spendDate, {
          start: parseISO(startDate),
          end: parseISO(endDate)
        });
      } catch {
        return false;
      }
    });
  }, [spends, startDate, endDate]);

  // Calculate stats by marketer
  const marketerStats = useMemo(() => {
    const stats: Record<string, MarketerSpendStats> = {};

    // Process orders (sales)
    filteredOrders.forEach(order => {
      const idStaff = order.marketer_id_staff;
      if (!idStaff) return;

      const name = profiles[idStaff] || idStaff;
      const amount = Number(order.total_sale) || 0;

      if (!stats[idStaff]) {
        stats[idStaff] = {
          idStaff,
          name,
          totalSales: 0,
          totalSpend: 0,
          roas: 0,
          totalLead: 0,
          salesFB: 0, spendFB: 0, roasFB: 0,
          salesDatabase: 0, spendDatabase: 0, roasDatabase: 0,
          salesShopee: 0, spendShopee: 0, roasShopee: 0,
          salesTiktok: 0, spendTiktok: 0, roasTiktok: 0,
          salesGoogle: 0, spendGoogle: 0, roasGoogle: 0,
        };
      }

      stats[idStaff].totalSales += amount;
      stats[idStaff].totalLead += 1;

      // Count sales by platform
      const platform = order.jenis_platform;
      if (platform === 'Facebook') {
        stats[idStaff].salesFB += amount;
      } else if (platform === 'Database') {
        stats[idStaff].salesDatabase += amount;
      } else if (platform === 'Shopee') {
        stats[idStaff].salesShopee += amount;
      } else if (platform === 'Tiktok') {
        stats[idStaff].salesTiktok += amount;
      } else if (platform === 'Google') {
        stats[idStaff].salesGoogle += amount;
      }
    });

    // Process spends
    filteredSpends.forEach(spend => {
      const idStaff = spend.marketer_id_staff;
      if (!idStaff) return;

      const amount = Number(spend.total_spend) || 0;
      const name = profiles[idStaff] || idStaff;

      // Initialize if not exists (marketer has spend but no sales)
      if (!stats[idStaff]) {
        stats[idStaff] = {
          idStaff,
          name,
          totalSales: 0,
          totalSpend: 0,
          roas: 0,
          totalLead: 0,
          salesFB: 0, spendFB: 0, roasFB: 0,
          salesDatabase: 0, spendDatabase: 0, roasDatabase: 0,
          salesShopee: 0, spendShopee: 0, roasShopee: 0,
          salesTiktok: 0, spendTiktok: 0, roasTiktok: 0,
          salesGoogle: 0, spendGoogle: 0, roasGoogle: 0,
        };
      }

      stats[idStaff].totalSpend += amount;

      // Count spend by platform
      const platform = spend.jenis_platform;
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

    // Calculate ROAS
    Object.values(stats).forEach(stat => {
      stat.roas = stat.totalSpend > 0 ? stat.totalSales / stat.totalSpend : 0;
      stat.roasFB = stat.spendFB > 0 ? stat.salesFB / stat.spendFB : 0;
      stat.roasDatabase = stat.spendDatabase > 0 ? stat.salesDatabase / stat.spendDatabase : 0;
      stat.roasShopee = stat.spendShopee > 0 ? stat.salesShopee / stat.spendShopee : 0;
      stat.roasTiktok = stat.spendTiktok > 0 ? stat.salesTiktok / stat.spendTiktok : 0;
      stat.roasGoogle = stat.spendGoogle > 0 ? stat.salesGoogle / stat.spendGoogle : 0;
    });

    // Convert to array and sort by total sales (highest first)
    return Object.values(stats).sort((a, b) => b.totalSales - a.totalSales);
  }, [filteredOrders, filteredSpends, profiles]);

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
    return filteredStats.reduce(
      (acc, stat) => ({
        totalSales: acc.totalSales + stat.totalSales,
        totalSpend: acc.totalSpend + stat.totalSpend,
        totalLead: acc.totalLead + stat.totalLead,
        salesFB: acc.salesFB + stat.salesFB,
        spendFB: acc.spendFB + stat.spendFB,
        salesDatabase: acc.salesDatabase + stat.salesDatabase,
        spendDatabase: acc.spendDatabase + stat.spendDatabase,
        salesShopee: acc.salesShopee + stat.salesShopee,
        spendShopee: acc.spendShopee + stat.spendShopee,
        salesTiktok: acc.salesTiktok + stat.salesTiktok,
        spendTiktok: acc.spendTiktok + stat.spendTiktok,
        salesGoogle: acc.salesGoogle + stat.salesGoogle,
        spendGoogle: acc.spendGoogle + stat.spendGoogle,
      }),
      {
        totalSales: 0,
        totalSpend: 0,
        totalLead: 0,
        salesFB: 0,
        spendFB: 0,
        salesDatabase: 0,
        spendDatabase: 0,
        salesShopee: 0,
        spendShopee: 0,
        salesTiktok: 0,
        spendTiktok: 0,
        salesGoogle: 0,
        spendGoogle: 0,
      }
    );
  }, [filteredStats]);

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
            <BarChart3 className="w-6 h-6" />
            Reporting Spend
          </h1>
          <p className="text-muted-foreground mt-1">Spend & Sales summary by marketer</p>
        </div>
      </div>

      {/* Date Filter */}
      <div className="stat-card">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-5 h-5" />
            <span className="font-medium text-foreground">Date Range:</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="space-y-1">
              <Label htmlFor="startDate" className="text-xs text-muted-foreground">From</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endDate" className="text-xs text-muted-foreground">To</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>
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

      {/* Spend Report Table */}
      <div className="form-section">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Spend Report by Marketer
        </h2>

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full min-w-[1800px] border-collapse">
            <thead className="bg-muted">
              <tr>
                <th rowSpan={2} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap border-r">ID STAFF</th>
                <th rowSpan={2} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap border-r">NAME</th>
                <th rowSpan={2} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap border-r">TOTAL SALES</th>
                <th rowSpan={2} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap border-r">TOTAL SPEND</th>
                <th rowSpan={2} className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap border-r">ROAS</th>
                <th rowSpan={2} className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap border-r">LEAD</th>
                <th colSpan={3} className="px-3 py-2 text-center text-xs font-semibold text-blue-600 uppercase tracking-wider whitespace-nowrap border-r bg-blue-50 dark:bg-blue-950/30">FACEBOOK</th>
                <th colSpan={3} className="px-3 py-2 text-center text-xs font-semibold text-purple-600 uppercase tracking-wider whitespace-nowrap border-r bg-purple-50 dark:bg-purple-950/30">DATABASE</th>
                <th colSpan={3} className="px-3 py-2 text-center text-xs font-semibold text-orange-600 uppercase tracking-wider whitespace-nowrap border-r bg-orange-50 dark:bg-orange-950/30">SHOPEE</th>
                <th colSpan={3} className="px-3 py-2 text-center text-xs font-semibold text-pink-600 uppercase tracking-wider whitespace-nowrap border-r bg-pink-50 dark:bg-pink-950/30">TIKTOK</th>
                <th colSpan={3} className="px-3 py-2 text-center text-xs font-semibold text-red-600 uppercase tracking-wider whitespace-nowrap bg-red-50 dark:bg-red-950/30">GOOGLE</th>
              </tr>
              <tr>
                {/* Facebook */}
                <th className="px-2 py-1 text-right text-[10px] font-medium text-blue-600 whitespace-nowrap bg-blue-50 dark:bg-blue-950/30">Sales</th>
                <th className="px-2 py-1 text-right text-[10px] font-medium text-blue-600 whitespace-nowrap bg-blue-50 dark:bg-blue-950/30">Spend</th>
                <th className="px-2 py-1 text-center text-[10px] font-medium text-blue-600 whitespace-nowrap border-r bg-blue-50 dark:bg-blue-950/30">ROAS</th>
                {/* Database */}
                <th className="px-2 py-1 text-right text-[10px] font-medium text-purple-600 whitespace-nowrap bg-purple-50 dark:bg-purple-950/30">Sales</th>
                <th className="px-2 py-1 text-right text-[10px] font-medium text-purple-600 whitespace-nowrap bg-purple-50 dark:bg-purple-950/30">Spend</th>
                <th className="px-2 py-1 text-center text-[10px] font-medium text-purple-600 whitespace-nowrap border-r bg-purple-50 dark:bg-purple-950/30">ROAS</th>
                {/* Shopee */}
                <th className="px-2 py-1 text-right text-[10px] font-medium text-orange-600 whitespace-nowrap bg-orange-50 dark:bg-orange-950/30">Sales</th>
                <th className="px-2 py-1 text-right text-[10px] font-medium text-orange-600 whitespace-nowrap bg-orange-50 dark:bg-orange-950/30">Spend</th>
                <th className="px-2 py-1 text-center text-[10px] font-medium text-orange-600 whitespace-nowrap border-r bg-orange-50 dark:bg-orange-950/30">ROAS</th>
                {/* Tiktok */}
                <th className="px-2 py-1 text-right text-[10px] font-medium text-pink-600 whitespace-nowrap bg-pink-50 dark:bg-pink-950/30">Sales</th>
                <th className="px-2 py-1 text-right text-[10px] font-medium text-pink-600 whitespace-nowrap bg-pink-50 dark:bg-pink-950/30">Spend</th>
                <th className="px-2 py-1 text-center text-[10px] font-medium text-pink-600 whitespace-nowrap border-r bg-pink-50 dark:bg-pink-950/30">ROAS</th>
                {/* Google */}
                <th className="px-2 py-1 text-right text-[10px] font-medium text-red-600 whitespace-nowrap bg-red-50 dark:bg-red-950/30">Sales</th>
                <th className="px-2 py-1 text-right text-[10px] font-medium text-red-600 whitespace-nowrap bg-red-50 dark:bg-red-950/30">Spend</th>
                <th className="px-2 py-1 text-center text-[10px] font-medium text-red-600 whitespace-nowrap bg-red-50 dark:bg-red-950/30">ROAS</th>
              </tr>
            </thead>
            <tbody className="bg-background divide-y divide-border">
              {filteredStats.map((stat) => (
                <tr key={stat.idStaff} className="hover:bg-muted/50 transition-colors">
                  <td className="px-3 py-2 text-sm font-medium whitespace-nowrap border-r">{stat.idStaff}</td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap border-r">{stat.name}</td>
                  <td className="px-3 py-2 text-sm text-right font-semibold text-success whitespace-nowrap border-r">{formatNumber(stat.totalSales)}</td>
                  <td className="px-3 py-2 text-sm text-right font-semibold text-warning whitespace-nowrap border-r">{formatNumber(stat.totalSpend)}</td>
                  <td className="px-3 py-2 text-sm text-center font-bold text-primary whitespace-nowrap border-r">{stat.roas.toFixed(2)}x</td>
                  <td className="px-3 py-2 text-sm text-center whitespace-nowrap border-r">{stat.totalLead}</td>
                  {/* Facebook */}
                  <td className="px-2 py-2 text-xs text-right text-blue-600 whitespace-nowrap bg-blue-50/50 dark:bg-blue-950/20">{formatNumber(stat.salesFB)}</td>
                  <td className="px-2 py-2 text-xs text-right text-blue-600 whitespace-nowrap bg-blue-50/50 dark:bg-blue-950/20">{formatNumber(stat.spendFB)}</td>
                  <td className="px-2 py-2 text-xs text-center font-medium text-blue-600 whitespace-nowrap border-r bg-blue-50/50 dark:bg-blue-950/20">{stat.roasFB.toFixed(2)}x</td>
                  {/* Database */}
                  <td className="px-2 py-2 text-xs text-right text-purple-600 whitespace-nowrap bg-purple-50/50 dark:bg-purple-950/20">{formatNumber(stat.salesDatabase)}</td>
                  <td className="px-2 py-2 text-xs text-right text-purple-600 whitespace-nowrap bg-purple-50/50 dark:bg-purple-950/20">{formatNumber(stat.spendDatabase)}</td>
                  <td className="px-2 py-2 text-xs text-center font-medium text-purple-600 whitespace-nowrap border-r bg-purple-50/50 dark:bg-purple-950/20">{stat.roasDatabase.toFixed(2)}x</td>
                  {/* Shopee */}
                  <td className="px-2 py-2 text-xs text-right text-orange-600 whitespace-nowrap bg-orange-50/50 dark:bg-orange-950/20">{formatNumber(stat.salesShopee)}</td>
                  <td className="px-2 py-2 text-xs text-right text-orange-600 whitespace-nowrap bg-orange-50/50 dark:bg-orange-950/20">{formatNumber(stat.spendShopee)}</td>
                  <td className="px-2 py-2 text-xs text-center font-medium text-orange-600 whitespace-nowrap border-r bg-orange-50/50 dark:bg-orange-950/20">{stat.roasShopee.toFixed(2)}x</td>
                  {/* Tiktok */}
                  <td className="px-2 py-2 text-xs text-right text-pink-600 whitespace-nowrap bg-pink-50/50 dark:bg-pink-950/20">{formatNumber(stat.salesTiktok)}</td>
                  <td className="px-2 py-2 text-xs text-right text-pink-600 whitespace-nowrap bg-pink-50/50 dark:bg-pink-950/20">{formatNumber(stat.spendTiktok)}</td>
                  <td className="px-2 py-2 text-xs text-center font-medium text-pink-600 whitespace-nowrap border-r bg-pink-50/50 dark:bg-pink-950/20">{stat.roasTiktok.toFixed(2)}x</td>
                  {/* Google */}
                  <td className="px-2 py-2 text-xs text-right text-red-600 whitespace-nowrap bg-red-50/50 dark:bg-red-950/20">{formatNumber(stat.salesGoogle)}</td>
                  <td className="px-2 py-2 text-xs text-right text-red-600 whitespace-nowrap bg-red-50/50 dark:bg-red-950/20">{formatNumber(stat.spendGoogle)}</td>
                  <td className="px-2 py-2 text-xs text-center font-medium text-red-600 whitespace-nowrap bg-red-50/50 dark:bg-red-950/20">{stat.roasGoogle.toFixed(2)}x</td>
                </tr>
              ))}
              {filteredStats.length === 0 && (
                <tr>
                  <td colSpan={21} className="px-4 py-8 text-center text-muted-foreground">
                    No marketers found for the selected date range
                  </td>
                </tr>
              )}
            </tbody>
            {filteredStats.length > 0 && (
              <tfoot className="bg-muted/70">
                <tr className="font-semibold">
                  <td className="px-3 py-2 text-sm whitespace-nowrap border-r">TOTAL</td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap border-r">{filteredStats.length} marketers</td>
                  <td className="px-3 py-2 text-sm text-right text-success whitespace-nowrap border-r">{formatNumber(totals.totalSales)}</td>
                  <td className="px-3 py-2 text-sm text-right text-warning whitespace-nowrap border-r">{formatNumber(totals.totalSpend)}</td>
                  <td className="px-3 py-2 text-sm text-center text-primary whitespace-nowrap border-r">
                    {(totals.totalSpend > 0 ? totals.totalSales / totals.totalSpend : 0).toFixed(2)}x
                  </td>
                  <td className="px-3 py-2 text-sm text-center whitespace-nowrap border-r">{totals.totalLead}</td>
                  {/* Facebook totals */}
                  <td className="px-2 py-2 text-xs text-right text-blue-600 whitespace-nowrap bg-blue-50/50 dark:bg-blue-950/20">{formatNumber(totals.salesFB)}</td>
                  <td className="px-2 py-2 text-xs text-right text-blue-600 whitespace-nowrap bg-blue-50/50 dark:bg-blue-950/20">{formatNumber(totals.spendFB)}</td>
                  <td className="px-2 py-2 text-xs text-center font-medium text-blue-600 whitespace-nowrap border-r bg-blue-50/50 dark:bg-blue-950/20">
                    {(totals.spendFB > 0 ? totals.salesFB / totals.spendFB : 0).toFixed(2)}x
                  </td>
                  {/* Database totals */}
                  <td className="px-2 py-2 text-xs text-right text-purple-600 whitespace-nowrap bg-purple-50/50 dark:bg-purple-950/20">{formatNumber(totals.salesDatabase)}</td>
                  <td className="px-2 py-2 text-xs text-right text-purple-600 whitespace-nowrap bg-purple-50/50 dark:bg-purple-950/20">{formatNumber(totals.spendDatabase)}</td>
                  <td className="px-2 py-2 text-xs text-center font-medium text-purple-600 whitespace-nowrap border-r bg-purple-50/50 dark:bg-purple-950/20">
                    {(totals.spendDatabase > 0 ? totals.salesDatabase / totals.spendDatabase : 0).toFixed(2)}x
                  </td>
                  {/* Shopee totals */}
                  <td className="px-2 py-2 text-xs text-right text-orange-600 whitespace-nowrap bg-orange-50/50 dark:bg-orange-950/20">{formatNumber(totals.salesShopee)}</td>
                  <td className="px-2 py-2 text-xs text-right text-orange-600 whitespace-nowrap bg-orange-50/50 dark:bg-orange-950/20">{formatNumber(totals.spendShopee)}</td>
                  <td className="px-2 py-2 text-xs text-center font-medium text-orange-600 whitespace-nowrap border-r bg-orange-50/50 dark:bg-orange-950/20">
                    {(totals.spendShopee > 0 ? totals.salesShopee / totals.spendShopee : 0).toFixed(2)}x
                  </td>
                  {/* Tiktok totals */}
                  <td className="px-2 py-2 text-xs text-right text-pink-600 whitespace-nowrap bg-pink-50/50 dark:bg-pink-950/20">{formatNumber(totals.salesTiktok)}</td>
                  <td className="px-2 py-2 text-xs text-right text-pink-600 whitespace-nowrap bg-pink-50/50 dark:bg-pink-950/20">{formatNumber(totals.spendTiktok)}</td>
                  <td className="px-2 py-2 text-xs text-center font-medium text-pink-600 whitespace-nowrap border-r bg-pink-50/50 dark:bg-pink-950/20">
                    {(totals.spendTiktok > 0 ? totals.salesTiktok / totals.spendTiktok : 0).toFixed(2)}x
                  </td>
                  {/* Google totals */}
                  <td className="px-2 py-2 text-xs text-right text-red-600 whitespace-nowrap bg-red-50/50 dark:bg-red-950/20">{formatNumber(totals.salesGoogle)}</td>
                  <td className="px-2 py-2 text-xs text-right text-red-600 whitespace-nowrap bg-red-50/50 dark:bg-red-950/20">{formatNumber(totals.spendGoogle)}</td>
                  <td className="px-2 py-2 text-xs text-center font-medium text-red-600 whitespace-nowrap bg-red-50/50 dark:bg-red-950/20">
                    {(totals.spendGoogle > 0 ? totals.salesGoogle / totals.spendGoogle : 0).toFixed(2)}x
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportingSpendBOD;
