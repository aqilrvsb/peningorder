import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Upload, Download, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { IconTile } from '@/components/common/SoftUI';
import { getMalaysiaDate, formatDMY } from '@/lib/utils';

// Custom (own courier) clients: Ninja Van has no remittance API, so Finance uploads the
// courier's paid list instead. Column A = tracking number, column B (optional) = remit date
// (empty = today). Matching orders (COD, delivered, not yet collected) get date_payment +
// cod_remit_manual — the same as pressing "Collected" on each row.

interface ReadyRow { id: string; tracking: string; name: string; total: number; date: string }
interface SkipRow { tracking: string; reason: string }

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, ogo: 8,
  sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dis: 12,
};

function ymd(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Column B → "YYYY-MM-DD". "" = empty (use today), null = can't be read. Day comes first (dd/mm/yyyy). */
export function parseRemitDate(v: unknown): string | null {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null; // not an Excel date number
    const p = XLSX.SSF.parse_date_code(v);
    return p ? ymd(p.y, p.m, p.d) : null;
  }
  if (v instanceof Date) return ymd(v.getFullYear(), v.getMonth() + 1, v.getDate());
  const s = String(v).trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); // 2026-10-23
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/); // 23/10/2026
  if (m) return ymd(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[-\s/]+([A-Za-z]{3,9})[-\s/,]+(\d{2,4})/); // 23 Oct 2026
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    return mo ? ymd(+m[3], mo, +m[1]) : null;
  }
  if (/^\d{5}$/.test(s)) return parseRemitDate(Number(s));
  return null;
}

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const CodRemitImport: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState('');
  const [ready, setReady] = useState<ReadyRow[]>([]);
  const [skipped, setSkipped] = useState<SkipRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setFileName(''); setReady([]); setSkipped([]); };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Tracking Number', 'Tarikh Remit (optional)'],
      ['NVMYXXXXXXXXXXXXXX', '23/10/2026'],
      ['NVMYYYYYYYYYYYYYYY', ''],
    ]);
    ws['!cols'] = [{ wch: 26 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Remit COD');
    XLSX.writeFile(wb, 'peningorder-remit-cod-template.xlsx');
  };

  const readFile = async (file: File) => {
    setReading(true);
    reset();
    setFileName(file.name);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });
      const today = getMalaysiaDate();
      const skip: SkipRow[] = [];
      // tracking (UPPERCASE) → { as typed, remit date }
      const wanted = new Map<string, { raw: string; date: string }>();

      for (const r of rows) {
        const raw = String(r?.[0] ?? '').trim();
        if (!raw || !/\d/.test(raw)) continue; // blank line or header row (no digits)
        const key = raw.replace(/\s+/g, '').toUpperCase();
        if (wanted.has(key)) continue; // same tracking twice in the file
        const date = parseRemitDate(r?.[1]);
        if (date === null) { skip.push({ tracking: raw, reason: `Tarikh tak sah: "${String(r?.[1])}"` }); continue; }
        if (date && date > today) { skip.push({ tracking: raw, reason: `Tarikh akan datang (${formatDMY(date)})` }); continue; }
        wanted.set(key, { raw, date: date || today });
      }

      if (wanted.size === 0 && skip.length === 0) {
        toast.error('Fail kosong — tiada no. tracking di lajur A.');
        return;
      }

      // Look the trackings up (RLS keeps it to this client's orders).
      const byTracking = new Map<string, any[]>();
      const lookups = [...new Set([...wanted].flatMap(([key, w]) => [key, w.raw]))];
      for (const part of chunk(lookups, 150)) {
        const { data, error } = await (supabase as any)
          .from('customer_purchases')
          .select('id, tracking_number, delivery_status, type_payment, date_payment, name_customer, total_sale')
          .in('tracking_number', part);
        if (error) throw error;
        for (const o of data || []) {
          const k = String(o.tracking_number || '').replace(/\s+/g, '').toUpperCase();
          if (!byTracking.has(k)) byTracking.set(k, []);
          if (!byTracking.get(k)!.some((x) => x.id === o.id)) byTracking.get(k)!.push(o);
        }
      }

      const ok: ReadyRow[] = [];
      for (const [key, w] of wanted) {
        const found = byTracking.get(key) || [];
        if (!found.length) { skip.push({ tracking: w.raw, reason: 'Tracking tak jumpa' }); continue; }
        const eligible = found.filter((o) => o.type_payment === 'COD' && o.delivery_status === 'Success' && !o.date_payment);
        if (eligible.length) {
          eligible.forEach((o) => ok.push({ id: o.id, tracking: w.raw, name: o.name_customer || '-', total: Number(o.total_sale) || 0, date: w.date }));
          continue;
        }
        const o = found[0];
        const reason = o.date_payment
          ? `Dah collected (${formatDMY(o.date_payment)})`
          : o.type_payment !== 'COD'
            ? 'Bukan order COD'
            : `Status ${o.delivery_status || '-'} — belum Success`;
        skip.push({ tracking: w.raw, reason });
      }

      setReady(ok);
      setSkipped(skip);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal baca fail');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const process = async () => {
    if (!ready.length) return;
    setSaving(true);
    let done = 0;
    try {
      // One update per remit date; skip anything collected in the meantime.
      const byDate = new Map<string, string[]>();
      ready.forEach((r) => byDate.set(r.date, [...(byDate.get(r.date) || []), r.id]));
      for (const [date, ids] of byDate) {
        for (const part of chunk(ids, 200)) {
          const { data, error } = await (supabase as any)
            .from('customer_purchases')
            .update({ date_payment: date, cod_remit_manual: true })
            .in('id', part)
            .is('date_payment', null)
            .select('id');
          if (error) throw error;
          done += data?.length || 0;
        }
      }
      toast.success(`${done} order COD ditanda Collected`);
      onDone?.();
      setOpen(false);
      reset();
    } catch (err: any) {
      toast.error(`${done ? `${done} order dah diproses, tapi ` : ''}${err?.message || 'gagal proses'}`);
      if (done) onDone?.();
    } finally {
      setSaving(false);
    }
  };

  const readyTotal = ready.reduce((s, r) => s + r.total, 0);

  return (
    <>
      <Button variant="outline" onClick={() => { reset(); setOpen(true); }}>
        <FileSpreadsheet className="w-4 h-4 mr-2" /> Import Remit (Excel)
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!saving) setOpen(v); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 sm:justify-start">
              <IconTile icon={FileSpreadsheet} tone="green" size="sm" />
              Import Remit COD
            </DialogTitle>
            <DialogDescription>
              Kurier anda tiada API remit — upload senarai tracking yang dah dibayar, sistem tanda order COD itu Collected.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-border/80 bg-muted/40 p-3 text-sm">
              <p className="section-label mb-2">Format Excel</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li><b className="text-foreground">Lajur A</b> — No. Tracking (wajib)</li>
                <li><b className="text-foreground">Lajur B</b> — Tarikh Remit (optional, cth 23/10/2026). Kosong = hari ini.</li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">Hanya order COD yang dah Success dan belum collected akan diproses.</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="secondary" onClick={downloadTemplate} className="sm:flex-1">
                <Download className="w-4 h-4 mr-2" /> Template
              </Button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" id="cod-remit-file"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
              <label
                htmlFor="cod-remit-file"
                className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent ${reading || saving ? 'pointer-events-none opacity-60' : ''}`}
              >
                {reading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span className="truncate">{reading ? 'Membaca…' : fileName || 'Pilih fail .xlsx / .csv'}</span>
              </label>
            </div>

            {(ready.length > 0 || skipped.length > 0) && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Sedia diproses</p>
                    <p className="mt-1 text-xl font-bold">{ready.length}</p>
                    <p className="text-xs text-muted-foreground">RM {readyTotal.toFixed(2)}</p>
                  </div>
                  <div className={`rounded-xl border p-3 ${skipped.length ? 'border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10' : 'border-border/80'}`}>
                    <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" /> Dilangkau</p>
                    <p className="mt-1 text-xl font-bold">{skipped.length}</p>
                    <p className="text-xs text-muted-foreground">tak diproses</p>
                  </div>
                </div>

                {ready.length > 0 && (
                  <div className="max-h-56 overflow-auto rounded-xl border border-border/80">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted text-left">
                        <tr><th className="px-3 py-2">Tracking</th><th className="px-3 py-2">Nama</th><th className="px-3 py-2 text-right">RM</th><th className="px-3 py-2">Tarikh Remit</th></tr>
                      </thead>
                      <tbody>
                        {ready.map((r) => (
                          <tr key={r.id} className="border-t border-border/60">
                            <td className="px-3 py-1.5 font-mono">{r.tracking}</td>
                            <td className="px-3 py-1.5">{r.name}</td>
                            <td className="px-3 py-1.5 text-right">{r.total.toFixed(2)}</td>
                            <td className="whitespace-nowrap px-3 py-1.5">{formatDMY(r.date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {skipped.length > 0 && (
                  <div className="max-h-40 overflow-auto rounded-xl border border-amber-200 dark:border-amber-500/30">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-amber-50 text-left dark:bg-amber-950">
                        <tr><th className="px-3 py-2">Tracking</th><th className="px-3 py-2">Sebab dilangkau</th></tr>
                      </thead>
                      <tbody>
                        {skipped.map((s, i) => (
                          <tr key={`${s.tracking}-${i}`} className="border-t border-amber-100 dark:border-amber-500/20">
                            <td className="px-3 py-1.5 font-mono">{s.tracking}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{s.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Batal</Button>
            <Button onClick={process} disabled={saving || reading || ready.length === 0}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Memproses…</> : `Proses ${ready.length} order`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CodRemitImport;
