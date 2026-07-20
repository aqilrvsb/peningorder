import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import {
  Users, Search, Loader2, ShieldCheck, ShieldOff, Wallet, Package, Ticket, CalendarPlus,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const PLAN_OPTIONS = ['trial', 'starter', 'growth', 'scale'];

const AdminClients: React.FC = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const isSuperadmin = profile?.role === 'superadmin';

  const { data, isLoading } = useQuery({
    queryKey: ['admin-clients'],
    enabled: isSuperadmin,
    queryFn: async () => {
      const [profilesRes, statsRes, paymentsRes, ticketsRes] = await Promise.all([
        supabase.from('profiles').select('id, email, full_name, business_name, idstaff, plan, plan_expires_at, is_active, whatsapp, created_at').order('created_at', { ascending: false }),
        supabase.rpc('admin_client_stats'),
        supabase.from('payments').select('amount, status, paid_at').eq('status', 'paid'),
        supabase.from('tickets').select('id, status'),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      const statsMap: Record<string, any> = {};
      (statsRes.data || []).forEach((s: any) => { statsMap[s.user_id] = s; });
      return {
        profiles: profilesRes.data || [],
        statsMap,
        payments: paymentsRes.data || [],
        tickets: ticketsRes.data || [],
      };
    },
  });

  // ---- edit dialog ----
  const [editing, setEditing] = useState<any>(null);
  const [editPlan, setEditPlan] = useState('trial');
  const [extendDays, setExtendDays] = useState('30');
  const [saving, setSaving] = useState(false);

  const openEdit = (p: any) => {
    setEditing(p);
    setEditPlan(PLAN_OPTIONS.includes(p.plan) ? p.plan : 'trial');
    setExtendDays('30');
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const days = parseInt(extendDays, 10) || 0;
      const base = editing.plan_expires_at && new Date(editing.plan_expires_at) > new Date()
        ? new Date(editing.plan_expires_at)
        : new Date();
      const newExpiry = new Date(base.getTime() + days * 86400000);
      const { error } = await supabase
        .from('profiles')
        .update({ plan: editPlan, plan_expires_at: newExpiry.toISOString() })
        .eq('id', editing.id);
      if (error) throw error;
      toast({ title: 'Client updated', description: `${editing.email} → ${editPlan}, expiry ${newExpiry.toLocaleDateString('en-MY')}` });
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['admin-clients'] });
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: any) => {
    const { error } = await supabase.from('profiles').update({ is_active: !p.is_active }).eq('id', p.id);
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: p.is_active ? 'Client deactivated' : 'Client activated', description: p.email });
    queryClient.invalidateQueries({ queryKey: ['admin-clients'] });
  };

  if (!isSuperadmin) {
    return <div className="p-6 text-muted-foreground">Not authorized.</div>;
  }

  const profiles = (data?.profiles || []).filter((p: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [p.email, p.full_name, p.business_name, p.idstaff].some((v) => (v || '').toLowerCase().includes(q));
  });
  const clients = profiles.filter((p: any) => p.plan !== 'superadmin');
  const allClients = (data?.profiles || []).filter((p: any) => p.plan !== 'superadmin');
  const now = new Date();
  const activeCount = allClients.filter((p: any) => p.is_active && p.plan_expires_at && new Date(p.plan_expires_at) > now).length;
  const expiredCount = allClients.filter((p: any) => !p.plan_expires_at || new Date(p.plan_expires_at) <= now).length;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const mrr = (data?.payments || []).filter((p: any) => p.paid_at && new Date(p.paid_at) >= monthStart)
    .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const openTickets = (data?.tickets || []).filter((t: any) => t.status !== 'Closed').length;
  const totalOrders = Object.values(data?.statsMap || {}).reduce((s: number, v: any) => s + Number(v.total_orders || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Users className="w-7 h-7 text-primary" /> Reporting
        </h1>
        <p className="text-muted-foreground mt-2">Everything your clients do — orders, sales, collection — plus plan, expiry &amp; access</p>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Total Clients</p>
          <p className="text-2xl font-bold">{allClients.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Active</p>
          <p className="text-2xl font-bold text-green-600">{activeCount}</p>
          <p className="text-xs text-red-500">{expiredCount} expired</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Revenue (Month)</p>
          <p className="text-2xl font-bold">RM {mrr.toFixed(2)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Total Orders</p>
          <p className="text-2xl font-bold">{totalOrders}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Open Tickets</p>
          <p className="text-2xl font-bold text-orange-600">{openTickets}</p>
        </CardContent></Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search email / name / business / PO-id" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-left">ID</th>
                  <th className="p-3 text-left">Client</th>
                  <th className="p-3 text-left">Plan</th>
                  <th className="p-3 text-left">Expiry</th>
                  <th className="p-3 text-right">Orders</th>
                  <th className="p-3 text-right">Sales (RM)</th>
                  <th className="p-3 text-right">This Month</th>
                  <th className="p-3 text-right">Collected (RM)</th>
                  <th className="p-3 text-left">Last Order</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((p: any) => {
                  const s = data?.statsMap[p.id];
                  const expired = !p.plan_expires_at || new Date(p.plan_expires_at) <= now;
                  return (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-3 font-mono">{p.idstaff}</td>
                      <td className="p-3">
                        <p className="font-medium">{p.email}</p>
                        <p className="text-xs text-muted-foreground">{p.business_name || p.full_name || '-'}{p.whatsapp ? ` · ${p.whatsapp}` : ''}</p>
                      </td>
                      <td className="p-3 capitalize">{p.plan || '-'}</td>
                      <td className="p-3">
                        <span className={expired ? 'text-red-500 font-medium' : ''}>
                          {p.plan_expires_at ? new Date(p.plan_expires_at).toLocaleDateString('en-MY') : '-'}
                        </span>
                      </td>
                      <td className="p-3 text-right">{s?.total_orders || 0}</td>
                      <td className="p-3 text-right">{Number(s?.total_sales || 0).toFixed(2)}</td>
                      <td className="p-3 text-right">{s?.orders_this_month || 0} <span className="text-xs text-muted-foreground">/ RM {Number(s?.sales_this_month || 0).toFixed(0)}</span></td>
                      <td className="p-3 text-right">{Number(s?.collected_sales || 0).toFixed(2)}</td>
                      <td className="p-3 text-xs">{s?.last_order_date || '-'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {p.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                            <CalendarPlus className="w-3.5 h-3.5 mr-1" /> Plan
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleActive(p)} title={p.is_active ? 'Deactivate' : 'Activate'}>
                            {p.is_active ? <ShieldOff className="w-4 h-4 text-red-500" /> : <ShieldCheck className="w-4 h-4 text-green-600" />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {clients.length === 0 && (
                  <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">No clients found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit plan dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Plan</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Plan</label>
              <Select value={editPlan} onValueChange={setEditPlan}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Extend expiry by (days)</label>
              <Input type="number" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">
                Current expiry: {editing?.plan_expires_at ? new Date(editing.plan_expires_at).toLocaleDateString('en-MY') : '-'} — extension adds on top if still valid, else from today.
              </p>
            </div>
            <Button className="w-full" onClick={saveEdit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminClients;
