import { Link } from 'react-router-dom';
import { ArrowRight, PackageCheck } from 'lucide-react';

export default function FinalCTA() {
  return (
    <section className="relative overflow-hidden bg-po-ink py-20 text-white sm:py-24">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(16,89,198,0.35),transparent_55%)]" />

      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white/80">
          <PackageCheck className="h-4 w-4 text-po-blue" />
          14 hari percuma · tiada kad kredit
        </div>

        <h2 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
          Berhenti urus order cara lama.
          <br />
          <span className="bg-gradient-to-r from-po-blue via-po-coral to-po-blue bg-clip-text text-transparent">
            Mula hari ni, percuma.
          </span>
        </h2>

        <p className="mt-6 text-lg text-white/75">
          Daftar 2 minit. Track semua order, kurier & untung dari satu dashboard. Cancel bila-bila.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#pricing"
            className="group inline-flex items-center gap-2 rounded-full bg-po-blue px-8 py-4 text-base font-extrabold text-white shadow-xl shadow-po-blue/40 transition-all hover:bg-po-blue-hover hover:shadow-2xl"
          >
            Cuba Percuma Sekarang
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          </a>
          <Link to="/auth" className="rounded-full border border-white/20 px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-white/10">
            Dah ada akaun? Log Masuk
          </Link>
        </div>

        <p className="mt-6 text-xs text-white/50">
          ✓ Tiada setup fee · ✓ Cancel bila-bila · ✓ Bayaran selamat via CHIP
        </p>
      </div>
    </section>
  );
}
