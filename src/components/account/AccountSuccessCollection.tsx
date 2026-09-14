import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/hooks/useTeam";
import { TeamFilter } from "@/components/TeamFilter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, fetchAllRows, formatRM, formatDMY } from "@/lib/utils";
import { TablePagination } from "@/components/TablePagination";
import { Wallet, Loader2, Search, Filter, RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const PAGE_SIZE_OPTIONS = [10, 50, 100];

// Normalise a stored kurier to its base courier for grouping + filtering.
const baseCourier = (kurier?: string | null): string => {
  const k = (kurier || "").toLowerCase();
  if (k.includes("poslaju")) return "Poslaju";
  if (k.includes("ninjavan")) return "Ninjavan";
  if (k.includes("jnt")) return "JNT";
  if (k.includes("dhl")) return "DHL";
  if (k.includes("spx")) return "SPX";
  if (k.includes("tiktok")) return "Tiktok";
  return kurier?.trim() || "Lain";
};

// Success COD Collection = COD orders that ParcelDaily has REMITTED to the seller
// (delivery_status Success + date_payment stamped by the COD_REMITTED webhook).
// The mirror of Pending COD Collection (which is date_payment NULL).
const AccountSuccessCollection = () => {
  const firstDay = getMalaysiaStartOfMonth();
  const lastDay = getMalaysiaEndOfMonth();

  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const { nameByIdstaff } = useTeam();
  const [pendingStart, setPendingStart] = useState(firstDay);
  const [pendingEnd, setPendingEnd] = useState(lastDay);
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ["account-success-collection", startDate, endDate],
    queryFn: async () => {
      const data = await fetchAllRows(() => {
        let query = supabase
          .from("customer_purchases")
          .select(`*, bundle:logistic_bundles(name, sku)`)
          .eq("delivery_status", "Success")
          .eq("type_payment", "COD")
          .not("date_payment", "is", null)
          .order("date_payment", { ascending: false });
        if (startDate) query = query.gte("date_order", startDate);
        if (endDate) query = query.lte("date_order", endDate);
        return query;
      });
      return data || [];
    },
  });

  const getPlatform = (o: any): string => o.jenis_platform || "Manual";

  // Base set — team/platform/search only (box totals compute from this).
  const baseOrders = orders.filter((o: any) => {
    if (teamFilter && (o.marketer_id_staff || "") !== teamFilter) return false;
    if (platformFilter !== "all" && getPlatform(o) !== platformFilter) return false;
    if (search.trim()) {
      const terms = search.toLowerCase().split("+").map((s) => s.trim()).filter(Boolean);
      const ok = terms.every((t) =>
        o.name_customer?.toLowerCase().includes(t) ||
        o.phone_customer?.toLowerCase().includes(t) ||
        o.tracking_number?.toLowerCase().includes(t) ||
        o.bundle?.name?.toLowerCase().includes(t) ||
        o.address_customer?.toLowerCase().includes(t)
      );
      if (!ok) return false;
    }
    return true;
  });

  // Displayed set — base + clickable courier box filter.
  const filteredOrders = baseOrders.filter((o: any) =>
    courierFilter === "all" || baseCourier(o.kurier) === courierFilter
  );

  const effectivePageSize = pageSize === 0 ? filteredOrders.length || 1 : pageSize;
  const paginatedOrders = pageSize === 0
    ? filteredOrders
    : filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totalRemitted = baseOrders.reduce((s: number, o: any) => s + (Number(o.total_sale) || 0), 0);

  // Breakdown by Kurier, sorted by volume.
  const courierMap = new Map<string, any[]>();
  baseOrders.forEach((o: any) => {
    const c = baseCourier(o.kurier);
    if (!courierMap.has(c)) courierMap.set(c, []);
    courierMap.get(c)!.push(o);
  });
  const courierStats = Array.from(courierMap.entries())
    .map(([name, arr]) => ({
      name,
      total: arr.length,
      sales: arr.reduce((s: number, o: any) => s + (Number(o.total_sale) || 0), 0),
    }))
    .sort((a, b) => b.total - a.total);

  const handleFilterChange = () => setCurrentPage(1);
  const applyDateFilter = () => { setStartDate(pendingStart); setEndDate(pendingEnd); handleFilterChange(); };
  const handleSync = async () => { setIsSyncing(true); try { await refetch(); toast.success("Synced"); } finally { setIsSyncing(false); } };

  const handleExport = () => {
    if (filteredOrders.length === 0) { toast.error("No data to export"); return; }
    const rows = filteredOrders.map((o: any, i: number) => ({
      "No": i + 1,
      "Id Sales": o.id_sale || "-",
      "Tarikh Order": o.date_order || "-",
      "Tarikh Remit": o.date_payment || "-",
      "Sumber": o.cod_remit_manual ? "Manual" : "Auto",
      "Nama Pelanggan": o.name_customer || "-",
      "Phone": o.phone_customer || "-",
      "Produk": o.bundle?.name || o.nota_staff || "-",
      "Unit": o.unit || 1,
      "Kurier": o.kurier || "-",
      "Tracking": o.tracking_number || "-",
      "Total (RM)": Number(o.total_sale || 0).toFixed(2),
      "Jenis Platform": getPlatform(o),
      "Negeri": o.state_customer || "-",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Success Collection");
    XLSX.writeFile(wb, `Success_COD_Collection_${startDate}_${endDate}.xlsx`);
    toast.success(`Exported ${rows.length} orders`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Success COD Collection</h1>
          <p className="text-muted-foreground mt-2">COD delivered and remitted to your account by ParcelDaily</p>
        </div>
        <Button variant="outline" onClick={handleSync} disabled={isSyncing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
          Sync
        </Button>
      </div>

      {/* Total + by-Kurier (clickable) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          onClick={() => { setCourierFilter("all"); handleFilterChange(); }}
          className={`cursor-pointer transition-all ${courierFilter === "all" ? "ring-2 ring-primary" : "hover:border-primary/60 hover:shadow-sm"}`}
        >
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Wallet className="w-8 h-8 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold">{baseOrders.length}</p>
                <p className="text-sm text-muted-foreground">Total Remitted (COD)</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">RM {formatRM(totalRemitted)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {courierStats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {courierStats.map((cs) => (
            <Card
              key={cs.name}
              onClick={() => { setCourierFilter(courierFilter === cs.name ? "all" : cs.name); handleFilterChange(); }}
              className={`cursor-pointer transition-all ${courierFilter === cs.name ? "ring-2 ring-primary" : "hover:shadow-sm"} ${cs.total > 0 ? "border-l-4 border-l-emerald-500" : ""}`}
            >
              <CardContent className="p-4">
                <p className="text-sm font-semibold">{cs.name}</p>
                <p className="text-xl font-bold">{cs.total}</p>
                <p className="mt-1 text-xs text-muted-foreground">RM {formatRM(cs.sales)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search name / phone / tracking..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); handleFilterChange(); }}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Input type="date" value={pendingStart} onChange={(e) => setPendingStart(e.target.value)} className="w-40" />
              <Input type="date" value={pendingEnd} onChange={(e) => setPendingEnd(e.target.value)} className="w-40" />
              <Button size="sm" onClick={applyDateFilter}><Filter className="w-4 h-4 mr-1" /> Apply</Button>
            </div>
            <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); handleFilterChange(); }}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Platform" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platform</SelectItem>
                <SelectItem value="Facebook">Facebook</SelectItem>
                <SelectItem value="Threads">Threads</SelectItem>
                <SelectItem value="Tiktok">TikTok</SelectItem>
                <SelectItem value="Database">Database</SelectItem>
                <SelectItem value="Google">Google</SelectItem>
              </SelectContent>
            </Select>
            <TeamFilter value={teamFilter} onChange={(v) => { setTeamFilter(v); handleFilterChange(); }} />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
              <Select value={pageSize === 0 ? "all" : pageSize.toString()} onValueChange={(v) => { setPageSize(v === "all" ? 0 : Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((s) => <SelectItem key={s} value={s.toString()}>{s}</SelectItem>)}
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={handleExport}><Download className="w-4 h-4 mr-2" /> Export Excel</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-3 text-left">No</th>
                      <th className="p-3 text-left text-blue-600 dark:text-blue-400">ID Staff</th>
                      <th className="p-3 text-left text-blue-600 dark:text-blue-400">Nama</th>
                      <th className="p-3 text-left">Id Sales</th>
                      <th className="p-3 text-left">Tarikh Order</th>
                      <th className="p-3 text-left">Tarikh Remit</th>
                      <th className="p-3 text-left">Sumber</th>
                      <th className="p-3 text-left">Nama Pelanggan</th>
                      <th className="p-3 text-left">Phone</th>
                      <th className="p-3 text-left">Produk</th>
                      <th className="p-3 text-left">Unit</th>
                      <th className="p-3 text-left">Kurier</th>
                      <th className="p-3 text-left">Tracking</th>
                      <th className="p-3 text-right">Total (RM)</th>
                      <th className="p-3 text-left">Jenis Platform</th>
                      <th className="p-3 text-left">Negeri</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.length > 0 ? (
                      paginatedOrders.map((o: any, i: number) => (
                        <tr key={o.id} className="border-b hover:bg-muted/30">
                          <td className="p-3">{(currentPage - 1) * effectivePageSize + i + 1}</td>
                          <td className="p-3 whitespace-nowrap font-mono text-blue-600 dark:text-blue-400">{o.marketer_id_staff || "-"}</td>
                          <td className="p-3 whitespace-nowrap">{nameByIdstaff.get(o.marketer_id_staff || "") || "-"}</td>
                          <td className="p-3 whitespace-nowrap">{o.id_sale || "-"}</td>
                          <td className="p-3 whitespace-nowrap">{formatDMY(o.date_order)}</td>
                          <td className="p-3 whitespace-nowrap text-emerald-600 dark:text-emerald-400">{formatDMY(o.date_payment)}</td>
                          <td className="p-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${o.cod_remit_manual ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                              {o.cod_remit_manual ? "Manual" : "Auto"}
                            </span>
                          </td>
                          <td className="p-3">{o.name_customer || "-"}</td>
                          <td className="p-3 whitespace-nowrap">{o.phone_customer || "-"}</td>
                          <td className="p-3"><span className="truncate max-w-[150px] block">{o.bundle?.name || o.nota_staff || "-"}</span></td>
                          <td className="p-3">{o.unit || 1}</td>
                          <td className="p-3 whitespace-nowrap">{o.kurier || "-"}</td>
                          <td className="p-3 whitespace-nowrap"><span className="font-mono text-xs">{o.tracking_number || "-"}</span></td>
                          <td className="p-3 text-right whitespace-nowrap tabular-nums">RM {formatRM(Number(o.total_sale) || 0)}</td>
                          <td className="p-3 text-xs">{o.jenis_platform || "-"}</td>
                          <td className="p-3 text-xs">{o.state_customer || "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={16} className="text-center py-12 text-muted-foreground">No remitted COD orders found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <TablePagination
                page={currentPage}
                pageSize={pageSize === 0 ? (filteredOrders.length || 1) : pageSize}
                total={filteredOrders.length}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountSuccessCollection;
