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
import { format, startOfMonth } from "date-fns";
import { getMalaysiaDate } from "@/lib/utils";
import {
  Package,
  Truck,
  Clock,
  Loader2,
  Printer,
  Search,
  ShoppingBag,
  Music2,
  DollarSign,
  CreditCard,
  Trash2,
  RotateCcw,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import Swal from "sweetalert2";

const PAYMENT_OPTIONS = ["All", "CASH", "COD"];
const PLATFORM_OPTIONS = ["All", "Ninjavan", "Tiktok", "Shopee"];
const PAGE_SIZE_OPTIONS = [10, 50, 100, "All"] as const;

const LogisticProcessed = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = getMalaysiaDate();
  const firstDayOfMonth = format(startOfMonth(new Date()), "yyyy-MM-dd");

  // Filter states
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [platformFilter, setPlatformFilter] = useState("All");
  const [pageSize, setPageSize] = useState<number | "All">(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Selection state
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  // Loading states
  const [isPending, setIsPending] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch processed orders (Shipped) - using new schema field names
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["logistic-processed", startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("customer_purchases")
        .select(`
          *,
          bundle:logistic_bundles(name, sku)
        `)
        .eq("delivery_status", "Shipped")
        .order("date_processed", { ascending: false });

      if (startDate) {
        query = query.gte("date_processed", startDate);
      }
      if (endDate) {
        query = query.lte("date_processed", endDate);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data || [];
    },
  });

  // Helper function to get platform display value
  const getOrderPlatform = (order: any) => {
    if (order.jenis_platform) return order.jenis_platform;
    return null;
  };

  // Helper function to determine order platform category
  const getOrderPlatformCategory = (order: any) => {
    const platform = getOrderPlatform(order)?.toLowerCase() || "";
    if (platform === "tiktok") return "Tiktok";
    if (platform === "shopee") return "Shopee";
    return "Ninjavan";
  };

  // Check if order is NinjaVan platform
  const isNinjavanPlatform = (order: any) => {
    const platform = getOrderPlatform(order)?.toLowerCase() || "";
    return platform !== "tiktok" && platform !== "shopee";
  };

  // Filter orders - using new schema field names
  const filteredOrders = orders.filter((order: any) => {
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

    // Payment filter - using new type_payment field
    if (paymentFilter !== "All" && order.type_payment !== paymentFilter) {
      return false;
    }

    // Platform filter
    if (platformFilter !== "All") {
      const orderCategory = getOrderPlatformCategory(order);
      if (orderCategory !== platformFilter) {
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

  // Counts
  const ninjavanOrders = orders.filter((o: any) => {
    const platform = getOrderPlatform(o)?.toLowerCase() || "";
    return platform !== "tiktok" && platform !== "shopee";
  });

  const counts = {
    total: orders.length,
    tiktok: orders.filter((o: any) => getOrderPlatform(o)?.toLowerCase() === "tiktok").length,
    shopee: orders.filter((o: any) => getOrderPlatform(o)?.toLowerCase() === "shopee").length,
    ninjavan: ninjavanOrders.length,
    ninjavanCod: ninjavanOrders.filter((o: any) => o.type_payment === "COD").length,
    ninjavanCash: ninjavanOrders.filter((o: any) => o.type_payment !== "COD").length,
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

  // Bulk Pending action - revert to pending status
  const handleBulkPending = async () => {
    if (selectedOrders.size === 0) {
      toast.error("Please select orders to revert to pending");
      return;
    }

    const result = await Swal.fire({
      icon: "warning",
      title: "Revert to Pending?",
      text: `Are you sure you want to revert ${selectedOrders.size} order(s) to Pending status?`,
      showCancelButton: true,
      confirmButtonText: "Yes, Revert",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    setIsPending(true);

    try {
      const updatePromises = Array.from(selectedOrders).map((orderId) =>
        supabase
          .from("customer_purchases")
          .update({
            delivery_status: "Pending",
            date_processed: null,
            seo: null,
          })
          .eq("id", orderId)
      );

      await Promise.all(updatePromises);

      toast.success(`${selectedOrders.size} order(s) reverted to Pending`);
      queryClient.invalidateQueries({ queryKey: ["logistic-processed"] });
      queryClient.invalidateQueries({ queryKey: ["logistic-order"] });
      setSelectedOrders(new Set());
    } catch (error: any) {
      toast.error(error.message || "Failed to update orders");
    } finally {
      setIsPending(false);
    }
  };

  // Bulk Print action
  const handleBulkPrint = async () => {
    if (selectedOrders.size === 0) {
      toast.error("Please select orders to print waybills");
      return;
    }

    const selectedOrdersList = paginatedOrders.filter((o: any) => selectedOrders.has(o.id));

    // Separate NinjaVan orders and Shopee/Tiktok orders
    const ninjavanOrdersForPrint = selectedOrdersList.filter(
      (o: any) => getOrderPlatform(o) !== "Shopee" && getOrderPlatform(o) !== "Tiktok" && o.tracking_number
    );
    const marketplaceOrders = selectedOrdersList.filter(
      (o: any) => (getOrderPlatform(o) === "Shopee" || getOrderPlatform(o) === "Tiktok") && o.waybill_url
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

      // Handle Shopee/Tiktok orders (merge waybills)
      if (marketplaceOrders.length > 0) {
        const waybillUrls = marketplaceOrders.map((o: any) => o.waybill_url);

        const response = await supabase.functions.invoke("merge-waybills", {
          body: { waybillUrls },
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

  const handleFilterChange = () => {
    setCurrentPage(1);
    setSelectedOrders(new Set());
  };

  // Bulk Delete action
  const handleBulkDelete = async () => {
    if (selectedOrders.size === 0) {
      toast.error("Please select orders to delete");
      return;
    }

    const result = await Swal.fire({
      icon: "warning",
      title: "Delete Orders?",
      text: `Are you sure you want to delete ${selectedOrders.size} order(s)? This action cannot be undone.`,
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    setIsDeleting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const selectedOrdersList = paginatedOrders.filter((o: any) => selectedOrders.has(o.id));

      // Cancel NinjaVan tracking for orders that have tracking numbers (NinjaVan platform only)
      for (const order of selectedOrdersList) {
        if (order.tracking_number && isNinjavanPlatform(order)) {
          try {
            await supabase.functions.invoke("ninjavan-cancel", {
              body: { trackingNumber: order.tracking_number, profileId: user?.id },
              headers: { Authorization: `Bearer ${session?.session?.access_token}` },
            });
          } catch (cancelError) {
            console.error("Failed to cancel tracking:", order.tracking_number, cancelError);
          }
        }
      }

      // Delete orders
      const deletePromises = Array.from(selectedOrders).map((orderId) =>
        supabase.from("customer_purchases").delete().eq("id", orderId)
      );

      await Promise.all(deletePromises);

      toast.success(`${selectedOrders.size} order(s) deleted successfully`);
      queryClient.invalidateQueries({ queryKey: ["logistic-processed"] });
      setSelectedOrders(new Set());
    } catch (error: any) {
      toast.error(error.message || "Failed to delete orders");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Processed Orders</h1>
        <p className="text-muted-foreground mt-2">
          View and manage shipped orders
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setPlatformFilter("All")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-6 h-6 text-green-500" />
              <div>
                <p className="text-xl font-bold">{counts.total}</p>
                <p className="text-xs text-muted-foreground">Total Processed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setPlatformFilter("Tiktok")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Music2 className="w-6 h-6 text-pink-500" />
              <div>
                <p className="text-xl font-bold">{counts.tiktok}</p>
                <p className="text-xs text-muted-foreground">Tiktok</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setPlatformFilter("Shopee")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-6 h-6 text-orange-600" />
              <div>
                <p className="text-xl font-bold">{counts.shopee}</p>
                <p className="text-xs text-muted-foreground">Shopee</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setPlatformFilter("Ninjavan")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Truck className="w-6 h-6 text-red-500" />
              <div>
                <p className="text-xl font-bold">{counts.ninjavan}</p>
                <p className="text-xs text-muted-foreground">Ninjavan</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-yellow-600" />
              <div>
                <p className="text-xl font-bold">{counts.ninjavanCod}</p>
                <p className="text-xs text-muted-foreground">Ninjavan COD</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-green-500" />
              <div>
                <p className="text-xl font-bold">{counts.ninjavanCash}</p>
                <p className="text-xs text-muted-foreground">Ninjavan CASH</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search... (use + to combine filters)"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); handleFilterChange(); }}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); handleFilterChange(); }}
                  className="w-40"
                />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); handleFilterChange(); }}
                  className="w-40"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Platform:</span>
                <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); handleFilterChange(); }}>
                  <SelectTrigger className="w-32">
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
                <span className="text-sm text-muted-foreground">Payment:</span>
                <Select value={paymentFilter} onValueChange={(v) => { setPaymentFilter(v); handleFilterChange(); }}>
                  <SelectTrigger className="w-36">
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
                <span className="text-sm text-muted-foreground">Show:</span>
                <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(v === "All" ? "All" : Number(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-20">
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

              <div className="flex-1" />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleBulkPending}
                  disabled={selectedOrders.size === 0 || isPending}
                >
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                  Pending ({selectedOrders.size})
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleBulkDelete}
                  disabled={selectedOrders.size === 0 || isDeleting}
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Delete ({selectedOrders.size})
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
                      <th className="p-2 text-left">Tarikh Order</th>
                      <th className="p-2 text-left">Id Staff</th>
                      <th className="p-2 text-left">Name</th>
                      <th className="p-2 text-left">Nama Pelanggan</th>
                      <th className="p-2 text-left">Phone</th>
                      <th className="p-2 text-left">Produk</th>
                      <th className="p-2 text-left">Unit</th>
                      <th className="p-2 text-left">Tracking</th>
                      <th className="p-2 text-left">Total Sales</th>
                      <th className="p-2 text-left">Cara Bayaran</th>
                      <th className="p-2 text-left">Delivery Status</th>
                      <th className="p-2 text-left">Jenis Platform</th>
                      <th className="p-2 text-left">Jenis Closing</th>
                      <th className="p-2 text-left">Jenis Customer</th>
                      <th className="p-2 text-left">Negeri</th>
                      <th className="p-2 text-left">Alamat</th>
                      <th className="p-2 text-left">Nota</th>
                      <th className="p-2 text-left">Waybill</th>
                      <th className="p-2 text-left">SEO</th>
                      <th className="p-2 text-left">WhatsApp</th>
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
                          <td className="p-2">{pageSize === "All" ? index + 1 : (currentPage - 1) * (pageSize as number) + index + 1}</td>
                          <td className="p-2 whitespace-nowrap">{order.id_sale || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.date_processed || order.date_order || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.marketer_id_staff || "-"}</td>
                          <td className="p-2">{order.name_customer || "-"}</td>
                          <td className="p-2">{order.name_customer || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.phone_customer || "-"}</td>
                          <td className="p-2">
                            <span className="truncate max-w-[150px] block">{order.bundle?.name || "-"}</span>
                          </td>
                          <td className="p-2 text-center">{order.unit || 1}</td>
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
                              getOrderPlatform(order) === "Tiktok" ? "text-pink-600" :
                              getOrderPlatform(order) === "Shopee" ? "text-orange-500" :
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
                            <p className="text-xs truncate max-w-[100px]">{order.nota_staff || "-"}</p>
                          </td>
                          <td className="p-2">
                            {order.waybill_url ? (
                              <a href={order.waybill_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                                View
                              </a>
                            ) : "-"}
                          </td>
                          <td className="p-2">
                            <span className={`text-xs ${order.seo === "Successfull Delivery" ? "text-green-600" : "text-gray-500"}`}>
                              {order.seo || "-"}
                            </span>
                          </td>
                          <td className="p-2">
                            {order.phone_customer && (
                              <a
                                href={`https://wa.me/6${(order.phone_customer || "").replace(/^0/, "").replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center w-7 h-7 bg-green-500 hover:bg-green-600 text-white rounded"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </a>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={20} className="text-center py-12 text-muted-foreground">
                          No processed orders found.
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
                    Showing {(currentPage - 1) * (pageSize as number) + 1} to {Math.min(currentPage * (pageSize as number), filteredOrders.length)} of {filteredOrders.length} entries
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

export default LogisticProcessed;
