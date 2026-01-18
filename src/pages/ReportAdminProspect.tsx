import React, { useState, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Search, Loader2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { parseISO, isWithinInterval } from 'date-fns';
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth } from '@/lib/utils';

interface Prospect {
  id: string;
  admin_id_staff: string;
  admin_name: string;
  admin_claimed_at: string;
  status_closed: string | null;
  profile: string | null;
}

interface AdminStats {
  idStaff: string;
  name: string;
  totalLead: number;
  processLead: number;
  processLeadPercent: number;
  xProcessLead: number;
  xProcessLeadPercent: number;
  closeLead: number;
  closeLeadPercent: number;
  xCloseLead: number;
  xCloseLeadPercent: number;
  leadProfile: number;
  leadProfilePercent: number;
  leadXProfile: number;
  leadXProfilePercent: number;
  leadPresent: number;
  leadPresentPercent: number;
}

const ReportAdminProspect: React.FC = () => {
  const [prospects, setProspects] = useState<Prospect[]>([]);
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
        // Get admin names from profiles
        const { data: profiles } = await (supabase as any)
          .from('profiles')
          .select('idstaff, full_name');

        const profileMap: Record<string, string> = {};
        (profiles || []).forEach((p: any) => {
          profileMap[p.idstaff] = p.full_name || p.idstaff;
        });

        // Fetch prospects with admin_id_staff
        const { data: prospectsData, error } = await (supabase as any)
          .from('prospects')
          .select('id, admin_id_staff, admin_claimed_at, status_closed, profile')
          .not('admin_id_staff', 'is', null);

        if (error) throw error;

        // Add admin names to prospects
        const prospectsWithNames = (prospectsData || []).map((p: any) => ({
          ...p,
          admin_name: profileMap[p.admin_id_staff] || p.admin_id_staff,
        }));

        setProspects(prospectsWithNames);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllData();
  }, []);

  // Filter data by date range (using admin_claimed_at)
  const filteredProspects = useMemo(() => {
    return prospects.filter(prospect => {
      if (!prospect.admin_claimed_at) return false;
      try {
        const claimedDate = parseISO(prospect.admin_claimed_at);
        return isWithinInterval(claimedDate, {
          start: parseISO(startDate),
          end: parseISO(endDate + 'T23:59:59')
        });
      } catch {
        return false;
      }
    });
  }, [prospects, startDate, endDate]);

  // Calculate stats by admin
  const adminStats = useMemo(() => {
    const stats: Record<string, AdminStats> = {};

    // Process prospects
    filteredProspects.forEach(prospect => {
      const idStaff = prospect.admin_id_staff;
      const name = prospect.admin_name;

      if (!stats[idStaff]) {
        stats[idStaff] = {
          idStaff,
          name,
          totalLead: 0,
          processLead: 0,
          processLeadPercent: 0,
          xProcessLead: 0,
          xProcessLeadPercent: 0,
          closeLead: 0,
          closeLeadPercent: 0,
          xCloseLead: 0,
          xCloseLeadPercent: 0,
          leadProfile: 0,
          leadProfilePercent: 0,
          leadXProfile: 0,
          leadXProfilePercent: 0,
          leadPresent: 0,
          leadPresentPercent: 0,
        };
      }

      stats[idStaff].totalLead += 1;

      // Process Lead = has any status (not null/empty)
      if (prospect.status_closed && prospect.status_closed !== '') {
        stats[idStaff].processLead += 1;
      } else {
        // X Process Lead = no status yet
        stats[idStaff].xProcessLead += 1;
      }

      // Close Lead = status is 'closed'
      if (prospect.status_closed === 'closed') {
        stats[idStaff].closeLead += 1;
      }

      // X Close Lead = has status but not 'closed'
      if (prospect.status_closed && prospect.status_closed !== '' && prospect.status_closed !== 'closed') {
        stats[idStaff].xCloseLead += 1;
      }

      // Lead Profile = has profile info
      if (prospect.profile && prospect.profile !== '') {
        stats[idStaff].leadProfile += 1;
      } else {
        // Lead X Profile = no profile info
        stats[idStaff].leadXProfile += 1;
      }

      // Lead Present = status is 'PRESENT'
      if (prospect.status_closed === 'PRESENT') {
        stats[idStaff].leadPresent += 1;
      }
    });

    // Calculate percentages
    Object.values(stats).forEach(stat => {
      const total = stat.totalLead;
      stat.processLeadPercent = total > 0 ? (stat.processLead / total) * 100 : 0;
      stat.xProcessLeadPercent = total > 0 ? (stat.xProcessLead / total) * 100 : 0;
      stat.closeLeadPercent = total > 0 ? (stat.closeLead / total) * 100 : 0;
      stat.xCloseLeadPercent = total > 0 ? (stat.xCloseLead / total) * 100 : 0;
      stat.leadProfilePercent = total > 0 ? (stat.leadProfile / total) * 100 : 0;
      stat.leadXProfilePercent = total > 0 ? (stat.leadXProfile / total) * 100 : 0;
      stat.leadPresentPercent = total > 0 ? (stat.leadPresent / total) * 100 : 0;
    });

    // Convert to array and sort by total lead
    return Object.values(stats).sort((a, b) => b.totalLead - a.totalLead);
  }, [filteredProspects]);

  // Filter by search term
  const filteredStats = useMemo(() => {
    if (!searchTerm) return adminStats;
    const term = searchTerm.toLowerCase();
    return adminStats.filter(
      stat =>
        stat.idStaff.toLowerCase().includes(term) ||
        stat.name.toLowerCase().includes(term)
    );
  }, [adminStats, searchTerm]);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredStats.reduce(
      (acc, stat) => ({
        totalLead: acc.totalLead + stat.totalLead,
        processLead: acc.processLead + stat.processLead,
        xProcessLead: acc.xProcessLead + stat.xProcessLead,
        closeLead: acc.closeLead + stat.closeLead,
        xCloseLead: acc.xCloseLead + stat.xCloseLead,
        leadProfile: acc.leadProfile + stat.leadProfile,
        leadXProfile: acc.leadXProfile + stat.leadXProfile,
        leadPresent: acc.leadPresent + stat.leadPresent,
      }),
      {
        totalLead: 0,
        processLead: 0,
        xProcessLead: 0,
        closeLead: 0,
        xCloseLead: 0,
        leadProfile: 0,
        leadXProfile: 0,
        leadPresent: 0,
      }
    );
  }, [filteredStats]);

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
            <Users className="w-6 h-6" />
            Report Admin Prospect
          </h1>
          <p className="text-muted-foreground mt-1">Admin lead processing performance</p>
        </div>
      </div>

      {/* Date Filter */}
      <div className="stat-card">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-5 h-5" />
            <span className="font-medium text-foreground">Tarikh Get:</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="space-y-1">
              <Label htmlFor="startDate" className="text-xs text-muted-foreground">Dari</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endDate" className="text-xs text-muted-foreground">Hingga</Label>
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
              placeholder="Search admin..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {/* Admin Report Table */}
      <div className="form-section">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Admin Prospect Report
        </h2>

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full min-w-[1200px] border-collapse">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">ID STAFF</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">NAME</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">TOTAL LEAD</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">PROCESS LEAD</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">X PROCESS LEAD</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">CLOSE LEAD</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">X CLOSE LEAD</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">LEAD PROFILE</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">LEAD X PROFILE</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">LEAD PRESENT</th>
              </tr>
            </thead>
            <tbody className="bg-background divide-y divide-border">
              {filteredStats.map((stat) => (
                <tr key={stat.idStaff} className="hover:bg-muted/50 transition-colors">
                  <td className="px-3 py-3 text-sm font-medium whitespace-nowrap">{stat.idStaff}</td>
                  <td className="px-3 py-3 text-sm whitespace-nowrap">{stat.name}</td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-blue-500 font-bold">{stat.totalLead}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-green-500 font-bold">{stat.processLead}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.processLeadPercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-orange-500 font-bold">{stat.xProcessLead}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.xProcessLeadPercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-emerald-500 font-bold">{stat.closeLead}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.closeLeadPercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-red-500 font-bold">{stat.xCloseLead}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.xCloseLeadPercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-purple-500 font-bold">{stat.leadProfile}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.leadProfilePercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-gray-500 font-bold">{stat.leadXProfile}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.leadXProfilePercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-amber-500 font-bold">{stat.leadPresent}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.leadPresentPercent)}</div>
                  </td>
                </tr>
              ))}
              {filteredStats.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    No admins found for the selected date range
                  </td>
                </tr>
              )}
            </tbody>
            {filteredStats.length > 0 && (
              <tfoot className="bg-muted/70">
                <tr className="font-semibold">
                  <td className="px-3 py-3 text-sm whitespace-nowrap">TOTAL</td>
                  <td className="px-3 py-3 text-sm whitespace-nowrap">{filteredStats.length} admins</td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-blue-500">{totals.totalLead}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-green-500">{totals.processLead}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalLead > 0 ? (totals.processLead / totals.totalLead) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-orange-500">{totals.xProcessLead}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalLead > 0 ? (totals.xProcessLead / totals.totalLead) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-emerald-500">{totals.closeLead}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalLead > 0 ? (totals.closeLead / totals.totalLead) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-red-500">{totals.xCloseLead}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalLead > 0 ? (totals.xCloseLead / totals.totalLead) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-purple-500">{totals.leadProfile}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalLead > 0 ? (totals.leadProfile / totals.totalLead) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-gray-500">{totals.leadXProfile}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalLead > 0 ? (totals.leadXProfile / totals.totalLead) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-amber-500">{totals.leadPresent}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.totalLead > 0 ? (totals.leadPresent / totals.totalLead) * 100 : 0)}</div>
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

export default ReportAdminProspect;
