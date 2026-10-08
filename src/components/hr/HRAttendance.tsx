import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AUDIT_MODE } from '@/lib/audit';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, X, Loader2, ChevronLeft, ChevronRight, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { format, getDaysInMonth, getDay } from 'date-fns';
import EditAttendanceStaffModal from './EditAttendanceStaffModal';
import DeleteAttendanceStaffDialog from './DeleteAttendanceStaffDialog';
import AttendanceReasonModal, { type ReasonSave } from './AttendanceReasonModal';
import { uploadAttendanceFile, removeAttendanceFile } from './attendanceFiles';
import { useAuth } from '@/context/AuthContext';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useHrPeople, useHrRoles, roleBadge, toModalStaff, type HrPerson } from './useHrPeople';

// HR → ATTENDANCE (DFR grid). Rows = the HQ's active Team marketers + the extra staff added
// in HR. Each click on a day moves to the next status:
//   Not Marked → Present → Half Day → Absent → Not Marked
// A reason + attachment (optional, image/PDF e.g. MC slip) for Half Day / Absent: "Sebab / lampiran"
// on the toast after the click, or right-click / long-press the cell. A dot = has reason/attachment.
type AttendanceStatus = 'present' | 'half_day' | 'absent' | null;
type AttendanceRecord = {
  id: string; user_id: string; date: string; status: AttendanceStatus;
  reason?: string | null; attachment_path?: string | null; attachment_name?: string | null;
};
const RECORD_COLS = 'id, user_id, date, status, reason, attachment_path, attachment_name';

