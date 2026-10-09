import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Calendar, CheckCircle2, XCircle, Send, Loader2, Search, RotateCw, ListChecks } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useTeam } from '@/hooks/useTeam';
import TeamFilter from '@/components/TeamFilter';
import DateApplyButton from '@/components/DateApplyButton';
import UnappliedDateNote from '@/components/UnappliedDateNote';
import { fetchAllRows, formatDMY, getMalaysiaStartOfMonth, getMalaysiaEndOfMonth } from '@/lib/utils';
import { TRACKING_STATUSES, KEYIN_STATUS } from '@/lib/trackingStatuses';
import { PageHeader, StatCard, TableSkeleton, EmptyState } from '@/components/common/SoftUI';

type Order = {
  id: string; date_order: string; marketer_id_staff: string | null; name_customer: string | null;
  phone_customer: string | null; tracking_number: string | null; delivery_status: string | null; seos: string | null;
};
type Log = { order_id: string; status_key: string; success: boolean; error: string | null; source: string; created_at: string };
type Cell = { last: Log; attempts: number };
type StatusFilter = { key: string; mode: 'any' | 'success' | 'failed' } | null;

const PAGE_SIZE = 50;
const ALL_STATUSES = [KEYIN_STATUS, ...TRACKING_STATUSES];

