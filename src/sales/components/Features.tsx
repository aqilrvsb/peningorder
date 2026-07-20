import { ClipboardList, Truck, BarChart3, Wallet, Users, Boxes } from 'lucide-react';
import { media } from '../media';

// Each feature framed as a problem solved. Grouped around the Mini-ERP pitch:
// orders in, couriers out, money tracked.
const FEATURES = [
  { icon: ClipboardList, title: 'Semua order satu tempat', body: 'Key-in manual, import dari WooCommerce/Shopee, atau terus dari webhook. Cari, filter, edit — sekelip mata.' },
  { icon: Truck, title: 'Booking kurier terus', body: 'Buat tracking Poslaju, NinjaVan, J&T, DHL terus dari dashboard. Print waybill pukal. Tak payah login banyak website.' },
  { icon: BarChart3, title: 'Report untung real-time', body: 'Setiap order kira kos, postage, COD & untung automatik. Tengok profit harian, mingguan, bulanan tanpa Excel.' },
  { icon: Wallet, title: 'Track COD & collection', body: 'Tahu order mana dah collect, mana belum. Remaining = Sales − Collection − Return, dikira automatik.' },
  { icon: Boxes, title: 'Stok & bundle produk', body: 'Urus inventori produk & bundle. Stok tolak automatik bila order masuk. Tak jual barang yang dah habis.' },
  { icon: Users, title: 'Multi-staff, satu bisnes', body: 'Bahagi peranan marketer, logistik & akaun. Semua nampak data sama, real-time. Tiada lagi order pos dua kali.' },
];

export default function Features() {
  const dash = media('dashboard_orders');
  const parcels = media('parcels_waybill');
  return (
    <section id="features" className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-po-blue">Satu platform, semua benda</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-po-ink sm:text-4xl">
            Bukan sekadar key-in order — ini Mini ERP
          </h2>
          <p className="mt-4 text-po-ink-soft">
            Platform lain berhenti di "simpan order". PeningOrder bawa anda dari order masuk sampai duit masuk poket.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-po-border bg-po-surface p-6 transition-shadow hover:shadow-md">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-po-blue text-white">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-po-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-po-ink-soft">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-5">
          <div className="overflow-hidden rounded-3xl border border-po-border shadow-lg md:col-span-3">
            <img src={dash.url} alt="Dashboard pengurusan order PeningOrder" className="h-full w-full object-cover" loading="lazy" />
          </div>
          <div className="overflow-hidden rounded-3xl border border-po-border shadow-lg md:col-span-2">
            <img src={parcels.url} alt="Parcel dengan waybill siap print" className="h-full w-full object-cover" loading="lazy" />
          </div>
        </div>
      </div>
    </section>
  );
}
