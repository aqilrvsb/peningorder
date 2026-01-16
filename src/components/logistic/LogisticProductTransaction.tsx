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

  // Fetch logistic orders (seller_id = user.id AND marketer_id IS NULL)
  const { data: logisticOrders = [], isLoading: logisticOrdersLoading } = useQuery({
    queryKey: ["logistic-orders-transactions", user?.id, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("customer_purchases")
        .select("id, product_id, sku, quantity, delivery_status, platform, jenis_platform, date_order, date_processed, date_return, marketer_id, total_price, produk")
        .eq("seller_id", user?.id)
        .is("marketer_id", null);

      if (startDate) query = query.gte("date_order", startDate);
      if (endDate) query = query.lte("date_order", endDate);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch marketer orders (seller_id = user.id AND marketer_id IS NOT NULL)
  const { data: marketerOrders = [], isLoading: marketerOrdersLoading } = useQuery({
    queryKey: ["logistic-marketer-orders-transactions", user?.id, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("customer_purchases")
        .select("id, product_id, sku, quantity, delivery_status, platform, jenis_platform, date_order, date_processed, date_return, marketer_id, total_price, produk")
        .eq("seller_id", user?.id)
        .not("marketer_id", "is", null);

      if (startDate) query = query.gte("date_order", startDate);
      if (endDate) query = query.lte("date_order", endDate);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Combine logistic and marketer orders
  const purchasesData = useMemo(() => {
    return [...logisticOrders, ...marketerOrders];
  }, [logisticOrders, marketerOrders]);

  const purchasesLoading = logisticOrdersLoading || marketerOrdersLoading;

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

      // Total Sales - use total_price for per-product calculation
      // Note: For Product Transaction Report we use total_price (individual product price)
      // because we're showing sales PER PRODUCT, not total invoice
      const allOrdersByDateOrder = productPurchases.filter(
        (p) => isInDateRange(p.date_order)
      );
      const totalSales = allOrdersByDateOrder.reduce((sum, p) => sum + (Number(p.total_price) || 0), 0);
      // Logistic/Marketer breakdown for Total Sales
      const logisticSales = allOrdersByDateOrder.filter((p) => !p.marketer_id).reduce((sum, p) => sum + (Number(p.total_price) || 0), 0);
      const marketerSales = allOrdersByDateOrder.filter((p) => p.marketer_id).reduce((sum, p) => sum + (Number(p.total_price) || 0), 0);

      // Shipped Out - delivery_status = 'Shipped', filter by date_order
      const shippedPurchases = productPurchases.filter(
        (p) => p.delivery_status === "Shipped" && isInDateRange(p.date_order)
      );
      const shippedUnits = shippedPurchases.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const shippedTransactions = shippedPurchases.length;
      // Logistic/Marketer breakdown for Shipped
      const logisticShippedUnits = shippedPurchases.filter((p) => !p.marketer_id).reduce((sum, p) => sum + (p.quantity || 0), 0);
      const marketerShippedUnits = shippedPurchases.filter((p) => p.marketer_id).reduce((sum, p) => sum + (p.quantity || 0), 0);

      // Return - delivery_status = 'Return', filter by date_order
      const returnPurchases = productPurchases.filter(
        (p) => p.delivery_status === "Return" && isInDateRange(p.date_order)
      );
      const returnUnits = returnPurchases.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const returnTransactions = returnPurchases.length;
      // Logistic/Marketer breakdown for Return
      const logisticReturnUnits = returnPurchases.filter((p) => !p.marketer_id).reduce((sum, p) => sum + (p.quantity || 0), 0);
      const marketerReturnUnits = returnPurchases.filter((p) => p.marketer_id).reduce((sum, p) => sum + (p.quantity || 0), 0);

      // Platform breakdown - Logistic uses 'platform', Marketer uses 'jenis_platform'
      // Use ALL orders (not just shipped) to match Customer HQ/Marketer
      const logisticHQOrders = allOrdersByDateOrder.filter((p) => !p.marketer_id);
      const marketerOrdersFiltered = allOrdersByDateOrder.filter((p) => p.marketer_id);

      // Tiktok - Logistic uses "Tiktok HQ", Marketer uses jenis_platform "Tiktok" - ALL orders
      const logisticTiktokPurchases = logisticHQOrders.filter((p) => p.platform === "Tiktok HQ");
      const logisticTiktokUnits = logisticTiktokPurchases.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const logisticTiktokTransactions = logisticTiktokPurchases.length;
      const marketerTiktokPurchases = marketerOrdersFiltered.filter((p) => p.jenis_platform === "Tiktok");
      const marketerTiktokUnits = marketerTiktokPurchases.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const marketerTiktokTransactions = marketerTiktokPurchases.length;
      const tiktokUnits = logisticTiktokUnits + marketerTiktokUnits;
      const tiktokTransactions = logisticTiktokTransactions + marketerTiktokTransactions;

      // Shopee - Logistic uses "Shopee HQ", Marketer uses jenis_platform "Shopee" - ALL orders
      const logisticShopeePurchases = logisticHQOrders.filter((p) => p.platform === "Shopee HQ");
      const logisticShopeeUnits = logisticShopeePurchases.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const logisticShopeeTransactions = logisticShopeePurchases.length;
      const marketerShopeePurchases = marketerOrdersFiltered.filter((p) => p.jenis_platform === "Shopee");
      const marketerShopeeUnits = marketerShopeePurchases.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const marketerShopeeTransactions = marketerShopeePurchases.length;
      const shopeeUnits = logisticShopeeUnits + marketerShopeeUnits;
      const shopeeTransactions = logisticShopeeTransactions + marketerShopeeTransactions;

      // Online - Logistic uses Facebook/Database/Google, Marketer uses other jenis_platform - ALL orders
      const logisticOnlinePurchases = logisticHQOrders.filter(
        (p) => p.platform === "Facebook" || p.platform === "Database" || p.platform === "Google"
      );
      const logisticOnlineUnits = logisticOnlinePurchases.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const logisticOnlineTransactions = logisticOnlinePurchases.length;
      const marketerOnlinePurchases = marketerOrdersFiltered.filter(
        (p) => p.jenis_platform && p.jenis_platform !== "Tiktok" && p.jenis_platform !== "Shopee"
      );
      const marketerOnlineUnits = marketerOnlinePurchases.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const marketerOnlineTransactions = marketerOnlinePurchases.length;
      const onlineUnits = logisticOnlineUnits + marketerOnlineUnits;
      const onlineTransactions = logisticOnlineTransactions + marketerOnlineTransactions;

      // Calculate percentages based on total shipped units
      const totalPlatformUnits = tiktokUnits + shopeeUnits + onlineUnits;
      const tiktokPct = totalPlatformUnits > 0 ? (tiktokUnits / totalPlatformUnits) * 100 : 0;
      const logisticTiktokPct = totalPlatformUnits > 0 ? (logisticTiktokUnits / totalPlatformUnits) * 100 : 0;
      const marketerTiktokPct = totalPlatformUnits > 0 ? (marketerTiktokUnits / totalPlatformUnits) * 100 : 0;
      const shopeePct = totalPlatformUnits > 0 ? (shopeeUnits / totalPlatformUnits) * 100 : 0;
      const logisticShopeePct = totalPlatformUnits > 0 ? (logisticShopeeUnits / totalPlatformUnits) * 100 : 0;
      const marketerShopeePct = totalPlatformUnits > 0 ? (marketerShopeeUnits / totalPlatformUnits) * 100 : 0;
      const onlinePct = totalPlatformUnits > 0 ? (onlineUnits / totalPlatformUnits) * 100 : 0;
      const logisticOnlinePct = totalPlatformUnits > 0 ? (logisticOnlineUnits / totalPlatformUnits) * 100 : 0;
      const marketerOnlinePct = totalPlatformUnits > 0 ? (marketerOnlineUnits / totalPlatformUnits) * 100 : 0;

      return {
        ...product,
        totalSales,
        logisticSales,
        marketerSales,
        stockIn,
        stockOut,
        shippedUnits,
        logisticShippedUnits,
        marketerShippedUnits,
        shippedTransactions,
        returnUnits,
        logisticReturnUnits,
        marketerReturnUnits,
        returnTransactions,
        tiktok: { units: tiktokUnits, logisticUnits: logisticTiktokUnits, marketerUnits: marketerTiktokUnits, transactions: tiktokTransactions, logisticTransactions: logisticTiktokTransactions, marketerTransactions: marketerTiktokTransactions, pct: tiktokPct, logisticPct: logisticTiktokPct, marketerPct: marketerTiktokPct },
        shopee: { units: shopeeUnits, logisticUnits: logisticShopeeUnits, marketerUnits: marketerShopeeUnits, transactions: shopeeTransactions, logisticTransactions: logisticShopeeTransactions, marketerTransactions: marketerShopeeTransactions, pct: shopeePct, logisticPct: logisticShopeePct, marketerPct: marketerShopeePct },
        online: { units: onlineUnits, logisticUnits: logisticOnlineUnits, marketerUnits: marketerOnlineUnits, transactions: onlineTransactions, logisticTransactions: logisticOnlineTransactions, marketerTransactions: marketerOnlineTransactions, pct: onlinePct, logisticPct: logisticOnlinePct, marketerPct: marketerOnlinePct },
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

    // Group combo purchases by product name with full breakdown like regular products
    const comboMap = new Map<string, {
      name: string;
      totalSales: number;
      logisticSales: number;
      marketerSales: number;
      shippedUnits: number;
      logisticShippedUnits: number;
      marketerShippedUnits: number;
      shippedTransactions: number;
      returnUnits: number;
      logisticReturnUnits: number;
      marketerReturnUnits: number;
      returnTransactions: number;
      tiktok: { units: number; logisticUnits: number; marketerUnits: number; transactions: number; logisticTransactions: number; marketerTransactions: number };
      shopee: { units: number; logisticUnits: number; marketerUnits: number; transactions: number; logisticTransactions: number; marketerTransactions: number };
      online: { units: number; logisticUnits: number; marketerUnits: number; transactions: number; logisticTransactions: number; marketerTransactions: number };
    }>();

    allComboPurchases.forEach((p: any) => {
      const comboName = p.produk || "Unknown Combo";
      const isLogistic = !p.marketer_id;

      // Get or create combo entry
      if (!comboMap.has(comboName)) {
        comboMap.set(comboName, {
          name: comboName,
          totalSales: 0,
          logisticSales: 0,
          marketerSales: 0,
          shippedUnits: 0,
          logisticShippedUnits: 0,
          marketerShippedUnits: 0,
          shippedTransactions: 0,
          returnUnits: 0,
          logisticReturnUnits: 0,
          marketerReturnUnits: 0,
          returnTransactions: 0,
          tiktok: { units: 0, logisticUnits: 0, marketerUnits: 0, transactions: 0, logisticTransactions: 0, marketerTransactions: 0 },
          shopee: { units: 0, logisticUnits: 0, marketerUnits: 0, transactions: 0, logisticTransactions: 0, marketerTransactions: 0 },
          online: { units: 0, logisticUnits: 0, marketerUnits: 0, transactions: 0, logisticTransactions: 0, marketerTransactions: 0 },
        });
      }

      const combo = comboMap.get(comboName)!;
      const qty = Number(p.quantity) || 0;

      // Total Sales - filter by date_order
      if (isInDateRange(p.date_order)) {
        const price = Number(p.total_price) || 0;
        combo.totalSales += price;
        if (isLogistic) {
          combo.logisticSales += price;
        } else {
          combo.marketerSales += price;
        }
      }

      // Shipped Out - delivery_status = 'Shipped', filter by date_order
      if (p.delivery_status === "Shipped" && isInDateRange(p.date_order)) {
        combo.shippedUnits += qty;
        combo.shippedTransactions += 1;
        if (isLogistic) {
          combo.logisticShippedUnits += qty;
        } else {
          combo.marketerShippedUnits += qty;
        }
      }

      // Platform breakdown - Logistic uses 'platform', Marketer uses 'jenis_platform'
      // Use ALL orders (not just shipped) to match Customer HQ/Marketer
      if (isInDateRange(p.date_order)) {
        if (isLogistic) {
          if (p.platform === "Tiktok HQ") {
            combo.tiktok.units += qty;
            combo.tiktok.logisticUnits += qty;
            combo.tiktok.transactions += 1;
            combo.tiktok.logisticTransactions += 1;
          } else if (p.platform === "Shopee HQ") {
            combo.shopee.units += qty;
            combo.shopee.logisticUnits += qty;
            combo.shopee.transactions += 1;
            combo.shopee.logisticTransactions += 1;
          } else if (p.platform === "Facebook" || p.platform === "Database" || p.platform === "Google") {
            combo.online.units += qty;
            combo.online.logisticUnits += qty;
            combo.online.transactions += 1;
            combo.online.logisticTransactions += 1;
          }
        } else {
          // Marketer - use jenis_platform
          if (p.jenis_platform === "Tiktok") {
            combo.tiktok.units += qty;
            combo.tiktok.marketerUnits += qty;
            combo.tiktok.transactions += 1;
            combo.tiktok.marketerTransactions += 1;
          } else if (p.jenis_platform === "Shopee") {
            combo.shopee.units += qty;
            combo.shopee.marketerUnits += qty;
            combo.shopee.transactions += 1;
            combo.shopee.marketerTransactions += 1;
          } else if (p.jenis_platform) {
            combo.online.units += qty;
            combo.online.marketerUnits += qty;
            combo.online.transactions += 1;
            combo.online.marketerTransactions += 1;
          }
        }
      }

      // Return - delivery_status = 'Return', filter by date_order
      if (p.delivery_status === "Return" && isInDateRange(p.date_order)) {
        combo.returnUnits += qty;
        combo.returnTransactions += 1;
        if (isLogistic) {
          combo.logisticReturnUnits += qty;
        } else {
          combo.marketerReturnUnits += qty;
        }
      }
    });

    // Convert combo map to array with same structure as regular products
    const comboProducts = Array.from(comboMap.values()).map((combo, index) => {
      // Calculate percentages based on total shipped units
      const totalPlatformUnits = combo.tiktok.units + combo.shopee.units + combo.online.units;
      const tiktokPct = totalPlatformUnits > 0 ? (combo.tiktok.units / totalPlatformUnits) * 100 : 0;
      const logisticTiktokPct = totalPlatformUnits > 0 ? (combo.tiktok.logisticUnits / totalPlatformUnits) * 100 : 0;
      const marketerTiktokPct = totalPlatformUnits > 0 ? (combo.tiktok.marketerUnits / totalPlatformUnits) * 100 : 0;
      const shopeePct = totalPlatformUnits > 0 ? (combo.shopee.units / totalPlatformUnits) * 100 : 0;
      const logisticShopeePct = totalPlatformUnits > 0 ? (combo.shopee.logisticUnits / totalPlatformUnits) * 100 : 0;
      const marketerShopeePct = totalPlatformUnits > 0 ? (combo.shopee.marketerUnits / totalPlatformUnits) * 100 : 0;
      const onlinePct = totalPlatformUnits > 0 ? (combo.online.units / totalPlatformUnits) * 100 : 0;
      const logisticOnlinePct = totalPlatformUnits > 0 ? (combo.online.logisticUnits / totalPlatformUnits) * 100 : 0;
      const marketerOnlinePct = totalPlatformUnits > 0 ? (combo.online.marketerUnits / totalPlatformUnits) * 100 : 0;

      return {
        id: `combo-${index}`,
        sku: `COMBO - ${combo.name}`, // Prefix with COMBO
        name: combo.name,
        totalSales: combo.totalSales,
        logisticSales: combo.logisticSales,
        marketerSales: combo.marketerSales,
        stockIn: 0,
        stockOut: 0,
        shippedUnits: combo.shippedUnits,
        logisticShippedUnits: combo.logisticShippedUnits,
        marketerShippedUnits: combo.marketerShippedUnits,
        shippedTransactions: combo.shippedTransactions,
        returnUnits: combo.returnUnits,
        logisticReturnUnits: combo.logisticReturnUnits,
        marketerReturnUnits: combo.marketerReturnUnits,
        returnTransactions: combo.returnTransactions,
        tiktok: { units: combo.tiktok.units, logisticUnits: combo.tiktok.logisticUnits, marketerUnits: combo.tiktok.marketerUnits, transactions: combo.tiktok.transactions, logisticTransactions: combo.tiktok.logisticTransactions, marketerTransactions: combo.tiktok.marketerTransactions, pct: tiktokPct, logisticPct: logisticTiktokPct, marketerPct: marketerTiktokPct },
        shopee: { units: combo.shopee.units, logisticUnits: combo.shopee.logisticUnits, marketerUnits: combo.shopee.marketerUnits, transactions: combo.shopee.transactions, logisticTransactions: combo.shopee.logisticTransactions, marketerTransactions: combo.shopee.marketerTransactions, pct: shopeePct, logisticPct: logisticShopeePct, marketerPct: marketerShopeePct },
        online: { units: combo.online.units, logisticUnits: combo.online.logisticUnits, marketerUnits: combo.online.marketerUnits, transactions: combo.online.transactions, logisticTransactions: combo.online.logisticTransactions, marketerTransactions: combo.online.marketerTransactions, pct: onlinePct, logisticPct: logisticOnlinePct, marketerPct: marketerOnlinePct },
        isCombo: true,
      };
    });

    // Filter out combos with no activity (no sales, shipped, or returns) and combine with regular products
    const filteredCombos = comboProducts.filter((c) => c.totalSales > 0 || c.shippedUnits > 0 || c.returnUnits > 0);

    return [...regularProducts, ...filteredCombos];
  }, [products, stockInData, stockOutData, purchasesData, startDate, endDate]);

  // Summary stats - calculate Grand Total Sales with Logistic/Marketer breakdown
  const summaryStats = useMemo(() => {
    // Calculate Grand Total Sales using total_price
    const allOrdersInRange = purchasesData?.filter((p: any) => isInDateRange(p.date_order)) || [];

    let grandTotalSales = 0;
    let logisticTotalSales = 0;
    let marketerTotalSales = 0;

    allOrdersInRange.forEach((o: any) => {
      const isLogistic = !o.marketer_id;
      grandTotalSales += Number(o.total_price) || 0;
      if (isLogistic) {
        logisticTotalSales += Number(o.total_price) || 0;
      } else {
        marketerTotalSales += Number(o.total_price) || 0;
      }
    });

    // Calculate Shipped breakdown by Logistic/Marketer
    const shippedOrders = purchasesData?.filter((p: any) => p.delivery_status === "Shipped" && isInDateRange(p.date_order)) || [];
    const logisticShipped = shippedOrders.filter((p: any) => !p.marketer_id).reduce((sum: number, p: any) => sum + (p.quantity || 0), 0);
    const marketerShipped = shippedOrders.filter((p: any) => p.marketer_id).reduce((sum: number, p: any) => sum + (p.quantity || 0), 0);
    const totalShipped = logisticShipped + marketerShipped;

    // Calculate Return breakdown by Logistic/Marketer
    const returnOrders = purchasesData?.filter((p: any) => p.delivery_status === "Return" && isInDateRange(p.date_order)) || [];
    const logisticReturn = returnOrders.filter((p: any) => !p.marketer_id).reduce((sum: number, p: any) => sum + (p.quantity || 0), 0);
    const marketerReturn = returnOrders.filter((p: any) => p.marketer_id).reduce((sum: number, p: any) => sum + (p.quantity || 0), 0);
    const totalReturn = logisticReturn + marketerReturn;

    // Platform breakdown with Logistic/Marketer - use ALL orders (not just shipped) to match Customer HQ/Marketer
    // Tiktok - Logistic uses "Tiktok HQ", Marketer uses jenis_platform "Tiktok"
    const logisticTiktok = allOrdersInRange.filter((p: any) => p.platform === "Tiktok HQ" && !p.marketer_id).reduce((sum: number, p: any) => sum + (p.quantity || 0), 0);
    const marketerTiktok = allOrdersInRange.filter((p: any) => p.jenis_platform === "Tiktok" && p.marketer_id).reduce((sum: number, p: any) => sum + (p.quantity || 0), 0);
    const totalTiktok = logisticTiktok + marketerTiktok;

    // Shopee - Logistic uses "Shopee HQ", Marketer uses jenis_platform "Shopee"
    const logisticShopee = allOrdersInRange.filter((p: any) => p.platform === "Shopee HQ" && !p.marketer_id).reduce((sum: number, p: any) => sum + (p.quantity || 0), 0);
    const marketerShopee = allOrdersInRange.filter((p: any) => p.jenis_platform === "Shopee" && p.marketer_id).reduce((sum: number, p: any) => sum + (p.quantity || 0), 0);
    const totalShopee = logisticShopee + marketerShopee;

    // Online - Logistic uses Facebook/Database/Google, Marketer uses jenis_platform not Tiktok/Shopee (like Facebook, etc)
    const logisticOnline = allOrdersInRange.filter((p: any) =>
      !p.marketer_id && (p.platform === "Facebook" || p.platform === "Database" || p.platform === "Google")
    ).reduce((sum: number, p: any) => sum + (p.quantity || 0), 0);
    const marketerOnline = allOrdersInRange.filter((p: any) =>
      p.marketer_id && p.jenis_platform && p.jenis_platform !== "Tiktok" && p.jenis_platform !== "Shopee"
    ).reduce((sum: number, p: any) => sum + (p.quantity || 0), 0);
    const totalOnline = logisticOnline + marketerOnline;

    // Stock In/Out (only Logistic HQ)
    const totalStockIn = productTransactions.reduce((sum, p) => sum + p.stockIn, 0);
    const totalStockOut = productTransactions.reduce((sum, p) => sum + p.stockOut, 0);

    return {
      grandTotalSales,
      logisticTotalSales,
      marketerTotalSales,
      totalStockIn,
      totalStockOut,
      totalShipped,
      logisticShipped,
      marketerShipped,
      totalReturn,
      logisticReturn,
      marketerReturn,
      totalTiktok,
      logisticTiktok,
      marketerTiktok,
      totalShopee,
      logisticShopee,
      marketerShopee,
      totalOnline,
      logisticOnline,
      marketerOnline,
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

      {/* Summary Stats Cards with Sum | Logistic | Marketer breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-yellow-600 mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs font-medium">Total Sales</span>
            </div>
            <p className="text-xl font-bold">RM {summaryStats.grandTotalSales.toFixed(2)}</p>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <span className="text-blue-600">{summaryStats.logisticTotalSales.toFixed(0)}</span>
              <span>|</span>
              <span className="text-purple-600">{summaryStats.marketerTotalSales.toFixed(0)}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="text-blue-600">Logistic</span>
              <span>|</span>
              <span className="text-purple-600">Marketer</span>
            </div>
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
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <span className="text-blue-600">{summaryStats.logisticShipped}</span>
              <span>|</span>
              <span className="text-purple-600">{summaryStats.marketerShipped}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="text-blue-600">Logistic</span>
              <span>|</span>
              <span className="text-purple-600">Marketer</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-orange-600 mb-1">
              <RotateCcw className="w-4 h-4" />
              <span className="text-xs font-medium">Return</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalReturn}</p>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <span className="text-blue-600">{summaryStats.logisticReturn}</span>
              <span>|</span>
              <span className="text-purple-600">{summaryStats.marketerReturn}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="text-blue-600">Logistic</span>
              <span>|</span>
              <span className="text-purple-600">Marketer</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-pink-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-pink-600 mb-1">
              <Play className="w-4 h-4" />
              <span className="text-xs font-medium">Tiktok</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalTiktok}</p>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <span className="text-blue-600">{summaryStats.logisticTiktok}</span>
              <span>|</span>
              <span className="text-purple-600">{summaryStats.marketerTiktok}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="text-blue-600">Logistic</span>
              <span>|</span>
              <span className="text-purple-600">Marketer</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-400">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-orange-500 mb-1">
              <ShoppingBag className="w-4 h-4" />
              <span className="text-xs font-medium">Shopee</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalShopee}</p>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <span className="text-blue-600">{summaryStats.logisticShopee}</span>
              <span>|</span>
              <span className="text-purple-600">{summaryStats.marketerShopee}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="text-blue-600">Logistic</span>
              <span>|</span>
              <span className="text-purple-600">Marketer</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-sky-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-sky-600 mb-1">
              <Globe className="w-4 h-4" />
              <span className="text-xs font-medium">Online</span>
            </div>
            <p className="text-xl font-bold">{summaryStats.totalOnline}</p>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <span className="text-blue-600">{summaryStats.logisticOnline}</span>
              <span>|</span>
              <span className="text-purple-600">{summaryStats.marketerOnline}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="text-blue-600">Logistic</span>
              <span>|</span>
              <span className="text-purple-600">Marketer</span>
            </div>
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
                      <TableCell className="text-center">
                        <div className="font-semibold text-yellow-600">{product.totalSales.toFixed(2)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          <span className="text-blue-600">{product.logisticSales.toFixed(0)}</span>
                          <span className="mx-0.5">|</span>
                          <span className="text-purple-600">{product.marketerSales.toFixed(0)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-semibold text-emerald-600">{product.stockIn}</TableCell>
                      <TableCell className="text-center font-semibold text-red-600">{product.stockOut}</TableCell>
                      <TableCell className="text-center">
                        <div className="font-semibold text-blue-600">{product.shippedUnits}</div>
                        <div className="text-[10px] text-muted-foreground">
                          <span className="text-blue-600">{product.logisticShippedUnits}</span>
                          <span className="mx-0.5">|</span>
                          <span className="text-purple-600">{product.marketerShippedUnits}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="font-semibold text-orange-600">{product.returnUnits}</div>
                        <div className="text-[10px] text-muted-foreground">
                          <span className="text-blue-600">{product.logisticReturnUnits}</span>
                          <span className="mx-0.5">|</span>
                          <span className="text-purple-600">{product.marketerReturnUnits}</span>
                        </div>
                      </TableCell>
                      {/* Tiktok */}
                      <TableCell className="text-center bg-pink-50/50">
                        <div>{product.tiktok.units}</div>
                        <div className="text-[10px] text-muted-foreground">
                          <span className="text-blue-600">{product.tiktok.logisticUnits}</span>
                          <span className="mx-0.5">|</span>
                          <span className="text-purple-600">{product.tiktok.marketerUnits}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center bg-pink-50/50">
                        <div>{product.tiktok.transactions}</div>
                        <div className="text-[10px] text-muted-foreground">
                          <span className="text-blue-600">{product.tiktok.logisticTransactions}</span>
                          <span className="mx-0.5">|</span>
                          <span className="text-purple-600">{product.tiktok.marketerTransactions}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center bg-pink-50/50 text-xs">
                        <div>{formatPercent(product.tiktok.pct)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          <span className="text-blue-600">{formatPercent(product.tiktok.logisticPct)}</span>
                          <span className="mx-0.5">|</span>
                          <span className="text-purple-600">{formatPercent(product.tiktok.marketerPct)}</span>
                        </div>
                      </TableCell>
                      {/* Shopee */}
                      <TableCell className="text-center bg-orange-50/50">
                        <div>{product.shopee.units}</div>
                        <div className="text-[10px] text-muted-foreground">
                          <span className="text-blue-600">{product.shopee.logisticUnits}</span>
                          <span className="mx-0.5">|</span>
                          <span className="text-purple-600">{product.shopee.marketerUnits}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center bg-orange-50/50">
                        <div>{product.shopee.transactions}</div>
                        <div className="text-[10px] text-muted-foreground">
                          <span className="text-blue-600">{product.shopee.logisticTransactions}</span>
                          <span className="mx-0.5">|</span>
                          <span className="text-purple-600">{product.shopee.marketerTransactions}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center bg-orange-50/50 text-xs">
                        <div>{formatPercent(product.shopee.pct)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          <span className="text-blue-600">{formatPercent(product.shopee.logisticPct)}</span>
                          <span className="mx-0.5">|</span>
                          <span className="text-purple-600">{formatPercent(product.shopee.marketerPct)}</span>
                        </div>
                      </TableCell>
                      {/* Online */}
                      <TableCell className="text-center bg-sky-50/50">
                        <div>{product.online.units}</div>
                        <div className="text-[10px] text-muted-foreground">
                          <span className="text-blue-600">{product.online.logisticUnits}</span>
                          <span className="mx-0.5">|</span>
                          <span className="text-purple-600">{product.online.marketerUnits}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center bg-sky-50/50">
                        <div>{product.online.transactions}</div>
                        <div className="text-[10px] text-muted-foreground">
                          <span className="text-blue-600">{product.online.logisticTransactions}</span>
                          <span className="mx-0.5">|</span>
                          <span className="text-purple-600">{product.online.marketerTransactions}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center bg-sky-50/50 text-xs">
                        <div>{formatPercent(product.online.pct)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          <span className="text-blue-600">{formatPercent(product.online.logisticPct)}</span>
                          <span className="mx-0.5">|</span>
                          <span className="text-purple-600">{formatPercent(product.online.marketerPct)}</span>
                        </div>
                      </TableCell>
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
                    <TableCell className="text-center">
                      <div className="text-yellow-600">{summaryStats.grandTotalSales.toFixed(2)}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        <span className="text-blue-600">{summaryStats.logisticTotalSales.toFixed(0)}</span>
                        <span className="mx-0.5">|</span>
                        <span className="text-purple-600">{summaryStats.marketerTotalSales.toFixed(0)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-emerald-600">{summaryStats.totalStockIn}</TableCell>
                    <TableCell className="text-center text-red-600">{summaryStats.totalStockOut}</TableCell>
                    <TableCell className="text-center">
                      <div className="text-blue-600">{summaryStats.totalShipped}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        <span className="text-blue-600">{summaryStats.logisticShipped}</span>
                        <span className="mx-0.5">|</span>
                        <span className="text-purple-600">{summaryStats.marketerShipped}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="text-orange-600">{summaryStats.totalReturn}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        <span className="text-blue-600">{summaryStats.logisticReturn}</span>
                        <span className="mx-0.5">|</span>
                        <span className="text-purple-600">{summaryStats.marketerReturn}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center bg-pink-100/50">
                      <div>{summaryStats.totalTiktok}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        <span className="text-blue-600">{summaryStats.logisticTiktok}</span>
                        <span className="mx-0.5">|</span>
                        <span className="text-purple-600">{summaryStats.marketerTiktok}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center bg-pink-100/50">
                      <div>{productTransactions.reduce((sum, p) => sum + p.tiktok.transactions, 0)}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        <span className="text-blue-600">{productTransactions.reduce((sum, p) => sum + p.tiktok.logisticTransactions, 0)}</span>
                        <span className="mx-0.5">|</span>
                        <span className="text-purple-600">{productTransactions.reduce((sum, p) => sum + p.tiktok.marketerTransactions, 0)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center bg-pink-100/50">-</TableCell>
                    <TableCell className="text-center bg-orange-100/50">
                      <div>{summaryStats.totalShopee}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        <span className="text-blue-600">{summaryStats.logisticShopee}</span>
                        <span className="mx-0.5">|</span>
                        <span className="text-purple-600">{summaryStats.marketerShopee}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center bg-orange-100/50">
                      <div>{productTransactions.reduce((sum, p) => sum + p.shopee.transactions, 0)}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        <span className="text-blue-600">{productTransactions.reduce((sum, p) => sum + p.shopee.logisticTransactions, 0)}</span>
                        <span className="mx-0.5">|</span>
                        <span className="text-purple-600">{productTransactions.reduce((sum, p) => sum + p.shopee.marketerTransactions, 0)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center bg-orange-100/50">-</TableCell>
                    <TableCell className="text-center bg-sky-100/50">
                      <div>{summaryStats.totalOnline}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        <span className="text-blue-600">{summaryStats.logisticOnline}</span>
                        <span className="mx-0.5">|</span>
                        <span className="text-purple-600">{summaryStats.marketerOnline}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center bg-sky-100/50">
                      <div>{productTransactions.reduce((sum, p) => sum + p.online.transactions, 0)}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        <span className="text-blue-600">{productTransactions.reduce((sum, p) => sum + p.online.logisticTransactions, 0)}</span>
                        <span className="mx-0.5">|</span>
                        <span className="text-purple-600">{productTransactions.reduce((sum, p) => sum + p.online.marketerTransactions, 0)}</span>
                      </div>
                    </TableCell>
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
