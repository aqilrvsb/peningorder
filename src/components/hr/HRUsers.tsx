import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Lock, Pencil, Search, Trash2, UserPlus, Users, UserCheck, Briefcase } from 'lucide-react';
import { AUDIT_MODE } from '@/lib/audit';
import AddAttendanceStaffModal from './AddAttendanceStaffModal';
import EditAttendanceStaffModal from './EditAttendanceStaffModal';
import DeleteAttendanceStaffDialog from './DeleteAttendanceStaffDialog';
import { useHrPeople, useHrRoles, roleBadge, toModalStaff, type HrPerson } from './useHrPeople';

// HR → USER. Default rows are the marketer staff from the Team tab (read-only here —
// add/edit/deactivate them in Team). HQ can add extra non-login staff (admin, logistic,
// multimedia…) and manage those exactly like DFR's attendance staff.
export default function HRUsers() {
  const { teamPeople, extraPeople, isLoading, error } = useHrPeople();
  const { data: roles = [] } = useHrRoles();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<HrPerson | null>(null);
  const [deleting, setDeleting] = useState<HrPerson | null>(null);

  const q = search.trim().toLowerCase();
  const rows = [...teamPeople, ...extraPeople].filter((p) =>
    (roleFilter === 'all' || p.role === roleFilter) &&
    (!q || [p.name, p.phone].some((v) => (v || '').toLowerCase().includes(q))),
  );

  const stats = [
    { label: 'Marketer (Team)', value: teamPeople.length, icon: Users, tone: 'text-blue-600 bg-blue-50' },
    { label: 'Marketer Aktif', value: teamPeople.filter((p) => p.isActive).length, icon: UserCheck, tone: 'text-green-600 bg-green-50' },
    { label: 'Staff Tambahan', value: extraPeople.length, icon: Briefcase, tone: 'text-purple-600 bg-purple-50' },
    { label: 'Jumlah Staff', value: teamPeople.filter((p) => p.isActive).length + extraPeople.length, icon: Users, tone: 'text-amber-600 bg-amber-50' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Marketer dari tab <b>Team</b> dipapar automatik (urus di Team). Tambah staff lain di sini.
        </p>
        <Button onClick={() => setShowAdd(true)} className="w-full sm:w-auto">
          <UserPlus className="mr-2 h-4 w-4" /> Tambah Staff
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-2xl font-bold">{s.value}</p>
              </div>
              <span className={`flex h-10 w-10 items-center justify-center rounded-full ${s.tone}`}>
                <s.icon className="h-5 w-5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, telefon…" className="pl-9" />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="sm:w-52"><SelectValue placeholder="All Roles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="marketer">Marketer</SelectItem>
                {roles.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-600">Gagal muat staff: {error.message}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2 font-medium">No</th>
                    <th className="p-2 font-medium">Nama</th>
                    <th className="p-2 font-medium">Telefon</th>
                    <th className="p-2 font-medium">Role</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 text-center font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">Tiada staff. Tambah marketer di tab Team, atau tekan “Tambah Staff”.</td></tr>
                  ) : rows.map((p, i) => (
                    <tr key={`${p.source}-${p.id}`} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2 font-medium">{p.name}</td>
                      <td className="p-2">{p.phone || '-'}</td>
                      <td className="p-2"><span className={`rounded px-1.5 py-0.5 text-xs font-medium ${roleBadge(p.role)}`}>{p.role}</span></td>
                      <td className="p-2">
                        <span className={`text-xs font-medium ${p.isActive ? 'text-green-600' : 'text-red-500'}`}>{p.isActive ? 'Aktif' : 'Nonaktif'}</span>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center justify-center gap-1">
                          {p.source === 'team' ? (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8" disabled title="Urus di tab Team"><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" disabled title="Urus di tab Team"><Trash2 className="h-4 w-4" /></Button>
                              <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Dari tab Team" />
                            </>
                          ) : (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" title="Edit" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                              {!AUDIT_MODE && (
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" title="Padam" onClick={() => setDeleting(p)}><Trash2 className="h-4 w-4" /></Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddAttendanceStaffModal open={showAdd} onOpenChange={setShowAdd} />
      <EditAttendanceStaffModal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} staff={editing ? toModalStaff(editing) : null} />
      <DeleteAttendanceStaffDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} staff={deleting ? toModalStaff(deleting) : null} />
    </div>
  );
}
