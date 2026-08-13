import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

export type TeamMember = { idstaff: string; name: string; is_self: boolean; is_client: boolean; commission_percent?: number; pay_mode?: string };

/**
 * The caller's tenant roster (client + their marketer staff), used for the
 * team filter dropdown and the ID Staff → Nama column lookup on data tables.
 * Only a client with ≥1 staff gets a filter (staff see only their own rows).
 */
export function useTeam() {
  const { profile } = useAuth();
  const { data } = useQuery({
    queryKey: ['team-roster'],
    enabled: !!profile?.id && profile.role !== 'superadmin',
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('team_roster');
      if (error) throw error;
      return (data || []) as TeamMember[];
    },
  });
  const members = data || [];
  const nameByIdstaff = new Map(members.map((m) => [m.idstaff, m.name] as const));
  // idstaff -> { percent, mode } for commission calculations (RLS-safe via RPC).
  const metaByIdstaff = new Map(
    members.map((m) => [m.idstaff, { percent: Number(m.commission_percent) || 0, mode: m.pay_mode || 'commission_order' }] as const),
  );
  const showFilter = profile?.role === 'client' && members.length > 1;
  return { members, nameByIdstaff, metaByIdstaff, showFilter };
}
