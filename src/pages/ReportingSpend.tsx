import React, { useState, useMemo } from 'react';
import { useData } from '@/context/DataContext';
import { useBundles } from '@/context/BundleContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DollarSign, Users, TrendingUp, Target,
  RotateCcw, BarChart3, Percent, Loader2,
  Facebook, Video, ShoppingBag, Database, Globe,
  ClipboardList, Phone, Play, Store
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';

interface Spend {
  id: string;
  product: string; // Now stores SKU
  jenisPlatform: string;
  jenisClosing: string;
  totalSpend: number;
  tarikhSpend: string;
  marketerIdStaff: string;
  createdAt: string;
}

interface LogisticBundle {
  id: string;
  sku: string; // Bundle SKU format like "GSI-1 + SBN-2"
  name: string;
}

interface AggregatedSpend {
  product: string;
  platform: string;
  jenisClosing: string;
  totalSpend: number;
  totalSales: number;
  totalLeads: number;
  leadsClose: number;
  leadsNotClose: number;
  totalClosedPrice: number;
  kpk: string;
  roas: string;
  closingRate: string;
}

interface PlatformSpend {
  platform: string;
  totalSpend: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const ReportingSpend: React.FC = () => {
  const { prospects, orders } = useData();
  const { products } = useBundles();
  const { profile } = useAuth();
  const [spends, setSpends] = useState<Spend[]>([]);
  const [logisticBundles, setLogisticBundles] = useState<LogisticBundle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Check if current user is marketer (should only see their own data)
  const isMarketer = profile?.role === 'marketer';
  const userIdStaff = profile?.idstaff;

  // Create lookup map for bundle SKU by bundle ID
  const bundleSkuMap = useMemo(() => {
    const map = new Map<string, string>();
    logisticBundles.forEach(bundle => {
      map.set(bundle.id, bundle.sku);
    });
    return map;
  }, [logisticBundles]);

  // Helper function to check if bundle's FIRST SKU matches product SKU
  const bundleFirstSkuMatches = (bundleId: string, productSku: string): boolean => {
    const bundleSku = bundleSkuMap.get(bundleId);
    if (!bundleSku || !productSku) return false;
    // Bundle SKU format: "GSI-1 + SBN-2", product SKU: "GSI"
    // Only check the FIRST part of bundle SKU
    const firstPart = bundleSku.split('+')[0].trim();
    return firstPart.startsWith(productSku + '-') || firstPart === productSku;
  };

  // Fetch spends and logistic bundles data
  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch spends
      let spendsQuery = (supabase as any).from('spends').select('*').order('created_at', { ascending: false });

      // Marketers only see their own spends
      if (isMarketer && userIdStaff) {
        spendsQuery = spendsQuery.eq('marketer_id_staff', userIdStaff);
      }

      // Fetch logistic bundles for SKU lookup
      const bundlesQuery = (supabase as any).from('logistic_bundles').select('id, sku, name');

      const [spendsResult, bundlesResult] = await Promise.all([spendsQuery, bundlesQuery]);

      if (spendsResult.error) throw spendsResult.error;
      if (bundlesResult.error) throw bundlesResult.error;

      setSpends((spendsResult.data || []).map((d: any) => ({
        id: d.id,
        product: d.product, // Now stores SKU
        jenisPlatform: d.jenis_platform,
        jenisClosing: d.jenis_closing || '',
        totalSpend: parseFloat(d.total_spend) || 0,
        tarikhSpend: d.tarikh_spend,
        marketerIdStaff: d.marketer_id_staff || '',
        createdAt: d.created_at,
      })));

      setLogisticBundles((bundlesResult.data || []).map((d: any) => ({
        id: d.id,
        sku: d.sku || '',
        name: d.name || '',
      })));
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, [isMarketer, userIdStaff]);

