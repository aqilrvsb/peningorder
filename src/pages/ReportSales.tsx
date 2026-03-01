import React, { useState, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Search, Loader2, FileSpreadsheet, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { parseISO, isWithinInterval } from 'date-fns';
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth } from '@/lib/utils';

interface Order {
  id: string;
  marketer_id_staff: string;
  marketer_name: string;
  date_order: string;
  total_price: number;
  delivery_status: string;
  jenis_customer: string;
  jenis_platform: string;
  jenis_closing: string;
}

interface Spend {
  id: string;
  marketer_id_staff: string;
  total_spend: number;
  tarikh_spend: string;
}

interface MarketerStats {
  idStaff: string;
  name: string;
  totalSales: number;
  totalReturn: number;
  returnPercent: number;
  totalSpend: number;
  roas: number;
  salesFB: number;
  salesFBPercent: number;
  salesDatabase: number;
  salesDatabasePercent: number;
  salesShopee: number;
  salesShopeePercent: number;
  salesTiktok: number;
  salesTiktokPercent: number;
  salesGoogle: number;
  salesGooglePercent: number;
  salesNP: number;
  salesNPPercent: number;
  salesEP: number;
  salesEPPercent: number;
  salesEC: number;
  salesECPercent: number;
  countNP: number;
  countEP: number;
  countEC: number;
  closingManual: number;
  closingManualPercent: number;
  closingWaBot: number;
  closingWaBotPercent: number;
  closingWebsite: number;
  closingWebsitePercent: number;
  closingCall: number;
  closingCallPercent: number;
  closingLive: number;
  closingLivePercent: number;
  closingShop: number;
  closingShopPercent: number;
  totalClosing: number;
}

