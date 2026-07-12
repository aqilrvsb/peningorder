import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
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
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, getMalaysiaDate, fetchAllRows } from "@/lib/utils";
import {
  Package,
  Clock,
  Loader2,
  Printer,
  Search,
  DollarSign,
  Wallet,
  MessageCircle,
  Filter,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE_OPTIONS = [10, 50, 100];

const LogisticPendingTracking = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Filter states
  const [search, setSearch] = useState("");
  const [pendingStart, setPendingStart] = useState(getMalaysiaStartOfMonth());
  const [pendingEnd, setPendingEnd] = useState(getMalaysiaEndOfMonth());
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  const [platformFilter, setPlatformFilter] = useState("all");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Selection state
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  // Loading states
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Fetch all profiles for marketer name and whatsapp lookup
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

  // Create maps for quick lookup by username (marketer_id_staff)
  const profilesMap = new Map(profiles.map((p: any) => [p.username, p.full_name]));
  const whatsappMap = new Map(profiles.map((p: any) => [p.username, p.whatsapp_number]));

  // Fetch pending tracking orders (Shipped + SEO not successful) - includes both COD and CASH
  // All platforms now use NinjaVan (including Tiktok)
  // Filter by date_order (not date_processed)
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ["logistic-pending-tracking", startDate, endDate],
    queryFn: async () => {
      // Use fetchAllRows to bypass the 1000-row limit
      const data = await fetchAllRows(() => {
        let query = supabase
          .from("customer_purchases")
          .select(`
            *,
            bundle:logistic_bundles(name, sku)
          `)
          .eq("delivery_status", "Shipped")
          .order("date_order", { ascending: false });

        if (startDate) query = query.gte("date_order", startDate);
        if (endDate) query = query.lte("date_order", endDate);

        return query;
      });
      return data || [];
    },
  });

  // Filter orders
  const filteredOrders = orders.filter((order: any) => {
    // Platform filter
    if (platformFilter !== "all" && (order.jenis_platform || "Manual") !== platformFilter) return false;

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
  const totalPages = Math.ceil(filteredOrders.length / pageSize);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Helper: extract first number from bundle SKU (e.g., "GSI-4 + SBNM-1" → 4)
  const getFirstSkuQty = (sku: string | null | undefined): number => {
    if (!sku) return 0;
    const match = sku.match(/-(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  };
  const getUnitBundle = (order: any): number => {
    return (Number(order.unit) || 0) * getFirstSkuQty(order.bundle?.sku);
  };

  // Counts
  const counts = {
    total: filteredOrders.length,
    cod: filteredOrders.filter((o: any) => o.type_payment === "COD").length,
    totalSales: filteredOrders.reduce((sum: number, o: any) => sum + (Number(o.total_sale) || 0), 0),
    totalUnitBundle: filteredOrders.reduce((sum: number, o: any) => sum + getUnitBundle(o), 0),
  };

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

  // Bulk Print action
  const handleBulkPrint = async () => {
    if (selectedOrders.size === 0) {
      toast.error("Please select orders to print waybills");
      return;
    }

    const selectedOrdersList = paginatedOrders.filter((o: any) => selectedOrders.has(o.id));

    // Only NinjaVan orders in pending tracking
    const ninjavanOrders = selectedOrdersList.filter((o: any) => o.tracking_number);

    if (ninjavanOrders.length === 0) {
      toast.error("Selected orders do not have waybills to print");
      return;
    }

    setIsPrinting(true);

    try {
      const trackingNumbers = ninjavanOrders.map((o: any) => o.tracking_number);

      const response = await supabase.functions.invoke("ninjavan-waybill", {
        body: { trackingNumbers },
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
    } catch (error: any) {
      toast.error(error.message || "Failed to generate waybills");
    } finally {
      setIsPrinting(false);
    }
  };

  // Mark single order as COD received
  const handleCODReceived = async (orderId: string) => {
    const today = getMalaysiaDate();
    try {
      await supabase
        .from("customer_purchases")
        .update({
          seo: "Successful Delivery",
          seos: "Successful Delivery",
          date_payment: today,
        })
        .eq("id", orderId);

      toast.success("COD payment marked as received");
      queryClient.invalidateQueries({ queryKey: ["logistic-pending-tracking"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to update order");
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

  const handleFilterChange = () => {
    setCurrentPage(1);
    setSelectedOrders(new Set());
  };

  const applyDateFilter = () => {
    setStartDate(pendingStart);
    setEndDate(pendingEnd);
    handleFilterChange();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pending Tracking</h1>
          <p className="text-muted-foreground text-sm">
            Track orders awaiting payment confirmation
          </p>
        </div>
        {/* Stats inline */}
        <div className="flex gap-4">
          <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <Clock className="w-5 h-5 text-purple-500" />
            <div>
              <p className="text-lg font-bold">{counts.total}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <DollarSign className="w-5 h-5 text-green-500" />
            <div>
              <p className="text-lg font-bold">RM {counts.totalSales.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Collection</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <Package className="w-5 h-5 text-amber-500" />
            <div>
              <p className="text-lg font-bold">{counts.totalUnitBundle}</p>
              <p className="text-xs text-muted-foreground">Unit Bundle</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleSync} disabled={isSyncing} className="self-center">
            <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
            Sync
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search... (use + to combine)"
                value={search}
                onChange={(e) => { setSearch(e.target.value); handleFilterChange(); }}
                className="pl-10 h-9"
              />
            </div>
            <Input
              type="date"
              value={pendingStart}
              onChange={(e) => setPendingStart(e.target.value)}
              className="w-36 h-9"
            />
            <Input
              type="date"
              value={pendingEnd}
              onChange={(e) => setPendingEnd(e.target.value)}
              className="w-36 h-9"
            />
            <Button size="sm" onClick={applyDateFilter} className="h-9">
              <Filter className="w-4 h-4 mr-1" />
              Apply Filter
            </Button>
            <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); handleFilterChange(); }}>
              <SelectTrigger className="w-36 h-9">
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
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
              <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="w-16 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkPrint}
              disabled={selectedOrders.size === 0 || isPrinting}
            >
              {isPrinting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Printer className="w-4 h-4 mr-1" />}
              Print ({selectedOrders.size})
            </Button>
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
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-left w-10">
                        <Checkbox
                          checked={isAllSelected}
                          onCheckedChange={handleSelectAll}
                        />
                      </th>
                      <th className="p-2 text-left">No</th>
                      <th className="p-2 text-left">Id Sales</th>
                      <th className="p-2 text-left">Tarikh Processed</th>
                      <th className="p-2 text-left">Tarikh Order</th>
                      <th className="p-2 text-left">Nama Pelanggan</th>
                      <th className="p-2 text-left">Phone</th>
                      <th className="p-2 text-left">Produk</th>
                      <th className="p-2 text-left">Unit</th>
                      <th className="p-2 text-left">Unit Bundle</th>
                      <th className="p-2 text-left">Tracking</th>
                      <th className="p-2 text-left">Total Sales</th>
                      <th className="p-2 text-left">Cara Bayaran</th>
                      <th className="p-2 text-left">Delivery Status</th>
                      <th className="p-2 text-left">Jenis Platform</th>
                      <th className="p-2 text-left">Jenis Closing</th>
                      <th className="p-2 text-left">Jenis Customer</th>
                      <th className="p-2 text-left">Negeri</th>
                      <th className="p-2 text-left">Alamat</th>
                      <th className="p-2 text-left">Waybill</th>
                      <th className="p-2 text-left">Parcel Status</th>
                      <th className="p-2 text-left">WhatsApp</th>
                      <th className="p-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.length > 0 ? (
                      paginatedOrders.map((order: any, index: number) => (
                        <tr key={order.id} className="border-b hover:bg-muted/30">
                          <td className="p-2">
                            <Checkbox
                              checked={selectedOrders.has(order.id)}
                              onCheckedChange={(checked) => handleSelectOrder(order.id, !!checked)}
                            />
                          </td>
                          <td className="p-2">{(currentPage - 1) * pageSize + index + 1}</td>
                          <td className="p-2 whitespace-nowrap">{order.id_sale || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.date_processed || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.date_order || "-"}</td>
                          <td className="p-2">{order.name_customer || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.phone_customer || "-"}</td>
                          <td className="p-2">
                            <span className="truncate max-w-[150px] block">{order.bundle?.name || "-"}</span>
                          </td>
                          <td className="p-2 text-center">{order.unit || 1}</td>
                          <td className="p-2 text-center font-medium text-amber-600">{getUnitBundle(order)}</td>
                          <td className="p-2 whitespace-nowrap">
                            <span className="font-mono text-xs">{order.tracking_number || "-"}</span>
                          </td>
                          <td className="p-2 whitespace-nowrap">RM {Number(order.total_sale || 0).toFixed(2)}</td>
                          <td className="p-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${order.type_payment === "COD" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                              {order.type_payment || "-"}
                            </span>
                          </td>
                          <td className="p-2">
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                              {order.delivery_status || "-"}
                            </span>
                          </td>
                          <td className="p-2">
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
                          <td className="p-2 text-xs">{order.jenis_closing || "-"}</td>
                          <td className="p-2 text-xs">{order.jenis_customer || "-"}</td>
                          <td className="p-2 text-xs">{order.state_customer || "-"}</td>
                          <td className="p-2">
                            <div className="max-w-[150px]">
                              <p className="text-xs truncate">{order.address_customer || "-"}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {order.postcode_customer} {order.city_customer}
                              </p>
                            </div>
                          </td>
                          <td className="p-2">
                            {order.waybill_url ? (
                              <a href={order.waybill_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                                View
                              </a>
                            ) : "-"}
                          </td>
                          <td className="p-2">
                            <span className={`text-xs ${order.seos === "Successful Delivery" ? "text-green-600" : "text-gray-500"}`}>
                              {order.seos || "-"}
                            </span>
                          </td>
                          <td className="p-2">
                            {whatsappMap.get(order.marketer_id_staff) && (
                              <a
                                href={`https://wa.me/6${(whatsappMap.get(order.marketer_id_staff) || "").replace(/^0/, "").replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center w-7 h-7 bg-green-500 hover:bg-green-600 text-white rounded"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </a>
                            )}
                          </td>
                          <td className="p-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 h-7 px-2 text-xs"
                              onClick={() => handleCODReceived(order.id)}
                            >
                              <Wallet className="w-3 h-3 mr-1" />
                              COD Received
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={22} className="text-center py-12 text-muted-foreground">
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
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredOrders.length)} of {filteredOrders.length} entries
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
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

export default LogisticPendingTracking;
