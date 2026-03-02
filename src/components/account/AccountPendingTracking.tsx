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
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, getMalaysiaDate } from "@/lib/utils";
import {
  Package,
  Clock,
  Loader2,
  Printer,
  Search,
  DollarSign,
  Wallet,
  Save,
  RotateCcw,
  Upload,
  Download,
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
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [trackingSearch, setTrackingSearch] = useState("");

  // Selection state
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  // Bulk update mode: "online" (FB/Database/Google) or "marketplace" (Shopee/Tiktok XLSX)
  const [bulkMode, setBulkMode] = useState<"online" | "marketplace">("online");

  // Bulk update states (online)
  const [bulkStatus, setBulkStatus] = useState<"Success" | "Return">("Success");
  const [bulkDate, setBulkDate] = useState("");
  const [bulkTrackingList, setBulkTrackingList] = useState("");
  const [bulkReasonReturn, setBulkReasonReturn] = useState("");
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // XLSX import states (marketplace)
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Individual update states
  const [individualStatus, setIndividualStatus] = useState<"Success" | "Return">("Success");
  const [individualDate, setIndividualDate] = useState("");
  const [individualReasonReturn, setIndividualReasonReturn] = useState("");
  const [isIndividualUpdating, setIsIndividualUpdating] = useState(false);

  // Loading states
  const [isPrinting, setIsPrinting] = useState(false);

  // Not-found tracking dialog
  const [notFoundDialogOpen, setNotFoundDialogOpen] = useState(false);
  const [alreadyCollectedTrackings, setAlreadyCollectedTrackings] = useState<{ tracking: string; platform: string }[]>([]);
  const [notInDbTrackings, setNotInDbTrackings] = useState<{ tracking: string; price: number; fees: number }[]>([]);

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

  // Fetch pending tracking orders: Shipped + SEO not successful
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["account-pending-tracking", startDate, endDate, trackingSearch],
    queryFn: async () => {
      let query = supabase
        .from("customer_purchases")
        .select(`*, bundle:logistic_bundles(name, sku)`)
        .eq("delivery_status", "Shipped")
        .or("seo.is.null,seo.neq.Successful Delivery")
        .order("date_order", { ascending: false });

      if (trackingSearch) {
        query = query.eq("tracking_number", trackingSearch);
      } else {
        if (startDate) query = query.gte("date_order", startDate);
        if (endDate) query = query.lte("date_order", endDate);
      }

      const { data, error } = await query.range(0, 49999);
      if (error) throw error;
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
  };

  // Platform breakdown (Facebook, Tiktok, Shopee, Database, Google)
  const PLATFORM_NAMES = ["Facebook", "Tiktok", "Shopee", "Database", "Google"];
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

      // Handle Shopee/Tiktok orders (merge waybills)
      if (marketplaceOrders.length > 0) {
        const waybillUrls = marketplaceOrders.map((o: any) => o.waybill_url);

        const response = await supabase.functions.invoke("merge-waybills", {
          body: { waybillUrls },
          headers: { Authorization: `Bearer ${session?.session?.access_token}` },
        });

        if (response.error) {
          console.error("Marketplace waybill error:", response.error);
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

  // Bulk update by tracking numbers
  const handleBulkUpdate = async () => {
    if (!bulkTrackingList.trim()) {
      toast.error("Please enter tracking numbers");
      return;
    }
    if (!bulkDate) {
      toast.error("Please select a date");
      return;
    }

    const trackingNumbers = bulkTrackingList
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    if (trackingNumbers.length === 0) {
      toast.error("No valid tracking numbers found");
      return;
    }

    // Query DB directly for matching pending orders (not limited by current date/filter)
    const { data: pendingOrders } = await supabase
      .from("customer_purchases")
      .select("id, tracking_number")
      .eq("delivery_status", "Shipped")
      .or("seo.is.null,seo.neq.Successful Delivery")
      .in("tracking_number", trackingNumbers);

    if (!pendingOrders || pendingOrders.length === 0) {
      toast.error("No matching orders found for the tracking numbers");
      return;
    }

    setIsBulkUpdating(true);

    try {
      let updateData: any;
      if (bulkStatus === "Success") {
        updateData = {
          seo: "Successful Delivery",
          date_payment: bulkDate,
          delivery_status: "Shipped",
        };
      } else {
        updateData = {
          seo: "Return",
          date_return: bulkDate,
          delivery_status: "Return",
          reason_return: bulkReasonReturn || null,
        };
      }

      const updatePromises = pendingOrders.map((order: any) =>
        supabase
          .from("customer_purchases")
          .update(updateData)
          .eq("id", order.id)
      );

      await Promise.all(updatePromises);

      toast.success(`${pendingOrders.length} order(s) updated to ${bulkStatus}`);
      setBulkTrackingList("");
      setBulkDate("");
      setBulkReasonReturn("");
      queryClient.invalidateQueries({ queryKey: ["account-pending-tracking"] });
      queryClient.invalidateQueries({ queryKey: ["account-return"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to update orders");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // XLSX import for Shopee/Tiktok bulk update
  const handleXlsxImport = async () => {
    if (!xlsxFile) {
      toast.error("Please select an XLSX file");
      return;
    }

    setIsImporting(true);
    try {
      const data = await xlsxFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Skip header row, parse data rows
      const updates: { tracking: string; tarikh: string; price: number; fees: number }[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[0]) continue;
        const tracking = String(row[0]).trim();
        // Handle date: could be YYYY/MM/DD or serial number
        let tarikh = "";
        if (row[1]) {
          if (typeof row[1] === "number") {
            // Excel serial date
            const d = XLSX.SSF.parse_date_code(row[1]);
            tarikh = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
          } else {
            // String like "2026/02/23" -> "2026-02-23"
            tarikh = String(row[1]).replace(/\//g, "-").trim();
          }
        }
        const price = Number(row[2]) || 0;
        const fees = Number(row[3]) || 0;
        if (tracking) {
          updates.push({ tracking, tarikh, price, fees });
        }
      }

      if (updates.length === 0) {
        toast.error("No valid rows found in the file");
        setIsImporting(false);
        return;
      }

      // Query DB directly for matching pending orders (not limited by current date/filter)
      const trackingNumbers = updates.map((u) => u.tracking);
      const { data: pendingOrders } = await supabase
        .from("customer_purchases")
        .select("id, tracking_number")
        .eq("delivery_status", "Shipped")
        .or("seo.is.null,seo.neq.Successful Delivery")
        .in("tracking_number", trackingNumbers);

      const pendingMap = new Map<string, string>();
      for (const o of pendingOrders || []) {
        pendingMap.set(o.tracking_number, o.id);
      }

      let matched = 0;
      const notFoundList: { tracking: string; price: number; fees: number }[] = [];
      for (const item of updates) {
        const orderId = pendingMap.get(item.tracking);
        if (orderId) {
          await supabase
            .from("customer_purchases")
            .update({
              date_payment: item.tarikh || null,
              total_sale: item.price,
              cost_postage: item.fees,
              seo: "Successful Delivery",
            })
            .eq("id", orderId);
          matched++;
        } else {
          notFoundList.push({ tracking: item.tracking, price: item.price, fees: item.fees });
        }
      }

      toast.success(`${matched} order(s) updated.`);
      if (notFoundList.length > 0) {
        // Query DB to categorize: already collected vs not in database
        const trackingNums = notFoundList.map((n) => n.tracking);
        const { data: existingOrders } = await supabase
          .from("customer_purchases")
          .select("tracking_number, seo, jenis_platform")
          .in("tracking_number", trackingNums);

        const existingMap = new Map<string, any>();
        for (const o of existingOrders || []) {
          existingMap.set(o.tracking_number, o);
        }

        const collected: { tracking: string; platform: string }[] = [];
        const notInDb: { tracking: string; price: number; fees: number }[] = [];
        for (const item of notFoundList) {
          const order = existingMap.get(item.tracking);
          if (order) {
            // Determine platform
            let plat = "Unknown";
            if (order.jenis_platform) {
              plat = order.jenis_platform;
            }
            collected.push({ tracking: item.tracking, platform: plat });
          } else {
            notInDb.push(item);
          }
        }

        setAlreadyCollectedTrackings(collected);
        setNotInDbTrackings(notInDb);
        setNotFoundDialogOpen(true);
      }
      setXlsxFile(null);
      // Reset file input
      const fileInput = document.getElementById("xlsx-file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      queryClient.invalidateQueries({ queryKey: ["account-pending-tracking"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to import XLSX");
    } finally {
      setIsImporting(false);
    }
  };

  // Individual update by selected orders (checkbox selection)
  const handleIndividualUpdate = async () => {
    if (selectedOrders.size === 0) {
      toast.error("Please select orders to update");
      return;
    }
    if (!individualDate) {
      toast.error("Please select a date");
      return;
    }

    const ordersToUpdate = paginatedOrders.filter((o: any) => selectedOrders.has(o.id));

    if (ordersToUpdate.length === 0) {
      toast.error("No orders selected");
      return;
    }

    setIsIndividualUpdating(true);

    try {
      let updateData: any;
      if (individualStatus === "Success") {
        updateData = {
          seo: "Successful Delivery",
          date_payment: individualDate,
          delivery_status: "Shipped",
        };
      } else {
        updateData = {
          seo: "Return",
          date_return: individualDate,
          delivery_status: "Return",
          reason_return: individualReasonReturn || null,
        };
      }

      const updatePromises = ordersToUpdate.map((order: any) =>
        supabase
          .from("customer_purchases")
          .update(updateData)
          .eq("id", order.id)
      );

      await Promise.all(updatePromises);

      toast.success(`${ordersToUpdate.length} order(s) updated to ${individualStatus}`);
      setSelectedOrders(new Set());
      setIndividualDate("");
      setIndividualReasonReturn("");
      queryClient.invalidateQueries({ queryKey: ["account-pending-tracking"] });
      queryClient.invalidateQueries({ queryKey: ["account-return"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to update orders");
    } finally {
      setIsIndividualUpdating(false);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Pending Tracking</h1>
        <p className="text-muted-foreground mt-2">
          Track shipped orders awaiting collection
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      {/* Bulk Update Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 mb-4">
            <h3 className="font-semibold">Bulk Update</h3>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={bulkMode === "online" ? "default" : "outline"}
                onClick={() => setBulkMode("online")}
              >
                Online (FB/DB/Google)
              </Button>
              <Button
                size="sm"
                variant={bulkMode === "marketplace" ? "default" : "outline"}
                onClick={() => setBulkMode("marketplace")}
              >
                Shopee / Tiktok
              </Button>
            </div>
          </div>

          {bulkMode === "online" ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <Label>Tracking Numbers (one per line)</Label>
                <Textarea
                  placeholder="Enter tracking numbers..."
                  value={bulkTrackingList}
                  onChange={(e) => setBulkTrackingList(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="space-y-4">
                <div>
                  <Label>Status</Label>
                  <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as "Success" | "Return")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Success">Success</SelectItem>
                      <SelectItem value="Return">Return</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={bulkDate}
                    onChange={(e) => setBulkDate(e.target.value)}
                  />
                </div>
                {bulkStatus === "Return" && (
                  <div>
                    <Label>Reason Return</Label>
                    <Input
                      placeholder="Enter reason for return..."
                      value={bulkReasonReturn}
                      onChange={(e) => setBulkReasonReturn(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-end">
                <Button onClick={handleBulkUpdate} disabled={isBulkUpdating} className="w-full">
                  {isBulkUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Update Orders
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Import XLSX file from Shopee/Tiktok settlement. Columns: Tracking No | Date | Total Price | Fees
              </p>
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1">
                  <Label>Settlement File (.xlsx)</Label>
                  <Input
                    id="xlsx-file-input"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => setXlsxFile(e.target.files?.[0] || null)}
                    className="cursor-pointer"
                  />
                </div>
                <Button onClick={handleXlsxImport} disabled={isImporting || !xlsxFile} className="w-full sm:w-auto">
                  {isImporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                  Import & Update
                </Button>
              </div>
              {xlsxFile && (
                <p className="text-xs text-muted-foreground">
                  Selected: {xlsxFile.name}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Individual Update by Selection */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-4">Update by Selection</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Select orders from the table below using checkboxes, then update them here
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-end flex-wrap">
            <div className="flex-1 sm:flex-none">
              <Label>Selected Orders</Label>
              <div className="text-2xl font-bold text-primary">{selectedOrders.size}</div>
            </div>
            <div className="w-full sm:w-40">
              <Label>Status</Label>
              <Select value={individualStatus} onValueChange={(v) => setIndividualStatus(v as "Success" | "Return")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Success">Success</SelectItem>
                  <SelectItem value="Return">Return</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-40">
              <Label>Date</Label>
              <Input
                type="date"
                value={individualDate}
                onChange={(e) => setIndividualDate(e.target.value)}
              />
            </div>
            {individualStatus === "Return" && (
              <div className="w-full sm:w-48">
                <Label>Reason Return</Label>
                <Input
                  placeholder="Enter reason..."
                  value={individualReasonReturn}
                  onChange={(e) => setIndividualReasonReturn(e.target.value)}
                />
              </div>
            )}
            <Button
              onClick={handleIndividualUpdate}
              disabled={isIndividualUpdating || selectedOrders.size === 0}
              className="w-full sm:w-auto"
            >
              {isIndividualUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Update Selected ({selectedOrders.size})
            </Button>
          </div>
        </CardContent>
      </Card>

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
                      <th className="p-3 text-left">Qty</th>
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
                          <td className="p-3 font-mono text-xs">{order.marketer_id_staff || "HQ"}</td>
                          <td className="p-3">{profilesMap.get(order.marketer_id_staff) || order.marketer_id_staff || "HQ"}</td>
                          <td className="p-3">{order.name_customer || "-"}</td>
                          <td className="p-3">{order.phone_customer || "-"}</td>
                          <td className="p-3 min-w-[280px]"><span className="line-clamp-3">{order.nota_staff || order.bundle?.name || "-"}</span></td>
                          <td className="p-3">{order.unit || 1}</td>
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
                        <td colSpan={18} className="text-center py-12 text-muted-foreground">
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

      {/* Not Found Tracking Dialog */}
      <Dialog open={notFoundDialogOpen} onOpenChange={setNotFoundDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-red-600">
              {alreadyCollectedTrackings.length + notInDbTrackings.length} Tracking(s) Not Updated
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[55vh] space-y-4 py-2">
            {alreadyCollectedTrackings.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-green-700 mb-2">
                  Already Collection Success ({alreadyCollectedTrackings.length})
                </p>
                <div className="space-y-1.5">
                  {alreadyCollectedTrackings.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded border border-green-200 bg-green-50">
                      <span className="font-mono text-sm">{item.tracking}</span>
                      {item.platform.toLowerCase().includes("shopee") ? (
                        <a
                          href={`https://seller.shopee.com.my/portal/sale/order?search=${encodeURIComponent(item.tracking)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700 hover:bg-orange-200"
                        >
                          Shopee
                        </a>
                      ) : item.platform.toLowerCase().includes("tiktok") ? (
                        <a
                          href={`https://seller-my.tiktok.com/order?search=${encodeURIComponent(item.tracking)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                        >
                          Tiktok
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">{item.platform}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {notInDbTrackings.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-red-700">
                    Not Exist in Database ({notInDbTrackings.length})
                  </p>
                  <div className="flex gap-3 text-xs">
                    <span className="font-semibold">Settlement: <span className="text-red-700">RM {notInDbTrackings.reduce((s, i) => s + i.price, 0).toFixed(2)}</span></span>
                    <span className="font-semibold">Fees: <span className="text-red-700">RM {notInDbTrackings.reduce((s, i) => s + i.fees, 0).toFixed(2)}</span></span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {notInDbTrackings.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded border border-red-200 bg-red-50">
                      <div>
                        <span className="font-mono text-sm">{item.tracking}</span>
                        <span className="ml-2 text-xs text-muted-foreground">RM {item.price.toFixed(2)} | Fees: RM {item.fees.toFixed(2)}</span>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <a
                          href={`https://seller.shopee.com.my/portal/sale/order?search=${encodeURIComponent(item.tracking)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700 hover:bg-orange-200"
                        >
                          Shopee
                        </a>
                        <a
                          href={`https://seller-my.tiktok.com/order?search=${encodeURIComponent(item.tracking)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                        >
                          Tiktok
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotFoundDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountPendingTracking;
