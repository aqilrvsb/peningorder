// Meta Pixel for the public sales funnel only: "/" (landing), "/checkout",
// "/auth". Client dashboards are never tracked. Does nothing until a pixel id
// is set (VITE_META_PIXEL_ID, or META_PIXEL_ID below — pixel ids are public).
//
// Funnel events: PageView → InitiateCheckout (checkout opened) →
// CompleteRegistration (account created, before CHIP) → Purchase (back from
// CHIP with payment=success).

const META_PIXEL_ID = '821462174157063'; // dataset "Peningbot" (unused) in business Amal Ahmed shop, used for PeningOrder

const PIXEL_ID = ((import.meta.env.VITE_META_PIXEL_ID as string | undefined) || META_PIXEL_ID).trim();
const PENDING_KEY = 'po_pixel_pending_purchase';

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue: unknown[]; loaded: boolean; version: string; push: unknown };
declare global {
  interface Window { fbq?: Fbq; _fbq?: Fbq }
}

let started = false;

function start(): boolean {
  if (!PIXEL_ID || typeof window === 'undefined') return false;
  if (started) return true;
  started = true;
  // Standard Meta base code, written out so the id stays in one place.
  if (!window.fbq) {
    const n = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args);
      else n.queue.push(args);
    } as Fbq;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    window.fbq = n;
    if (!window._fbq) window._fbq = n;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
  }
  window.fbq!('init', PIXEL_ID);
  return true;
}

export const isFunnelPath = (path: string) => path === '/' || path.startsWith('/checkout') || path.startsWith('/auth');

export function pixelTrack(event: string, params?: Record<string, unknown>) {
  if (!start()) return;
  window.fbq!('track', event, params ?? {});
}

/** Account created and about to pay: count the sign-up and remember the plan for Purchase. */
export function pixelRegistered(plan: string, value: number) {
  pixelTrack('CompleteRegistration', { content_name: plan, value, currency: 'MYR' });
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ plan, value })); } catch { /* storage blocked */ }
}

/** Back from CHIP with payment=success: fire Purchase once for the remembered plan. */
export function pixelPurchaseIfPending() {
  let pending: { plan: string; value: number } | null = null;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (raw) { pending = JSON.parse(raw); sessionStorage.removeItem(PENDING_KEY); }
  } catch { /* storage blocked */ }
  if (pending) pixelTrack('Purchase', { content_name: pending.plan, value: pending.value, currency: 'MYR' });
}
