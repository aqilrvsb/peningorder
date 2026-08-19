import React, { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows, formatRM } from '@/lib/utils';
import { TeamFilter } from '@/components/TeamFilter';
import {
  BarChart3, RefreshCw, Clock, Truck, RotateCcw, CheckCircle2, DollarSign, Wallet, Loader2,
} from 'lucide-react';

type Order = { date_order: string | null; delivery_status: string | null; tracking_number: string | null; total_sale: number | null; type_payment: string | null; date_payment: string | null; kurier: string | null; marketer_id_staff: string | null };
type Bucket = { orders: number; sales: number };
type Period = { label: string; range: string; start: string; end: string };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ymd = (d: Date) => d.toISOString().split('T')[0];
const fmtDate = (s: string) => { const [y, m, d] = s.split('-'); return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`; };
const isCod = (o: Order) => o.type_payment === 'COD' || (o.kurier?.includes('COD') ?? false);

// Collection: CASH is collected upfront; COD is collected only once remitted
// (date_payment set); a returned parcel means no money.
const collectionStatus = (o: Order): 'Success' | 'Pending' | 'Return' => {
  if (o.delivery_status === 'Return' || o.delivery_status === 'Failed') return 'Return';
  if (!isCod(o)) return 'Success';
  return o.date_payment ? 'Success' : 'Pending';
};

// Two dimensions: delivery lifecycle (Pending -> Shipped -> Return/Success,
// driven by the courier webhook) and money collection.
const STATUS_ROWS: { key: string; label: string; color: string; icon: React.ReactNode; test: (o: Order) => boolean }[] = [
  { key: 'pending', label: 'Pending', color: 'text-yellow-500', icon: <Clock className="w-3.5 h-3.5" />, test: (o) => o.delivery_status === 'Pending' },
  { key: 'shipped', label: 'Shipped', color: 'text-blue-500', icon: <Truck className="w-3.5 h-3.5" />, test: (o) => o.delivery_status === 'Shipped' },
  { key: 'return', label: 'Return', color: 'text-red-500', icon: <RotateCcw className="w-3.5 h-3.5" />, test: (o) => o.delivery_status === 'Return' },
  { key: 'success', label: 'Success', color: 'text-green-500', icon: <CheckCircle2 className="w-3.5 h-3.5" />, test: (o) => o.delivery_status === 'Success' },
  { key: 'remainCollect', label: 'Remaining Collection', color: 'text-amber-500', icon: <DollarSign className="w-3.5 h-3.5" />, test: (o) => collectionStatus(o) === 'Pending' },
  { key: 'successCollect', label: 'Success Collection', color: 'text-emerald-600', icon: <Wallet className="w-3.5 h-3.5" />, test: (o) => collectionStatus(o) === 'Success' },
];

function nowMY() { return new Date(Date.now() + 8 * 3600 * 1000); }

// Fixed quick periods (Last Month replaced by the Month/Year filter card below).
function quickPeriods(): Period[] {
  const now = nowMY();
  const today = ymd(now);
  const yst = new Date(now); yst.setUTCDate(yst.getUTCDate() - 1);
  const yesterday = ymd(yst);
  const dow = (now.getUTCDay() + 6) % 7; // 0 = Monday
  const weekStart = new Date(now); weekStart.setUTCDate(weekStart.getUTCDate() - dow);
  const lastWeekEnd = new Date(weekStart); lastWeekEnd.setUTCDate(lastWeekEnd.getUTCDate() - 1);
  const lastWeekStart = new Date(lastWeekEnd); lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 6);
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const R = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)} - ${fmtDate(b)}`);
  return [
    { label: 'Today', start: today, end: today, range: fmtDate(today) },
    { label: 'Yesterday', start: yesterday, end: yesterday, range: fmtDate(yesterday) },
    { label: 'This Week', start: ymd(weekStart), end: today, range: R(ymd(weekStart), today) },
    { label: 'Last Week', start: ymd(lastWeekStart), end: ymd(lastWeekEnd), range: R(ymd(lastWeekStart), ymd(lastWeekEnd)) },
    { label: 'This Month', start: monthStart, end: today, range: R(monthStart, today) },
  ];
}

const selectCls = 'h-9 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';

