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
import { Textarea } from "@/components/ui/textarea";
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
  Clock,
  Loader2,
  Search,
  RefreshCw,
  CheckCircle,
  RotateCcw,
  ClipboardList,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getMalaysiaDate } from "@/lib/utils";

const LogisticPendingTracking = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = getMalaysiaDate();

  // Filter states
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

  // Selection states
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // Bulk update dialog
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<"Success" | "Return">("Success");
  const [bulkDate, setBulkDate] = useState(today);
  const [bulkTrackingList, setBulkTrackingList] = useState("");

  // Fetch COD orders that are shipped but not yet confirmed - Logistic sees ALL orders
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ["logistic-pending-tracking", startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("customer_purchases")
        .select(`
          *,
          customer:customers(id, name, phone, address, state, city, postcode)
        `)
        .eq("delivery_status", "Shipped")
        .eq("payment_method", "COD")
        .or("seo.is.null,seo.neq.Successfull Delivery")
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

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, status, date }: { ids: string[]; status: string; date: string }) => {
      if (status === "Success") {
        const { error } = await supabase
          .from("customer_purchases")
          .update({
            seo: "Successfull Delivery",
            delivery_status: "Delivered",
          })
          .in("id", ids);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("customer_purchases")
          .update({
            delivery_status: "Return",
            date_return: date,
          })
          .in("id", ids);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(`Orders updated to ${bulkStatus}`);
      queryClient.invalidateQueries({ queryKey: ["logistic-pending-tracking"] });
      setSelectedIds([]);
      setSelectAll(false);
      setIsBulkDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update orders");
    },
  });

  // Single update mutation
  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "Success" | "Return" }) => {
      if (status === "Success") {
        const { error } = await supabase
          .from("customer_purchases")
          .update({
            seo: "Successfull Delivery",
            delivery_status: "Delivered",
          })
          .eq("id", id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("customer_purchases")
          .update({
            delivery_status: "Return",
            date_return: today,
          })
          .eq("id", id);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Order updated");
      queryClient.invalidateQueries({ queryKey: ["logistic-pending-tracking"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update order");
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

  // Handle bulk update
  const handleBulkUpdate = () => {
    if (selectedIds.length === 0) {
      toast.error("Please select orders first");
      return;
    }
    bulkUpdateMutation.mutate({
      ids: selectedIds,
      status: bulkStatus,
      date: bulkDate,
    });
  };

  // Handle bulk tracking list update
  const handleBulkTrackingUpdate = () => {
    // Parse tracking numbers from textarea
    const trackingNumbers = bulkTrackingList
      .split("\n")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (trackingNumbers.length === 0) {
      toast.error("Please enter tracking numbers");
      return;
    }

    // Find matching orders
    const matchingOrders = filteredOrders.filter((o: any) =>
      trackingNumbers.includes(o.tracking_number)
    );

    if (matchingOrders.length === 0) {
      toast.error("No matching orders found");
      return;
    }

    const ids = matchingOrders.map((o: any) => o.id);
    bulkUpdateMutation.mutate({
      ids,
      status: bulkStatus,
      date: bulkDate,
    });
  };

  // Stats
  const totalPending = filteredOrders.length;
  const totalValue = filteredOrders.reduce((sum: number, o: any) => sum + (o.total_price || 0), 0);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-yellow-500 to-orange-600 bg-clip-text text-transparent">
            Pending Tracking Confirmation
          </h1>
          <p className="text-muted-foreground mt-1">
            COD orders awaiting delivery confirmation - {totalPending} orders
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setIsBulkDialogOpen(true)}>
            <ClipboardList className="w-4 h-4 mr-2" />
            Bulk Update
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Orders</p>
                <p className="text-2xl font-bold text-yellow-600">{totalPending}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Value (COD)</p>
                <p className="text-2xl font-bold text-green-600">RM {totalValue.toFixed(2)}</p>
              </div>
              <Clock className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{selectedIds.length} selected</span>
              <Button
                size="sm"
                onClick={() => {
                  setBulkStatus("Success");
                  handleBulkUpdate();
                }}
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                Mark as Success
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setBulkStatus("Return");
                  handleBulkUpdate();
                }}
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Mark as Return
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Orders Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Pending Tracking</CardTitle>
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
              No pending tracking orders found.
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
                      <TableHead>Processed Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Amount</TableHead>
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
                          {order.date_processed ? format(new Date(order.date_processed), "dd/MM/yyyy") : "-"}
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
                          <code className="text-xs">{order.tracking_number || "-"}</code>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateOrderMutation.mutate({ id: order.id, status: "Success" })}
                            >
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateOrderMutation.mutate({ id: order.id, status: "Return" })}
                            >
                              <RotateCcw className="w-4 h-4 text-red-500" />
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

      {/* Bulk Update Dialog */}
      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Update Tracking Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as "Success" | "Return")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Success">Success (Delivered)</SelectItem>
                  <SelectItem value="Return">Return</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {bulkStatus === "Return" && (
              <div className="space-y-2">
                <Label>Return Date</Label>
                <Input
                  type="date"
                  value={bulkDate}
                  onChange={(e) => setBulkDate(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Tracking Numbers (one per line)</Label>
              <Textarea
                value={bulkTrackingList}
                onChange={(e) => setBulkTrackingList(e.target.value)}
                placeholder="Enter tracking numbers, one per line..."
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkTrackingUpdate} disabled={bulkUpdateMutation.isPending}>
              {bulkUpdateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Updating...
                </>
              ) : (
                "Update Orders"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LogisticPendingTracking;
