import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Ban, Loader2, Search, Calendar, Receipt, ExternalLink, RotateCcw } from "lucide-react";
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, formatRM, formatDMY, fetchAllRows } from "@/lib/utils";
import { useTeam } from "@/hooks/useTeam";
import { TeamFilter } from "@/components/TeamFilter";
import { TablePagination } from "@/components/TablePagination";
import { toast } from "sonner";
import Swal from "sweetalert2";
import { ReceiptViewer } from "@/components/ReceiptViewer";
import DateApplyButton from '@/components/DateApplyButton';
import UnappliedDateNote from '@/components/UnappliedDateNote';
import { PageHeader, StatCard, IconTile, TableSkeleton, EmptyState } from '@/components/common/SoftUI';

const LogisticRejected = () => {
  const queryClient = useQueryClient();
  const { nameByIdstaff } = useTeam();
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  // Picked dates; the data follows startDate/endDate, which only change on Filter.
  const [pendingStart, setPendingStart] = useState(startDate);
  const [pendingEnd, setPendingEnd] = useState(endDate);
  const applyDates = () => { setStartDate(pendingStart); setEndDate(pendingEnd); };
  const [viewingPayment, setViewingPayment] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isReverting, setIsReverting] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["logistic-rejected", startDate, endDate],
    queryFn: async () => {
      // Paginated: PostgREST caps a single response at max_rows (1000) no matter
      // the requested range, so page through every row.
      const build = () => {
        let q = supabase
          .from("customer_purchases")
          .select("*, bundle:logistic_bundles(name)")
          .eq("delivery_status", "Rejected")
          .order("date_processed", { ascending: false });
        if (startDate) q = q.gte("date_order", startDate);
        if (endDate) q = q.lte("date_order", endDate);
        return q;
      };
      return await fetchAllRows(build);
    },
  });

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return orders.filter((o: any) => {
      if (teamFilter && (o.marketer_id_staff || "") !== teamFilter) return false;
      if (!term) return true;
      return (
        (o.name_customer || "").toLowerCase().includes(term) ||
        (o.phone_customer || "").includes(search) ||
        (o.id_sale || "").toLowerCase().includes(term) ||
        (o.tracking_number || "").toLowerCase().includes(term)
      );
    });
  }, [orders, teamFilter, search]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, teamFilter, startDate, endDate]);

  const totalSales = useMemo(() => filtered.reduce((s: number, o: any) => s + (Number(o.total_sale) || 0), 0), [filtered]);
  const allSelected = filtered.length > 0 && filtered.every((o: any) => selected.has(o.id));

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((o: any) => o.id)));

  // Send a wrongly-rejected order back to the Order tab (Pending).
  const handleRevert = async () => {
    if (selected.size === 0) { toast.error("Pilih order dahulu"); return; }
    const { isConfirmed } = await Swal.fire({
      title: `Kembalikan ${selected.size} order ke Pending?`,
      text: "Order akan muncul semula di tab Order.",
      showCancelButton: true, confirmButtonText: "Ya, kembalikan", cancelButtonText: "Batal",
    });
    if (!isConfirmed) return;
    setIsReverting(true);
    try {
      await Promise.all(Array.from(selected).map((id) =>
        supabase.from("customer_purchases").update({ delivery_status: "Pending", date_processed: null }).eq("id", id)
      ));
      toast.success(`${selected.size} order dikembalikan ke Pending`);
      queryClient.invalidateQueries({ queryKey: ["logistic-rejected"] });
      queryClient.invalidateQueries({ queryKey: ["logistic-order"] });
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e.message || "Gagal");
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rejected"
        description="Order yang ditolak oleh logistik (cth: resit palsu / order mencurigakan)."
        icon={Ban}
        tone="brand"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:max-w-2xl">
        <StatCard icon={Ban} tone="red" label="Total Rejected" value={filtered.length} />
        <StatCard icon={Receipt} tone="green" label="Total Sales" value={<span className="block whitespace-normal break-words">RM {totalSales.toFixed(2)}</span>} />
      </div>

      {/* Filters */}
      <Card><CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex items-center gap-2 text-muted-foreground sm:h-10"><Calendar className="w-4 h-4" /><span className="text-sm font-medium text-foreground">Tarikh Order:</span></div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
            <div><label className="section-label mb-1 block">Dari</label><Input type="date" value={pendingStart} onChange={(e) => setPendingStart(e.target.value)} className="w-full sm:w-40" /></div>
            <div><label className="section-label mb-1 block">Hingga</label><Input type="date" value={pendingEnd} onChange={(e) => setPendingEnd(e.target.value)} className="w-full sm:w-40" /></div>
          </div>
          <div className="flex flex-wrap items-center gap-2"><DateApplyButton onClick={applyDates} /><UnappliedDateNote pendingStart={pendingStart} pendingEnd={pendingEnd} startDate={startDate} endDate={endDate} /></div>
          <div className="relative w-full sm:w-56"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama / phone / id sale" className="pl-9 w-full" /></div>
          <TeamFilter value={teamFilter} onChange={setTeamFilter} />
          <Button variant="outline" className="h-10 w-full border-amber-300 text-amber-700 hover:bg-amber-50 sm:ml-auto sm:w-auto" onClick={handleRevert} disabled={selected.size === 0 || isReverting}>
            {isReverting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />} Kembali ke Pending ({selected.size})
          </Button>
        </div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-0">
        {isLoading ? (
          <TableSkeleton className="p-4" rows={8} cols={6} />
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40"><tr>
                <th className="p-2 text-left w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                <th className="p-2 text-left">No</th>
                <th className="p-2 text-left text-blue-600 dark:text-blue-400">ID Staff</th>
                <th className="p-2 text-left text-blue-600 dark:text-blue-400">Nama</th>
                <th className="p-2 text-left">Id Sales</th>
                <th className="p-2 text-left">Tarikh Order</th>
                <th className="p-2 text-left">Pelanggan</th>
                <th className="p-2 text-left">Phone</th>
                <th className="p-2 text-left">Produk</th>
                <th className="p-2 text-left">Kurier</th>
                <th className="p-2 text-right">Total (RM)</th>
                <th className="p-2 text-left">Cara Bayaran</th>
                <th className="p-2 text-left">Detail Bayaran</th>
                <th className="p-2 text-left">Sebab / Nota</th>
              </tr></thead>
              <tbody>
                {paged.map((o: any, i: number) => (
                  <tr key={o.id} className="border-t border-border transition-colors hover:bg-muted/40">
                    <td className="p-2"><Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggle(o.id)} /></td>
                    <td className="p-2">{(page - 1) * pageSize + i + 1}</td>
                    <td className="p-2 font-mono text-blue-600 dark:text-blue-400 whitespace-nowrap">{o.marketer_id_staff || "-"}</td>
                    <td className="p-2 whitespace-nowrap">{nameByIdstaff.get(o.marketer_id_staff || "") || "-"}</td>
                    <td className="p-2 whitespace-nowrap">{o.id_sale || "-"}</td>
                    <td className="p-2 whitespace-nowrap">{formatDMY(o.date_order)}</td>
                    <td className="p-2">{o.name_customer || "-"}</td>
                    <td className="p-2 whitespace-nowrap">{o.phone_customer || "-"}</td>
                    <td className="p-2">{o.bundle?.name || "-"}</td>
                    <td className="p-2 whitespace-nowrap">{o.kurier || "-"}</td>
                    <td className="p-2 text-right tabular-nums whitespace-nowrap">{formatRM(Number(o.total_sale) || 0)}</td>
                    <td className="p-2">{o.type_payment || "-"}</td>
                    <td className="p-2 whitespace-nowrap">
                      {(o.type_payment === "CASH" || o.type_payment === "Pickup")
                        ? <Button size="sm" variant="outline" className="h-7" onClick={() => setViewingPayment(o)}><Receipt className="w-3.5 h-3.5 mr-1" />Lihat</Button>
                        : <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="p-2 text-xs text-rose-600 dark:text-rose-400 max-w-[220px] truncate" title={o.nota_staff || ""}>{o.nota_staff || "-"}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={14} className="p-0"><EmptyState icon={Ban} title="Tiada order rejected dalam tempoh ini." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
          </>
        )}
      </CardContent></Card>

      {/* Detail Bayaran viewer */}
      <Dialog open={!!viewingPayment} onOpenChange={(o) => { if (!o) setViewingPayment(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><IconTile icon={Receipt} tone="green" size="sm" /> Detail Bayaran — {viewingPayment?.id_sale || ""}</DialogTitle></DialogHeader>
          {viewingPayment && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-3">
                <div><p className="section-label">Cara Bayaran</p><p className="mt-0.5 font-semibold">{viewingPayment.type_payment || "-"}</p></div>
                <div><p className="section-label">Jumlah</p><p className="mt-0.5 whitespace-nowrap font-semibold">RM {(Number(viewingPayment.total_sale) || 0).toFixed(2)}</p></div>
                <div><p className="section-label">Bank</p><p className="mt-0.5 font-semibold">{viewingPayment.bank_payment || "-"}</p></div>
                <div><p className="section-label">Tarikh Bayar</p><p className="mt-0.5 whitespace-nowrap font-semibold">{formatDMY(viewingPayment.date_payment)}</p></div>
              </div>
              <ReceiptViewer url={viewingPayment.receipt_payment_url} type={viewingPayment.receipt_payment_type} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LogisticRejected;
