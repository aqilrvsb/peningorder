import React, { useState, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Search, Loader2, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { parseISO, isWithinInterval } from 'date-fns';
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth } from '@/lib/utils';

interface Spend {
  id: string;
  marketer_id_staff: string;
  product: string;
  jenis_platform: string;
  jenis_closing: string;
  total_spend: number;
  tarikh_spend: string;
}

interface MarketerSpendStats {
  idStaff: string;
  totalSpend: number;
  // By Platform
  spendFB: number;
  spendFBPercent: number;
  spendDatabase: number;
  spendDatabasePercent: number;
  spendShopee: number;
  spendShopeePercent: number;
  spendTiktok: number;
  spendTiktokPercent: number;
  spendGoogle: number;
  spendGooglePercent: number;
  // By Jenis Closing
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
  closingBegLead: number;
  closingBegLeadPercent: number;
}

const ReportingSpendBOD: React.FC = () => {
  const [spends, setSpends] = useState<Spend[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Date filter state - default to current month (Malaysia timezone)
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch all spends data
  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from('spends')
          .select('id, marketer_id_staff, product, jenis_platform, jenis_closing, total_spend, tarikh_spend')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setSpends(data || []);
      } catch (error) {
        console.error('Error fetching spends:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllData();
  }, []);

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

    // Process spends
    filteredSpends.forEach(spend => {
      const idStaff = spend.marketer_id_staff;
      const amount = Number(spend.total_spend) || 0;

      if (!stats[idStaff]) {
        stats[idStaff] = {
          idStaff,
          totalSpend: 0,
          // By Platform
          spendFB: 0,
          spendFBPercent: 0,
          spendDatabase: 0,
          spendDatabasePercent: 0,
          spendShopee: 0,
          spendShopeePercent: 0,
          spendTiktok: 0,
          spendTiktokPercent: 0,
          spendGoogle: 0,
          spendGooglePercent: 0,
          // By Jenis Closing
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
          closingBegLead: 0,
          closingBegLeadPercent: 0,
        };
      }

      stats[idStaff].totalSpend += amount;

      // Count by platform
      const platform = spend.jenis_platform?.toLowerCase();
      if (platform === 'facebook') {
        stats[idStaff].spendFB += amount;
      } else if (platform === 'database') {
        stats[idStaff].spendDatabase += amount;
      } else if (platform === 'shopee') {
        stats[idStaff].spendShopee += amount;
      } else if (platform === 'tiktok') {
        stats[idStaff].spendTiktok += amount;
      } else if (platform === 'google') {
        stats[idStaff].spendGoogle += amount;
      }

      // Count by jenis closing
      const closing = spend.jenis_closing?.toLowerCase();
      if (closing === 'manual') {
        stats[idStaff].closingManual += amount;
      } else if (closing === 'wa bot') {
        stats[idStaff].closingWaBot += amount;
      } else if (closing === 'website') {
        stats[idStaff].closingWebsite += amount;
      } else if (closing === 'call') {
        stats[idStaff].closingCall += amount;
      } else if (closing === 'live') {
        stats[idStaff].closingLive += amount;
      } else if (closing === 'beg lead') {
        stats[idStaff].closingBegLead += amount;
      }
    });

    // Calculate percentages
    Object.values(stats).forEach(stat => {
      const total = stat.totalSpend;
      // Platform percentages
      stat.spendFBPercent = total > 0 ? (stat.spendFB / total) * 100 : 0;
      stat.spendDatabasePercent = total > 0 ? (stat.spendDatabase / total) * 100 : 0;
      stat.spendShopeePercent = total > 0 ? (stat.spendShopee / total) * 100 : 0;
      stat.spendTiktokPercent = total > 0 ? (stat.spendTiktok / total) * 100 : 0;
      stat.spendGooglePercent = total > 0 ? (stat.spendGoogle / total) * 100 : 0;
      // Closing percentages
      stat.closingManualPercent = total > 0 ? (stat.closingManual / total) * 100 : 0;
      stat.closingWaBotPercent = total > 0 ? (stat.closingWaBot / total) * 100 : 0;
      stat.closingWebsitePercent = total > 0 ? (stat.closingWebsite / total) * 100 : 0;
      stat.closingCallPercent = total > 0 ? (stat.closingCall / total) * 100 : 0;
      stat.closingLivePercent = total > 0 ? (stat.closingLive / total) * 100 : 0;
      stat.closingBegLeadPercent = total > 0 ? (stat.closingBegLead / total) * 100 : 0;
    });

    // Convert to array and sort by total spend (highest first)
    return Object.values(stats).sort((a, b) => b.totalSpend - a.totalSpend);
  }, [filteredSpends]);

  // Filter by search term
  const filteredStats = useMemo(() => {
    if (!searchTerm) return marketerStats;
    const term = searchTerm.toLowerCase();
    return marketerStats.filter(stat => stat.idStaff.toLowerCase().includes(term));
  }, [marketerStats, searchTerm]);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredStats.reduce(
      (acc, stat) => ({
        totalSpend: acc.totalSpend + stat.totalSpend,
        spendFB: acc.spendFB + stat.spendFB,
        spendDatabase: acc.spendDatabase + stat.spendDatabase,
        spendShopee: acc.spendShopee + stat.spendShopee,
        spendTiktok: acc.spendTiktok + stat.spendTiktok,
        spendGoogle: acc.spendGoogle + stat.spendGoogle,
        closingManual: acc.closingManual + stat.closingManual,
        closingWaBot: acc.closingWaBot + stat.closingWaBot,
        closingWebsite: acc.closingWebsite + stat.closingWebsite,
        closingCall: acc.closingCall + stat.closingCall,
        closingLive: acc.closingLive + stat.closingLive,
        closingBegLead: acc.closingBegLead + stat.closingBegLead,
      }),
      {
        totalSpend: 0,
        spendFB: 0,
        spendDatabase: 0,
        spendShopee: 0,
        spendTiktok: 0,
        spendGoogle: 0,
        closingManual: 0,
        closingWaBot: 0,
        closingWebsite: 0,
        closingCall: 0,
        closingLive: 0,
        closingBegLead: 0,
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
            <BarChart3 className="w-6 h-6" />
            Reporting Spend
          </h1>
          <p className="text-muted-foreground mt-1">Spend summary by marketer</p>
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
          <table className="w-full min-w-[1600px] border-collapse">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px]">ID STAFF</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[120px]">TOTAL SPEND</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px] bg-blue-50 dark:bg-blue-950/30">FACEBOOK</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px] bg-purple-50 dark:bg-purple-950/30">DATABASE</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px] bg-orange-50 dark:bg-orange-950/30">SHOPEE</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px] bg-pink-50 dark:bg-pink-950/30">TIKTOK</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px] bg-red-50 dark:bg-red-950/30">GOOGLE</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px] bg-slate-50 dark:bg-slate-950/30">MANUAL</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px] bg-green-50 dark:bg-green-950/30">WA BOT</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px] bg-violet-50 dark:bg-violet-950/30">WEBSITE</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px] bg-sky-50 dark:bg-sky-950/30">CALL</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px] bg-rose-50 dark:bg-rose-950/30">LIVE</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap min-w-[100px] bg-amber-50 dark:bg-amber-950/30">BEG LEAD</th>
              </tr>
            </thead>
            <tbody className="bg-background divide-y divide-border">
              {filteredStats.map((stat) => (
                <tr key={stat.idStaff} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">{stat.idStaff}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-primary whitespace-nowrap">RM {formatNumber(stat.totalSpend)}</td>
                  {/* Platform columns */}
                  <td className="px-4 py-3 text-sm text-right text-blue-600 whitespace-nowrap bg-blue-50/50 dark:bg-blue-950/20">
                    <div>RM {formatNumber(stat.spendFB)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.spendFBPercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-purple-600 whitespace-nowrap bg-purple-50/50 dark:bg-purple-950/20">
                    <div>RM {formatNumber(stat.spendDatabase)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.spendDatabasePercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-orange-600 whitespace-nowrap bg-orange-50/50 dark:bg-orange-950/20">
                    <div>RM {formatNumber(stat.spendShopee)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.spendShopeePercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-pink-600 whitespace-nowrap bg-pink-50/50 dark:bg-pink-950/20">
                    <div>RM {formatNumber(stat.spendTiktok)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.spendTiktokPercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-red-600 whitespace-nowrap bg-red-50/50 dark:bg-red-950/20">
                    <div>RM {formatNumber(stat.spendGoogle)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.spendGooglePercent)}</div>
                  </td>
                  {/* Closing columns */}
                  <td className="px-4 py-3 text-sm text-right text-slate-600 whitespace-nowrap bg-slate-50/50 dark:bg-slate-950/20">
                    <div>RM {formatNumber(stat.closingManual)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.closingManualPercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-green-600 whitespace-nowrap bg-green-50/50 dark:bg-green-950/20">
                    <div>RM {formatNumber(stat.closingWaBot)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.closingWaBotPercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-violet-600 whitespace-nowrap bg-violet-50/50 dark:bg-violet-950/20">
                    <div>RM {formatNumber(stat.closingWebsite)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.closingWebsitePercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-sky-600 whitespace-nowrap bg-sky-50/50 dark:bg-sky-950/20">
                    <div>RM {formatNumber(stat.closingCall)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.closingCallPercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-rose-600 whitespace-nowrap bg-rose-50/50 dark:bg-rose-950/20">
                    <div>RM {formatNumber(stat.closingLive)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.closingLivePercent)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-amber-600 whitespace-nowrap bg-amber-50/50 dark:bg-amber-950/20">
                    <div>RM {formatNumber(stat.closingBegLead)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.closingBegLeadPercent)}</div>
                  </td>
                </tr>
              ))}
              {filteredStats.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">
                    No marketers found for the selected date range
                  </td>
                </tr>
              )}
            </tbody>
            {filteredStats.length > 0 && (
              <tfoot className="bg-muted/70">
                <tr className="font-semibold">
                  <td className="px-4 py-3 text-sm whitespace-nowrap">TOTAL ({filteredStats.length} marketers)</td>
                  <td className="px-4 py-3 text-sm text-right text-primary whitespace-nowrap">RM {formatNumber(totals.totalSpend)}</td>
                  {/* Platform totals */}
                  <td className="px-4 py-3 text-sm text-right text-blue-600 whitespace-nowrap bg-blue-50/50 dark:bg-blue-950/20">
                    <div>RM {formatNumber(totals.spendFB)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSpend > 0 ? (totals.spendFB / totals.totalSpend) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-purple-600 whitespace-nowrap bg-purple-50/50 dark:bg-purple-950/20">
                    <div>RM {formatNumber(totals.spendDatabase)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSpend > 0 ? (totals.spendDatabase / totals.totalSpend) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-orange-600 whitespace-nowrap bg-orange-50/50 dark:bg-orange-950/20">
                    <div>RM {formatNumber(totals.spendShopee)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSpend > 0 ? (totals.spendShopee / totals.totalSpend) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-pink-600 whitespace-nowrap bg-pink-50/50 dark:bg-pink-950/20">
                    <div>RM {formatNumber(totals.spendTiktok)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSpend > 0 ? (totals.spendTiktok / totals.totalSpend) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-red-600 whitespace-nowrap bg-red-50/50 dark:bg-red-950/20">
                    <div>RM {formatNumber(totals.spendGoogle)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSpend > 0 ? (totals.spendGoogle / totals.totalSpend) * 100 : 0)}</div>
                  </td>
                  {/* Closing totals */}
                  <td className="px-4 py-3 text-sm text-right text-slate-600 whitespace-nowrap bg-slate-50/50 dark:bg-slate-950/20">
                    <div>RM {formatNumber(totals.closingManual)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSpend > 0 ? (totals.closingManual / totals.totalSpend) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-green-600 whitespace-nowrap bg-green-50/50 dark:bg-green-950/20">
                    <div>RM {formatNumber(totals.closingWaBot)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSpend > 0 ? (totals.closingWaBot / totals.totalSpend) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-violet-600 whitespace-nowrap bg-violet-50/50 dark:bg-violet-950/20">
                    <div>RM {formatNumber(totals.closingWebsite)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSpend > 0 ? (totals.closingWebsite / totals.totalSpend) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-sky-600 whitespace-nowrap bg-sky-50/50 dark:bg-sky-950/20">
                    <div>RM {formatNumber(totals.closingCall)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSpend > 0 ? (totals.closingCall / totals.totalSpend) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-rose-600 whitespace-nowrap bg-rose-50/50 dark:bg-rose-950/20">
                    <div>RM {formatNumber(totals.closingLive)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSpend > 0 ? (totals.closingLive / totals.totalSpend) * 100 : 0)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-amber-600 whitespace-nowrap bg-amber-50/50 dark:bg-amber-950/20">
                    <div>RM {formatNumber(totals.closingBegLead)}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalSpend > 0 ? (totals.closingBegLead / totals.totalSpend) * 100 : 0)}</div>
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
