import React, { useState, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Search, Loader2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';

interface Prospect {
  id: string;
  marketer_id_staff: string;
  marketer_name: string;
  tarikh_phone_number: string;
  jenis_prospek: string;
  status_closed: string | null;
  price_closed: number | null;
  admin_id_staff: string | null;
}

interface Order {
  id: string;
  marketer_id_staff: string;
  date_order: string;
  total_price: number;
  jenis_customer: string;
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
  jumlahProspek: number;
  totalSales: number;
  totalSpend: number;
  roas: number;
  kpk: number;
  prospekXGet: number;
  prospekXGetPercent: number;
  prospekXProses: number;
  prospekXProsesPercent: number;
  prospekClose: number;
  prospekClosePercent: number;
  prospekXClose: number;
  prospekXClosePercent: number;
  closingRate: number;
  invalid: number;
  invalidPercent: number;
  tidakAngkat: number;
  tidakAngkatPercent: number;
  busy: number;
  busyPercent: number;
  takMengaku: number;
  takMengakuPercent: number;
  sudahMembeli: number;
  sudahMembeliPercent: number;
  tukarFikiran: number;
  tukarFikiranPercent: number;
  present: number;
  presentPercent: number;
  duplicate: number;
  duplicatePercent: number;
}

const ReportLeads: React.FC = () => {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [spends, setSpends] = useState<Spend[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Date filter state - default to current month
  const today = new Date();
  const [startDate, setStartDate] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(today), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch all data
  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoading(true);
      try {
        // Get marketer names from profiles
        const { data: profiles } = await (supabase as any)
          .from('profiles')
          .select('idstaff, name')
          .eq('role', 'marketer');

        const profileMap: Record<string, string> = {};
        (profiles || []).forEach((p: any) => {
          profileMap[p.idstaff] = p.name;
        });

        const [prospectsRes, ordersRes, spendsRes] = await Promise.all([
          (supabase as any)
            .from('prospects')
            .select('id, marketer_id_staff, tarikh_phone_number, jenis_prospek, status_closed, price_closed, admin_id_staff'),
          (supabase as any)
            .from('customer_purchases')
            .select('id, marketer_id_staff, date_order, total_price, jenis_customer')
            .order('created_at', { ascending: false }),
          (supabase as any)
            .from('spends')
            .select('id, marketer_id_staff, total_spend, tarikh_spend'),
        ]);

        if (prospectsRes.error) throw prospectsRes.error;
        if (ordersRes.error) throw ordersRes.error;
        if (spendsRes.error) throw spendsRes.error;

        // Add marketer names to prospects
        const prospectsWithNames = (prospectsRes.data || []).map((p: any) => ({
          ...p,
          marketer_name: profileMap[p.marketer_id_staff] || p.marketer_id_staff,
        }));

        setProspects(prospectsWithNames);
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
  const filteredProspects = useMemo(() => {
    return prospects.filter(prospect => {
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
  }, [prospects, startDate, endDate]);

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

    // Process prospects
    filteredProspects.forEach(prospect => {
      const idStaff = prospect.marketer_id_staff;
      const name = prospect.marketer_name;

      if (!stats[idStaff]) {
        stats[idStaff] = {
          idStaff,
          name,
          jumlahProspek: 0,
          totalSales: 0,
          totalSpend: 0,
          roas: 0,
          kpk: 0,
          prospekXGet: 0,
          prospekXGetPercent: 0,
          prospekXProses: 0,
          prospekXProsesPercent: 0,
          prospekClose: 0,
          prospekClosePercent: 0,
          prospekXClose: 0,
          prospekXClosePercent: 0,
          closingRate: 0,
          invalid: 0,
          invalidPercent: 0,
          tidakAngkat: 0,
          tidakAngkatPercent: 0,
          busy: 0,
          busyPercent: 0,
          takMengaku: 0,
          takMengakuPercent: 0,
          sudahMembeli: 0,
          sudahMembeliPercent: 0,
          tukarFikiran: 0,
          tukarFikiranPercent: 0,
          present: 0,
          presentPercent: 0,
          duplicate: 0,
          duplicatePercent: 0,
        };
      }

      stats[idStaff].jumlahProspek += 1;

      // Prospek X Get: admin_id_staff is null
      if (!prospect.admin_id_staff) {
        stats[idStaff].prospekXGet += 1;
      }

      // Prospek X Proses: admin_id_staff is not null but status_closed is null
      if (prospect.admin_id_staff && !prospect.status_closed) {
        stats[idStaff].prospekXProses += 1;
      }

      // Prospek Close: status_closed is 'closed' and price_closed is not null
      if (prospect.status_closed === 'closed' && prospect.price_closed !== null) {
        stats[idStaff].prospekClose += 1;
      }

      // Status closed values with price_closed is null (X Close statuses)
      const statusClosed = prospect.status_closed?.toUpperCase();
      if (prospect.price_closed === null && statusClosed) {
        stats[idStaff].prospekXClose += 1;

        if (statusClosed === 'INVALID') {
          stats[idStaff].invalid += 1;
        } else if (statusClosed === 'TIDAK ANGKAT') {
          stats[idStaff].tidakAngkat += 1;
        } else if (statusClosed === 'BUSY') {
          stats[idStaff].busy += 1;
        } else if (statusClosed === 'TAK MENGAKU') {
          stats[idStaff].takMengaku += 1;
        } else if (statusClosed === 'SUDAH MEMBELI') {
          stats[idStaff].sudahMembeli += 1;
        } else if (statusClosed === 'TUKAR FIKIRAN') {
          stats[idStaff].tukarFikiran += 1;
        } else if (statusClosed === 'PRESENT') {
          stats[idStaff].present += 1;
        } else if (statusClosed === 'DUPLICATE') {
          stats[idStaff].duplicate += 1;
        }
      }
    });

    // Process orders - Total Sales from NP and EP only
    filteredOrders.forEach(order => {
      const idStaff = order.marketer_id_staff;
      if (stats[idStaff]) {
        const jenisCustomer = order.jenis_customer?.toUpperCase();
        if (jenisCustomer === 'NP' || jenisCustomer === 'EP') {
          stats[idStaff].totalSales += Number(order.total_price) || 0;
        }
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
      const total = stat.jumlahProspek;

      // ROAS
      stat.roas = stat.totalSpend > 0 ? stat.totalSales / stat.totalSpend : 0;

      // KPK (Kos Per Klik) = Spend / Jumlah Prospek
      stat.kpk = total > 0 ? stat.totalSpend / total : 0;

      // Percentages
      stat.prospekXGetPercent = total > 0 ? (stat.prospekXGet / total) * 100 : 0;
      stat.prospekXProsesPercent = total > 0 ? (stat.prospekXProses / total) * 100 : 0;
      stat.prospekClosePercent = total > 0 ? (stat.prospekClose / total) * 100 : 0;
      stat.prospekXClosePercent = total > 0 ? (stat.prospekXClose / total) * 100 : 0;

      // Closing Rate
      stat.closingRate = total > 0 ? (stat.prospekClose / total) * 100 : 0;

      // Status percentages
      stat.invalidPercent = total > 0 ? (stat.invalid / total) * 100 : 0;
      stat.tidakAngkatPercent = total > 0 ? (stat.tidakAngkat / total) * 100 : 0;
      stat.busyPercent = total > 0 ? (stat.busy / total) * 100 : 0;
      stat.takMengakuPercent = total > 0 ? (stat.takMengaku / total) * 100 : 0;
      stat.sudahMembeliPercent = total > 0 ? (stat.sudahMembeli / total) * 100 : 0;
      stat.tukarFikiranPercent = total > 0 ? (stat.tukarFikiran / total) * 100 : 0;
      stat.presentPercent = total > 0 ? (stat.present / total) * 100 : 0;
      stat.duplicatePercent = total > 0 ? (stat.duplicate / total) * 100 : 0;
    });

    // Convert to array and sort by jumlah prospek
    return Object.values(stats).sort((a, b) => b.jumlahProspek - a.jumlahProspek);
  }, [filteredProspects, filteredOrders, filteredSpends]);

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
        jumlahProspek: acc.jumlahProspek + stat.jumlahProspek,
        totalSales: acc.totalSales + stat.totalSales,
        totalSpend: acc.totalSpend + stat.totalSpend,
        prospekXGet: acc.prospekXGet + stat.prospekXGet,
        prospekXProses: acc.prospekXProses + stat.prospekXProses,
        prospekClose: acc.prospekClose + stat.prospekClose,
        prospekXClose: acc.prospekXClose + stat.prospekXClose,
        invalid: acc.invalid + stat.invalid,
        tidakAngkat: acc.tidakAngkat + stat.tidakAngkat,
        busy: acc.busy + stat.busy,
        takMengaku: acc.takMengaku + stat.takMengaku,
        sudahMembeli: acc.sudahMembeli + stat.sudahMembeli,
        tukarFikiran: acc.tukarFikiran + stat.tukarFikiran,
        present: acc.present + stat.present,
        duplicate: acc.duplicate + stat.duplicate,
      }),
      {
        jumlahProspek: 0,
        totalSales: 0,
        totalSpend: 0,
        prospekXGet: 0,
        prospekXProses: 0,
        prospekClose: 0,
        prospekXClose: 0,
        invalid: 0,
        tidakAngkat: 0,
        busy: 0,
        takMengaku: 0,
        sudahMembeli: 0,
        tukarFikiran: 0,
        present: 0,
        duplicate: 0,
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
            <Users className="w-6 h-6" />
            Report Leads
          </h1>
          <p className="text-muted-foreground mt-1">Leads performance by marketer</p>
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

      {/* Leads Report Table */}
      <div className="form-section">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Leads Report by Marketer
        </h2>

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full min-w-[2400px] border-collapse">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">ID STAFF</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">NAME</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">JUMLAH PROSPEK</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">TOTAL SALES</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">SPEND</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">ROAS</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">KPK</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">X GET</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">X PROSES</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">CLOSE</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">X CLOSE</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">CLOSING %</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">INVALID</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">TIDAK ANGKAT</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">BUSY</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">TAK MENGAKU</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">SUDAH MEMBELI</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">TUKAR FIKIRAN</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">PRESENT</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">DUPLICATE</th>
              </tr>
            </thead>
            <tbody className="bg-background divide-y divide-border">
              {filteredStats.map((stat) => (
                <tr key={stat.idStaff} className="hover:bg-muted/50 transition-colors">
                  <td className="px-3 py-3 text-sm font-medium whitespace-nowrap">{stat.idStaff}</td>
                  <td className="px-3 py-3 text-sm whitespace-nowrap">{stat.name}</td>
                  <td className="px-3 py-3 text-sm text-center font-semibold text-primary whitespace-nowrap">{stat.jumlahProspek}</td>
                  <td className="px-3 py-3 text-sm text-right font-semibold text-success whitespace-nowrap">{formatNumber(stat.totalSales)}</td>
                  <td className="px-3 py-3 text-sm text-right text-warning whitespace-nowrap">{formatNumber(stat.totalSpend)}</td>
                  <td className="px-3 py-3 text-sm text-center text-primary font-medium whitespace-nowrap">{stat.roas.toFixed(2)}x</td>
                  <td className="px-3 py-3 text-sm text-right text-purple-600 whitespace-nowrap">{formatNumber(stat.kpk)}</td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-red-600 font-medium">{stat.prospekXGet}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.prospekXGetPercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-orange-600 font-medium">{stat.prospekXProses}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.prospekXProsesPercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-success font-medium">{stat.prospekClose}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.prospekClosePercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-destructive font-medium">{stat.prospekXClose}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.prospekXClosePercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center font-semibold text-success whitespace-nowrap">{formatPercent(stat.closingRate)}</td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div>{stat.invalid}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.invalidPercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div>{stat.tidakAngkat}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.tidakAngkatPercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div>{stat.busy}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.busyPercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div>{stat.takMengaku}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.takMengakuPercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div>{stat.sudahMembeli}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.sudahMembeliPercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div>{stat.tukarFikiran}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.tukarFikiranPercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div>{stat.present}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.presentPercent)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div>{stat.duplicate}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(stat.duplicatePercent)}</div>
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
                  <td className="px-3 py-3 text-sm whitespace-nowrap">TOTAL</td>
                  <td className="px-3 py-3 text-sm whitespace-nowrap">{filteredStats.length} marketers</td>
                  <td className="px-3 py-3 text-sm text-center text-primary whitespace-nowrap">{totals.jumlahProspek}</td>
                  <td className="px-3 py-3 text-sm text-right text-success whitespace-nowrap">{formatNumber(totals.totalSales)}</td>
                  <td className="px-3 py-3 text-sm text-right text-warning whitespace-nowrap">{formatNumber(totals.totalSpend)}</td>
                  <td className="px-3 py-3 text-sm text-center text-primary whitespace-nowrap">
                    {(totals.totalSpend > 0 ? totals.totalSales / totals.totalSpend : 0).toFixed(2)}x
                  </td>
                  <td className="px-3 py-3 text-sm text-right text-purple-600 whitespace-nowrap">
                    {formatNumber(totals.jumlahProspek > 0 ? totals.totalSpend / totals.jumlahProspek : 0)}
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-red-600">{totals.prospekXGet}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.jumlahProspek > 0 ? (totals.prospekXGet / totals.jumlahProspek) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-orange-600">{totals.prospekXProses}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.jumlahProspek > 0 ? (totals.prospekXProses / totals.jumlahProspek) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-success">{totals.prospekClose}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.jumlahProspek > 0 ? (totals.prospekClose / totals.jumlahProspek) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div className="text-destructive">{totals.prospekXClose}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.jumlahProspek > 0 ? (totals.prospekXClose / totals.jumlahProspek) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center text-success whitespace-nowrap">
                    {formatPercent(totals.jumlahProspek > 0 ? (totals.prospekClose / totals.jumlahProspek) * 100 : 0)}
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div>{totals.invalid}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.jumlahProspek > 0 ? (totals.invalid / totals.jumlahProspek) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div>{totals.tidakAngkat}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.jumlahProspek > 0 ? (totals.tidakAngkat / totals.jumlahProspek) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div>{totals.busy}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.jumlahProspek > 0 ? (totals.busy / totals.jumlahProspek) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div>{totals.takMengaku}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.jumlahProspek > 0 ? (totals.takMengaku / totals.jumlahProspek) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div>{totals.sudahMembeli}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.jumlahProspek > 0 ? (totals.sudahMembeli / totals.jumlahProspek) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div>{totals.tukarFikiran}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.jumlahProspek > 0 ? (totals.tukarFikiran / totals.jumlahProspek) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div>{totals.present}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.jumlahProspek > 0 ? (totals.present / totals.jumlahProspek) * 100 : 0)}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                    <div>{totals.duplicate}</div>
                    <div className="text-xs text-muted-foreground">{formatPercent(totals.jumlahProspek > 0 ? (totals.duplicate / totals.jumlahProspek) * 100 : 0)}</div>
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

export default ReportLeads;
