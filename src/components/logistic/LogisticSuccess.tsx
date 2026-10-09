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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getMalaysiaDate, getMalaysiaStartOfMonth, formatDMY, fetchAllRows } from "@/lib/utils";
import { TablePagination } from "@/components/TablePagination";
import {
  Clock,
  Loader2,
  Printer,
  Search,
  DollarSign,
  CreditCard,
  MessageCircle,
  CheckCircle,
  Receipt,
  Ban,
  ExternalLink,
  Package,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { ReceiptViewer } from "@/components/ReceiptViewer";
import { PageHeader, StatCard, IconTile, TableSkeleton, EmptyState } from "@/components/common/SoftUI";
import DateApplyButton from '@/components/DateApplyButton';
import UnappliedDateNote from '@/components/UnappliedDateNote';

const PAYMENT_OPTIONS = ["All", "CASH", "COD"];
const PLATFORM_OPTIONS = ["All", "Tiktok", "Threads", "Facebook", "Database", "Google"];
const PAGE_SIZE_OPTIONS = [10, 50, 100, "All"] as const;

// Normalise a stored kurier to its base courier for grouping + filtering.
const baseCourier = (kurier?: string): string => {
  const k = (kurier || "").toLowerCase();
  if (k.includes("poslaju")) return "Poslaju";
  if (k.includes("ninjavan")) return "Ninjavan";
  if (k.includes("jnt")) return "JNT";
  if (k.includes("dhl")) return "DHL";
  if (k.includes("spx")) return "SPX";
  if (k.includes("tiktok")) return "Tiktok";
  return kurier?.trim() || "Lain";
};

const LogisticSuccess = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [viewingWaybillId, setViewingWaybillId] = useState<string | null>(null);

  // View a waybill INLINE (ParcelDaily's connoteURL is octet-stream → downloads);
  // route through merge-waybills so it returns application/pdf and opens in a tab.
  const handleViewWaybill = async (order: any) => {
    const url = order.waybill_url;
    if (!url) return;
    setViewingWaybillId(order.id);
    try {
      const { data, error } = await supabase.functions.invoke("merge-waybills", { body: { waybillUrls: [url] } });
      if (error || !data) throw new Error("view failed");
      const blob = new Blob([data], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
    } catch {
      window.open(url, "_blank");
    } finally {
      setViewingWaybillId(null);
    }
  };
  const today = getMalaysiaDate();
  const firstDayOfMonth = getMalaysiaStartOfMonth();

  // Filter states
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState('');
  const { nameByIdstaff } = useTeam();
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(today);
  // Picked dates; the data follows startDate/endDate, which only change on Filter.
  const [pendingStart, setPendingStart] = useState(startDate);
  const [pendingEnd, setPendingEnd] = useState(endDate);
  const applyDates = () => { setStartDate(pendingStart); setEndDate(pendingEnd); handleFilterChange(); };
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [platformFilter, setPlatformFilter] = useState("All");
  const [courierFilter, setCourierFilter] = useState("All");
  const [pageSize, setPageSize] = useState<number | "All">(50);
  const [currentPage, setCurrentPage] = useState(1);

  // Selection state
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [viewingPayment, setViewingPayment] = useState<any>(null);

  // Loading states
  const [isPrinting, setIsPrinting] = useState(false);

  // Success delivery states
  const [successOrderId, setSuccessOrderId] = useState<string | null>(null);
  const [successDate, setSuccessDate] = useState(today);

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

  // Fetch return orders - using new schema field names
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["logistic-success", startDate, endDate],
    queryFn: async () => {
      // Paginated: PostgREST caps a single response at max_rows (1000) no matter
      // the requested range, so page through every row.
      const build = () => {
        let query = supabase
          .from("customer_purchases")
          .select(`
            *,
            bundle:logistic_bundles(name, sku)
          `)
          .eq("delivery_status", "Success")
          .order("date_order", { ascending: false });

        if (startDate) {
          query = query.gte("date_order", startDate);
        }
        if (endDate) {
          query = query.lte("date_order", endDate);
        }
        return query;
      };
      return await fetchAllRows(build);
    },
  });

  // Helper function to get platform display value
  const getOrderPlatform = (order: any) => {
    if (order.jenis_platform) return order.jenis_platform;
    return null;
  };

  // Filter orders - using new schema field names
  const filteredOrders = orders.filter((order: any) => {
    if (teamFilter && (order.marketer_id_staff || '') !== teamFilter) return false;
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

    // Payment filter — "Pickup" matches by kurier (self-collect), else COD/CASH.
    {
      const cod = order.type_payment === "COD" || (order.kurier || "").includes("COD");
      const pickup = (order.kurier || "").toUpperCase().includes("PICKUP");
      if (paymentFilter === "Pickup") { if (!pickup) return false; }
      else if (paymentFilter === "COD") { if (!cod) return false; }
      else if (paymentFilter === "CASH") { if (cod || pickup) return false; }
      else if (paymentFilter !== "All" && order.type_payment !== paymentFilter) return false;
    }

    if (courierFilter !== "All" && baseCourier(order.kurier) !== courierFilter) {
      return false;
    }

    // Platform filter - filter by exact platform name
    if (platformFilter !== "All") {
      if (order.jenis_platform !== platformFilter) {
        return false;
      }
    }

    return true;
  });

  // Pagination
  const totalPages = pageSize === "All" ? 1 : Math.ceil(filteredOrders.length / pageSize);
  const paginatedOrders = pageSize === "All"
    ? filteredOrders
    : filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Counts - all platforms now use NinjaVan
  const isCodOrder = (o: any) => o.type_payment === "COD" || (o.kurier || "").includes("COD");
  const isPickupOrder = (o: any) => (o.kurier || "").toUpperCase().includes("PICKUP");

  const counts = {
    total: orders.length,
    ninjavanCod: orders.filter((o: any) => o.type_payment === "COD").length,
    ninjavanCash: orders.filter((o: any) => o.type_payment === "CASH").length,
    cod: orders.filter(isCodOrder).length,
    cash: orders.filter((o: any) => !isCodOrder(o)).length,
    pickup: orders.filter(isPickupOrder).length,
  };

  const courierStats = orders.reduce((acc: Record<string, { n: number; cod: number; cash: number }>, o: any) => {
    const c = baseCourier(o.kurier);
    const e = acc[c] || (acc[c] = { n: 0, cod: 0, cash: 0 });
    e.n++;
    isCodOrder(o) ? e.cod++ : e.cash++;
    return acc;
  }, {} as Record<string, { n: number; cod: number; cash: number }>);

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

    const selectedOrdersList = filteredOrders.filter((o: any) => selectedOrders.has(o.id));

    // Separate NinjaVan orders and Tiktok orders
    const ninjavanOrdersForPrint = selectedOrdersList.filter(
      (o: any) => getOrderPlatform(o) !== "Tiktok" && o.tracking_number
    );
    const marketplaceOrders = selectedOrdersList.filter(
      (o: any) => getOrderPlatform(o) === "Tiktok" && o.waybill_url
    );

    if (ninjavanOrdersForPrint.length === 0 && marketplaceOrders.length === 0) {
      toast.error("Selected orders do not have waybills to print");
      return;
    }

    setIsPrinting(true);

    try {
      // Handle NinjaVan orders
      if (ninjavanOrdersForPrint.length > 0) {
        const trackingNumbers = ninjavanOrdersForPrint.map((o: any) => o.tracking_number);

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
      }

      // Handle Tiktok orders (merge waybills)
      if (marketplaceOrders.length > 0) {
        const waybillUrls = marketplaceOrders.map((o: any) => o.waybill_url);

        const response = await supabase.functions.invoke("merge-waybills", {
          body: { waybillUrls },
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

  // Reverse a wrongly-marked Success back to Return (e.g. parcel actually bounced).
  const handleSuccessfulDelivery = async (order: any) => {
    if (!window.confirm(`Tukar order ${order.id_sale || ""} kepada Return?`)) return;
    try {
      const { error } = await supabase
        .from("customer_purchases")
        .update({
          delivery_status: "Return",
          seos: "Return",
          seo: null,
          date_return: getMalaysiaDate(),
        })
        .eq("id", order.id);

      if (error) throw error;

      toast.success(`${order.id_sale} ditukar kepada Return`);
      setSuccessOrderId(null);
      queryClient.invalidateQueries({ queryKey: ["logistic-success"] });
      queryClient.invalidateQueries({ queryKey: ["logistic-return"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to update order");
    }
  };

  const handleFilterChange = () => {
    setCurrentPage(1);
    setSelectedOrders(new Set());
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Success Management"
        description="View and manage returned orders"
        icon={CheckCircle}
        tone="brand"
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={Clock}
          tone="green"
          label="Total Success"
          value={counts.total}
          active={paymentFilter === "All"}
          onClick={() => { setPaymentFilter("All"); handleFilterChange(); }}
        />
        <StatCard
          icon={DollarSign}
          tone="amber"
          label="COD Orders"
          value={counts.cod}
          active={paymentFilter === "COD"}
          onClick={() => { setPaymentFilter(paymentFilter === "COD" ? "All" : "COD"); handleFilterChange(); }}
        />
        <StatCard
          icon={CreditCard}
          tone="cyan"
          label="CASH Orders"
          value={counts.cash}
          active={paymentFilter === "CASH"}
          onClick={() => { setPaymentFilter(paymentFilter === "CASH" ? "All" : "CASH"); handleFilterChange(); }}
        />
        <StatCard
          icon={Package}
          tone="blue"
          label="Total Pickup"
          value={counts.pickup}
          active={paymentFilter === "Pickup"}
          onClick={() => { setPaymentFilter(paymentFilter === "Pickup" ? "All" : "Pickup"); handleFilterChange(); }}
        />
      </div>

      {/* Courier summary cards — click a card to filter the table by that courier.
          Each shows its COD / Cash split. */}
      {Object.keys(courierStats).length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <StatCard
            icon={Truck}
            tone="slate"
            label="Semua Kurier"
            value={counts.total}
            active={courierFilter === "All"}
            onClick={() => { setCourierFilter("All"); handleFilterChange(); }}
            hint={<span className="flex flex-wrap gap-x-2 whitespace-normal">
              <span className="font-medium text-orange-600">COD {counts.cod}</span>
              <span className="font-medium text-green-600">Cash {counts.cash}</span>
            </span>}
          />
          {Object.entries(courierStats).sort((a, b) => b[1].n - a[1].n).map(([courier, st]) => (
            <StatCard
              key={courier}
              icon={Truck}
              tone="purple"
              label={courier}
              value={st.n}
              active={courierFilter === courier}
              onClick={() => { setCourierFilter(courierFilter === courier ? "All" : courier); handleFilterChange(); }}
              hint={<span className="flex flex-wrap gap-x-2 whitespace-normal">
                <span className="font-medium text-orange-600">COD {st.cod}</span>
                <span className="font-medium text-green-600">Cash {st.cash}</span>
              </span>}
            />
          ))}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="relative w-full sm:min-w-[220px] sm:flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search... (use + to combine filters)"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); handleFilterChange(); }}
                  className="pl-10"
                />
              </div>
              <TeamFilter value={teamFilter} onChange={(v) => { setTeamFilter(v); handleFilterChange(); }} />
              <Button
                onClick={() => { setStartDate(""); setPendingStart(""); setEndDate(""); setPendingEnd(""); }}
                className="h-10 w-full shrink-0 sm:w-auto"
              >
                <Search className="w-4 h-4 mr-2" />
                Search
              </Button>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Input
                  type="date"
                  value={pendingStart}
                  onChange={(e) => setPendingStart(e.target.value)}
                  className="w-full sm:w-40"
                />
                <Input
                  type="date"
                  value={pendingEnd}
                  onChange={(e) => setPendingEnd(e.target.value)}
                  className="w-full sm:w-40"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2"><DateApplyButton onClick={applyDates} /><UnappliedDateNote pendingStart={pendingStart} pendingEnd={pendingEnd} startDate={startDate} endDate={endDate} /></div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-sm text-muted-foreground sm:w-auto">Platform:</span>
                <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); handleFilterChange(); }}>
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt === "All" ? "All Order" : opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-sm text-muted-foreground sm:w-auto">Payment:</span>
                <Select value={paymentFilter} onValueChange={(v) => { setPaymentFilter(v); handleFilterChange(); }}>
                  <SelectTrigger className="w-full sm:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-sm text-muted-foreground sm:w-auto">Show:</span>
                <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(v === "All" ? "All" : Number(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-full sm:w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size.toString()} value={size.toString()}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">entries</span>
              </div>

              <div className="flex flex-wrap gap-2 sm:ml-auto">
                <Button
                  variant="outline"
                  onClick={handleBulkPrint}
                  disabled={selectedOrders.size === 0 || isPrinting}
                  className="w-full sm:w-auto"
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
            <TableSkeleton className="p-4" rows={8} cols={6} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-2 text-left w-10">
                        <Checkbox
                          checked={isAllSelected}
                          onCheckedChange={handleSelectAll}
                        />
                      </th>
                      <th className="p-2 text-left">No</th>
                      <th className="p-2 text-left text-blue-600 dark:text-blue-400">ID Staff</th>
                      <th className="p-2 text-left text-blue-600 dark:text-blue-400">Nama</th>
                      <th className="p-2 text-left">Id Sales</th>
                      <th className="p-2 text-left">Tarikh Success</th>
                      <th className="p-2 text-left">Tarikh Processed</th>
                      <th className="p-2 text-left">Tarikh Order</th>
                      <th className="p-2 text-left">Nama Pelanggan</th>
                      <th className="p-2 text-left">Phone</th>
                      <th className="p-2 text-left">Produk</th>
                      <th className="p-2 text-left">Kurier</th>
                      <th className="p-2 text-left">Tracking</th>
                      <th className="p-2 text-left">Total Sales</th>
                      <th className="p-2 text-left text-rose-500">Cost Product</th>
                      <th className="p-2 text-left text-amber-600">Cost Postage</th>
                      <th className="p-2 text-left">Cara Bayaran</th>
                      <th className="p-2 text-left">Detail Bayaran</th>
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
                        <tr key={order.id} className="border-b transition-colors hover:bg-muted/40">
                          <td className="p-2">
                            <Checkbox
                              checked={selectedOrders.has(order.id)}
                              onCheckedChange={(checked) => handleSelectOrder(order.id, !!checked)}
                            />
                          </td>
                          <td className="p-2">{pageSize === "All" ? index + 1 : (currentPage - 1) * (pageSize as number) + index + 1}</td>
                          <td className="p-2 whitespace-nowrap font-mono text-blue-600 dark:text-blue-400">{order.marketer_id_staff || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{nameByIdstaff.get(order.marketer_id_staff || '') || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.id_sale || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{formatDMY(order.date_payment || order.date_processed)}</td>
                          <td className="p-2 whitespace-nowrap">{formatDMY(order.date_processed)}</td>
                          <td className="p-2 whitespace-nowrap">{formatDMY(order.date_order)}</td>
                          <td className="p-2">{order.name_customer || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.phone_customer || "-"}</td>
                          <td className="p-2">
                            <span className="truncate max-w-[150px] block">{order.bundle?.name || "-"}</span>
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            <span className="text-xs">{order.kurier || "-"}</span>
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            <span className="font-mono text-xs">{order.tracking_number || "-"}</span>
                          </td>
                          <td className="p-2 whitespace-nowrap">RM {Number(order.total_sale || 0).toFixed(2)}</td>
                          <td className="p-2 whitespace-nowrap text-rose-500">RM {Number(order.cost_baseproduct || 0).toFixed(2)}</td>
                          <td className="p-2 whitespace-nowrap text-amber-600">
                            RM {Number(order.cost_postage || 0).toFixed(2)}
                            {order.cost_postage_pd != null && Number(order.cost_postage_pd) !== Number(order.cost_postage || 0) && (
                              <div className="text-[10px] text-muted-foreground" title="Harga sebenar ParcelDaily (rujukan HQ)">PD RM {Number(order.cost_postage_pd).toFixed(2)}</div>
                            )}
                          </td>
                          <td className="p-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${order.type_payment === "COD" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                              {order.type_payment || "-"}
                            </span>
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            {(order.type_payment === "CASH" || order.type_payment === "Pickup")
                              ? <Button size="sm" variant="outline" className="h-7" onClick={() => setViewingPayment(order)}><Receipt className="w-3.5 h-3.5 mr-1" />Lihat</Button>
                              : <span className="text-xs text-muted-foreground">-</span>}
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                              {order.delivery_status || "-"}
                            </span>
                            <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${order.delivery_status_manual ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                              {order.delivery_status_manual ? "Manual" : "Auto"}
                            </span>
                          </td>
                          <td className="p-2">
                            <span className={`text-xs font-medium ${
                              getOrderPlatform(order) === "Tiktok" ? "text-pink-600" :
                              getOrderPlatform(order) === "Threads" ? "text-slate-500" :
                              getOrderPlatform(order) === "Facebook" ? "text-blue-600" :
                              getOrderPlatform(order) === "Google" ? "text-green-600" :
                              getOrderPlatform(order) === "Database" ? "text-purple-600" :
                              "text-gray-600"
                            }`}>
                              {getOrderPlatform(order) || "-"}
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
                              <button onClick={() => handleViewWaybill(order)} disabled={viewingWaybillId === order.id} className="text-blue-600 hover:underline text-xs inline-flex items-center gap-1 disabled:opacity-50">
                                {viewingWaybillId === order.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                View
                              </button>
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
                              variant="outline"
                              size="sm"
                              onClick={() => handleSuccessfulDelivery(order)}
                              className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <CheckCircle className="w-3.5 h-3.5 mr-1" />
                              Tanda Return
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={27} className="p-0">
                          <EmptyState icon={CheckCircle} title="No success orders found." />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <TablePagination
                page={currentPage}
                pageSize={pageSize === 'All' ? (filteredOrders.length || 1) : (pageSize as number)}
                total={filteredOrders.length}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Bayaran — receipt image + payment details for CASH / Pickup. */}
      <Dialog open={!!viewingPayment} onOpenChange={(o) => { if (!o) setViewingPayment(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><IconTile icon={Receipt} tone="green" size="sm" /> Detail Bayaran — {viewingPayment?.id_sale || viewingPayment?.name_customer || ""}</DialogTitle>
          </DialogHeader>
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

export default LogisticSuccess;
