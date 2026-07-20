import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-po-border bg-white py-12">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-4 lg:gap-12 lg:px-8">
        <div>
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-po-blue">
              <Package className="h-5 w-5 text-white" strokeWidth={2.5} />
            </span>
            <span className="text-lg font-bold tracking-tight text-po-ink">Pening<span className="text-po-blue">Order</span></span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-po-ink-muted">Mini ERP pengurusan order untuk usahawan online Malaysia. Track order, kurier & untung dalam satu tempat.</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-po-ink">Produk</h3>
          <ul className="mt-3 space-y-2 text-sm text-po-ink-soft">
            <li><a href="#features" className="hover:text-po-ink">Kelebihan</a></li>
            <li><a href="#pricing" className="hover:text-po-ink">Harga</a></li>
            <li><a href="#how-it-works" className="hover:text-po-ink">Macam mana ia berfungsi</a></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-po-ink">Akaun</h3>
          <ul className="mt-3 space-y-2 text-sm text-po-ink-soft">
            <li><Link to="/auth" className="hover:text-po-ink">Log Masuk</Link></li>
            <li><Link to="/checkout?plan=starter" className="hover:text-po-ink">Daftar</Link></li>
            <li><Link to="/dashboard" className="hover:text-po-ink">Dashboard</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-po-ink">Support</h3>
          <ul className="mt-3 space-y-2 text-sm text-po-ink-soft">
            <li>Tiket support (dalam dashboard)</li>
            <li><a href="mailto:admin@peningorder.com" className="hover:text-po-ink">admin@peningorder.com</a></li>
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-12 max-w-7xl border-t border-po-border px-4 pt-6 text-center text-xs text-po-ink-muted sm:px-6 lg:px-8">
        © 2026 PeningOrder. Hak cipta terpelihara. · Bayaran diproses oleh CHIP.
      </div>
    </footer>
  );
}
