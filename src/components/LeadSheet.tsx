import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Pencil, Trash2, Bot, PhoneCall, MessageCircle, Ban, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { IconTile, EmptyState, type Tone } from '@/components/common/SoftUI';
import { AUDIT_MODE } from '@/lib/audit';
import { formatDMY } from '@/lib/utils';
import {
  LeadFu, TickKey, FU_COLUMNS, pickFu, WA_COLS, CALL_COLS, CHAINS, TICK_LABEL, NOTE_OF, TS_OF,
  qualifies, fmtTs, normPhone,
} from '@/lib/leadFollowup';

export type OrderInfo = { alamat: string; tracking: string; delivery_status: string };

// The DataContext prospect fields the sheet reads.
type Prospect = {
  id: string; namaProspek: string; noTelefon: string; niche: string; tarikhPhoneNumber: string;
  marketerIdStaff: string; statusClosed: string; priceClosed: number; countOrder: number; fu: LeadFu;
};

/** Follow-up edits made on this page, layered over the DataContext rows. */
export function useLeadFu() {
  const [over, setOver] = useState<Record<string, Partial<LeadFu>>>({});
  const fuOf = (p: Prospect): LeadFu => ({ ...p.fu, ...(over[p.id] || {}) } as LeadFu);

  const save = async (id: string, patch: Partial<LeadFu>) => {
    setOver((o) => ({ ...o, [id]: { ...(o[id] || {}), ...patch } }));
    const { data, error } = await (supabase as any)
      .from('prospects').update(patch).eq('id', id).select(FU_COLUMNS.join(',')).single();
    if (error) {
      toast({ title: 'Gagal simpan', description: error.message, variant: 'destructive' });
      const { data: cur } = await (supabase as any).from('prospects').select(FU_COLUMNS.join(',')).eq('id', id).maybeSingle();
      if (cur) setOver((o) => ({ ...o, [id]: pickFu(cur) }));
      return;
    }
    setOver((o) => ({ ...o, [id]: pickFu(data) }));
  };
  return { fuOf, save };
}

type DlgConfig = {
  title: string;
  message?: string;
  input?: boolean;
  placeholder?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: (value: string) => void;
};

const STAGES = ['INTRO', 'F.F', 'PRESENT', 'OFFER'];

/** STATUS BOT / STATUS CALL "stuck di tahap" cards. */
export function LeadStuckCards({ items }: { items: { fu: LeadFu; closed: boolean }[] }) {
  const stuck = (at: TickKey, next: TickKey | null) =>
    items.filter(({ fu, closed }) => fu[at] && (next ? !fu[next] : !closed)).length;
  const bot = [stuck('wa_intro', 'wa_ff'), stuck('wa_ff', 'wa_present'), stuck('wa_present', 'wa_offer'), stuck('wa_offer', null)];
  const call = [stuck('call_intro', 'call_ff'), stuck('call_ff', 'call_present'), stuck('call_present', 'call_offer'), stuck('call_offer', null)];
  const card = (title: string, nums: number[], icon: React.ElementType, tone: Tone) => (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <IconTile icon={icon} tone={tone} size="sm" />
        <p className="min-w-0 text-sm font-semibold leading-tight">{title}</p>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {STAGES.map((s, i) => (
          <div key={s} className="rounded-lg bg-muted/50 px-1 py-2">
            <p className="text-xl font-bold leading-tight tracking-tight">{nums[i]}</p>
            <p className="section-label mt-0.5">{s}</p>
          </div>
        ))}
      </div>
    </Card>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {card('STATUS BOT — stuck di tahap', bot, Bot, 'amber')}
      {card('STATUS CALL — stuck di tahap', call, PhoneCall, 'orange')}
    </div>
  );
}

const tsTag = (iso?: string | null) =>
  iso ? <div className="text-[9px] leading-tight text-slate-700 dark:text-slate-300 whitespace-nowrap font-semibold">{fmtTs(iso)}</div> : null;

