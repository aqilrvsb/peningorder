import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { Users, ShoppingCart, DollarSign, Package, Plus, Loader2, FileText, Trash2, Search, XCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { getMalaysiaDate } from "@/lib/utils";

const AccountCustomers = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = getMalaysiaDate();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Quick search state (search without date filter)
  const [quickSearch, setQuickSearch] = useState("");
  const [isQuickSearchActive, setIsQuickSearchActive] = useState(false);

  // State for payment method modal
  const [paymentMethodModalOpen, setPaymentMethodModalOpen] = useState(false);
  const [selectedPurchaseForPayment, setSelectedPurchaseForPayment] = useState<any>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("");

  // State for tracking payment method updates
  const [updatingPaymentFor, setUpdatingPaymentFor] = useState<string | null>(null);

  // State for price edit modal
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [selectedPurchaseForPrice, setSelectedPurchaseForPrice] = useState<any>(null);
  const [newPrice, setNewPrice] = useState<string>("");

  // State for date edit modal
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [selectedPurchaseForDate, setSelectedPurchaseForDate] = useState<any>(null);
  const [dateEditType, setDateEditType] = useState<"date_order" | "date_processed">("date_order");
  const [newDate, setNewDate] = useState<string>("");

  // Fetch all profiles for marketer name lookup
  const { data: allProfiles = [] } = useQuery({
    queryKey: ["profiles-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("username, full_name");
      if (error) throw error;
      return data || [];
    },
  });

  // Create a map for quick lookup of marketer name by username (marketer_id_staff)
  const profilesMap = new Map(allProfiles.map((p: any) => [p.username, p.full_name]));

  // Fetch customer purchases - using new schema field names
  const { data: purchases, isLoading } = useQuery({
    queryKey: ["customer_purchases_account", startDate, endDate, platformFilter, isQuickSearchActive],
    queryFn: async () => {
      let query = supabase
        .from("customer_purchases")
        .select(`
          *,
          bundle:logistic_bundles(name, sku)
        `)
        .order("date_processed", { ascending: false, nullsFirst: false });

      if (!isQuickSearchActive) {
        if (startDate) {
          query = query.gte("date_processed", startDate);
        }
        if (endDate) {
          query = query.lte("date_processed", endDate);
        }
      }
      if (platformFilter !== "all") {
        query = query.eq("jenis_platform", platformFilter);
      }

      const { data, error } = await query.range(0, 49999);
      if (error) throw error;
      return data;
    },
  });

  // Calculate statistics - using new schema field names
  const filteredPurchases = purchases || [];
  const totalCustomers = new Set(filteredPurchases.map(p => p.phone_customer)).size || 0;
  const totalUnitsPurchased = filteredPurchases.reduce((sum, p) => sum + (p.unit || 0), 0) || 0;
  const totalPrice = filteredPurchases.reduce((sum, p) => sum + (Number(p.total_sale) || 0), 0);

  // Group purchases by id for display - using new schema field names
  const groupedPurchases = (() => {
    const grouped = new Map<string, any>();

    (purchases || []).forEach((p: any) => {
      grouped.set(p.id, {
        id: p.id,
        created_at: p.created_at,
        date_order: p.date_order,
        date_processed: p.date_processed,
        customerName: p.name_customer || "-",
        customerPhone: p.phone_customer || "-",
        customerAddress: p.address_customer || "-",
        customerState: p.state_customer || "-",
        payment_method: p.type_payment,
        closing_type: p.jenis_closing,
        tracking_number: p.tracking_number,
        platform: p.jenis_platform || "Manual",
        total_price: p.total_sale,
        products: [p.bundle_id ? "Bundle" : "Product"],
        total_quantity: p.unit || 0,
        tarikh_bayaran: p.date_payment,
        jenis_bayaran: p.type_payment,
        bank: p.bank_payment,
        receipt_image_url: p.receipt_payment_url,
        delivery_status: p.delivery_status,
        bundle_id: p.bundle_id,
      });
    });

    return Array.from(grouped.values()).sort((a, b) => {
      const dateA = a.date_order || a.created_at;
      const dateB = b.date_order || b.created_at;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  })();

  // Quick search filtered purchases
  const quickSearchFilteredPurchases = isQuickSearchActive && quickSearch
    ? groupedPurchases.filter((p: any) => {
        const searchTerm = quickSearch.toLowerCase();
        return (
          p.customerName?.toLowerCase().includes(searchTerm) ||
          p.customerPhone?.includes(quickSearch) ||
          p.tracking_number?.toLowerCase().includes(searchTerm)
        );
      })
    : groupedPurchases;

  const totalTransactions = groupedPurchases.length;

  // Platform breakdown stats
  const getPlatformStats = (platformName: string) => {
    const platformPurchases = groupedPurchases.filter(p => p.platform === platformName);
    return {
      customers: new Set(platformPurchases.map(p => p.customerPhone)).size,
      transactions: platformPurchases.length,
      units: platformPurchases.reduce((sum, p) => sum + (p.total_quantity || 0), 0),
      revenue: platformPurchases.reduce((sum, p) => sum + (Number(p.total_price) || 0), 0),
    };
  };

  const platformStats = [
    { title: "Facebook", ...getPlatformStats("Facebook"), color: "bg-blue-100 text-blue-800" },
    { title: "Tiktok", ...getPlatformStats("Tiktok"), color: "bg-pink-100 text-pink-800" },
    { title: "Shopee", ...getPlatformStats("Shopee"), color: "bg-orange-100 text-orange-800" },
    { title: "Database", ...getPlatformStats("Database"), color: "bg-purple-100 text-purple-800" },
    { title: "Google", ...getPlatformStats("Google"), color: "bg-green-100 text-green-800" },
  ];

  const stats = [
    { title: "Total Customers", value: totalCustomers, icon: Users, color: "text-blue-600" },
    { title: "Total Transactions", value: totalTransactions, icon: ShoppingCart, color: "text-purple-600" },
    { title: "Total Units Sold", value: totalUnitsPurchased, icon: Package, color: "text-emerald-600" },
    { title: "Total Revenue", value: `RM ${totalPrice.toFixed(2)}`, icon: DollarSign, color: "text-green-600" },
  ];

  // Checkbox handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrders(new Set(quickSearchFilteredPurchases.map((p: any) => p.id)));
    } else {
      setSelectedOrders(new Set());
    }
  };

  const handleSelectOrder = (orderId: string, checked: boolean) => {
    const newSelection = new Set(selectedOrders);
    if (checked) {
      newSelection.add(orderId);
    } else {
      newSelection.delete(orderId);
    }
    setSelectedOrders(newSelection);
  };

  const isAllSelected = quickSearchFilteredPurchases.length > 0 && quickSearchFilteredPurchases.every((p: any) => selectedOrders.has(p.id));

  // Quick search handlers
  const handleQuickSearch = () => {
    if (quickSearch.trim()) {
      setIsQuickSearchActive(true);
    }
  };

  const clearQuickSearch = () => {
    setQuickSearch("");
    setIsQuickSearchActive(false);
  };

  // Delete selected orders - open confirmation
  const handleDeleteSelected = () => {
    if (selectedOrders.size === 0) {
      toast.error("Please select orders to delete");
      return;
    }
    setDeleteDialogOpen(true);
  };

  // Confirm delete selected orders
  const confirmDeleteSelected = async () => {
    setDeleteDialogOpen(false);
    setIsDeleting(true);
    try {
      const selectedOrdersList = groupedPurchases.filter((p: any) => selectedOrders.has(p.id));

      for (const order of selectedOrdersList) {
        if (order.delivery_status !== "Shipped") continue;

        const productId = order.product_id;
        const quantity = order.total_quantity || 0;

        if (productId && quantity > 0) {
          const { data: productData } = await supabase
            .from("products")
            .select("id, quantity")
            .eq("id", productId)
            .single();

          if (productData) {
            const newQuantity = (productData.quantity || 0) + quantity;
            await supabase
              .from("products")
              .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
              .eq("id", productId);
          }
        }
      }

      const deletePromises = Array.from(selectedOrders).map((orderId) =>
        supabase.from("customer_purchases").delete().eq("id", orderId)
      );

      await Promise.all(deletePromises);

      toast.success(`${selectedOrders.size} order(s) deleted. Inventory restored.`);
      queryClient.invalidateQueries({ queryKey: ["customer_purchases_account"] });
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSelectedOrders(new Set());
    } catch (error: any) {
      toast.error(error.message || "Failed to delete orders");
    } finally {
      setIsDeleting(false);
    }
  };

  // Open payment method modal
  const openPaymentMethodModal = (purchase: any) => {
    setSelectedPurchaseForPayment(purchase);
    setSelectedPaymentMethod(purchase.payment_method || "Cash");
    setPaymentMethodModalOpen(true);
  };

  // Save payment method from modal
  const savePaymentMethod = async () => {
    if (!selectedPurchaseForPayment) return;

    setUpdatingPaymentFor(selectedPurchaseForPayment.id);
    try {
      const { error } = await supabase
        .from("customer_purchases")
        .update({
          type_payment: selectedPaymentMethod,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", selectedPurchaseForPayment.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["customer_purchases_account"] });
      toast.success("Payment method updated");
      setPaymentMethodModalOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to update payment method");
    } finally {
      setUpdatingPaymentFor(null);
    }
  };

  // Open price edit modal
  const openPriceModal = (purchase: any) => {
    setSelectedPurchaseForPrice(purchase);
    setNewPrice(String(Number(purchase.total_price || 0).toFixed(2)));
    setPriceModalOpen(true);
  };

  // Save new price from modal
  const savePrice = async () => {
    if (!selectedPurchaseForPrice) return;

    const priceValue = parseFloat(newPrice);
    if (isNaN(priceValue) || priceValue < 0) {
      toast.error("Please enter a valid price");
      return;
    }

    try {
      const { error } = await supabase
        .from("customer_purchases")
        .update({
          total_sale: priceValue,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedPurchaseForPrice.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["customer_purchases_account"] });
      toast.success("Price updated");
      setPriceModalOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to update price");
    }
  };

  // Open date edit modal
  const openDateModal = (purchase: any, type: "date_order" | "date_processed") => {
    setSelectedPurchaseForDate(purchase);
    setDateEditType(type);
    const currentDate = type === "date_order" ? purchase.date_order : purchase.date_processed;
    setNewDate(currentDate || "");
    setDateModalOpen(true);
  };

  // Save date from modal
  const saveDate = async () => {
    if (!selectedPurchaseForDate) return;

    try {
      const updateData: any = {};
      updateData[dateEditType] = newDate || null;

      const { error } = await supabase
        .from("customer_purchases")
        .update(updateData)
        .eq("id", selectedPurchaseForDate.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["customer_purchases_account"] });
      toast.success(`${dateEditType === "date_order" ? "Date Order" : "Date Processed"} updated`);
      setDateModalOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to update date");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Customer HQ</h1>
          <p className="text-muted-foreground text-sm">
            View customer purchases and track sales
          </p>
        </div>
        {selectedOrders.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteSelected}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-4 w-4" />
            )}
            Delete ({selectedOrders.size})
          </Button>
        )}
      </div>

      {/* Statistics Cards - Compact */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                  <p className="text-lg font-bold">{stat.value}</p>
                </div>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Platform Breakdown Stats - Compact */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {platformStats.map((platform) => (
          <Card key={platform.title}>
            <CardContent className="p-3">
              <div className="mb-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${platform.color}`}>
                  {platform.title}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div>
                  <p className="text-muted-foreground">Cust</p>
                  <p className="font-bold">{platform.customers}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Trans</p>
                  <p className="font-bold">{platform.transactions}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Units</p>
                  <p className="font-bold">{platform.units}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Revenue</p>
                  <p className="font-bold text-green-600">RM {platform.revenue.toFixed(0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Card with Filters and Table */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          {/* Quick Search & Filters Combined */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search name, phone, tracking..."
                value={quickSearch}
                onChange={(e) => {
                  setQuickSearch(e.target.value);
                  if (!e.target.value) setIsQuickSearchActive(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleQuickSearch();
                }}
                className="pl-10 h-9"
              />
            </div>
            <Button size="sm" onClick={() => { setStartDate(""); setEndDate(""); handleQuickSearch(); }} className="bg-blue-500 hover:bg-blue-600 text-white">
              <Search className="w-4 h-4 mr-1" />
              Search
            </Button>
            {isQuickSearchActive && (
              <Button variant="outline" size="sm" onClick={clearQuickSearch}>
                <XCircle className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setIsQuickSearchActive(false);
              }}
              className="w-36 h-9"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setIsQuickSearchActive(false);
              }}
              className="w-36 h-9"
            />
            <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setIsQuickSearchActive(false); }}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="All Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platform</SelectItem>
                <SelectItem value="Facebook">Facebook</SelectItem>
                <SelectItem value="Tiktok">Tiktok</SelectItem>
                <SelectItem value="Shopee">Shopee</SelectItem>
                <SelectItem value="Database">Database</SelectItem>
                <SelectItem value="Google">Google</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {isLoading ? (
            <p>Loading customer purchases...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left w-10">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={handleSelectAll}
                      />
                    </th>
                    <th className="p-2 text-left">No</th>
                    <th className="p-2 text-left">Id Sales</th>
                    <th className="p-2 text-left">Tarikh Processed</th>
                    <th className="p-2 text-left">Tarikh Order</th>
                    <th className="p-2 text-left">Id Staff</th>
                    <th className="p-2 text-left">Sales Name</th>
                    <th className="p-2 text-left">Nama Pelanggan</th>
                    <th className="p-2 text-left">Phone</th>
                    <th className="p-2 text-left">Produk</th>
                    <th className="p-2 text-left">Unit</th>
                    <th className="p-2 text-left">Tracking</th>
                    <th className="p-2 text-left">Total Sales</th>
                    <th className="p-2 text-left">Cost Product</th>
                    <th className="p-2 text-left">HQ Cost</th>
                    <th className="p-2 text-left">Cost Postage</th>
                    <th className="p-2 text-left">Cara Bayaran</th>
                    <th className="p-2 text-left">Delivery Status</th>
                    <th className="p-2 text-left">Jenis Platform</th>
                    <th className="p-2 text-left">Jenis Closing</th>
                    <th className="p-2 text-left">Jenis Customer</th>
                    <th className="p-2 text-left">Negeri</th>
                    <th className="p-2 text-left">Alamat</th>
                    <th className="p-2 text-left">Nota</th>
                    <th className="p-2 text-left">Waybill</th>
                    <th className="p-2 text-left">SEO</th>
                    <th className="p-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(purchases || []).length > 0 ? (
                    (purchases || []).map((order: any, index: number) => (
                      <tr key={order.id} className="border-b hover:bg-muted/30">
                        <td className="p-2">
                          <Checkbox
                            checked={selectedOrders.has(order.id)}
                            onCheckedChange={(checked) => handleSelectOrder(order.id, !!checked)}
                          />
                        </td>
                        <td className="p-2">{index + 1}</td>
                        <td className="p-2 whitespace-nowrap">{order.id_sale || "-"}</td>
                        <td className="p-2 whitespace-nowrap">{order.date_processed || "-"}</td>
                        <td className="p-2 whitespace-nowrap">{order.date_order || "-"}</td>
                        <td className="p-2 whitespace-nowrap">{order.marketer_id_staff || "-"}</td>
                        <td className="p-2">{profilesMap.get(order.marketer_id_staff) || order.marketer_id_staff || "-"}</td>
                        <td className="p-2">{order.name_customer || "-"}</td>
                        <td className="p-2 whitespace-nowrap">{order.phone_customer || "-"}</td>
                        <td className="p-2">
                          <span className="truncate max-w-[150px] block">{order.bundle?.name || "-"}</span>
                        </td>
                        <td className="p-2 text-center">{order.unit || 1}</td>
                        <td className="p-2 whitespace-nowrap">
                          {order.tracking_number ? (
                            order.jenis_platform === "Tiktok" ? (
                              <a
                                href={`https://seller-my.tiktok.com/order/detail?order_no=${order.tracking_number}&shop_region=MY`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline font-mono text-xs"
                              >
                                {order.tracking_number}
                              </a>
                            ) : order.jenis_platform === "Shopee" ? (
                              <a
                                href={`https://seller.shopee.com.my/portal/sale/order?search=${encodeURIComponent(order.tracking_number)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-orange-600 hover:underline font-mono text-xs"
                              >
                                {order.tracking_number}
                              </a>
                            ) : (
                              <span className="font-mono text-xs">{order.tracking_number}</span>
                            )
                          ) : "-"}
                        </td>
                        <td className="p-2 whitespace-nowrap">RM {Number(order.total_sale || 0).toFixed(2)}</td>
                        <td className="p-2 whitespace-nowrap">RM {Number(order.cost_baseproduct || 0).toFixed(2)}</td>
                        <td className="p-2 whitespace-nowrap">RM {Number(order.cost_hq || 0).toFixed(2)}</td>
                        <td className="p-2 whitespace-nowrap">RM {Number(order.cost_postage || 0).toFixed(2)}</td>
                        <td className="p-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${order.type_payment === "COD" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                            {order.type_payment || "-"}
                          </span>
                        </td>
                        <td className="p-2">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                            {order.delivery_status || "-"}
                          </span>
                        </td>
                        <td className="p-2">
                          <span className={`text-xs font-medium ${
                            order.jenis_platform === "Tiktok" ? "text-pink-600" :
                            order.jenis_platform === "Shopee" ? "text-orange-500" :
                            order.jenis_platform === "Facebook" ? "text-blue-600" :
                            order.jenis_platform === "Google" ? "text-green-600" :
                            order.jenis_platform === "Database" ? "text-purple-600" :
                            "text-gray-600"
                          }`}>
                            {order.jenis_platform || "-"}
                          </span>
                        </td>
                        <td className="p-2 text-xs">{order.jenis_closing || "-"}</td>
                        <td className="p-2 text-xs">{order.jenis_customer || "-"}</td>
                        <td className="p-2 text-xs">{order.state_customer || "-"}</td>
                        <td className="p-2">
                          <div className="max-w-[150px]">
                            <p className="text-xs truncate">{order.address_customer || "-"}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {order.postcode_customer} {order.city_customer}
                            </p>
                          </div>
                        </td>
                        <td className="p-2">
                          <p className="text-xs truncate max-w-[100px]">{order.nota_staff || "-"}</p>
                        </td>
                        <td className="p-2">
                          {order.waybill_url ? (
                            <a href={order.waybill_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                              View
                            </a>
                          ) : "-"}
                        </td>
                        <td className="p-2">
                          <span className={`text-xs ${order.seo === "Successful Delivery" ? "text-green-600" : "text-gray-500"}`}>
                            {order.seo || "-"}
                          </span>
                        </td>
                        <td className="p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              window.open(`/invoice?order=${order.id}&type=customer`, '_blank');
                            }}
                            title="View Invoice"
                          >
                            <FileText className="h-4 w-4 text-blue-600" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={24} className="text-center py-12 text-muted-foreground">
                        No customer purchases found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Method Edit Modal */}
      <Dialog open={paymentMethodModalOpen} onOpenChange={setPaymentMethodModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Change Payment Method</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">Select Payment Method</label>
            <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="COD">COD</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Online Transfer">Online Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentMethodModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={savePaymentMethod}
              disabled={updatingPaymentFor === selectedPurchaseForPayment?.id}
            >
              {updatingPaymentFor === selectedPurchaseForPayment?.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price Edit Modal */}
      <Dialog open={priceModalOpen} onOpenChange={setPriceModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Edit Price</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">New Price (RM)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="Enter new price"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={savePrice}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Date Edit Modal */}
      <Dialog open={dateModalOpen} onOpenChange={setDateModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              Edit {dateEditType === "date_order" ? "Date Order" : "Date Processed"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">
              {dateEditType === "date_order" ? "Date Order" : "Date Processed"}
            </label>
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDateModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveDate}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Orders?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selectedOrders.size}</strong> order(s)?
              <br />
              <span className="text-red-600">This action cannot be undone. Inventory will be restored.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteSelected}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AccountCustomers;
