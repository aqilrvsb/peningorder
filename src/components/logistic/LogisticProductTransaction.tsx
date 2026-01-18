import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Loader2, TrendingUp, TrendingDown, RotateCcw, Truck, Play, ShoppingBag, Globe } from "lucide-react";
import { parseISO, isWithinInterval } from "date-fns";
import { getMalaysiaDate } from "@/lib/utils";

// Transaction tab - Product-level inventory (based on products table)
// NO Total Sales - focused on inventory movement
// Bundle SKU format: "SKU-qty + SKU-qty" (e.g., "GSI-1 + SBN-2")
const LogisticProductTransaction = () => {
  const { user } = useAuth();

  // Date filter state - default to current date only
  const today = getMalaysiaDate();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  // Fetch all products from products table
  const { data: products = [], isLoading: productsLoading } = useQuery({
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
  const { data: stockInData = [], isLoading: stockInLoading } = useQuery({
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
  const { data: stockOutData = [], isLoading: stockOutLoading } = useQuery({
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

  // Fetch customer_purchases with bundle info (filter by date_processed)
  const { data: purchasesData = [], isLoading: purchasesLoading } = useQuery({
    queryKey: ["product-transactions", startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("customer_purchases")
        .select(`
          id,
          bundle_id,
          unit,
          delivery_status,
          jenis_platform,
          date_processed,
          bundle:logistic_bundles(id, name, sku)
        `);

      if (startDate) query = query.gte("date_processed", startDate);
      if (endDate) query = query.lte("date_processed", endDate);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Helper: Parse bundle SKU to get individual product SKUs with quantities
  // Format: "GSI-1 + SBN-2" -> [{sku: "GSI", qty: 1}, {sku: "SBN", qty: 2}]
  const parseBundleSku = (bundleSku: string | null): { sku: string; qty: number }[] => {
    if (!bundleSku) return [];

    const parts = bundleSku.split(" + ");
    return parts.map(part => {
      const match = part.trim().match(/^([A-Za-z0-9]+)-(\d+)$/);
      if (match) {
        return { sku: match[1].toUpperCase(), qty: parseInt(match[2], 10) };
      }
      // Handle single SKU without quantity
      return { sku: part.trim().toUpperCase(), qty: 1 };
    }).filter(p => p.sku);
  };

  // Filter helper function
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

  // Calculate product transaction data - group by product SKU
  const productTransactions = useMemo(() => {
    if (!products || products.length === 0) return [];

    // Create product map for quick lookup
    const productMap = new Map<string, {
      id: string;
      sku: string;
      name: string;
      stockIn: number;
      stockOut: number;
      shippedUnits: number;
      returnUnits: number;
      tiktok: { units: number; transactions: number };
      shopee: { units: number; transactions: number };
      online: { units: number; transactions: number };
    }>();

    // Initialize with all products
    products.forEach((product: any) => {
      productMap.set(product.sku?.toUpperCase() || product.id, {
        id: product.id,
        sku: product.sku || "N/A",
        name: product.name,
        stockIn: 0,
        stockOut: 0,
        shippedUnits: 0,
        returnUnits: 0,
        tiktok: { units: 0, transactions: 0 },
        shopee: { units: 0, transactions: 0 },
        online: { units: 0, transactions: 0 },
      });
    });

    // Add Stock In from logistic tables
    stockInData.forEach((s: any) => {
      const product = products.find((p: any) => p.id === s.product_id);
      if (product && isInDateRange(s.date)) {
        const key = product.sku?.toUpperCase() || product.id;
        const entry = productMap.get(key);
        if (entry) {
          entry.stockIn += s.quantity || 0;
        }
      }
    });

    // Add Stock Out from logistic tables
    stockOutData.forEach((s: any) => {
      const product = products.find((p: any) => p.id === s.product_id);
      if (product && isInDateRange(s.date)) {
        const key = product.sku?.toUpperCase() || product.id;
        const entry = productMap.get(key);
        if (entry) {
          entry.stockOut += s.quantity || 0;
        }
      }
    });

    // Process purchases - break down bundle SKU to individual products
    purchasesData.forEach((p: any) => {
      const bundleSku = p.bundle?.sku;
      const orderUnit = Number(p.unit) || 1;
      const parsedProducts = parseBundleSku(bundleSku);

      parsedProducts.forEach(({ sku, qty }) => {
        const entry = productMap.get(sku);
        if (entry) {
          const totalQty = qty * orderUnit;

          // Shipped
          if (p.delivery_status === "Shipped") {
            entry.shippedUnits += totalQty;
          }

          // Return
          if (p.delivery_status === "Return") {
            entry.returnUnits += totalQty;
          }

          // Platform breakdown
          if (p.jenis_platform === "Tiktok") {
            entry.tiktok.units += totalQty;
            entry.tiktok.transactions += 1;
          } else if (p.jenis_platform === "Shopee") {
            entry.shopee.units += totalQty;
            entry.shopee.transactions += 1;
          } else if (p.jenis_platform) {
            entry.online.units += totalQty;
            entry.online.transactions += 1;
          }
        }
      });
    });

    // Convert to array and calculate percentages
    return Array.from(productMap.values())
      .map((product) => {
        const totalPlatformUnits = product.tiktok.units + product.shopee.units + product.online.units;
        const tiktokPct = totalPlatformUnits > 0 ? (product.tiktok.units / totalPlatformUnits) * 100 : 0;
        const shopeePct = totalPlatformUnits > 0 ? (product.shopee.units / totalPlatformUnits) * 100 : 0;
        const onlinePct = totalPlatformUnits > 0 ? (product.online.units / totalPlatformUnits) * 100 : 0;

        return {
          ...product,
          tiktok: { ...product.tiktok, pct: tiktokPct },
          shopee: { ...product.shopee, pct: shopeePct },
          online: { ...product.online, pct: onlinePct },
        };
      })
      .filter((p) => p.stockIn > 0 || p.stockOut > 0 || p.shippedUnits > 0 || p.returnUnits > 0);
  }, [products, stockInData, stockOutData, purchasesData, startDate, endDate]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalStockIn = productTransactions.reduce((sum, p) => sum + p.stockIn, 0);
    const totalStockOut = productTransactions.reduce((sum, p) => sum + p.stockOut, 0);
    const totalShipped = productTransactions.reduce((sum, p) => sum + p.shippedUnits, 0);
    const totalReturn = productTransactions.reduce((sum, p) => sum + p.returnUnits, 0);
    const totalTiktok = productTransactions.reduce((sum, p) => sum + p.tiktok.units, 0);
    const totalShopee = productTransactions.reduce((sum, p) => sum + p.shopee.units, 0);
    const totalOnline = productTransactions.reduce((sum, p) => sum + p.online.units, 0);

    return {
      totalStockIn,
      totalStockOut,
      totalShipped,
      totalReturn,
      totalTiktok,
      totalShopee,
      totalOnline,
    };
  }, [productTransactions]);

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
        <h1 className="text-2xl font-bold text-primary">Transaction</h1>
        <p className="text-muted-foreground mt-1">
          Product inventory transactions breakdown by date range
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

      {/* Summary Stats Cards - NO Total Sales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
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
            <div className="text-xs text-muted-foreground mt-1">Units</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-orange-600 mb-1">
              <RotateCcw className="w-4 h-4" />
              <span className="text-xs font-medium">Return</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalReturn}</p>
            <div className="text-xs text-muted-foreground mt-1">Units</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-pink-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-pink-600 mb-1">
              <Play className="w-4 h-4" />
              <span className="text-xs font-medium">Tiktok</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalTiktok}</p>
            <div className="text-xs text-muted-foreground mt-1">Units</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-400">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-orange-500 mb-1">
              <ShoppingBag className="w-4 h-4" />
              <span className="text-xs font-medium">Shopee</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalShopee}</p>
            <div className="text-xs text-muted-foreground mt-1">Units</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-sky-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-sky-600 mb-1">
              <Globe className="w-4 h-4" />
              <span className="text-xs font-medium">Online</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalOnline}</p>
            <div className="text-xs text-muted-foreground mt-1">Units</div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Table - NO Total Sales column */}
      <Card>
        <CardContent className="p-4">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10">SKU</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead className="text-center text-emerald-600">Stock In</TableHead>
                  <TableHead className="text-center text-red-600">Stock Out</TableHead>
                  <TableHead className="text-center text-blue-600">Shipped Out</TableHead>
                  <TableHead className="text-center text-orange-600">Return</TableHead>
                  <TableHead className="text-center bg-pink-50" colSpan={2}>
                    <div className="flex items-center justify-center gap-1">
                      <Play className="w-3 h-3" />
                      Tiktok
                    </div>
                  </TableHead>
                  <TableHead className="text-center bg-orange-50" colSpan={2}>
                    <div className="flex items-center justify-center gap-1">
                      <ShoppingBag className="w-3 h-3" />
                      Shopee
                    </div>
                  </TableHead>
                  <TableHead className="text-center bg-sky-50" colSpan={2}>
                    <div className="flex items-center justify-center gap-1">
                      <Globe className="w-3 h-3" />
                      Online
                    </div>
                  </TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10"></TableHead>
                  <TableHead></TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground">Units</TableHead>
                  {/* Tiktok sub-headers */}
                  <TableHead className="text-center text-xs text-muted-foreground bg-pink-50">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-pink-50">%</TableHead>
                  {/* Shopee sub-headers */}
                  <TableHead className="text-center text-xs text-muted-foreground bg-orange-50">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-orange-50">%</TableHead>
                  {/* Online sub-headers */}
                  <TableHead className="text-center text-xs text-muted-foreground bg-sky-50">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-sky-50">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productTransactions && productTransactions.length > 0 ? (
                  productTransactions.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium sticky left-0 bg-background z-10">{product.sku}</TableCell>
                      <TableCell>{product.name}</TableCell>
                      <TableCell className="text-center font-semibold text-emerald-600">{product.stockIn}</TableCell>
                      <TableCell className="text-center font-semibold text-red-600">{product.stockOut}</TableCell>
                      <TableCell className="text-center font-semibold text-blue-600">{product.shippedUnits}</TableCell>
                      <TableCell className="text-center font-semibold text-orange-600">{product.returnUnits}</TableCell>
                      {/* Tiktok */}
                      <TableCell className="text-center bg-pink-50/50">{product.tiktok.units}</TableCell>
                      <TableCell className="text-center bg-pink-50/50 text-xs">{formatPercent(product.tiktok.pct)}</TableCell>
                      {/* Shopee */}
                      <TableCell className="text-center bg-orange-50/50">{product.shopee.units}</TableCell>
                      <TableCell className="text-center bg-orange-50/50 text-xs">{formatPercent(product.shopee.pct)}</TableCell>
                      {/* Online */}
                      <TableCell className="text-center bg-sky-50/50">{product.online.units}</TableCell>
                      <TableCell className="text-center bg-sky-50/50 text-xs">{formatPercent(product.online.pct)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                      No product transactions found.
                    </TableCell>
                  </TableRow>
                )}
                {/* Summary Row */}
                {productTransactions && productTransactions.length > 0 && (
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell className="sticky left-0 bg-muted/50 z-10">TOTAL</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-center text-emerald-600">{summaryStats.totalStockIn}</TableCell>
                    <TableCell className="text-center text-red-600">{summaryStats.totalStockOut}</TableCell>
                    <TableCell className="text-center text-blue-600">{summaryStats.totalShipped}</TableCell>
                    <TableCell className="text-center text-orange-600">{summaryStats.totalReturn}</TableCell>
                    <TableCell className="text-center bg-pink-100/50">{summaryStats.totalTiktok}</TableCell>
                    <TableCell className="text-center bg-pink-100/50">-</TableCell>
                    <TableCell className="text-center bg-orange-100/50">{summaryStats.totalShopee}</TableCell>
                    <TableCell className="text-center bg-orange-100/50">-</TableCell>
                    <TableCell className="text-center bg-sky-100/50">{summaryStats.totalOnline}</TableCell>
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
