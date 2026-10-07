// Leads follow-up sheet (same flow as the daily-report NP sheet).
// Columns live on `prospects`; ts_* are stamped by the DB trigger
// prospect_followup_stamp, never by the client.

export type TickKey =
  | 'wa_intro' | 'wa_ff' | 'wa_present' | 'wa_offer'
  | 'call_intro' | 'call_ff' | 'call_present' | 'call_offer';

export type NoteKey =
  | 'wa_ff_note' | 'wa_present_note' | 'wa_offer_note'
  | 'call_ff_note' | 'call_present_note' | 'call_offer_note';

export type LeadFu = Record<TickKey, boolean> & Record<NoteKey, string | null> & {
  call_tidak_angkat: number;
  blocked: boolean;
  booking_date: string | null;
  ts_wa_intro: string | null; ts_wa_ff: string | null; ts_wa_present: string | null; ts_wa_offer: string | null;
  ts_call_intro: string | null; ts_call_ff: string | null; ts_call_present: string | null; ts_call_offer: string | null;
  ts_tidak_angkat: string | null; ts_blocked: string | null; ts_booking: string | null;
};

export const FU_COLUMNS = [
  'wa_intro', 'wa_ff', 'wa_present', 'wa_offer',
  'call_intro', 'call_ff', 'call_present', 'call_offer',
  'call_tidak_angkat', 'blocked',
  'wa_ff_note', 'wa_present_note', 'wa_offer_note', 'call_ff_note', 'call_present_note', 'call_offer_note',
  'booking_date',
  'ts_wa_intro', 'ts_wa_ff', 'ts_wa_present', 'ts_wa_offer',
  'ts_call_intro', 'ts_call_ff', 'ts_call_present', 'ts_call_offer',
  'ts_tidak_angkat', 'ts_blocked', 'ts_booking',
] as const;

export const pickFu = (d: any): LeadFu => {
  const o: any = {};
  for (const k of FU_COLUMNS) o[k] = d?.[k] ?? null;
  for (const k of ['wa_intro', 'wa_ff', 'wa_present', 'wa_offer', 'call_intro', 'call_ff', 'call_present', 'call_offer', 'blocked']) o[k] = !!o[k];
  o.call_tidak_angkat = Number(o.call_tidak_angkat) || 0;
  return o as LeadFu;
};

export const WA_COLS: { key: TickKey; label: string }[] = [
  { key: 'wa_intro', label: 'INTRO (/)' },
  { key: 'wa_ff', label: 'F.F (/)' },
  { key: 'wa_present', label: 'PRESENT (/)' },
  { key: 'wa_offer', label: 'OFFER (/)' },
];
export const CALL_COLS: { key: TickKey; label: string }[] = [
  { key: 'call_intro', label: 'INTRO (/)' },
  { key: 'call_ff', label: 'F.F (/)' },
  { key: 'call_present', label: 'PRESENT (/)' },
  { key: 'call_offer', label: 'OFFER (/)' },
];

// Fixed order inside each section; TIDAK ANGKAT stands alone.
export const CHAINS: TickKey[][] = [
  ['wa_intro', 'wa_ff', 'wa_present', 'wa_offer'],
  ['call_intro', 'call_ff', 'call_present', 'call_offer'],
];
export const TICK_LABEL: Record<TickKey, string> = {
  wa_intro: 'INTRO', wa_ff: 'F.F', wa_present: 'PRESENT', wa_offer: 'OFFER',
  call_intro: 'INTRO', call_ff: 'F.F', call_present: 'PRESENT', call_offer: 'OFFER',
};
// F.F / PRESENT / OFFER need a reason before they can be ticked.
export const NOTE_OF: Partial<Record<TickKey, NoteKey>> = {
  wa_ff: 'wa_ff_note', wa_present: 'wa_present_note', wa_offer: 'wa_offer_note',
  call_ff: 'call_ff_note', call_present: 'call_present_note', call_offer: 'call_offer_note',
};
export const TS_OF: Record<TickKey, keyof LeadFu> = {
  wa_intro: 'ts_wa_intro', wa_ff: 'ts_wa_ff', wa_present: 'ts_wa_present', wa_offer: 'ts_wa_offer',
  call_intro: 'ts_call_intro', call_ff: 'ts_call_ff', call_present: 'ts_call_present', call_offer: 'ts_call_offer',
};

// KPI complete: BOT reached PRESENT, 3x no answer, CALL reached F.F, or number blocked.
export const qualifies = (f: LeadFu) =>
  f.wa_present || f.call_tidak_angkat >= 3 || f.call_ff || f.blocked;

// "DD/MM HH:MM" in Malaysia time.
export const fmtTs = (iso?: string | null) => {
  if (!iso) return '';
  const t = new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString();
  return `${t.slice(8, 10)}/${t.slice(5, 7)} ${t.slice(11, 16)}`;
};

// Same normalisation as public.norm_phone(): digits, drop 60 / leading 0.
export const normPhone = (p: string) => (p || '').replace(/\D/g, '').replace(/^60/, '').replace(/^0/, '');
