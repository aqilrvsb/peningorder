import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calendar, Loader2, Filter, Trophy, Medal, Award, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth } from '@/lib/utils';

interface RankRow {
  idstaff: string;
  name: string;
  total_sales: number;
  return_sales: number;
  collection: number;
  spend: number;
  np: number;
  ep: number;
  ec: number;
}

const podium = [
  { label: 'CHAMPION', icon: Trophy, ring: 'border-amber-300 dark:border-amber-700', bg: 'bg-amber-50/70 dark:bg-amber-950/20', badge: 'bg-amber-400 text-amber-950', text: 'text-amber-600 dark:text-amber-400', iconBg: 'bg-amber-100 dark:bg-amber-900/40' },
  { label: 'RUNNER UP', icon: Medal, ring: 'border-slate-300 dark:border-slate-700', bg: 'bg-slate-50/70 dark:bg-slate-900/30', badge: 'bg-slate-400 text-slate-950', text: 'text-slate-600 dark:text-slate-300', iconBg: 'bg-slate-100 dark:bg-slate-800/60' },
  { label: '3RD PLACE', icon: Award, ring: 'border-orange-300 dark:border-orange-800', bg: 'bg-orange-50/70 dark:bg-orange-950/20', badge: 'bg-orange-400 text-orange-950', text: 'text-orange-600 dark:text-orange-400', iconBg: 'bg-orange-100 dark:bg-orange-900/40' },
];

const AccountTopRanking: React.FC = () => {
  const [pendingStart, setPendingStart] = useState(getMalaysiaStartOfMonth());
  const [pendingEnd, setPendingEnd] = useState(getMalaysiaEndOfMonth());
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  const [search, setSearch] = useState('');

  const applyFilter = () => { setStartDate(pendingStart); setEndDate(pendingEnd); };

  const { data: rows = [], isLoading } = useQuery<RankRow[]>({
    queryKey: ['team-ranking', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('team_ranking', { p_start: startDate, p_end: endDate });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        idstaff: r.idstaff,
        name: r.name || r.idstaff,
        total_sales: Number(r.total_sales) || 0,
        return_sales: Number(r.return_sales) || 0,
        collection: Number(r.collection) || 0,
        spend: Number(r.spend) || 0,
        np: Number(r.np) || 0,
        ep: Number(r.ep) || 0,
        ec: Number(r.ec) || 0,
      })) as RankRow[];
    },
  });

  const formatNumber = (v: number) =>
    new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const roasOf = (r: RankRow) => (r.spend > 0 ? r.total_sales / r.spend : 0);
  // Customer NP/EP/EC = sales amount for that type, shown with % of the staff's sales.
  const salesPct = (v: number, total: number) => `RM ${formatNumber(v)} (${total > 0 ? ((v / total) * 100).toFixed(1) : '0.0'}%)`;

  // Ranked by Total Sales desc (RPC already orders); rank = global position.
  const ranked = useMemo(() => rows.map((r, i) => ({ ...r, rank: i + 1 })), [rows]);
  const top3 = ranked.slice(0, 3);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter((r) => r.name.toLowerCase().includes(q) || r.idstaff.toLowerCase().includes(q));
  }, [ranked, search]);

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
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Trophy className="w-6 h-6" /> Top Ranking
        </h1>
        <p className="text-muted-foreground mt-1">Performance leaderboard team</p>
      </div>

      {/* Date filter */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-5 h-5" />
            <span className="font-medium text-foreground">Date Range:</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={pendingStart} onChange={(e) => setPendingStart(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={pendingEnd} onChange={(e) => setPendingEnd(e.target.value)} className="w-40" />
            </div>
            <Button onClick={applyFilter} size="sm" className="h-9"><Filter className="w-4 h-4 mr-1" />Filter</Button>
          </div>
        </div>
      </div>

      {/* Top Performers podium */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-4"><Trophy className="w-5 h-5 text-primary" /> Top Performers</h2>
        {top3.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">Tiada data untuk tempoh ini.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {top3.map((r, i) => {
              const p = podium[i];
              const Icon = p.icon;
              return (
                <div key={r.idstaff} className={`relative rounded-xl border-2 ${p.ring} ${p.bg} p-5`}>
                  <div className={`absolute -top-3 -right-3 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shadow ${p.badge}`}>{r.rank}</div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${p.iconBg}`}>
                      <Icon className={`w-6 h-6 ${p.text}`} />
                    </div>
                    <div className="min-w-0">
                      <div className={`text-xs font-bold tracking-wide ${p.text}`}>{p.label}</div>
                      <div className="font-bold text-foreground truncate">{r.name}</div>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>ID Staff</span><span className="font-mono text-foreground">{r.idstaff}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-muted-foreground">Total Sales</span>
                    <span className={`font-bold ${p.text}`}>RM {formatNumber(r.total_sales)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full rankings */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="font-semibold">Full Rankings</h2>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search marketer..." className="pl-9 h-9" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left">No</th>
                <th className="p-3 text-left">ID Staff</th>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-right">Total Sales</th>
                <th className="p-3 text-right text-red-600 dark:text-red-400">Return</th>
                <th className="p-3 text-right text-green-600 dark:text-green-400">Collection</th>
                <th className="p-3 text-right text-indigo-600 dark:text-indigo-400">Spend</th>
                <th className="p-3 text-right text-amber-600 dark:text-amber-400">ROAS</th>
                <th className="p-3 text-right text-green-600 dark:text-green-400">Customer NP</th>
                <th className="p-3 text-right text-purple-600 dark:text-purple-400">Customer EP</th>
                <th className="p-3 text-right text-amber-600 dark:text-amber-400">Customer EC</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.idstaff} className="border-t border-border hover:bg-muted/30">
                  <td className="p-3">
                    <span className={`inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full text-xs font-bold ${r.rank <= 3 ? podium[r.rank - 1].badge : 'bg-muted text-muted-foreground'}`}>{r.rank}</span>
                  </td>
                  <td className="p-3 font-mono">{r.idstaff}</td>
                  <td className="p-3">{r.name}</td>
                  <td className="p-3 text-right tabular-nums font-medium">RM {formatNumber(r.total_sales)}</td>
                  <td className="p-3 text-right tabular-nums text-red-600 dark:text-red-400">RM {formatNumber(r.return_sales)}</td>
                  <td className="p-3 text-right tabular-nums text-green-600 dark:text-green-400">RM {formatNumber(r.collection)}</td>
                  <td className="p-3 text-right tabular-nums text-indigo-600 dark:text-indigo-400">RM {formatNumber(r.spend)}</td>
                  <td className="p-3 text-right tabular-nums text-amber-600 dark:text-amber-400">{roasOf(r).toFixed(2)}x</td>
                  <td className="p-3 text-right tabular-nums text-green-600 dark:text-green-400 whitespace-nowrap">{salesPct(r.np, r.total_sales)}</td>
                  <td className="p-3 text-right tabular-nums text-purple-600 dark:text-purple-400 whitespace-nowrap">{salesPct(r.ep, r.total_sales)}</td>
                  <td className="p-3 text-right tabular-nums text-amber-600 dark:text-amber-400 whitespace-nowrap">{salesPct(r.ec, r.total_sales)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Tiada marketer dijumpai.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AccountTopRanking;
