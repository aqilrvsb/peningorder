import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { CircleCheck, FilePen, Users } from 'lucide-react';
import { TableSkeleton, EmptyState } from '@/components/common/SoftUI';
import { toast } from 'sonner';
import { useHrPeople, roleBadge, type HrPerson } from './useHrPeople';
import StaffDetailsModal, { SECTION_TITLE, sectionFilled, type DetailSection, type SectionValue } from './StaffDetailsModal';

// HR → DATABASE STAFF (DFR). Everyone HR tracks (active Team marketers + extra staff) with four
// detail forms: Info Diri / Bank / Waris / Akademik. Green tick = filled, grey = not yet.
// Stored in staff_details (only the HQ and its HR account can read it — IC and bank numbers).
type DetailsRow = { person_id: string; diri: SectionValue | null; bank: SectionValue | null; waris: SectionValue | null; akademik: SectionValue | null };

const SECTIONS: { key: DetailSection; label: string }[] = [
  { key: 'diri', label: 'Info Diri' },
  { key: 'bank', label: 'Info Bank' },
  { key: 'waris', label: 'Info Waris' },
  { key: 'akademik', label: 'Info Akademik' },
];

export default function HRDatabaseStaff() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const tenantId = profile?.parentUserId ?? profile?.id ?? null;
  const { teamPeople, extraPeople, isLoading: loadingPeople } = useHrPeople();
  const [open, setOpen] = useState<{ person: HrPerson; section: DetailSection } | null>(null);

  const people = [...teamPeople.filter((p) => p.isActive), ...extraPeople].sort((a, b) => a.name.localeCompare(b.name));

  const { data: details = [], isLoading: loadingDetails } = useQuery({
    queryKey: ['hr-staff-details'],
    queryFn: async () => {
      // staff_details isn't in the generated types yet; RLS scopes rows to this HQ.
      const { data, error } = await (supabase as any).from('staff_details').select('person_id, diri, bank, waris, akademik');
      if (error) throw error;
      return (data || []) as DetailsRow[];
    },
  });
  const byPerson = new Map(details.map((d) => [d.person_id, d]));

  const save = useMutation({
    mutationFn: async ({ personId, section, value }: { personId: string; section: DetailSection; value: SectionValue }) => {
      if (!tenantId) throw new Error('Sesi tamat — sila login semula');
      const { error } = await (supabase as any)
        .from('staff_details')
        .upsert({ owner_id: tenantId, person_id: personId, [section]: value, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,person_id' });
      if (error) throw error;
    },
    onSuccess: (_d, { section }) => {
      toast.success(`${SECTION_TITLE[section]} disimpan`);
      queryClient.invalidateQueries({ queryKey: ['hr-staff-details'] });
      setOpen(null);
    },
    onError: (e: any) => toast.error(e.message || 'Gagal simpan'),
  });

  const loading = loadingPeople || loadingDetails;
  const current = open ? byPerson.get(open.person.id) : undefined;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Total: {people.length} staff</p>
      <Card>
        <CardContent className="p-4 sm:px-6">
          {loading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="w-12 p-2 font-semibold">No</th>
                    <th className="p-2 font-semibold">Employee</th>
                    <th className="p-2 font-semibold">Role</th>
                    {SECTIONS.map((s) => <th key={s.key} className="p-2 text-center font-semibold">{s.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {people.length ? people.map((p, i) => {
                    const row = byPerson.get(p.id);
                    return (
                      <tr key={`${p.source}-${p.id}`} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2 font-medium">{p.name}</td>
                        <td className="p-2"><span className={`rounded px-1.5 py-0.5 text-xs font-medium ${roleBadge(p.role)}`}>{p.role}</span></td>
                        {SECTIONS.map((s) => {
                          const filled = sectionFilled(row?.[s.key]);
                          return (
                            <td key={s.key} className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => setOpen({ person: p, section: s.key })}
                                title={`${s.label}: ${filled ? 'sudah diisi' : 'belum diisi'}`}
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                                  filled ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600'}`}
                              >
                                {filled ? <CircleCheck className="h-4 w-4" /> : <FilePen className="h-4 w-4" />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={7} className="text-muted-foreground"><EmptyState icon={Users} title="Tiada staff. Tambah marketer di tab Team, atau staff di HR → User." /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {open && (
        <StaffDetailsModal
          open
          onOpenChange={(o) => !o && setOpen(null)}
          section={open.section}
          personName={open.person.name}
          saved={(current?.[open.section] as SectionValue | null) ?? null}
          defaults={{ nama: open.person.name, jawatan: open.person.role === 'marketer' ? 'Marketer' : open.person.role, telefon: open.person.phone || '' }}
          isLoading={save.isPending}
          onSave={async (value) => { await save.mutateAsync({ personId: open.person.id, section: open.section, value }).catch(() => {}); }}
        />
      )}
    </div>
  );
}
