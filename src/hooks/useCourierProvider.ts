import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

/** Couriers a BYOC tenant can connect directly (own accounts, no ParcelDaily). */
export const OWN_COURIERS = ['ninjavan', 'poslaju', 'jnt'] as const;
export type OwnCourier = (typeof OWN_COURIERS)[number];
/** Display labels — same labels the order form / kurier column already use. */
export const OWN_COURIER_LABEL: Record<OwnCourier, string> = { ninjavan: 'Ninjavan', poslaju: 'Poslaju', jnt: 'JNT' };

export interface CourierProvider {
  /** 'own' = BYOC plan (book with the tenant's own courier accounts); else ParcelDaily. */
  provider: 'parceldaily' | 'own';
  /** Own couriers switched on in Courier Settings (BYOC only). */
  ownCouriers: OwnCourier[];
  isLoading: boolean;
}

/**
 * The tenant's courier provider. Follows the owner's plan (plan 'byoc' → own couriers),
 * readable by staff via the SECURITY DEFINER RPC my_courier_provider() (no secrets).
 */
export function useCourierProvider(): CourierProvider {
  const { profile } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['courier-provider'],
    enabled: !!profile?.id && profile.role !== 'superadmin',
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('my_courier_provider');
      if (error) throw error;
      return {
        provider: data?.provider === 'own' ? 'own' : 'parceldaily',
        ownCouriers: (Array.isArray(data?.own_couriers) ? data.own_couriers : []) as OwnCourier[],
      } as const;
    },
  });
  return { provider: data?.provider ?? 'parceldaily', ownCouriers: data?.ownCouriers ?? [], isLoading };
}
