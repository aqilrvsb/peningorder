import { NotebookPen, MessageSquareWarning, FileSpreadsheet, PackageX } from 'lucide-react';
import { media } from '../media';

// Agitate the pain: how sellers manage orders today, and why it leaks money.
const PAINS = [
  { icon: NotebookPen, title: 'Tulis dalam buku', body: 'Order tulis tangan dalam buku 555. Hilang satu page, hilang sales. Nak cari order lama? Selak satu-satu.' },
  { icon: FileSpreadsheet, title: 'Excel berterabur', body: 'Sheet penuh formula rosak. Salah taip satu cell, report untung jadi karut. Tak sync antara staff.' },
  { icon: MessageSquareWarning, title: 'Scroll WhatsApp', body: 'Order bercampur dengan chat customer. Terlepas reply = terlepas parcel. Tak tahu mana dah pos, mana belum.' },
  { icon: PackageX, title: 'Tracking mangetar', body: 'Kena login banyak website kurier. Copy-paste tracking satu-satu. Customer tanya "parcel saya mana?" — anda pun tak tahu.' },
];

export default function Problem() {
  const img = media('pain_messy_desk');
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-po-coral/30 bg-po-coral-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-po-coral">
            Bunyi macam anda?
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-po-ink sm:text-4xl">
            Urus order cara lama = duit bocor tiap hari
          </h2>
          <p className="mt-4 text-po-ink-soft">
            Setiap order yang tercicir, setiap tracking yang lupa update, setiap report yang tak tepat — semua tu kos yang anda tak nampak.
          </p>
        </div>

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="relative order-2 lg:order-1">
            <div className="overflow-hidden rounded-3xl border border-po-border shadow-xl">
              <img src={img.url} alt="Meja usahawan bersepah dengan order dan parcel" className="h-auto w-full" loading="lazy" />
            </div>
          </div>
          <div className="order-1 grid gap-4 sm:grid-cols-2 lg:order-2">
            {PAINS.map((p) => (
              <div key={p.title} className="rounded-2xl border border-po-border bg-po-surface p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-po-coral-soft text-po-coral">
                  <p.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-bold text-po-ink">{p.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-po-ink-soft">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
