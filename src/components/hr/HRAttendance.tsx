import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AUDIT_MODE } from '@/lib/audit';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, X, Loader2, ChevronLeft, ChevronRight, UserPlus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, getDaysInMonth, getDay } from 'date-fns';
import AddAttendanceStaffModal from './AddAttendanceStaffModal';
import EditAttendanceStaffModal from './EditAttendanceStaffModal';
import DeleteAttendanceStaffDialog from './DeleteAttendanceStaffDialog';
import AbsenceReasonModal from './AbsenceReasonModal';
import { useHrPeople, roleBadge, toModalStaff, STAFF_ROLES, type HrPerson } from './useHrPeople';

// HR → ATTENDANCE — same logic as DFR's HR Attendance. Rows = the HQ's active Team
// marketers + the extra staff added in HR. Click a day: blank → Present; Present → Absent
// (reason required; cancelling reverts to blank); Absent → view/edit reason or mark Present.
type AttendanceStatus = 'present' | 'absent' | null;
type AttendanceRecord = { id: string; user_id: string; date: string; status: AttendanceStatus; reason?: string | null };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function HRAttendance() {
  const queryClient = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [roleFilter, setRoleFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<HrPerson | null>(null);
  const [deleting, setDeleting] = useState<HrPerson | null>(null);
  const [absence, setAbsence] = useState<{ userId: string; employeeName: string; date: string; existingReason?: string | null; isNewAbsence?: boolean } | null>(null);
  const [absenceSaving, setAbsenceSaving] = useState(false);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);
  const daysInMonth = getDaysInMonth(new Date(year, month));
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const ymd = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const isWeekend = (day: number) => [0, 6].includes(getDay(new Date(year, month, day)));
  const dayLetter = (day: number) => format(new Date(year, month, day), 'EEE').charAt(0);

  const { teamPeople, extraPeople, isLoading: loadingPeople } = useHrPeople();
  // Attendance is for people currently working: active Team marketers + extra staff (soft-deleted ones are already gone).
  const people = [...teamPeople.filter((p) => p.isActive), ...extraPeople]
    .sort((a, b) => a.name.localeCompare(b.name));

  const recordsKey = ['hr-attendance-records', year, month];
  const { data: records = [], isLoading: loadingRecords } = useQuery({
    queryKey: recordsKey,
    queryFn: async () => {
      // attendance isn't in the generated types yet; RLS scopes rows to this HQ.
      const { data, error } = await (supabase as any)
        .from('attendance')
        .select('id, user_id, date, status, reason')
        .gte('date', ymd(1))
        .lte('date', ymd(daysInMonth));
      if (error) throw error;
      return (data || []) as AttendanceRecord[];
    },
  });

  const byKey = useMemo(() => {
    const m = new Map<string, AttendanceRecord>();
    records.forEach((r) => m.set(`${r.user_id}-${r.date}`, r));
    return m;
  }, [records]);
  const statusOf = (userId: string, day: number): AttendanceStatus => byKey.get(`${userId}-${ymd(day)}`)?.status ?? null;
  const reasonOf = (userId: string, day: number) => byKey.get(`${userId}-${ymd(day)}`)?.reason ?? null;

  const toggle = useMutation({
    mutationFn: async ({ userId, date, newStatus }: { userId: string; date: string; newStatus: AttendanceStatus }) => {
      if (newStatus === null) {
        const { error } = await (supabase as any).from('attendance').delete().eq('user_id', userId).eq('date', date);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('attendance')
          .upsert({ user_id: userId, date, status: newStatus, reason: null, updated_at: new Date().toISOString() }, { onConflict: 'user_id,date' });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recordsKey }),
    onError: (e: any) => toast.error(e.message || 'Gagal kemas kini attendance'),
  });

  const markAbsent = useMutation({
    mutationFn: async ({ userId, date, reason }: { userId: string; date: string; reason: string }) => {
      const { error } = await (supabase as any)
        .from('attendance')
        .upsert({ user_id: userId, date, status: 'absent', reason, updated_at: new Date().toISOString() }, { onConflict: 'user_id,date' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recordsKey });
      toast.success('Absence recorded');
    },
    onError: (e: any) => toast.error(e.message || 'Gagal rekod absent'),
  });

  // blank → present; present → absent (modal, new); absent → modal to view/edit.
  const onCell = (p: HrPerson, day: number) => {
    const date = ymd(day);
    const status = statusOf(p.id, day);
    if (status === null) toggle.mutate({ userId: p.id, date, newStatus: 'present' });
    else if (status === 'present') setAbsence({ userId: p.id, employeeName: p.name, date, existingReason: null, isNewAbsence: true });
    else setAbsence({ userId: p.id, employeeName: p.name, date, existingReason: reasonOf(p.id, day), isNewAbsence: false });
  };

  const count = (userId: string) => {
    let present = 0; let absent = 0;
    days.forEach((d) => { const s = statusOf(userId, d); if (s === 'present') present++; else if (s === 'absent') absent++; });
    return { present, absent };
  };

  const prevMonth = () => (month === 0 ? (setMonth(11), setYear(year - 1)) : setMonth(month - 1));
  const nextMonth = () => (month === 11 ? (setMonth(0), setYear(year + 1)) : setMonth(month + 1));

  const rows = people.filter((p) => roleFilter === 'all' || p.role === roleFilter);
  const busy = toggle.isPending || markAbsent.isPending;
  const loading = loadingPeople || loadingRecords;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth} aria-label="Bulan sebelum"><ChevronLeft className="h-4 w-4" /></Button>
              <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={nextMonth} aria-label="Bulan seterusnya"><ChevronRight className="h-4 w-4" /></Button>
            </div>

            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All Roles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="marketer">Marketer</SelectItem>
                {STAFF_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>

            <Button onClick={() => setShowAdd(true)}><UserPlus className="mr-2 h-4 w-4" /> Add Staff</Button>

            <div className="flex items-center gap-4 text-sm lg:ml-auto">
              <span className="flex items-center gap-1"><span className="flex h-6 w-6 items-center justify-center rounded bg-green-100"><Check className="h-4 w-4 text-green-600" /></span><span className="text-muted-foreground">Present</span></span>
              <span className="flex items-center gap-1"><span className="flex h-6 w-6 items-center justify-center rounded bg-red-100"><X className="h-4 w-4 text-red-600" /></span><span className="text-muted-foreground">Absent</span></span>
              <span className="flex items-center gap-1"><span className="h-6 w-6 rounded bg-gray-100" /><span className="text-muted-foreground">Not Marked</span></span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="sticky left-0 z-10 min-w-[160px] bg-background p-2 text-left sm:min-w-[180px]">Employee</th>
                    <th className="min-w-[50px] bg-muted/30 p-1 text-center">Role</th>
                    {days.map((d) => (
                      <th key={d} className={`min-w-[32px] p-1 text-center ${isWeekend(d) ? 'bg-gray-100' : ''}`}>
                        <div className="flex flex-col items-center">
                          <span className="text-xs text-muted-foreground">{dayLetter(d)}</span>
                          <span className="font-medium">{d}</span>
                        </div>
                      </th>
                    ))}
                    <th className="min-w-[40px] bg-green-50 p-1 text-center">P</th>
                    <th className="min-w-[40px] bg-red-50 p-1 text-center">A</th>
                    <th className="min-w-[70px] p-1 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? rows.map((p) => {
                    const { present, absent } = count(p.id);
                    return (
                      <tr key={`${p.source}-${p.id}`} className="border-b hover:bg-muted/30">
                        <td className="sticky left-0 z-10 bg-background p-2">
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.idstaff || '-'}</p>
                        </td>
                        <td className="p-1 text-center">
                          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${roleBadge(p.role)}`}>{p.role}</span>
                        </td>
                        {days.map((d) => {
                          const status = statusOf(p.id, d);
                          const reason = reasonOf(p.id, d);
                          return (
                            <td key={d} className={`p-1 text-center ${isWeekend(d) ? 'bg-gray-50' : ''}`}>
                              <button
                                type="button"
                                onClick={() => onCell(p, d)}
                                disabled={busy}
                                title={status === 'absent' && reason ? `Reason: ${reason}` : undefined}
                                aria-label={`${p.name} ${ymd(d)} ${status || 'not marked'}`}
                                className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
                                  status === 'present' ? 'bg-green-100 hover:bg-green-200'
                                  : status === 'absent' ? 'cursor-pointer bg-red-100 hover:bg-red-200'
                                  : 'bg-gray-100 hover:bg-gray-200'}`}
                              >
                                {status === 'present' && <Check className="h-4 w-4 text-green-600" />}
                                {status === 'absent' && <X className="h-4 w-4 text-red-600" />}
                              </button>
                            </td>
                          );
                        })}
                        <td className="bg-green-50 p-1 text-center font-bold text-green-700">{present}</td>
                        <td className="bg-red-50 p-1 text-center font-bold text-red-700">{absent}</td>
                        <td className="p-1 text-center">
                          {p.source === 'extra' ? (
                            <div className="flex items-center justify-center gap-1">
                              <button type="button" onClick={() => setEditing(p)} className="rounded p-1 text-blue-600 hover:bg-blue-100" title="Edit"><Pencil className="h-4 w-4" /></button>
                              {!AUDIT_MODE && (
                                <button type="button" onClick={() => setDeleting(p)} className="rounded p-1 text-red-600 hover:bg-red-100" title="Delete"><Trash2 className="h-4 w-4" /></button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground" title="Urus di tab Team">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={daysInMonth + 5} className="py-12 text-center text-muted-foreground">No employees found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddAttendanceStaffModal open={showAdd} onOpenChange={setShowAdd} />
      <EditAttendanceStaffModal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} staff={editing ? toModalStaff(editing) : null} />
      <DeleteAttendanceStaffDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} staff={deleting ? toModalStaff(deleting) : null} />

      <AbsenceReasonModal
        open={!!absence}
        onOpenChange={(open) => {
          // Cancelled a new absence (it came from Present) → back to Not Marked, as in DFR.
          if (!open && absence?.isNewAbsence) toggle.mutate({ userId: absence.userId, date: absence.date, newStatus: null });
          if (!open) setAbsence(null);
        }}
        employeeName={absence?.employeeName || ''}
        date={absence?.date || ''}
        existingReason={absence?.existingReason}
        onSave={async (reason) => {
          if (!absence) return;
          setAbsenceSaving(true);
          try {
            await markAbsent.mutateAsync({ userId: absence.userId, date: absence.date, reason });
            setAbsence(null);
          } catch { /* toast shown by the mutation */ } finally { setAbsenceSaving(false); }
        }}
        onMarkPresent={absence ? async () => {
          setAbsenceSaving(true);
          try {
            await toggle.mutateAsync({ userId: absence.userId, date: absence.date, newStatus: 'present' });
            setAbsence(null);
          } finally { setAbsenceSaving(false); }
        } : undefined}
        isLoading={absenceSaving}
      />
    </div>
  );
}
