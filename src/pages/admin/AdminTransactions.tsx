import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { CreditCard, Loader2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const AdminTransactions: React.FC = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'pending' | 'paid' | 'failed'>('pending');
  const nowD = new Date();
  const [selMonth, setSelMonth] = useState(nowD.getMonth());
  const [selYear, setSelYear] = useState(nowD.getFullYear());

  const isSuperadmin = profile?.role === 'superadmin';

  const { data, isLoading } = useQuery({
    queryKey: ['admin-transactions'],
    enabled: isSuperadmin,
    queryFn: async () => {
      const [paymentsRes, profilesRes] = await Promise.all([
        supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('profiles').select('id, email, idstaff'),
      ]);
      if (paymentsRes.error) throw paymentsRes.error;
      const emailMap: Record<string, any> = {};
      (profilesRes.data || []).forEach((p: any) => { emailMap[p.id] = p; });
      return { payments: paymentsRes.data || [], emailMap };
    },
  });

  const [busyId, setBusyId] = useState<string | null>(null);

  // Approve / reject run server-side (admin-payment-action) so the plan is
  // activated AND the client + admins get their WhatsApp notifications.
  const setStatus = async (payment: any, action: 'approve' | 'reject') => {
    setBusyId(payment.id);
    const { data: res, error } = await supabase.functions.invoke('admin-payment-action', {
      body: { action, payment_id: payment.id },
    });
    setBusyId(null);
    if (error || !res?.success) {
      let msg = error?.message || 'Action failed';
      try {
        const body = await (error as any)?.context?.json?.();
        if (body?.error) msg = body.error;
      } catch { /* keep default */ }
      toast({ title: 'Failed', description: msg, variant: 'destructive' });
      return;
    }
    const email = data?.emailMap[payment.user_id]?.email || payment.user_id;
    toast({
      title: action === 'approve' ? 'Approved — plan activated' : 'Rejected',
      description: `RM ${Number(payment.amount).toFixed(2)} — ${email}. WhatsApp notification sent.`,
    });
    queryClient.invalidateQueries({ queryKey: ['admin-transactions'] });
  };

  // Recheck the REAL status from CHIP. The billing-webhook re-verifies against
  // CHIP's API (source of truth) and, if now paid, flips the row + activates the
  // plan + fires the client/admin WhatsApp — exactly as the auto-webhook would.
  const recheck = async (payment: any) => {
    if (!payment.chip_purchase_id) {
      toast({ title: 'No CHIP reference', description: 'Manual payment — use Approve/Reject.', variant: 'destructive' });
      return;
    }
    setBusyId(payment.id);
    const { data: res, error } = await supabase.functions.invoke('billing-webhook', {
      body: { id: payment.chip_purchase_id },
    });
    setBusyId(null);
    if (error) {
      let msg = error.message || 'Recheck failed';
      try { const b = await (error as any)?.context?.json?.(); if (b?.error) msg = b.error; } catch { /* keep */ }
      toast({ title: 'Recheck failed', description: msg, variant: 'destructive' });
      return;
    }
    const st = res?.status || 'unknown';
    toast({
      title: `CHIP status: ${st}`,
      description: st === 'paid'
        ? 'Confirmed paid — plan activated & WhatsApp sent.'
        : `Still ${st} on CHIP. Nothing changed.`,
    });
    queryClient.invalidateQueries({ queryKey: ['admin-transactions'] });
  };

  if (!isSuperadmin) return <div className="p-6 text-muted-foreground">Not authorized.</div>;

  const all = data?.payments || [];
  // Everything on this page is scoped to the selected month (by created date).
  const inSelMonth = (dstr: string) => {
    if (!dstr) return false;
    const d = new Date(dstr);
    return d.getMonth() === selMonth && d.getFullYear() === selYear;
  };
  const monthPayments = all.filter((p: any) => inSelMonth(p.created_at));
  const payments = monthPayments.filter((p: any) => p.status === tab);

  const monthPaidList = monthPayments.filter((p: any) => p.status === 'paid');
  const monthPaid = monthPaidList.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const pendingCount = monthPayments.filter((p: any) => p.status === 'pending').length;
  const failedCount = monthPayments.filter((p: any) => p.status === 'failed').length;

  // All-time revenue stays across every month.
  const totalPaid = all.filter((p: any) => p.status === 'paid').reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const totalPaidCount = all.filter((p: any) => p.status === 'paid').length;

  const years = [nowD.getFullYear(), nowD.getFullYear() - 1, nowD.getFullYear() - 2];
  const TABS: { key: 'pending' | 'paid' | 'failed'; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending', count: pendingCount },
    { key: 'paid', label: 'Success', count: monthPaidList.length },
    { key: 'failed', label: 'Reject', count: failedCount },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CreditCard className="w-7 h-7 text-primary" /> Transactions
          </h1>
          <p className="text-muted-foreground mt-2">Subscription payments (Chip) — showing {MONTHS[selMonth]} {selYear}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter month:</span>
          <select
            value={selMonth}
            onChange={(e) => setSelMonth(Number(e.target.value))}
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select
            value={selYear}
            onChange={(e) => setSelYear(Number(e.target.value))}
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Revenue (All Time)</p>
          <p className="text-2xl font-bold">RM {totalPaid.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{totalPaidCount} paid transactions</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Revenue ({MONTHS[selMonth]} {selYear})</p>
          <p className="text-2xl font-bold text-green-600">RM {monthPaid.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{monthPaidList.length} paid this month</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Pending ({MONTHS[selMonth]})</p>
          <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
        </CardContent></Card>
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${
              t.key === 'pending' && t.count > 0 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-muted text-muted-foreground'
            }`}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-left">Client</th>
                  <th className="p-3 text-left">Plan</th>
                  <th className="p-3 text-right">Amount (RM)</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Paid At</th>
                  <th className="p-3 text-left">Chip Ref</th>
                  <th className="p-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any) => {
                  const client = data?.emailMap[p.user_id];
                  return (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-3 text-xs whitespace-nowrap">{new Date(p.created_at).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-3">
                        <p className="font-medium">{client?.email || p.user_id}</p>
                        <p className="text-xs text-muted-foreground font-mono">{client?.idstaff || ''}</p>
                      </td>
                      <td className="p-3 capitalize">{p.plan || '-'}</td>
                      <td className="p-3 text-right font-semibold">{Number(p.amount || 0).toFixed(2)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[p.status] || 'bg-muted text-muted-foreground'}`}>{p.status}</span>
                      </td>
                      <td className="p-3 text-xs">{p.paid_at ? new Date(p.paid_at).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                      <td className="p-3 font-mono text-xs max-w-[120px] truncate">{p.chip_purchase_id || '-'}</td>
                      <td className="p-3">
                        <div className="flex gap-1 items-center">
                          {p.status === 'pending' && (
                            <>
                              <Button size="sm" variant="outline" disabled={busyId === p.id} className="h-8 border-green-200 text-green-700 hover:bg-green-50 dark:border-green-900 dark:text-green-400" title="Approve manual — activate plan & WhatsApp login" onClick={() => setStatus(p, 'approve')}>
                                {busyId === p.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />} Approve
                              </Button>
                              <Button size="sm" variant="outline" disabled={busyId === p.id} className="h-8 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400" title="Reject payment & WhatsApp client" onClick={() => setStatus(p, 'reject')}>
                                {busyId === p.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <XCircle className="w-4 h-4 mr-1" />} Reject
                              </Button>
                            </>
                          )}
                          {p.chip_purchase_id ? (
                            <Button size="sm" variant="ghost" disabled={busyId === p.id} className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50 dark:text-blue-400" title="Recheck real status from CHIP webhook" onClick={() => recheck(p)}>
                              {busyId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            </Button>
                          ) : (p.status !== 'pending' && <span className="text-xs text-muted-foreground">—</span>)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {payments.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No transactions</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminTransactions;
