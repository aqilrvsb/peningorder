import React, { useState, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trophy, Medal, Award, Calendar, Search, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { parseISO, isWithinInterval } from 'date-fns';
import { getMalaysiaDate } from '@/lib/utils';

interface MarketerStats {
  rank: number;
  idStaff: string;
  name: string;
  totalLead: number;
  spend: number;
  totalSales: number;
  returns: number;
  roas: number;
  // Customer type sales
  customerNP: number;
  customerEP: number;
  customerEC: number;
  // Platform sales
  platformFB: number;
  platformTiktok: number;
  platformShopee: number;
  platformGoogle: number;
  platformDatabase: number;
  // Closing type sales
  closingManual: number;
  closingWaBot: number;
  closingWebsite: number;
  closingCall: number;
  closingLive: number;
}

interface Order {
  id: string;
  marketer_id_staff: string;
  date_order: string;
  total_sale: number;
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

interface Prospect {
  id: string;
  marketer_id_staff: string;
  tarikh_phone_number: string;
}

interface Profile {
  username: string;
  full_name: string;
}

const Top10: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [spends, setSpends] = useState<Spend[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Date filter state - default to today (Malaysia timezone)
  const today = getMalaysiaDate();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch ALL data from Supabase
  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoading(true);
      try {
        // Fetch orders (using total_sale instead of total_price, no marketer_name)
        const { data: ordersData, error: ordersError } = await (supabase as any)
          .from('customer_purchases')
          .select('id, marketer_id_staff, date_order, total_sale, delivery_status, jenis_customer, jenis_platform, jenis_closing')
          .not('marketer_id_staff', 'is', null)
          .order('created_at', { ascending: false })
          .range(0, 49999);

        if (ordersError) throw ordersError;
        setOrders(ordersData || []);

        // Fetch spends
        const { data: spendsData, error: spendsError } = await (supabase as any)
          .from('spends')
          .select('id, marketer_id_staff, total_spend, tarikh_spend')
          .not('marketer_id_staff', 'is', null)
          .range(0, 49999);

        if (spendsError) throw spendsError;
        setSpends(spendsData || []);

        // Fetch prospects (leads)
        const { data: prospectsData, error: prospectsError } = await (supabase as any)
          .from('prospects')
          .select('id, marketer_id_staff, tarikh_phone_number')
          .not('marketer_id_staff', 'is', null)
          .range(0, 49999);

        if (prospectsError) throw prospectsError;
        setProspects(prospectsData || []);

        // Fetch profiles to get marketer names (username -> full_name mapping)
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('username, full_name');

        if (profilesError) throw profilesError;

        // Create a mapping of username to full_name
        const profileMap: Record<string, string> = {};
        (profilesData || []).forEach((p: Profile) => {
          profileMap[p.username] = p.full_name || p.username;
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

  // Calculate marketer statistics
  const marketerStats = useMemo(() => {
    const stats: Record<string, MarketerStats> = {};

    // Filter orders by date range
    const filteredOrders = orders.filter(order => {
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

    // Filter spends by date range
    const filteredSpends = spends.filter(spend => {
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

    // Filter prospects by date range
    const filteredProspects = prospects.filter(prospect => {
      if (!prospect.tarikh_phone_number) return false;
      try {
        const prospectDate = parseISO(prospect.tarikh_phone_number);
        return isWithinInterval(prospectDate, {
          start: parseISO(startDate),
          end: parseISO(endDate)
        });
      } catch {
        return false;
      }
    });

    // Aggregate stats by marketer from orders
    filteredOrders.forEach(order => {
      const idStaff = order.marketer_id_staff;
      // Get name from profiles mapping, fallback to idStaff if not found
      const name = profiles[idStaff] || idStaff;

      if (!stats[idStaff]) {
        stats[idStaff] = {
          rank: 0,
          idStaff,
          name,
          totalLead: 0,
          spend: 0,
          totalSales: 0,
          returns: 0,
          roas: 0,
          // Customer type sales
          customerNP: 0,
          customerEP: 0,
          customerEC: 0,
          // Platform sales
          platformFB: 0,
          platformTiktok: 0,
          platformShopee: 0,
          platformGoogle: 0,
          platformDatabase: 0,
          // Closing type sales
          closingManual: 0,
          closingWaBot: 0,
          closingWebsite: 0,
          closingCall: 0,
          closingLive: 0,
        };
      }

      // Count sales amount (using total_sale from database)
      const saleAmount = Number(order.total_sale) || 0;
      stats[idStaff].totalSales += saleAmount;

      // Count returns
      if (order.delivery_status?.toLowerCase().includes('return')) {
        stats[idStaff].returns += saleAmount;
      }

      // Sum sales by customer type (NP, EP, EC)
      const customerType = order.jenis_customer?.toUpperCase();
      if (customerType === 'NP') {
        stats[idStaff].customerNP += saleAmount;
      } else if (customerType === 'EP') {
        stats[idStaff].customerEP += saleAmount;
      } else if (customerType === 'EC') {
        stats[idStaff].customerEC += saleAmount;
      }

      // Sum sales by platform
      const platform = order.jenis_platform;
      if (platform === 'Facebook') {
        stats[idStaff].platformFB += saleAmount;
      } else if (platform === 'Tiktok') {
        stats[idStaff].platformTiktok += saleAmount;
      } else if (platform === 'Shopee') {
        stats[idStaff].platformShopee += saleAmount;
      } else if (platform === 'Google') {
        stats[idStaff].platformGoogle += saleAmount;
      } else if (platform === 'Database') {
        stats[idStaff].platformDatabase += saleAmount;
      }

      // Sum sales by closing type
      const closingType = order.jenis_closing;
      if (closingType === 'Manual') {
        stats[idStaff].closingManual += saleAmount;
      } else if (closingType === 'Wa Bot') {
        stats[idStaff].closingWaBot += saleAmount;
      } else if (closingType === 'Website') {
        stats[idStaff].closingWebsite += saleAmount;
      } else if (closingType === 'Call') {
        stats[idStaff].closingCall += saleAmount;
      } else if (closingType === 'Live') {
        stats[idStaff].closingLive += saleAmount;
      }
    });

    // Add spend data
    filteredSpends.forEach(spend => {
      const idStaff = spend.marketer_id_staff;
      if (stats[idStaff]) {
        stats[idStaff].spend += Number(spend.total_spend) || 0;
      }
    });

    // Add lead counts
    filteredProspects.forEach(prospect => {
      const idStaff = prospect.marketer_id_staff;
      if (stats[idStaff]) {
        stats[idStaff].totalLead += 1;
      }
    });

    // Convert to array and sort by total sales (descending)
    const sortedStats = Object.values(stats)
      .sort((a, b) => b.totalSales - a.totalSales)
      .map((stat, index) => ({
        ...stat,
        rank: index + 1,
        roas: stat.spend > 0 ? stat.totalSales / stat.spend : 0,
      }));

    return sortedStats;
  }, [orders, spends, prospects, profiles, startDate, endDate]);

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

  // Get top 3 for podium display
  const top3 = marketerStats.slice(0, 3);

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-MY', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatSalesWithPercent = (value: number, total: number) => {
    const percent = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
    return `${formatNumber(value)} (${percent}%)`;
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
      <div>
        <h1 className="text-2xl font-bold text-primary">Top 10 Marketers</h1>
        <p className="text-muted-foreground mt-1">Performance leaderboard rankings</p>
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
        </div>
      </div>

      {/* Top 3 Podium */}
      {top3.length > 0 && (
        <div className="form-section">
          <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            Top Performers
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1st Place */}
            {top3[0] && (
              <div className="relative bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 rounded-xl p-6 border-2 border-amber-300 dark:border-amber-600 shadow-lg">
                <div className="absolute -top-3 -right-3 bg-amber-400 text-amber-900 rounded-full w-10 h-10 flex items-center justify-center font-bold shadow-md">
                  1
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-full bg-amber-400/20">
                    <Trophy className="w-8 h-8 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Champion</p>
                    <p className="font-bold text-foreground truncate">{top3[0].name}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ID Staff</span>
                    <span className="font-medium">{top3[0].idStaff}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Sales</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">RM {formatNumber(top3[0].totalSales)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 2nd Place */}
            {top3[1] && (
              <div className="relative bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/20 dark:to-slate-700/20 rounded-xl p-6 border-2 border-slate-300 dark:border-slate-600 shadow-md">
                <div className="absolute -top-3 -right-3 bg-slate-400 text-slate-900 rounded-full w-10 h-10 flex items-center justify-center font-bold shadow-md">
                  2
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-full bg-slate-400/20">
                    <Medal className="w-8 h-8 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Runner Up</p>
                    <p className="font-bold text-foreground truncate">{top3[1].name}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ID Staff</span>
                    <span className="font-medium">{top3[1].idStaff}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Sales</span>
                    <span className="font-bold text-slate-600 dark:text-slate-400">RM {formatNumber(top3[1].totalSales)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 3rd Place */}
            {top3[2] && (
              <div className="relative bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-xl p-6 border-2 border-orange-300 dark:border-orange-600 shadow-md">
                <div className="absolute -top-3 -right-3 bg-orange-400 text-orange-900 rounded-full w-10 h-10 flex items-center justify-center font-bold shadow-md">
                  3
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-full bg-orange-400/20">
                    <Award className="w-8 h-8 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide">3rd Place</p>
                    <p className="font-bold text-foreground truncate">{top3[2].name}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ID Staff</span>
                    <span className="font-medium">{top3[2].idStaff}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Sales</span>
                    <span className="font-bold text-orange-600 dark:text-orange-400">RM {formatNumber(top3[2].totalSales)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rankings Table */}
      <div className="form-section">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <h2 className="text-lg font-semibold text-foreground">Full Rankings</h2>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search marketer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>NO</th>
                <th>ID STAFF</th>
                <th>NAME</th>
                <th className="text-right text-indigo-600">Total Lead</th>
                <th className="text-right">SPEND</th>
                <th className="text-right">TOTAL SALES</th>
                <th className="text-right">RETURN</th>
                <th className="text-right">ROAS</th>
                <th className="text-right text-green-600">Customer NP</th>
                <th className="text-right text-purple-600">Customer EP</th>
                <th className="text-right text-amber-600">Customer EC</th>
                <th className="text-right text-blue-600">Platform FB</th>
                <th className="text-right text-pink-600">Platform TIKTOK</th>
                <th className="text-right text-orange-600">Platform SHOPEE</th>
                <th className="text-right text-red-600">Platform GOOGLE</th>
                <th className="text-right text-cyan-600">Platform DATABASE</th>
                <th className="text-right text-slate-600">Closing MANUAL</th>
                <th className="text-right text-emerald-600">Closing WA BOT</th>
                <th className="text-right text-violet-600">Closing WEBSITE</th>
                <th className="text-right text-sky-600">Closing CALL</th>
                <th className="text-right text-rose-600">Closing LIVE</th>
              </tr>
            </thead>
            <tbody>
              {filteredStats.slice(0, 10).map((stat) => (
                <tr key={stat.idStaff}>
                  <td>
                    <div className="flex items-center gap-2">
                      {stat.rank === 1 && <Trophy className="w-4 h-4 text-amber-500" />}
                      {stat.rank === 2 && <Medal className="w-4 h-4 text-slate-400" />}
                      {stat.rank === 3 && <Award className="w-4 h-4 text-orange-500" />}
                      <span className={stat.rank <= 3 ? 'font-bold' : ''}>{stat.rank}</span>
                    </div>
                  </td>
                  <td className="font-medium">{stat.idStaff}</td>
                  <td>{stat.name}</td>
                  <td className="text-right text-indigo-600 font-medium">{stat.totalLead}</td>
                  <td className="text-right">{formatNumber(stat.spend)}</td>
                  <td className="text-right font-semibold text-primary">{formatNumber(stat.totalSales)}</td>
                  <td className="text-right text-destructive">{formatNumber(stat.returns)}</td>
                  <td className="text-right">{formatNumber(stat.roas)}</td>
                  <td className="text-right text-green-600">{formatSalesWithPercent(stat.customerNP, stat.totalSales)}</td>
                  <td className="text-right text-purple-600">{formatSalesWithPercent(stat.customerEP, stat.totalSales)}</td>
                  <td className="text-right text-amber-600">{formatSalesWithPercent(stat.customerEC, stat.totalSales)}</td>
                  <td className="text-right text-blue-600">{formatSalesWithPercent(stat.platformFB, stat.totalSales)}</td>
                  <td className="text-right text-pink-600">{formatSalesWithPercent(stat.platformTiktok, stat.totalSales)}</td>
                  <td className="text-right text-orange-600">{formatSalesWithPercent(stat.platformShopee, stat.totalSales)}</td>
                  <td className="text-right text-red-600">{formatSalesWithPercent(stat.platformGoogle, stat.totalSales)}</td>
                  <td className="text-right text-cyan-600">{formatSalesWithPercent(stat.platformDatabase, stat.totalSales)}</td>
                  <td className="text-right text-slate-600">{formatSalesWithPercent(stat.closingManual, stat.totalSales)}</td>
                  <td className="text-right text-emerald-600">{formatSalesWithPercent(stat.closingWaBot, stat.totalSales)}</td>
                  <td className="text-right text-violet-600">{formatSalesWithPercent(stat.closingWebsite, stat.totalSales)}</td>
                  <td className="text-right text-sky-600">{formatSalesWithPercent(stat.closingCall, stat.totalSales)}</td>
                  <td className="text-right text-rose-600">{formatSalesWithPercent(stat.closingLive, stat.totalSales)}</td>
                </tr>
              ))}
              {filteredStats.length === 0 && (
                <tr>
                  <td colSpan={21} className="text-center py-8 text-muted-foreground">
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

export default Top10;
