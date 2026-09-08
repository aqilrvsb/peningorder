import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Banknote, Loader2, Calendar, ExternalLink, Eye, Package, Truck } from 'lucide-react';
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, fetchAllRows, formatRM } from '@/lib/utils';
import { useTeam } from '@/hooks/useTeam';
import { TeamFilter } from '@/components/TeamFilter';
import { TablePagination } from '@/components/TablePagination';
import { ReceiptViewer } from '@/components/ReceiptViewer';

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
    `rounded-xl border p-4 text-left transition-colors ${active ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card hover:bg-muted/40'}`;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Banknote className="w-6 h-6" /></span>
        <div>
          <h1 className="text-2xl font-bold">Order CASH + PICKUP</h1>
          <p className="text-muted-foreground text-sm">Semua order CASH &amp; PICKUP dengan bukti bayaran (resit atau link), ikut tarikh order.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4" /><span className="text-sm font-medium text-foreground">Tarikh Order:</span>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Dari</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Hingga</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
          </div>
          <div className="flex items-end pb-0.5">
            <TeamFilter value={teamFilter} onChange={setTeamFilter} />
          </div>
        </div>
      </div>

      {/* Summary — Total Order (CASH+PICKUP), Total CASH, Total PICKUP.
          The three proof sub-lines under CASH/PICKUP are themselves clickable. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Total Order — clears every filter */}
        <button onClick={() => setFilter({})} className={boxCls(allCleared)}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><Banknote className="w-4 h-4" />Total Order (CASH + PICKUP)</p>
          <p className="text-2xl font-bold mt-1 text-primary">{counts.all}</p>
        </button>

        {/* Total CASH */}
        {([
          { pay: 'CASH' as const, label: 'Total CASH', bd: counts.cash, accent: 'text-green-600 dark:text-green-400' },
          { pay: 'Pickup' as const, label: 'Total PICKUP', bd: counts.pickup, accent: 'text-blue-600 dark:text-blue-400' },
        ]).map((b) => (
          <div key={b.pay} className={boxCls(payFilter === b.pay)}>
            <button onClick={() => setFilter({ pay: b.pay })} className="w-full text-left">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{b.label}</p>
              <p className={`text-2xl font-bold mt-1 ${b.accent}`}>{b.bd.total}</p>
            </button>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
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
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><Truck className="w-4 h-4" />Ringkasan Ikut Kurier</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {counts.couriers.map((c) => (
              <div key={c.name} className={boxCls(courierFilter === c.name)}>
                <button onClick={() => setFilter({ courier: c.name })} className="w-full text-left">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    {c.name === 'Pickup' ? <Package className="w-4 h-4" /> : <Truck className="w-4 h-4" />}{c.name}
                  </p>
                  <p className="text-2xl font-bold mt-1 text-foreground">{c.total}</p>
                </button>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
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
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
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
                    <tr key={o.id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-2">{(page - 1) * pageSize + i + 1}</td>
                      <td className="p-2 font-mono text-blue-600 dark:text-blue-400 whitespace-nowrap">{o.marketer_id_staff || '-'}</td>
                      <td className="p-2 whitespace-nowrap">{nameByIdstaff.get(o.marketer_id_staff || '') || '-'}</td>
                      <td className="p-2 whitespace-nowrap">{o.id_sale || '-'}</td>
                      <td className="p-2 whitespace-nowrap font-mono text-xs">{o.tracking_number || '-'}</td>
                      <td className="p-2 whitespace-nowrap">{o.date_order || '-'}</td>
                      <td className="p-2">{o.name_customer || '-'}</td>
                      <td className="p-2">{o.bundle?.name || '-'}</td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${isPickup(o) ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                          {isPickup(o) ? 'PICKUP' : 'CASH'}
                        </span>
                      </td>
                      <td className="p-2">{o.bank_payment || '-'}</td>
                      <td className="p-2 text-right tabular-nums">{formatRM(Number(o.total_sale) || 0)}</td>
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
                  <tr><td colSpan={12} className="p-8 text-center text-muted-foreground">Tiada order cash dalam tempoh ini.</td></tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t border-border bg-muted/30 font-semibold">
                    <td className="p-2" colSpan={10}>Jumlah Cash ({filtered.length} order)</td>
                    <td className="p-2 text-right tabular-nums text-green-600 dark:text-green-400">{formatRM(totalCash)}</td>
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
