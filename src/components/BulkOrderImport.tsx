import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBundles } from '@/context/BundleContext';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Upload, Download, FileSpreadsheet, Loader2, CheckCircle2 } from 'lucide-react';

// Template column headers (the order clients fill in).
const COLUMNS = [
  'Nama', 'Telefon', 'Alamat', 'Poskod', 'Bandar', 'Negeri',
  'Produk', 'Harga', 'Kuantiti', 'Platform', 'JenisCustomer', 'CaraBayaran', 'Kurier', 'Nota',
];
const EXAMPLE_ROW = [
  'Ali bin Abu', '60123456789', 'No 1 Jalan Contoh', '50000', 'Kuala Lumpur', 'Selangor',
  '(nama produk / bundle anda)', '120', '1', 'Facebook', 'NP', 'COD', 'Poslaju', 'nota rujukan (optional)',
];

// Map a raw header to our canonical key.
function canonicalHeader(h: string): string {
  const k = String(h || '').toLowerCase().replace(/[\s_]/g, '');
  if (/^(nama|name|customer|namapelanggan)$/.test(k)) return 'nama';
  if (/^(telefon|phone|notelefon|nophone|hp|mobile)$/.test(k)) return 'telefon';
  if (/^(alamat|address)$/.test(k)) return 'alamat';
  if (/^(poskod|postcode|zip)$/.test(k)) return 'poskod';
  if (/^(bandar|city|daerah|town)$/.test(k)) return 'bandar';
  if (/^(negeri|state)$/.test(k)) return 'negeri';
  if (/^(produk|product|item)$/.test(k)) return 'produk';
  if (/^(harga|price|total|hargajualan|amount)$/.test(k)) return 'harga';
  if (/^(kuantiti|qty|quantity|unit|bilangan)$/.test(k)) return 'kuantiti';
  if (/^(platform|jenisplatform)$/.test(k)) return 'platform';
  if (/^(jeniscustomer|customer type|jeniscust|customertype)$/.test(k)) return 'jeniscustomer';
  if (/^(carabayaran|payment|paymentmethod|bayaran)$/.test(k)) return 'carabayaran';
  if (/^(kurier|courier|delivery|deliverymethod)$/.test(k)) return 'kurier';
  if (/^(nota|note|notes|remark|catatan)$/.test(k)) return 'nota';
  return k;
}

function formatPhone(phone: string): string {
  let f = String(phone || '').replace(/\D/g, '');
  if (f.startsWith('0')) f = '6' + f;
  else if (!f.startsWith('60') && f.length >= 9) f = '60' + f;
  return f;
}
function malaysiaDate(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().split('T')[0];
}

