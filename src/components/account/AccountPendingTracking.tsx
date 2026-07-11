import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
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
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, getMalaysiaDate, fetchAllRows } from "@/lib/utils";
import {
  Package,
  Clock,
  Loader2,
  Printer,
  Search,
  Wallet,
  RotateCcw,
  Download,
  Filter,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const PAGE_SIZE_OPTIONS = [10, 50, 100];

const AccountPendingTracking = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const firstDay = getMalaysiaStartOfMonth();
  const lastDay = getMalaysiaEndOfMonth();

  // Filter states
  const [search, setSearch] = useState("");
  const [pendingStart, setPendingStart] = useState(firstDay);
  const [pendingEnd, setPendingEnd] = useState(lastDay);
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);
  const [platformFilter, setPlatformFilter] = useState("all");
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

  // Helper to calculate units for an order - simplified
  const getOrderUnits = (order: any): number => {
    return Number(order.unit) || 1;
  };

  // Helper: Unit Bundle = order.unit × first SKU number (e.g., "GSI-4 + ..." → 4)
  const getFirstSkuQty = (sku: string | null | undefined): number => {
    if (!sku) return 0;
    const match = sku.match(/-(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  };
  const getUnitBundle = (order: any): number => {
    return (Number(order.unit) || 0) * getFirstSkuQty(order.bundle?.sku);
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

  // Filter orders
  const filteredOrders = orders.filter((order: any) => {
    // Platform filter
    if (platformFilter !== "all" && getOrderPlatformName(order) !== platformFilter) return false;

    // Search filter
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

  // Pagination
  const effectivePageSize = pageSize === 0 ? filteredOrders.length || 1 : pageSize;
  const totalPages = Math.ceil(filteredOrders.length / effectivePageSize);
  const paginatedOrders = pageSize === 0
    ? filteredOrders
    : filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Counts
  const counts = {
    total: filteredOrders.length,
    cod: filteredOrders.filter((o: any) => o.type_payment === "COD").length,
    cashOnline: filteredOrders.filter((o: any) => o.type_payment !== "COD").length,
    totalSales: filteredOrders.reduce((sum: number, o: any) => sum + (Number(o.total_sale) || 0), 0),
    totalUnits: filteredOrders.reduce((sum: number, o: any) => sum + getOrderUnits(o), 0),
    totalUnitBundle: filteredOrders.reduce((sum: number, o: any) => sum + getUnitBundle(o), 0),
  };

  // Platform breakdown (Facebook, Threads, Tiktok, Database, Google)
  const PLATFORM_NAMES = ["Facebook", "Threads", "Tiktok", "Database", "Google"];
  const platformStats = PLATFORM_NAMES.map((name) => {
    const platformOrders = filteredOrders.filter((o: any) => getOrderPlatformName(o) === name);
    return {
      name,
      total: platformOrders.length,
      cod: platformOrders.filter((o: any) => o.type_payment === "COD").length,
      cashOnline: platformOrders.filter((o: any) => o.type_payment !== "COD").length,
      units: platformOrders.reduce((sum: number, o: any) => sum + getOrderUnits(o), 0),
    };
  });

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

  // Mark single order as collected
  const handleCollected = async (orderId: string) => {
    const today = getMalaysiaDate();
    try {
      await supabase
        .from("customer_purchases")
        .update({
          seo: "Successful Delivery",
          date_payment: today,
          delivery_status: "Shipped",
        })
        .eq("id", orderId);

      toast.success("Order marked as collected");
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
      await supabase
        .from("customer_purchases")
        .update({
          seo: "Return",
          date_return: today,
          delivery_status: "Return",
          reason_return: returnReason.trim(),
        })
        .eq("id", returnOrderId);

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
      "Date Order": order.date_order || "-",
      "Platform": getOrderPlatformName(order),
      "ID Marketer": order.marketer_id_staff || "HQ",
      "Marketer": profilesMap.get(order.marketer_id_staff) || order.marketer_id_staff || "HQ",
      "Customer": order.name_customer || "-",
      "Phone": order.phone_customer || "-",
      "Product": order.nota_staff || order.bundle?.name || "-",
      "Qty": order.unit || 1,
      "Unit Bundle": getUnitBundle(order),
      "Final Price": Number(order.total_sale || 0).toFixed(2),
      "Fees": Number(order.cost_postage || 0).toFixed(2),
      "Total Sales": (Number(order.total_sale || 0) + Number(order.cost_postage || 0)).toFixed(2),
      "Payment": order.type_payment === "COD" ? "COD" : "CASH",
      "Tracking": order.tracking_number || "-",
      "State": order.state_customer || "-",
      "Address": order.address_customer || "-",
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Pending COD Collection</h1>
          <p className="text-muted-foreground mt-2">
            COD orders delivered but not yet collected
          </p>
        </div>
        <Button variant="outline" onClick={handleSync} disabled={isSyncing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
          Sync
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{counts.total}</p>
                <p className="text-sm text-muted-foreground">Total Pending</p>
                <div className="flex gap-2 mt-1 text-xs">
                  <span className="text-orange-600">{counts.cod} COD</span>
                  <span className="text-green-600">{counts.cashOnline} CASH</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{counts.totalUnits}</p>
                <p className="text-sm text-muted-foreground">Total Unit</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{counts.totalUnitBundle}</p>
                <p className="text-sm text-muted-foreground">Total Unit Bundle</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {platformStats.map((ps) => (
          <Card key={ps.name} className={ps.total > 0 ? "border-l-4 border-l-purple-500" : ""}>
            <CardContent className="p-4">
              <div>
                <p className="text-sm font-semibold">{ps.name}</p>
                <p className="text-xl font-bold">{ps.total}</p>
                <div className="flex gap-2 mt-1 text-xs">
                  <span className="text-orange-600">{ps.cod} COD</span>
                  <span className="text-green-600">{ps.cashOnline} CASH</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Unit: <span className="font-semibold text-foreground">{ps.units}</span></p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
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
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={pendingStart}
                  onChange={(e) => setPendingStart(e.target.value)}
                  className="w-40"
                />
                <Input
                  type="date"
                  value={pendingEnd}
                  onChange={(e) => setPendingEnd(e.target.value)}
                  className="w-40"
                />
                <Button size="sm" onClick={applyDateFilter}>
                  <Filter className="w-4 h-4 mr-1" />
                  Apply Filter
                </Button>
              </div>
              <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); handleFilterChange(); }}>
                <SelectTrigger className="w-36">
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
            </div>

            <div className="flex flex-wrap items-center gap-4">
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

              <div className="flex-1" />

              <div className="flex gap-2">
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
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-3 text-left w-10">
                        <Checkbox
                          checked={isAllSelected}
                          onCheckedChange={handleSelectAll}
                        />
                      </th>
                      <th className="p-3 text-left">No</th>
                      <th className="p-3 text-left">Date Order</th>
                      <th className="p-3 text-left">Platform</th>
                      <th className="p-3 text-left">Customer</th>
                      <th className="p-3 text-left">Phone</th>
                      <th className="p-3 text-left min-w-[280px]">Product</th>
                      <th className="p-3 text-left">Qty</th>
                      <th className="p-3 text-left">Unit Bundle</th>
                      <th className="p-3 text-left">Final Price</th>
                      <th className="p-3 text-left">Fees</th>
                      <th className="p-3 text-left">Total Sales</th>
                      <th className="p-3 text-left">Payment</th>
                      <th className="p-3 text-left">Tracking</th>
                      <th className="p-3 text-left">State</th>
                      <th className="p-3 text-left">Address</th>
                      <th className="p-3 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.length > 0 ? (
                      paginatedOrders.map((order: any, index: number) => (
                        <tr key={order.id} className="border-b hover:bg-muted/30">
                          <td className="p-3">
                            <Checkbox
                              checked={selectedOrders.has(order.id)}
                              onCheckedChange={(checked) => handleSelectOrder(order.id, !!checked)}
                            />
                          </td>
                          <td className="p-3">{(currentPage - 1) * effectivePageSize + index + 1}</td>
                          <td className="p-3">{order.date_order || "-"}</td>
                          <td className="p-3">
                            <span className="text-xs font-medium">{getOrderPlatformName(order)}</span>
                          </td>
                          <td className="p-3">{order.name_customer || "-"}</td>
                          <td className="p-3">{order.phone_customer || "-"}</td>
                          <td className="p-3 min-w-[280px]"><span className="line-clamp-3">{order.nota_staff || order.bundle?.name || "-"}</span></td>
                          <td className="p-3">{order.unit || 1}</td>
                          <td className="p-3 font-medium text-amber-600">{getUnitBundle(order)}</td>
                          <td className="p-3">RM {Number(order.total_sale || 0).toFixed(2)}</td>
                          <td className="p-3">{order.cost_postage ? `RM ${Number(order.cost_postage).toFixed(2)}` : "-"}</td>
                          <td className="p-3">RM {(Number(order.total_sale || 0) + Number(order.cost_postage || 0)).toFixed(2)}</td>
                          <td className="p-3">
                            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                              order.type_payment === "COD"
                                ? "bg-orange-100 text-orange-800"
                                : "bg-green-100 text-green-800"
                            }`}>
                              {order.type_payment === "COD" ? "COD" : "CASH"}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-sm">{order.tracking_number || "-"}</td>
                          <td className="p-3">{order.state_customer || "-"}</td>
                          <td className="p-3">
                            <div className="min-w-[250px]">
                              <p className="text-sm whitespace-normal">{order.address_customer || "-"}</p>
                              <p className="text-xs text-muted-foreground">
                                {order.postcode_customer} {order.city_customer}
                              </p>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600"
                                onClick={() => handleCollected(order.id)}
                              >
                                <Wallet className="w-4 h-4 mr-1" />
                                Collected
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600"
                                onClick={() => handleOpenReturnDialog(order.id)}
                              >
                                <RotateCcw className="w-4 h-4 mr-1" />
                                Return
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={16} className="text-center py-12 text-muted-foreground">
                          No pending tracking orders found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * effectivePageSize + 1} to {Math.min(currentPage * effectivePageSize, filteredOrders.length)} of {filteredOrders.length} entries
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2)
                      .reduce((acc: (number | string)[], page, idx, arr) => {
                        if (idx > 0 && page - (arr[idx - 1] as number) > 1) acc.push("...");
                        acc.push(page);
                        return acc;
                      }, [])
                      .map((page, idx) =>
                        page === "..." ? (
                          <span key={`dot-${idx}`} className="px-1 text-muted-foreground">...</span>
                        ) : (
                          <Button
                            key={page}
                            variant={currentPage === page ? "default" : "outline"}
                            size="sm"
                            className="w-8 h-8 p-0"
                            onClick={() => setCurrentPage(page as number)}
                          >
                            {page}
                          </Button>
                        )
                      )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
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
