import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Package, Loader2, TrendingUp, RotateCcw, Truck, Play, ShoppingBag, Globe, DollarSign, CheckCircle, Clock, X, Facebook, Database, Search } from "lucide-react";
import { getMalaysiaDate } from "@/lib/utils";

// Detail modal type
type DetailModalType = "success" | "return" | "remaining" | null;
type PlatformType = "all" | "tiktok" | "shopee" | "facebook" | "database" | "google";

// Transaction Bundle tab - Bundle-level based on logistic_bundles table
// WITH Total Sales
const LogisticBundleTransaction = () => {
  // Date filter state - default to current date only
  const today = getMalaysiaDate();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<DetailModalType>(null);
  const [modalPlatform, setModalPlatform] = useState<PlatformType>("all");
  const [modalBundleId, setModalBundleId] = useState<string | null>(null);
  const [modalBundleName, setModalBundleName] = useState<string>("");

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

  // Fetch customer_purchases with bundle info (filter by date_order)
  // Include all needed fields for modal display
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
          date_order,
          date_processed,
          seo,
          tracking_number,
          name_customer,
          phone_customer,
          type_payment
        `);

      if (startDate) query = query.gte("date_order", startDate);
      if (endDate) query = query.lte("date_order", endDate);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Calculate bundle transaction data - group by bundle
  const bundleTransactions = useMemo(() => {
    if (!bundles || bundles.length === 0) return [];

    // Create bundle map for quick lookup
    const bundleMap = new Map<string, {
      id: string;
      sku: string;
      name: string;
      shippedUnits: number;
      successUnits: number;
      returnUnits: number;
      totalSales: number;
      tiktok: { units: number; success: number; returnUnits: number; sales: number };
      shopee: { units: number; success: number; returnUnits: number; sales: number };
      facebook: { units: number; success: number; returnUnits: number; sales: number };
      database: { units: number; success: number; returnUnits: number; sales: number };
      google: { units: number; success: number; returnUnits: number; sales: number };
    }>();

    // Initialize with all bundles
    bundles.forEach((bundle: any) => {
      bundleMap.set(bundle.id, {
        id: bundle.id,
        sku: bundle.sku || "N/A",
        name: bundle.name,
        shippedUnits: 0,
        successUnits: 0,
        returnUnits: 0,
        totalSales: 0,
        tiktok: { units: 0, success: 0, returnUnits: 0, sales: 0 },
        shopee: { units: 0, success: 0, returnUnits: 0, sales: 0 },
        facebook: { units: 0, success: 0, returnUnits: 0, sales: 0 },
        database: { units: 0, success: 0, returnUnits: 0, sales: 0 },
        google: { units: 0, success: 0, returnUnits: 0, sales: 0 },
      });
    });

    // Process purchases - group by bundle_id
    purchasesData.forEach((p: any) => {
      if (!p.bundle_id) return;

      const entry = bundleMap.get(p.bundle_id);
      if (!entry) return;

      const orderUnit = Number(p.unit) || 1;
      const orderSale = Number(p.total_sale) || 0;
      const isSuccess = p.seo === "Successfull Delivery";

      // Shipped
      if (p.delivery_status === "Shipped") {
        entry.shippedUnits += orderUnit;
        entry.totalSales += orderSale;

        // Success (SEO = Successfull Delivery)
        if (isSuccess) {
          entry.successUnits += orderUnit;
        }
      }

      // Return
      if (p.delivery_status === "Return") {
        entry.returnUnits += orderUnit;
      }

      // Platform breakdown
      const getPlatformEntry = () => {
        if (p.jenis_platform === "Tiktok") return entry.tiktok;
        if (p.jenis_platform === "Shopee") return entry.shopee;
        if (p.jenis_platform === "Facebook") return entry.facebook;
        if (p.jenis_platform === "Database") return entry.database;
        if (p.jenis_platform === "Google") return entry.google;
        return null;
      };

      const platformEntry = getPlatformEntry();
      if (platformEntry) {
        if (p.delivery_status === "Shipped") {
          platformEntry.units += orderUnit;
          platformEntry.sales += orderSale;
          if (isSuccess) {
            platformEntry.success += orderUnit;
          }
        }
        if (p.delivery_status === "Return") {
          platformEntry.returnUnits += orderUnit;
        }
      }
    });

    // Convert to array and calculate percentages and remaining
    return Array.from(bundleMap.values())
      .map((bundle) => {
        const totalPlatformUnits = bundle.tiktok.units + bundle.shopee.units + bundle.facebook.units + bundle.database.units + bundle.google.units;
        const tiktokPct = totalPlatformUnits > 0 ? (bundle.tiktok.units / totalPlatformUnits) * 100 : 0;
        const shopeePct = totalPlatformUnits > 0 ? (bundle.shopee.units / totalPlatformUnits) * 100 : 0;
        const facebookPct = totalPlatformUnits > 0 ? (bundle.facebook.units / totalPlatformUnits) * 100 : 0;
        const databasePct = totalPlatformUnits > 0 ? (bundle.database.units / totalPlatformUnits) * 100 : 0;
        const googlePct = totalPlatformUnits > 0 ? (bundle.google.units / totalPlatformUnits) * 100 : 0;

        // Remaining = Shipped - Success - Return
        const remaining = bundle.shippedUnits - bundle.successUnits - bundle.returnUnits;
        const tiktokRemaining = bundle.tiktok.units - bundle.tiktok.success - bundle.tiktok.returnUnits;
        const shopeeRemaining = bundle.shopee.units - bundle.shopee.success - bundle.shopee.returnUnits;
        const facebookRemaining = bundle.facebook.units - bundle.facebook.success - bundle.facebook.returnUnits;
        const databaseRemaining = bundle.database.units - bundle.database.success - bundle.database.returnUnits;
        const googleRemaining = bundle.google.units - bundle.google.success - bundle.google.returnUnits;

        return {
          ...bundle,
          remaining,
          tiktok: { ...bundle.tiktok, pct: tiktokPct, remaining: tiktokRemaining },
          shopee: { ...bundle.shopee, pct: shopeePct, remaining: shopeeRemaining },
          facebook: { ...bundle.facebook, pct: facebookPct, remaining: facebookRemaining },
          database: { ...bundle.database, pct: databasePct, remaining: databaseRemaining },
          google: { ...bundle.google, pct: googlePct, remaining: googleRemaining },
        };
      })
      .filter((b) => b.shippedUnits > 0 || b.returnUnits > 0);
  }, [bundles, purchasesData]);

  // Helper to check platform match
  const matchesPlatform = (order: any, platform: PlatformType): boolean => {
    if (platform === "all") return true;
    if (platform === "tiktok") return order.jenis_platform === "Tiktok";
    if (platform === "shopee") return order.jenis_platform === "Shopee";
    if (platform === "facebook") return order.jenis_platform === "Facebook";
    if (platform === "database") return order.jenis_platform === "Database";
    if (platform === "google") return order.jenis_platform === "Google";
    return false;
  };

  // Get filtered orders for modal
  const getModalOrders = useMemo(() => {
    if (!modalBundleId || !modalType) return [];

    return purchasesData.filter((p: any) => {
      if (p.bundle_id !== modalBundleId) return false;
      if (!matchesPlatform(p, modalPlatform)) return false;

      if (modalType === "success") {
        return p.delivery_status === "Shipped" && p.seo === "Successfull Delivery";
      } else if (modalType === "return") {
        return p.delivery_status === "Return";
      } else if (modalType === "remaining") {
        // Remaining = Shipped but NOT success and NOT return
        return p.delivery_status === "Shipped" && p.seo !== "Successfull Delivery";
      }
      return false;
    });
  }, [purchasesData, modalBundleId, modalType, modalPlatform]);

  // Handle opening modal
  const openModal = (bundleId: string, bundleName: string, type: DetailModalType, platform: PlatformType = "all") => {
    setModalBundleId(bundleId);
    setModalBundleName(bundleName);
    setModalType(type);
    setModalPlatform(platform);
    setModalOpen(true);
  };

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalShipped = bundleTransactions.reduce((sum, b) => sum + b.shippedUnits, 0);
    const totalSuccess = bundleTransactions.reduce((sum, b) => sum + b.successUnits, 0);
    const totalReturn = bundleTransactions.reduce((sum, b) => sum + b.returnUnits, 0);
    const totalRemaining = totalShipped - totalSuccess - totalReturn;
    const totalSales = bundleTransactions.reduce((sum, b) => sum + b.totalSales, 0);
    const totalTiktok = bundleTransactions.reduce((sum, b) => sum + b.tiktok.units, 0);
    const totalTiktokSales = bundleTransactions.reduce((sum, b) => sum + b.tiktok.sales, 0);
    const totalShopee = bundleTransactions.reduce((sum, b) => sum + b.shopee.units, 0);
    const totalShopeeSales = bundleTransactions.reduce((sum, b) => sum + b.shopee.sales, 0);
    const totalFacebook = bundleTransactions.reduce((sum, b) => sum + b.facebook.units, 0);
    const totalFacebookSales = bundleTransactions.reduce((sum, b) => sum + b.facebook.sales, 0);
    const totalDatabase = bundleTransactions.reduce((sum, b) => sum + b.database.units, 0);
    const totalDatabaseSales = bundleTransactions.reduce((sum, b) => sum + b.database.sales, 0);
    const totalGoogle = bundleTransactions.reduce((sum, b) => sum + b.google.units, 0);
    const totalGoogleSales = bundleTransactions.reduce((sum, b) => sum + b.google.sales, 0);

    return {
      totalShipped,
      totalSuccess,
      totalReturn,
      totalRemaining,
      totalSales,
      totalTiktok,
      totalTiktokSales,
      totalShopee,
      totalShopeeSales,
      totalFacebook,
      totalFacebookSales,
      totalDatabase,
      totalDatabaseSales,
      totalGoogle,
      totalGoogleSales,
    };
  }, [bundleTransactions]);

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;
  const formatCurrency = (value: number) => `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getPlatformLabel = () => {
    if (modalPlatform === "tiktok") return " (Tiktok)";
    if (modalPlatform === "shopee") return " (Shopee)";
    if (modalPlatform === "facebook") return " (Facebook)";
    if (modalPlatform === "database") return " (Database)";
    if (modalPlatform === "google") return " (Google)";
    return "";
  };

  const getModalTitle = () => {
    if (modalType === "success") return `Success Orders - ${modalBundleName}${getPlatformLabel()}`;
    if (modalType === "return") return `Return Orders - ${modalBundleName}${getPlatformLabel()}`;
    if (modalType === "remaining") return `Remaining Orders - ${modalBundleName}${getPlatformLabel()}`;
    return "";
  };

  const getModalTitleColor = () => {
    if (modalType === "success") return "text-green-600";
    if (modalType === "return") return "text-orange-600";
    if (modalType === "remaining") return "text-amber-600";
    return "";
  };

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
        <h1 className="text-2xl font-bold text-primary">Bundle Date Order</h1>
        <p className="text-muted-foreground mt-1">
          Bundle-level transactions with sales breakdown by date order
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-11 gap-3">
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

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs font-medium">Success</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalSuccess}</p>
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

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-amber-600 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-medium">Remaining</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalRemaining}</p>
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

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Facebook className="w-4 h-4" />
              <span className="text-xs font-medium">Facebook</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalFacebook}</p>
            <div className="text-xs text-muted-foreground mt-1">{formatCurrency(summaryStats.totalFacebookSales)}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-cyan-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-cyan-600 mb-1">
              <Database className="w-4 h-4" />
              <span className="text-xs font-medium">Database</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalDatabase}</p>
            <div className="text-xs text-muted-foreground mt-1">{formatCurrency(summaryStats.totalDatabaseSales)}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-red-600 mb-1">
              <Search className="w-4 h-4" />
              <span className="text-xs font-medium">Google</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalGoogle}</p>
            <div className="text-xs text-muted-foreground mt-1">{formatCurrency(summaryStats.totalGoogleSales)}</div>
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
                  <TableHead className="text-center text-green-600">Success</TableHead>
                  <TableHead className="text-center text-orange-600">Return</TableHead>
                  <TableHead className="text-center text-amber-600">Remaining</TableHead>
                  <TableHead className="text-right text-emerald-600">Total Sales</TableHead>
                  <TableHead className="text-center bg-pink-50" colSpan={6}>
                    <div className="flex items-center justify-center gap-1">
                      <Play className="w-3 h-3" />
                      Tiktok
                    </div>
                  </TableHead>
                  <TableHead className="text-center bg-orange-50" colSpan={6}>
                    <div className="flex items-center justify-center gap-1">
                      <ShoppingBag className="w-3 h-3" />
                      Shopee
                    </div>
                  </TableHead>
                  <TableHead className="text-center bg-blue-50" colSpan={6}>
                    <div className="flex items-center justify-center gap-1">
                      <Facebook className="w-3 h-3" />
                      Facebook
                    </div>
                  </TableHead>
                  <TableHead className="text-center bg-cyan-50" colSpan={6}>
                    <div className="flex items-center justify-center gap-1">
                      <Database className="w-3 h-3" />
                      Database
                    </div>
                  </TableHead>
                  <TableHead className="text-center bg-red-50" colSpan={6}>
                    <div className="flex items-center justify-center gap-1">
                      <Search className="w-3 h-3" />
                      Google
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
                  <TableHead className="text-right text-xs text-muted-foreground">RM</TableHead>
                  {/* Tiktok sub-headers */}
                  <TableHead className="text-center text-xs text-muted-foreground bg-pink-50">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-pink-50">Success</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-pink-50">Return</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-pink-50">Remain</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-pink-50">Sales</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-pink-50">%</TableHead>
                  {/* Shopee sub-headers */}
                  <TableHead className="text-center text-xs text-muted-foreground bg-orange-50">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-orange-50">Success</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-orange-50">Return</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-orange-50">Remain</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-orange-50">Sales</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-orange-50">%</TableHead>
                  {/* Facebook sub-headers */}
                  <TableHead className="text-center text-xs text-muted-foreground bg-blue-50">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-blue-50">Success</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-blue-50">Return</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-blue-50">Remain</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-blue-50">Sales</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-blue-50">%</TableHead>
                  {/* Database sub-headers */}
                  <TableHead className="text-center text-xs text-muted-foreground bg-cyan-50">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-cyan-50">Success</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-cyan-50">Return</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-cyan-50">Remain</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-cyan-50">Sales</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-cyan-50">%</TableHead>
                  {/* Google sub-headers */}
                  <TableHead className="text-center text-xs text-muted-foreground bg-red-50">Units</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-red-50">Success</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-red-50">Return</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-red-50">Remain</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-red-50">Sales</TableHead>
                  <TableHead className="text-center text-xs text-muted-foreground bg-red-50">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bundleTransactions && bundleTransactions.length > 0 ? (
                  bundleTransactions.map((bundle) => (
                    <TableRow key={bundle.id}>
                      <TableCell className="font-medium sticky left-0 bg-background z-10">{bundle.sku}</TableCell>
                      <TableCell>{bundle.name}</TableCell>
                      <TableCell className="text-center font-semibold text-blue-600">{bundle.shippedUnits}</TableCell>
                      <TableCell className="text-center font-semibold text-green-600">
                        {bundle.successUnits > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "success", "all")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.successUnits}
                          </button>
                        ) : (
                          bundle.successUnits
                        )}
                      </TableCell>
                      <TableCell className="text-center font-semibold text-orange-600">
                        {bundle.returnUnits > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "return", "all")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.returnUnits}
                          </button>
                        ) : (
                          bundle.returnUnits
                        )}
                      </TableCell>
                      <TableCell className="text-center font-semibold text-amber-600">
                        {bundle.remaining > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "remaining", "all")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.remaining}
                          </button>
                        ) : (
                          bundle.remaining
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">{formatCurrency(bundle.totalSales)}</TableCell>
                      {/* Tiktok */}
                      <TableCell className="text-center bg-pink-50/50">{bundle.tiktok.units}</TableCell>
                      <TableCell className="text-center bg-pink-50/50 text-green-600">
                        {bundle.tiktok.success > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "success", "tiktok")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.tiktok.success}
                          </button>
                        ) : (
                          bundle.tiktok.success
                        )}
                      </TableCell>
                      <TableCell className="text-center bg-pink-50/50 text-orange-600">
                        {bundle.tiktok.returnUnits > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "return", "tiktok")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.tiktok.returnUnits}
                          </button>
                        ) : (
                          bundle.tiktok.returnUnits
                        )}
                      </TableCell>
                      <TableCell className="text-center bg-pink-50/50 text-amber-600">
                        {bundle.tiktok.remaining > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "remaining", "tiktok")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.tiktok.remaining}
                          </button>
                        ) : (
                          bundle.tiktok.remaining
                        )}
                      </TableCell>
                      <TableCell className="text-center bg-pink-50/50 text-xs">{formatCurrency(bundle.tiktok.sales)}</TableCell>
                      <TableCell className="text-center bg-pink-50/50 text-xs">{formatPercent(bundle.tiktok.pct)}</TableCell>
                      {/* Shopee */}
                      <TableCell className="text-center bg-orange-50/50">{bundle.shopee.units}</TableCell>
                      <TableCell className="text-center bg-orange-50/50 text-green-600">
                        {bundle.shopee.success > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "success", "shopee")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.shopee.success}
                          </button>
                        ) : (
                          bundle.shopee.success
                        )}
                      </TableCell>
                      <TableCell className="text-center bg-orange-50/50 text-orange-600">
                        {bundle.shopee.returnUnits > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "return", "shopee")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.shopee.returnUnits}
                          </button>
                        ) : (
                          bundle.shopee.returnUnits
                        )}
                      </TableCell>
                      <TableCell className="text-center bg-orange-50/50 text-amber-600">
                        {bundle.shopee.remaining > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "remaining", "shopee")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.shopee.remaining}
                          </button>
                        ) : (
                          bundle.shopee.remaining
                        )}
                      </TableCell>
                      <TableCell className="text-center bg-orange-50/50 text-xs">{formatCurrency(bundle.shopee.sales)}</TableCell>
                      <TableCell className="text-center bg-orange-50/50 text-xs">{formatPercent(bundle.shopee.pct)}</TableCell>
                      {/* Facebook */}
                      <TableCell className="text-center bg-blue-50/50">{bundle.facebook.units}</TableCell>
                      <TableCell className="text-center bg-blue-50/50 text-green-600">
                        {bundle.facebook.success > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "success", "facebook")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.facebook.success}
                          </button>
                        ) : (
                          bundle.facebook.success
                        )}
                      </TableCell>
                      <TableCell className="text-center bg-blue-50/50 text-orange-600">
                        {bundle.facebook.returnUnits > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "return", "facebook")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.facebook.returnUnits}
                          </button>
                        ) : (
                          bundle.facebook.returnUnits
                        )}
                      </TableCell>
                      <TableCell className="text-center bg-blue-50/50 text-amber-600">
                        {bundle.facebook.remaining > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "remaining", "facebook")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.facebook.remaining}
                          </button>
                        ) : (
                          bundle.facebook.remaining
                        )}
                      </TableCell>
                      <TableCell className="text-center bg-blue-50/50 text-xs">{formatCurrency(bundle.facebook.sales)}</TableCell>
                      <TableCell className="text-center bg-blue-50/50 text-xs">{formatPercent(bundle.facebook.pct)}</TableCell>
                      {/* Database */}
                      <TableCell className="text-center bg-cyan-50/50">{bundle.database.units}</TableCell>
                      <TableCell className="text-center bg-cyan-50/50 text-green-600">
                        {bundle.database.success > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "success", "database")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.database.success}
                          </button>
                        ) : (
                          bundle.database.success
                        )}
                      </TableCell>
                      <TableCell className="text-center bg-cyan-50/50 text-orange-600">
                        {bundle.database.returnUnits > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "return", "database")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.database.returnUnits}
                          </button>
                        ) : (
                          bundle.database.returnUnits
                        )}
                      </TableCell>
                      <TableCell className="text-center bg-cyan-50/50 text-amber-600">
                        {bundle.database.remaining > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "remaining", "database")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.database.remaining}
                          </button>
                        ) : (
                          bundle.database.remaining
                        )}
                      </TableCell>
                      <TableCell className="text-center bg-cyan-50/50 text-xs">{formatCurrency(bundle.database.sales)}</TableCell>
                      <TableCell className="text-center bg-cyan-50/50 text-xs">{formatPercent(bundle.database.pct)}</TableCell>
                      {/* Google */}
                      <TableCell className="text-center bg-red-50/50">{bundle.google.units}</TableCell>
                      <TableCell className="text-center bg-red-50/50 text-green-600">
                        {bundle.google.success > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "success", "google")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.google.success}
                          </button>
                        ) : (
                          bundle.google.success
                        )}
                      </TableCell>
                      <TableCell className="text-center bg-red-50/50 text-orange-600">
                        {bundle.google.returnUnits > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "return", "google")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.google.returnUnits}
                          </button>
                        ) : (
                          bundle.google.returnUnits
                        )}
                      </TableCell>
                      <TableCell className="text-center bg-red-50/50 text-amber-600">
                        {bundle.google.remaining > 0 ? (
                          <button
                            onClick={() => openModal(bundle.id, bundle.name, "remaining", "google")}
                            className="hover:underline cursor-pointer"
                          >
                            {bundle.google.remaining}
                          </button>
                        ) : (
                          bundle.google.remaining
                        )}
                      </TableCell>
                      <TableCell className="text-center bg-red-50/50 text-xs">{formatCurrency(bundle.google.sales)}</TableCell>
                      <TableCell className="text-center bg-red-50/50 text-xs">{formatPercent(bundle.google.pct)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={37} className="text-center py-8 text-muted-foreground">
                      No bundle transactions found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className={getModalTitleColor()}>
              {getModalTitle()}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Order details for {modalBundleName}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">#</TableHead>
                  <TableHead>Tracking Number</TableHead>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-center">Payment</TableHead>
                  <TableHead className="text-center">Date Order</TableHead>
                  <TableHead className="text-center">Date Processed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getModalOrders.length > 0 ? (
                  getModalOrders.map((order: any, index: number) => (
                    <TableRow key={order.id}>
                      <TableCell className="text-center">{index + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{order.tracking_number || "-"}</TableCell>
                      <TableCell>{order.name_customer || "-"}</TableCell>
                      <TableCell>{order.phone_customer || "-"}</TableCell>
                      <TableCell className="text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          order.type_payment === "COD"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-green-100 text-green-700"
                        }`}>
                          {order.type_payment || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-xs">{order.date_order || "-"}</TableCell>
                      <TableCell className="text-center text-xs">{order.date_processed || "-"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No orders found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-between items-center pt-4 border-t">
            <span className="text-sm text-muted-foreground">
              Total: {getModalOrders.length} order(s)
            </span>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              <X className="w-4 h-4 mr-2" />
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LogisticBundleTransaction;
