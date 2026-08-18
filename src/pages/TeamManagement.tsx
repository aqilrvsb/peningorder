import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, Loader2, UserPlus, KeyRound, ShieldCheck, ShieldOff, Trash2, Copy, Check, Percent, Truck, Package } from 'lucide-react';

type Staff = { id: string; idstaff: string; full_name: string | null; whatsapp: string | null; whatsapp_number: string | null; is_active: boolean; pay_mode: string | null; commission_percent: number | null; product_scope: string[] | null; role?: string };
type BundleMin = { id: string; name: string };

const call = async (action: string, extra: Record<string, unknown> = {}) => {
  const { data, error } = await supabase.functions.invoke('team-staff', { body: { action, ...extra } });
  if (error) {
    let msg = error.message || 'Gagal';
    try { const b = await (error as any)?.context?.json?.(); if (b?.error) msg = b.error; } catch { /* keep */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
};

const TeamManagement: React.FC = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('60');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<{ idstaff: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // Logistic account (max ONE per client).
  const [logName, setLogName] = useState('');
  const [logWhatsapp, setLogWhatsapp] = useState('60');
  const [logPassword, setLogPassword] = useState('');
  const [creatingLog, setCreatingLog] = useState(false);
  // Product scope for the logistic account (bundle ids). Empty = sees ALL orders.
  const [logScope, setLogScope] = useState<string[]>([]);
  const [scopeDialogFor, setScopeDialogFor] = useState<Staff | null>(null);
  const [scopeDraft, setScopeDraft] = useState<string[]>([]);
  const [savingScope, setSavingScope] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['team-staff'],
    queryFn: async () => (await call('list')).staff as Staff[],
  });

  // Tenant's products (logistic_bundles) for the scope picker.
  const { data: bundles = [] } = useQuery({
    queryKey: ['team-bundles-min'],
    queryFn: async () => {
      const { data, error } = await supabase.from('logistic_bundles').select('id, name').order('name');
      if (error) throw error;
      return (data || []) as BundleMin[];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['team-staff'] });

  const createStaff = async () => {
    if (name.trim().length < 2) { toast({ title: 'Nama diperlukan', variant: 'destructive' }); return; }
    if (!/^60\d{8,11}$/.test(whatsapp.replace(/\D/g, ''))) { toast({ title: 'No. WhatsApp tak sah', description: 'Format: 60123456789', variant: 'destructive' }); return; }
    // Password optional: blank → server uses the generated ID staff as password.
    if (password && password.length < 6) { toast({ title: 'Password minimum 6 aksara', variant: 'destructive' }); return; }
    setCreating(true);
    try {
      const res = await call('create', { name: name.trim(), whatsapp: whatsapp.replace(/\D/g, ''), password });
      setLastCreated({ idstaff: res.idstaff, password: res.password || password });
      toast({ title: 'Staff dicipta', description: `ID Staff: ${res.idstaff}` });
      setName(''); setWhatsapp('60'); setPassword('');
      refresh();
    } catch (e: any) {
      toast({ title: 'Gagal cipta staff', description: e.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const createLogistic = async () => {
    if (logName.trim().length < 2) { toast({ title: 'Nama diperlukan', variant: 'destructive' }); return; }
    if (!/^60\d{8,11}$/.test(logWhatsapp.replace(/\D/g, ''))) { toast({ title: 'No. WhatsApp tak sah', description: 'Format: 60123456789', variant: 'destructive' }); return; }
    // Password optional: blank → server uses the generated ID staff as password.
    if (logPassword && logPassword.length < 6) { toast({ title: 'Password minimum 6 aksara', variant: 'destructive' }); return; }
    setCreatingLog(true);
    try {
      const res = await call('create', { name: logName.trim(), whatsapp: logWhatsapp.replace(/\D/g, ''), password: logPassword, staff_role: 'logistic', product_scope: logScope });
      setLastCreated({ idstaff: res.idstaff, password: res.password || logPassword });
      toast({ title: 'Akaun Logistic dicipta', description: `ID: ${res.idstaff}` });
      setLogName(''); setLogWhatsapp('60'); setLogPassword(''); setLogScope([]);
      refresh();
    } catch (e: any) {
      toast({ title: 'Gagal cipta akaun logistic', description: e.message === 'logistic_exists' ? 'Anda sudah ada satu akaun logistic.' : e.message, variant: 'destructive' });
    } finally {
      setCreatingLog(false);
    }
  };

  const openScopeDialog = (s: Staff) => {
    setScopeDraft(Array.isArray(s.product_scope) ? s.product_scope : []);
    setScopeDialogFor(s);
  };

  const saveScope = async () => {
    if (!scopeDialogFor) return;
    setSavingScope(true);
    try {
      await call('set_product_scope', { user_id: scopeDialogFor.id, product_scope: scopeDraft });
      toast({ title: 'Akses produk dikemaskini', description: scopeDraft.length ? `${scopeDraft.length} produk` : 'Semua produk' });
      setScopeDialogFor(null);
      refresh();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    } finally {
      setSavingScope(false);
    }
  };

  const renderBundleChecklist = (selected: string[], onChange: (ids: string[]) => void) => {
    const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">{selected.length ? `${selected.length} produk dipilih` : 'Semua produk (default)'}</span>
          {selected.length > 0 && <button type="button" className="text-xs text-primary hover:underline" onClick={() => onChange([])}>Reset ke semua</button>}
        </div>
        <div className="max-h-44 overflow-y-auto rounded-lg border border-border divide-y divide-border">
          {bundles.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3">Tiada produk lagi. Tambah produk di seksyen Logistik dahulu.</p>
          ) : bundles.map((b) => (
            <label key={b.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
              <Checkbox checked={selected.includes(b.id)} onCheckedChange={() => toggle(b.id)} />
              <span>{b.name}</span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  const resetPassword = async (s: Staff) => {
    const pw = prompt(`Password baru untuk ${s.idstaff} (min 6 aksara):`);
    if (!pw) return;
    if (pw.length < 6) { toast({ title: 'Password terlalu pendek', variant: 'destructive' }); return; }
    setBusyId(s.id);
    try { await call('reset_password', { user_id: s.id, password: pw }); toast({ title: 'Password ditukar', description: `${s.idstaff}: ${pw}` }); }
    catch (e: any) { toast({ title: 'Gagal', description: e.message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  };

  const toggleActive = async (s: Staff) => {
    setBusyId(s.id);
    try { await call('set_active', { user_id: s.id, active: !s.is_active }); refresh(); }
    catch (e: any) { toast({ title: 'Gagal', description: e.message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  };

  // Pembayaran mode: 'commission_order' (bundle commission per order) vs
  // 'gross_profit' (a % of gross profit). Percent only applies to gross_profit.
  const setPayMode = async (s: Staff, mode: 'commission_order' | 'gross_profit', percent?: number) => {
    setBusyId(s.id);
    try {
      await call('set_pay_mode', { user_id: s.id, pay_mode: mode, commission_percent: percent ?? s.commission_percent ?? 0 });
      refresh();
    } catch (e: any) { toast({ title: 'Gagal', description: e.message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  };

  const editPercent = async (s: Staff) => {
    const raw = prompt(`Peratus komisyen dari Gross Profit untuk ${s.idstaff} (%):`, String(s.commission_percent ?? 0));
    if (raw === null) return;
    const pct = Math.max(0, Math.min(100, parseFloat(raw) || 0));
    await setPayMode(s, 'gross_profit', pct);
  };

  const removeStaff = async (s: Staff) => {
    if (!confirm(`Padam staff ${s.idstaff} (${s.full_name})? Tak boleh undo.`)) return;
    setBusyId(s.id);
    try { await call('delete', { user_id: s.id }); refresh(); toast({ title: 'Staff dipadam' }); }
    catch (e: any) { toast({ title: 'Gagal', description: e.message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  };

  const copyLogin = () => {
    if (!lastCreated) return;
    navigator.clipboard.writeText(`Login PeningOrder\nID Staff: ${lastCreated.idstaff}\nPassword: ${lastCreated.password}\nLogin: https://peningorder.com/auth`).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };

  const allStaff = data || [];
  const staff = allStaff.filter((s) => s.role !== 'logistic'); // marketer staff table
  const logisticAccount = allStaff.find((s) => s.role === 'logistic') || null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6 text-primary" /> Team Marketer</h1>
        <p className="text-muted-foreground mt-1">Daftar & urus staff marketer anda. Setiap staff dapat ID staff automatik (berdasarkan ID anda: <span className="font-mono">{profile?.idstaff}-1, -2, …</span>) dan login guna ID + password.</p>
      </div>

      {/* Add staff */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-3"><UserPlus className="w-4 h-4 text-primary" /> Tambah Staff</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Nama Staff</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="cth: Ali" className="mt-1" />
          </div>
          <div>
            <Label>No. WhatsApp</Label>
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value.replace(/[^0-9]/g, ''))} placeholder="60123456789" className="mt-1" />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Kosong = guna ID staff" className="mt-1" />
          </div>
        </div>
        <Button onClick={createStaff} disabled={creating} className="mt-4">
          {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />} Tambah Staff
        </Button>

        {lastCreated && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-4 py-3 text-sm">
            <p className="font-medium text-green-800 dark:text-green-300">✅ Staff berjaya dicipta — beri login ni pada staff:</p>
            <p className="mt-1 font-mono">ID Staff: <b>{lastCreated.idstaff}</b> · Password: <b>{lastCreated.password}</b></p>
            <Button size="sm" variant="outline" className="mt-2 h-8" onClick={copyLogin}>
              {copied ? <><Check className="w-3.5 h-3.5 mr-1 text-green-600" /> Disalin</> : <><Copy className="w-3.5 h-3.5 mr-1" /> Salin login</>}
            </Button>
          </div>
        )}
      </div>

      {/* Logistic account — max ONE per client. Logs in to see the Logistic section only. */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-1"><Truck className="w-4 h-4 text-primary" /> Akaun Logistic</h2>
        <p className="text-xs text-muted-foreground mb-3">Satu akaun sahaja. Bila login, ia nampak seksyen <b>Logistic</b> — <b>semua order</b> secara default, atau hanya order produk tertentu yang anda pilih.</p>
        {logisticAccount ? (
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="font-mono font-medium">{logisticAccount.idstaff}</p>
              <p className="text-xs text-muted-foreground">{logisticAccount.full_name || '-'} · {logisticAccount.whatsapp || logisticAccount.whatsapp_number || '-'} · <span className={logisticAccount.is_active ? 'text-green-600' : 'text-red-500'}>{logisticAccount.is_active ? 'Aktif' : 'Nonaktif'}</span></p>
              <p className="text-xs mt-0.5 flex items-center gap-1 text-muted-foreground"><Package className="w-3 h-3" /> Akses: <span className="font-medium text-foreground">{logisticAccount.product_scope?.length ? `${logisticAccount.product_scope.length} produk` : 'Semua produk'}</span></p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" title="Akses produk" onClick={() => openScopeDialog(logisticAccount)}><Package className="w-4 h-4" /></Button>
              <Button size="sm" variant="ghost" disabled={busyId === logisticAccount.id} title="Reset password" onClick={() => resetPassword(logisticAccount)}><KeyRound className="w-4 h-4" /></Button>
              <Button size="sm" variant="ghost" disabled={busyId === logisticAccount.id} title={logisticAccount.is_active ? 'Nonaktifkan' : 'Aktifkan'} onClick={() => toggleActive(logisticAccount)}>{logisticAccount.is_active ? <ShieldOff className="w-4 h-4 text-red-500" /> : <ShieldCheck className="w-4 h-4 text-green-600" />}</Button>
              <Button size="sm" variant="ghost" disabled={busyId === logisticAccount.id} title="Padam" onClick={() => removeStaff(logisticAccount)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><Label>Nama</Label><Input value={logName} onChange={(e) => setLogName(e.target.value)} placeholder="cth: Logistik" className="mt-1" /></div>
              <div><Label>No. WhatsApp</Label><Input value={logWhatsapp} onChange={(e) => setLogWhatsapp(e.target.value.replace(/[^0-9]/g, ''))} placeholder="60123456789" className="mt-1" /></div>
              <div><Label>Password</Label><Input type="text" value={logPassword} onChange={(e) => setLogPassword(e.target.value)} placeholder="Kosong = guna ID staff" className="mt-1" /></div>
            </div>
            <div className="mt-3">
              <Label className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Akses Produk</Label>
              <p className="text-xs text-muted-foreground mb-2">Biar kosong = nampak <b>semua order</b>. Atau pilih produk tertentu — akaun ini hanya nampak order produk itu sahaja.</p>
              {renderBundleChecklist(logScope, setLogScope)}
            </div>
            <Button onClick={createLogistic} disabled={creatingLog} className="mt-4">
              {creatingLog ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Truck className="w-4 h-4 mr-2" />} Tambah Akaun Logistic
            </Button>
          </>
        )}
      </div>

      {/* Edit product scope for the logistic account */}
      <Dialog open={!!scopeDialogFor} onOpenChange={(o) => { if (!o) setScopeDialogFor(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Package className="w-5 h-5 text-primary" /> Akses Produk — {scopeDialogFor?.idstaff}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Biar kosong = akaun logistic nampak <b>semua order</b>. Pilih produk tertentu untuk hadkan.</p>
          {renderBundleChecklist(scopeDraft, setScopeDraft)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScopeDialogFor(null)} disabled={savingScope}>Batal</Button>
            <Button onClick={saveScope} disabled={savingScope}>{savingScope ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Staff list */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-left">ID Staff</th>
                  <th className="p-3 text-left">Nama</th>
                  <th className="p-3 text-left">WhatsApp</th>
                  <th className="p-3 text-left">Pembayaran</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3 font-mono">{s.idstaff}</td>
                    <td className="p-3">{s.full_name || '-'}</td>
                    <td className="p-3">{s.whatsapp || s.whatsapp_number || '-'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
                          <button
                            disabled={busyId === s.id}
                            onClick={() => setPayMode(s, 'commission_order')}
                            className={`px-2.5 py-1 transition-colors ${(s.pay_mode || 'commission_order') === 'commission_order' ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-muted'}`}
                          >
                            Komisyen Order
                          </button>
                          <button
                            disabled={busyId === s.id}
                            onClick={() => (s.pay_mode === 'gross_profit' ? editPercent(s) : setPayMode(s, 'gross_profit', s.commission_percent ?? 0))}
                            className={`px-2.5 py-1 transition-colors border-l border-border ${s.pay_mode === 'gross_profit' ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-muted'}`}
                          >
                            Gross Profit
                          </button>
                        </div>
                        {s.pay_mode === 'gross_profit' && (
                          <button
                            disabled={busyId === s.id}
                            onClick={() => editPercent(s)}
                            title="Set peratus komisyen"
                            className="inline-flex items-center gap-0.5 rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100"
                          >
                            {Number(s.commission_percent ?? 0)}<Percent className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {s.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" disabled={busyId === s.id} title="Reset password" onClick={() => resetPassword(s)}>
                          <KeyRound className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busyId === s.id} title={s.is_active ? 'Nonaktifkan' : 'Aktifkan'} onClick={() => toggleActive(s)}>
                          {s.is_active ? <ShieldOff className="w-4 h-4 text-red-500" /> : <ShieldCheck className="w-4 h-4 text-green-600" />}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busyId === s.id} title="Padam" onClick={() => removeStaff(s)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {staff.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Belum ada staff. Tambah staff pertama anda di atas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamManagement;
