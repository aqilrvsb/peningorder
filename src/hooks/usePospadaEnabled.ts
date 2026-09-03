import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Whether the tenant has the Pospada (booking) feature turned on
 * (Courier Settings → toggle). Default OFF. Readable by staff too via the
 * SECURITY DEFINER RPC my_pospada_enabled(). When off, all Pospada UI hides.
 */
export function usePospadaEnabled(): boolean {
  const { profile } = useAuth();
  const { data } = useQuery({
    queryKey: ['pospada-enabled'],
    enabled: !!profile?.id && profile.role !== 'superadmin',
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_pospada_enabled');
      if (error) throw error;
      return !!data;
    },
  });
  return !!data;
}
