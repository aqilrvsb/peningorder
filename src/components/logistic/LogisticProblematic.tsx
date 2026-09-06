import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/hooks/useTeam";
import { TeamFilter } from "@/components/TeamFilter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, getMalaysiaDate, fetchAllRows } from "@/lib/utils";
import { TablePagination } from "@/components/TablePagination";
import { AlertTriangle, Loader2, Search, Filter, RefreshCw, MessageCircle, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

// A parcel is "Problematic" (ParcelDaily's "Problematic Processing" group) when its
// tracking status signals a failed pickup / failed delivery / customer refusal —
// i.e. it is heading toward Return but has NOT been returned/delivered yet.
const PROBLEM_RE = /fail|refuse|reject|does not want to accept|unsuccessful|unattempt|not able/i;
const isProblemStatus = (seos?: string | null) => !!seos && PROBLEM_RE.test(seos);

const LogisticProblematic = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const { nameByIdstaff } = useTeam();
  const [pendingStart, setPendingStart] = useState(getMalaysiaStartOfMonth());
  const [pendingEnd, setPendingEnd] = useState(getMalaysiaEndOfMonth());
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ["logistic-problematic", startDate, endDate],
    queryFn: async () => {
      const data = await fetchAllRows(() => {
        let query = supabase
          .from("customer_purchases")
          .select(`*, bundle:logistic_bundles(name, sku)`)
          .in("delivery_status", ["Pending", "Shipped"]) // not yet Return/Success
          .order("date_order", { ascending: false });
        if (startDate) query = query.gte("date_order", startDate);
        if (endDate) query = query.lte("date_order", endDate);
        return query;
      });
      // Keep only the problematic tracking statuses.
      return (data || []).filter((o: any) => isProblemStatus(o.seos));
    },
  });

  const filteredOrders = orders.filter((order: any) => {
    if (teamFilter && (order.marketer_id_staff || "") !== teamFilter) return false;
    if (search.trim()) {
      const terms = search.toLowerCase().split("+").map((s) => s.trim()).filter(Boolean);
      const ok = terms.every((t) =>
        order.name_customer?.toLowerCase().includes(t) ||
        order.phone_customer?.toLowerCase().includes(t) ||
        order.tracking_number?.toLowerCase().includes(t) ||
        order.bundle?.name?.toLowerCase().includes(t) ||
        order.seos?.toLowerCase().includes(t)
      );
      if (!ok) return false;
    }
    return true;
  });

  const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const counts = {
    total: filteredOrders.length,
    cod: filteredOrders.filter((o: any) => o.type_payment === "COD").length,
    totalSales: filteredOrders.reduce((s: number, o: any) => s + (Number(o.total_sale) || 0), 0),
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try { await refetch(); toast.success("Synced"); } finally { setIsSyncing(false); }
  };

  const applyDateFilter = () => {
    setStartDate(pendingStart);
    setEndDate(pendingEnd);
    setCurrentPage(1);
  };

  // Resolve a problematic order to a final outcome.
  const handleResolve = async (order: any, status: "Success" | "Return") => {
    if (!window.confirm(`Tandakan order ini sebagai ${status}?`)) return;
    setUpdatingId(order.id);
    try {
      const payload: Record<string, any> = status === "Success"
        ? { delivery_status: "Success", seo: "Successful Delivery", seos: "Successful Delivery" }
        : { delivery_status: "Return", seos: "Return", date_return: getMalaysiaDate() };
      const { error } = await supabase.from("customer_purchases").update(payload).eq("id", order.id);
      if (error) throw error;
      toast.success(`Order ditanda ${status}`);
      queryClient.invalidateQueries({ queryKey: ["logistic-problematic"] });
    } catch (e: any) {
      toast.error(e.message || "Gagal kemaskini");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><AlertTriangle className="w-7 h-7 text-amber-500" /> Problematik</h1>
          <p className="text-muted-foreground mt-2">Order bermasalah (hampir Return) — gagal pickup / gagal hantar / customer enggan terima</p>
        </div>
        <Button variant="outline" onClick={handleSync} disabled={isSyncing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} /> Sync
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">{counts.total}</p>
              <p className="text-sm text-muted-foreground">Order Bermasalah</p>
              <p className="text-xs text-orange-600 mt-1">{counts.cod} COD</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-6">
          <div className="flex items-center gap-3">
            <RotateCcw className="w-8 h-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">RM {counts.totalSales.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">Nilai Berisiko</p>
            </div>
          </div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <Card><CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search... (use + to combine)" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="pl-10" />
          </div>
          <TeamFilter value={teamFilter} onChange={(v) => { setTeamFilter(v); setCurrentPage(1); }} />
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={pendingStart} onChange={(e) => setPendingStart(e.target.value)} className="w-40" />
            <Input type="date" value={pendingEnd} onChange={(e) => setPendingEnd(e.target.value)} className="w-40" />
            <Button onClick={applyDateFilter}><Filter className="w-4 h-4 mr-2" /> Apply</Button>
          </div>
        </div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left">No</th>
                    <th className="p-2 text-left text-blue-600 dark:text-blue-400">ID Staff</th>
                    <th className="p-2 text-left text-blue-600 dark:text-blue-400">Nama</th>
                    <th className="p-2 text-left">Tarikh Order</th>
                    <th className="p-2 text-left">Nama Pelanggan</th>
                    <th className="p-2 text-left">Phone</th>
                    <th className="p-2 text-left">Produk</th>
                    <th className="p-2 text-left">Kurier</th>
                    <th className="p-2 text-left">Tracking</th>
                    <th className="p-2 text-left">Total Sales</th>
                    <th className="p-2 text-left">Bayaran</th>
                    <th className="p-2 text-left">Status Masalah</th>
                    <th className="p-2 text-left">Negeri</th>
                    <th className="p-2 text-left">WhatsApp</th>
                    <th className="p-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.length > 0 ? (
                    paginatedOrders.map((order: any, index: number) => (
                      <tr key={order.id} className="border-b hover:bg-muted/30">
                        <td className="p-2">{(currentPage - 1) * pageSize + index + 1}</td>
                        <td className="p-2 whitespace-nowrap font-mono text-blue-600 dark:text-blue-400">{order.marketer_id_staff || "-"}</td>
                        <td className="p-2 whitespace-nowrap">{nameByIdstaff.get(order.marketer_id_staff || "") || "-"}</td>
                        <td className="p-2 whitespace-nowrap">{order.date_order || "-"}</td>
                        <td className="p-2">{order.name_customer || "-"}</td>
                        <td className="p-2 whitespace-nowrap">{order.phone_customer || "-"}</td>
                        <td className="p-2"><span className="truncate max-w-[150px] block">{order.bundle?.name || order.nota_staff || "-"}</span></td>
                        <td className="p-2 whitespace-nowrap">{order.kurier || "-"}</td>
                        <td className="p-2 whitespace-nowrap"><span className="font-mono text-xs">{order.tracking_number || "-"}</span></td>
                        <td className="p-2 whitespace-nowrap">RM {Number(order.total_sale || 0).toFixed(2)}</td>
                        <td className="p-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${order.type_payment === "COD" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>{order.type_payment || "-"}</span>
                        </td>
                        <td className="p-2">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">{order.seos || "-"}</span>
                        </td>
                        <td className="p-2 text-xs">{order.state_customer || "-"}</td>
                        <td className="p-2">
                          {order.phone_customer && (
                            <a href={`https://wa.me/6${(order.phone_customer || "").replace(/^0/, "").replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-7 h-7 bg-green-500 hover:bg-green-600 text-white rounded">
                              <MessageCircle className="w-4 h-4" />
                            </a>
                          )}
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50 h-7 px-2 text-xs" disabled={updatingId === order.id} onClick={() => handleResolve(order, "Success")}>
                              {updatingId === order.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />} Success
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 h-7 px-2 text-xs" disabled={updatingId === order.id} onClick={() => handleResolve(order, "Return")}>
                              <RotateCcw className="w-3 h-3 mr-1" /> Return
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={15} className="text-center py-12 text-muted-foreground">Tiada order bermasalah. 🎉</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination page={currentPage} pageSize={pageSize} total={filteredOrders.length} onPageChange={setCurrentPage} />
          </>
        )}
      </CardContent></Card>
    </div>
  );
};

export default LogisticProblematic;
