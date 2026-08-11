import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

export type TeamMember = { idstaff: string; name: string; is_self: boolean; is_client: boolean };

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
  const showFilter = profile?.role === 'client' && members.length > 1;
  return { members, nameByIdstaff, showFilter };
}
