const FAQS = [
  { q: 'Ada kontrak jangka panjang?', a: 'Tiada. PeningOrder ialah langganan bulanan — bayar bulan ke bulan, cancel bila-bila terus dari dashboard tanpa penalti.' },
  { q: 'Data order lama saya macam mana?', a: 'Boleh import. Kalau anda guna WooCommerce atau Shopee, kami boleh tarik order automatik. Order dalam Excel pun boleh dimasukkan. Anda tak akan hilang sejarah jualan.' },
  { q: 'Kurier apa yang disokong?', a: 'Poslaju, NinjaVan, J&T dan DHL — semua melalui integrasi Parcel Daily. Anda book tracking & print waybill terus dari dashboard, tak payah login website kurier satu-satu.' },
  { q: 'Boleh guna dengan staff ramai?', a: 'Boleh. Plan Growth ke atas menyokong multi-staff dengan peranan berasingan (marketer, logistik, akaun). Semua nampak data sama, real-time — tiada lagi order pos dua kali.' },
  { q: 'Macam mana bayaran diproses?', a: 'Melalui CHIP — gateway pembayaran Malaysia. Anda boleh bayar guna FPX (online banking), e-wallet (Touch ‘n Go, Boost, GrabPay) atau kad kredit/debit. Selamat & instant.' },
  { q: 'Kalau saya nak berhenti macam mana?', a: 'Cancel bila-bila dari dashboard, tiada kontrak dan tiada penalti. Akaun anda kekal aktif sampai tarikh tamat plan yang dah dibayar.' },
  { q: 'Beza PeningOrder dengan platform lain apa?', a: 'Platform lain kebanyakannya cuma tempat key-in order. PeningOrder ialah Mini ERP — dari order masuk, booking kurier, tracking, COD, sampai report untung rugi, semua dalam satu tempat. Lagi lengkap, lagi murah.' },
  { q: 'Macam mana nak dapat bantuan?', a: 'Ada tiket support dalam dashboard, dan tutorial lengkap untuk setiap fungsi. Team kami bantu anda setup dari awal.' },
];

export default function FAQ() {
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-po-blue">FAQ</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-po-ink sm:text-4xl">Soalan biasa</h2>
        </div>
        <div className="mt-12 space-y-3">
          {FAQS.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-po-border bg-po-surface p-5 transition-colors open:bg-white open:shadow-sm">
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-left text-base font-semibold text-po-ink [&::-webkit-details-marker]:hidden">
                <span>{f.q}</span>
                <span aria-hidden className="ml-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-po-border text-po-ink-soft transition-transform group-open:rotate-45 group-open:bg-po-blue group-open:text-white">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-po-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