const waLink = (num: string) => {
  const d = String(num || '').replace(/\D/g, '');
  return d.length >= 9 ? (
    <a href={`https://wa.me/${d}`} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded p-0.5 leading-none text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/40" title={`Buka WhatsApp ${d}`} aria-label={`Buka WhatsApp ${d}`}><MessageCircle className="h-4 w-4" /></a>
  ) : null;
};

export function LeadSheet({
  rows, startIndex, fuOf, save, showStaff, nameByIdstaff, orderInfo, totalClose,
  selectedIds, onToggleSelect, onToggleAll, allSelected, onEdit, onDelete, onViewOrders,
}: {
  rows: Prospect[];
  startIndex: number;
  fuOf: (p: Prospect) => LeadFu;
  save: (id: string, patch: Partial<LeadFu>) => Promise<void>;
  showStaff: boolean;
  nameByIdstaff: Map<string, string>;
  orderInfo: Map<string, OrderInfo>;
  totalClose: number;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  onEdit: (p: Prospect) => void;
  onDelete: (id: string) => void;
  onViewOrders: (p: Prospect) => void;
}) {
  const [dlg, setDlg] = useState<DlgConfig | null>(null);
  const [dlgValue, setDlgValue] = useState('');
  const openDlg = (c: DlgConfig) => { setDlgValue(''); setDlg(c); };
  const info = (title: string, message: string) => openDlg({ title, message, confirmLabel: 'OK', onConfirm: () => setDlg(null) });

  const isClosed = (p: Prospect) => p.statusClosed === 'closed';

  const toggleTick = (p: Prospect, f: LeadFu, key: TickKey) => {
    const chain = CHAINS.find((c) => c.includes(key))!;
    const idx = chain.indexOf(key);
    if (!f[key]) {
      for (let i = 0; i < idx; i++) {
        if (!f[chain[i]]) {
          info('Ikut turutan dulu', `Tick ${TICK_LABEL[chain[i]]} dulu. Turutan: INTRO → F.F → PRESENT → OFFER.`);
          return;
        }
      }
    } else {
      for (let i = idx + 1; i < chain.length; i++) {
        if (f[chain[i]]) {
          info('Tak boleh buang lagi', `Buang tick ${TICK_LABEL[chain[i]]} dulu sebelum buang ${TICK_LABEL[key]}.`);
          return;
        }
      }
      if ((key === 'wa_offer' || key === 'call_offer') && isClosed(p)) {
        const otherOffer = key === 'wa_offer' ? f.call_offer : f.wa_offer;
        if (!otherOffer) {
          info('Tak boleh buang lagi', 'Prospek ni dah CLOSE. OFFER kena kekal.');
          return;
        }
      }
    }
    const noteField = NOTE_OF[key];
    if (noteField) {
      // F.F / PRESENT / OFFER: a reason is required before ticking.
      const kind = key.includes('_ff') ? 'ff' : key.includes('present') ? 'present' : 'offer';
      const LABEL = { ff: 'F.F', present: 'PRESENT', offer: 'OFFER' }[kind];
      if (!f[key]) {
        openDlg({
          title: { ff: 'Fact Finding', present: 'Present — Sebab Reject', offer: 'Offer — Sebab Reject' }[kind],
          message: {
            ff: `Apa masalah prospek ${p.namaProspek || 'ni'}? Wajib isi sebelum tick.`,
            present: `Kenapa ${p.namaProspek || 'customer ni'} reject / belum close selepas present? Wajib isi.`,
            offer: `Apa respon / sebab ${p.namaProspek || 'customer ni'} belum close selepas offer? Wajib isi.`,
          }[kind],
          input: true,
          placeholder: {
            ff: 'Contoh: takut nak beli online, nak bincang dengan suami dulu...',
            present: 'Contoh: harga mahal, nak fikir dulu, banding produk lain...',
            offer: 'Contoh: minta diskaun lagi, tunggu gaji, nak COD area lain...',
          }[kind],
          confirmLabel: 'Simpan & Tick',
          onConfirm: (m) => { setDlg(null); save(p.id, { [key]: true, [noteField]: m } as Partial<LeadFu>); },
        });
      } else {
        openDlg({
          title: `Buang tick ${LABEL}?`,
          message: `Tick ${LABEL} dan sebab yang disimpan akan dibuang.`,
          danger: true,
          confirmLabel: 'Buang',
          onConfirm: () => { setDlg(null); save(p.id, { [key]: false, [noteField]: null } as Partial<LeadFu>); },
        });
      }
      return;
    }
    save(p.id, { [key]: !f[key] } as Partial<LeadFu>);
  };

  const th = 'font-bold px-2 py-2 border border-slate-400 text-xs whitespace-nowrap text-center';
  const td = 'border border-slate-300 dark:border-slate-600 px-1 py-0.5 text-center';
  const colCount = 20 + (showStaff ? 1 : 0);

  const tickCell = (p: Prospect, f: LeadFu, key: TickKey) => {
    const noteField = NOTE_OF[key];
    const note = noteField ? String(f[noteField] || '') : '';
    return (
      <td key={key} className={`${td} cursor-pointer select-none`} onClick={() => toggleTick(p, f, key)} title={note || 'Klik untuk tanda /'}>
        <span className={`text-base font-bold ${f[key] ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400'}`}>{f[key] ? '/' : '·'}</span>
        {f[key] && note && <div className="text-[10px] leading-tight text-slate-700 dark:text-slate-300 max-w-[110px] truncate mx-auto">{note}</div>}
        {f[key] && tsTag(f[TS_OF[key]] as string | null)}
      </td>
    );
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[1200px]">
          <thead>
            <tr>
              <th rowSpan={2} className={`${th} bg-blue-500 text-white`}>
                <Checkbox checked={allSelected} onCheckedChange={onToggleAll} className="border-white" />
              </th>
              <th rowSpan={2} className={`${th} bg-blue-500 text-white`}>NO</th>
              <th rowSpan={2} className={`${th} bg-blue-500 text-white`}>TARIKH</th>
              {showStaff && <th rowSpan={2} className={`${th} bg-blue-500 text-white`}>STAFF</th>}
              <th rowSpan={2} className={`${th} bg-blue-500 text-white`}>NAMA</th>
              <th rowSpan={2} className={`${th} bg-blue-500 text-white`}>NO WHATSAPP</th>
              <th rowSpan={2} className={`${th} bg-blue-500 text-white`}>PRODUK</th>
              <th colSpan={4} className={`${th} bg-yellow-300 text-slate-900`}>STATUS BOT</th>
              <th colSpan={5} className={`${th} bg-orange-400 text-slate-900`}>STATUS CALL</th>
              <th rowSpan={2} className={`${th} bg-purple-500 text-white`}>BOOKING</th>
              <th rowSpan={2} className={`${th} bg-green-500 text-white`}>CLOSE (RM)</th>
              <th rowSpan={2} className={`${th} bg-green-500 text-white min-w-[220px]`}>ALAMAT</th>
              <th rowSpan={2} className={`${th} bg-green-500 text-white`}>NO TRACKING</th>
              <th rowSpan={2} className={`${th} bg-slate-200 text-slate-700`}></th>
            </tr>
            <tr>
              {WA_COLS.map((c) => <th key={c.key} className={`${th} bg-yellow-300 text-slate-900`}>{c.label}</th>)}
              <th className={`${th} bg-orange-400 text-slate-900`}>TIDAK<br />ANGKAT (3x)</th>
              {CALL_COLS.map((c) => <th key={c.key} className={`${th} bg-orange-400 text-slate-900`}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="border border-slate-300 dark:border-slate-600 p-0 text-muted-foreground">
                  {/* Left-aligned + sticky so it stays in view on phones (the sheet is 1200px wide). */}
                  <EmptyState
                    icon={Users}
                    className="sticky left-0 max-w-[min(28rem,calc(100vw_-_3rem))] items-start py-8 text-left"
                    title={<>Tiada prospek dalam julat tarikh ini. Klik <b>Add Prospect</b> atau <b>Import Excel</b>, atau ubah julat tarikh di atas.</>}
                  />
                </td>
              </tr>
            )}
            {rows.map((p, i) => {
              const f = fuOf(p);
              const closed = isClosed(p);
              const ord = orderInfo.get(normPhone(p.noTelefon));
              const rowCls = closed
                ? 'bg-teal-300 hover:bg-teal-400/70 dark:bg-teal-900/60'
                : qualifies(f)
                  ? 'bg-emerald-300 hover:bg-emerald-400/70 dark:bg-emerald-900/60'
                  : 'bg-red-300 hover:bg-red-400/70 dark:bg-red-900/50';
              const cur = f.call_tidak_angkat || 0;
              return (
                <tr key={p.id} className={`${rowCls} text-slate-900 dark:text-foreground`}>
                  <td className={td}>
                    <Checkbox checked={selectedIds.includes(p.id)} onCheckedChange={() => onToggleSelect(p.id)} />
                  </td>
                  <td className={`${td} font-medium`}>{startIndex + i + 1}</td>
                  <td className={`${td} whitespace-nowrap px-2`}>{formatDMY(p.tarikhPhoneNumber)}</td>
                  {showStaff && (
                    <td className={`${td} whitespace-nowrap px-2 text-left`}>
                      <div className="text-xs font-semibold">{nameByIdstaff.get(p.marketerIdStaff || '') || '-'}</div>
                      <div className="text-[10px] font-mono opacity-70">{p.marketerIdStaff || ''}</div>
                    </td>
                  )}
                  <td className={`${td} min-w-[160px] text-left px-2 text-xs font-medium`}>{p.namaProspek}</td>
                  <td className={`${td} min-w-[140px]`}>
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap font-mono text-xs">{p.noTelefon}{waLink(p.noTelefon)}</div>
                  </td>
                  <td className={`${td} px-2 text-xs`}>{p.niche || '—'}</td>
                  {WA_COLS.map((c) => tickCell(p, f, c.key))}
                  <td className={`${td} whitespace-nowrap`}>
                    <div>
                      {[0, 1, 2].map((k) => (
                        <button
                          key={k}
                          onClick={() => {
                            // Only the next tick or the last one can change; the 30-minute gap is enforced by the DB.
                            let v: number | null = null;
                            if (k === cur) v = cur + 1;
                            else if (k === cur - 1) v = cur - 1;
                            if (v !== null) save(p.id, { call_tidak_angkat: v });
                          }}
                          className={`w-5 h-6 mx-[1px] text-xs font-bold rounded border align-middle ${
                            k < cur ? 'bg-red-100 text-red-600 border-red-300' : 'bg-white text-slate-300 border-slate-200'
                          }`}
                          title={`Cubaan call ke-${k + 1} tak angkat`}
                        >
                          {k < cur ? '/' : '·'}
                        </button>
                      ))}
                    </div>
                    {tsTag(f.ts_tidak_angkat)}
                    <button
                      onClick={() => save(p.id, { blocked: !f.blocked })}
                      className={`mt-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        f.blocked ? 'bg-red-600 text-white border-red-700' : 'bg-white text-slate-400 border-slate-200'
                      }`}
                      title="Nombor blocked — tak perlu 3x tidak angkat, terus lepas KPI"
                    >
                      <Ban className="h-3 w-3" /> BLOCKED
                    </button>
                    {tsTag(f.ts_blocked)}
                  </td>
                  {CALL_COLS.map((c) => tickCell(p, f, c.key))}
                  <td className={`${td} w-40 whitespace-nowrap ${f.booking_date ? 'bg-purple-50 dark:bg-purple-900/40' : ''}`}>
                    <button
                      onClick={() => {
                        if (f.booking_date) {
                          openDlg({
                            title: 'Buang Booking?',
                            message: `Booking pada ${formatDMY(f.booking_date)} akan dibuang.`,
                            danger: true,
                            confirmLabel: 'Buang',
                            onConfirm: () => { setDlg(null); save(p.id, { booking_date: null }); },
                          });
                        } else {
                          info('Booking', 'Pilih tarikh booking di sebelah dulu — tick akan jadi automatik.');
                        }
                      }}
                      className={`w-6 h-6 mr-1 text-base font-bold rounded border align-middle ${
                        f.booking_date ? 'bg-purple-600 text-white border-purple-700' : 'bg-white text-slate-300 border-slate-200'
                      }`}
                      title="Check booking — wajib ada tarikh"
                    >
                      {f.booking_date ? '/' : '·'}
                    </button>
                    <input
                      type="date"
                      className="bg-transparent px-1 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-emerald-600 rounded"
                      value={f.booking_date || ''}
                      onChange={(e) => save(p.id, { booking_date: e.target.value || null })}
                      title="Booking — pilih tarikh, check jadi automatik"
                    />
                    {tsTag(f.ts_booking)}
                  </td>
                  <td
                    className={`${td} w-24 cursor-pointer select-none ${closed ? 'bg-green-50 dark:bg-green-900/40' : ''}`}
                    onClick={() => closed
                      ? onViewOrders(p)
                      : info('CLOSE', 'CLOSE jadi automatik bila order untuk nombor customer ni dimasukkan (Order Form / integrasi). Jumlah RM ikut order.')}
                    title={closed ? 'Lihat order' : 'Auto bila ada order'}
                  >
                    {closed ? (
                      <>
                        <span className="text-base font-bold text-emerald-700 dark:text-emerald-300">/</span>
                        <div className="whitespace-nowrap text-xs font-bold text-emerald-800 dark:text-emerald-200">RM{(p.priceClosed || 0).toFixed(2)}</div>
                        {p.countOrder > 1 && <div className="text-[10px] opacity-70">{p.countOrder} order</div>}
                      </>
                    ) : (
                      <span className="text-base font-bold text-slate-400">·</span>
                    )}
                  </td>
                  <td className={`${td} min-w-[260px] text-left px-2 text-xs leading-snug`}>
                    {ord?.alamat || ''}
                  </td>
                  <td className={`${td} min-w-[120px] px-2 text-xs`}>
                    {ord?.tracking ? <div className="whitespace-nowrap font-mono">{ord.tracking}</div> : null}
                    {ord?.delivery_status ? <div className="text-[10px] opacity-70">{ord.delivery_status}</div> : null}
                  </td>
                  <td className={td}>
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => onEdit(p)} className="p-1 rounded hover:bg-blue-100 text-blue-700" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {!AUDIT_MODE && (
                        <button onClick={() => onDelete(p.id)} className="p-1 rounded hover:bg-red-100 text-red-600" title="Padam">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length > 0 && (
              <tr className="bg-emerald-50 dark:bg-emerald-950/40 font-bold">
                <td colSpan={colCount - 4} className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-right">JUMLAH CLOSE (RM)</td>
                <td className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-center">
                  {totalClose.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td colSpan={3} className="border border-slate-300 dark:border-slate-600" />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground px-3 py-2">
        Klik kotak status untuk tanda <b>/</b> — auto-save, masa direkod automatik.{' '}
        <span className="text-red-600 font-medium">Baris merah</span> = belum complete KPI (BOT sampai PRESENT / TIDAK ANGKAT 3x / CALL sampai F.F / nombor BLOCKED);{' '}
        <span className="text-emerald-700 font-medium">baris hijau</span> = KPI complete;{' '}
        <span className="text-teal-700 font-medium">baris teal</span> = CLOSE (ada order). CLOSE, alamat & tracking ikut order customer.
      </p>

      <Dialog open={!!dlg} onOpenChange={(o) => { if (!o) setDlg(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dlg?.title}</DialogTitle>
            {dlg?.message && <DialogDescription>{dlg.message}</DialogDescription>}
          </DialogHeader>
          {dlg?.input && (
            <Textarea
              autoFocus
              rows={3}
              placeholder={dlg.placeholder}
              value={dlgValue}
              onChange={(e) => setDlgValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && dlgValue.trim()) { e.preventDefault(); dlg.onConfirm(dlgValue.trim()); }
              }}
            />
          )}
          <DialogFooter>
            {(dlg?.input || dlg?.danger) && <Button variant="outline" onClick={() => setDlg(null)}>Batal</Button>}
            <Button
              variant={dlg?.danger ? 'destructive' : 'default'}
              disabled={!!dlg?.input && !dlgValue.trim()}
              onClick={() => dlg?.onConfirm(dlgValue.trim())}
            >
              {dlg?.confirmLabel ?? 'OK'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
