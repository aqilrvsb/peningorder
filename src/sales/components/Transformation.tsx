import { Check } from 'lucide-react';
import { media } from '../media';

const BEFORE = [
  'Order bersepah dalam buku, Excel & WhatsApp',
  'Lupa update tracking, customer marah',
  'Tak tahu untung sebenar hujung bulan',
  'Staff tak sync — order sama pos dua kali',
];
const AFTER = [
  'Semua order dalam satu dashboard kemas',
  'Tracking & status auto-update dari kurier',
  'Report untung rugi real-time, tepat',
  'Satu akaun, semua staff nampak benda sama',
];

export default function Transformation() {
  const img = media('transformation_before_after');
  return (
    <section className="bg-po-surface py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-po-blue">Sebelum vs Selepas</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-po-ink sm:text-4xl">
            Dari huru-hara ke terurus dalam satu petang
          </h2>
        </div>

        <div className="mt-12 overflow-hidden rounded-3xl border border-po-border shadow-xl">
          <img src={img.url} alt="Perbandingan meja sebelum dan selepas guna PeningOrder" className="h-auto w-full" loading="lazy" />
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-po-coral/20 bg-po-coral-soft p-6">
            <h3 className="text-sm font-bold uppercase tracking-wide text-po-coral">❌ Cara lama</h3>
            <ul className="mt-4 space-y-3">
              {BEFORE.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm text-po-ink-soft">
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-po-coral/20 text-xs font-bold text-po-coral">×</span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-po-blue/20 bg-po-blue-tint p-6">
            <h3 className="text-sm font-bold uppercase tracking-wide text-po-blue-dark">✅ Dengan PeningOrder</h3>
            <ul className="mt-4 space-y-3">
              {AFTER.map((a) => (
                <li key={a} className="flex items-start gap-2.5 text-sm font-medium text-po-ink">
                  <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-po-success" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
