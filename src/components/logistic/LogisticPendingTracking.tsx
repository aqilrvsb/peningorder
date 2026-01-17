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
import { format } from "date-fns";
import { getMalaysiaDate } from "@/lib/utils";
import {
  Package,
  Clock,
  Loader2,
  Printer,
  Search,
  DollarSign,
  Wallet,
  Save,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE_OPTIONS = [10, 50, 100];

const LogisticPendingTracking = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  // Filter states
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Selection state
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  // Bulk update states
  const [bulkStatus, setBulkStatus] = useState<"Success" | "Return">("Success");
  const [bulkDate, setBulkDate] = useState("");
  const [bulkTrackingList, setBulkTrackingList] = useState("");
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Individual update states
  const [individualStatus, setIndividualStatus] = useState<"Success" | "Return">("Success");
  const [individualDate, setIndividualDate] = useState("");
  const [isIndividualUpdating, setIsIndividualUpdating] = useState(false);

  // Loading states
  const [isPrinting, setIsPrinting] = useState(false);

  // Fetch pending tracking orders (Shipped + COD + SEO not successful)
  // Pending tracking only for Ninjavan orders (exclude Tiktok, Shopee)
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["logistic-pending-tracking", startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("customer_purchases")
        .select(`
          *,
          product:products(name, sku)
        `)
        .eq("delivery_status", "Shipped")
        .eq("cara_bayaran", "COD")
        .neq("jenis_platform", "Tiktok")
        .neq("jenis_platform", "Shopee")
        .or("seo.is.null,seo.neq.Successfull Delivery")
        .order("created_at", { ascending: false });

      if (startDate) {
        query = query.gte("date_order", startDate);
      }
      if (endDate) {
        query = query.lte("date_order", endDate);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data || [];
    },
  });

  // Filter orders
  const filteredOrders = orders.filter((order: any) => {
    // Search filter
    if (search.trim()) {
      const searchTerms = search.toLowerCase().split("+").map((s) => s.trim()).filter(Boolean);
      const matchesSearch = searchTerms.every((term) =>
        order.nama_pelanggan?.toLowerCase().includes(term) ||
        order.no_phone?.toLowerCase().includes(term) ||
        order.no_tracking?.toLowerCase().includes(term) ||
        order.product?.name?.toLowerCase().includes(term) ||
        order.produk?.toLowerCase().includes(term) ||
        order.alamat?.toLowerCase().includes(term)
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

  // Counts
  const counts = {
    total: filteredOrders.length,
    cod: filteredOrders.filter((o: any) => o.cara_bayaran === "COD").length,
    totalSales: filteredOrders.reduce((sum: number, o: any) => sum + (Number(o.total_price) || 0), 0),
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
      const { data: session } = await supabase.auth.getSession();
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
          seo: "Successfull Delivery",
          tarikh_bayaran: today,
        })
        .eq("id", orderId);

      toast.success("COD payment marked as received");
      queryClient.invalidateQueries({ queryKey: ["logistic-pending-tracking"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to update order");
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

    // Find orders matching the tracking numbers
    const ordersToUpdate = filteredOrders.filter((o: any) =>
      trackingNumbers.includes(o.tracking_number)
    );

    if (ordersToUpdate.length === 0) {
      toast.error("No matching orders found for the tracking numbers");
      return;
    }

    setIsBulkUpdating(true);

    try {
      let updateData: any;
      if (bulkStatus === "Success") {
        updateData = {
          seo: "Successfull Delivery",
          tarikh_bayaran: bulkDate,
          delivery_status: "Shipped",
        };
      } else {
        updateData = {
          seo: "Return",
          date_return: bulkDate,
          delivery_status: "Return",
        };
      }

      const updatePromises = ordersToUpdate.map((order: any) =>
        supabase
          .from("customer_purchases")
          .update(updateData)
          .eq("id", order.id)
      );

      await Promise.all(updatePromises);

      toast.success(`${ordersToUpdate.length} order(s) updated to ${bulkStatus}`);
      setBulkTrackingList("");
      setBulkDate("");
      queryClient.invalidateQueries({ queryKey: ["logistic-pending-tracking"] });
      queryClient.invalidateQueries({ queryKey: ["logistic-return"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to update orders");
    } finally {
      setIsBulkUpdating(false);
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
          seo: "Successfull Delivery",
          tarikh_bayaran: individualDate,
          delivery_status: "Shipped",
        };
      } else {
        updateData = {
          seo: "Return",
          date_return: individualDate,
          delivery_status: "Return",
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
      queryClient.invalidateQueries({ queryKey: ["logistic-pending-tracking"] });
      queryClient.invalidateQueries({ queryKey: ["logistic-return"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to update orders");
    } finally {
      setIsIndividualUpdating(false);
    }
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
          Track COD orders awaiting payment confirmation
        </p>
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
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{counts.cod}</p>
                <p className="text-sm text-muted-foreground">COD Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">RM {counts.totalSales.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">Pending Collection</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Update Section */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-4">Bulk Update by Tracking Number</h3>
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
            </div>
            <div className="flex items-end">
              <Button onClick={handleBulkUpdate} disabled={isBulkUpdating} className="w-full">
                {isBulkUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Update Orders
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual Update by Selection */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-4">Update by Selection</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Select orders from the table below using checkboxes, then update them here
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
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
                <span className="text-sm text-muted-foreground">Show:</span>
                <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">entries</span>
              </div>

              <div className="flex-1" />

              <div className="flex gap-2">
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
                      <th className="p-2 text-left">Tarikh Order</th>
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
                          <td className="p-2 whitespace-nowrap">{order.date_order || format(new Date(order.created_at), "yyyy-MM-dd")}</td>
                          <td className="p-2">{order.nama_pelanggan || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.no_phone || "-"}</td>
                          <td className="p-2">
                            <span className="truncate max-w-[150px] block">{order.product?.name || order.produk || "-"}</span>
                          </td>
                          <td className="p-2 text-center">{order.quantity || 1}</td>
                          <td className="p-2 whitespace-nowrap">
                            <span className="font-mono text-xs">{order.no_tracking || "-"}</span>
                          </td>
                          <td className="p-2 whitespace-nowrap">RM {Number(order.total_price || 0).toFixed(2)}</td>
                          <td className="p-2">
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                              {order.cara_bayaran || "-"}
                            </span>
                          </td>
                          <td className="p-2">
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                              {order.delivery_status || "-"}
                            </span>
                          </td>
                          <td className="p-2 text-xs">{order.jenis_platform || "-"}</td>
                          <td className="p-2 text-xs">{order.jenis_closing || "-"}</td>
                          <td className="p-2 text-xs">{order.jenis_customer || "-"}</td>
                          <td className="p-2 text-xs">{order.negeri || "-"}</td>
                          <td className="p-2">
                            <div className="max-w-[150px]">
                              <p className="text-xs truncate">{order.alamat || "-"}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {order.poskod} {order.bandar}
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
                            {order.no_phone && (
                              <a
                                href={`https://wa.me/6${(order.no_phone || "").replace(/^0/, "").replace(/\D/g, "")}`}
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
                        <td colSpan={21} className="text-center py-12 text-muted-foreground">
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
