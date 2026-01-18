import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Loader2, TrendingUp, TrendingDown, RotateCcw, Truck, Play, ShoppingBag, Globe, DollarSign } from "lucide-react";
import { format, parseISO, isWithinInterval } from "date-fns";
import { getMalaysiaDate } from "@/lib/utils";

const LogisticProductTransaction = () => {
  const { user } = useAuth();

  // Date filter state - default to current date only
  const today = getMalaysiaDate();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  // Fetch all products
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["all-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, base_cost, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch stock_in_logistic for this logistic user
  const { data: stockInData, isLoading: stockInLoading } = useQuery({
    queryKey: ["logistic-stock-in-transactions", user?.id, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("stock_in_logistic")
        .select("product_id, quantity, date")
        .eq("logistic_id", user?.id);

      if (startDate) query = query.gte("date", startDate);
      if (endDate) query = query.lte("date", endDate);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch stock_out_logistic for this logistic user
  const { data: stockOutData, isLoading: stockOutLoading } = useQuery({
    queryKey: ["logistic-stock-out-transactions", user?.id, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("stock_out_logistic")
        .select("product_id, quantity, date")
        .eq("logistic_id", user?.id);

      if (startDate) query = query.gte("date", startDate);
      if (endDate) query = query.lte("date", endDate);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch ALL marketer orders from customer_purchases (for Total Sales, Shipped, Return, Tiktok, Shopee, Online)
  // Stock In/Out comes from Logistic tables only
  // Filter by date_processed as requested
  const { data: purchasesData = [], isLoading: purchasesLoading } = useQuery({
    queryKey: ["marketer-orders-transactions", startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("customer_purchases")
        .select(`
          id,
          bundle_id,
          unit,
          delivery_status,
          jenis_platform,
          date_order,
          date_processed,
          date_return,
          marketer_id_staff,
          total_sale,
          bundle:logistic_bundles(id, name, sku)
        `);

      if (startDate) query = query.gte("date_processed", startDate);
      if (endDate) query = query.lte("date_processed", endDate);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Filter helper function - uses date_processed
  const isInDateRange = (dateStr: string | null | undefined): boolean => {
    if (!dateStr) return false;
    try {
      const date = parseISO(dateStr.split("T")[0]);
      return isWithinInterval(date, {
        start: parseISO(startDate),
        end: parseISO(endDate),
      });
    } catch {
      return false;
    }
  };

  // Calculate product transaction data - group by bundle
  const productTransactions = useMemo(() => {
    // Group purchases by bundle
    const bundleMap = new Map<string, {
      id: string;
      sku: string;
      name: string;
      totalSales: number;
      stockIn: number;
      stockOut: number;
      shippedUnits: number;
      shippedTransactions: number;
      returnUnits: number;
      returnTransactions: number;
      tiktok: { units: number; transactions: number };
      shopee: { units: number; transactions: number };
      online: { units: number; transactions: number };
    }>();

    // Process all purchases (already filtered by date_processed in query)
    purchasesData?.forEach((p: any) => {
      const bundleId = p.bundle?.id || "unknown";
      const bundleSku = p.bundle?.sku || "N/A";
      const bundleName = p.bundle?.name || "Unknown Bundle";
      const qty = Number(p.unit) || 1;

      // Get or create bundle entry
      if (!bundleMap.has(bundleId)) {
        bundleMap.set(bundleId, {
          id: bundleId,
          sku: bundleSku,
          name: bundleName,
          totalSales: 0,
          stockIn: 0,
          stockOut: 0,
          shippedUnits: 0,
          shippedTransactions: 0,
          returnUnits: 0,
          returnTransactions: 0,
          tiktok: { units: 0, transactions: 0 },
          shopee: { units: 0, transactions: 0 },
          online: { units: 0, transactions: 0 },
        });
      }

      const bundle = bundleMap.get(bundleId)!;

      // Total Sales
      bundle.totalSales += Number(p.total_sale) || 0;

      // Shipped Out
      if (p.delivery_status === "Shipped") {
        bundle.shippedUnits += qty;
        bundle.shippedTransactions += 1;
      }

      // Return
      if (p.delivery_status === "Return") {
        bundle.returnUnits += qty;
        bundle.returnTransactions += 1;
      }

      // Platform breakdown
      if (p.jenis_platform === "Tiktok") {
        bundle.tiktok.units += qty;
        bundle.tiktok.transactions += 1;
      } else if (p.jenis_platform === "Shopee") {
        bundle.shopee.units += qty;
        bundle.shopee.transactions += 1;
      } else if (p.jenis_platform) {
        bundle.online.units += qty;
        bundle.online.transactions += 1;
      }
    });

    // Add Stock In/Out from logistic tables (match by product)
    products?.forEach((product: any) => {
      const stockIn = stockInData
        ?.filter((s: any) => s.product_id === product.id && isInDateRange(s.date))
        ?.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0) || 0;

      const stockOut = stockOutData
        ?.filter((s: any) => s.product_id === product.id && isInDateRange(s.date))
        ?.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0) || 0;

      // Find matching bundle by SKU or create entry for product
      let found = false;
      bundleMap.forEach((bundle) => {
        if (bundle.sku.toUpperCase() === product.sku?.toUpperCase()) {
          bundle.stockIn += stockIn;
          bundle.stockOut += stockOut;
          found = true;
        }
      });

      // If no matching bundle, add product as separate entry (only if has stock movement)
      if (!found && (stockIn > 0 || stockOut > 0)) {
        bundleMap.set(`product-${product.id}`, {
          id: `product-${product.id}`,
          sku: product.sku || "N/A",
          name: product.name,
          totalSales: 0,
          stockIn,
          stockOut,
          shippedUnits: 0,
          shippedTransactions: 0,
          returnUnits: 0,
          returnTransactions: 0,
          tiktok: { units: 0, transactions: 0 },
          shopee: { units: 0, transactions: 0 },
          online: { units: 0, transactions: 0 },
        });
      }
    });

    // Convert to array and calculate percentages
    return Array.from(bundleMap.values()).map((bundle) => {
      const totalPlatformUnits = bundle.tiktok.units + bundle.shopee.units + bundle.online.units;
      const tiktokPct = totalPlatformUnits > 0 ? (bundle.tiktok.units / totalPlatformUnits) * 100 : 0;
      const shopeePct = totalPlatformUnits > 0 ? (bundle.shopee.units / totalPlatformUnits) * 100 : 0;
      const onlinePct = totalPlatformUnits > 0 ? (bundle.online.units / totalPlatformUnits) * 100 : 0;

      return {
        ...bundle,
        tiktok: { ...bundle.tiktok, pct: tiktokPct },
        shopee: { ...bundle.shopee, pct: shopeePct },
        online: { ...bundle.online, pct: onlinePct },
      };
    }).filter((b) => b.totalSales > 0 || b.stockIn > 0 || b.stockOut > 0 || b.shippedUnits > 0 || b.returnUnits > 0);
  }, [products, stockInData, stockOutData, purchasesData, startDate, endDate]);

  // Summary stats - data already filtered by date_processed in query
  const summaryStats = useMemo(() => {
    // Calculate Grand Total Sales
    const grandTotalSales = purchasesData?.reduce((sum: number, o: any) => sum + (Number(o.total_sale) || 0), 0) || 0;

    // Calculate Shipped
    const shippedOrders = purchasesData?.filter((p: any) => p.delivery_status === "Shipped") || [];
    const totalShipped = shippedOrders.reduce((sum: number, p: any) => sum + (Number(p.unit) || 1), 0);

    // Calculate Return
    const returnOrders = purchasesData?.filter((p: any) => p.delivery_status === "Return") || [];
    const totalReturn = returnOrders.reduce((sum: number, p: any) => sum + (Number(p.unit) || 1), 0);

    // Platform breakdown
    const totalTiktok = purchasesData?.filter((p: any) => p.jenis_platform === "Tiktok").reduce((sum: number, p: any) => sum + (Number(p.unit) || 1), 0) || 0;
    const totalShopee = purchasesData?.filter((p: any) => p.jenis_platform === "Shopee").reduce((sum: number, p: any) => sum + (Number(p.unit) || 1), 0) || 0;
    const totalOnline = purchasesData?.filter((p: any) => p.jenis_platform && p.jenis_platform !== "Tiktok" && p.jenis_platform !== "Shopee").reduce((sum: number, p: any) => sum + (Number(p.unit) || 1), 0) || 0;

    // Stock In/Out (only from Logistic tables)
    const totalStockIn = productTransactions.reduce((sum, p) => sum + p.stockIn, 0);
    const totalStockOut = productTransactions.reduce((sum, p) => sum + p.stockOut, 0);

    return {
      grandTotalSales,
      totalStockIn,
      totalStockOut,
      totalShipped,
      totalReturn,
      totalTiktok,
      totalShopee,
      totalOnline,
    };
  }, [productTransactions, purchasesData]);

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  const isLoading = productsLoading || stockInLoading || stockOutLoading || purchasesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
          Product Transaction Report
        </h1>
        <p className="text-muted-foreground mt-2">
          View product transactions breakdown by date range
        </p>
      </div>

      {/* Date Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Package className="w-5 h-5" />
              <span className="font-medium text-foreground">Date Range:</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="space-y-1">
                <Label htmlFor="startDate" className="text-xs text-muted-foreground">From</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="endDate" className="text-xs text-muted-foreground">To</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-40"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats Cards - Stock In/Out from Logistic, others from Marketer */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-yellow-600 mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs font-medium">Total Sales</span>
            </div>
            <p className="text-xl font-bold">RM {summaryStats.grandTotalSales.toFixed(2)}</p>
            <div className="text-xs text-muted-foreground mt-1">Marketer</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-emerald-600 mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-medium">Stock In</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalStockIn}</p>
            <div className="text-xs text-muted-foreground mt-1">Logistic only</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-red-600 mb-1">
              <TrendingDown className="w-4 h-4" />
              <span className="text-xs font-medium">Stock Out</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalStockOut}</p>
            <div className="text-xs text-muted-foreground mt-1">Logistic only</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Truck className="w-4 h-4" />
              <span className="text-xs font-medium">Shipped</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalShipped}</p>
            <div className="text-xs text-muted-foreground mt-1">Marketer</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-orange-600 mb-1">
              <RotateCcw className="w-4 h-4" />
              <span className="text-xs font-medium">Return</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalReturn}</p>
            <div className="text-xs text-muted-foreground mt-1">Marketer</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-pink-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-pink-600 mb-1">
              <Play className="w-4 h-4" />
              <span className="text-xs font-medium">Tiktok</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalTiktok}</p>
            <div className="text-xs text-muted-foreground mt-1">Marketer</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-400">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-orange-500 mb-1">
              <ShoppingBag className="w-4 h-4" />
              <span className="text-xs font-medium">Shopee</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalShopee}</p>
            <div className="text-xs text-muted-foreground mt-1">Marketer</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-sky-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-sky-600 mb-1">
              <Globe className="w-4 h-4" />
              <span className="text-xs font-medium">Online</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalOnline}</p>
            <div className="text-xs text-muted-foreground mt-1">Marketer</div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Table */}
      <Card>
        <CardContent className="p-4">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10">SKU</TableHead>
                  <TableHead className="sticky left-16 bg-background z-10">Product Name</TableHead>
                  <TableHead className="text-center text-yellow-600">Total Sales</TableHead>
                  <TableHead className="text-center text-emerald-600">Stock In</TableHead>
                  <TableHead className="text-center text-red-600">Stock Out</TableHead>
                  <TableHead className="text-center text-blue-600">Shipped Out</TableHead>
                  <TableHead className="text-center text-orange-600">Return</TableHead>
                  <TableHead className="text-center bg-pink-50" colSpan={3}>
                    <div className="flex items-center justify-center gap-1">
                      <Play className="w-3 h-3" />
                      Tiktok
                    </div>
                  </TableHead>
                  <TableHead className="text-center bg-orange-50" colSpan={3}>
                    <div className="flex items-center justify-center gap-1">
                      <ShoppingBag className="w-3 h-3" />
                      Shopee
                    </div>
                  </TableHead>
                  <TableHead className="text-center bg-sky-50" colSpan={3}>
                    <div className="flex items-center justify-center gap-1">
                      <Globe className="w-3 h-3" />
                      Online
                    </div>
                  </TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10"></TableHead>
                  <TableHead className="sticky left-16 bg-background z-10"></TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground">RM</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground">Units</TableHead>
                  {/* Tiktok sub-headers */}
                  <TableHead className="text-center text-xs text-muted-foreground bg-pink-50">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-pink-50">Trans</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-pink-50">%</TableHead>
                  {/* Shopee sub-headers */}
                  <TableHead className="text-center text-xs text-muted-foreground bg-orange-50">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-orange-50">Trans</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-orange-50">%</TableHead>
                  {/* Online sub-headers */}
                  <TableHead className="text-center text-xs text-muted-foreground bg-sky-50">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-sky-50">Trans</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-sky-50">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productTransactions && productTransactions.length > 0 ? (
                  productTransactions.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium sticky left-0 bg-background z-10">{product.sku}</TableCell>
                      <TableCell className="sticky left-16 bg-background z-10">{product.name}</TableCell>
                      <TableCell className="text-center font-semibold text-yellow-600">{product.totalSales.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-semibold text-emerald-600">{product.stockIn}</TableCell>
                      <TableCell className="text-center font-semibold text-red-600">{product.stockOut}</TableCell>
                      <TableCell className="text-center font-semibold text-blue-600">{product.shippedUnits}</TableCell>
                      <TableCell className="text-center font-semibold text-orange-600">{product.returnUnits}</TableCell>
                      {/* Tiktok */}
                      <TableCell className="text-center bg-pink-50/50">{product.tiktok.units}</TableCell>
                      <TableCell className="text-center bg-pink-50/50">{product.tiktok.transactions}</TableCell>
                      <TableCell className="text-center bg-pink-50/50 text-xs">{formatPercent(product.tiktok.pct)}</TableCell>
                      {/* Shopee */}
                      <TableCell className="text-center bg-orange-50/50">{product.shopee.units}</TableCell>
                      <TableCell className="text-center bg-orange-50/50">{product.shopee.transactions}</TableCell>
                      <TableCell className="text-center bg-orange-50/50 text-xs">{formatPercent(product.shopee.pct)}</TableCell>
                      {/* Online */}
                      <TableCell className="text-center bg-sky-50/50">{product.online.units}</TableCell>
                      <TableCell className="text-center bg-sky-50/50">{product.online.transactions}</TableCell>
                      <TableCell className="text-center bg-sky-50/50 text-xs">{formatPercent(product.online.pct)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={16} className="text-center py-8 text-muted-foreground">
                      No products available.
                    </TableCell>
                  </TableRow>
                )}
                {/* Summary Row */}
                {productTransactions && productTransactions.length > 0 && (
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell className="sticky left-0 bg-muted/50 z-10">TOTAL</TableCell>
                    <TableCell className="sticky left-16 bg-muted/50 z-10"></TableCell>
                    <TableCell className="text-center text-yellow-600">{summaryStats.grandTotalSales.toFixed(2)}</TableCell>
                    <TableCell className="text-center text-emerald-600">{summaryStats.totalStockIn}</TableCell>
                    <TableCell className="text-center text-red-600">{summaryStats.totalStockOut}</TableCell>
                    <TableCell className="text-center text-blue-600">{summaryStats.totalShipped}</TableCell>
                    <TableCell className="text-center text-orange-600">{summaryStats.totalReturn}</TableCell>
                    <TableCell className="text-center bg-pink-100/50">{summaryStats.totalTiktok}</TableCell>
                    <TableCell className="text-center bg-pink-100/50">{productTransactions.reduce((sum, p) => sum + p.tiktok.transactions, 0)}</TableCell>
                    <TableCell className="text-center bg-pink-100/50">-</TableCell>
                    <TableCell className="text-center bg-orange-100/50">{summaryStats.totalShopee}</TableCell>
                    <TableCell className="text-center bg-orange-100/50">{productTransactions.reduce((sum, p) => sum + p.shopee.transactions, 0)}</TableCell>
                    <TableCell className="text-center bg-orange-100/50">-</TableCell>
                    <TableCell className="text-center bg-sky-100/50">{summaryStats.totalOnline}</TableCell>
                    <TableCell className="text-center bg-sky-100/50">{productTransactions.reduce((sum, p) => sum + p.online.transactions, 0)}</TableCell>
                    <TableCell className="text-center bg-sky-100/50">-</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LogisticProductTransaction;
