import { UserPlus, Settings2, Rocket } from 'lucide-react';

const STEPS = [
  { icon: UserPlus, title: '1. Daftar 2 minit', body: 'Isi nama, bisnes & email, pilih plan dan bayar via CHIP. Akaun anda terus aktif.' },
  { icon: Settings2, title: '2. Setup kurier & produk', body: 'Sambung akaun kurier (Parcel Daily), masukkan produk & harga. Import order sedia ada kalau ada.' },
  { icon: Rocket, title: '3. Mula urus order', body: 'Key-in atau terima order, book tracking, print waybill, dan tengok untung naik — semua dari satu skrin.' },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-po-surface py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-po-blue">Senang je</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-po-ink sm:text-4xl">Dari daftar ke urus order dalam 3 langkah</h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.title} className="relative rounded-2xl border border-po-border bg-white p-6 shadow-sm">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-po-blue-tint text-po-blue">
                <s.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-po-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-po-ink-soft">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
