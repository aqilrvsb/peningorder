import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Banknote, Calendar, ExternalLink, Eye, Package, Truck, Receipt } from 'lucide-react';
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, fetchAllRows, formatRM, formatDMY } from '@/lib/utils';
import { useTeam } from '@/hooks/useTeam';
import { TeamFilter } from '@/components/TeamFilter';
import { TablePagination } from '@/components/TablePagination';
import { ReceiptViewer } from '@/components/ReceiptViewer';
import DateApplyButton from '@/components/DateApplyButton';
import UnappliedDateNote from '@/components/UnappliedDateNote';
import { PageHeader, StatCard, IconTile, TableSkeleton, EmptyState } from '@/components/common/SoftUI';

type CashOrder = {
  id: string;
  id_sale: string | null;
  date_order: string | null;
  name_customer: string | null;
  phone_customer: string | null;
  total_sale: number | null;
  bank_payment: string | null;
  tracking_number: string | null;
  type_payment: string | null;
  kurier: string | null;
  marketer_id_staff: string | null;
  receipt_payment_url: string | null;
  receipt_payment_type: string | null;
  bundle?: { name: string | null } | null;
};

// Classify the payment proof: explicit type wins; otherwise infer from the URL
// (our uploaded receipts live on Vercel Blob storage, pasted proofs don't).
const proofType = (o: CashOrder): 'image' | 'link' | 'none' => {
  if (!o.receipt_payment_url) return 'none';
  if (o.receipt_payment_type === 'image' || o.receipt_payment_type === 'link') return o.receipt_payment_type;
  return o.receipt_payment_url.includes('vercel-storage.com') ? 'image' : 'link';
};

// Normalise a stored kurier to its base courier for grouping + filtering.
const baseCourier = (kurier?: string): string => {
  const k = (kurier || '').toLowerCase();
  if (k.includes('poslaju')) return 'Poslaju';
  if (k.includes('ninjavan')) return 'Ninjavan';
  if (k.includes('jnt')) return 'JNT';
  if (k.includes('dhl')) return 'DHL';
  if (k.includes('spx')) return 'SPX';
  if (k.includes('tiktok')) return 'Tiktok';
  return kurier?.trim() || 'Lain';
};

