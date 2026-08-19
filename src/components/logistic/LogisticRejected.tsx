import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Ban, Loader2, Search, Calendar, Receipt, ExternalLink, RotateCcw } from "lucide-react";
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, formatRM } from "@/lib/utils";
import { useTeam } from "@/hooks/useTeam";
import { TeamFilter } from "@/components/TeamFilter";
import { TablePagination } from "@/components/TablePagination";
import { toast } from "sonner";
import Swal from "sweetalert2";

const LogisticRejected = () => {
  const queryClient = useQueryClient();
  const { nameByIdstaff } = useTeam();
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  const [viewingPayment, setViewingPayment] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isReverting, setIsReverting] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["logistic-rejected", startDate, endDate],
    queryFn: async () => {
      let q = supabase
        .from("customer_purchases")
        .select("*, bundle:logistic_bundles(name)")
        .eq("delivery_status", "Rejected")
        .order("date_processed", { ascending: false });
      if (startDate) q = q.gte("date_order", startDate);
      if (endDate) q = q.lte("date_order", endDate);
      const { data, error } = await q.range(0, 49999);
      if (error) throw error;
      return data || [];
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
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/40"><Ban className="w-6 h-6" /></span>
        <div>
          <h1 className="text-2xl font-bold">Rejected</h1>
          <p className="text-muted-foreground text-sm">Order yang ditolak oleh logistik (cth: resit palsu / order mencurigakan).</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl">
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Ban className="w-6 h-6 text-red-500" /><div><p className="text-xl font-bold">{filtered.length}</p><p className="text-xs text-muted-foreground">Total Rejected</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Receipt className="w-6 h-6 text-emerald-600" /><div><p className="text-xl font-bold">RM {totalSales.toFixed(2)}</p><p className="text-xs text-muted-foreground">Total Sales</p></div></div></CardContent></Card>
      </div>

      {/* Filters */}
      <Card><CardContent className="p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="w-4 h-4" /><span className="text-sm font-medium text-foreground">Tarikh Order:</span></div>
          <div><label className="block text-xs text-muted-foreground mb-1">Dari</label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" /></div>
          <div><label className="block text-xs text-muted-foreground mb-1">Hingga</label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" /></div>
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama / phone / id sale" className="pl-9 w-56" /></div>
          <div className="flex items-end pb-0.5"><TeamFilter value={teamFilter} onChange={setTeamFilter} /></div>
          <div className="flex-1" />
          <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" onClick={handleRevert} disabled={selected.size === 0 || isReverting}>
            {isReverting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />} Kembali ke Pending ({selected.size})
          </Button>
        </div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
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
                  <tr key={o.id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-2"><Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggle(o.id)} /></td>
                    <td className="p-2">{(page - 1) * pageSize + i + 1}</td>
                    <td className="p-2 font-mono text-blue-600 dark:text-blue-400 whitespace-nowrap">{o.marketer_id_staff || "-"}</td>
                    <td className="p-2 whitespace-nowrap">{nameByIdstaff.get(o.marketer_id_staff || "") || "-"}</td>
                    <td className="p-2 whitespace-nowrap">{o.id_sale || "-"}</td>
                    <td className="p-2 whitespace-nowrap">{o.date_order || "-"}</td>
                    <td className="p-2">{o.name_customer || "-"}</td>
                    <td className="p-2 whitespace-nowrap">{o.phone_customer || "-"}</td>
                    <td className="p-2">{o.bundle?.name || "-"}</td>
                    <td className="p-2 whitespace-nowrap">{o.kurier || "-"}</td>
                    <td className="p-2 text-right tabular-nums">{formatRM(Number(o.total_sale) || 0)}</td>
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
                  <tr><td colSpan={14} className="text-center py-12 text-muted-foreground">Tiada order rejected dalam tempoh ini.</td></tr>
                )}
              </tbody>
            </table>
            <TablePagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
          </div>
        )}
      </CardContent></Card>

      {/* Detail Bayaran viewer */}
      <Dialog open={!!viewingPayment} onOpenChange={(o) => { if (!o) setViewingPayment(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Receipt className="w-5 h-5 text-primary" /> Detail Bayaran — {viewingPayment?.id_sale || ""}</DialogTitle></DialogHeader>
          {viewingPayment && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Cara Bayaran:</span> <b>{viewingPayment.type_payment || "-"}</b></div>
                <div><span className="text-muted-foreground">Jumlah:</span> <b>RM {(Number(viewingPayment.total_sale) || 0).toFixed(2)}</b></div>
                <div><span className="text-muted-foreground">Bank:</span> <b>{viewingPayment.bank_payment || "-"}</b></div>
                <div><span className="text-muted-foreground">Tarikh Bayar:</span> <b>{viewingPayment.date_payment || "-"}</b></div>
              </div>
              {viewingPayment.receipt_payment_url ? (
                (viewingPayment.receipt_payment_type === "link" || !String(viewingPayment.receipt_payment_url).includes("vercel-storage.com")) ? (
                  <Button variant="outline" className="w-full" onClick={() => window.open(viewingPayment.receipt_payment_url, "_blank")}><ExternalLink className="w-4 h-4 mr-2" /> Buka link resit</Button>
                ) : (
                  <div className="space-y-2">
                    <img src={viewingPayment.receipt_payment_url} alt="Resit" className="w-full rounded-lg border border-border max-h-[60vh] object-contain bg-muted" />
                    <Button variant="outline" className="w-full" onClick={() => window.open(viewingPayment.receipt_payment_url, "_blank")}><ExternalLink className="w-4 h-4 mr-2" /> Buka dalam tab baharu</Button>
                  </div>
                )
              ) : (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-amber-700 dark:text-amber-400 text-xs flex items-center gap-2"><Ban className="w-4 h-4" /> Tiada resit dimuat naik.</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LogisticRejected;
