import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Everyone HR tracks for this HQ:
//  - "team"  = the marketer staff from the Team tab (read-only here — managed in Team)
//  - "extra" = non-login staff HQ adds in HR (attendance_staff, scoped to the HQ by RLS)
export type HrPerson = {
  id: string;
  name: string;
  idstaff: string | null;
  phone: string | null;
  address: string | null;
  role: string;
  isActive: boolean;
  source: 'team' | 'extra';
};

type TeamStaff = { id: string; idstaff: string; full_name: string | null; whatsapp: string | null; whatsapp_number: string | null; is_active: boolean; role?: string };
type ExtraStaff = { id: string; name: string; ic_number: string | null; phone: string | null; address: string | null; role: string; is_active: boolean | null };

export function useHrPeople() {
  // Same query key + shape as the Team page, so both share one cache.
  const team = useQuery({
    queryKey: ['team-staff'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('team-staff', { body: { action: 'list' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.staff || []) as TeamStaff[];
    },
  });

  // Key matches what the Add/Edit/Delete staff modals invalidate.
  const extra = useQuery({
    queryKey: ['hr-attendance-staff'],
    queryFn: async () => {
      // attendance_staff.owner_id isn't in the generated types yet.
      const { data, error } = await (supabase as any)
        .from('attendance_staff')
        .select('id, name, ic_number, phone, address, role, is_active')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data || []) as ExtraStaff[];
    },
  });

  const teamPeople: HrPerson[] = (team.data || [])
    .filter((s) => !s.role || s.role === 'marketer') // the Team tab's marketer section (not the Logistic/HR logins)
    .map((s) => ({
      id: s.id,
      name: s.full_name || s.idstaff,
      idstaff: s.idstaff,
      phone: s.whatsapp || s.whatsapp_number || null,
      address: null,
      role: 'marketer',
      isActive: s.is_active !== false,
      source: 'team' as const,
    }))
    .sort((a, b) => (a.idstaff || '').localeCompare(b.idstaff || '', undefined, { numeric: true }));

  const extraPeople: HrPerson[] = (extra.data || []).map((s) => ({
    id: s.id,
    name: s.name,
    idstaff: s.ic_number,
    phone: s.phone,
    address: s.address,
    role: s.role,
    isActive: s.is_active !== false,
    source: 'extra' as const,
  }));

  return {
    teamPeople,
    extraPeople,
    all: [...teamPeople, ...extraPeople],
    isLoading: team.isLoading || extra.isLoading,
    error: (team.error || extra.error) as Error | null,
  };
}

// Roles this HQ defined in HR → Role (the Role dropdown in Add/Edit Staff). "marketer" is
// fixed (Team tab) and never stored here.
export type HrRole = { id: string; name: string };

export function useHrRoles() {
  return useQuery({
    queryKey: ['hr-roles'],
    queryFn: async () => {
      // hr_roles isn't in the generated types yet; RLS scopes rows to this HQ.
      const { data, error } = await (supabase as any).from('hr_roles').select('id, name').order('name');
      if (error) throw error;
      return (data || []) as HrRole[];
    },
  });
}

// Badge colour per role: marketer is always blue, other roles get a stable colour from their name.
const BADGE_TONES = [
  'bg-amber-100 text-amber-800', 'bg-green-100 text-green-800', 'bg-pink-100 text-pink-800',
  'bg-orange-100 text-orange-800', 'bg-cyan-100 text-cyan-800', 'bg-violet-100 text-violet-800',
  'bg-teal-100 text-teal-800', 'bg-rose-100 text-rose-800',
];
export const roleBadge = (role: string) => {
  if (role === 'marketer') return 'bg-blue-100 text-blue-800';
  let h = 0;
  for (const c of role.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BADGE_TONES[h % BADGE_TONES.length];
};

/** The modals' staff shape. */
export const toModalStaff = (p: HrPerson) => ({
  id: p.id, name: p.name, ic_number: p.idstaff, phone: p.phone, address: p.address, role: p.role,
});
