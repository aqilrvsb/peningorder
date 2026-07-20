import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

// Top-of-page promo strip with a live countdown to end-of-week (Sunday 23:59).
// Resets weekly so it stays honest — a new launch promo starts every Monday.
function msUntilEndOfWeek() {
  const now = new Date();
  const day = now.getDay();
  const daysUntilSunday = (7 - day) % 7;
  const target = new Date(now);
  target.setDate(now.getDate() + daysUntilSunday);
  target.setHours(23, 59, 59, 999);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 7);
  return target.getTime() - now.getTime();
}

function format(ms: number) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return { d, h: pad(h), m: pad(m), s: pad(s) };
}

export default function UrgencyBar() {
  const [ms, setMs] = useState(() => msUntilEndOfWeek());
  useEffect(() => {
    const i = setInterval(() => setMs(msUntilEndOfWeek()), 1000);
    return () => clearInterval(i);
  }, []);
  const t = format(ms);
  return (
    <div className="w-full bg-gradient-to-r from-po-blue via-po-blue-dark to-po-blue text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-center text-xs font-semibold sm:text-sm">
        <Sparkles className="h-4 w-4 flex-shrink-0 animate-pulse" />
        <span className="hidden sm:inline">🎉 PROMO LAUNCH: 14 hari <b className="font-extrabold">PERCUMA</b>, tanpa kad kredit —</span>
        <span className="sm:hidden">🎉 14 hari PERCUMA —</span>
        <span className="font-mono font-extrabold tabular-nums">
          {t.d > 0 && `${t.d}h `}{t.h}:{t.m}:{t.s}
        </span>
        <span className="hidden md:inline">lagi sebelum harga naik</span>
      </div>
    </div>
  );
}
