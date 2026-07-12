import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { CreditCard, Loader2, CheckCircle, XCircle } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const STATUS_BADGE: Record<string, string> = {
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const AdminTransactions: React.FC = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');

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

  const setStatus = async (payment: any, status: 'paid' | 'failed') => {
    const patch: any = { status };
    if (status === 'paid' && !payment.paid_at) patch.paid_at = new Date().toISOString();
    const { error } = await supabase.from('payments').update(patch).eq('id', payment.id);
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' });
      return;
    }
    // Manual mark-paid also activates the plan (same as the Chip webhook would)
    if (status === 'paid' && payment.plan) {
      const { data: setting } = await supabase.from('app_settings').select('value').eq('key', `plan_${payment.plan}`).maybeSingle();
      const days = Number((setting?.value as any)?.days) || 30;
      const { data: prof } = await supabase.from('profiles').select('plan_expires_at').eq('id', payment.user_id).maybeSingle();
      const base = prof?.plan_expires_at && new Date(prof.plan_expires_at) > new Date()
        ? new Date(prof.plan_expires_at) : new Date();
      await supabase.from('profiles').update({
        plan: payment.plan,
        plan_expires_at: new Date(base.getTime() + days * 86400000).toISOString(),
        is_active: true,
      }).eq('id', payment.user_id);
    }
    toast({ title: `Marked ${status}`, description: `RM ${Number(payment.amount).toFixed(2)} — ${data?.emailMap[payment.user_id]?.email || payment.user_id}` });
    queryClient.invalidateQueries({ queryKey: ['admin-transactions'] });
  };

  if (!isSuperadmin) return <div className="p-6 text-muted-foreground">Not authorized.</div>;

  const payments = (data?.payments || []).filter((p: any) => statusFilter === 'all' || p.status === statusFilter);
  const paid = (data?.payments || []).filter((p: any) => p.status === 'paid');
  const totalPaid = paid.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthPaid = paid.filter((p: any) => p.paid_at && new Date(p.paid_at) >= monthStart)
    .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const pendingCount = (data?.payments || []).filter((p: any) => p.status === 'pending').length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <CreditCard className="w-7 h-7 text-primary" /> Transactions
        </h1>
        <p className="text-muted-foreground mt-2">All subscription payments across clients (Chip)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Revenue (All Time)</p>
          <p className="text-2xl font-bold">RM {totalPaid.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{paid.length} paid transactions</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Revenue (This Month)</p>
          <p className="text-2xl font-bold text-green-600">RM {monthPaid.toFixed(2)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Pending</p>
          <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
        </CardContent></Card>
      </div>

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
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
                        {p.status === 'pending' && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" title="Mark paid" onClick={() => setStatus(p, 'paid')}>
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            </Button>
                            <Button size="sm" variant="ghost" title="Mark failed" onClick={() => setStatus(p, 'failed')}>
                              <XCircle className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        )}
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
