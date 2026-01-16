import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Package, Plus, Calendar, Clock, CheckCircle, XCircle, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getMalaysiaDate } from "@/lib/utils";

const LogisticStockIn = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState("");
  const [description, setDescription] = useState("");

  // Date filter for Received Stock History
  const today = getMalaysiaDate();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  // Get stock requests for this logistic user
  const { data: stockRequests, isLoading } = useQuery({
    queryKey: ["logistic-stock-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("logistic_stock_requests")
        .select(`
          *,
          product:products(name, sku)
        `)
        .eq("logistic_id", user?.id)
        .order("requested_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Get approved stock (stock_in_logistic records) with date filter
  const { data: approvedStock, isLoading: stockLoading } = useQuery({
    queryKey: ["stock-in-logistic", user?.id, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("stock_in_logistic")
        .select(`
          *,
          product:products(name, sku)
        `)
        .eq("logistic_id", user?.id)
        .order("date", { ascending: false });

      if (startDate) {
        query = query.gte("date", startDate + "T00:00:00+08:00");
      }
      if (endDate) {
        query = query.lte("date", endDate + "T23:59:59.999+08:00");
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching stock_in_logistic:", error);
        throw error;
      }
      return data;
    },
    enabled: !!user?.id,
  });

  const createRequest = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("logistic_stock_requests")
        .insert({
          logistic_id: user?.id,
          product_id: selectedProduct,
          quantity: parseInt(quantity),
          description: description || null,
          status: "pending",
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["logistic-stock-requests"] });
      toast.success("Stock request submitted! Waiting for HQ approval.");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to submit request");
    },
  });

  const cancelRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("logistic_stock_requests")
        .delete()
        .eq("id", id)
        .eq("status", "pending");

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["logistic-stock-requests"] });
      toast.success("Request cancelled");
    },
    onError: (error: any) => {
      toast.error("Failed to cancel request: " + error.message);
    },
  });

  const resetForm = () => {
    setSelectedProduct("");
    setQuantity("");
    setDescription("");
  };

  const handleCancel = (id: string) => {
    if (confirm("Are you sure you want to cancel this request?")) {
      cancelRequest.mutate(id);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const pendingCount = stockRequests?.filter(r => r.status === "pending").length || 0;
  const approvedCount = stockRequests?.filter(r => r.status === "approved").length || 0;
  const totalReceived = approvedStock?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  const stats = [
    { title: "Pending Requests", value: pendingCount, icon: Clock, color: "text-yellow-600" },
    { title: "Approved Requests", value: approvedCount, icon: CheckCircle, color: "text-green-600" },
    { title: "Total Units Received", value: totalReceived, icon: Package, color: "text-blue-600" },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            Stock In (Request from HQ)
          </h1>
          <p className="text-muted-foreground mt-2">
            Request stock from HQ. Stock will be added after HQ approval.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Request Stock
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Stock from HQ</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Product</Label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} ({product.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Enter quantity needed"
                />
              </div>
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add any notes for HQ..."
                />
              </div>
              <Button
                onClick={() => createRequest.mutate()}
                className="w-full"
                disabled={!selectedProduct || !quantity || createRequest.isPending}
              >
                {createRequest.isPending ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold mt-2">{stat.value}</p>
                </div>
                <stat.icon className={`h-8 w-8 ${stat.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pending/Rejected Requests */}
      {(() => {
        const pendingRejectedRequests = stockRequests?.filter(r => r.status === "pending" || r.status === "rejected") || [];
        return pendingRejectedRequests.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Pending Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p>Loading requests...</p>
              ) : (
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRejectedRequests.map((request) => {
                        const requestDate = request.requested_at ? new Date(request.requested_at) : null;
                        const isValidDate = requestDate && !isNaN(requestDate.getTime());

                        return (
                          <TableRow key={request.id}>
                            <TableCell>
                              <div className="text-sm">
                                <div>{isValidDate ? format(requestDate, "dd-MM-yyyy") : "-"}</div>
                                <div className="text-muted-foreground text-xs">
                                  {isValidDate ? format(requestDate, "HH:mm") : ""}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{request.product?.name}</TableCell>
                            <TableCell>{request.product?.sku}</TableCell>
                            <TableCell className="font-bold">{request.quantity}</TableCell>
                            <TableCell>{getStatusBadge(request.status)}</TableCell>
                            <TableCell>
                              {request.status === "rejected" && request.rejection_reason ? (
                                <span className="text-red-600 text-sm">{request.rejection_reason}</span>
                              ) : (
                                request.description || "-"
                              )}
                            </TableCell>
                            <TableCell>
                              {request.status === "pending" && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleCancel(request.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null;
      })()}

      {/* Received Stock History */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle>Received Stock History</CardTitle>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">From:</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-36"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">To:</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-36"
              />
            </div>
            {(startDate || endDate) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setStartDate(""); setEndDate(""); }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {stockLoading ? (
            <p>Loading received stock...</p>
          ) : !approvedStock || approvedStock.length === 0 ? (
            <p className="text-muted-foreground">No stock received yet.</p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvedStock?.map((item) => {
                    const itemDate = item.date ? new Date(item.date) : null;
                    const isValidDate = itemDate && !isNaN(itemDate.getTime());

                    return (
                      <TableRow key={item.id}>
                        <TableCell>{isValidDate ? format(itemDate, "dd-MM-yyyy") : "-"}</TableCell>
                        <TableCell>{item.product?.name}</TableCell>
                        <TableCell>{item.product?.sku}</TableCell>
                        <TableCell className="font-bold text-green-600">+{item.quantity}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.source_type === "hq" ? "From HQ" : "Transfer"}</Badge>
                        </TableCell>
                        <TableCell>{item.description || "-"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LogisticStockIn;
