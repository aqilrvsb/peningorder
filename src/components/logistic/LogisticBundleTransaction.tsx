import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Loader2, TrendingUp, RotateCcw, Truck, Play, ShoppingBag, Globe, DollarSign } from "lucide-react";
import { parseISO, isWithinInterval } from "date-fns";
import { getMalaysiaDate } from "@/lib/utils";

// Transaction Bundle tab - Bundle-level based on logistic_bundles table
// WITH Total Sales
const LogisticBundleTransaction = () => {
  // Date filter state - default to current date only
  const today = getMalaysiaDate();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  // Fetch all bundles from logistic_bundles table
  const { data: bundles = [], isLoading: bundlesLoading } = useQuery({
    queryKey: ["all-logistic-bundles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("logistic_bundles")
        .select("id, name, sku, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch customer_purchases with bundle info (filter by date_processed)
  const { data: purchasesData = [], isLoading: purchasesLoading } = useQuery({
    queryKey: ["bundle-transactions", startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("customer_purchases")
        .select(`
          id,
          bundle_id,
          unit,
          total_sale,
          delivery_status,
          jenis_platform,
          date_processed
        `);

      if (startDate) query = query.gte("date_processed", startDate);
      if (endDate) query = query.lte("date_processed", endDate);

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

  // Calculate bundle transaction data - group by bundle
  const bundleTransactions = useMemo(() => {
    if (!bundles || bundles.length === 0) return [];

    // Create bundle map for quick lookup
    const bundleMap = new Map<string, {
      id: string;
      sku: string;
      name: string;
      shippedUnits: number;
      returnUnits: number;
      totalSales: number;
      tiktok: { units: number; sales: number };
      shopee: { units: number; sales: number };
      online: { units: number; sales: number };
    }>();

    // Initialize with all bundles
    bundles.forEach((bundle: any) => {
      bundleMap.set(bundle.id, {
        id: bundle.id,
        sku: bundle.sku || "N/A",
        name: bundle.name,
        shippedUnits: 0,
        returnUnits: 0,
        totalSales: 0,
        tiktok: { units: 0, sales: 0 },
        shopee: { units: 0, sales: 0 },
        online: { units: 0, sales: 0 },
      });
    });

    // Process purchases - group by bundle_id
    purchasesData.forEach((p: any) => {
      if (!p.bundle_id) return;

      const entry = bundleMap.get(p.bundle_id);
      if (!entry) return;

      const orderUnit = Number(p.unit) || 1;
      const orderSale = Number(p.total_sale) || 0;

      // Shipped
      if (p.delivery_status === "Shipped") {
        entry.shippedUnits += orderUnit;
        entry.totalSales += orderSale;
      }

      // Return
      if (p.delivery_status === "Return") {
        entry.returnUnits += orderUnit;
      }

      // Platform breakdown (only for Shipped orders)
      if (p.delivery_status === "Shipped") {
        if (p.jenis_platform === "Tiktok") {
          entry.tiktok.units += orderUnit;
          entry.tiktok.sales += orderSale;
        } else if (p.jenis_platform === "Shopee") {
          entry.shopee.units += orderUnit;
          entry.shopee.sales += orderSale;
        } else if (p.jenis_platform) {
          entry.online.units += orderUnit;
          entry.online.sales += orderSale;
        }
      }
    });

    // Convert to array and calculate percentages
    return Array.from(bundleMap.values())
      .map((bundle) => {
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
      })
      .filter((b) => b.shippedUnits > 0 || b.returnUnits > 0);
  }, [bundles, purchasesData, startDate, endDate]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalShipped = bundleTransactions.reduce((sum, b) => sum + b.shippedUnits, 0);
    const totalReturn = bundleTransactions.reduce((sum, b) => sum + b.returnUnits, 0);
    const totalSales = bundleTransactions.reduce((sum, b) => sum + b.totalSales, 0);
    const totalTiktok = bundleTransactions.reduce((sum, b) => sum + b.tiktok.units, 0);
    const totalTiktokSales = bundleTransactions.reduce((sum, b) => sum + b.tiktok.sales, 0);
    const totalShopee = bundleTransactions.reduce((sum, b) => sum + b.shopee.units, 0);
    const totalShopeeSales = bundleTransactions.reduce((sum, b) => sum + b.shopee.sales, 0);
    const totalOnline = bundleTransactions.reduce((sum, b) => sum + b.online.units, 0);
    const totalOnlineSales = bundleTransactions.reduce((sum, b) => sum + b.online.sales, 0);

    return {
      totalShipped,
      totalReturn,
      totalSales,
      totalTiktok,
      totalTiktokSales,
      totalShopee,
      totalShopeeSales,
      totalOnline,
      totalOnlineSales,
    };
  }, [bundleTransactions]);

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;
  const formatCurrency = (value: number) => `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const isLoading = bundlesLoading || purchasesLoading;

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
        <h1 className="text-2xl font-bold text-primary">Transaction Bundle</h1>
        <p className="text-muted-foreground mt-1">
          Bundle-level transactions with sales breakdown by date range
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

      {/* Summary Stats Cards - WITH Total Sales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
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

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-emerald-600 mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs font-medium">Total Sales</span>
            </div>
            <p className="text-lg font-bold">{formatCurrency(summaryStats.totalSales)}</p>
            <div className="text-xs text-muted-foreground mt-1">Revenue</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-pink-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-pink-600 mb-1">
              <Play className="w-4 h-4" />
              <span className="text-xs font-medium">Tiktok</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalTiktok}</p>
            <div className="text-xs text-muted-foreground mt-1">{formatCurrency(summaryStats.totalTiktokSales)}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-400">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-orange-500 mb-1">
              <ShoppingBag className="w-4 h-4" />
              <span className="text-xs font-medium">Shopee</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalShopee}</p>
            <div className="text-xs text-muted-foreground mt-1">{formatCurrency(summaryStats.totalShopeeSales)}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-sky-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-sky-600 mb-1">
              <Globe className="w-4 h-4" />
              <span className="text-xs font-medium">Online</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalOnline}</p>
            <div className="text-xs text-muted-foreground mt-1">{formatCurrency(summaryStats.totalOnlineSales)}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-violet-600 mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-medium">Avg Order</span>
            </div>
            <p className="text-lg font-bold">
              {summaryStats.totalShipped > 0
                ? formatCurrency(summaryStats.totalSales / summaryStats.totalShipped)
                : "RM 0.00"}
            </p>
            <div className="text-xs text-muted-foreground mt-1">Per unit</div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Table - WITH Total Sales column */}
      <Card>
        <CardContent className="p-4">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10">SKU</TableHead>
                  <TableHead>Bundle Name</TableHead>
                  <TableHead className="text-center text-blue-600">Shipped Out</TableHead>
                  <TableHead className="text-center text-orange-600">Return</TableHead>
                  <TableHead className="text-right text-emerald-600">Total Sales</TableHead>
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
                  <TableHead></TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground">Units</TableHead>
                  <TableHead className="text-right text-xs text-muted-foreground">RM</TableHead>
                  {/* Tiktok sub-headers */}
                  <TableHead className="text-center text-xs text-muted-foreground bg-pink-50">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-pink-50">Sales</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-pink-50">%</TableHead>
                  {/* Shopee sub-headers */}
                  <TableHead className="text-center text-xs text-muted-foreground bg-orange-50">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-orange-50">Sales</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-orange-50">%</TableHead>
                  {/* Online sub-headers */}
                  <TableHead className="text-center text-xs text-muted-foreground bg-sky-50">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-sky-50">Sales</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-sky-50">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bundleTransactions && bundleTransactions.length > 0 ? (
                  bundleTransactions.map((bundle) => (
                    <TableRow key={bundle.id}>
                      <TableCell className="font-medium sticky left-0 bg-background z-10">{bundle.sku}</TableCell>
                      <TableCell>{bundle.name}</TableCell>
                      <TableCell className="text-center font-semibold text-blue-600">{bundle.shippedUnits}</TableCell>
                      <TableCell className="text-center font-semibold text-orange-600">{bundle.returnUnits}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">{formatCurrency(bundle.totalSales)}</TableCell>
                      {/* Tiktok */}
                      <TableCell className="text-center bg-pink-50/50">{bundle.tiktok.units}</TableCell>
                      <TableCell className="text-center bg-pink-50/50 text-xs">{formatCurrency(bundle.tiktok.sales)}</TableCell>
                      <TableCell className="text-center bg-pink-50/50 text-xs">{formatPercent(bundle.tiktok.pct)}</TableCell>
                      {/* Shopee */}
                      <TableCell className="text-center bg-orange-50/50">{bundle.shopee.units}</TableCell>
                      <TableCell className="text-center bg-orange-50/50 text-xs">{formatCurrency(bundle.shopee.sales)}</TableCell>
                      <TableCell className="text-center bg-orange-50/50 text-xs">{formatPercent(bundle.shopee.pct)}</TableCell>
                      {/* Online */}
                      <TableCell className="text-center bg-sky-50/50">{bundle.online.units}</TableCell>
                      <TableCell className="text-center bg-sky-50/50 text-xs">{formatCurrency(bundle.online.sales)}</TableCell>
                      <TableCell className="text-center bg-sky-50/50 text-xs">{formatPercent(bundle.online.pct)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                      No bundle transactions found.
                    </TableCell>
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

export default LogisticBundleTransaction;
