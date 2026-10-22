import { supabase } from '@/integrations/supabase/client';
import { getMalaysiaDate } from '@/lib/utils';

/**
 * Pospada = booking only. An order with a pospada date that is still Pending is NOT a sale:
 * it is left out of every sales figure (Dashboard, History, Finance, ranking, ROAS, salary…)
 * until someone presses Process. Process clears the pospada date and sets the order date to
 * that day, so the order then counts as a normal sale from that day on.
 * The same rule lives in the SQL reports (team_ranking, admin_client_stats, admin_dashboard_summary).
 */
export const isPospadaBooking = (o: {
  pospadaDate?: string | null; pospada_date?: string | null;
  deliveryStatus?: string | null; delivery_status?: string | null;
}): boolean => {
  const date = o.pospadaDate ?? o.pospada_date;
  const status = o.deliveryStatus ?? o.delivery_status ?? 'Pending';
  return !!date && status === 'Pending';
};

/** PostgREST filter that drops Pospada bookings: `query.or(NOT_POSPADA_BOOKING)`. */
export const NOT_POSPADA_BOOKING = 'pospada_date.is.null,delivery_status.neq.Pending';

/** Turn bookings into normal orders: no pospada date, order date = today (Malaysia). */
export async function processPospada(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  // (supabase as any): the generated DB types are out of date for this table.
  const { data, error } = await (supabase as any)
    .from('customer_purchases')
    .update({ pospada_date: null, date_order: getMalaysiaDate(), updated_at: new Date().toISOString() })
    .in('id', ids)
    .not('pospada_date', 'is', null)
    .eq('delivery_status', 'Pending')
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}
