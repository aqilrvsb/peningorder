import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AUDIT_MODE } from '@/lib/audit';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Check, Loader2, Lock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useHrPeople, useHrRoles, roleBadge, type HrRole } from './useHrPeople';

// HR → ROLE. The HQ's own staff roles — these are the options in the Role dropdown when
// adding/editing staff in HR → User. "Marketer" is fixed (it's the Team tab's marketers).
// Renaming a role renames it on every staff that has it (DB trigger); a role still used by
// an active staff can't be deleted.
const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

const friendlyError = (e: any) =>
  e?.code === '23505' ? 'Role ni dah ada.'
  : /role_in_use/.test(e?.message || '') ? 'Role ni masih digunakan staff — tukar role mereka dahulu.'
  : e?.message || 'Gagal simpan role';

export default function HRRoles() {
  const queryClient = useQueryClient();
  const { data: roles = [], isLoading, error } = useHrRoles();
  const { teamPeople, extraPeople } = useHrPeople();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleting, setDeleting] = useState<HrRole | null>(null);

  const usage = (name: string) => extraPeople.filter((p) => p.role === name).length;

  const nameError = (name: string, exceptId?: string) => {
    if (!name) return 'Nama role diperlukan.';
    if (name.length > 60) return 'Nama role maksimum 60 aksara.';
    if (name.toLowerCase() === 'marketer') return '"Marketer" ialah role tetap dari tab Team.';
    if (roles.some((r) => r.id !== exceptId && r.name.toLowerCase() === name.toLowerCase())) return 'Role ni dah ada.';
    return null;
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['hr-roles'] });
    queryClient.invalidateQueries({ queryKey: ['hr-attendance-staff'] }); // renames update staff rows
  };

  const add = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await (supabase as any).from('hr_roles').insert({ name });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Role ditambah'); setNewName(''); refresh(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await (supabase as any).from('hr_roles').update({ name, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Role dikemas kini'); setEditingId(null); refresh(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('hr_roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Role dipadam'); setDeleting(null); refresh(); },
    onError: (e) => { toast.error(friendlyError(e)); setDeleting(null); },
  });

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const name = clean(newName);
    const err = nameError(name);
    if (err) return toast.error(err);
    add.mutate(name);
  };

  const startEdit = (r: HrRole) => { setEditingId(r.id); setEditName(r.name); };
  const submitEdit = (r: HrRole) => {
    const name = clean(editName);
    if (name === r.name) return setEditingId(null);
    const err = nameError(name, r.id);
    if (err) return toast.error(err);
    rename.mutate({ id: r.id, name });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <form onSubmit={submitAdd} className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nama role baru, cth. Admin, Customer Service, Packing"
              maxLength={60}
              className="sm:max-w-md"
            />
            <Button type="submit" disabled={add.isPending} className="w-full sm:w-auto">
              {add.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Tambah Role
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-600">Gagal muat role: {(error as Error).message}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="w-12 p-2 font-medium">No</th>
                    <th className="p-2 font-medium">Role</th>
                    <th className="w-24 p-2 text-center font-medium">Staff</th>
                    <th className="w-28 p-2 text-center font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b bg-muted/20">
                    <td className="p-2 text-muted-foreground">1</td>
                    <td className="p-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${roleBadge('marketer')}`}>marketer</span>
                      <span className="ml-2 text-xs text-muted-foreground">dari tab Team</span>
                    </td>
                    <td className="p-2 text-center">{teamPeople.length}</td>
                    <td className="p-2">
                      <div className="flex items-center justify-center" title="Role tetap — urus marketer di tab Team">
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </td>
                  </tr>
                  {roles.map((r, i) => {
                    const used = usage(r.name);
                    const isEditing = editingId === r.id;
                    return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-2 text-muted-foreground">{i + 2}</td>
                        <td className="p-2">
                          {isEditing ? (
                            <Input
                              autoFocus
                              value={editName}
                              maxLength={60}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); submitEdit(r); }
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="h-8"
                            />
                          ) : (
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${roleBadge(r.name)}`}>{r.name}</span>
                          )}
                        </td>
                        <td className="p-2 text-center">{used}</td>
                        <td className="p-2">
                          <div className="flex items-center justify-center gap-1">
                            {isEditing ? (
                              <>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" title="Simpan" disabled={rename.isPending} onClick={() => submitEdit(r)}>
                                  {rename.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8" title="Batal" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                              </>
                            ) : (
                              <>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" title="Edit" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                                {!AUDIT_MODE && (
                                  <Button
                                    size="icon" variant="ghost" className="h-8 w-8 text-red-600"
                                    disabled={used > 0}
                                    title={used > 0 ? `Digunakan oleh ${used} staff — tukar role mereka dahulu` : 'Padam'}
                                    onClick={() => setDeleting(r)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {roles.length === 0 && (
                    <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Belum ada role lain. Tambah role di atas — ia akan muncul dalam dropdown Role bila tambah staff.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Padam role?</AlertDialogTitle>
            <AlertDialogDescription>
              Role <strong>{deleting?.name}</strong> akan dibuang dari dropdown Role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(e) => { e.preventDefault(); if (deleting) remove.mutate(deleting.id); }}
              className="bg-red-600 hover:bg-red-700"
            >
              {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Padam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
