import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, fetchAllRows } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Package,
  Loader2,
  Printer,
  Search,
  DollarSign,
  CheckCircle,
  Receipt,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const PAGE_SIZE_OPTIONS = [10, 50, 100];

const AccountSuccessTracking = () => {
  const { user, userProfile } = useAuth();
  const queryClient = useQueryClient();
  const firstDay = getMalaysiaStartOfMonth();
  const lastDay = getMalaysiaEndOfMonth();

  // Filter states
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [trackingSearch, setTrackingSearch] = useState("");

  // Selection state (for print only)
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  // Loading states
  const [isPrinting, setIsPrinting] = useState(false);

  // Helper to determine platform name for an order
  const getOrderPlatformName = (order: any): string => {
    if (order.jenis_platform) return order.jenis_platform;
    return "Manual";
  };

  // Helper to calculate units for an order
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

  // Helper to get fees: Shopee/Tiktok use actual fees (abs), others use COD=7, CASH=6
  const getOrderFees = (order: any): number => {
    const platform = getOrderPlatformName(order);
    if (platform === "Shopee" || platform === "Tiktok") {
      return Math.abs(Number(order.cost_postage) || 0);
    }
    return order.type_payment === "COD" ? 7 : 6;
  };

  // Helper to get Final Price: for non-Tiktok/Shopee, subtract fees from total_sale
  const getOrderFinalPrice = (order: any): number => {
    const platform = getOrderPlatformName(order);
    const totalSale = Number(order.total_sale) || 0;
    if (platform === "Shopee" || platform === "Tiktok") {
      return totalSale;
    }
    return totalSale - getOrderFees(order);
  };

  // Fetch success tracking orders
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["account-success-tracking", startDate, endDate, trackingSearch],
    queryFn: async () => {
      // Use fetchAllRows to bypass the 1000-row limit
      const data = await fetchAllRows(() => {
        let query = supabase
          .from("customer_purchases")
          .select(`*, bundle:logistic_bundles(name, sku)`)
          .eq("delivery_status", "Shipped")
          .eq("seo", "Successful Delivery")
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

  // Fetch pending orders for stats comparison
  const { data: pendingOrders = [] } = useQuery({
    queryKey: ["account-pending-stats", startDate, endDate],
    queryFn: async () => {
      const data = await fetchAllRows(() => {
        let query = supabase
          .from("customer_purchases")
          .select("id, type_payment, total_sale, cost_postage, unit, jenis_platform")
          .eq("delivery_status", "Shipped")
          .or("seo.is.null,seo.neq.Successful Delivery");

        if (startDate) query = query.gte("date_order", startDate);
        if (endDate) query = query.lte("date_order", endDate);
        return query;
      });
      return data || [];
    },
  });

  // Profiles lookup
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("username, full_name");
      if (error) throw error;
      return data || [];
    },
  });
  const profilesMap = new Map(profiles.map((p: any) => [p.username, p.full_name]));

  // Filter orders
  const filteredOrders = orders.filter((order: any) => {
    // Platform filter
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

  // Pagination
  const effectivePageSize = pageSize === 0 ? filteredOrders.length || 1 : pageSize;
  const totalPages = Math.ceil(filteredOrders.length / effectivePageSize);
  const paginatedOrders = pageSize === 0
    ? filteredOrders
    : filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Counts (success)
  const counts = {
    total: filteredOrders.length,
    cod: filteredOrders.filter((o: any) => o.type_payment === "COD").length,
    cashOnline: filteredOrders.filter((o: any) => o.type_payment !== "COD").length,
    totalFinalPrice: filteredOrders.reduce((sum: number, o: any) => sum + getOrderFinalPrice(o), 0),
    totalUnits: filteredOrders.reduce((sum: number, o: any) => sum + getOrderUnits(o), 0),
    totalUnitBundle: filteredOrders.reduce((sum: number, o: any) => sum + getUnitBundle(o), 0),
    totalFees: filteredOrders.reduce((sum: number, o: any) => sum + getOrderFees(o), 0),
  };

  // Pending counts (for stats comparison)
  const pending = {
    total: pendingOrders.length,
    totalUnits: pendingOrders.reduce((sum: number, o: any) => sum + getOrderUnits(o), 0),
    totalFees: pendingOrders.reduce((sum: number, o: any) => sum + getOrderFees(o), 0),
  };

  // Percentage helper: pending / (success + pending) * 100
  const pctPending = (success: number, pend: number) => {
    const total = success + pend;
    return total > 0 ? ((pend / total) * 100).toFixed(1) : "0.0";
  };

  // Platform breakdown (Facebook, Tiktok, Shopee, Database, Google, Others)
  const PLATFORM_NAMES = ["Facebook", "Tiktok", "Shopee", "Database", "Google"];
  const buildPlatformStats = (name: string, ordersList: any[], pendList: any[]) => {
    return {
      name,
      total: ordersList.length,
      cod: ordersList.filter((o: any) => o.type_payment === "COD").length,
      cashOnline: ordersList.filter((o: any) => o.type_payment !== "COD").length,
      units: ordersList.reduce((sum: number, o: any) => sum + getOrderUnits(o), 0),
      totalFinalPrice: ordersList.reduce((sum: number, o: any) => sum + getOrderFinalPrice(o), 0),
      totalFees: ordersList.reduce((sum: number, o: any) => sum + getOrderFees(o), 0),
      pendTotal: pendList.length,
      pendUnits: pendList.reduce((sum: number, o: any) => sum + getOrderUnits(o), 0),
      pendFees: pendList.reduce((sum: number, o: any) => sum + getOrderFees(o), 0),
    };
  };
  const platformStats = [
    ...PLATFORM_NAMES.map((name) => {
      const platformOrders = filteredOrders.filter((o: any) => getOrderPlatformName(o) === name);
      const pendPlatformOrders = pendingOrders.filter((o: any) => getOrderPlatformName(o) === name);
      return buildPlatformStats(name, platformOrders, pendPlatformOrders);
    }),
    (() => {
      const otherOrders = filteredOrders.filter((o: any) => !PLATFORM_NAMES.includes(getOrderPlatformName(o)));
      const otherPend = pendingOrders.filter((o: any) => !PLATFORM_NAMES.includes(getOrderPlatformName(o)));
      return buildPlatformStats("Others", otherOrders, otherPend);
    })(),
  ].filter(ps => PLATFORM_NAMES.includes(ps.name) || ps.total > 0 || ps.pendTotal > 0);

  // Checkbox handlers (for print only)
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

    const getOrderPlatform = (order: any) => {
      if (order.jenis_platform) return order.jenis_platform;
      return null;
    };

    // Separate NinjaVan, JNT, and Shopee/Tiktok orders
    const ninjavanOrders = selectedOrdersList.filter(
      (o: any) => {
        const platform = getOrderPlatform(o)?.toLowerCase() || "";
        return platform !== "shopee" && platform !== "tiktok" && !isJntPlatform(o) && o.tracking_number;
      }
    );
    const jntOrders = selectedOrdersList.filter(
      (o: any) => {
        const platform = getOrderPlatform(o)?.toLowerCase() || "";
        return platform !== "shopee" && platform !== "tiktok" && isJntPlatform(o) && o.tracking_number;
      }
    );
    const marketplaceOrders = selectedOrdersList.filter(
      (o: any) => {
        const platform = getOrderPlatform(o)?.toLowerCase() || "";
        return (platform === "shopee" || platform === "tiktok") && o.waybill_url;
      }
    );

    if (ninjavanOrders.length === 0 && jntOrders.length === 0 && marketplaceOrders.length === 0) {
      toast.error("Selected orders do not have waybills to print");
      return;
    }

    setIsPrinting(true);

    try {
      const { data: session } = await supabase.auth.getSession();

      if (ninjavanOrders.length > 0) {
        const trackingNumbers = ninjavanOrders.map((o: any) => o.tracking_number);
        const response = await supabase.functions.invoke("ninjavan-waybill", {
          body: { trackingNumbers, profileId: user?.id },
          headers: { Authorization: `Bearer ${session?.session?.access_token}` },
        });
        if (response.error) {
          toast.error("Failed to fetch NinjaVan waybills");
        } else if (response.data) {
          const blob = new Blob([response.data], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
          toast.success(`NinjaVan waybill for ${trackingNumbers.length} order(s) opened`);
        }
      }

      if (jntOrders.length > 0) {
        const trackingNumbers = jntOrders.map((o: any) => o.tracking_number);
        const response = await supabase.functions.invoke("jnt-waybill", {
          body: { trackingNumbers, profileId: user?.id },
          headers: { Authorization: `Bearer ${session?.session?.access_token}` },
        });
        if (response.error) {
          toast.error("Failed to fetch JNT waybills");
        } else if (response.data) {
          const blob = new Blob([response.data], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
          toast.success(`JNT waybill for ${trackingNumbers.length} order(s) opened`);
        }
      }

      if (marketplaceOrders.length > 0) {
        const waybillUrls = marketplaceOrders.map((o: any) => o.waybill_url);
        const response = await supabase.functions.invoke("merge-waybills", {
          body: { waybillUrls },
          headers: { Authorization: `Bearer ${session?.session?.access_token}` },
        });
        if (response.error) {
          toast.error("Failed to fetch Shopee/Tiktok waybills");
        } else if (response.data) {
          const blob = new Blob([response.data], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
          toast.success(`Shopee/Tiktok waybill for ${waybillUrls.length} order(s) opened`);
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate waybills");
    } finally {
      setIsPrinting(false);
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    if (filteredOrders.length === 0) {
      toast.error("No data to export");
      return;
    }
    const data = filteredOrders.map((order: any, index: number) => {
      const row: Record<string, any> = {
        "No": index + 1,
        "Date Order": order.date_order || "-",
        "Platform": getOrderPlatformName(order),
        "ID Marketer": order.marketer_id_staff || "HQ",
        "Marketer": profilesMap.get(order.marketer_id_staff) || order.marketer_id_staff || "HQ",
        "Customer": order.name_customer || "-",
        "Phone": order.phone_customer || "-",
        "Product": order.nota_staff || order.bundle?.name || "-",
        "Unit": getOrderUnits(order),
        "Unit Bundle": getUnitBundle(order),
        "Final Price": getOrderFinalPrice(order).toFixed(2),
        "Fees": getOrderFees(order).toFixed(2),
        "Total Sales": (getOrderFinalPrice(order) + getOrderFees(order)).toFixed(2),
        "% Fee": ((totalSales) => totalSales > 0 ? (getOrderFees(order) / totalSales * 100).toFixed(1) + "%" : "0.0%")(getOrderFinalPrice(order) + getOrderFees(order)),
        "Pay Method": order.type_payment === "COD" ? "COD" : "CASH",
        "Tracking": order.tracking_number || "-",
        "Date Collected": order.date_payment || "-",
        "State": order.state_customer || "-",
        "Address": order.address_customer || "-",
      };
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Success Tracking");
    XLSX.writeFile(wb, `Success_Tracking_${startDate}_${endDate}.xlsx`);
    toast.success(`Exported ${data.length} orders to Excel`);
  };

  const handleFilterChange = () => {
    setCurrentPage(1);
    setSelectedOrders(new Set());
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Success Tracking</h1>
        <p className="text-muted-foreground mt-2">
          View orders with successful delivery
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{counts.total}</p>
                <p className="text-sm text-muted-foreground">Total Success</p>
                <div className="flex gap-2 mt-1 text-xs">
                  <span className="text-orange-600">{counts.cod} COD</span>
                  <span className="text-green-600">{counts.cashOnline} CASH</span>
                </div>
                <p className="mt-1 text-xs text-purple-600">Pending: {pending.total} ({pctPending(counts.total, pending.total)}%)</p>
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
                <p className="mt-1 text-xs text-purple-600">Pending: {pending.totalUnits} ({pctPending(counts.totalUnits, pending.totalUnits)}%)</p>
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
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">RM {counts.totalFinalPrice.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">Final Price</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Receipt className="w-8 h-8 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">RM {counts.totalFees.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">Total Fees</p>
                <p className="mt-1 text-xs text-purple-600">Pending: RM {pending.totalFees.toFixed(2)} ({pctPending(counts.totalFees, pending.totalFees)}%)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-emerald-600" />
              <div>
                <p className="text-2xl font-bold">RM {(counts.totalFinalPrice + counts.totalFees).toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">Total Sales</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Receipt className="w-8 h-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{((counts.totalFinalPrice + counts.totalFees) > 0 ? (counts.totalFees / (counts.totalFinalPrice + counts.totalFees) * 100).toFixed(1) : "0.0")}%</p>
                <p className="text-sm text-muted-foreground">% Fee</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {platformStats.map((ps) => (
          <Card key={ps.name} className={ps.total > 0 ? "border-l-4 border-l-green-500" : ""}>
            <CardContent className="p-4">
              <div>
                <p className="text-sm font-semibold">{ps.name}</p>
                <p className="text-xl font-bold">{ps.total}</p>
                <div className="flex gap-2 mt-1 text-xs">
                  <span className="text-orange-600">{ps.cod} COD</span>
                  <span className="text-green-600">{ps.cashOnline} CASH</span>
                </div>
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <p>Unit: <span className="font-semibold text-foreground">{ps.units}</span></p>
                  <p>Final Price: <span className="font-semibold text-foreground">RM {ps.totalFinalPrice.toFixed(2)}</span></p>
                  <p>Fees: <span className="font-semibold text-foreground">RM {ps.totalFees.toFixed(2)}</span></p>
                  <p>Total Sales: <span className="font-semibold text-foreground">RM {(ps.totalFinalPrice + ps.totalFees).toFixed(2)}</span></p>
                  <p>% Fee: <span className="font-semibold text-foreground">{(ps.totalFinalPrice + ps.totalFees) > 0 ? (ps.totalFees / (ps.totalFinalPrice + ps.totalFees) * 100).toFixed(1) : "0.0"}%</span></p>
                </div>
                {(ps.pendTotal > 0 || ps.pendUnits > 0) && (
                  <div className="mt-2 pt-2 border-t border-dashed space-y-0.5 text-xs text-purple-600">
                    <p>Pending: {ps.pendTotal} ({pctPending(ps.total, ps.pendTotal)}%)</p>
                    <p>Pending Unit: {ps.pendUnits} ({pctPending(ps.units, ps.pendUnits)}%)</p>
                    {ps.pendFees !== 0 && <p>Pending Fees: RM {ps.pendFees.toFixed(2)}</p>}
                  </div>
                )}
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
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setTrackingSearch(""); handleFilterChange(); }}
                  className="w-40"
                />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setTrackingSearch(""); handleFilterChange(); }}
                  className="w-40"
                />
              </div>
              <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); handleFilterChange(); }}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platform</SelectItem>
                  <SelectItem value="Facebook">Facebook</SelectItem>
                  <SelectItem value="Tiktok">TikTok</SelectItem>
                  <SelectItem value="Shopee">Shopee</SelectItem>
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
                      <th className="p-3 text-left">ID Marketer</th>
                      <th className="p-3 text-left">Marketer</th>
                      <th className="p-3 text-left">Customer</th>
                      <th className="p-3 text-left">Phone</th>
                      <th className="p-3 text-left min-w-[280px]">Product</th>
                      <th className="p-3 text-left">Unit</th>
                      <th className="p-3 text-left">Unit Bundle</th>
                      <th className="p-3 text-left">Final Price</th>
                      <th className="p-3 text-left">Fees</th>
                      <th className="p-3 text-left">Total Sales</th>
                      <th className="p-3 text-left">% Fee</th>
                      <th className="p-3 text-left">Pay Method</th>
                      <th className="p-3 text-left">Tracking</th>
                      <th className="p-3 text-left">Date Collected</th>
                      <th className="p-3 text-left">State</th>
                      <th className="p-3 text-left">Address</th>
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
                          <td className="p-3 font-mono text-xs">{order.marketer_id_staff || "HQ"}</td>
                          <td className="p-3">{profilesMap.get(order.marketer_id_staff) || order.marketer_id_staff || "HQ"}</td>
                          <td className="p-3">{order.name_customer || "-"}</td>
                          <td className="p-3">{order.phone_customer || "-"}</td>
                          <td className="p-3 min-w-[280px]"><span className="line-clamp-3">{order.nota_staff || order.bundle?.name || "-"}</span></td>
                          <td className="p-3">{getOrderUnits(order)}</td>
                          <td className="p-3 font-medium text-amber-600">{getUnitBundle(order)}</td>
                          <td className="p-3">RM {getOrderFinalPrice(order).toFixed(2)}</td>
                          <td className="p-3">RM {getOrderFees(order).toFixed(2)}</td>
                          <td className="p-3">RM {(getOrderFinalPrice(order) + getOrderFees(order)).toFixed(2)}</td>
                          <td className="p-3">{((totalSales) => totalSales > 0 ? (getOrderFees(order) / totalSales * 100).toFixed(1) + "%" : "0.0%")(getOrderFinalPrice(order) + getOrderFees(order))}</td>
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
                          <td className="p-3">{order.date_payment || "-"}</td>
                          <td className="p-3">{order.state_customer || "-"}</td>
                          <td className="p-3">
                            <div className="max-w-xs">
                              <p className="text-sm truncate">{order.address_customer || "-"}</p>
                              <p className="text-xs text-muted-foreground">
                                {order.postcode_customer} {order.city_customer}
                              </p>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={19} className="text-center py-12 text-muted-foreground">
                          No success tracking orders found.
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
    </div>
  );
};

export default AccountSuccessTracking;
