import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dialog";
import {
  ClipboardList,
  Loader2,
  Search,
  Printer,
  Truck,
  XCircle,
  Eye,
  RefreshCw,
  CreditCard,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getMalaysiaDate } from "@/lib/utils";
import PaymentDetailsModal from "./PaymentDetailsModal";

const LogisticOrder = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = getMalaysiaDate();

  // Filter states
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

  // Selection states
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // Modal states
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<any>(null);

  // Fetch orders (Pending delivery status) - Logistic sees ALL orders, not filtered by seller_id
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ["logistic-orders", startDate, endDate, platformFilter, paymentFilter],
    queryFn: async () => {
      let query = supabase
        .from("customer_purchases")
        .select(`
          *,
          customer:customers(id, name, phone, address, state, city, postcode)
        `)
        .eq("delivery_status", "Pending")
        .order("created_at", { ascending: false });

      if (startDate) {
        query = query.gte("date_order", startDate);
      }
      if (endDate) {
        query = query.lte("date_order", endDate);
      }
      if (platformFilter !== "all") {
        query = query.eq("platform", platformFilter);
      }
      if (paymentFilter !== "all") {
        query = query.eq("payment_method", paymentFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Filter by search
  const filteredOrders = orders.filter((order: any) => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      order.customer?.name?.toLowerCase().includes(search) ||
      order.customer?.phone?.includes(search) ||
      order.tracking_number?.toLowerCase().includes(search) ||
      order.id?.toLowerCase().includes(search)
    );
  });

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / pageSize);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Mark as shipped mutation
  const markAsShippedMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const today = getMalaysiaDate();
      const { error } = await supabase
        .from("customer_purchases")
        .update({
          delivery_status: "Shipped",
          date_processed: today,
        })
        .in("id", ids);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orders marked as shipped");
      queryClient.invalidateQueries({ queryKey: ["logistic-orders"] });
      setSelectedIds([]);
      setSelectAll(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update orders");
    },
  });

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("customer_purchases")
        .update({ delivery_status: "Cancelled" })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order cancelled");
      queryClient.invalidateQueries({ queryKey: ["logistic-orders"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to cancel order");
    },
  });

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedIds(paginatedOrders.map((o: any) => o.id));
    } else {
      setSelectedIds([]);
    }
  };

  // Handle individual selection
  const handleSelect = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    }
  };

  // Handle mark as shipped
  const handleMarkAsShipped = () => {
    if (selectedIds.length === 0) {
      toast.error("Please select orders first");
      return;
    }
    markAsShippedMutation.mutate(selectedIds);
  };

  // Handle print waybill
  const handlePrintWaybill = async () => {
    if (selectedIds.length === 0) {
      toast.error("Please select orders first");
      return;
    }

    // Get tracking numbers from selected orders
    const trackingNumbers = paginatedOrders
      .filter((o: any) => selectedIds.includes(o.id) && o.tracking_number)
      .map((o: any) => o.tracking_number);

    if (trackingNumbers.length === 0) {
      toast.error("No tracking numbers found for selected orders");
      return;
    }

    try {
      const response = await supabase.functions.invoke("ninjavan-waybill", {
        body: {
          trackingNumbers,
          profileId: user?.id,
        },
      });

      if (response.error) throw response.error;

      // Create blob and download
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `waybills_${trackingNumbers.length}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast.success(`Downloaded ${trackingNumbers.length} waybill(s)`);
    } catch (error: any) {
      toast.error(error.message || "Failed to download waybills");
    }
  };

  // View payment details
  const handleViewPayment = (order: any) => {
    setPaymentOrder(order);
    setIsPaymentModalOpen(true);
  };

  // Stats
  const totalOrders = filteredOrders.length;
  const codOrders = filteredOrders.filter((o: any) => o.payment_method === "COD").length;
  const transferOrders = filteredOrders.filter((o: any) => o.payment_method === "Online Transfer").length;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            Order Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage pending orders - {totalOrders} orders
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-2xl font-bold">{totalOrders}</p>
              </div>
              <ClipboardList className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">COD Orders</p>
                <p className="text-2xl font-bold text-orange-600">{codOrders}</p>
              </div>
              <Truck className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Online Transfer</p>
                <p className="text-2xl font-bold text-green-600">{transferOrders}</p>
              </div>
              <CreditCard className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={platformFilter} onValueChange={setPlatformFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Platforms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  <SelectItem value="Ninjavan">Ninjavan</SelectItem>
                  <SelectItem value="Shopee">Shopee</SelectItem>
                  <SelectItem value="TikTok">TikTok</SelectItem>
                  <SelectItem value="Manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payment</Label>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Payments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payments</SelectItem>
                  <SelectItem value="Online Transfer">Online Transfer</SelectItem>
                  <SelectItem value="COD">COD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{selectedIds.length} selected</span>
              <Button size="sm" onClick={handleMarkAsShipped}>
                <Truck className="w-4 h-4 mr-1" />
                Mark as Shipped
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrintWaybill}>
                <Printer className="w-4 h-4 mr-1" />
                Print Waybills
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Orders Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Orders</CardTitle>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : paginatedOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No pending orders found.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectAll}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Tracking</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedOrders.map((order: any) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(order.id)}
                            onCheckedChange={(checked) => handleSelect(order.id, checked as boolean)}
                          />
                        </TableCell>
                        <TableCell>
                          {order.date_order ? format(new Date(order.date_order), "dd/MM/yyyy") : "-"}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{order.customer?.name || "-"}</p>
                            <p className="text-xs text-muted-foreground">{order.customer?.phone || "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{order.produk || "-"}</p>
                            <p className="text-xs text-muted-foreground">x{order.quantity || 1}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-bold">
                          RM {(order.total_price || 0).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={order.payment_method === "COD" ? "outline" : "default"}>
                            {order.payment_method || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{order.platform || "-"}</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs">{order.tracking_number || "-"}</code>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedOrder(order);
                                setIsDetailOpen(true);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {order.payment_method === "Online Transfer" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewPayment(order)}
                              >
                                <CreditCard className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm("Cancel this order?")) {
                                  cancelOrderMutation.mutate(order.id);
                                }
                              }}
                            >
                              <XCircle className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
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

      {/* Order Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Customer</Label>
                  <p className="font-medium">{selectedOrder.customer?.name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Phone</Label>
                  <p className="font-medium">{selectedOrder.customer?.phone}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground">Address</Label>
                  <p className="font-medium">
                    {selectedOrder.customer?.address}, {selectedOrder.customer?.city}, {selectedOrder.customer?.postcode}, {selectedOrder.customer?.state}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Product</Label>
                  <p className="font-medium">{selectedOrder.produk}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Quantity</Label>
                  <p className="font-medium">{selectedOrder.quantity}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Amount</Label>
                  <p className="font-bold text-lg">RM {(selectedOrder.total_price || 0).toFixed(2)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Payment</Label>
                  <p className="font-medium">{selectedOrder.payment_method}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Details Modal */}
      <PaymentDetailsModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        order={paymentOrder}
      />
    </div>
  );
};

export default LogisticOrder;
