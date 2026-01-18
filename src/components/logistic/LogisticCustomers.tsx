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

  // Fetch bundles (with items and product info)
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
          is_active,
          logistic_bundle_items (
            id,
            product_id,
            quantity,
            products:product_id (
              id,
              name,
              sku
            )
          )
        `)
        .eq("logistic_id", user?.id)
        .eq("is_active", true);

      if (error) throw error;

      return (data || []).map((bundle: any) => ({
        ...bundle,
        items: (bundle.logistic_bundle_items || []).map((item: any) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          product: item.products,
        })),
      }));
    },
    enabled: !!user?.id,
  });

  // Fetch customer purchases - using new schema field names
  const { data: purchases, isLoading } = useQuery({
    queryKey: ["customer_purchases", startDate, endDate, platformFilter, isQuickSearchActive],
    queryFn: async () => {
      let query = supabase
        .from("customer_purchases")
        .select("*")
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

      const { data, error } = await query;
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
    { title: "Tiktok HQ", ...getPlatformStats("Tiktok HQ"), color: "bg-pink-100 text-pink-800" },
    { title: "Shopee HQ", ...getPlatformStats("Shopee HQ"), color: "bg-orange-100 text-orange-800" },
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

  const MANUAL_TRACKING_SOURCES = ["Tiktok HQ", "Shopee HQ"];

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
        if (orderFromValue === 'Tiktok HQ') {
          jenisPlatform = 'Tiktok';
        } else if (orderFromValue === 'Shopee HQ') {
          jenisPlatform = 'Shopee';
        } else {
          jenisPlatform = orderFromValue;
        }
      }

      const isDirectShipped = orderFromValue === 'Tiktok HQ' || orderFromValue === 'Shopee HQ';
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Customer HQ</h1>
          <p className="text-muted-foreground mt-2">
            Manage your customer purchases and track sales
          </p>
        </div>
        <div className="flex gap-2">
          {selectedOrders.size > 0 && (
            <Button
              variant="destructive"
              onClick={handleDeleteSelected}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete ({selectedOrders.size})
            </Button>
          )}
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Customer Purchase
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

      {/* Platform Breakdown Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {platformStats.map((platform) => (
          <Card key={platform.title}>
            <CardContent className="p-4">
              <div className="mb-3">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${platform.color}`}>
                  {platform.title}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Customers</p>
                  <p className="font-bold">{platform.customers}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Transactions</p>
                  <p className="font-bold">{platform.transactions}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Units</p>
                  <p className="font-bold">{platform.units}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Revenue</p>
                  <p className="font-bold text-green-600">RM {platform.revenue.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Card with Filters and Table */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Purchases</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick Search */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Quick Search</span>
                </div>
                <div className="flex flex-1 gap-2 items-center">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Enter name, phone, or tracking number..."
                      value={quickSearch}
                      onChange={(e) => {
                        setQuickSearch(e.target.value);
                        if (!e.target.value) setIsQuickSearchActive(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleQuickSearch();
                      }}
                      className="pl-10"
                    />
                  </div>
                  <Button onClick={handleQuickSearch} className="bg-primary hover:bg-primary/90">
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </Button>
                  {isQuickSearchActive && (
                    <Button variant="outline" onClick={clearQuickSearch}>
                      <XCircle className="w-4 h-4 mr-2" />
                      Clear
                    </Button>
                  )}
                </div>
                {isQuickSearchActive && (
                  <span className="text-xs text-muted-foreground bg-primary/10 px-2 py-1 rounded">
                    Showing results for: "{quickSearch}"
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card className="border-dashed">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Filters</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Start Date</label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setIsQuickSearchActive(false);
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">End Date</label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setIsQuickSearchActive(false);
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Jenis Platform</label>
                    <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setIsQuickSearchActive(false); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Jenis Platform" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Jenis Platform</SelectItem>
                        <SelectItem value="Facebook">Facebook</SelectItem>
                        <SelectItem value="Tiktok HQ">Tiktok HQ</SelectItem>
                        <SelectItem value="Shopee HQ">Shopee HQ</SelectItem>
                        <SelectItem value="Database">Database</SelectItem>
                        <SelectItem value="Google">Google</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          {isLoading ? (
            <p>Loading customer purchases...</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>No</TableHead>
                    <TableHead>Date Order</TableHead>
                    <TableHead>Date Processed</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Name Customer</TableHead>
                    <TableHead>Phone Customer</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Jenis Closing</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Tracking No.</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quickSearchFilteredPurchases.map((purchase: any, index) => (
                    <TableRow key={purchase.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedOrders.has(purchase.id)}
                          onCheckedChange={(checked) => handleSelectOrder(purchase.id, !!checked)}
                        />
                      </TableCell>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        <span
                          onClick={() => openDateModal(purchase, "date_order")}
                          className="cursor-pointer hover:underline text-blue-600"
                        >
                          {purchase.date_order ? format(new Date(purchase.date_order), "dd-MM-yyyy") : "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          onClick={() => openDateModal(purchase, "date_processed")}
                          className="cursor-pointer hover:underline text-purple-600"
                        >
                          {purchase.date_processed ? format(new Date(purchase.date_processed), "dd-MM-yyyy") : "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          purchase.platform === "Facebook"
                            ? "bg-blue-100 text-blue-800"
                            : purchase.platform === "Tiktok HQ"
                            ? "bg-pink-100 text-pink-800"
                            : purchase.platform === "Shopee HQ"
                            ? "bg-orange-100 text-orange-800"
                            : purchase.platform === "Database"
                            ? "bg-purple-100 text-purple-800"
                            : purchase.platform === "Google"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}>
                          {purchase.platform || "Manual"}
                        </span>
                      </TableCell>
                      <TableCell>{purchase.customerName || "-"}</TableCell>
                      <TableCell>{purchase.customerPhone || "-"}</TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {purchase.customerAddress || "-"}
                        </span>
                      </TableCell>
                      <TableCell>{purchase.customerState || "-"}</TableCell>
                      <TableCell>
                        {(purchase.platform === "Tiktok HQ" || purchase.platform === "Shopee HQ") ? (
                          <span
                            onClick={() => openPaymentMethodModal(purchase)}
                            className={`cursor-pointer hover:underline px-2 py-1 rounded text-xs font-medium ${
                              purchase.payment_method === "COD" ? "text-orange-600 bg-orange-50" :
                              purchase.payment_method === "Online Transfer" ? "text-blue-600 bg-blue-50" :
                              "text-green-600 bg-green-50"
                            }`}
                          >
                            {purchase.payment_method || "Cash"}
                          </span>
                        ) : (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            purchase.payment_method === "COD" ? "text-orange-600 bg-orange-50" :
                            purchase.payment_method === "Online Transfer" ? "text-blue-600 bg-blue-50" :
                            "text-green-600 bg-green-50"
                          }`}>
                            {purchase.payment_method || "Cash"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{purchase.closing_type || "-"}</TableCell>
                      <TableCell>
                        <span className="text-sm" title={purchase.products.join(", ")}>
                          {purchase.products.length > 1
                            ? `${purchase.products[0]} (+${purchase.products.length - 1} more)`
                            : purchase.products[0] || "-"}
                        </span>
                      </TableCell>
                      <TableCell>{purchase.total_quantity}</TableCell>
                      <TableCell>
                        {(purchase.platform === "Tiktok HQ" || purchase.platform === "Shopee HQ") ? (
                          <span
                            onClick={() => openPriceModal(purchase)}
                            className="cursor-pointer hover:underline text-green-600 font-medium"
                          >
                            RM {Number(purchase.total_price || 0).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-green-600 font-medium">
                            RM {Number(purchase.total_price || 0).toFixed(2)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{purchase.tracking_number || "-"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            window.open(`/invoice?order=${purchase.id}&type=customer`, '_blank');
                          }}
                          title="View Invoice"
                        >
                          <FileText className="h-4 w-4 text-blue-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
