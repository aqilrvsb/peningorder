import { cn } from '@/lib/utils';

// Deep-link a tracking number to the courier's own tracking page. A Ninja Van number (NV…) goes
// to Ninja Van whatever the kurier field says (brand-shipped bundles keep e.g. "JNT COD" there);
// otherwise the kurier decides. Unknown couriers fall back to parcelsapp (auto-detects the courier).
export const courierTrackUrl = (kurier: string | null | undefined, tn: string): string => {
  const k = (kurier || '').toLowerCase();
  const t = encodeURIComponent((tn || '').trim());
  if (/^NV/i.test((tn || '').trim()) || k.includes('ninja')) return `https://www.ninjavan.co/en-my/tracking?id=${t}`;
  if (k.includes('jnt') || k.includes('j&t')) return `https://www.jtexpress.my/tracking?billcode=${t}`;
  if (k.includes('poslaju') || k.includes('pos ')) return `https://track.pos.com.my/postal-services/quick-access?track-trace=${t}`;
  if (k.includes('dhl')) return `https://ecommerceportal.dhl.com/track/?ref=${t}`;
  if (k.includes('spx')) return `https://spx.com.my/${t}`;
  return `https://parcelsapp.com/en/tracking/${t}`;
};

/** Tracking number as a link to the courier's tracking page ("-" when there is none). */
export function TrackingLink({ kurier, tracking, className }: {
  kurier?: string | null; tracking?: string | null; className?: string;
}) {
  const tn = (tracking || '').trim();
  if (!tn) return <span className={cn('font-mono text-xs', className)}>-</span>;
  return (
    <a
      href={courierTrackUrl(kurier, tn)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn('font-mono text-xs text-blue-600 hover:underline dark:text-blue-400', className)}
      title="Jejak parcel di laman kurier"
    >
      {tn}
    </a>
  );
}
