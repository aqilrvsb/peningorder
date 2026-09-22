import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Whether the tenant has chosen to HIDE the "Pickup" (self-collect) payment
 * option from the order key-in form (Courier Settings). Default OFF (Pickup
 * shown). Readable by staff too via the SECURITY DEFINER RPC my_hide_pickup().
 */
export function useHidePickup(): boolean {
  const { profile } = useAuth();
  const { data } = useQuery({
    queryKey: ['hide-pickup'],
    enabled: !!profile?.id && profile.role !== 'superadmin',
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_hide_pickup');
      if (error) throw error;
      return !!data;
    },
  });
  return !!data;
}
