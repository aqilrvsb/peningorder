import { Star, Quote } from 'lucide-react';
import { media } from '../media';

const TESTIMONIALS = [
  { key: 'avatar_2' as const, name: 'Nurul Aina', biz: 'Skincare online, Shah Alam', quote: 'Dulu order dalam WhatsApp bercampur chat. Sekarang semua kemas, tracking auto-update. Customer tak tanya "parcel saya mana" dah.' },
  { key: 'avatar_1' as const, name: 'Firdaus Rahman', biz: 'Dropship gadget, JB', quote: 'Report untung real-time tu game changer. Dulu guna Excel, hujung bulan baru tahu untung. Sekarang tengok terus tiap hari.' },
  { key: 'avatar_3' as const, name: 'Michelle Tan', biz: 'Baju butik, Penang', quote: 'Staff saya 3 orang, semua guna satu akaun. Tak ada dah masalah order sama pos dua kali. Jimat masa gila.' },
];

export default function SocialProof() {
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="flex items-center justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-po-amber text-po-amber" />
            ))}
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-po-ink sm:text-4xl">
            Usahawan Malaysia dah tukar cara urus order
          </h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => {
            const avatar = media(t.key);
            return (
              <figure key={t.name} className="flex flex-col rounded-2xl border border-po-border bg-po-surface p-6">
                <Quote className="h-7 w-7 text-po-blue/30" />
                <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-po-ink-soft">"{t.quote}"</blockquote>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-po-border pt-4">
                  <img src={avatar.url} alt={t.name} className="h-11 w-11 rounded-full object-cover" loading="lazy" />
                  <div>
                    <div className="text-sm font-bold text-po-ink">{t.name}</div>
                    <div className="text-xs text-po-ink-muted">{t.biz}</div>
                  </div>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}
