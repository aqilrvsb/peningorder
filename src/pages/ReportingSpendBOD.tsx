import React, { useState, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Search, Loader2, BarChart3, DollarSign, Users, TrendingUp, Globe, Phone, MessageSquare, FileText, Video, Play, ShoppingBag, Facebook, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { parseISO, isWithinInterval } from 'date-fns';
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth } from '@/lib/utils';

interface Order {
  id: string;
  marketer_id_staff: string;
  date_order: string;
  total_sale: number;
  jenis_platform: string;
  jenis_closing: string;
}

interface Spend {
  id: string;
  marketer_id_staff: string;
  jenis_platform: string;
  jenis_closing: string;
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

  // Fetch profiles once on mount
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('profiles')
          .select('idstaff, full_name');
        if (error) throw error;
        const profileMap: Record<string, string> = {};
        (data || []).forEach((p: Profile) => {
          if (p.idstaff) {
            profileMap[p.idstaff] = p.full_name || p.idstaff;
          }
        });
        setProfiles(profileMap);
      } catch (error) {
        console.error('Error fetching profiles:', error);
      }
    };
    fetchProfiles();
  }, []);

  // Fetch orders and spends filtered by date range (re-fetch when dates change)
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [ordersRes, spendsRes] = await Promise.all([
          (supabase as any)
            .from('customer_purchases')
            .select('*')
            .gte('date_order', startDate)
            .lte('date_order', endDate)
            .order('created_at', { ascending: false })
            .range(0, 49999),
          (supabase as any)
            .from('spends')
            .select('id, marketer_id_staff, jenis_platform, jenis_closing, total_spend, tarikh_spend')
            .gte('tarikh_spend', startDate)
            .lte('tarikh_spend', endDate)
            .order('created_at', { ascending: false })
            .range(0, 49999),
        ]);

        if (ordersRes.error) throw ordersRes.error;
        if (spendsRes.error) throw spendsRes.error;

        setOrders(ordersRes.data || []);
        setSpends(spendsRes.data || []);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [startDate, endDate]);

  // Data already filtered by date at DB level
  const filteredOrders = orders;
  const filteredSpends = spends;

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

  // Calculate overall summary stats
  const summaryStats = useMemo(() => {
    // By Jenis Closing from spends
    const spendByClosing = {
      website: 0,
      waBot: 0,
      manual: 0,
      call: 0,
      live: 0,
      begLead: 0,
    };

    // Calculate total spend by jenis_closing from filtered spends
    filteredSpends.forEach(spend => {
      const closing = spend.jenis_closing?.toLowerCase();
      const amount = Number(spend.total_spend) || 0;
      if (closing === 'website') spendByClosing.website += amount;
      else if (closing === 'wa bot') spendByClosing.waBot += amount;
      else if (closing === 'manual') spendByClosing.manual += amount;
      else if (closing === 'call') spendByClosing.call += amount;
      else if (closing === 'live') spendByClosing.live += amount;
      else if (closing === 'beg lead') spendByClosing.begLead += amount;
    });

    // Sales by jenis_closing from orders
    const salesByClosing = {
      website: 0,
      waBot: 0,
      manual: 0,
      call: 0,
      live: 0,
      begLead: 0,
    };

    filteredOrders.forEach(order => {
      const closing = order.jenis_closing?.toLowerCase();
      const amount = Number(order.total_sale) || 0;
      if (closing === 'website') salesByClosing.website += amount;
      else if (closing === 'wa bot') salesByClosing.waBot += amount;
      else if (closing === 'manual') salesByClosing.manual += amount;
      else if (closing === 'call') salesByClosing.call += amount;
      else if (closing === 'live') salesByClosing.live += amount;
      else if (closing === 'beg lead') salesByClosing.begLead += amount;
    });

    const totalSpendByClosing = spendByClosing.website + spendByClosing.waBot + spendByClosing.manual + spendByClosing.call + spendByClosing.live + spendByClosing.begLead;

    return {
      spendByClosing,
      salesByClosing,
      totalSpendByClosing,
    };
  }, [filteredSpends, filteredOrders]);

  // Calculate KPK (Kos Per Klik/Lead)
  const overallKPK = useMemo(() => {
    return totals.totalLead > 0 ? totals.totalSpend / totals.totalLead : 0;
  }, [totals]);

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

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card border-l-4 border-l-green-500">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase mb-1">
            <DollarSign className="w-4 h-4" />
            Total Spend
          </div>
          <div className="text-2xl font-bold text-green-600">RM {formatNumber(totals.totalSpend)}</div>
        </div>
        <div className="stat-card border-l-4 border-l-blue-500">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase mb-1">
            <Users className="w-4 h-4" />
            Total Leads
          </div>
          <div className="text-2xl font-bold text-blue-600">{totals.totalLead}</div>
        </div>
        <div className="stat-card border-l-4 border-l-purple-500">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase mb-1">
            <BarChart3 className="w-4 h-4" />
            Overall KPK
          </div>
          <div className="text-2xl font-bold text-purple-600">RM {formatNumber(overallKPK)}</div>
        </div>
        <div className="stat-card border-l-4 border-l-orange-500">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase mb-1">
            <TrendingUp className="w-4 h-4" />
            ROAS
          </div>
          <div className="text-2xl font-bold text-orange-600">
            {(totals.totalSpend > 0 ? totals.totalSales / totals.totalSpend : 0).toFixed(2)}x
          </div>
        </div>
      </div>

      {/* Spend By Platform */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Spend By Platform</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Facebook */}
          <div className="stat-card bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 text-blue-600 font-semibold mb-3">
              <Facebook className="w-5 h-5" />
              FACEBOOK
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Spend:</span>
                <span className="font-semibold text-blue-600">RM {formatNumber(totals.spendFB)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Sales:</span>
                <span className="font-semibold">RM {formatNumber(totals.salesFB)}</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
              <div className="text-xs font-semibold text-muted-foreground mb-2">JENIS CLOSING</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-green-600">Website</span><span>RM {formatNumber(summaryStats.salesByClosing.website)} ({totals.salesFB > 0 ? ((summaryStats.salesByClosing.website / totals.salesFB) * 100).toFixed(0) : 0}%)</span></div>
                <div className="flex justify-between"><span className="text-yellow-600">WA Bot</span><span>RM {formatNumber(summaryStats.salesByClosing.waBot)} ({totals.salesFB > 0 ? ((summaryStats.salesByClosing.waBot / totals.salesFB) * 100).toFixed(0) : 0}%)</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Manual</span><span>RM {formatNumber(summaryStats.salesByClosing.manual)} ({totals.salesFB > 0 ? ((summaryStats.salesByClosing.manual / totals.salesFB) * 100).toFixed(0) : 0}%)</span></div>
                <div className="flex justify-between"><span className="text-blue-600">Call</span><span>RM {formatNumber(summaryStats.salesByClosing.call)} ({totals.salesFB > 0 ? ((summaryStats.salesByClosing.call / totals.salesFB) * 100).toFixed(0) : 0}%)</span></div>
                <div className="flex justify-between"><span className="text-purple-600">Live</span><span>RM {formatNumber(summaryStats.salesByClosing.live)} ({totals.salesFB > 0 ? ((summaryStats.salesByClosing.live / totals.salesFB) * 100).toFixed(0) : 0}%)</span></div>
                <div className="flex justify-between"><span className="text-amber-600">Beg Lead</span><span>RM {formatNumber(summaryStats.salesByClosing.begLead)} ({totals.salesFB > 0 ? ((summaryStats.salesByClosing.begLead / totals.salesFB) * 100).toFixed(0) : 0}%)</span></div>
              </div>
            </div>
          </div>

          {/* Tiktok */}
          <div className="stat-card bg-pink-50/50 dark:bg-pink-950/20 border border-pink-200 dark:border-pink-800">
            <div className="flex items-center gap-2 text-pink-600 font-semibold mb-3">
              <Video className="w-5 h-5" />
              TIKTOK
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Spend:</span>
                <span className="font-semibold text-pink-600">RM {formatNumber(totals.spendTiktok)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Sales:</span>
                <span className="font-semibold">RM {formatNumber(totals.salesTiktok)}</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-pink-200 dark:border-pink-800">
              <div className="text-xs font-semibold text-muted-foreground mb-2">JENIS CLOSING</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-green-600">Website</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-yellow-600">WA Bot</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Manual</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-blue-600">Call</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-purple-600">Live</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-amber-600">Beg Lead</span><span>RM 0 (0%)</span></div>
              </div>
            </div>
          </div>

          {/* Shopee */}
          <div className="stat-card bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2 text-orange-600 font-semibold mb-3">
              <ShoppingBag className="w-5 h-5" />
              SHOPEE
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Spend:</span>
                <span className="font-semibold text-orange-600">RM {formatNumber(totals.spendShopee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Sales:</span>
                <span className="font-semibold">RM {formatNumber(totals.salesShopee)}</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-orange-200 dark:border-orange-800">
              <div className="text-xs font-semibold text-muted-foreground mb-2">JENIS CLOSING</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-green-600">Website</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-yellow-600">WA Bot</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Manual</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-blue-600">Call</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-purple-600">Live</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-amber-600">Beg Lead</span><span>RM 0 (0%)</span></div>
              </div>
            </div>
          </div>

          {/* Database */}
          <div className="stat-card bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 text-purple-600 font-semibold mb-3">
              <Database className="w-5 h-5" />
              DATABASE
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Spend:</span>
                <span className="font-semibold text-purple-600">RM {formatNumber(totals.spendDatabase)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Sales:</span>
                <span className="font-semibold">RM {formatNumber(totals.salesDatabase)}</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-800">
              <div className="text-xs font-semibold text-muted-foreground mb-2">JENIS CLOSING</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-green-600">Website</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-yellow-600">WA Bot</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Manual</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-blue-600">Call</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-purple-600">Live</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-amber-600">Beg Lead</span><span>RM 0 (0%)</span></div>
              </div>
            </div>
          </div>

          {/* Google */}
          <div className="stat-card bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-600 font-semibold mb-3">
              <Globe className="w-5 h-5" />
              GOOGLE
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Spend:</span>
                <span className="font-semibold text-red-600">RM {formatNumber(totals.spendGoogle)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Sales:</span>
                <span className="font-semibold">RM {formatNumber(totals.salesGoogle)}</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
              <div className="text-xs font-semibold text-muted-foreground mb-2">JENIS CLOSING</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-green-600">Website</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-yellow-600">WA Bot</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Manual</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-blue-600">Call</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-purple-600">Live</span><span>RM 0 (0%)</span></div>
                <div className="flex justify-between"><span className="text-amber-600">Beg Lead</span><span>RM 0 (0%)</span></div>
              </div>
            </div>
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
