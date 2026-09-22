import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calendar, Loader2, Filter, Wallet, Download, Users, Info, ChevronRight, ChevronDown, Package } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, fetchAllRows, isOrderCollected, formatDMY } from '@/lib/utils';
import { useTeam } from '@/hooks/useTeam';
import { useAuth } from '@/context/AuthContext';
import { FileText } from 'lucide-react';

interface InvoiceSettings {
  company_name?: string | null;
  registration_no?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

interface Order {
  marketer_id_staff: string;
  total_sale: number;
  delivery_status: string;
  type_payment: string;
  date_payment: string | null;
  kurier: string;
  cost_baseproduct: number;
  cost_postage: number;
  commission_amount: number;
}

interface Spend {
  marketer_id_staff: string;
  total_spend: number;
}

interface Tier { start: number; end: number | null; value: number; }

interface PnlConfig {
  revenue_basis: 'nett_sales' | 'collection' | 'komisyen_order';
  komisyen_basis: 'nett_sales' | 'collection';
  commission_mode: 'profit_sharing' | 'percent_direct';
  deduct_postage: boolean;
  deduct_product: boolean;
  deduct_spend: boolean;
  kpi_type: 'roas' | 'range_sales';
  tiers: Tier[];
}

interface SalaryRow {
  idStaff: string;
  name: string;
  totalSales: number;
  returnSales: number;
  nettSales: number;
  collection: number;
  spend: number;
  costProduct: number;
  postage: number;
  revenue: number;
  base: number;
  roas: number;
  kpiValue: number;
  commissionPercent: number;
  commission: number;
  qualifyOrders: number;
}

const AccountSalary: React.FC = () => {
  const { members, nameByIdstaff, invoiceByIdstaff } = useTeam();
  const { profile } = useAuth();
  // A marketer sees ONLY their own row (own data).
  const isMarketer = profile?.role === 'marketer';
  const ownIdStaff = profile?.idstaff || '';

  const [pendingStart, setPendingStart] = useState(getMalaysiaStartOfMonth());
  const [pendingEnd, setPendingEnd] = useState(getMalaysiaEndOfMonth());
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());

  const applyFilter = () => { setStartDate(pendingStart); setEndDate(pendingEnd); };

  // In-app Bundle breakdown modal (Komisyen Order only) — same data as the slip.
  const [bundleModal, setBundleModal] = useState<{ idStaff: string; name: string } | null>(null);
  const [bundleGroups, setBundleGroups] = useState<BundleGroup[] | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [openBundleKey, setOpenBundleKey] = useState<string | null>(null);
  const openBundles = async (r: SalaryRow) => {
    setBundleModal({ idStaff: r.idStaff, name: r.name });
    setBundleGroups(null); setBundleLoading(true); setOpenBundleKey(null);
    const g = await loadBundleGroups(r.idStaff);
    setBundleGroups(g); setBundleLoading(false);
  };

