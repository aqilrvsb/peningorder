import { ArrowRight, PackageCheck, BarChart3 } from 'lucide-react';
import HeroVideo from './HeroVideo';
import { media } from '../media';

// Positioning hero. The visitor is a Malaysian online seller drowning in
// orders across notebooks / Excel / WhatsApp. PeningOrder = a Mini ERP that
// tracks every order, courier and ringgit of profit in one place.
export default function Hero() {
  const hero = media('hero_video');
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white via-po-surface to-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(16,89,198,0.10),transparent_60%)]"
      />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-12 sm:px-6 sm:py-16 md:py-20 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-24">
        <div className="flex flex-col justify-center">
          <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-po-blue/25 bg-po-blue/10 px-3 py-1.5 text-xs font-bold text-po-blue-dark">
            <PackageCheck className="h-3.5 w-3.5" />
            Mini ERP untuk usahawan online Malaysia
          </div>

          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-po-ink sm:text-5xl lg:text-6xl">
            Order bisnes anda
            <br />
            simpan kat mana?
            <br />
            <span className="bg-gradient-to-r from-po-blue to-po-coral bg-clip-text text-transparent">
              Buku 555? Excel? WhatsApp?
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-po-ink-soft">
            Platform lain cuma <span className="font-semibold text-po-ink">key-in order</span> je.{' '}
            <span className="font-semibold text-po-ink">PeningOrder track semua</span> — order, kurier,
            tracking, COD, untung rugi — dalam satu dashboard. Lagi murah, lagi senang.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#pricing"
              className="group inline-flex items-center gap-2 rounded-full bg-po-blue px-7 py-3.5 text-base font-bold text-white shadow-xl shadow-po-blue/25 transition-all hover:bg-po-blue-hover hover:shadow-2xl"
            >
              Cuba 14 Hari Percuma
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-full border-2 border-po-ink/10 bg-white px-6 py-3.5 text-base font-semibold text-po-ink transition-colors hover:border-po-ink/30"
            >
              Tengok macam mana
            </a>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-4 border-t border-po-border pt-8">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-po-blue-dark">Semua order</dt>
              <dd className="mt-1 text-2xl font-extrabold text-po-ink">1 tempat</dd>
              <dd className="text-[10px] text-po-ink-muted">tak payah cari-cari</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-po-success">Untung rugi</dt>
              <dd className="mt-1 text-2xl font-extrabold text-po-ink">auto</dd>
              <dd className="text-[10px] text-po-ink-muted">report real-time</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-po-coral">Mula dari</dt>
              <dd className="mt-1 text-2xl font-extrabold text-po-ink">RM 39</dd>
              <dd className="text-[10px] text-po-ink-muted">sebulan</dd>
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-center">
          <div className="relative w-full overflow-hidden rounded-3xl border-2 border-po-ink/10 bg-po-ink shadow-2xl">
            <HeroVideo src={hero.url} />
            <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-po-coral px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg sm:left-4 sm:top-4">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              Kisah sebenar
            </div>
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3 rounded-xl border border-white/20 bg-black/50 px-3 py-2 text-white backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-po-blue">
                  <BarChart3 className="h-4 w-4 text-white" />
                </span>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Report untung</div>
                  <div className="text-sm font-bold">Update setiap order</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