const ReportSales: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [spends, setSpends] = useState<Spend[]>([]);
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
        const [ordersRes, spendsRes] = await Promise.all([
          (supabase as any)
            .from('customer_purchases')
            .select('id, marketer_id_staff, marketer_name, date_order, total_price, delivery_status, jenis_customer, jenis_platform, jenis_closing')
            .order('created_at', { ascending: false })
            .range(0, 49999),
          (supabase as any)
            .from('spends')
            .select('id, marketer_id_staff, total_spend, tarikh_spend')
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

    fetchAllData();
  }, []);

  // Filter data by date range
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
    const stats: Record<string, MarketerStats> = {};

    // Process orders
    filteredOrders.forEach(order => {
      const idStaff = order.marketer_id_staff;
      const name = order.marketer_name;

      if (!stats[idStaff]) {
        stats[idStaff] = {
          idStaff,
          name,
          totalSales: 0,
          totalReturn: 0,
          returnPercent: 0,
          totalSpend: 0,
          roas: 0,
          salesFB: 0,
          salesFBPercent: 0,
          salesDatabase: 0,
          salesDatabasePercent: 0,
          salesShopee: 0,
          salesShopeePercent: 0,
          salesTiktok: 0,
          salesTiktokPercent: 0,
          salesGoogle: 0,
          salesGooglePercent: 0,
          salesNP: 0,
          salesNPPercent: 0,
          salesEP: 0,
          salesEPPercent: 0,
          salesEC: 0,
          salesECPercent: 0,
          countNP: 0,
          countEP: 0,
          countEC: 0,
          closingManual: 0,
          closingManualPercent: 0,
          closingWaBot: 0,
          closingWaBotPercent: 0,
          closingWebsite: 0,
          closingWebsitePercent: 0,
          closingCall: 0,
          closingCallPercent: 0,
          closingLive: 0,
          closingLivePercent: 0,
          closingShop: 0,
          closingShopPercent: 0,
          totalClosing: 0,
        };
      }

      const saleAmount = Number(order.total_price) || 0;
      stats[idStaff].totalSales += saleAmount;

      // Count returns
      if (order.delivery_status === 'Return') {
        stats[idStaff].totalReturn += saleAmount;
      }

      // Count by platform
      if (order.jenis_platform === 'Facebook') {
        stats[idStaff].salesFB += saleAmount;
      } else if (order.jenis_platform === 'Database') {
        stats[idStaff].salesDatabase += saleAmount;
      } else if (order.jenis_platform === 'Shopee') {
        stats[idStaff].salesShopee += saleAmount;
      } else if (order.jenis_platform === 'Tiktok') {
        stats[idStaff].salesTiktok += saleAmount;
      } else if (order.jenis_platform === 'Google') {
        stats[idStaff].salesGoogle += saleAmount;
      }

      // Count by customer type (sales amount + customer count)
      const customerType = order.jenis_customer?.toUpperCase();
      if (customerType === 'NP') {
        stats[idStaff].salesNP += saleAmount;
        stats[idStaff].countNP += 1;
      } else if (customerType === 'EP') {
        stats[idStaff].salesEP += saleAmount;
        stats[idStaff].countEP += 1;
      } else if (customerType === 'EC') {
        stats[idStaff].salesEC += saleAmount;
        stats[idStaff].countEC += 1;
      }

      // Count by closing type
      const closingType = order.jenis_closing?.toLowerCase();
      if (closingType === 'manual') {
        stats[idStaff].closingManual += 1;
      } else if (closingType === 'wa bot') {
        stats[idStaff].closingWaBot += 1;
      } else if (closingType === 'website') {
        stats[idStaff].closingWebsite += 1;
      } else if (closingType === 'call') {
        stats[idStaff].closingCall += 1;
      } else if (closingType === 'live') {
        stats[idStaff].closingLive += 1;
      } else if (closingType === 'shop' || closingType === 'beg lead') {
        stats[idStaff].closingShop += 1;
      }
    });

    // Process spends
    filteredSpends.forEach(spend => {
      const idStaff = spend.marketer_id_staff;
      if (stats[idStaff]) {
        stats[idStaff].totalSpend += Number(spend.total_spend) || 0;
      }
    });

    // Calculate derived stats
    Object.values(stats).forEach(stat => {
      // Return percent
      stat.returnPercent = stat.totalSales > 0 ? (stat.totalReturn / stat.totalSales) * 100 : 0;

      // ROAS
      stat.roas = stat.totalSpend > 0 ? stat.totalSales / stat.totalSpend : 0;

      // Sales percentage by platform
      stat.salesFBPercent = stat.totalSales > 0 ? (stat.salesFB / stat.totalSales) * 100 : 0;
      stat.salesDatabasePercent = stat.totalSales > 0 ? (stat.salesDatabase / stat.totalSales) * 100 : 0;
      stat.salesShopeePercent = stat.totalSales > 0 ? (stat.salesShopee / stat.totalSales) * 100 : 0;
      stat.salesTiktokPercent = stat.totalSales > 0 ? (stat.salesTiktok / stat.totalSales) * 100 : 0;
      stat.salesGooglePercent = stat.totalSales > 0 ? (stat.salesGoogle / stat.totalSales) * 100 : 0;

      // Sales percentage by customer type (NP/EP/EC)
      stat.salesNPPercent = stat.totalSales > 0 ? (stat.salesNP / stat.totalSales) * 100 : 0;
      stat.salesEPPercent = stat.totalSales > 0 ? (stat.salesEP / stat.totalSales) * 100 : 0;
      stat.salesECPercent = stat.totalSales > 0 ? (stat.salesEC / stat.totalSales) * 100 : 0;

      // Total closing count and percentage by closing type
      stat.totalClosing = stat.closingManual + stat.closingWaBot + stat.closingWebsite + stat.closingCall + stat.closingLive + stat.closingShop;
      stat.closingManualPercent = stat.totalClosing > 0 ? (stat.closingManual / stat.totalClosing) * 100 : 0;
      stat.closingWaBotPercent = stat.totalClosing > 0 ? (stat.closingWaBot / stat.totalClosing) * 100 : 0;
      stat.closingWebsitePercent = stat.totalClosing > 0 ? (stat.closingWebsite / stat.totalClosing) * 100 : 0;
      stat.closingCallPercent = stat.totalClosing > 0 ? (stat.closingCall / stat.totalClosing) * 100 : 0;
      stat.closingLivePercent = stat.totalClosing > 0 ? (stat.closingLive / stat.totalClosing) * 100 : 0;
      stat.closingShopPercent = stat.totalClosing > 0 ? (stat.closingShop / stat.totalClosing) * 100 : 0;
    });

    // Convert to array and sort by total sales
    return Object.values(stats).sort((a, b) => b.totalSales - a.totalSales);
  }, [filteredOrders, filteredSpends]);

  // Filter by search term
  const filteredStats = useMemo(() => {
    if (!searchTerm) return marketerStats;
    const term = searchTerm.toLowerCase();
    return marketerStats.filter(
      stat =>
        stat.idStaff.toLowerCase().includes(term) ||
        stat.name.toLowerCase().includes(term)
    );
  }, [marketerStats, searchTerm]);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredStats.reduce(
      (acc, stat) => ({
        totalSales: acc.totalSales + stat.totalSales,
        totalReturn: acc.totalReturn + stat.totalReturn,
        totalSpend: acc.totalSpend + stat.totalSpend,
        salesFB: acc.salesFB + stat.salesFB,
        salesDatabase: acc.salesDatabase + stat.salesDatabase,
        salesShopee: acc.salesShopee + stat.salesShopee,
        salesTiktok: acc.salesTiktok + stat.salesTiktok,
        salesGoogle: acc.salesGoogle + stat.salesGoogle,
        salesNP: acc.salesNP + stat.salesNP,
        salesEP: acc.salesEP + stat.salesEP,
        salesEC: acc.salesEC + stat.salesEC,
        countNP: acc.countNP + stat.countNP,
        countEP: acc.countEP + stat.countEP,
        countEC: acc.countEC + stat.countEC,
        closingManual: acc.closingManual + stat.closingManual,
        closingWaBot: acc.closingWaBot + stat.closingWaBot,
        closingWebsite: acc.closingWebsite + stat.closingWebsite,
        closingCall: acc.closingCall + stat.closingCall,
        closingLive: acc.closingLive + stat.closingLive,
        closingShop: acc.closingShop + stat.closingShop,
        totalClosing: acc.totalClosing + stat.totalClosing,
      }),
      {
        totalSales: 0,
        totalReturn: 0,
        totalSpend: 0,
        salesFB: 0,
        salesDatabase: 0,
        salesShopee: 0,
        salesTiktok: 0,
        salesGoogle: 0,
        salesNP: 0,
        salesEP: 0,
        salesEC: 0,
        countNP: 0,
        countEP: 0,
        countEC: 0,
        closingManual: 0,
        closingWaBot: 0,
        closingWebsite: 0,
        closingCall: 0,
        closingLive: 0,
        closingShop: 0,
        totalClosing: 0,
      }
    );
  }, [filteredStats]);

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-MY', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
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
            <FileSpreadsheet className="w-6 h-6" />
            Report Sales
          </h1>
          <p className="text-muted-foreground mt-1">Sales performance by marketer</p>
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

      {/* Sales Report Table */}
      <div className="form-section">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Sales Report by Marketer
        </h2>

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full min-w-[2200px] border-collapse">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px]">ID STAFF</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[150px]">NAME</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[120px]">TOTAL SALES</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px]">RETURN</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px]">SPEND</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[80px]">ROAS</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px]">SALES FB</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px]">SALES DB</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[120px]">SALES SHOPEE</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[120px]">SALES TIKTOK</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[120px]">SALES GOOGLE</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[120px]">SALES NP</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[120px]">SALES EP</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[120px]">SALES EC</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[80px]">MANUAL</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[80px]">WA BOT</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[80px]">WEBSITE</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[80px]">CALL</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[80px]">LIVE</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[80px]">SHOP</th>
              </tr>
            </thead>
            <tbody className="bg-background divide-y divide-border">
              {filteredStats.map((stat) => (
                <tr key={stat.idStaff} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">{stat.idStaff}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{stat.name}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-success whitespace-nowrap">{formatNumber(stat.totalSales)}</td>
                  <td className="px-4 py-3 text-sm text-right text-destructive whitespace-nowrap">
                    <div>{formatNumber(stat.totalReturn)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.returnPercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-warning whitespace-nowrap">{formatNumber(stat.totalSpend)}</td>
                  <td className="px-4 py-3 text-sm text-right text-primary font-medium whitespace-nowrap">{stat.roas.toFixed(2)}x</td>
                  <td className="px-4 py-3 text-sm text-right text-blue-600 whitespace-nowrap">
                    <div>{formatNumber(stat.salesFB)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.salesFBPercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-purple-600 whitespace-nowrap">
                    <div>{formatNumber(stat.salesDatabase)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.salesDatabasePercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-orange-600 whitespace-nowrap">
                    <div>{formatNumber(stat.salesShopee)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.salesShopeePercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-pink-600 whitespace-nowrap">
                    <div>{formatNumber(stat.salesTiktok)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.salesTiktokPercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-red-600 whitespace-nowrap">
                    <div>{formatNumber(stat.salesGoogle)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.salesGooglePercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                    <div className="text-cyan-600 font-medium">{formatNumber(stat.salesNP)} <span className="text-muted-foreground text-xs">({stat.countNP})</span></div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.salesNPPercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                    <div className="text-amber-600 font-medium">{formatNumber(stat.salesEP)} <span className="text-muted-foreground text-xs">({stat.countEP})</span></div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.salesEPPercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                    <div className="text-emerald-600 font-medium">{formatNumber(stat.salesEC)} <span className="text-muted-foreground text-xs">({stat.countEC})</span></div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.salesECPercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                    <div>{stat.closingManual}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.closingManualPercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                    <div>{stat.closingWaBot}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.closingWaBotPercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                    <div>{stat.closingWebsite}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.closingWebsitePercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                    <div>{stat.closingCall}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.closingCallPercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                    <div>{stat.closingLive}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.closingLivePercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                    <div>{stat.closingShop}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.closingShopPercent)}</div>
                  </td>
                </tr>
              ))}
              {filteredStats.length === 0 && (
                <tr>
                  <td colSpan={20} className="px-4 py-8 text-center text-muted-foreground">
                    No marketers found for the selected date range
                  </td>
                </tr>
              )}
            </tbody>
            {filteredStats.length > 0 && (
              <tfoot className="bg-muted/70">
                <tr className="font-semibold">
                  <td className="px-4 py-3 text-sm whitespace-nowrap">TOTAL</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{filteredStats.length} marketers</td>
                  <td className="px-4 py-3 text-sm text-right text-success whitespace-nowrap">{formatNumber(totals.totalSales)}</td>
                  <td className="px-4 py-3 text-sm text-right text-destructive whitespace-nowrap">
                    <div>{formatNumber(totals.totalReturn)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSales > 0 ? (totals.totalReturn / totals.totalSales) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-warning whitespace-nowrap">{formatNumber(totals.totalSpend)}</td>
                  <td className="px-4 py-3 text-sm text-right text-primary whitespace-nowrap">
                    {(totals.totalSpend > 0 ? totals.totalSales / totals.totalSpend : 0).toFixed(2)}x
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-blue-600 whitespace-nowrap">
                    <div>{formatNumber(totals.salesFB)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSales > 0 ? (totals.salesFB / totals.totalSales) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-purple-600 whitespace-nowrap">
                    <div>{formatNumber(totals.salesDatabase)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSales > 0 ? (totals.salesDatabase / totals.totalSales) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-orange-600 whitespace-nowrap">
                    <div>{formatNumber(totals.salesShopee)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSales > 0 ? (totals.salesShopee / totals.totalSales) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-pink-600 whitespace-nowrap">
                    <div>{formatNumber(totals.salesTiktok)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSales > 0 ? (totals.salesTiktok / totals.totalSales) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-red-600 whitespace-nowrap">
                    <div>{formatNumber(totals.salesGoogle)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSales > 0 ? (totals.salesGoogle / totals.totalSales) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                    <div className="text-cyan-600">{formatNumber(totals.salesNP)} <span className="text-muted-foreground text-xs">({totals.countNP})</span></div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSales > 0 ? (totals.salesNP / totals.totalSales) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                    <div className="text-amber-600">{formatNumber(totals.salesEP)} <span className="text-muted-foreground text-xs">({totals.countEP})</span></div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSales > 0 ? (totals.salesEP / totals.totalSales) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                    <div className="text-emerald-600">{formatNumber(totals.salesEC)} <span className="text-muted-foreground text-xs">({totals.countEC})</span></div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSales > 0 ? (totals.salesEC / totals.totalSales) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                    <div>{totals.closingManual}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalClosing > 0 ? (totals.closingManual / totals.totalClosing) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                    <div>{totals.closingWaBot}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalClosing > 0 ? (totals.closingWaBot / totals.totalClosing) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                    <div>{totals.closingWebsite}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalClosing > 0 ? (totals.closingWebsite / totals.totalClosing) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                    <div>{totals.closingCall}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalClosing > 0 ? (totals.closingCall / totals.totalClosing) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                    <div>{totals.closingLive}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalClosing > 0 ? (totals.closingLive / totals.totalClosing) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                    <div>{totals.closingShop}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalClosing > 0 ? (totals.closingShop / totals.totalClosing) * 100 : 0)}</div>
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

export default ReportSales;
