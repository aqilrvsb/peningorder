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
import { Users, ShoppingCart, DollarSign, Package, Plus, Loader2, FileText, Trash2, Search, XCircle, Download } from "lucide-react";
import * as XLSX from "xlsx";
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
import AddCustomerModal, { CustomerPurchaseData } from "./AddCustomerModal";
import { getMalaysiaDate } from "@/lib/utils";
import PaymentDetailsModal from "./PaymentDetailsModal";

const LogisticCustomers = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = getMalaysiaDate();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Quick search state (search without date filter)
  const [quickSearch, setQuickSearch] = useState("");
  const [isQuickSearchActive, setIsQuickSearchActive] = useState(false);

  // Payment details modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentModalOrder, setPaymentModalOrder] = useState<any>(null);

  // State for tracking payment method updates
  const [updatingPaymentFor, setUpdatingPaymentFor] = useState<string | null>(null);

  // State for payment method modal
  const [paymentMethodModalOpen, setPaymentMethodModalOpen] = useState(false);
  const [selectedPurchaseForPayment, setSelectedPurchaseForPayment] = useState<any>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("");

  // State for price edit modal
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [selectedPurchaseForPrice, setSelectedPurchaseForPrice] = useState<any>(null);
  const [newPrice, setNewPrice] = useState<string>("");

  // State for date edit modal
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [selectedPurchaseForDate, setSelectedPurchaseForDate] = useState<any>(null);
  const [dateEditType, setDateEditType] = useState<"date_order" | "date_processed">("date_order");
  const [newDate, setNewDate] = useState<string>("");

  // State for inline phone edit
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState<string>("");

  // Fetch profile for idstaff
  const { data: profile } = useQuery({
    queryKey: ["profile-logistic", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("idstaff")
        .eq("id", user?.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch products for the dropdown
  const { data: products } = useQuery({
    queryKey: ["products-for-customer"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  // Fetch bundles (without items - logistic_bundle_items table no longer exists)
  const { data: bundles } = useQuery({
    queryKey: ["bundles-for-customer", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("logistic_bundles")
        .select(`
          id,
          name,
          description,
          sku,
          total_price,
          is_active
        `)
        .eq("logistic_id", user?.id)
        .eq("is_active", true);

      if (error) throw error;

      return (data || []).map((bundle: any) => ({
        ...bundle,
        items: [], // No items relation - bundles are standalone now
      }));
    },
    enabled: !!user?.id,
  });

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
    queryKey: ["customer_purchases", startDate, endDate, platformFilter, isQuickSearchActive],
    queryFn: async () => {
      let query = supabase
        .from("customer_purchases")
        .select(`
          *,
          bundle:logistic_bundles(name, sku)
        `)
        .order("date_order", { ascending: false, nullsFirst: false });

      if (!isQuickSearchActive) {
        if (startDate) {
          query = query.gte("date_order", startDate);
        }
        if (endDate) {
          query = query.lte("date_order", endDate);
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
        customerName: p.name_customer || "-", // NEW: name_customer
        customerPhone: p.phone_customer || "-", // NEW: phone_customer
        customerAddress: p.address_customer || "-", // NEW: address_customer
        customerState: p.state_customer || "-", // NEW: state_customer
        payment_method: p.type_payment, // NEW: type_payment
        closing_type: p.jenis_closing,
        tracking_number: p.tracking_number,
        platform: p.jenis_platform || "Manual",
        total_price: p.total_sale, // NEW: total_sale
        products: [p.bundle_id ? "Bundle" : "Product"],
        total_quantity: p.unit || 0, // NEW: unit
        tarikh_bayaran: p.date_payment, // NEW: date_payment
        jenis_bayaran: p.type_payment, // NEW: type_payment
        bank: p.bank_payment, // NEW: bank_payment
        receipt_image_url: p.receipt_payment_url, // NEW: receipt_payment_url
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

  // Quick search filtered purchases (for stats)
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

  // Display orders - filter raw purchases for table rendering
  const displayOrders = isQuickSearchActive && quickSearch
    ? (purchases || []).filter((order: any) => {
        const searchTerm = quickSearch.toLowerCase();
        return (
          order.name_customer?.toLowerCase().includes(searchTerm) ||
          order.phone_customer?.includes(quickSearch) ||
          order.tracking_number?.toLowerCase().includes(searchTerm)
        );
      })
    : (purchases || []);

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

  // Export to Excel
  const handleExportExcel = () => {
    if (displayOrders.length === 0) {
      toast.error("No data to export");
      return;
    }
    const data = displayOrders.map((order: any, index: number) => ({
      "No": index + 1,
      "Id Sales": order.id_sale || "-",
      "Tarikh Processed": order.date_processed || "-",
      "Tarikh Order": order.date_order || "-",
      "Id Staff": order.marketer_id_staff || "HQ",
      "Sales Name": profilesMap.get(order.marketer_id_staff) || order.marketer_id_staff || "HQ",
      "Nama Pelanggan": order.name_customer || "-",
      "Phone": order.phone_customer || "-",
      "Produk": order.bundle?.name || "-",
      "Unit": order.unit || 1,
      "Tracking": order.tracking_number || "-",
      "Total Sales": Number(order.total_sale || 0).toFixed(2),
      "Cost Product": Number(order.cost_baseproduct || 0).toFixed(2),
      "Cost Postage": Number(order.cost_postage || 0).toFixed(2),
      "Cara Bayaran": order.type_payment || "-",
      "Delivery Status": order.delivery_status || "-",
      "Jenis Platform": order.jenis_platform || "-",
      "Jenis Closing": order.jenis_closing || "-",
      "Jenis Customer": order.jenis_customer || "-",
      "Negeri": order.state_customer || "-",
      "Alamat": order.address_customer || "-",
      "Poskod": order.postcode_customer || "-",
      "Bandar": order.city_customer || "-",
      "Nota": order.nota_staff || "-",
      "SEO": order.seos || "-",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer HQ");
    const filename = isQuickSearchActive
      ? `Customer_HQ_Search_${quickSearch}.xlsx`
      : `Customer_HQ_${startDate || "all"}_${endDate || "all"}${platformFilter !== "all" ? `_${platformFilter}` : ""}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success(`Exported ${data.length} records to Excel`);
  };

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

  // Normalize phone: auto-prepend 60 if starts with 0 or 1
  const normalizePhone = (raw: string): string => {
    let phone = raw.trim().replace(/\D/g, ""); // remove non-digits
    if (phone.startsWith("0")) {
      phone = "6" + phone; // 012345 → 6012345
    } else if (phone.startsWith("1")) {
      phone = "60" + phone; // 19723 → 6019723
    }
    return phone;
  };

  // Inline phone save - auto-normalizes, saves to DB without refreshing sort
  const handlePhoneSave = async (orderId: string) => {
    const raw = editingPhoneValue.trim();
    if (!raw) {
      setEditingPhoneId(null);
      return;
    }
    const phone = normalizePhone(raw);
    if (!phone.startsWith("60")) {
      toast.error("Phone must start with 60 (e.g., 60123456789)");
      return;
    }
    try {
      const { error } = await supabase
        .from("customer_purchases")
        .update({ phone_customer: phone })
        .eq("id", orderId);
      if (error) throw error;
      toast.success("Phone saved");
      // Update local data without refetching (no sort change)
      queryClient.setQueryData(
        ["customer_purchases", startDate, endDate, platformFilter, isQuickSearchActive],
        (old: any) => old?.map((o: any) => o.id === orderId ? { ...o, phone_customer: phone } : o)
      );
    } catch (err: any) {
      toast.error("Failed to save phone: " + err.message);
    }
    setEditingPhoneId(null);
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
      queryClient.invalidateQueries({ queryKey: ["customer_purchases"] });
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSelectedOrders(new Set());
    } catch (error: any) {
      toast.error(error.message || "Failed to delete orders");
    } finally {
      setIsDeleting(false);
    }
  };

  // Fetch NinjaVan config
  const { data: ninjavanConfig } = useQuery({
    queryKey: ["ninjavan-config", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ninjavan_config")
        .select("*")
        .eq("profile_id", user?.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const MANUAL_TRACKING_SOURCES = ["Tiktok", "Shopee"];

  const createCustomerPurchase = useMutation({
    mutationFn: async (data: CustomerPurchaseData) => {
      const isBundle = data.isBundle && data.bundleId && data.bundleItems;

      let selectedProduct: any = null;
      let productName = "Product";

      if (isBundle) {
        for (const bundleItem of data.bundleItems!) {
          const { data: productData, error: productError } = await supabase
            .from('products')
            .select('quantity, name')
            .eq('id', bundleItem.product_id)
            .single();

          if (productError || !productData) {
            const itemProduct = bundleItem.product?.name || bundleItem.product_id;
            throw new Error(`Product not found: ${itemProduct}`);
          }

          const requiredQty = bundleItem.quantity * data.quantity;
          if ((productData.quantity || 0) < requiredQty) {
            const itemProduct = productData.name || bundleItem.product_id;
            throw new Error(`Insufficient inventory for ${itemProduct}. Available: ${productData.quantity || 0}, Required: ${requiredQty}`);
          }
        }
        productName = data.bundleName || "Bundle";
      } else {
        const { data: productData, error: productError } = await supabase
          .from('products')
          .select('quantity, name, sku')
          .eq('id', data.productId)
          .single();

        if (productError || !productData) {
          throw new Error('Product not found');
        }

        if ((productData.quantity || 0) < data.quantity) {
          throw new Error(`Insufficient inventory. Available: ${productData.quantity || 0}, Required: ${data.quantity}`);
        }

        selectedProduct = products?.find(p => p.id === data.productId);
        productName = selectedProduct?.name || "Product";
      }

      // Check if customer exists
      let customerId: string | null = null;

      if (data.customerPhone) {
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id')
          .eq('phone', data.customerPhone)
          .eq('created_by', user?.id)
          .maybeSingle();

        customerId = existingCustomer?.id || null;
      }

      // Create customer if doesn't exist
      if (!customerId) {
        const { data: newCustomer, error: customerError } = await supabase
          .from('customers')
          .insert({
            name: data.customerName,
            phone: data.customerPhone || `walk-in-${Date.now()}`,
            address: data.customerAddress,
            postcode: data.customerPostcode || null,
            city: data.customerCity || null,
            state: data.customerState,
            created_by: user?.id,
          })
          .select()
          .single();

        if (customerError) throw customerError;
        customerId = newCustomer.id;
      } else {
        if (data.customerPostcode || data.customerCity) {
          await supabase
            .from('customers')
            .update({
              postcode: data.customerPostcode || null,
              city: data.customerCity || null,
            })
            .eq('id', customerId);
        }
      }

      const orderFromValue = data.orderFrom?.trim() || '';
      const usesManualTracking = orderFromValue && MANUAL_TRACKING_SOURCES.includes(orderFromValue);
      const usesNinjaVan = orderFromValue && !usesManualTracking;

      let trackingNumber = data.trackingNumber || null;
      let ninjavanOrderId = null;
      let attachmentUrl = null;

      // Upload PDF attachment for Tiktok/Shopee orders
      if (usesManualTracking && data.attachmentFile) {
        const fileExt = data.attachmentFile.name.split('.').pop();
        const fileName = `${user?.id}/${Date.now()}_${data.trackingNumber}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('public')
          .upload(fileName, data.attachmentFile);

        if (uploadError) {
          console.error("Failed to upload attachment:", uploadError);
          toast.error("Failed to upload PDF attachment");
        } else {
          const { data: publicUrl } = supabase.storage
            .from('public')
            .getPublicUrl(fileName);
          attachmentUrl = publicUrl.publicUrl;
        }
      }

      // Use NinjaVan for non-Tiktok/Shopee sources
      if (ninjavanConfig && usesNinjaVan) {
        try {
          const { data: session } = await supabase.auth.getSession();

          let skuForWaybill = '';
          if (isBundle && data.bundleSku) {
            skuForWaybill = data.bundleSku;
          } else if (selectedProduct?.sku) {
            skuForWaybill = `${selectedProduct.sku}-${data.quantity}`;
          }

          const ninjavanResponse = await supabase.functions.invoke("ninjavan-order", {
            body: {
              profileId: user?.id,
              customerName: data.customerName,
              phone: data.customerPhone,
              address: data.customerAddress,
              postcode: data.customerPostcode || "",
              city: data.customerCity || "",
              state: data.customerState,
              price: data.price,
              paymentMethod: data.paymentMethod,
              productName: productName,
              productSku: skuForWaybill,
              quantity: data.quantity,
              nota: "",
              marketerIdStaff: profile?.idstaff || "",
            },
            headers: {
              Authorization: `Bearer ${session?.session?.access_token}`,
            },
          });

          if (ninjavanResponse.error) {
            console.error("NinjaVan error:", ninjavanResponse.error);
            toast.error("NinjaVan order failed: " + (ninjavanResponse.error.message || "Unknown error"));
          } else if (ninjavanResponse.data?.success) {
            trackingNumber = ninjavanResponse.data.trackingNumber;
            ninjavanOrderId = ninjavanResponse.data.trackingNumber;
          }
        } catch (ninjavanError: any) {
          console.error("NinjaVan API error:", ninjavanError);
          toast.error("NinjaVan order failed: " + (ninjavanError.message || "Unknown error"));
        }
      }

      // Map orderFrom to platform and jenis_platform
      let platform = 'Manual';
      let jenisPlatform = 'Website';
      if (orderFromValue) {
        platform = orderFromValue;
        jenisPlatform = orderFromValue;
      }

      const isDirectShipped = orderFromValue === 'Tiktok' || orderFromValue === 'Shopee';
      const deliveryStatus = isDirectShipped ? 'Shipped' : 'Pending';
      const dateProcessed = isDirectShipped ? (data.dateOrder || getMalaysiaDate()) : null;

      if (isBundle) {
        // NEW SCHEMA: Insert using new field names
        const { error: purchaseError } = await supabase
          .from('customer_purchases')
          .insert({
            bundle_id: data.bundleId,
            unit: data.quantity, // NEW: unit
            total_sale: data.price, // NEW: total_sale
            tracking_number: trackingNumber,
            jenis_platform: jenisPlatform,
            attachment_url: attachmentUrl,
            delivery_status: deliveryStatus,
            date_processed: dateProcessed,
            name_customer: data.customerName, // NEW: name_customer
            phone_customer: data.customerPhone, // NEW: phone_customer
            address_customer: data.customerAddress, // NEW: address_customer
            postcode_customer: data.customerPostcode || null, // NEW: postcode_customer
            city_customer: data.customerCity || null, // NEW: city_customer
            state_customer: data.customerState, // NEW: state_customer
            type_payment: data.paymentMethod, // NEW: type_payment
            jenis_closing: data.closingType,
            jenis_customer: "NP", // Default customer type
            kurier: "Ninjavan",
            date_order: data.dateOrder || getMalaysiaDate(),
          } as any);

        if (purchaseError) throw purchaseError;

        if (isDirectShipped) {
          for (const bundleItem of data.bundleItems!) {
            const totalItemQty = bundleItem.quantity * data.quantity;

            const { data: prodData } = await supabase
              .from('products')
              .select('quantity, stock_out')
              .eq('id', bundleItem.product_id)
              .single();

            if (prodData) {
              await supabase
                .from('products')
                .update({
                  quantity: (prodData.quantity || 0) - totalItemQty,
                  stock_out: (prodData.stock_out || 0) + totalItemQty,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', bundleItem.product_id);
            }
          }
        }
      } else {
        // NEW SCHEMA: Insert using new field names for non-bundle purchases
        const { error: purchaseError } = await supabase
          .from('customer_purchases')
          .insert({
            bundle_id: null, // No bundle for single product
            unit: data.quantity, // NEW: unit
            total_sale: data.price, // NEW: total_sale
            tracking_number: trackingNumber,
            jenis_platform: jenisPlatform,
            attachment_url: attachmentUrl,
            delivery_status: deliveryStatus,
            date_processed: dateProcessed,
            name_customer: data.customerName, // NEW: name_customer
            phone_customer: data.customerPhone, // NEW: phone_customer
            address_customer: data.customerAddress, // NEW: address_customer
            postcode_customer: data.customerPostcode || null, // NEW: postcode_customer
            city_customer: data.customerCity || null, // NEW: city_customer
            state_customer: data.customerState, // NEW: state_customer
            type_payment: data.paymentMethod, // NEW: type_payment
            jenis_closing: data.closingType,
            jenis_customer: "NP", // Default customer type
            kurier: "Ninjavan",
            date_order: data.dateOrder || getMalaysiaDate(),
          } as any);

        if (purchaseError) throw purchaseError;

        if (isDirectShipped) {
          const { data: prodData } = await supabase
            .from('products')
            .select('quantity, stock_out')
            .eq('id', data.productId)
            .single();

          if (prodData) {
            await supabase
              .from('products')
              .update({
                quantity: (prodData.quantity || 0) - data.quantity,
                stock_out: (prodData.stock_out || 0) + data.quantity,
                updated_at: new Date().toISOString(),
              })
              .eq('id', data.productId);
          }
        }
      }

      return { trackingNumber };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["customer_purchases"] });
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setIsModalOpen(false);

      let msg = "Customer purchase recorded successfully. Inventory has been updated.";
      if (result?.trackingNumber) {
        msg += `\n\nTracking Number: ${result.trackingNumber}`;
      }

      setSuccessMessage(msg);
      setSuccessDialogOpen(true);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create customer purchase");
    },
  });

  // Open payment method modal
  const openPaymentMethodModal = (purchase: any) => {
    setSelectedPurchaseForPayment(purchase);
    setSelectedPaymentMethod(purchase.payment_method || "Cash");
    setPaymentMethodModalOpen(true);
  };

  // Save payment method from modal - using new schema field names
  const savePaymentMethod = async () => {
    if (!selectedPurchaseForPayment) return;

    setUpdatingPaymentFor(selectedPurchaseForPayment.id);
    try {
      const { error } = await supabase
        .from("customer_purchases")
        .update({
          type_payment: selectedPaymentMethod, // NEW: type_payment
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", selectedPurchaseForPayment.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["customer_purchases"] });
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

  // Save new price from modal - using new schema field names
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
          total_sale: priceValue, // NEW: total_sale
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedPurchaseForPrice.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["customer_purchases"] });
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

      queryClient.invalidateQueries({ queryKey: ["customer_purchases"] });
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
            Manage your customer purchases and track sales
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
            <Button size="sm" onClick={handleExportExcel} variant="outline" className="bg-green-50 hover:bg-green-100 text-green-700 border-green-300">
              <Download className="w-4 h-4 mr-1" />
              Export Excel
            </Button>
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
                  {displayOrders.length > 0 ? (
                    displayOrders.map((order: any, index: number) => (
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
                        <td className="p-2 whitespace-nowrap">{order.marketer_id_staff || "HQ"}</td>
                        <td className="p-2">{profilesMap.get(order.marketer_id_staff) || order.marketer_id_staff || "HQ"}</td>
                        <td className="p-2">{order.name_customer || "-"}</td>
                        <td className="p-2 whitespace-nowrap">
                          {order.phone_customer ? (
                            order.phone_customer
                          ) : editingPhoneId === order.id ? (
                            <Input
                              className="h-7 w-32 text-xs"
                              placeholder="60123456789"
                              value={editingPhoneValue}
                              onChange={(e) => setEditingPhoneValue(e.target.value)}
                              onPaste={(e) => {
                                e.preventDefault();
                                const pasted = e.clipboardData.getData("text");
                                setEditingPhoneValue(normalizePhone(pasted));
                              }}
                              onBlur={() => handlePhoneSave(order.id)}
                              onKeyDown={(e) => { if (e.key === "Enter") handlePhoneSave(order.id); }}
                              autoFocus
                            />
                          ) : (
                            <Input
                              className="h-7 w-32 text-xs text-muted-foreground"
                              placeholder="Enter phone..."
                              onFocus={() => { setEditingPhoneId(order.id); setEditingPhoneValue(""); }}
                              readOnly
                            />
                          )}
                        </td>
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
                          <div className="min-w-[250px]">
                            <p className="text-xs whitespace-normal">{order.address_customer || "-"}</p>
                            <p className="text-xs text-muted-foreground">
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
                          <span className={`text-xs ${order.seos === "Successful Delivery" ? "text-green-600" : "text-gray-500"}`}>
                            {order.seos || "-"}
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

      {/* Add Customer Modal */}
      <AddCustomerModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSubmit={(data) => createCustomerPurchase.mutate(data)}
        isLoading={createCustomerPurchase.isPending}
        products={products || []}
        bundles={bundles || []}
      />

      {/* Payment Details Modal */}
      <PaymentDetailsModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        order={paymentModalOrder}
      />

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

      {/* Success Dialog */}
      <AlertDialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Success!</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {successMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setSuccessDialogOpen(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LogisticCustomers;