  const { data: allOrders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ['salary-orders', startDate, endDate],
    queryFn: async () => {
      const data = await fetchAllRows(() =>
        (supabase as any)
          .from('customer_purchases')
          .select('marketer_id_staff, total_sale, delivery_status, type_payment, date_payment, kurier, cost_baseproduct, cost_postage, commission_amount')
          .gte('date_order', startDate)
          .lte('date_order', endDate)
      );
      return data as Order[];
    },
  });

  const { data: spends = [], isLoading: spendsLoading } = useQuery<Spend[]>({
    queryKey: ['salary-spends', startDate, endDate],
    queryFn: async () => {
      const data = await fetchAllRows(() =>
        (supabase as any)
          .from('spends')
          .select('marketer_id_staff, total_spend')
          .gte('tarikh_spend', startDate)
          .lte('tarikh_spend', endDate)
      );
      return data as Spend[];
    },
  });

  const { data: config, isLoading: configLoading } = useQuery<PnlConfig | null>({
    queryKey: ['salary-pnl-config'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('pnl_config').select('*').maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { ...data, tiers: Array.isArray(data.tiers) ? data.tiers : [] } as PnlConfig;
    },
  });

  const { data: invoiceSettings } = useQuery<InvoiceSettings | null>({
    queryKey: ['salary-invoice-settings'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('invoice_settings').select('company_name, registration_no, address, phone, email, website').limit(1).maybeSingle();
      return (data || null) as InvoiceSettings | null;
    },
  });

  const isLoading = ordersLoading || spendsLoading || configLoading;

  const formatNumber = (v: number) =>
    new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const fmtRM = (v: number) => `RM ${formatNumber(v)}`;

  const isRoas = config?.kpi_type === 'roas';
  const isKomisyenOrder = config?.revenue_basis === 'komisyen_order';
  const isProfitSharing = config?.commission_mode === 'profit_sharing';
  // Which revenue figure is the "basis" for this config.
  const basisIsCollection = isKomisyenOrder
    ? config?.komisyen_basis === 'collection'
    : config?.revenue_basis === 'collection';

  const salaryRows = useMemo<SalaryRow[]>(() => {
    if (!config) return [];
    const agg: Record<string, { totalSales: number; returnSales: number; collection: number; spend: number; costProduct: number; postage: number; komNett: number; komColl: number; cntNett: number; cntColl: number }> = {};
    const ensure = (id: string) => (agg[id] ||= { totalSales: 0, returnSales: 0, collection: 0, spend: 0, costProduct: 0, postage: 0, komNett: 0, komColl: 0, cntNett: 0, cntColl: 0 });

    allOrders.forEach((o) => {
      const id = o.marketer_id_staff || '';
      if (!id) return;
      const a = ensure(id);
      const sale = Number(o.total_sale) || 0;
      const comm = Number(o.commission_amount) || 0;
      a.totalSales += sale;
      if (o.delivery_status === 'Return') a.returnSales += sale;
      else { a.komNett += comm; a.cntNett += 1; }            // basis "Total Sales − Return": all except Return
      if (isOrderCollected(o)) { a.collection += sale; a.komColl += comm; a.cntColl += 1; } // basis "Collection": collected only
      a.costProduct += Number(o.cost_baseproduct) || 0;
      a.postage += Number(o.cost_postage) || 0; // includes return-order postage
    });
    spends.forEach((s) => {
      const id = s.marketer_id_staff || '';
      if (!id) return;
      ensure(id).spend += Number(s.total_spend) || 0;
    });

    const staff = members.filter((m) => !m.is_client && (!isMarketer || m.idstaff === ownIdStaff));

    const matchTier = (kpi: number): Tier | null =>
      config.tiers.find((t) => kpi >= t.start && (t.end == null || kpi <= t.end)) || null;

    const komOrder = config.revenue_basis === 'komisyen_order';
    const collBasis = komOrder ? config.komisyen_basis === 'collection' : config.revenue_basis === 'collection';

    const rows = staff.map((m) => {
      const a = agg[m.idstaff] || { totalSales: 0, returnSales: 0, collection: 0, spend: 0, costProduct: 0, postage: 0, komNett: 0, komColl: 0, cntNett: 0, cntColl: 0 };
      const nettSales = a.totalSales - a.returnSales;
      const roas = a.spend > 0 ? a.totalSales / a.spend : 0;
      const qualifyOrders = collBasis ? a.cntColl : a.cntNett;

      // Komisyen Order: commission = sum of per-bundle komisyen for qualifying orders.
      if (komOrder) {
        const commission = config.komisyen_basis === 'collection' ? a.komColl : a.komNett;
        return {
          idStaff: m.idstaff, name: nameByIdstaff.get(m.idstaff) || m.name || m.idstaff,
          totalSales: a.totalSales, returnSales: a.returnSales, nettSales,
          collection: a.collection, spend: a.spend, costProduct: a.costProduct, postage: a.postage,
          revenue: 0, base: 0, roas, kpiValue: 0, commissionPercent: 0, commission, qualifyOrders,
        };
      }

      const revenue = config.revenue_basis === 'collection' ? a.collection : nettSales;
      const kpiValue = config.kpi_type === 'roas' ? roas : revenue;
      const tier = matchTier(kpiValue);
      const commissionPercent = tier?.value || 0;
      const base = config.commission_mode === 'percent_direct'
        ? revenue
        : revenue
            - (config.deduct_postage ? a.postage : 0)
            - (config.deduct_product ? a.costProduct : 0)
            - (config.deduct_spend ? a.spend : 0);
      const commission = tier ? (base * commissionPercent) / 100 : 0;
      return {
        idStaff: m.idstaff, name: nameByIdstaff.get(m.idstaff) || m.name || m.idstaff,
        totalSales: a.totalSales, returnSales: a.returnSales, nettSales,
        collection: a.collection, spend: a.spend, costProduct: a.costProduct, postage: a.postage,
        revenue, base, roas, kpiValue, commissionPercent, commission, qualifyOrders,
      };
    });
    return rows.sort((x, y) => y.commission - x.commission);
  }, [allOrders, spends, members, nameByIdstaff, config, isMarketer, ownIdStaff]);

  const totals = useMemo(() => salaryRows.reduce(
    (acc, r) => ({
      totalSales: acc.totalSales + r.totalSales,
      nettSales: acc.nettSales + r.nettSales,
      collection: acc.collection + r.collection,
      returnSales: acc.returnSales + r.returnSales,
      spend: acc.spend + r.spend,
      costProduct: acc.costProduct + r.costProduct,
      postage: acc.postage + r.postage,
      base: acc.base + r.base,
      commission: acc.commission + r.commission,
      qualifyOrders: acc.qualifyOrders + r.qualifyOrders,
    }),
    { totalSales: 0, nettSales: 0, collection: 0, returnSales: 0, spend: 0, costProduct: 0, postage: 0, base: 0, commission: 0, qualifyOrders: 0 },
  ), [salaryRows]);

  // Effective commission rate = payout ÷ the revenue that generated it. The CEO
  // metric for "how expensive is this staff".
  const pctOf = (comm: number, basis: number) => (basis > 0 ? `${((comm / basis) * 100).toFixed(1)}%` : '—');
  const totalBasis = basisIsCollection ? totals.collection : totals.nettSales;

  // Build the columns shown, driven entirely by the PNL config.
  type Col = { key: string; label: string; align: 'left' | 'right'; headClass?: string; cell: (r: SalaryRow) => React.ReactNode; total?: React.ReactNode };
  const columns: Col[] = useMemo(() => {
    if (!config) return [];
    const cols: Col[] = [
      { key: 'id', label: 'ID Staff', align: 'left', cell: (r) => <span className="font-mono">{r.idStaff}</span> },
      { key: 'name', label: 'Nama', align: 'left', cell: (r) => r.name },
    ];
    const totalSalesCol: Col = { key: 'total', label: 'Total Sales', align: 'right', cell: (r) => fmtRM(r.totalSales), total: fmtRM(totals.totalSales) };
    const nettCol: Col = { key: 'nett', label: 'Nett Sales', align: 'right', cell: (r) => fmtRM(r.nettSales), total: fmtRM(totals.nettSales) };
    const collCol: Col = { key: 'coll', label: 'Collection', align: 'right', headClass: 'text-green-600 dark:text-green-400', cell: (r) => <span className="text-green-600 dark:text-green-400">{fmtRM(r.collection)}</span>, total: <span className="text-green-600 dark:text-green-400">{fmtRM(totals.collection)}</span> };
    const returnCol: Col = { key: 'return', label: 'Return', align: 'right', headClass: 'text-red-600 dark:text-red-400', cell: (r) => <span className="text-red-600 dark:text-red-400">{fmtRM(r.returnSales)}</span>, total: <span className="text-red-600 dark:text-red-400">{fmtRM(totals.returnSales)}</span> };
    const spendCol: Col = { key: 'spend', label: 'Spend', align: 'right', headClass: 'text-red-600 dark:text-red-400', cell: (r) => <span className="text-red-600 dark:text-red-400">{fmtRM(r.spend)}</span>, total: <span className="text-red-600 dark:text-red-400">{fmtRM(totals.spend)}</span> };
    const productCol: Col = { key: 'product', label: 'Cost Product', align: 'right', cell: (r) => fmtRM(r.costProduct), total: fmtRM(totals.costProduct) };
    const postageCol: Col = { key: 'postage', label: 'Postage', align: 'right', cell: (r) => fmtRM(r.postage), total: fmtRM(totals.postage) };
    const grossCol: Col = { key: 'gross', label: 'Gross Profit', align: 'right', headClass: 'text-blue-600 dark:text-blue-400', cell: (r) => <span className="text-blue-600 dark:text-blue-400">{fmtRM(r.base)}</span>, total: <span className="text-blue-600 dark:text-blue-400">{fmtRM(totals.base)}</span> };
    const roasCol: Col = { key: 'roas', label: 'ROAS', align: 'right', headClass: 'text-amber-600 dark:text-amber-400', cell: (r) => <span className="text-amber-600 dark:text-amber-400">{r.roas.toFixed(2)}x</span> };
    const pctCol: Col = { key: 'pct', label: 'Comm %', align: 'right', cell: (r) => `${r.commissionPercent}%` };
    const commissionCol: Col = { key: 'commission', label: 'Commission', align: 'right', headClass: 'text-primary font-semibold', cell: (r) => <span className="font-bold text-primary">{fmtRM(r.commission)}</span>, total: <span className="font-bold text-primary">{fmtRM(totals.commission)}</span> };
    // Effective commission cost (payout ÷ the revenue basis) — the CEO's "how expensive" lens.
    const komPctCol: Col = { key: 'kompct', label: 'Komisyen %', align: 'right', headClass: 'text-muted-foreground', cell: (r) => pctOf(r.commission, basisIsCollection ? r.collection : r.nettSales), total: pctOf(totals.commission, totalBasis) };
    // What the company keeps after paying the staff (profit sharing only).
    const bakiCol: Col = { key: 'baki', label: 'Baki Profit', align: 'right', headClass: 'text-green-700 dark:text-green-400', cell: (r) => <span className="text-green-700 dark:text-green-400">{fmtRM(r.base - r.commission)}</span>, total: <span className="text-green-700 dark:text-green-400">{fmtRM(totals.base - totals.commission)}</span> };

    if (isKomisyenOrder) {
      // CEO view for a flat bundle-komisyen team: Total Sales, leakage (Return),
      // the collected figure when that's the basis, the payout and its effective
      // rate. No Bil. Order, no Baki Profit (there's no cost side here).
      cols.push(totalSalesCol);
      cols.push(returnCol);
      if (basisIsCollection) cols.push(collCol);
      cols.push(commissionCol);
      cols.push(komPctCol);
      return cols;
    }
    cols.push(basisIsCollection ? collCol : nettCol);
    if (isProfitSharing) {
      if (config.deduct_spend) cols.push(spendCol);
      if (config.deduct_product) cols.push(productCol);
      if (config.deduct_postage) cols.push(postageCol);
      cols.push(grossCol);
    }
    if (isRoas) cols.push(roasCol);
    cols.push(pctCol);
    cols.push(commissionCol);
    if (isProfitSharing) cols.push(bakiCol);
    else cols.push(komPctCol);
    return cols;
  }, [config, totals, totalBasis, isKomisyenOrder, isProfitSharing, isRoas, basisIsCollection]);

  // Summary cards, also config-driven.
  const cards = useMemo(() => {
    if (!config) return [];
    const out: { label: string; value: string; color: string }[] = [];
    if (isKomisyenOrder) {
      out.push({ label: 'Total Sales', value: fmtRM(totals.totalSales), color: 'blue' });
      out.push({ label: 'Total Return', value: fmtRM(totals.returnSales), color: 'red' });
      out.push({ label: 'Total Commission', value: fmtRM(totals.commission), color: 'amber' });
      out.push({ label: 'Komisyen %', value: pctOf(totals.commission, totalBasis), color: 'slate' });
      return out;
    }
    out.push({ label: basisIsCollection ? 'Total Collection' : 'Total Nett Sales', value: fmtRM(basisIsCollection ? totals.collection : totals.nettSales), color: basisIsCollection ? 'green' : 'blue' });
    if (isProfitSharing) out.push({ label: 'Total Gross Profit', value: fmtRM(totals.base), color: 'blue' });
    out.push({ label: 'Total Commission', value: fmtRM(totals.commission), color: 'amber' });
    // CEO lens: effective commission cost, and (profit sharing) what the company keeps.
    if (isProfitSharing) out.push({ label: 'Baki Profit', value: fmtRM(totals.base - totals.commission), color: 'green' });
    else out.push({ label: 'Komisyen %', value: pctOf(totals.commission, totalBasis), color: 'slate' });
    return out;
  }, [config, totals, totalBasis, isKomisyenOrder, isProfitSharing, basisIsCollection]);

  const exportToXLSX = () => {
    const data = salaryRows.map((r, i) => {
      const row: Record<string, any> = { No: i + 1 };
      columns.forEach((c) => {
        if (c.key === 'id') row['ID Staff'] = r.idStaff;
        else if (c.key === 'name') row['Nama'] = r.name;
        else if (c.key === 'total') row['Total Sales'] = r.totalSales.toFixed(2);
        else if (c.key === 'nett') row['Nett Sales'] = r.nettSales.toFixed(2);
        else if (c.key === 'coll') row['Collection'] = r.collection.toFixed(2);
        else if (c.key === 'return') row['Return'] = r.returnSales.toFixed(2);
        else if (c.key === 'spend') row['Spend'] = r.spend.toFixed(2);
        else if (c.key === 'product') row['Cost Product'] = r.costProduct.toFixed(2);
        else if (c.key === 'postage') row['Postage'] = r.postage.toFixed(2);
        else if (c.key === 'gross') row['Gross Profit'] = r.base.toFixed(2);
        else if (c.key === 'roas') row['ROAS'] = r.roas.toFixed(2);
        else if (c.key === 'pct') row['Comm %'] = r.commissionPercent;
        else if (c.key === 'orders') row['Bil. Order'] = r.qualifyOrders;
        else if (c.key === 'commission') row['Commission'] = r.commission.toFixed(2);
        else if (c.key === 'kompct') row['Komisyen %'] = pctOf(r.commission, basisIsCollection ? r.collection : r.nettSales);
        else if (c.key === 'baki') row['Baki Profit'] = (r.base - r.commission).toFixed(2);
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salary');
    XLSX.writeFile(wb, `salary_${startDate}_to_${endDate}.xlsx`);
  };

  const cardColor: Record<string, string> = {
    blue: 'border-l-blue-500 text-blue-600', green: 'border-l-green-500 text-green-600',
    slate: 'border-l-slate-500 text-slate-600', amber: 'border-l-amber-500 text-amber-600',
    red: 'border-l-red-500 text-red-600',
  };

  // Salary slip — dynamic line items driven by the PNL config, opened as a
  // print-ready page (issuer = Invoice Settings, bill-to = the staff's invoice
  // details, brand = peningorder). Beautiful red-accent invoice, like a proper slip.
  // Load a staff's qualifying orders grouped by bundle (name + sku). Shared by the
  // printable slip and the in-app Bundle modal. Komisyen is numeric here.
  type BundleGroup = { name: string; sku: string; sum: number; orders: { id: string; date: string; product: string; name: string; phone: string; tracking: string; komisyen: number }[] };
  const loadBundleGroups = async (idStaff: string): Promise<BundleGroup[]> => {
    let orderRows: any[] = [];
    try {
      orderRows = await fetchAllRows(() => (supabase as any)
        .from('customer_purchases')
        .select('id_sale, date_order, name_customer, phone_customer, tracking_number, commission_amount, delivery_status, type_payment, date_payment, kurier, nota_staff, bundle:logistic_bundles(name, sku)')
        .eq('marketer_id_staff', idStaff)
        .gte('date_order', startDate)
        .lte('date_order', endDate));
    } catch (_e) { orderRows = []; }
    const qualifies = (o: any) => basisIsCollection ? isOrderCollected(o) : o.delivery_status !== 'Return';
    const map = new Map<string, BundleGroup>();
    orderRows.filter(qualifies).forEach((o: any) => {
      const nm = (o.bundle?.name) || o.nota_staff || 'Lain-lain';
      const sku = o.bundle?.sku || '';
      const key = `${nm}|${sku}`;
      if (!map.has(key)) map.set(key, { name: nm, sku, sum: 0, orders: [] });
      const g = map.get(key)!;
      const comm = Number(o.commission_amount) || 0;
      g.sum += comm;
      g.orders.push({ id: o.id_sale || '-', date: formatDMY(o.date_order), product: sku ? `${nm} (${sku})` : nm, name: o.name_customer || '-', phone: o.phone_customer || '-', tracking: o.tracking_number || '-', komisyen: comm });
    });
    return [...map.values()].sort((a, b) => b.sum - a.sum);
  };

  const openSlip = async (r: SalaryRow) => {
    if (!config) return;
    const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const money = (v: number) => `RM ${formatNumber(v)}`;
    const inv = invoiceByIdstaff.get(r.idStaff) || { full_name: null, address: null, phone: null };
    const co = invoiceSettings || {};
    // peningorder favicon for the slip tab (self-contained data-URI SVG "PO" mark).
    const favicon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#e11d48"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="26" fill="#fff">PO</text></svg>')}`;

    let tableHead = '';
    let rowsHtml = '';
    let summaryRightHtml = '';
    let modalHtml = '';
    let script = '';

    if (isKomisyenOrder) {
      // Komisyen Order slip → an invoice grouped by BUNDLE. Each bundle row is
      // clickable to open a modal listing that bundle's orders. No Total Sales /
      // Return lines here — commission is purely the sum of per-bundle komisyen.
      const groups = await loadBundleGroups(r.idStaff);
      const totalOrders = groups.reduce((s, g) => s + g.orders.length, 0);
      tableHead = `<tr><th class="desc">Bundle</th><th class="amt">Kuantiti</th><th class="amt">Komisyen</th></tr>`;
      rowsHtml = groups.map((g, i) => `<tr class="clickable" onclick="showG(${i})"><td class="desc"><b>${esc(g.name)}</b>${g.sku ? ` <span style="color:#6b7280">(${esc(g.sku)})</span>` : ''} <span class="hint">— klik untuk lihat order</span></td><td class="amt">${g.orders.length}</td><td class="amt">${money(g.sum)}</td></tr>`).join('')
        || `<tr><td class="desc" colspan="3" style="color:#9ca3af">Tiada order layak untuk tempoh ini.</td></tr>`;
      summaryRightHtml = `<div class="party" style="text-align:right"><div class="lbl">Ringkasan</div><div>Bil. Order: <b>${totalOrders}</b></div><div>Jumlah Bundle: <b>${groups.length}</b></div><div>Asas: <b>${basisIsCollection ? 'Collection' : 'Total Sales − Return'}</b></div></div>`;
      modalHtml = `<div id="ov" class="ov" onclick="if(event.target===this)hideG()"><div class="mdl"><div class="mhead"><span id="mt"></span><button onclick="hideG()">&#10005;</button></div><div class="mbody"><table class="mtab"><thead><tr><th>ID Order</th><th>Tarikh</th><th>Produk</th><th>Nama</th><th>Telefon</th><th>Tracking</th><th class="amt">Komisyen</th></tr></thead><tbody id="mb"></tbody></table></div></div></div>`;
      const data = JSON.stringify(groups.map((g) => ({ name: g.sku ? `${g.name} (${g.sku})` : g.name, orders: g.orders.map((o) => ({ ...o, komisyen: money(o.komisyen) })) }))).replace(/</g, '\\u003c');
      script = `<script>var G=${data};function e(s){return String(s==null?'':s).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});}function showG(i){var g=G[i];document.getElementById('mt').textContent=g.name+' — '+g.orders.length+' order';document.getElementById('mb').innerHTML=g.orders.map(function(o){return '<tr><td>'+e(o.id)+'</td><td>'+e(o.date)+'</td><td>'+e(o.product)+'</td><td>'+e(o.name)+'</td><td>'+e(o.phone)+'</td><td>'+e(o.tracking)+'</td><td class="amt">'+e(o.komisyen)+'</td></tr>';}).join('');document.getElementById('ov').style.display='flex';}function hideG(){document.getElementById('ov').style.display='none';}</script>`;
    } else {
      type Line = { label: string; amount: number; strong?: boolean; sub?: boolean; muted?: boolean };
      const lines: Line[] = [];
      if (isProfitSharing) {
        lines.push({ label: basisIsCollection ? 'Collection' : 'Nett Sales (Sales − Return)', amount: r.revenue });
        if (config.deduct_spend) lines.push({ label: '(−) Kos Spend', amount: -r.spend, muted: true });
        if (config.deduct_product) lines.push({ label: '(−) Kos Product', amount: -r.costProduct, muted: true });
        if (config.deduct_postage) lines.push({ label: '(−) Kos Postage', amount: -r.postage, muted: true });
        lines.push({ label: 'Gross Profit', amount: r.base, sub: true });
        lines.push({ label: `Komisyen — ${r.commissionPercent}% × Gross Profit`, amount: r.commission, strong: true });
      } else {
        lines.push({ label: basisIsCollection ? 'Collection' : 'Nett Sales (Sales − Return)', amount: r.revenue });
        lines.push({ label: `Komisyen — ${r.commissionPercent}% × ${basisIsCollection ? 'Collection' : 'Nett Sales'}`, amount: r.commission, strong: true });
      }
      tableHead = `<tr><th class="desc">Keterangan</th><th class="amt">Jumlah</th></tr>`;
      rowsHtml = lines.map((l) => `<tr class="${l.strong ? 'strong' : ''} ${l.sub ? 'sub' : ''} ${l.muted ? 'muted' : ''}"><td class="desc">${esc(l.label)}</td><td class="amt">${l.amount < 0 ? '−' : ''}RM ${formatNumber(Math.abs(l.amount))}</td></tr>`).join('');
      summaryRightHtml = `<div class="party" style="text-align:right"><div class="lbl">Ringkasan</div><div>${basisIsCollection ? 'Collection' : 'Nett Sales'}: <b>${money(r.revenue)}</b></div><div>Komisyen %: <b>${pctOf(r.commission, basisIsCollection ? r.collection : r.nettSales)}</b></div></div>`;
    }

    const today = new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
    const invNo = `SAL-${esc(r.idStaff)}-${startDate.replace(/-/g, '')}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Salary Slip ${esc(r.idStaff)}</title>
<link rel="icon" type="image/svg+xml" href="${favicon}">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;background:#f3f4f6;padding:24px}
  .sheet{max-width:800px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.08)}
  .top{display:flex;justify-content:space-between;align-items:flex-start;padding:32px 36px 24px;position:relative}
  .top:after{content:"";position:absolute;top:0;right:0;width:44%;height:100%;background:linear-gradient(135deg,#e11d48,#9f1239);clip-path:polygon(22% 0,100% 0,100% 100%,0 100%);opacity:.06}
  .brand{font-size:26px;font-weight:800;letter-spacing:-.5px}
  .brand .p{color:#111827}.brand .o{color:#e11d48}
  .brand small{display:block;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:2px;margin-top:2px}
  .slip-title{text-align:right}
  .slip-title h1{font-size:30px;font-weight:800;color:#e11d48;letter-spacing:1px}
  .slip-title .meta{margin-top:8px;font-size:12px;color:#6b7280;line-height:1.6}
  .slip-title .meta b{color:#111827}
  .bar{height:5px;background:linear-gradient(90deg,#e11d48,#9f1239)}
  .parties{display:flex;justify-content:space-between;gap:24px;padding:26px 36px}
  .party{font-size:13px;line-height:1.65;color:#374151;max-width:48%}
  .party .lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#e11d48;margin-bottom:6px}
  .party .nm{font-weight:700;color:#111827;font-size:14px}
  table{width:100%;border-collapse:collapse;margin:6px 0 0}
  thead th{background:#111827;color:#fff;text-align:left;padding:12px 36px;font-size:12px;letter-spacing:.5px;text-transform:uppercase}
  thead th.amt{text-align:right}
  tbody td{padding:12px 36px;font-size:13px;border-bottom:1px solid #f1f5f9}
  tbody td.amt{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  tbody tr.muted td{color:#6b7280}
  tbody tr.sub td{font-weight:700;background:#f8fafc}
  tbody tr.strong td{font-weight:700;color:#111827}
  .totalbox{display:flex;justify-content:flex-end;padding:20px 36px 32px}
  .totalbox .box{background:#e11d48;color:#fff;border-radius:10px;padding:16px 26px;min-width:280px;display:flex;justify-content:space-between;align-items:center}
  .totalbox .box .t{font-size:13px;text-transform:uppercase;letter-spacing:1px;opacity:.9}
  .totalbox .box .v{font-size:24px;font-weight:800}
  .foot{padding:0 36px 34px;color:#6b7280;font-size:12px;line-height:1.6}
  .foot .sig{margin-top:34px;display:flex;justify-content:space-between}
  .foot .sig div{border-top:1px solid #cbd5e1;padding-top:6px;width:200px;text-align:center;font-size:11px}
  .actions{max-width:800px;margin:16px auto 0;text-align:right}
  .actions button{background:#e11d48;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer}
  tbody tr.clickable{cursor:pointer}tbody tr.clickable:hover td{background:#fff1f2}
  .hint{font-size:10px;color:#9ca3af;font-weight:400}
  .ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);align-items:center;justify-content:center;padding:20px;z-index:50}
  .mdl{background:#fff;border-radius:12px;max-width:940px;width:100%;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3)}
  .mhead{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;background:#111827;color:#fff;font-weight:700;font-size:14px}
  .mhead button{background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer;line-height:1}
  .mbody{overflow:auto}
  .mtab{width:100%;border-collapse:collapse;margin:0}
  .mtab th{position:sticky;top:0;background:#f8fafc;text-align:left;padding:10px 14px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb}
  .mtab td{padding:9px 14px;font-size:12px;border-bottom:1px solid #f1f5f9;color:#374151}
  .mtab th.amt,.mtab td.amt{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0}.actions,.ov{display:none!important}}
</style></head><body>
  <div class="sheet">
    <div class="top">
      <div class="brand"><span class="p">pening</span><span class="o">order</span><small>SALARY SLIP</small>
        ${co.company_name ? `<div style="margin-top:12px;font-size:12px;color:#374151;font-weight:400;max-width:280px;line-height:1.5">
          <b style="color:#111827">${esc(co.company_name)}${co.registration_no ? ` (${esc(co.registration_no)})` : ''}</b>
          ${co.address ? `<br>${esc(co.address).replace(/\n/g, '<br>')}` : ''}
          ${co.phone ? `<br>Tel: ${esc(co.phone)}` : ''}${co.email ? ` · ${esc(co.email)}` : ''}
        </div>` : ''}
      </div>
      <div class="slip-title">
        <h1>SALARY</h1>
        <div class="meta">
          <div>No: <b>${invNo}</b></div>
          <div>Tarikh: <b>${today}</b></div>
          <div>Tempoh: <b>${esc(formatDMY(startDate))} – ${esc(formatDMY(endDate))}</b></div>
        </div>
      </div>
    </div>
    <div class="bar"></div>
    <div class="parties">
      <div class="party">
        <div class="lbl">Bill To</div>
        <div class="nm">${esc(inv.full_name || r.name)}</div>
        <div>ID Staff: ${esc(r.idStaff)}</div>
        ${inv.address ? `<div>${esc(inv.address).replace(/\n/g, '<br>')}</div>` : ''}
        ${inv.phone ? `<div>Tel: ${esc(inv.phone)}</div>` : ''}
      </div>
      ${summaryRightHtml}
    </div>
    <table>
      <thead>${tableHead}</thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="totalbox"><div class="box"><span class="t">Jumlah Komisyen</span><span class="v">${money(r.commission)}</span></div></div>
    <div class="foot">
      Slip ini dijana secara automatik oleh peningorder berdasarkan konfigurasi PNL semasa.
      <div class="sig"><div>Disediakan oleh</div><div>Diterima oleh</div></div>
    </div>
  </div>
  <div class="actions"><button onclick="window.print()">🖨️ Cetak / Simpan PDF</button></div>
  ${modalHtml}
  ${script}
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Sila benarkan popup untuk melihat slip.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Wallet className="w-6 h-6" />
            Salary
          </h1>
          <p className="text-muted-foreground mt-1">Komisyen staf mengikut konfigurasi PNL</p>
        </div>
        <Button onClick={exportToXLSX} className="bg-green-600 hover:bg-green-700 text-white w-fit">
          <Download className="w-4 h-4 mr-2" />Export XLSX
        </Button>
      </div>

      {!config && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg p-4 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Belum ada konfigurasi PNL. Pergi ke <b>PNL Config</b> untuk tetapkan cara kira komisyen dahulu.</span>
        </div>
      )}

      {config && (
        <div className="bg-card border border-border rounded-lg p-3 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          {isKomisyenOrder ? (
            <span>Asas: <b className="text-foreground">Komisyen Order</b> — komisyen bundle (setup Logistic), dikira untuk order <b className="text-foreground">{basisIsCollection ? 'yang dah Collect' : 'Total Sales − Return'}</b>.</span>
          ) : (
            <>
              <span>Asas: <b className="text-foreground">{basisIsCollection ? 'Collection' : 'Nett Sales'}</b></span>
              <span>Komisyen: <b className="text-foreground">{isProfitSharing ? 'Profit Sharing (Gross)' : 'Percent Direct'}</b></span>
              {isProfitSharing && (
                <span>Tolak: <b className="text-foreground">{[config.deduct_postage && 'Postage', config.deduct_product && 'Product', config.deduct_spend && 'Spend'].filter(Boolean).join(', ') || '—'}</b></span>
              )}
              <span>KPI: <b className="text-foreground">{isRoas ? 'ROAS' : 'Range Sales'}</b></span>
              <span>Tiers: <b className="text-foreground">{config.tiers.length}</b></span>
            </>
          )}
        </div>
      )}

      {/* Date filter */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-5 h-5" />
            <span className="font-medium text-foreground">Date Range:</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={pendingStart} onChange={(e) => setPendingStart(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={pendingEnd} onChange={(e) => setPendingEnd(e.target.value)} className="w-40" />
            </div>
            <Button onClick={applyFilter} size="sm" className="h-9">
              <Filter className="w-4 h-4 mr-1" />Filter
            </Button>
          </div>
        </div>
      </div>

      {/* Summary cards (config-driven) */}
      {cards.length > 0 && (
        <div className={`grid grid-cols-2 gap-3 ${cards.length >= 4 ? 'md:grid-cols-4' : cards.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          {cards.map((c) => (
            <div key={c.label} className={`stat-card border-l-4 ${cardColor[c.color] || 'border-l-slate-500 text-slate-600'}`}>
              <div className="text-muted-foreground text-xs uppercase mb-1">{c.label}</div>
              <div className={`text-lg font-bold ${(cardColor[c.color] || '').split(' ')[1] || ''}`}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Salary table (config-driven columns) */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Staff Commission</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={`p-3 ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.headClass || ''}`}>{c.label}</th>
                ))}
                {isKomisyenOrder && <th className="p-3 text-center">Bundle</th>}
                <th className="p-3 text-center">Slip</th>
              </tr>
            </thead>
            <tbody>
              {salaryRows.map((r) => (
                <tr key={r.idStaff} className="border-t border-border hover:bg-muted/30">
                  {columns.map((c) => (
                    <td key={c.key} className={`p-3 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{c.cell(r)}</td>
                  ))}
                  {isKomisyenOrder && (
                    <td className="p-3 text-center">
                      <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => openBundles(r)} title="Lihat komisyen ikut bundle">
                        <Package className="w-3.5 h-3.5" /> Bundle
                      </Button>
                    </td>
                  )}
                  <td className="p-3 text-center">
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => openSlip(r)} title="Slip Invoice">
                      <FileText className="w-3.5 h-3.5" /> Slip
                    </Button>
                  </td>
                </tr>
              ))}
              {salaryRows.length === 0 && (
                <tr><td colSpan={(columns.length || 1) + 1 + (isKomisyenOrder ? 1 : 0)} className="p-6 text-center text-muted-foreground">Tiada staf untuk dikira.</td></tr>
              )}
            </tbody>
            {salaryRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                  {columns.map((c, idx) => (
                    <td key={c.key} className={`p-3 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                      {idx === 0 ? 'TOTAL' : (c.total ?? '')}
                    </td>
                  ))}
                  {isKomisyenOrder && <td className="p-3"></td>}
                  <td className="p-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Bundle breakdown modal (Komisyen Order) — bundles, click to see orders */}
      <Dialog open={!!bundleModal} onOpenChange={(o) => { if (!o) setBundleModal(null); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" /> Komisyen ikut Bundle — {bundleModal?.name} <span className="font-mono text-sm text-muted-foreground">({bundleModal?.idStaff})</span>
            </DialogTitle>
          </DialogHeader>
          {bundleLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
          ) : (bundleGroups && bundleGroups.length > 0) ? (
            <div className="overflow-y-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-2.5 text-left">Bundle</th>
                    <th className="p-2.5 text-right">Kuantiti</th>
                    <th className="p-2.5 text-right">Komisyen</th>
                    <th className="p-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {bundleGroups.map((g) => {
                    const key = `${g.name}|${g.sku}`;
                    const open = openBundleKey === key;
                    return (
                      <React.Fragment key={key}>
                        <tr className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setOpenBundleKey(open ? null : key)}>
                          <td className="p-2.5"><b>{g.name}</b>{g.sku ? <span className="text-muted-foreground"> ({g.sku})</span> : ''}</td>
                          <td className="p-2.5 text-right tabular-nums">{g.orders.length}</td>
                          <td className="p-2.5 text-right tabular-nums font-semibold text-primary">RM {formatNumber(g.sum)}</td>
                          <td className="p-2.5 text-muted-foreground">{open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                        </tr>
                        {open && (
                          <tr className="bg-muted/20">
                            <td colSpan={4} className="p-0">
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground">
                                      <th className="p-2 text-left">ID Order</th>
                                      <th className="p-2 text-left">Tarikh</th>
                                      <th className="p-2 text-left">Produk</th>
                                      <th className="p-2 text-left">Nama</th>
                                      <th className="p-2 text-left">Telefon</th>
                                      <th className="p-2 text-left">Tracking</th>
                                      <th className="p-2 text-right">Komisyen</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {g.orders.map((o, i) => (
                                      <tr key={i} className="border-t border-border/60">
                                        <td className="p-2 font-mono">{o.id}</td>
                                        <td className="p-2 whitespace-nowrap">{o.date}</td>
                                        <td className="p-2">{o.product}</td>
                                        <td className="p-2">{o.name}</td>
                                        <td className="p-2">{o.phone}</td>
                                        <td className="p-2 font-mono">{o.tracking}</td>
                                        <td className="p-2 text-right tabular-nums">RM {formatNumber(o.komisyen)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                    <td className="p-2.5">TOTAL</td>
                    <td className="p-2.5 text-right tabular-nums">{bundleGroups.reduce((s, g) => s + g.orders.length, 0)}</td>
                    <td className="p-2.5 text-right tabular-nums text-primary">RM {formatNumber(bundleGroups.reduce((s, g) => s + g.sum, 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">Tiada order layak untuk tempoh ini.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountSalary;
