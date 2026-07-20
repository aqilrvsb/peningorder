import { useState } from 'react';
import { Calculator, TrendingDown } from 'lucide-react';
import { media } from '../media';

// Interactive loss calculator. Visitor inputs their own numbers and sees the
// monthly cost of orders lost to messy manual tracking. Self-quantified pain.
export default function CostOfInaction() {
  const img = media('report_analytics');
  const [ordersPerDay, setOrdersPerDay] = useState(20);
  const [lostPct, setLostPct] = useState(8);
  const [avgProfit, setAvgProfit] = useState(25);

  const lostPerDay = Math.round((ordersPerDay * lostPct) / 100);
  const dailyLoss = lostPerDay * avgProfit;
  const monthlyLoss = dailyLoss * 30;
  const yearlyLoss = monthlyLoss * 12;

  return (
    <section className="bg-po-ink py-20 text-white sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-po-amber/30 bg-po-amber/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-po-amber">
            <Calculator className="h-3.5 w-3.5" />
            Kalkulator kerugian
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Berapa untung anda hilang sebab order tercicir?
          </h2>
          <p className="mt-3 text-white/70">Cuba masukkan angka sebenar bisnes anda. Ramai terkejut tengok jumlah setahun.</p>
        </div>

        <div className="mt-12 grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="relative">
            <div className="overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
              <img src={img.url} alt="Dashboard laporan untung" className="h-auto w-full" loading="lazy" />
            </div>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 rounded-2xl bg-po-coral px-6 py-3 text-center shadow-2xl">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/90">Rugi sebulan</div>
              <div className="text-3xl font-extrabold text-white">RM {monthlyLoss.toLocaleString('en-MY')}</div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur">
            <div className="space-y-6">
              <Slider id="opd" label="Order sehari" value={ordersPerDay} min={5} max={200} step={5} suffix="" onChange={setOrdersPerDay} marks={['5', '100', '200']} />
              <Slider id="lost" label="% order tercicir / silap" value={lostPct} min={1} max={30} step={1} suffix="%" onChange={setLostPct} marks={['1%', '15%', '30%']} />
              <Slider id="profit" label="Untung purata satu order (RM)" value={avgProfit} min={5} max={200} step={5} suffix="" prefix="RM " onChange={setAvgProfit} marks={['RM 5', 'RM 100', 'RM 200']} />

              <div className="space-y-3 border-t border-white/10 pt-6">
                <Row label="Rugi sehari" amount={dailyLoss} />
                <Row label="Rugi sebulan" amount={monthlyLoss} highlight />
                <Row label="Rugi setahun" amount={yearlyLoss} danger />
              </div>

              <a
                href="#pricing"
                className="group flex items-center justify-center gap-2 rounded-full bg-po-blue px-6 py-4 text-base font-extrabold text-white shadow-xl shadow-po-blue/40 transition-all hover:bg-po-blue-hover"
              >
                <TrendingDown className="h-5 w-5" />
                Berhenti rugi — Mula RM 39/bulan
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Slider({
  id, label, value, min, max, step, suffix = '', prefix = '', onChange, marks,
}: {
  id: string; label: string; value: number; min: number; max: number; step: number;
  suffix?: string; prefix?: string; onChange: (n: number) => void; marks: string[];
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-semibold text-white">{label}</label>
        <span className="text-2xl font-extrabold text-po-amber">{prefix}{value}{suffix}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full cursor-pointer accent-po-blue"
      />
      <div className="mt-1 flex justify-between text-[10px] text-white/40">
        {marks.map((m) => <span key={m}>{m}</span>)}
      </div>
    </div>
  );
}

function Row({ label, amount, highlight, danger }: { label: string; amount: number; highlight?: boolean; danger?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${danger ? 'bg-po-coral/20 ring-2 ring-po-coral/40' : highlight ? 'bg-po-amber/10 ring-1 ring-po-amber/30' : 'bg-white/5'}`}>
      <span className={`text-sm font-semibold ${danger ? 'text-po-coral' : 'text-white/80'}`}>{label}</span>
      <span className={`text-xl font-extrabold tabular-nums ${danger ? 'text-po-coral' : highlight ? 'text-po-amber' : 'text-white'}`}>
        RM {amount.toLocaleString('en-MY')}
      </span>
    </div>
  );
}
