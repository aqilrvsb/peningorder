import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';

// Sticky top nav for the public sales pages. Login links to /auth (the
// existing dashboard auth screen); the primary CTA jumps to pricing.
export default function Nav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-po-border bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="group flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-po-blue shadow-sm transition-transform group-hover:scale-105">
            <Package className="h-5 w-5 text-white" strokeWidth={2.5} />
          </span>
          <span className="text-lg font-bold tracking-tight text-po-ink">
            Pening<span className="text-po-blue">Order</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <a href="#features" className="hidden text-sm font-medium text-po-ink-soft hover:text-po-ink md:inline-block">Kelebihan</a>
          <a href="#pricing" className="hidden text-sm font-medium text-po-ink-soft hover:text-po-ink sm:inline-block">Harga</a>
          <Link
            to="/auth"
            className="rounded-full bg-po-ink px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-po-blue-dark"
          >
            Log Masuk
          </Link>
        </div>
      </div>
    </header>
  );
}
