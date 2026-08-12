import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  UsersRound, UserPlus, Search, Loader2, KeyRound, CalendarPlus, Trash2, LogIn,
} from 'lucide-react';

const PLAN_OPTIONS = ['trial', 'starter', 'growth', 'scale'];

interface ClientRow {
  id: string;
  email: string;
  full_name: string | null;
  business_name: string | null;
  idstaff: string | null;
  plan: string | null;
  plan_expires_at: string | null;
  is_active: boolean | null;
  whatsapp: string | null;
  parent_user_id: string | null;
}

const AdminClientManage: React.FC = () => {
  const { profile } = useAuth();
  const isSuperadmin = profile?.role === 'superadmin';

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'client' | 'staff'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  // create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [cForm, setCForm] = useState({ email: '', password: '', full_name: '', business_name: '', plan: 'trial', days: '14' });
  const [creating, setCreating] = useState(false);

  // plan/expiry dialog
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [editPlan, setEditPlan] = useState('trial');
  const [extendDays, setExtendDays] = useState('30');
  const [savingPlan, setSavingPlan] = useState(false);

  // password dialog
  const [pwClient, setPwClient] = useState<ClientRow | null>(null);
  const [newPw, setNewPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  // delete confirm
  const [delClient, setDelClient] = useState<ClientRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, business_name, idstaff, plan, plan_expires_at, is_active, whatsapp, parent_user_id')
      .order('created_at', { ascending: false });
    if (error) toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
    setClients(((data || []) as ClientRow[]).filter((c) => c.plan !== 'superadmin'));
    setLoading(false);
  };

  useEffect(() => { if (isSuperadmin) load(); }, [isSuperadmin]);

  const callAdmin = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('admin-users', { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.detail || data.error);
    return data;
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await callAdmin({
        action: 'create',
        email: cForm.email.trim(),
        password: cForm.password,
        full_name: cForm.full_name.trim(),
        business_name: cForm.business_name.trim(),
        plan: cForm.plan,
        days: parseInt(cForm.days, 10) || 14,
      });
      toast({ title: 'Client created', description: cForm.email });
      setCreateOpen(false);
      setCForm({ email: '', password: '', full_name: '', business_name: '', plan: 'trial', days: '14' });
      load();
    } catch (e: any) {
      toast({ title: 'Create failed', description: e.message, variant: 'destructive' });
    } finally { setCreating(false); }
  };

  const openEdit = (c: ClientRow) => {
    setEditing(c);
    setEditPlan(PLAN_OPTIONS.includes(c.plan || '') ? (c.plan as string) : 'trial');
    setExtendDays('30');
  };

  const savePlan = async () => {
    if (!editing) return;
    setSavingPlan(true);
    try {
      const days = parseInt(extendDays, 10) || 0;
      const base = editing.plan_expires_at && new Date(editing.plan_expires_at) > new Date()
        ? new Date(editing.plan_expires_at) : new Date();
      const newExpiry = new Date(base.getTime() + days * 86400000);
      const { error } = await supabase.from('profiles')
        .update({ plan: editPlan, plan_expires_at: newExpiry.toISOString() })
        .eq('id', editing.id);
      if (error) throw error;
      toast({ title: 'Updated', description: `${editing.email} → ${editPlan}, expiry ${newExpiry.toLocaleDateString('en-MY')}` });
      setEditing(null);
      load();
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally { setSavingPlan(false); }
  };

  const savePassword = async () => {
    if (!pwClient) return;
    if (newPw.length < 6) { toast({ title: 'Too short', description: 'Min 6 characters', variant: 'destructive' }); return; }
    setSavingPw(true);
    try {
      await callAdmin({ action: 'set_password', user_id: pwClient.id, password: newPw });
      toast({ title: 'Password reset', description: pwClient.email });
      setPwClient(null); setNewPw('');
    } catch (e: any) {
      toast({ title: 'Reset failed', description: e.message, variant: 'destructive' });
    } finally { setSavingPw(false); }
  };

  const confirmDelete = async () => {
    if (!delClient) return;
    setDeleting(true);
    try {
      await callAdmin({ action: 'delete', user_id: delClient.id });
      toast({ title: 'Client deleted', description: delClient.email });
      setDelClient(null);
      load();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally { setDeleting(false); }
  };

  // Login as client — click the email. Mints a client session and reloads.
  const loginAsClient = async (c: ClientRow) => {
    setBusyId(c.id);
    try {
      const data = await callAdmin({ action: 'impersonate', user_id: c.id });
      const { error } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
      if (error) throw error;
      toast({ title: 'Logged in as client', description: c.email });
      window.location.href = '/dashboard';
    } catch (e: any) {
      toast({ title: 'Login-as failed', description: e.message, variant: 'destructive' });
      setBusyId(null);
    }
  };

  if (!isSuperadmin) return <div className="p-6 text-muted-foreground">Not authorized.</div>;

  const now = new Date();
  const isStaff = (c: ClientRow) => !!c.parent_user_id;

  // Search first, then tab — so the summary boxes count what the search narrowed to.
  const searched = clients.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [c.email, c.full_name, c.business_name, c.idstaff].some((v) => (v || '').toLowerCase().includes(q));
  });
  const counts = {
    all: searched.length,
    client: searched.filter((c) => !isStaff(c)).length,
    staff: searched.filter((c) => isStaff(c)).length,
  };
  const filtered = searched.filter((c) => tab === 'all' || (tab === 'staff' ? isStaff(c) : !isStaff(c)));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><UsersRound className="w-7 h-7 text-primary" /> Client Management</h1>
          <p className="text-muted-foreground mt-2">Register clients, reset passwords, set plan &amp; expiry, or log in as a client.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><UserPlus className="w-4 h-4 mr-2" /> New Client</Button>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-2xl">
        {([
          { key: 'all', label: 'All', value: counts.all, accent: 'text-primary' },
          { key: 'client', label: 'Client', value: counts.client, accent: 'text-emerald-600 dark:text-emerald-400' },
          { key: 'staff', label: 'Staff', value: counts.staff, accent: 'text-blue-600 dark:text-blue-400' },
        ] as const).map((b) => (
          <button
            key={b.key}
            onClick={() => setTab(b.key)}
            className={`rounded-xl border p-4 text-left transition-colors ${
              tab === b.key ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card hover:bg-muted/40'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{b.label}</p>
            <p className={`text-2xl font-bold mt-1 ${b.accent}`}>{b.value}</p>
          </button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search email / name / business / PO-id" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-left">ID</th>
                  <th className="p-3 text-left">Client (click to login as)</th>
                  <th className="p-3 text-left">Plan</th>
                  <th className="p-3 text-left">Expiry</th>
                  <th className="p-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const expired = !c.plan_expires_at || new Date(c.plan_expires_at) <= now;
                  return (
                    <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-3 font-mono">{c.idstaff}</td>
                      <td className="p-3">
                        <button onClick={() => loginAsClient(c)} disabled={busyId === c.id}
                          className="text-left font-medium text-primary hover:underline inline-flex items-center gap-1.5" title="Login as this client">
                          {busyId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                          {c.email}
                        </button>
                        <p className="text-xs text-muted-foreground">{c.business_name || c.full_name || '-'}{c.whatsapp ? ` · ${c.whatsapp}` : ''}</p>
                      </td>
                      <td className="p-3 capitalize">{c.plan || '-'}</td>
                      <td className="p-3"><span className={expired ? 'text-red-500 font-medium' : ''}>{c.plan_expires_at ? new Date(c.plan_expires_at).toLocaleDateString('en-MY') : '-'}</span></td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => openEdit(c)}><CalendarPlus className="w-3.5 h-3.5 mr-1" /> Plan</Button>
                          <Button size="sm" variant="outline" onClick={() => { setPwClient(c); setNewPw(''); }}><KeyRound className="w-3.5 h-3.5 mr-1" /> Password</Button>
                          <Button size="sm" variant="ghost" onClick={() => setDelClient(c)} title="Delete client"><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No clients found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Client</DialogTitle><DialogDescription>Creates a confirmed account. They can log in immediately.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label>Email</Label><Input type="email" value={cForm.email} onChange={(e) => setCForm({ ...cForm, email: e.target.value })} placeholder="client@email.com" /></div>
            <div><Label>Password</Label><Input type="text" value={cForm.password} onChange={(e) => setCForm({ ...cForm, password: e.target.value })} placeholder="min 6 characters" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Full Name</Label><Input value={cForm.full_name} onChange={(e) => setCForm({ ...cForm, full_name: e.target.value })} /></div>
              <div><Label>Business</Label><Input value={cForm.business_name} onChange={(e) => setCForm({ ...cForm, business_name: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Plan</Label>
                <Select value={cForm.plan} onValueChange={(v) => setCForm({ ...cForm, plan: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{PLAN_OPTIONS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Days valid</Label><Input type="number" value={cForm.days} onChange={(e) => setCForm({ ...cForm, days: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={creating || !cForm.email || cForm.password.length < 6}>
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan/expiry */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Update Plan</DialogTitle><DialogDescription>{editing?.email}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Plan</Label>
              <Select value={editPlan} onValueChange={setEditPlan}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{PLAN_OPTIONS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Extend expiry by (days)</Label><Input type="number" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Current: {editing?.plan_expires_at ? new Date(editing.plan_expires_at).toLocaleDateString('en-MY') : '-'} — adds on top if still valid, else from today.</p>
            </div>
            <Button className="w-full" onClick={savePlan} disabled={savingPlan}>{savingPlan && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password */}
      <Dialog open={!!pwClient} onOpenChange={(o) => { if (!o) setPwClient(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reset Password</DialogTitle><DialogDescription>{pwClient?.email}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>New password</Label><Input type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="min 6 characters" className="mt-1" /></div>
            <Button className="w-full" onClick={savePassword} disabled={savingPw}>{savingPw && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Set password</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!delClient} onOpenChange={(o) => { if (!o) setDelClient(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete client?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes <b>{delClient?.email}</b> and all their orders, leads, spend, products and config. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmDelete(); }} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminClientManage;