// Courier-status badge colour from our own delivery_status.
const deliveryTone = (s: string | null) =>
  s === 'Success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : s === 'Return' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      : s === 'Pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const NotificationReport: React.FC = () => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const isMarketer = profile?.role === 'marketer';
  const { nameByIdstaff } = useTeam();

  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  // Picked dates; the data follows startDate/endDate, which only change on Filter.
  const [pendingStart, setPendingStart] = useState(startDate);
  const [pendingEnd, setPendingEnd] = useState(endDate);
  const applyDates = () => { setStartDate(pendingStart); setEndDate(pendingEnd); setPage(1); };
  const [teamFilter, setTeamFilter] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<{ order: Order; statusKey: string; resend: boolean } | null>(null);
  const [sendingKey, setSendingKey] = useState<string | null>(null);

  // Statuses this tenant notifies on (Courier Settings → Tracking Webhook).
  // An unconfigured "Delivered" notifies by default, same as the webhook.
  const { data: enabled = [], isLoading: settingsLoading } = useQuery({
    queryKey: ['notify-enabled-statuses'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('tracking_status_setting').select('status_key, notify');
      if (error) throw error;
      const rows = (data || []) as { status_key: string; notify: boolean }[];
      const on = new Set(rows.filter((r) => r.notify).map((r) => r.status_key));
      if (!rows.some((r) => r.status_key === 'Delivered')) on.add('Delivered');
      return ALL_STATUSES.filter((s) => on.has(s.key));
    },
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ['notify-orders', startDate, endDate],
    queryFn: () => fetchAllRows<Order>(() =>
      (supabase as any)
        .from('customer_purchases')
        .select('id, date_order, marketer_id_staff, name_customer, phone_customer, tracking_number, delivery_status, seos')
        // Only orders with a tracking number — notifications follow the shipment.
        .not('tracking_number', 'is', null)
        .neq('tracking_number', '')
        .gte('date_order', startDate)
        .lte('date_order', endDate)
        .order('date_order', { ascending: false })),
  });

  // Every notify attempt for these orders, oldest first so the last one wins.
  const orderIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const { data: logs = [], isLoading: logsLoading } = useQuery<Log[]>({
    queryKey: ['notify-logs', startDate, endDate, orderIds.length],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const out: Log[] = [];
      for (let i = 0; i < orderIds.length; i += 150) {
        const chunk = orderIds.slice(i, i + 150);
        const rows = await fetchAllRows<Log>(() =>
          (supabase as any)
            .from('wa_notify_log')
            .select('order_id, status_key, success, error, source, created_at')
            .in('order_id', chunk)
            .order('created_at', { ascending: true }));
        out.push(...rows);
      }
      return out;
    },
  });

  // order|status -> latest attempt (+ how many attempts).
  const cells = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const l of logs) {
      const k = `${l.order_id}|${l.status_key}`;
      const prev = m.get(k);
      m.set(k, { last: l, attempts: (prev?.attempts || 0) + 1 });
    }
    return m;
  }, [logs]);

  // Team + search apply to everything (cards and table); the card filter only to the table.
  const baseRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (!isMarketer && teamFilter && (o.marketer_id_staff || '') !== teamFilter) return false;
      if (!q) return true;
      return [o.name_customer, o.phone_customer, o.tracking_number, o.marketer_id_staff]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [orders, search, teamFilter, isMarketer]);

  const cardStats = useMemo(() => enabled.map((s) => {
    let ok = 0, fail = 0;
    for (const o of baseRows) {
      const c = cells.get(`${o.id}|${s.key}`);
      if (!c) continue;
      if (c.last.success) ok++; else fail++;
    }
    return { ...s, ok, fail };
  }), [enabled, baseRows, cells]);

  const rows = useMemo(() => {
    if (!statusFilter) return baseRows;
    return baseRows.filter((o) => {
      const c = cells.get(`${o.id}|${statusFilter.key}`);
      if (!c) return false;
      return statusFilter.mode === 'any' || (statusFilter.mode === 'success') === c.last.success;
    });
  }, [baseRows, statusFilter, cells]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const toggleFilter = (key: string, mode: 'any' | 'success' | 'failed') => {
    setStatusFilter((cur) => (cur && cur.key === key && cur.mode === mode ? null : { key, mode }));
    setPage(1);
  };

  const doSend = async () => {
    if (!confirm) return;
    const { order, statusKey } = confirm;
    const k = `${order.id}|${statusKey}`;
    setConfirm(null);
    setSendingKey(k);
    try {
      const { data, error } = await supabase.functions.invoke('notify-send', { body: { order_id: order.id, status_key: statusKey } });
      if (error) throw error;
      if (data?.success) toast({ title: 'Notifikasi dihantar', description: `${statusKey} → ${order.name_customer || order.phone_customer}` });
      else toast({ title: 'Gagal hantar', description: data?.error || 'Ralat', variant: 'destructive' });
    } catch (e: any) {
      toast({ title: 'Gagal hantar', description: e?.message || 'Ralat', variant: 'destructive' });
    } finally {
      setSendingKey(null);
      queryClient.invalidateQueries({ queryKey: ['notify-logs'] });
    }
  };

  const loading = settingsLoading || ordersLoading || (orderIds.length > 0 && logsLoading);
  const staffLabel = (id: string | null) => {
    if (!id) return { id: 'HQ', name: '' };
    return { id, name: nameByIdstaff.get(id) || '' };
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification"
        description="Status notifikasi WhatsApp kepada customer, ikut setiap status yang diaktifkan di Courier Settings → Tracking Webhook."
        icon={Bell}
        tone="brand"
      />

      {/* Filters */}
      <div className="bg-card border border-border/80 rounded-xl shadow-sm p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
          <div className="flex items-center gap-2 text-muted-foreground sm:self-center">
            <Calendar className="w-5 h-5" /><span className="font-medium text-foreground">Tarikh Order:</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
            <div className="min-w-0 space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={pendingStart} onChange={(e) => setPendingStart(e.target.value)} className="w-full sm:w-40" />
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={pendingEnd} onChange={(e) => setPendingEnd(e.target.value)} className="w-full sm:w-40" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateApplyButton onClick={applyDates} disabled={loading} />
            <UnappliedDateNote pendingStart={pendingStart} pendingEnd={pendingEnd} startDate={startDate} endDate={endDate} />
          </div>
          {!isMarketer && <TeamFilter value={teamFilter} onChange={(v) => { setTeamFilter(v); setPage(1); }} />}
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Cari nama / phone / tracking" className="pl-9 w-full sm:w-60" />
          </div>
        </div>
      </div>

      {/* Cards — one per notify-enabled status; click to filter the table */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard
          icon={ListChecks}
          tone="slate"
          label="Jumlah Order"
          value={baseRows.length}
          hint="Klik untuk papar semua"
          onClick={() => { setStatusFilter(null); setPage(1); }}
          active={!statusFilter}
        />
        {cardStats.map((s) => {
          const active = statusFilter?.key === s.key;
          return (
            <div
              key={s.key}
              role="button"
              tabIndex={0}
              onClick={() => toggleFilter(s.key, 'any')}
              onKeyDown={(e) => { if (e.key === 'Enter') toggleFilter(s.key, 'any'); }}
              className={`stat-card cursor-pointer p-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 ${active ? 'border-primary/40 ring-2 ring-primary/15' : ''}`}
            >
              <div className="section-label mb-2 truncate" title={s.label}>{s.label}</div>
              <div className="flex items-center gap-3 text-base font-semibold">
                <button type="button" onClick={(e) => { e.stopPropagation(); toggleFilter(s.key, 'success'); }}
                  className={`flex items-center gap-1 text-green-600 rounded px-1 ${active && statusFilter?.mode === 'success' ? 'bg-green-100 dark:bg-green-900/30' : ''}`}
                  title="Tapis: berjaya">
                  <CheckCircle2 className="w-4 h-4" />{s.ok}
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); toggleFilter(s.key, 'failed'); }}
                  className={`flex items-center gap-1 text-red-600 rounded px-1 ${active && statusFilter?.mode === 'failed' ? 'bg-red-100 dark:bg-red-900/30' : ''}`}
                  title="Tapis: gagal">
                  <XCircle className="w-4 h-4" />{s.fail}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {!settingsLoading && enabled.length === 0 && (
        <p className="text-sm text-amber-600">Tiada status notifikasi diaktifkan. Aktifkan di Courier Settings → Tracking Webhook.</p>
      )}

      {/* Table */}
      <div className="bg-card border border-border/80 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3 whitespace-nowrap">No</th>
                <th className="p-3 whitespace-nowrap">Date Order</th>
                <th className="p-3 whitespace-nowrap">ID Staff</th>
                <th className="p-3 whitespace-nowrap">Nama Customer</th>
                <th className="p-3 whitespace-nowrap">Phone Customer</th>
                <th className="p-3 whitespace-nowrap">No Tracking</th>
                <th className="p-3 whitespace-nowrap">Delivery Status</th>
                <th className="p-3 whitespace-nowrap">Status Tracking</th>
                {enabled.map((s) => <th key={s.key} className="p-3 text-center whitespace-nowrap">{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8 + enabled.length} className="p-3"><TableSkeleton rows={6} cols={8} /></td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={8 + enabled.length} className="text-muted-foreground"><EmptyState icon={Bell} title="Tiada order." /></td></tr>
              ) : pageRows.map((o, i) => {
                const staff = staffLabel(o.marketer_id_staff);
                return (
                  <tr key={o.id} className="border-t border-border hover:bg-muted/40">
                    <td className="p-3">{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="p-3 whitespace-nowrap">{formatDMY(o.date_order)}</td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="font-mono text-xs">{staff.id}</div>
                      {staff.name && <div className="text-xs text-muted-foreground">{staff.name}</div>}
                    </td>
                    <td className="p-3">{o.name_customer || '-'}</td>
                    <td className="p-3 whitespace-nowrap">{o.phone_customer || '-'}</td>
                    <td className="p-3 whitespace-nowrap font-mono text-xs">{o.tracking_number || '-'}</td>
                    <td className="p-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${deliveryTone(o.delivery_status)}`}>{o.delivery_status || '-'}</span>
                    </td>
                    <td className="p-3 text-xs">
                      <div className="max-w-[200px] truncate" title={o.seos || ''}>{o.seos || '-'}</div>
                    </td>
                    {enabled.map((s) => {
                      const k = `${o.id}|${s.key}`;
                      const c = cells.get(k);
                      if (sendingKey === k) return <td key={s.key} className="p-3 text-center"><Loader2 className="w-4 h-4 animate-spin inline text-muted-foreground" /></td>;
                      if (c?.last.success) {
                        return (
                          <td key={s.key} className="p-3 text-center">
                            <span className="inline-flex" title={`Berjaya · ${fmtTime(c.last.created_at)} · ${c.last.source === 'manual' ? 'manual' : 'auto'}`}>
                              <CheckCircle2 className="w-5 h-5 text-green-600" aria-label="Berjaya" />
                            </span>
                          </td>
                        );
                      }
                      if (c) {
                        return (
                          <td key={s.key} className="p-3 text-center whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-flex" title={`Gagal · ${fmtTime(c.last.created_at)}${c.last.error ? ` · ${c.last.error}` : ''}${c.attempts > 1 ? ` · ${c.attempts} cubaan` : ''}`}>
                                <XCircle className="w-5 h-5 text-red-600" aria-label="Gagal" />
                              </span>
                              <Button size="sm" variant="ghost" className="h-7 px-1.5" title="Hantar semula"
                                onClick={() => setConfirm({ order: o, statusKey: s.key, resend: true })}>
                                <RotateCw className="w-3.5 h-3.5" />
                              </Button>
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td key={s.key} className="p-3 text-center">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setConfirm({ order: o, statusKey: s.key, resend: false })}>
                            <Send className="w-3 h-3 mr-1" />Send
                          </Button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-t border-border text-sm">
            <span className="text-muted-foreground">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} daripada {rows.length}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Sebelum</Button>
              <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Seterus</Button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.resend ? 'Hantar semula notifikasi?' : 'Hantar notifikasi?'}</AlertDialogTitle>
            <AlertDialogDescription>
              Status <b>{confirm?.statusKey}</b> akan dihantar melalui WhatsApp kepada <b>{confirm?.order.name_customer || '-'}</b> ({confirm?.order.phone_customer || '-'}),
              guna template dari Courier Settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={doSend}><Send className="w-4 h-4 mr-1" />Hantar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default NotificationReport;
