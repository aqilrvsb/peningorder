import { cn } from '@/lib/utils';
import { TrackingLink } from './TrackingLink';

// "2 Tracking" bundles (Bring Your Courier): one order ships as two boxes. tracking_number = box 1
// (carries the full COD, decides Success / Return / Collected); tracking_number_2 = box 2, whose
// latest courier status is seos_2. See supabase/migrations/20261122_bundle_two_tracking.sql.

type BoxOrder = {
  kurier?: string | null;
  tracking_number?: string | null;
  tracking_number_2?: string | null;
  seos_2?: string | null;
  delivery_status?: string | null;
};

const BAD_RE = /return|rts|fail|exception|reject|lost|damage|cancel/i;
const DELIVERED_RE = /deliver|received|success|completed/i;

/** Box 2 needs a person: it failed / is coming back, or it reached a customer who returned box 1. */
export function box2Alert(o: BoxOrder): string | null {
  if (!o.tracking_number_2) return null;
  const s = String(o.seos_2 || '');
  if (o.delivery_status === 'Return' && DELIVERED_RE.test(s) && !BAD_RE.test(s)) {
    return 'Kotak 2 dah diterima customer tapi kotak 1 Return — tuntut balik kotak 2';
  }
  if (BAD_RE.test(s) && o.delivery_status !== 'Cancelled') return `Kotak 2 bermasalah — ${s}`;
  return null;
}

const Tag = ({ n }: { n: number }) => (
  <span className="rounded bg-amber-100 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
    Kotak {n}
  </span>
);

/** The order's tracking link(s): one as before, or "KOTAK 1 / KOTAK 2" with both links. */
export function OrderTracking({ order, className }: { order: BoxOrder; className?: string }) {
  if (!order.tracking_number_2) {
    return <TrackingLink kurier={order.kurier} tracking={order.tracking_number} className={className} />;
  }
  return (
    <span className="inline-flex flex-col items-start gap-1" title="2 kotak — tampal kedua-dua waybill">
      <span className="flex items-center gap-1.5">
        <Tag n={1} />
        <TrackingLink kurier={order.kurier} tracking={order.tracking_number} className={className} />
      </span>
      <span className="flex items-center gap-1.5">
        <Tag n={2} />
        <TrackingLink kurier={order.kurier} tracking={order.tracking_number_2} className={className} />
      </span>
    </span>
  );
}

/** Box 2's latest courier status, under the order's Parcel Status (red when it needs follow-up). */
export function Box2Status({ order, className }: { order: BoxOrder; className?: string }) {
  if (!order.tracking_number_2) return null;
  const alert = box2Alert(order);
  return (
    <span className={cn('mt-1 block whitespace-normal text-xs', alert ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground', className)}>
      {alert || `Kotak 2: ${order.seos_2 || 'menunggu status kurier'}`}
    </span>
  );
}

/** Labels to print for these orders (a 2-box order has two). */
export const labelCount = (orders: BoxOrder[]) => orders.reduce((n, o) => n + (o.tracking_number_2 ? 2 : 1), 0);
