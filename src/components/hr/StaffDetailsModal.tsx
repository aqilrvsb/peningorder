import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, X } from 'lucide-react';

// HR → Database Staff forms, same fields and options as DFR. One modal, four sections.
export type DetailSection = 'diri' | 'bank' | 'waris' | 'akademik';

export type Diri = {
  nama: string; jantina: string; umur: string; ic: string; warganegara: string; bangsa: string; agama: string;
  status_perkahwinan: string; alamat_tetap: string; alamat_surat: string; telefon: string; jawatan: string;
  employment_type: string; tarikh_mula: string;
};
export type Bank = { nama_bank: string; nama_pemilik: string; no_akaun: string; jenis_akaun: string };
export type Waris = { nama: string; hubungan: string; telefon: string; alamat: string };
export type Akademik = { kelayakan: string; institusi: string; tahun: string; keputusan: string };
export type SectionValue = Diri | Bank | Waris[] | Akademik[];

export const SECTION_TITLE: Record<DetailSection, string> = {
  diri: 'Maklumat Diri',
  bank: 'Maklumat Perbankan',
  waris: 'Maklumat Waris',
  akademik: 'Maklumat Akademik',
};

const EMPTY_DIRI: Diri = {
  nama: '', jantina: '', umur: '', ic: '', warganegara: '', bangsa: '', agama: '', status_perkahwinan: '',
  alamat_tetap: '', alamat_surat: '', telefon: '', jawatan: '', employment_type: '', tarikh_mula: '',
};
const EMPTY_BANK: Bank = { nama_bank: '', nama_pemilik: '', no_akaun: '', jenis_akaun: '' };
const EMPTY_WARIS: Waris = { nama: '', hubungan: '', telefon: '', alamat: '' };
const EMPTY_AKADEMIK: Akademik = { kelayakan: '', institusi: '', tahun: '', keputusan: '' };

const MY_BANKS = [
  'Maybank', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank', 'AmBank', 'Bank Islam', 'Bank Rakyat',
  'BSN', 'Affin Bank', 'Alliance Bank', 'Bank Muamalat', 'Agrobank', 'MBSB Bank', 'Al Rajhi Bank',
  'OCBC Bank', 'UOB', 'HSBC', 'Standard Chartered', 'GXBank', 'AEON Bank', 'Boost Bank',
];

/** True when a saved section has any value typed in. */
export function sectionFilled(value: unknown): boolean {
  if (!value) return false;
  if (Array.isArray(value)) return value.some(sectionFilled);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some((v) => String(v ?? '').trim() !== '');
  return false;
}

// Age from a Malaysian IC (YYMMDD-PB-####); '' when it doesn't parse.
function ageFromIc(ic: string): string {
  const d = ic.replace(/\D/g, '');
  if (d.length < 6) return '';
  const yy = +d.slice(0, 2); const mm = +d.slice(2, 4); const dd = +d.slice(4, 6);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';
  const now = new Date();
  const year = yy + (yy > now.getFullYear() % 100 ? 1900 : 2000);
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < mm || (now.getMonth() + 1 === mm && now.getDate() < dd)) age--;
  return age > 0 && age < 100 ? String(age) : '';
}

interface StaffDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: DetailSection;
  personName: string;
  saved: SectionValue | null;
  /** Prefill for a first-time Maklumat Diri (name, role, phone already known). */
  defaults?: Partial<Diri>;
  onSave: (value: SectionValue) => Promise<void>;
  isLoading?: boolean;
}