const BulkOrderImport: React.FC<{ onImported?: () => void }> = ({ onImported }) => {
  const { profile } = useAuth();
  const { bundles } = useBundles();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([COLUMNS, EXAMPLE_ROW]);
    ws['!cols'] = COLUMNS.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    XLSX.writeFile(wb, 'peningorder-import-template.xlsx');
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await runImport(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const runImport = async (file: File) => {
    setBusy(true);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
      if (raw.length === 0) { toast({ title: 'Kosong', description: 'Fail tiada data.', variant: 'destructive' }); return; }

      // Normalize every row's keys to canonical headers.
      const rows = raw.map((r) => {
        const o: Record<string, string> = {};
        for (const [k, v] of Object.entries(r)) o[canonicalHeader(k)] = String(v ?? '').trim();
        return o;
      }).filter((r) => r.nama || r.telefon); // skip blank lines

      if (rows.length === 0) { toast({ title: 'Kosong', description: 'Tiada baris sah (perlu Nama/Telefon).', variant: 'destructive' }); return; }

      const bundleByName = new Map(bundles.map((b: any) => [String(b.name || '').toLowerCase(), b]));
      const dateOrder = malaysiaDate();
      const errors: string[] = [];

      // Generate one sale-id per row (parallel; the DB sequence stays unique).
      const ids = await Promise.all(rows.map(async (_, i) => {
        try { const { data } = await supabase.rpc('generate_sale_id'); return data || `ON-${Date.now()}${i}`; }
        catch { return `ON-${Date.now()}${i}`; }
      }));

      const inserts = rows.map((r, i) => {
        const bundle: any = bundleByName.get((r.produk || '').toLowerCase());
        const isCOD = /cod/i.test(r.carabayaran);
        const courier = (r.kurier || 'Poslaju').trim();
        return {
          id_sale: ids[i],
          marketer_id_staff: profile?.idstaff || null,
          name_customer: r.nama || 'Customer',
          phone_customer: formatPhone(r.telefon),
          address_customer: r.alamat,
          postcode_customer: r.poskod,
          city_customer: r.bandar,
          state_customer: r.negeri,
          unit: Number(r.kuantiti) || 1,
          total_sale: Number(String(r.harga).replace(/[^0-9.]/g, '')) || 0,
          cost_postage: 0,
          cost_baseproduct: 0,
          cost_hq: 0,
          kurier: `${courier} ${isCOD ? 'COD' : 'CASH'}`,
          tracking_number: '',
          nota_staff: r.nota || (bundle ? '' : r.produk), // keep product text if no bundle match
          delivery_status: 'Pending',
          date_order: dateOrder,
          jenis_platform: r.platform || 'Facebook',
          jenis_customer: r.jeniscustomer || 'NP',
          jenis_closing: 'Website',
          type_payment: isCOD ? 'COD' : 'CASH',
          bundle_id: bundle?.id || null,
          seos: 'Pending',
          // owner_user_id defaults to auth.uid() (tenant isolation)
        };
      });

      // Batch insert (chunks of 100 to stay well within limits).
      let ok = 0;
      for (let i = 0; i < inserts.length; i += 100) {
        const chunk = inserts.slice(i, i + 100);
        const { error, data } = await supabase.from('customer_purchases').insert(chunk).select('id');
        if (error) { errors.push(error.message); }
        else ok += (data?.length || chunk.length);
      }

      setResult({ ok, fail: rows.length - ok, errors: errors.slice(0, 3) });
      if (ok > 0) {
        toast({ title: 'Import selesai', description: `${ok} order berjaya diimport.` });
        onImported?.();
      }
    } catch (err: any) {
      toast({ title: 'Import gagal', description: err.message || 'Ralat membaca fail.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => { setOpen(true); setResult(null); }}>
        <FileSpreadsheet className="w-4 h-4 mr-2" /> Import Bulk (Excel/CSV)
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Bulk Order</DialogTitle>
            <DialogDescription>Muat naik fail Excel (.xlsx) atau CSV untuk import banyak order sekaligus.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium mb-1">Lajur yang diperlukan (guna template):</p>
              <p className="text-xs text-muted-foreground break-words">{COLUMNS.join(' · ')}</p>
              <p className="text-xs text-muted-foreground mt-2">
                <b>Produk</b> sepadan nama bundle anda (untuk kos automatik). <b>CaraBayaran</b>: CASH atau COD.
                Nama &amp; Telefon wajib; lain-lain optional.
              </p>
            </div>

            <Button type="button" variant="secondary" onClick={downloadTemplate} className="w-full">
              <Download className="w-4 h-4 mr-2" /> Muat Turun Template + Contoh
            </Button>

            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" id="bulk-order-file" />
            <label
              htmlFor="bulk-order-file"
              className={`flex items-center justify-center gap-2 w-full px-4 py-3 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${busy ? 'pointer-events-none opacity-60' : ''}`}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span className="text-sm text-muted-foreground">{busy ? 'Mengimport…' : 'Pilih fail .xlsx / .csv'}</span>
            </label>

            {result && (
              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-green-600">
                  <CheckCircle2 className="w-4 h-4" /> {result.ok} order berjaya
                </p>
                {result.fail > 0 && <p className="text-red-500 mt-1">{result.fail} gagal</p>}
                {result.errors.map((e, i) => <p key={i} className="text-xs text-muted-foreground mt-1 break-words">{e}</p>)}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BulkOrderImport;
