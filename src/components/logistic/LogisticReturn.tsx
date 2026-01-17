import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RotateCcw,
  Loader2,
  Search,
  RefreshCw,
  Package,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { getMalaysiaDate } from "@/lib/utils";

const LogisticReturn = () => {
  const { user } = useAuth();
  const today = getMalaysiaDate();

  // Filter states
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch returned orders - Logistic sees ALL orders
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ["logistic-returns", startDate, endDate, platformFilter, paymentFilter],
    queryFn: async () => {
      let query = supabase
        .from("customer_purchases")
        .select(`
          *,
          customer:customers(id, name, phone, address, state, city, postcode)
        `)
        .eq("delivery_status", "Return")
        .order("date_return", { ascending: false });

      if (startDate) {
        query = query.gte("date_return", startDate);
      }
      if (endDate) {
        query = query.lte("date_return", endDate);
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

  // Stats
  const totalReturns = filteredOrders.length;
  const codReturns = filteredOrders.filter((o: any) => o.payment_method === "COD").length;
  const transferReturns = filteredOrders.filter((o: any) => o.payment_method === "Online Transfer").length;
  const totalValue = filteredOrders.reduce((sum: number, o: any) => sum + (o.total_price || 0), 0);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-red-500 to-orange-600 bg-clip-text text-transparent">
            Return Orders
          </h1>
          <p className="text-muted-foreground mt-1">
            View returned orders - {totalReturns} returns
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Returns</p>
                <p className="text-2xl font-bold text-red-600">{totalReturns}</p>
              </div>
              <RotateCcw className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">COD Returns</p>
                <p className="text-2xl font-bold text-orange-600">{codReturns}</p>
              </div>
              <Package className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Transfer Returns</p>
                <p className="text-2xl font-bold text-blue-600">{transferReturns}</p>
              </div>
              <Package className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Return Value</p>
                <p className="text-2xl font-bold text-red-600">RM {totalValue.toFixed(2)}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500" />
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

      {/* Orders Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Returns</CardTitle>
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
              No returned orders found.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Tracking</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedOrders.map((order: any) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          {order.date_return ? format(new Date(order.date_return), "dd/MM/yyyy") : "-"}
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
                        <TableCell className="font-bold text-red-600">
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
                          <Badge variant="destructive">Return</Badge>
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
    </div>
  );
};

export default LogisticReturn;