const Field = ({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) => (
  <div className={`space-y-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
    <Label>{label}</Label>
    {children}
  </div>
);

const Choice = ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) => (
  <Select value={value || undefined} onValueChange={onChange}>
    <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
    <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
  </Select>
);

export default function StaffDetailsModal({ open, onOpenChange, section, personName, saved, defaults, onSave, isLoading = false }: StaffDetailsModalProps) {
  const [diri, setDiri] = useState<Diri>(EMPTY_DIRI);
  const [bank, setBank] = useState<Bank>(EMPTY_BANK);
  const [waris, setWaris] = useState<Waris[]>([EMPTY_WARIS, EMPTY_WARIS]);
  const [akademik, setAkademik] = useState<Akademik[]>([EMPTY_AKADEMIK]);

  useEffect(() => {
    if (!open) return;
    if (section === 'diri') setDiri({ ...EMPTY_DIRI, ...(saved ? (saved as Diri) : defaults) });
    if (section === 'bank') setBank({ ...EMPTY_BANK, ...((saved as Bank) || {}) });
    if (section === 'waris') {
      const w = (saved as Waris[]) || [];
      setWaris([{ ...EMPTY_WARIS, ...w[0] }, { ...EMPTY_WARIS, ...w[1] }]);
    }
    if (section === 'akademik') {
      const a = (saved as Akademik[]) || [];
      setAkademik(a.length ? a.map((x) => ({ ...EMPTY_AKADEMIK, ...x })) : [EMPTY_AKADEMIK]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, section, saved]);

  const d = (k: keyof Diri) => ({ value: diri[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDiri({ ...diri, [k]: e.target.value }) });
  const setIc = (ic: string) => setDiri((prev) => ({ ...prev, ic, umur: ageFromIc(ic) || prev.umur }));
  const setW = (i: number, k: keyof Waris, v: string) => setWaris(waris.map((w, j) => (j === i ? { ...w, [k]: v } : w)));
  const setA = (i: number, k: keyof Akademik, v: string) => setAkademik(akademik.map((a, j) => (j === i ? { ...a, [k]: v } : a)));

  const value = (): SectionValue => {
    const trim = <T extends Record<string, string>>(o: T) =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, (v ?? '').trim()])) as T;
    if (section === 'diri') return trim(diri);
    if (section === 'bank') return trim(bank);
    if (section === 'waris') return waris.map(trim);
    return akademik.map(trim).filter(sectionFilled);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{SECTION_TITLE[section]} - {personName}</DialogTitle>
        </DialogHeader>

        {section === 'diri' && (
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <Field label="Nama" wide><Input {...d('nama')} /></Field>
            <Field label="Jantina"><Choice value={diri.jantina} onChange={(v) => setDiri({ ...diri, jantina: v })} options={['Lelaki', 'Perempuan']} /></Field>
            <Field label="Umur"><Input inputMode="numeric" {...d('umur')} /></Field>
            <Field label="No. Kad Pengenalan"><Input value={diri.ic} onChange={(e) => setIc(e.target.value)} placeholder="cth. 900101-03-1234" /></Field>
            <Field label="Warganegara"><Input {...d('warganegara')} placeholder="Malaysia" /></Field>
            <Field label="Bangsa"><Choice value={diri.bangsa} onChange={(v) => setDiri({ ...diri, bangsa: v })} options={['Melayu', 'Cina', 'India', 'Lain-lain']} /></Field>
            <Field label="Agama"><Choice value={diri.agama} onChange={(v) => setDiri({ ...diri, agama: v })} options={['Islam', 'Kristian', 'Buddha', 'Hindu', 'Lain-lain']} /></Field>
            <Field label="Status Perkahwinan"><Choice value={diri.status_perkahwinan} onChange={(v) => setDiri({ ...diri, status_perkahwinan: v })} options={['Bujang', 'Berkahwin', 'Duda/Janda']} /></Field>
            <Field label="Alamat Tetap" wide><Input {...d('alamat_tetap')} /></Field>
            <Field label="Alamat Surat Menyurat" wide><Input {...d('alamat_surat')} /></Field>
            <Field label="No. Telefon"><Input inputMode="tel" {...d('telefon')} /></Field>
            <Field label="Jawatan"><Input {...d('jawatan')} /></Field>
            <Field label="Employment Type"><Choice value={diri.employment_type} onChange={(v) => setDiri({ ...diri, employment_type: v })} options={['Full Time', 'Part Time']} /></Field>
            <Field label="Tarikh Mula Berkhidmat"><Input type="date" {...d('tarikh_mula')} /></Field>
          </div>
        )}

        {section === 'bank' && (
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <Field label="Nama Bank">
              <Input list="my-banks" value={bank.nama_bank} onChange={(e) => setBank({ ...bank, nama_bank: e.target.value })} />
              <datalist id="my-banks">{MY_BANKS.map((b) => <option key={b} value={b} />)}</datalist>
            </Field>
            <Field label="Nama Pemilik Bank"><Input value={bank.nama_pemilik} onChange={(e) => setBank({ ...bank, nama_pemilik: e.target.value })} /></Field>
            <Field label="No. Akaun"><Input inputMode="numeric" value={bank.no_akaun} onChange={(e) => setBank({ ...bank, no_akaun: e.target.value })} /></Field>
            <Field label="Jenis Akaun"><Choice value={bank.jenis_akaun} onChange={(v) => setBank({ ...bank, jenis_akaun: v })} options={['Simpanan', 'Semasa']} /></Field>
          </div>
        )}

        {section === 'waris' && (
          <div className="space-y-5 py-2">
            {waris.map((w, i) => (
              <div key={i} className="space-y-3">
                <p className="text-sm font-semibold">Waris {i + 1}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nama"><Input value={w.nama} onChange={(e) => setW(i, 'nama', e.target.value)} /></Field>
                  <Field label="Hubungan"><Input value={w.hubungan} onChange={(e) => setW(i, 'hubungan', e.target.value)} placeholder="cth. Ibu, Suami" /></Field>
                  <Field label="No. Telefon"><Input inputMode="tel" value={w.telefon} onChange={(e) => setW(i, 'telefon', e.target.value)} /></Field>
                  <Field label="Alamat"><Input value={w.alamat} onChange={(e) => setW(i, 'alamat', e.target.value)} /></Field>
                </div>
              </div>
            ))}
          </div>
        )}

        {section === 'akademik' && (
          <div className="space-y-5 py-2">
            {akademik.map((a, i) => (
              <div key={i} className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Kelayakan {i + 1}</p>
                  {akademik.length > 1 && (
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-red-600" title="Buang kelayakan ni"
                      onClick={() => setAkademik(akademik.filter((_, j) => j !== i))}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nama Kelayakan/Bidang"><Input value={a.kelayakan} onChange={(e) => setA(i, 'kelayakan', e.target.value)} placeholder="cth. SPM, Diploma Perakaunan" /></Field>
                  <Field label="Nama Sekolah/Institusi"><Input value={a.institusi} onChange={(e) => setA(i, 'institusi', e.target.value)} /></Field>
                  <Field label="Tahun"><Input inputMode="numeric" value={a.tahun} onChange={(e) => setA(i, 'tahun', e.target.value)} /></Field>
                  <Field label="Keputusan Pangkat"><Input value={a.keputusan} onChange={(e) => setA(i, 'keputusan', e.target.value)} /></Field>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" className="w-full" onClick={() => setAkademik([...akademik, EMPTY_AKADEMIK])}>
              <Plus className="mr-2 h-4 w-4" /> Tambah Kelayakan
            </Button>
          </div>
        )}

        <DialogFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancel</Button>
          <Button onClick={() => onSave(value())} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