const AccountOrderCash: React.FC = () => {
  const [orders, setOrders] = useState<CashOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  // Picked dates; the data follows startDate/endDate, which only change on Filter.
  const [pendingStart, setPendingStart] = useState(startDate);
  const [pendingEnd, setPendingEnd] = useState(endDate);
  const applyDates = () => { setStartDate(pendingStart); setEndDate(pendingEnd); };
  const [teamFilter, setTeamFilter] = useState('');
  // Independent filters so a courier box and a proof sub-line can compose.
  const [payFilter, setPayFilter] = useState<'All' | 'CASH' | 'Pickup'>('All');
  const [proofFilter, setProofFilter] = useState<'All' | 'image' | 'link' | 'none'>('All');
  const [courierFilter, setCourierFilter] = useState<string>('All');
  const [viewing, setViewing] = useState<CashOrder | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { nameByIdstaff } = useTeam();

  const load = async () => {
    setLoading(true);
    try {
      // RLS scopes rows to this tenant (and to their own rows for staff).
      const data = await fetchAllRows<CashOrder>(() =>
        (supabase as any)
          .from('customer_purchases')
          .select('id, id_sale, date_order, name_customer, phone_customer, total_sale, bank_payment, tracking_number, type_payment, kurier, marketer_id_staff, receipt_payment_url, receipt_payment_type, bundle:logistic_bundles(name)')
          .in('type_payment', ['CASH', 'Pickup'])
          .gte('date_order', startDate)
          .lte('date_order', endDate)
          .order('date_order', { ascending: false })
      );
      setOrders(data || []);
    } catch (e) {
      console.error('Order Cash load failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [startDate, endDate]);

  const isPickup = (o: CashOrder) => (o.type_payment || '') === 'Pickup';
  // Group key for the by-Kurier summary: pickup self-collect has no courier.
  const courierOf = (o: CashOrder) => (isPickup(o) ? 'Pickup' : baseCourier(o.kurier || undefined));

  // A proof breakdown {total, resit(image), link, tiada(none)} for any subset.
  const breakdown = (arr: CashOrder[]) => ({
    total: arr.length,
    resit: arr.filter((o) => proofType(o) === 'image').length,
    link: arr.filter((o) => proofType(o) === 'link').length,
    tiada: arr.filter((o) => proofType(o) === 'none').length,
  });

  const counts = useMemo(() => {
    const teamed = teamFilter ? orders.filter((o) => (o.marketer_id_staff || '') === teamFilter) : orders;
    const cash = teamed.filter((o) => !isPickup(o));
    const pickup = teamed.filter((o) => isPickup(o));
    // By-courier groups (across CASH + PICKUP), sorted by volume.
    const byCourier = new Map<string, CashOrder[]>();
    teamed.forEach((o) => {
      const c = courierOf(o);
      if (!byCourier.has(c)) byCourier.set(c, []);
      byCourier.get(c)!.push(o);
    });
    const couriers = Array.from(byCourier.entries())
      .map(([name, arr]) => ({ name, ...breakdown(arr) }))
      .sort((a, b) => b.total - a.total);
    return {
      all: teamed.length,
      cash: breakdown(cash),
      pickup: breakdown(pickup),
      couriers,
    };
  }, [orders, teamFilter]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (teamFilter && (o.marketer_id_staff || '') !== teamFilter) return false;
      if (payFilter === 'CASH' && isPickup(o)) return false;
      if (payFilter === 'Pickup' && !isPickup(o)) return false;
      if (proofFilter !== 'All' && proofType(o) !== proofFilter) return false;
      if (courierFilter !== 'All' && courierOf(o) !== courierFilter) return false;
      return true;
    });
  }, [orders, teamFilter, payFilter, proofFilter, courierFilter]);

  const totalCash = useMemo(() => filtered.reduce((s, o) => s + (Number(o.total_sale) || 0), 0), [filtered]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [teamFilter, payFilter, proofFilter, courierFilter, startDate, endDate]);

  // Box/sub-line filter helpers. Setting pay/courier resets proof unless one is given.
  const setFilter = (opts: { pay?: 'All' | 'CASH' | 'Pickup'; proof?: 'All' | 'image' | 'link' | 'none'; courier?: string }) => {
    setPayFilter(opts.pay ?? 'All');
    setCourierFilter(opts.courier ?? 'All');
    setProofFilter(opts.proof ?? 'All');
  };
  const allCleared = payFilter === 'All' && proofFilter === 'All' && courierFilter === 'All';
  const boxCls = (active: boolean) =>
    `rounded-xl border bg-card p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${active ? 'border-primary/40 ring-2 ring-primary/15' : 'border-border/80'}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Order CASH + PICKUP"
        description={<>Semua order CASH &amp; PICKUP dengan bukti bayaran (resit atau link), ikut tarikh order.</>}
        icon={Banknote}
        tone="brand"
      />

      {/* Filters */}
      <div className="bg-card border border-border/80 rounded-xl shadow-sm p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex items-center gap-2 text-muted-foreground">
            <IconTile icon={Calendar} tone="blue" size="sm" /><span className="text-sm font-medium text-foreground">Tarikh Order:</span>
          </div>
          <div>
            <label className="section-label block mb-1">Dari</label>
            <Input type="date" value={pendingStart} onChange={(e) => setPendingStart(e.target.value)} className="w-full sm:w-40" />
          </div>
          <div>
            <label className="section-label block mb-1">Hingga</label>
            <Input type="date" value={pendingEnd} onChange={(e) => setPendingEnd(e.target.value)} className="w-full sm:w-40" />
          </div>
          <div className="flex flex-wrap items-center gap-2"><DateApplyButton onClick={applyDates} /><UnappliedDateNote pendingStart={pendingStart} pendingEnd={pendingEnd} startDate={startDate} endDate={endDate} /></div>
          <div className="flex items-end">
            <TeamFilter value={teamFilter} onChange={setTeamFilter} className="w-full sm:w-auto" />
          </div>
        </div>
      </div>

      {/* Summary — Total Order (CASH+PICKUP), Total CASH, Total PICKUP.
          The three proof sub-lines under CASH/PICKUP are themselves clickable. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 sm:gap-4">
        {/* Total Order — clears every filter */}
        <StatCard
          icon={Banknote}
          tone="blue"
          label="Total Order (CASH + PICKUP)"
          value={counts.all}
          onClick={() => setFilter({})}
          active={allCleared}
          className="col-span-2 md:col-span-1"
        />

        {/* Total CASH */}
        {([
          { pay: 'CASH' as const, label: 'Total CASH', bd: counts.cash, accent: 'text-green-600 dark:text-green-400', icon: Banknote, tone: 'green' as const },
          { pay: 'Pickup' as const, label: 'Total PICKUP', bd: counts.pickup, accent: 'text-blue-600 dark:text-blue-400', icon: Package, tone: 'cyan' as const },
        ]).map((b) => (
          <div key={b.pay} className={boxCls(payFilter === b.pay)}>
            <button onClick={() => setFilter({ pay: b.pay })} className="flex w-full items-center gap-3 text-left">
              <IconTile icon={b.icon} tone={b.tone} />
              <div className="min-w-0">
                <p className={`text-xl sm:text-2xl font-bold leading-tight tracking-tight ${b.accent}`}>{b.bd.total}</p>
                <p className="mt-1 truncate text-xs font-medium text-muted-foreground">{b.label}</p>
              </div>
            </button>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 border-t border-border/60 pt-2 text-xs">
              <button onClick={() => setFilter({ pay: b.pay, proof: 'image' })} className={`hover:underline ${payFilter === b.pay && proofFilter === 'image' ? 'font-bold underline' : ''} text-emerald-600 dark:text-emerald-400`}>Resit {b.bd.resit}</button>
              <button onClick={() => setFilter({ pay: b.pay, proof: 'link' })} className={`hover:underline ${payFilter === b.pay && proofFilter === 'link' ? 'font-bold underline' : ''} text-blue-600 dark:text-blue-400`}>Link {b.bd.link}</button>
              <button onClick={() => setFilter({ pay: b.pay, proof: 'none' })} className={`hover:underline ${payFilter === b.pay && proofFilter === 'none' ? 'font-bold underline' : ''} text-red-600 dark:text-red-400`}>Tiada Both {b.bd.tiada}</button>
            </div>
          </div>
        ))}
      </div>

      {/* Summary by Kurier — each courier with proof breakdown, all clickable */}
      {counts.couriers.length > 0 && (
        <div>
          <p className="section-label mb-2 flex items-center gap-2"><IconTile icon={Truck} tone="cyan" size="sm" />Ringkasan Ikut Kurier</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {counts.couriers.map((c) => (
              <div key={c.name} className={boxCls(courierFilter === c.name)}>
                <button onClick={() => setFilter({ courier: c.name })} className="flex w-full items-center gap-3 text-left">
                  <IconTile icon={c.name === 'Pickup' ? Package : Truck} tone={c.name === 'Pickup' ? 'cyan' : 'slate'} />
                  <div className="min-w-0">
                    <p className="text-xl sm:text-2xl font-bold leading-tight tracking-tight text-foreground">{c.total}</p>
                    <p className="mt-1 truncate text-xs font-medium text-muted-foreground">{c.name}</p>
                  </div>
                </button>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 border-t border-border/60 pt-2 text-xs">
                  <button onClick={() => setFilter({ courier: c.name, proof: 'none' })} className={`hover:underline ${courierFilter === c.name && proofFilter === 'none' ? 'font-bold underline' : ''} text-red-600 dark:text-red-400`}>Tiada {c.tiada}</button>
                  <button onClick={() => setFilter({ courier: c.name, proof: 'image' })} className={`hover:underline ${courierFilter === c.name && proofFilter === 'image' ? 'font-bold underline' : ''} text-emerald-600 dark:text-emerald-400`}>Resit {c.resit}</button>
                  <button onClick={() => setFilter({ courier: c.name, proof: 'link' })} className={`hover:underline ${courierFilter === c.name && proofFilter === 'link' ? 'font-bold underline' : ''} text-blue-600 dark:text-blue-400`}>Link {c.link}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border/80 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} cols={7} className="p-4" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-2 text-left">No</th>
                  <th className="p-2 text-left text-blue-600 dark:text-blue-400">ID Staff</th>
                  <th className="p-2 text-left text-blue-600 dark:text-blue-400">Nama</th>
                  <th className="p-2 text-left">Id Sales</th>
                  <th className="p-2 text-left">Tracking</th>
                  <th className="p-2 text-left">Tarikh Order</th>
                  <th className="p-2 text-left">Pelanggan</th>
                  <th className="p-2 text-left">Produk</th>
                  <th className="p-2 text-left">Cara Bayaran</th>
                  <th className="p-2 text-left">Bank</th>
                  <th className="p-2 text-right">Jumlah (RM)</th>
                  <th className="p-2 text-center">Bukti</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((o, i) => {
                  const pt = proofType(o);
                  return (
                    <tr key={o.id} className="border-t border-border hover:bg-muted/40 transition-colors">
                      <td className="p-2">{(page - 1) * pageSize + i + 1}</td>
                      <td className="p-2 font-mono text-blue-600 dark:text-blue-400 whitespace-nowrap">{o.marketer_id_staff || '-'}</td>
                      <td className="p-2 whitespace-nowrap">{nameByIdstaff.get(o.marketer_id_staff || '') || '-'}</td>
                      <td className="p-2 whitespace-nowrap">{o.id_sale || '-'}</td>
                      <td className="p-2 whitespace-nowrap font-mono text-xs">{o.tracking_number || '-'}</td>
                      <td className="p-2 whitespace-nowrap">{formatDMY(o.date_order)}</td>
                      <td className="p-2">{o.name_customer || '-'}</td>
                      <td className="p-2">{o.bundle?.name || '-'}</td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPickup(o) ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                          {isPickup(o) ? 'PICKUP' : 'CASH'}
                        </span>
                      </td>
                      <td className="p-2">{o.bank_payment || '-'}</td>
                      <td className="p-2 text-right tabular-nums whitespace-nowrap">{formatRM(Number(o.total_sale) || 0)}</td>
                      <td className="p-2 text-center">
                        {pt === 'none' ? (
                          <span className="text-xs text-muted-foreground">Tiada</span>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pt === 'image' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                              {pt === 'image' ? 'Receipt' : 'Link'}
                            </span>
                            <Button size="sm" variant="outline" className="h-7"
                              onClick={() => (pt === 'image' ? setViewing(o) : window.open(o.receipt_payment_url!, '_blank'))}>
                              {pt === 'image' ? <><Eye className="w-3.5 h-3.5 mr-1" />Lihat</> : <><ExternalLink className="w-3.5 h-3.5 mr-1" />Buka</>}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={12} className="p-0"><EmptyState icon={Receipt} title="Tiada order cash dalam tempoh ini." /></td></tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t border-border bg-muted/40 font-semibold">
                    <td className="p-2" colSpan={10}>Jumlah Cash ({filtered.length} order)</td>
                    <td className="p-2 text-right tabular-nums whitespace-nowrap text-green-600 dark:text-green-400">{formatRM(totalCash)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
            <TablePagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Receipt image viewer */}
      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Resit Bayaran — {viewing?.id_sale || viewing?.name_customer || ''}</DialogTitle>
          </DialogHeader>
          {viewing?.receipt_payment_url && (
            <ReceiptViewer url={viewing.receipt_payment_url} type={viewing.receipt_payment_type} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountOrderCash;