const SalesOverview: React.FC = () => {
  const now = nowMY();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selMonth, setSelMonth] = useState(now.getUTCMonth());
  const [selYear, setSelYear] = useState(now.getUTCFullYear());
  const [teamFilter, setTeamFilter] = useState('');

  const years = useMemo(() => {
    const y = nowMY().getUTCFullYear();
    return [y, y - 1, y - 2, y - 3];
  }, []);

  // The user-selected month card.
  const selectedPeriod: Period = useMemo(() => {
    const start = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-01`;
    const end = ymd(new Date(Date.UTC(selYear, selMonth + 1, 0)));
    return { label: `${MONTHS[selMonth]} ${selYear}`, start, end, range: `${fmtDate(start)} - ${fmtDate(end)}` };
  }, [selMonth, selYear]);

  const load = async () => {
    setLoading(true);
    try {
      // Cover the quick periods (~this + last month) AND the selected month (may be older).
      const backstop = ymd(new Date(nowMY().getTime() - 45 * 86400000));
      const from = selectedPeriod.start < backstop ? selectedPeriod.start : backstop;
      const data = await fetchAllRows<Order>(() =>
        (supabase as any).from('customer_purchases')
          .select('date_order, delivery_status, tracking_number, total_sale, type_payment, date_payment, kurier, marketer_id_staff')
          .gte('date_order', from)
          .order('date_order', { ascending: false })
      );
      setOrders(data || []);
    } catch (e) {
      console.error('SalesOverview load failed:', e);
    } finally {
      setLoading(false);
    }
  };

  // Reload when the selected month/year moves out of the fetched range.
  useEffect(() => { load(); }, [selMonth, selYear]);

  const periods = useMemo(() => [...quickPeriods(), selectedPeriod], [selectedPeriod]);

  const computed = useMemo(() => periods.map((p) => {
    const inRange = orders.filter((o) => {
      if (teamFilter && (o.marketer_id_staff || '') !== teamFilter) return false;
      const d = o.date_order || ''; return d >= p.start && d <= p.end;
    });
    const stats: Record<string, Bucket> = {};
    for (const r of STATUS_ROWS) {
      const arr = inRange.filter(r.test);
      stats[r.key] = { orders: arr.length, sales: arr.reduce((s, o) => s + (Number(o.total_sale) || 0), 0) };
    }
    const total: Bucket = { orders: inRange.length, sales: inRange.reduce((s, o) => s + (Number(o.total_sale) || 0), 0) };
    return { ...p, stats, total };
  }), [periods, orders, teamFilter]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><BarChart3 className="w-6 h-6" /></span>
          <div>
            <h1 className="text-2xl font-bold">Sales Overview</h1>
            <p className="text-muted-foreground text-sm">Track your sales performance and order statistics</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TeamFilter value={teamFilter} onChange={setTeamFilter} />
          <span className="text-sm text-muted-foreground">Filter month:</span>
          <select className={selectCls} value={selMonth} onChange={(e) => setSelMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select className={selectCls} value={selYear} onChange={(e) => setSelYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {computed.map((c) => (
            <div key={c.label} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-primary">{c.label}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.range}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Revenue</p>
                  <p className="text-sm font-bold text-green-600 dark:text-green-400">RM {formatRM(c.total.sales)}</p>
                </div>
              </div>

              <table className="w-full mt-4 text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left font-medium pb-1">Status</th>
                    <th className="text-center font-medium pb-1">Orders</th>
                    <th className="text-right font-medium pb-1">Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {STATUS_ROWS.map((r) => (
                    <tr key={r.key} className="border-t border-border/50">
                      <td className="py-2">
                        <span className={`inline-flex items-center gap-2 font-medium ${r.color}`}>{r.icon}{r.label}</span>
                      </td>
                      <td className={`py-2 text-center tabular-nums ${(r.key === 'success' || r.key === 'successCollect') ? 'text-green-600 dark:text-green-400 font-medium' : 'text-foreground'}`}>{c.stats[r.key].orders}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">RM {formatRM(c.stats[r.key].sales)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border font-bold">
                    <td className="py-2">TOTAL</td>
                    <td className="py-2 text-center tabular-nums">{c.total.orders}</td>
                    <td className="py-2 text-right tabular-nums">RM {formatRM(c.total.sales)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SalesOverview;
