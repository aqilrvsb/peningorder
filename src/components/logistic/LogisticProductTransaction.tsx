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
  const { data: purchasesData = [], isLoading: purchasesLoading } = useQuery({
    queryKey: ["marketer-orders-transactions", startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("customer_purchases")
        .select("id, product_id, sku, quantity, delivery_status, platform, jenis_platform, date_order, date_processed, date_return, marketer_id, total_price, produk");

      if (startDate) query = query.gte("date_order", startDate);
      if (endDate) query = query.lte("date_order", endDate);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

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

  // Helper function to check if SKU/name is a combo (contains " + ")
  const isCombo = (text: string | null | undefined): boolean => {
    return text ? text.includes(' + ') : false;
  };

  // Calculate product transaction data
  const productTransactions = useMemo(() => {
    if (!products) return [];

    // First, get regular products
    const regularProducts = products.map((product) => {
      // Stock In - filter by date
      const stockIn = stockInData
        ?.filter((s) => s.product_id === product.id && isInDateRange(s.date))
        ?.reduce((sum, s) => sum + (s.quantity || 0), 0) || 0;

      // Stock Out - filter by date
      const stockOut = stockOutData
        ?.filter((s) => s.product_id === product.id && isInDateRange(s.date))
        ?.reduce((sum, s) => sum + (s.quantity || 0), 0) || 0;

      // Get purchases for this product
      // Match by: 1) product_id, 2) SKU, 3) product name in produk field
      // This ensures orders without product_id linked are still counted for the correct product
      const productPurchases = purchasesData?.filter((p) => {
        // Direct match by product_id
        if (p.product_id === product.id) return true;

        // Skip combos (contain " + ") - they're handled separately
        const purchaseProductName = (p.produk || "").toLowerCase();
        if (purchaseProductName.includes(' + ')) return false;

        // Match by SKU (sku field may contain "SKU-qty" format like "ZP250-2")
        if (p.sku && product.sku) {
          const purchaseSku = p.sku.split('-')[0].toUpperCase(); // Get base SKU without quantity
          const productSku = product.sku.toUpperCase();
          if (purchaseSku === productSku) return true;
        }

        // Match by product name (when product_id is NULL)
        if (!p.product_id) {
          const productName = product.name.toLowerCase();
          // Check if the purchase product name contains the product name or vice versa
          if (purchaseProductName && productName) {
            return purchaseProductName.includes(productName) || productName.includes(purchaseProductName);
          }
        }
        return false;
      }) || [];

      // Total Sales - use total_price for per-product calculation (Marketer data only)
      const allOrdersByDateOrder = productPurchases.filter(
        (p) => isInDateRange(p.date_order)
      );
      const totalSales = allOrdersByDateOrder.reduce((sum, p) => sum + (Number(p.total_price) || 0), 0);

      // Shipped Out - delivery_status = 'Shipped', filter by date_order (Marketer data only)
      const shippedPurchases = productPurchases.filter(
        (p) => p.delivery_status === "Shipped" && isInDateRange(p.date_order)
      );
      const shippedUnits = shippedPurchases.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const shippedTransactions = shippedPurchases.length;

      // Return - delivery_status = 'Return', filter by date_order (Marketer data only)
      const returnPurchases = productPurchases.filter(
        (p) => p.delivery_status === "Return" && isInDateRange(p.date_order)
      );
      const returnUnits = returnPurchases.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const returnTransactions = returnPurchases.length;

      // Platform breakdown - Marketer uses 'jenis_platform' (Marketer data only)
      // Tiktok
      const tiktokPurchases = allOrdersByDateOrder.filter((p) => p.jenis_platform === "Tiktok");
      const tiktokUnits = tiktokPurchases.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const tiktokTransactions = tiktokPurchases.length;

      // Shopee
      const shopeePurchases = allOrdersByDateOrder.filter((p) => p.jenis_platform === "Shopee");
      const shopeeUnits = shopeePurchases.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const shopeeTransactions = shopeePurchases.length;

      // Online (Facebook, Database, Google, etc. - anything not Tiktok/Shopee)
      const onlinePurchases = allOrdersByDateOrder.filter(
        (p) => p.jenis_platform && p.jenis_platform !== "Tiktok" && p.jenis_platform !== "Shopee"
      );
      const onlineUnits = onlinePurchases.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const onlineTransactions = onlinePurchases.length;

      // Calculate percentages based on total platform units
      const totalPlatformUnits = tiktokUnits + shopeeUnits + onlineUnits;
      const tiktokPct = totalPlatformUnits > 0 ? (tiktokUnits / totalPlatformUnits) * 100 : 0;
      const shopeePct = totalPlatformUnits > 0 ? (shopeeUnits / totalPlatformUnits) * 100 : 0;
      const onlinePct = totalPlatformUnits > 0 ? (onlineUnits / totalPlatformUnits) * 100 : 0;

      return {
        ...product,
        totalSales,
        stockIn,
        stockOut,
        shippedUnits,
        shippedTransactions,
        returnUnits,
        returnTransactions,
        tiktok: { units: tiktokUnits, transactions: tiktokTransactions, pct: tiktokPct },
        shopee: { units: shopeeUnits, transactions: shopeeTransactions, pct: shopeePct },
        online: { units: onlineUnits, transactions: onlineTransactions, pct: onlinePct },
        isCombo: false,
      };
    });

    // Now get combo products from purchases (where product_id is NULL and produk contains " + ")
    // This ensures no double counting - combos are only counted when product_id is NULL
    const allComboPurchases = purchasesData?.filter((p: any) => {
      const productName = p.produk || "";
      // Only count as combo if product_id is NULL (not linked to a specific product)
      return !p.product_id && isCombo(productName);
    }) || [];

    // Group combo purchases by product name (Marketer data only)
    const comboMap = new Map<string, {
      name: string;
      totalSales: number;
      shippedUnits: number;
      shippedTransactions: number;
      returnUnits: number;
      returnTransactions: number;
      tiktok: { units: number; transactions: number };
      shopee: { units: number; transactions: number };
      online: { units: number; transactions: number };
    }>();

    allComboPurchases.forEach((p: any) => {
      const comboName = p.produk || "Unknown Combo";

      // Get or create combo entry
      if (!comboMap.has(comboName)) {
        comboMap.set(comboName, {
          name: comboName,
          totalSales: 0,
          shippedUnits: 0,
          shippedTransactions: 0,
          returnUnits: 0,
          returnTransactions: 0,
          tiktok: { units: 0, transactions: 0 },
          shopee: { units: 0, transactions: 0 },
          online: { units: 0, transactions: 0 },
        });
      }

      const combo = comboMap.get(comboName)!;
      const qty = Number(p.quantity) || 0;

      // Total Sales - filter by date_order
      if (isInDateRange(p.date_order)) {
        const price = Number(p.total_price) || 0;
        combo.totalSales += price;
      }

      // Shipped Out - delivery_status = 'Shipped', filter by date_order
      if (p.delivery_status === "Shipped" && isInDateRange(p.date_order)) {
        combo.shippedUnits += qty;
        combo.shippedTransactions += 1;
      }

      // Platform breakdown - Marketer uses 'jenis_platform'
      if (isInDateRange(p.date_order)) {
        if (p.jenis_platform === "Tiktok") {
          combo.tiktok.units += qty;
          combo.tiktok.transactions += 1;
        } else if (p.jenis_platform === "Shopee") {
          combo.shopee.units += qty;
          combo.shopee.transactions += 1;
        } else if (p.jenis_platform) {
          combo.online.units += qty;
          combo.online.transactions += 1;
        }
      }

      // Return - delivery_status = 'Return', filter by date_order
      if (p.delivery_status === "Return" && isInDateRange(p.date_order)) {
        combo.returnUnits += qty;
        combo.returnTransactions += 1;
      }
    });

    // Convert combo map to array with same structure as regular products
    const comboProducts = Array.from(comboMap.values()).map((combo, index) => {
      // Calculate percentages based on total platform units
      const totalPlatformUnits = combo.tiktok.units + combo.shopee.units + combo.online.units;
      const tiktokPct = totalPlatformUnits > 0 ? (combo.tiktok.units / totalPlatformUnits) * 100 : 0;
      const shopeePct = totalPlatformUnits > 0 ? (combo.shopee.units / totalPlatformUnits) * 100 : 0;
      const onlinePct = totalPlatformUnits > 0 ? (combo.online.units / totalPlatformUnits) * 100 : 0;

      return {
        id: `combo-${index}`,
        sku: `COMBO - ${combo.name}`, // Prefix with COMBO
        name: combo.name,
        totalSales: combo.totalSales,
        stockIn: 0,
        stockOut: 0,
        shippedUnits: combo.shippedUnits,
        shippedTransactions: combo.shippedTransactions,
        returnUnits: combo.returnUnits,
        returnTransactions: combo.returnTransactions,
        tiktok: { units: combo.tiktok.units, transactions: combo.tiktok.transactions, pct: tiktokPct },
        shopee: { units: combo.shopee.units, transactions: combo.shopee.transactions, pct: shopeePct },
        online: { units: combo.online.units, transactions: combo.online.transactions, pct: onlinePct },
        isCombo: true,
      };
    });

    // Filter out combos with no activity (no sales, shipped, or returns) and combine with regular products
    const filteredCombos = comboProducts.filter((c) => c.totalSales > 0 || c.shippedUnits > 0 || c.returnUnits > 0);

    return [...regularProducts, ...filteredCombos];
  }, [products, stockInData, stockOutData, purchasesData, startDate, endDate]);

  // Summary stats - Marketer data only (except Stock In/Out from Logistic)
  const summaryStats = useMemo(() => {
    // Calculate Grand Total Sales using total_price (Marketer data only)
    const allOrdersInRange = purchasesData?.filter((p: any) => isInDateRange(p.date_order)) || [];
    const grandTotalSales = allOrdersInRange.reduce((sum: number, o: any) => sum + (Number(o.total_price) || 0), 0);

    // Calculate Shipped (Marketer data only)
    const shippedOrders = purchasesData?.filter((p: any) => p.delivery_status === "Shipped" && isInDateRange(p.date_order)) || [];
    const totalShipped = shippedOrders.reduce((sum: number, p: any) => sum + (p.quantity || 0), 0);

    // Calculate Return (Marketer data only)
    const returnOrders = purchasesData?.filter((p: any) => p.delivery_status === "Return" && isInDateRange(p.date_order)) || [];
    const totalReturn = returnOrders.reduce((sum: number, p: any) => sum + (p.quantity || 0), 0);

    // Platform breakdown (Marketer data only - uses jenis_platform)
    const totalTiktok = allOrdersInRange.filter((p: any) => p.jenis_platform === "Tiktok").reduce((sum: number, p: any) => sum + (p.quantity || 0), 0);
    const totalShopee = allOrdersInRange.filter((p: any) => p.jenis_platform === "Shopee").reduce((sum: number, p: any) => sum + (p.quantity || 0), 0);
    const totalOnline = allOrdersInRange.filter((p: any) => p.jenis_platform && p.jenis_platform !== "Tiktok" && p.jenis_platform !== "Shopee").reduce((sum: number, p: any) => sum + (p.quantity || 0), 0);

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
  }, [productTransactions, purchasesData, startDate, endDate]);

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