const NEXT_STATUS: Record<'none' | 'present' | 'half_day' | 'absent', AttendanceStatus> = {
  none: 'present', present: 'half_day', half_day: 'absent', absent: null,
};
const STATUS_LABEL = { present: 'Present', half_day: 'Half Day', absent: 'Absent' } as const;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function HRAttendance() {
  const queryClient = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [roleFilter, setRoleFilter] = useState('all');
  const [editing, setEditing] = useState<HrPerson | null>(null);
  const [deleting, setDeleting] = useState<HrPerson | null>(null);
  // Cells with a save in flight — locked until it lands so fast clicks can't arrive out of order.
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [reasonFor, setReasonFor] = useState<{ userId: string; name: string; date: string } | null>(null);
  const longPress = useRef<{ timer?: number; fired: boolean }>({ fired: false });
  // Absent → Not Marked on a day with an attachment asks first (it deletes the file).
  const [clearing, setClearing] = useState<{ p: HrPerson; day: number; path: string } | null>(null);
  const { profile } = useAuth();
  const tenantId = profile?.parentUserId ?? profile?.id ?? null; // the HQ — storage folder for attachments

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);
  const daysInMonth = getDaysInMonth(new Date(year, month));
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const ymd = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const isWeekend = (day: number) => [0, 6].includes(getDay(new Date(year, month, day)));
  const dayLetter = (day: number) => format(new Date(year, month, day), 'EEE').charAt(0);

  const { teamPeople, extraPeople, isLoading: loadingPeople } = useHrPeople();
  const { data: roles = [] } = useHrRoles();
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
        .select(RECORD_COLS)
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

  const setCellSaving = (cell: string, on: boolean) =>
    setSaving((prev) => { const next = new Set(prev); if (on) next.add(cell); else next.delete(cell); return next; });

  // The grid updates instantly; the saved row replaces the placeholder when the write lands.
  // Half Day → Absent keeps the reason/attachment already added; Present has none.
  const mark = useMutation({
    mutationFn: async ({ userId, date, status, removePath }: { userId: string; date: string; status: AttendanceStatus; key: unknown[]; removePath?: string | null }) => {
      if (status === null) {
        const { error } = await (supabase as any).from('attendance').delete().eq('user_id', userId).eq('date', date);
        if (error) throw error;
        await removeAttendanceFile(removePath);
        return null;
      }
      const { data, error } = await (supabase as any)
        .from('attendance')
        .upsert(
          { user_id: userId, date, status, ...(status === 'present' ? { reason: null } : {}), updated_at: new Date().toISOString() },
          { onConflict: 'user_id,date' },
        )
        .select(RECORD_COLS)
        .single();
      if (error) throw error;
      return data as AttendanceRecord;
    },
    onMutate: async ({ userId, date, status, key }) => {
      setCellSaving(`${userId}-${date}`, true);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<AttendanceRecord[]>(key, (old = []) => {
        const prev = old.find((r) => r.user_id === userId && r.date === date);
        const rest = old.filter((r) => r !== prev);
        const keep = status !== 'present' && prev;
        return status
          ? [...rest, {
              id: `pending-${userId}-${date}`, user_id: userId, date, status,
              reason: keep ? prev.reason ?? null : null,
              attachment_path: keep ? prev.attachment_path ?? null : null,
              attachment_name: keep ? prev.attachment_name ?? null : null,
            }]
          : rest;
      });
    },
    onSuccess: (row, { userId, date, key }) => {
      if (row) queryClient.setQueryData<AttendanceRecord[]>(key, (old = []) => old.map((r) => (r.user_id === userId && r.date === date ? row : r)));
    },
    onError: (e: any, { key }) => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.error(e.message || 'Gagal kemas kini attendance');
    },
    onSettled: (_d, _e, { userId, date }) => setCellSaving(`${userId}-${date}`, false),
  });

  // Upload first, then save the row; the replaced/removed file is deleted only after the row saved.
  const saveReason = useMutation({
    mutationFn: async ({ userId, date, status, data, prevPath }: { userId: string; date: string; status: AttendanceStatus; data: ReasonSave; prevPath: string | null; key: unknown[] }) => {
      let attachment: { path: string; name: string } | null | undefined; // undefined = unchanged
      if (data.file) {
        if (!tenantId) throw new Error('Sesi tamat — sila login semula');
        attachment = await uploadAttendanceFile(tenantId, userId, date, data.file);
      } else if (data.removeAttachment) {
        attachment = null;
      }
      const { data: row, error } = await (supabase as any)
        .from('attendance')
        .upsert({
          user_id: userId, date, status,
          reason: data.reason.trim() || null,
          ...(attachment !== undefined ? { attachment_path: attachment?.path ?? null, attachment_name: attachment?.name ?? null } : {}),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,date' })
        .select(RECORD_COLS)
        .single();
      if (error) {
        if (attachment) await removeAttendanceFile(attachment.path);
        throw error;
      }
      if (attachment !== undefined && prevPath && prevPath !== attachment?.path) await removeAttendanceFile(prevPath);
      return row as AttendanceRecord;
    },
    onSuccess: (row, { userId, date, key }) => {
      queryClient.setQueryData<AttendanceRecord[]>(key, (old = []) => old.map((r) => (r.user_id === userId && r.date === date ? row : r)));
      toast.success('Disimpan');
      setReasonFor(null);
    },
    onError: (e: any) => toast.error(e.message || 'Gagal simpan sebab / lampiran'),
  });

  const openReason = (p: HrPerson, day: number) => {
    const status = statusOf(p.id, day);
    if (status !== 'half_day' && status !== 'absent') {
      toast.info('Sebab / lampiran hanya untuk Half Day / Absent — klik sel dulu untuk tukar status.');
      return;
    }
    setReasonFor({ userId: p.id, name: p.name, date: ymd(day) });
  };

  const onCell = (p: HrPerson, day: number) => {
    // A long-press on a phone opens the reason instead of moving the status.
    if (longPress.current.fired) { longPress.current.fired = false; return; }
    const status = NEXT_STATUS[statusOf(p.id, day) ?? 'none'];
    const date = ymd(day);
    const path = byKey.get(`${p.id}-${date}`)?.attachment_path;
    if (status === null && path) { setClearing({ p, day, path }); return; }
    mark.mutate({ userId: p.id, date, status, key: recordsKey });
    if (status === 'half_day' || status === 'absent') {
      // One toast at a time (same id), so clicking along a row doesn't stack them.
      toast(`${p.name} · ${format(new Date(year, month, day), 'd MMM')} — ${STATUS_LABEL[status]}`, {
        id: 'hr-att-reason',
        duration: 4000,
        action: { label: 'Sebab / lampiran', onClick: () => setReasonFor({ userId: p.id, name: p.name, date }) },
      });
    } else {
      toast.dismiss('hr-att-reason');
    }
  };

  const pressStart = (e: React.PointerEvent, p: HrPerson, day: number) => {
    if (e.pointerType !== 'touch') return;
    longPress.current.fired = false;
    window.clearTimeout(longPress.current.timer);
    longPress.current.timer = window.setTimeout(() => { longPress.current.fired = true; openReason(p, day); }, 500);
  };
  const pressEnd = () => window.clearTimeout(longPress.current.timer);

  // The open reason reads the live cell (status/reason may have just been saved).
  const reasonRecord = reasonFor ? byKey.get(`${reasonFor.userId}-${reasonFor.date}`) : undefined;
  const reasonStatus = reasonRecord?.status === 'half_day' || reasonRecord?.status === 'absent' ? reasonRecord.status : null;

  const count = (userId: string) => {
    let present = 0; let half = 0; let absent = 0;
    days.forEach((d) => {
      const s = statusOf(userId, d);
      if (s === 'present') present++; else if (s === 'half_day') half++; else if (s === 'absent') absent++;
    });
    return { present, half, absent };
  };

  const prevMonth = () => (month === 0 ? (setMonth(11), setYear(year - 1)) : setMonth(month - 1));
  const nextMonth = () => (month === 11 ? (setMonth(0), setYear(year + 1)) : setMonth(month + 1));

  const rows = people.filter((p) => roleFilter === 'all' || p.role === roleFilter);
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
                {roles.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm lg:ml-auto">
              <span className="flex items-center gap-1"><span className="flex h-6 w-6 items-center justify-center rounded bg-green-100"><Check className="h-4 w-4 text-green-600" /></span><span className="text-muted-foreground">Present</span></span>
              <span className="flex items-center gap-1"><span className="flex h-6 w-6 items-center justify-center rounded bg-yellow-100"><TriangleAlert className="h-4 w-4 text-yellow-600" /></span><span className="text-muted-foreground">Half Day</span></span>
              <span className="flex items-center gap-1"><span className="flex h-6 w-6 items-center justify-center rounded bg-red-100"><X className="h-4 w-4 text-red-600" /></span><span className="text-muted-foreground">Absent</span></span>
              <span className="flex items-center gap-1"><span className="h-6 w-6 rounded bg-gray-100" /><span className="text-muted-foreground">Not Marked</span></span>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-500" />
            Klik sel untuk tukar status. Sebab / lampiran (MC, surat — gambar atau PDF) untuk Half Day / Absent: tekan “Sebab / lampiran” selepas klik, atau klik kanan (telefon: tekan lama) pada sel. Titik = ada sebab / lampiran.
          </p>
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
                    <th className="min-w-[40px] bg-yellow-50 p-1 text-center">H</th>
                    <th className="min-w-[40px] bg-red-50 p-1 text-center">A</th>
                    <th className="min-w-[70px] p-1 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? rows.map((p) => {
                    const { present, half, absent } = count(p.id);
                    return (
                      <tr key={`${p.source}-${p.id}`} className="border-b hover:bg-muted/30">
                        <td className="sticky left-0 z-10 bg-background p-2">
                          <p className="font-medium">{p.name}</p>
                          {p.source === 'team' && p.idstaff && <p className="text-xs text-muted-foreground">{p.idstaff}</p>}
                        </td>
                        <td className="p-1 text-center">
                          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${roleBadge(p.role)}`}>{p.role}</span>
                        </td>
                        {days.map((d) => {
                          const status = statusOf(p.id, d);
                          const reason = reasonOf(p.id, d);
                          const hasFile = !!byKey.get(`${p.id}-${ymd(d)}`)?.attachment_path;
                          const label = status ? STATUS_LABEL[status] : 'Not Marked';
                          return (
                            <td key={d} className={`p-1 text-center ${isWeekend(d) ? 'bg-gray-50' : ''}`}>
                              <button
                                type="button"
                                onClick={() => onCell(p, d)}
                                onContextMenu={(e) => { e.preventDefault(); pressEnd(); openReason(p, d); }}
                                onPointerDown={(e) => pressStart(e, p, d)}
                                onPointerUp={pressEnd}
                                onPointerLeave={pressEnd}
                                onPointerCancel={pressEnd}
                                disabled={saving.has(`${p.id}-${ymd(d)}`)}
                                title={`${label}${reason ? ` — ${reason}` : ''}${hasFile ? ' · ada lampiran' : ''}`}
                                aria-label={`${p.name} ${ymd(d)} ${label}${reason ? ` — ${reason}` : ''}`}
                                className={`relative flex h-7 w-7 select-none items-center justify-center rounded transition-colors [-webkit-touch-callout:none] ${
                                  status === 'present' ? 'bg-green-100 hover:bg-green-200'
                                  : status === 'half_day' ? 'bg-yellow-100 hover:bg-yellow-200'
                                  : status === 'absent' ? 'bg-red-100 hover:bg-red-200'
                                  : 'bg-gray-100 hover:bg-gray-200'}`}
                              >
                                {status === 'present' && <Check className="h-4 w-4 text-green-600" />}
                                {status === 'half_day' && <TriangleAlert className="h-4 w-4 text-yellow-600" />}
                                {status === 'absent' && <X className="h-4 w-4 text-red-600" />}
                                {(reason || hasFile) && status !== 'present' && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-slate-500" />}
                              </button>
                            </td>
                          );
                        })}
                        <td className="bg-green-50 p-1 text-center font-bold text-green-700">{present}</td>
                        <td className="bg-yellow-50 p-1 text-center font-bold text-yellow-700">{half}</td>
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
                    <tr><td colSpan={daysInMonth + 6} className="py-12 text-center text-muted-foreground">No employees found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EditAttendanceStaffModal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} staff={editing ? toModalStaff(editing) : null} />
      <DeleteAttendanceStaffDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} staff={deleting ? toModalStaff(deleting) : null} />

      <AttendanceReasonModal
        open={!!reasonFor && !!reasonStatus}
        onOpenChange={(o) => !o && setReasonFor(null)}
        employeeName={reasonFor?.name || ''}
        date={reasonFor?.date || ''}
        statusLabel={reasonStatus ? STATUS_LABEL[reasonStatus] : ''}
        existingReason={reasonRecord?.reason}
        existingAttachment={reasonRecord?.attachment_path ? { path: reasonRecord.attachment_path, name: reasonRecord.attachment_name ?? null } : null}
        isLoading={saveReason.isPending || (!!reasonFor && saving.has(`${reasonFor.userId}-${reasonFor.date}`))}
        onSave={async (data) => {
          if (!reasonFor || !reasonStatus) return;
          await saveReason.mutateAsync({
            userId: reasonFor.userId, date: reasonFor.date, status: reasonStatus, data,
            prevPath: reasonRecord?.attachment_path ?? null, key: recordsKey,
          }).catch(() => {});
        }}
      />

      <AlertDialog open={!!clearing} onOpenChange={(o) => !o && setClearing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kosongkan hari ni?</AlertDialogTitle>
            <AlertDialogDescription>
              {clearing?.p.name} ada lampiran pada {clearing ? format(new Date(year, month, clearing.day), 'd MMM yyyy') : ''}. Jadikan Not Marked akan buang sebab dan lampiran tu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (!clearing) return;
                mark.mutate({ userId: clearing.p.id, date: ymd(clearing.day), status: null, key: recordsKey, removePath: clearing.path });
                toast.dismiss('hr-att-reason');
                setClearing(null);
              }}
            >
              Kosongkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