  // Filter spends based on date range
  const filteredSpends = useMemo(() => {
    return spends.filter((spend) => {
      const spendDate = spend.tarikhSpend;
      const matchesStartDate = !startDate || (spendDate && spendDate >= startDate);
      const matchesEndDate = !endDate || (spendDate && spendDate <= endDate);
      return matchesStartDate && matchesEndDate;
    });
  }, [spends, startDate, endDate]);

  // Filter prospects based on same date range (tarikhPhoneNumber)
  const filteredProspects = useMemo(() => {
    return prospects.filter((prospect) => {
      const prospectDate = prospect.tarikhPhoneNumber;
      const matchesStartDate = !startDate || (prospectDate && prospectDate >= startDate);
      const matchesEndDate = !endDate || (prospectDate && prospectDate <= endDate);
      return matchesStartDate && matchesEndDate;
    });
  }, [prospects, startDate, endDate]);

  // Filter orders based on date range
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const orderDate = order.tarikhTempahan;
      const matchesStartDate = !startDate || (orderDate && orderDate >= startDate);
      const matchesEndDate = !endDate || (orderDate && orderDate <= endDate);
      return matchesStartDate && matchesEndDate;
    });
  }, [orders, startDate, endDate]);

  // Aggregate spends by platform with closing breakdown (from spends table)
  const platformStats = useMemo(() => {
    const platforms = ['Facebook', 'Tiktok', 'Shopee', 'Database', 'Google'];
    const platformIcons: Record<string, { icon: React.ReactNode; color: string; bgColor: string; headerColor: string }> = {
      'Facebook': { icon: <Facebook className="w-5 h-5" />, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800', headerColor: 'bg-blue-100 dark:bg-blue-900/50' },
      'Tiktok': { icon: <Video className="w-5 h-5" />, color: 'text-pink-600 dark:text-pink-400', bgColor: 'bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800', headerColor: 'bg-pink-100 dark:bg-pink-900/50' },
      'Shopee': { icon: <ShoppingBag className="w-5 h-5" />, color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800', headerColor: 'bg-orange-100 dark:bg-orange-900/50' },
      'Database': { icon: <Database className="w-5 h-5" />, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800', headerColor: 'bg-purple-100 dark:bg-purple-900/50' },
      'Google': { icon: <Globe className="w-5 h-5" />, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800', headerColor: 'bg-green-100 dark:bg-green-900/50' },
    };

    return platforms.map(platform => {
      // Get spends for this platform
      const platformSpends = filteredSpends.filter(s => s.jenisPlatform?.toLowerCase() === platform.toLowerCase());
      const totalSpend = platformSpends.reduce((sum, s) => sum + s.totalSpend, 0);

      // Get orders for this platform (for sales total)
      const platformOrders = filteredOrders.filter(o => o.jenisPlatform === platform);
      const totalSales = platformOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

      // Calculate closing breakdown from SPENDS (not orders)
      const closingBreakdown = {
        website: platformSpends.filter(s => s.jenisClosing === 'Website').reduce((sum, s) => sum + s.totalSpend, 0),
        whatsappBot: platformSpends.filter(s => s.jenisClosing === 'WhatsappBot').reduce((sum, s) => sum + s.totalSpend, 0),
        manual: platformSpends.filter(s => s.jenisClosing === 'Manual').reduce((sum, s) => sum + s.totalSpend, 0),
        call: platformSpends.filter(s => s.jenisClosing === 'Call').reduce((sum, s) => sum + s.totalSpend, 0),
        live: platformSpends.filter(s => s.jenisClosing === 'Live').reduce((sum, s) => sum + s.totalSpend, 0),
        shop: platformSpends.filter(s => s.jenisClosing === 'Shop').reduce((sum, s) => sum + s.totalSpend, 0),
      };

      // Calculate percentages based on spend
      const closingPct = {
        websitePct: totalSpend > 0 ? (closingBreakdown.website / totalSpend) * 100 : 0,
        whatsappBotPct: totalSpend > 0 ? (closingBreakdown.whatsappBot / totalSpend) * 100 : 0,
        manualPct: totalSpend > 0 ? (closingBreakdown.manual / totalSpend) * 100 : 0,
        callPct: totalSpend > 0 ? (closingBreakdown.call / totalSpend) * 100 : 0,
        livePct: totalSpend > 0 ? (closingBreakdown.live / totalSpend) * 100 : 0,
        shopPct: totalSpend > 0 ? (closingBreakdown.shop / totalSpend) * 100 : 0,
      };

      return {
        platform,
        totalSpend,
        totalSales,
        closingBreakdown,
        closingPct,
        ...platformIcons[platform]
      };
    });
  }, [filteredSpends, filteredOrders]);

  // Calculate overall jenis closing stats (from spends table)
  const closingStats = useMemo(() => {
    const totalSpend = filteredSpends.reduce((sum, s) => sum + s.totalSpend, 0);
    return {
      website: filteredSpends.filter(s => s.jenisClosing === 'Website').reduce((sum, s) => sum + s.totalSpend, 0),
      whatsappBot: filteredSpends.filter(s => s.jenisClosing === 'WhatsappBot').reduce((sum, s) => sum + s.totalSpend, 0),
      manual: filteredSpends.filter(s => s.jenisClosing === 'Manual').reduce((sum, s) => sum + s.totalSpend, 0),
      call: filteredSpends.filter(s => s.jenisClosing === 'Call').reduce((sum, s) => sum + s.totalSpend, 0),
      live: filteredSpends.filter(s => s.jenisClosing === 'Live').reduce((sum, s) => sum + s.totalSpend, 0),
      shop: filteredSpends.filter(s => s.jenisClosing === 'Shop').reduce((sum, s) => sum + s.totalSpend, 0),
      totalSpend,
    };
  }, [filteredSpends]);

  // Aggregate spends by product + platform + jenis closing (from spends table)
  const aggregatedData = useMemo(() => {
    const dataMap = new Map<string, AggregatedSpend>();

    // Group spends by product + platform + jenis closing
    filteredSpends.forEach((spend) => {
      const platform = spend.jenisPlatform || 'Unknown';
      const jenisClosing = spend.jenisClosing || 'Unknown';
      const key = `${spend.product}|${platform}|${jenisClosing}`;

      // Get orders for this product + platform (for sales calculation)
      // Match by checking if bundle SKU contains the product SKU
      const matchingOrders = filteredOrders.filter(
        o => bundleFirstSkuMatches(o.bundleId, spend.product) && o.jenisPlatform === platform
      );
      const totalSales = matchingOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

      const existing = dataMap.get(key);
      if (existing) {
        existing.totalSpend += spend.totalSpend;
      } else {
        dataMap.set(key, {
          product: spend.product,
          platform: platform,
          jenisClosing: jenisClosing,
          totalSpend: spend.totalSpend,
          totalSales: 0, // Will be calculated proportionally later
          totalLeads: 0,
          leadsClose: 0,
          leadsNotClose: 0,
          totalClosedPrice: 0,
          kpk: '0.00',
          roas: '0.00',
          closingRate: '0.00',
        });
      }
    });

    // Distribute sales proportionally based on spend ratio within product+platform
    dataMap.forEach((value, key) => {
      // Get total spend for this product+platform across all closing types
      const totalPlatformSpend = Array.from(dataMap.values())
        .filter(d => d.product === value.product && d.platform === value.platform)
        .reduce((sum, d) => sum + d.totalSpend, 0);

      // Get total orders for this product+platform
      // Match by checking if bundle SKU contains the product SKU
      const platformOrders = filteredOrders.filter(
        o => bundleFirstSkuMatches(o.bundleId, value.product) && o.jenisPlatform === value.platform
      );
      const totalPlatformSales = platformOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

      // Distribute sales proportionally based on spend ratio
      const spendRatio = totalPlatformSpend > 0 ? value.totalSpend / totalPlatformSpend : 0;
      value.totalSales = totalPlatformSales * spendRatio;

      // Match prospects to products by niche (both now store SKU)
      const matchingProspects = filteredProspects.filter(p => p.niche === value.product);

      // Distribute leads proportionally based on spend ratio within product
      const productTotalSpend = Array.from(dataMap.values())
        .filter(d => d.product === value.product)
        .reduce((sum, d) => sum + d.totalSpend, 0);

      const productSpendRatio = productTotalSpend > 0 ? value.totalSpend / productTotalSpend : 0;
      const distributedLeads = Math.round(matchingProspects.length * productSpendRatio);
      const distributedLeadsClose = Math.round(matchingProspects.filter(p => (p as any).statusClosed === 'closed').length * productSpendRatio);
      const distributedLeadsNotClose = distributedLeads - distributedLeadsClose;
      const distributedClosedPrice = matchingProspects
        .filter(p => (p as any).statusClosed === 'closed')
        .reduce((sum, p) => sum + (parseFloat((p as any).priceClosed) || 0), 0) * productSpendRatio;

      value.totalLeads = distributedLeads;
      value.leadsClose = distributedLeadsClose;
      value.leadsNotClose = distributedLeadsNotClose;
      value.totalClosedPrice = distributedClosedPrice;

      // Calculate KPK, ROAS, Closing Rate
      value.kpk = value.totalLeads > 0 ? (value.totalSpend / value.totalLeads).toFixed(2) : '0.00';
      value.roas = value.totalSpend > 0 ? (value.totalSales / value.totalSpend).toFixed(2) : '0.00';
      value.closingRate = value.totalLeads > 0 ? ((value.leadsClose / value.totalLeads) * 100).toFixed(2) : '0.00';
    });

    return Array.from(dataMap.values())
      .filter(d => d.totalSpend > 0) // Only show rows with spend
      .sort((a, b) => {
        // Sort by product first, then platform, then closing type
        if (a.product !== b.product) return a.product.localeCompare(b.product);
        if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
        return a.jenisClosing.localeCompare(b.jenisClosing);
      });
  }, [filteredSpends, filteredOrders, filteredProspects, products, bundleSkuMap]);

  // Calculate overall stats
  const stats = useMemo(() => {
    const totalSpend = filteredSpends.reduce((sum, s) => sum + s.totalSpend, 0);
    const totalLeads = filteredProspects.length;
    const overallKPK = totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : '0.00';
    const leadsClose = filteredProspects.filter(p => (p as any).statusClosed === 'closed').length;
    const leadsTidakClose = filteredProspects.filter(p => !(p as any).statusClosed || (p as any).statusClosed !== 'closed').length;
    const totalClosedPrice = filteredProspects
      .filter(p => (p as any).statusClosed === 'closed')
      .reduce((sum, p) => sum + (parseFloat((p as any).priceClosed) || 0), 0);
    const roas = totalSpend > 0 ? (totalClosedPrice / totalSpend).toFixed(2) : '0.00';
    const closingRate = totalLeads > 0 ? ((leadsClose / totalLeads) * 100).toFixed(2) : '0.00';

    return { totalSpend, totalLeads, overallKPK, leadsClose, leadsTidakClose, roas, closingRate };
  }, [filteredSpends, filteredProspects]);

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Reporting Spend</h1>
          <p className="text-muted-foreground">Laporan perbelanjaan marketing mengikut produk</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="w-4 h-4 text-green-500" />
            <span className="text-xs uppercase font-medium">Total Spend</span>
          </div>
          <p className="text-xl font-bold text-foreground">RM {stats.totalSpend.toFixed(2)}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="w-4 h-4 text-blue-500" />
            <span className="text-xs uppercase font-medium">Total Leads</span>
          </div>
          <p className="text-xl font-bold text-foreground">{stats.totalLeads}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <BarChart3 className="w-4 h-4 text-purple-500" />
            <span className="text-xs uppercase font-medium">Overall KPK</span>
          </div>
          <p className="text-xl font-bold text-foreground">RM {stats.overallKPK}</p>
        </div>

        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-1">
            <Target className="w-4 h-4" />
            <span className="text-xs uppercase font-medium">Leads Close</span>
          </div>
          <p className="text-xl font-bold text-green-700 dark:text-green-400">{stats.leadsClose}</p>
        </div>

        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400 mb-1">
            <Target className="w-4 h-4" />
            <span className="text-xs uppercase font-medium">Leads Tidak Close</span>
          </div>
          <p className="text-xl font-bold text-red-700 dark:text-red-400">{stats.leadsTidakClose}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <TrendingUp className="w-4 h-4 text-orange-500" />
            <span className="text-xs uppercase font-medium">ROAS</span>
          </div>
          <p className="text-xl font-bold text-foreground">{stats.roas}x</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Percent className="w-4 h-4 text-indigo-500" />
            <span className="text-xs uppercase font-medium">Closing Rate</span>
          </div>
          <p className="text-xl font-bold text-foreground">{stats.closingRate}%</p>
        </div>
      </div>

      {/* Jenis Closing Summary */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Spend By Jenis Closing</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 mb-1">
              <Globe className="w-4 h-4" />
              <span className="text-xs uppercase font-medium">Website</span>
            </div>
            <p className="text-xl font-bold text-violet-700 dark:text-violet-300">RM {closingStats.website.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{closingStats.totalSpend > 0 ? ((closingStats.website / closingStats.totalSpend) * 100).toFixed(1) : 0}%</p>
          </div>
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
              <Phone className="w-4 h-4" />
              <span className="text-xs uppercase font-medium">WA Bot</span>
            </div>
            <p className="text-xl font-bold text-green-700 dark:text-green-300">RM {closingStats.whatsappBot.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{closingStats.totalSpend > 0 ? ((closingStats.whatsappBot / closingStats.totalSpend) * 100).toFixed(1) : 0}%</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 mb-1">
              <ClipboardList className="w-4 h-4" />
              <span className="text-xs uppercase font-medium">Manual</span>
            </div>
            <p className="text-xl font-bold text-slate-700 dark:text-slate-300">RM {closingStats.manual.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{closingStats.totalSpend > 0 ? ((closingStats.manual / closingStats.totalSpend) * 100).toFixed(1) : 0}%</p>
          </div>
          <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 mb-1">
              <Phone className="w-4 h-4" />
              <span className="text-xs uppercase font-medium">Call</span>
            </div>
            <p className="text-xl font-bold text-sky-700 dark:text-sky-300">RM {closingStats.call.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{closingStats.totalSpend > 0 ? ((closingStats.call / closingStats.totalSpend) * 100).toFixed(1) : 0}%</p>
          </div>
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 mb-1">
              <Play className="w-4 h-4" />
              <span className="text-xs uppercase font-medium">Live</span>
            </div>
            <p className="text-xl font-bold text-rose-700 dark:text-rose-300">RM {closingStats.live.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{closingStats.totalSpend > 0 ? ((closingStats.live / closingStats.totalSpend) * 100).toFixed(1) : 0}%</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-1">
              <Store className="w-4 h-4" />
              <span className="text-xs uppercase font-medium">Shop</span>
            </div>
            <p className="text-xl font-bold text-amber-700 dark:text-amber-300">RM {closingStats.shop.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{closingStats.totalSpend > 0 ? ((closingStats.shop / closingStats.totalSpend) * 100).toFixed(1) : 0}%</p>
          </div>
        </div>
      </div>

      {/* Spend By Platform - Dashboard Style */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Spend By Platform</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {platformStats.map((platform) => (
            <div key={platform.platform} className={`border rounded-lg overflow-hidden ${platform.bgColor}`}>
              {/* Header */}
              <div className={`p-4 ${platform.headerColor}`}>
                <div className={`flex items-center gap-2 mb-2 ${platform.color}`}>
                  {platform.icon}
                  <span className="text-sm font-semibold uppercase">{platform.platform}</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Spend:</span>
                    <span className={`text-sm font-bold ${platform.color}`}>RM {platform.totalSpend.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Sales:</span>
                    <span className="text-sm font-bold text-foreground">RM {platform.totalSales.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              {/* Closing Breakdown */}
              <div className="p-3 space-y-2 bg-white/50 dark:bg-black/20">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Jenis Closing</p>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-violet-600 dark:text-violet-400">Website</span>
                  <span className="text-xs font-medium">RM {platform.closingBreakdown.website.toFixed(0)} <span className="text-muted-foreground">({platform.closingPct.websitePct.toFixed(0)}%)</span></span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-green-600 dark:text-green-400">WA Bot</span>
                  <span className="text-xs font-medium">RM {platform.closingBreakdown.whatsappBot.toFixed(0)} <span className="text-muted-foreground">({platform.closingPct.whatsappBotPct.toFixed(0)}%)</span></span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-600 dark:text-slate-400">Manual</span>
                  <span className="text-xs font-medium">RM {platform.closingBreakdown.manual.toFixed(0)} <span className="text-muted-foreground">({platform.closingPct.manualPct.toFixed(0)}%)</span></span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-sky-600 dark:text-sky-400">Call</span>
                  <span className="text-xs font-medium">RM {platform.closingBreakdown.call.toFixed(0)} <span className="text-muted-foreground">({platform.closingPct.callPct.toFixed(0)}%)</span></span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-rose-600 dark:text-rose-400">Live</span>
                  <span className="text-xs font-medium">RM {platform.closingBreakdown.live.toFixed(0)} <span className="text-muted-foreground">({platform.closingPct.livePct.toFixed(0)}%)</span></span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-amber-600 dark:text-amber-400">Shop</span>
                  <span className="text-xs font-medium">RM {platform.closingBreakdown.shop.toFixed(0)} <span className="text-muted-foreground">({platform.closingPct.shopPct.toFixed(0)}%)</span></span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-muted-foreground mb-1">Start Date</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-background"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-muted-foreground mb-1">End Date</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-background"
            />
          </div>
          <Button variant="outline" onClick={resetFilters}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>

      {/* Table - Aggregated by Product + Platform + Jenis Closing */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12">No</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Jenis Closing</TableHead>
              <TableHead className="text-right">Total Spend</TableHead>
              <TableHead className="text-right">Total Sales</TableHead>
              <TableHead className="text-right">Total Leads</TableHead>
              <TableHead className="text-right">KPK</TableHead>
              <TableHead className="text-right">Leads Close</TableHead>
              <TableHead className="text-right">Leads X Close</TableHead>
              <TableHead className="text-right">ROAS</TableHead>
              <TableHead className="text-right">Closing Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aggregatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                  Tiada data spend
                </TableCell>
              </TableRow>
            ) : (
              aggregatedData.map((data, idx) => (
                <TableRow key={`${data.product}-${data.platform}-${data.jenisClosing}`} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{data.product}</TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      data.platform === 'Facebook' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                      data.platform === 'Tiktok' ? 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400' :
                      data.platform === 'Shopee' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' :
                      data.platform === 'Database' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' :
                      data.platform === 'Google' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                      'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                    }`}>
                      {data.platform}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      data.jenisClosing === 'Website' ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400' :
                      data.jenisClosing === 'WhatsappBot' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                      data.jenisClosing === 'Manual' ? 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400' :
                      data.jenisClosing === 'Call' ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400' :
                      data.jenisClosing === 'Live' ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400' :
                      data.jenisClosing === 'Shop' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                    }`}>
                      {data.jenisClosing === 'WhatsappBot' ? 'WA Bot' : data.jenisClosing}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium">RM {data.totalSpend.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-medium text-green-600">RM {data.totalSales.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{data.totalLeads}</TableCell>
                  <TableCell className="text-right">RM {data.kpk}</TableCell>
                  <TableCell className="text-right text-green-600">{data.leadsClose}</TableCell>
                  <TableCell className="text-right text-red-600">{data.leadsNotClose}</TableCell>
                  <TableCell className="text-right">{data.roas}x</TableCell>
                  <TableCell className="text-right">{data.closingRate}%</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ReportingSpend;