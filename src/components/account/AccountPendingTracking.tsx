import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { TeamFilter } from "@/components/TeamFilter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, getMalaysiaDate, fetchAllRows, formatDMY } from "@/lib/utils";
import { TablePagination } from "@/components/TablePagination";
import {
  Clock,
  Loader2,
  Printer,
  Search,
  Wallet,
  RotateCcw,
  Download,
  Filter,
  RefreshCw,
  AlertTriangle,
  DollarSign,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import UnappliedDateNote from '@/components/UnappliedDateNote';
import { PageHeader, StatCard, TableSkeleton, EmptyState, MissingHint } from '@/components/common/SoftUI';
const PAGE_SIZE_OPTIONS = [10, 50, 100];
// Stat cards: stack the icon above the value on phones so labels / RM hints aren't cut off.
const STACK_CARD = 'flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3';

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

const AccountPendingTracking = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const firstDay = getMalaysiaStartOfMonth();
  const lastDay = getMalaysiaEndOfMonth();

  // Filter states
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState('');
  const { nameByIdstaff } = useTeam();
  const [pendingStart, setPendingStart] = useState(firstDay);
  const [pendingEnd, setPendingEnd] = useState(lastDay);
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);
  const [platformFilter, setPlatformFilter] = useState("all");
  // Clickable summary-box filters (compose on top of team/search/date).
  const [courierFilter, setCourierFilter] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [trackingSearch, setTrackingSearch] = useState("");

  // Selection state
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  // Loading states
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Return dialog state
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnOrderId, setReturnOrderId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [isReturning, setIsReturning] = useState(false);

  // Fetch all profiles for marketer name lookup
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("username, full_name, whatsapp_number");
      if (error) throw error;
      return data || [];
    },
  });
  const profilesMap = new Map(profiles.map((p: any) => [p.username, p.full_name]));

  // Helper to determine platform name for an order
  const getOrderPlatformName = (order: any): string => {
    if (order.jenis_platform) return order.jenis_platform;
    return "Manual";
  };

  // Fetch pending COD collection orders: delivered (Success) but not yet remitted
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ["account-pending-tracking", startDate, endDate, trackingSearch],
    queryFn: async () => {
      // Use fetchAllRows to bypass the 1000-row limit
      const data = await fetchAllRows(() => {
        // Pending COD collection = COD orders delivered (Success) but not yet
        // remitted (no date_payment). Status is auto-updated by webhook.
        let query = supabase
          .from("customer_purchases")
          .select(`*, bundle:logistic_bundles(name, sku)`)
          .eq("delivery_status", "Success")
          .eq("type_payment", "COD")
          .is("date_payment", null)
          .order("date_order", { ascending: false });

        if (trackingSearch) {
          query = query.eq("tracking_number", trackingSearch);
        } else {
          if (startDate) query = query.gte("date_order", startDate);
          if (endDate) query = query.lte("date_order", endDate);
        }
        return query;
      });
      return data || [];
    },
  });

  // Overdue COD safety net: a delivered COD sitting here uncollected for too long
  // likely means a COD_REMITTED webhook was missed (ParcelDaily has no remittance
  // API to poll). Flag it so Finance chases the remittance.
  const OVERDUE_DAYS = 7;
  const daysSince = (d?: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0);
  const isOverdue = (o: any) => daysSince(o.date_processed || o.date_order) > OVERDUE_DAYS;

  // Base set — team/platform/search only. Summary-box totals compute from this so
  // they stay stable while a box click narrows the table below.
  const baseOrders = orders.filter((order: any) => {
    if (teamFilter && (order.marketer_id_staff || '') !== teamFilter) return false;
    if (platformFilter !== "all" && getOrderPlatformName(order) !== platformFilter) return false;

    if (search.trim()) {
      const searchTerms = search.toLowerCase().split("+").map((s) => s.trim()).filter(Boolean);
      const matchesSearch = searchTerms.every((term) =>
        order.name_customer?.toLowerCase().includes(term) ||
        order.phone_customer?.toLowerCase().includes(term) ||
        order.tracking_number?.toLowerCase().includes(term) ||
        order.bundle?.name?.toLowerCase().includes(term) ||
        order.address_customer?.toLowerCase().includes(term)
      );
      if (!matchesSearch) return false;
    }

    return true;
  });

  // Displayed set — base + clickable box filters (courier, overdue).
  const filteredOrders = baseOrders.filter((order: any) => {
    if (courierFilter !== "all" && baseCourier(order.kurier) !== courierFilter) return false;
    if (overdueOnly && !isOverdue(order)) return false;
    return true;
  });

  // Pagination
  const effectivePageSize = pageSize === 0 ? filteredOrders.length || 1 : pageSize;
  const totalPages = Math.ceil(filteredOrders.length / effectivePageSize);
  const paginatedOrders = pageSize === 0
    ? filteredOrders
    : filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Counts (from the stable base set)
  const counts = {
    total: baseOrders.length,
    cod: baseOrders.filter((o: any) => o.type_payment === "COD").length,
    cashOnline: baseOrders.filter((o: any) => o.type_payment !== "COD").length,
    totalSales: baseOrders.reduce((sum: number, o: any) => sum + (Number(o.total_sale) || 0), 0),
    overdue: baseOrders.filter(isOverdue).length,
  };

  // Breakdown by Kurier (COD delivered awaiting remittance), sorted by volume.
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
      overdue: arr.filter(isOverdue).length,
      sales: arr.reduce((sum: number, o: any) => sum + (Number(o.total_sale) || 0), 0),
    }))
    .sort((a, b) => b.total - a.total);

  // Checkbox handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrders(new Set(paginatedOrders.map((o: any) => o.id)));
    } else {
      setSelectedOrders(new Set());
    }
  };

  const handleSelectOrder = (orderId: string, checked: boolean) => {
    const newSelection = new Set(selectedOrders);
    if (checked) {
      newSelection.add(orderId);
    } else {
      newSelection.delete(orderId);
    }
    setSelectedOrders(newSelection);
  };

  const isAllSelected = paginatedOrders.length > 0 && paginatedOrders.every((o: any) => selectedOrders.has(o.id));

  // Helper to check if an order is JNT
  const isJntPlatform = (order: any) => {
    const kurier = (order.kurier || "").toUpperCase();
    return kurier.startsWith("JNT");
  };

  // Bulk Print action
  const handleBulkPrint = async () => {
    if (selectedOrders.size === 0) {
      toast.error("Please select orders to print waybills");
      return;
    }

    const selectedOrdersList = paginatedOrders.filter((o: any) => selectedOrders.has(o.id));

    // Helper to get platform
    const getOrderPlatform = (order: any) => {
      if (order.jenis_platform) return order.jenis_platform;
      return null;
    };

    // Separate NinjaVan, JNT, and Tiktok orders
    const ninjavanOrders = selectedOrdersList.filter(
      (o: any) => {
        const platform = getOrderPlatform(o)?.toLowerCase() || "";
        return platform !== "tiktok" && !isJntPlatform(o) && o.tracking_number;
      }
    );
    const jntOrders = selectedOrdersList.filter(
      (o: any) => {
        const platform = getOrderPlatform(o)?.toLowerCase() || "";
        return platform !== "tiktok" && isJntPlatform(o) && o.tracking_number;
      }
    );
    const marketplaceOrders = selectedOrdersList.filter(
      (o: any) => {
        const platform = getOrderPlatform(o)?.toLowerCase() || "";
        return platform === "tiktok" && o.waybill_url;
      }
    );

    if (ninjavanOrders.length === 0 && jntOrders.length === 0 && marketplaceOrders.length === 0) {
      toast.error("Selected orders do not have waybills to print");
      return;
    }

    setIsPrinting(true);

    try {
      const { data: session } = await supabase.auth.getSession();

      // Handle NinjaVan orders
      if (ninjavanOrders.length > 0) {
        const trackingNumbers = ninjavanOrders.map((o: any) => o.tracking_number);

        const response = await supabase.functions.invoke("ninjavan-waybill", {
          body: { trackingNumbers, profileId: user?.id },
          headers: { Authorization: `Bearer ${session?.session?.access_token}` },
        });

        if (response.error) {
          console.error("NinjaVan waybill error:", response.error);
          toast.error("Failed to fetch NinjaVan waybills");
        } else if (response.data) {
          const blob = new Blob([response.data], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
          toast.success(`NinjaVan waybill for ${trackingNumbers.length} order(s) opened`);
        }
      }

      // Handle JNT orders
      if (jntOrders.length > 0) {
        const trackingNumbers = jntOrders.map((o: any) => o.tracking_number);

        const response = await supabase.functions.invoke("jnt-waybill", {
          body: { trackingNumbers, profileId: user?.id },
          headers: { Authorization: `Bearer ${session?.session?.access_token}` },
        });

        if (response.error) {
          console.error("JNT waybill error:", response.error);
          toast.error("Failed to fetch JNT waybills");
        } else if (response.data) {
          const blob = new Blob([response.data], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
          toast.success(`JNT waybill for ${trackingNumbers.length} order(s) opened`);
        }
      }

      // Handle Tiktok orders (merge waybills)
      if (marketplaceOrders.length > 0) {
        const waybillUrls = marketplaceOrders.map((o: any) => o.waybill_url);

        const response = await supabase.functions.invoke("merge-waybills", {
          body: { waybillUrls },
          headers: { Authorization: `Bearer ${session?.session?.access_token}` },
        });

        if (response.error) {
          console.error("Marketplace waybill error:", response.error);
          toast.error("Failed to fetch Tiktok waybills");
        } else if (response.data) {
          const blob = new Blob([response.data], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
          toast.success(`Tiktok waybill for ${waybillUrls.length} order(s) opened`);
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate waybills");
    } finally {
      setIsPrinting(false);
    }
  };

  // Mark single order as collected MANUALLY (Finance confirms COD money received).
  // Stamps date_payment (so it moves to Success COD Collection) and flags the
  // source as manual — keeping delivery_status='Success' (it IS delivered).
  const handleCollected = async (orderId: string) => {
    const today = getMalaysiaDate();
    try {
      const { error } = await supabase
        .from("customer_purchases")
        .update({
          date_payment: today,
          cod_remit_manual: true,
        })
        .eq("id", orderId);
      if (error) throw error;

      toast.success("Ditanda terima bayaran (manual)");
      queryClient.invalidateQueries({ queryKey: ["account-pending-tracking"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to update order");
    }
  };

  // Open return dialog for single order
  const handleOpenReturnDialog = (orderId: string) => {
    setReturnOrderId(orderId);
    setReturnReason("");
    setReturnDialogOpen(true);
  };

  // Mark single order as Return with reason
  const handleSingleReturn = async () => {
    if (!returnOrderId) return;
    if (!returnReason.trim()) {
      toast.error("Please enter a reason for return");
      return;
    }

    setIsReturning(true);
    const today = getMalaysiaDate();
    try {
      const { error } = await supabase
        .from("customer_purchases")
        .update({
          seo: "Return",
          date_return: today,
          delivery_status: "Return",
          reason_return: returnReason.trim(),
        })
        .eq("id", returnOrderId);
      if (error) throw error;

      toast.success("Order marked as returned");
      setReturnDialogOpen(false);
      setReturnOrderId(null);
      setReturnReason("");
      queryClient.invalidateQueries({ queryKey: ["account-pending-tracking"] });
      queryClient.invalidateQueries({ queryKey: ["account-return"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to update order");
    } finally {
      setIsReturning(false);
    }
  };

  // Sync: reload latest orders from DB (status is auto-updated by webhook)
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await refetch();
      toast.success("Synced");
    } finally {
      setIsSyncing(false);
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    if (filteredOrders.length === 0) {
      toast.error("No data to export");
      return;
    }
    const data = filteredOrders.map((order: any, index: number) => ({
      "No": index + 1,
      "Id Sales": order.id_sale || "-",
      "Tarikh Order": order.date_order || "-",
      "Tarikh Process": order.date_processed || "-",
      "Nama Pelanggan": order.name_customer || "-",
      "Phone": order.phone_customer || "-",
      "Produk": order.bundle?.name || order.nota_staff || "-",
      "Unit": order.unit || 1,
      "Kurier": order.kurier || "-",
      "Tracking": order.tracking_number || "-",
      "Total Sales": Number(order.total_sale || 0).toFixed(2),
      "Cara Bayaran": order.type_payment === "COD" ? "COD" : "CASH",
      "Delivery Status": order.delivery_status || "-",
      "Jenis Platform": getOrderPlatformName(order),
      "Jenis Customer": order.jenis_customer || "-",
      "Negeri": order.state_customer || "-",
      "Alamat": order.address_customer || "-",
      "Parcel Status": order.seos || "-",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pending Tracking");
    XLSX.writeFile(wb, `Pending_Tracking_${startDate}_${endDate}.xlsx`);
    toast.success(`Exported ${data.length} orders to Excel`);
  };

  const handleFilterChange = () => {
    setCurrentPage(1);
    setSelectedOrders(new Set());
  };

  const applyDateFilter = () => {
    setStartDate(pendingStart);
    setEndDate(pendingEnd);
    setTrackingSearch("");
    handleFilterChange();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pending COD Collection"
        description="COD orders delivered but not yet collected"
        icon={DollarSign}
        tone="brand"
        actions={
          <Button variant="outline" onClick={handleSync} disabled={isSyncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
            Sync
          </Button>
        }
      />

      {/* Stats Cards (clickable filters) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard
          icon={Clock}
          tone="amber"
          label="Total Pending Collection (COD)"
          value={counts.total}
          hint={<span className="whitespace-normal">RM {counts.totalSales.toFixed(2)} belum kutip</span>}
          onClick={() => { setCourierFilter("all"); setOverdueOnly(false); handleFilterChange(); }}
          active={courierFilter === "all" && !overdueOnly}
          className={STACK_CARD}
        />
        {/* Remittance overdue — delivered COD uncollected > 7 days (possible
            missed COD_REMITTED webhook). Highlighted red in the table below. */}
        <StatCard
          icon={AlertTriangle}
          tone={counts.overdue > 0 ? "red" : "slate"}
          label="Remittance Overdue"
          value={<span className={counts.overdue > 0 ? "text-red-600 dark:text-red-400" : ""}>{counts.overdue}</span>}
          hint={<span className="whitespace-normal">COD &gt; {OVERDUE_DAYS} hari belum settle</span>}
          onClick={() => { setOverdueOnly((v) => !v); setCourierFilter("all"); handleFilterChange(); }}
          active={overdueOnly}
          className={`${STACK_CARD} ${counts.overdue > 0 ? "border-red-300 bg-red-50/60 dark:border-red-500/30 dark:bg-red-950/20" : ""} ${overdueOnly ? "ring-red-500/25 border-red-400" : ""}`}
        />
      </div>

      {/* Breakdown by Kurier (clickable filter) */}
      {courierStats.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {courierStats.map((cs) => (
            <StatCard
              key={cs.name}
              icon={Truck}
              tone="amber"
              label={cs.name}
              value={cs.total}
              hint={
                <>
                  <span className="block truncate">RM {cs.sales.toFixed(2)}</span>
                  {cs.overdue > 0 && (
                    <span className="block truncate text-red-600 dark:text-red-400">{cs.overdue} overdue</span>
                  )}
                </>
              }
              onClick={() => { setCourierFilter(courierFilter === cs.name ? "all" : cs.name); setOverdueOnly(false); handleFilterChange(); }}
              active={courierFilter === cs.name}
              className={STACK_CARD}
            />
          ))}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative w-full sm:min-w-[220px] sm:flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search tracking number..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); handleFilterChange(); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && search.trim()) {
                      setTrackingSearch(search.trim());
                      setPendingStart("");
                      setPendingEnd("");
                      setStartDate("");
                      setEndDate("");
                      handleFilterChange();
                    }
                  }}
                  className="pl-10"
                />
              </div>
              <Button
                variant="default"
                onClick={() => {
                  if (search.trim()) {
                    setTrackingSearch(search.trim());
                    setPendingStart("");
                    setPendingEnd("");
                    setStartDate("");
                    setEndDate("");
                    handleFilterChange();
                  }
                }}
                className="shrink-0"
              >
                <Search className="w-4 h-4 mr-2" />
                Search
              </Button>
              {trackingSearch && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setTrackingSearch("");
                    setSearch("");
                    setPendingStart(firstDay);
                    setPendingEnd(lastDay);
                    setStartDate(firstDay);
                    setEndDate(lastDay);
                    handleFilterChange();
                  }}
                  className="shrink-0"
                >
                  Reset
                </Button>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={pendingStart}
                  onChange={(e) => setPendingStart(e.target.value)}
                  className="min-w-[130px] flex-1 sm:w-40 sm:flex-none"
                />
                <Input
                  type="date"
                  value={pendingEnd}
                  onChange={(e) => setPendingEnd(e.target.value)}
                  className="min-w-[130px] flex-1 sm:w-40 sm:flex-none"
                />
                <Button onClick={applyDateFilter} className="h-10">
                  <Filter className="w-4 h-4 mr-1" />
                  Apply Filter
                </Button>
                <UnappliedDateNote pendingStart={pendingStart} pendingEnd={pendingEnd} startDate={startDate} endDate={endDate} />
              </div>
              <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); handleFilterChange(); }}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
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
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Show:</span>
                <Select value={pageSize === 0 ? "all" : pageSize.toString()} onValueChange={(v) => { setPageSize(v === "all" ? 0 : Number(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                    ))}
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">entries</span>
              </div>

              <div className="hidden flex-1 sm:block" />

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={handleExportExcel}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export Excel
                </Button>
                <Button
                  variant="outline"
                  onClick={handleBulkPrint}
                  disabled={selectedOrders.size === 0 || isPrinting}
                >
                  {isPrinting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Printer className="w-4 h-4 mr-2" />}
                  Print ({selectedOrders.size})
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={8} cols={7} className="p-4" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-3 text-left w-10">
                        <Checkbox
                          checked={isAllSelected}
                          onCheckedChange={handleSelectAll}
                        />
                      </th>
                      <th className="p-3 text-left">No</th>
                      <th className="p-3 text-left text-blue-600 dark:text-blue-400">ID Staff</th>
                      <th className="p-3 text-left text-blue-600 dark:text-blue-400">Nama</th>
                      <th className="p-3 text-left">Id Sales</th>
                      <th className="p-3 text-left">Tarikh Order</th>
                      <th className="p-3 text-left">Tarikh Process</th>
                      <th className="p-3 text-left">Nama Pelanggan</th>
                      <th className="p-3 text-left">Phone</th>
                      <th className="p-3 text-left">Produk</th>
                      <th className="p-3 text-left">Unit</th>
                      <th className="p-3 text-left">Kurier</th>
                      <th className="p-3 text-left">Tracking</th>
                      <th className="p-3 text-left">Total Sales</th>
                      <th className="p-3 text-left">Cara Bayaran</th>
                      <th className="p-3 text-left">Delivery Status</th>
                      <th className="p-3 text-left">Jenis Platform</th>
                      <th className="p-3 text-left">Jenis Customer</th>
                      <th className="p-3 text-left">Negeri</th>
                      <th className="p-3 text-left">Alamat</th>
                      <th className="p-3 text-left">Waybill</th>
                      <th className="p-3 text-left">Parcel Status</th>
                      <th className="p-3 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.length > 0 ? (
                      paginatedOrders.map((order: any, index: number) => (
                        <tr
                          key={order.id}
                          className={`border-b hover:bg-muted/40 transition-colors ${
                            isOverdue(order) ? "bg-red-50 dark:bg-red-950/30 border-l-4 border-l-red-500" : ""
                          }`}
                        >
                          <td className="p-3">
                            <Checkbox
                              checked={selectedOrders.has(order.id)}
                              onCheckedChange={(checked) => handleSelectOrder(order.id, !!checked)}
                            />
                          </td>
                          <td className="p-3">{(currentPage - 1) * effectivePageSize + index + 1}</td>
                          <td className="p-3 whitespace-nowrap font-mono text-blue-600 dark:text-blue-400">{order.marketer_id_staff || "-"}</td>
                          <td className="p-3 whitespace-nowrap">{nameByIdstaff.get(order.marketer_id_staff || '') || "-"}</td>
                          <td className="p-3 whitespace-nowrap">{order.id_sale || "-"}</td>
                          <td className="p-3 whitespace-nowrap">{formatDMY(order.date_order)}</td>
                          <td className="p-3 whitespace-nowrap">{formatDMY(order.date_processed)}</td>
                          <td className="p-3">{order.name_customer || "-"}</td>
                          <td className="p-3 whitespace-nowrap">{order.phone_customer || "-"}</td>
                          <td className="p-3">
                            <span className="truncate max-w-[150px] block">{order.bundle?.name || order.nota_staff || "-"}</span>
                          </td>
                          <td className="p-3">{order.unit || 1}</td>
                          <td className="p-3 whitespace-nowrap">{order.kurier || "-"}</td>
                          <td className="p-3 whitespace-nowrap">
                            <span className="font-mono text-xs">{order.tracking_number || "-"}</span>
                          </td>
                          <td className="p-3 whitespace-nowrap">RM {Number(order.total_sale || 0).toFixed(2)}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${order.type_payment === "COD" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}`}>
                              {order.type_payment || "-"}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              {order.delivery_status || "-"}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`text-xs font-medium ${
                              order.jenis_platform === "Tiktok" ? "text-pink-600" :
                              order.jenis_platform === "Threads" ? "text-slate-500" :
                              order.jenis_platform === "Facebook" ? "text-blue-600" :
                              order.jenis_platform === "Google" ? "text-green-600" :
                              order.jenis_platform === "Database" ? "text-purple-600" :
                              "text-gray-600"
                            }`}>
                              {order.jenis_platform || "-"}
                            </span>
                          </td>
                          <td className="p-3 text-xs">{order.jenis_customer || "-"}</td>
                          <td className="p-3 text-xs">{order.state_customer || "-"}</td>
                          <td className="p-3">
                            <div className="max-w-[150px]">
                              <p className="text-xs truncate">{order.address_customer || "-"}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {order.postcode_customer} {order.city_customer}
                              </p>
                            </div>
                          </td>
                          <td className="p-3">
                            {order.waybill_url ? (
                              <a href={order.waybill_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                                View
                              </a>
                            ) : "-"}
                          </td>
                          <td className="p-3">
                            <span className={`text-xs ${order.seos === "Successful Delivery" ? "text-green-600" : "text-gray-500"}`}>
                              {order.seos || "-"}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-2">
                              {/* Only "Collected" here — the order is already
                                  delivered/received (Success). Return is a
                                  before-delivery action handled in Pending Tracking. */}
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 whitespace-nowrap"
                                onClick={() => handleCollected(order.id)}
                              >
                                <Wallet className="w-4 h-4 mr-1" />
                                Sudah Terima Bayaran
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={23} className="p-0">
                          <EmptyState icon={Clock} title="No pending tracking orders found." />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
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

      {/* Return Reason Dialog */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Order as Return</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Reason for Return</Label>
              <Textarea
                placeholder="Enter reason for return..."
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                rows={3}
              />
            </div>
            <MissingHint items={[{ label: "Reason for Return", done: !!returnReason.trim() }]} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSingleReturn}
              disabled={isReturning || !returnReason.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {isReturning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              Confirm Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountPendingTracking;
