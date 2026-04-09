import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { getMalaysiaDate, getMalaysiaStartOfMonth } from "@/lib/utils";
import {
  Clock,
  Loader2,
  Printer,
  Send,
  Search,
  DollarSign,
  CreditCard,
  Trash2,
  Navigation,
  Pencil,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import Swal from "sweetalert2";

const PAYMENT_OPTIONS = ["All", "CASH", "COD"];
const PLATFORM_OPTIONS = ["All", "Tiktok", "Shopee", "Facebook", "Database", "Google"];
const PAGE_SIZE_OPTIONS = [10, 50, 100, "All"] as const;

const LogisticOrder = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = getMalaysiaDate();
  const firstDayOfMonth = getMalaysiaStartOfMonth();

  // Filter states
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [platformFilter, setPlatformFilter] = useState("All");
  const [pageSize, setPageSize] = useState<number | "All">(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Selection state
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  // Loading states
  const [isShipping, setIsShipping] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [generatingTrackingFor, setGeneratingTrackingFor] = useState<string | null>(null);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [editForm, setEditForm] = useState({
    customerName: "",
    phone: "",
    address: "",
    postcode: "",
    city: "",
    state: "",
    quantity: 1,
    totalPrice: 0,
    paymentMethod: "CASH",
    notaStaff: "",
    productId: "",
    kurier: "",
  });

  // Fetch all bundles for dropdown - using logistic_bundles table
  const { data: allProducts = [] } = useQuery({
    queryKey: ["all-bundles-dropdown"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("logistic_bundles")
        .select("id, name, sku, base_cost, hq_cost, weight, kos_postage_sm, kos_postage_ss, postage_cod")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Update bundle for an order - using new schema field names
  const handleUpdateProduct = async (orderId: string, bundleId: string) => {
    try {
      const { error } = await supabase
        .from("customer_purchases")
        .update({ bundle_id: bundleId, updated_at: new Date().toISOString() })
        .eq("id", orderId);

      if (error) throw error;

      toast.success("Bundle updated successfully");
      queryClient.invalidateQueries({ queryKey: ["logistic-order"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to update bundle");
    }
  };

  // Fetch all profiles for marketer name and whatsapp lookup
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("username, full_name, whatsapp_number");
      if (error) throw error;
      return data || [];
    },
  });

  // Create maps for quick lookup by username (marketer_id_staff)
  const profilesMap = new Map(profiles.map((p: any) => [p.username, p.full_name]));
  const whatsappMap = new Map(profiles.map((p: any) => [p.username, p.whatsapp_number]));

  // Fetch pending orders - using new schema field names
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["logistic-order", startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("customer_purchases")
        .select(`
          *,
          bundle:logistic_bundles(name, sku, base_cost, kos_postage_sm, kos_postage_ss)
        `)
        .eq("delivery_status", "Pending")
        .order("created_at", { ascending: false });

      if (startDate) {
        query = query.gte("date_order", startDate);
      }
      if (endDate) {
        query = query.lte("date_order", endDate);
      }

      const { data, error } = await query.range(0, 49999);
      if (error) throw error;

      return data || [];
    },
  });

  // Helper function to get platform display value
  const getOrderPlatform = (order: any) => {
    if (order.jenis_platform) return order.jenis_platform;
    return null;
  };

  // All platforms now use NinjaVan
  // Check if order uses Poslaju or NinjaVan based on kurier field
  const isPoslajuOrder = (order?: any) => {
    const kurier = order?.kurier || editForm?.kurier || '';
    return kurier.includes('Poslaju');
  };

  // Filter orders - using new schema field names
  const filteredOrders = orders.filter((order: any) => {
    // Search filter
    if (search.trim()) {
      const searchTerms = search.toLowerCase().split("+").map((s) => s.trim()).filter(Boolean);
      const matchesSearch = searchTerms.every((term) =>
        order.name_customer?.toLowerCase().includes(term) ||
        order.phone_customer?.toLowerCase().includes(term) ||
        order.tracking_number?.toLowerCase().includes(term) ||
        order.bundle?.name?.toLowerCase().includes(term) ||
        order.address_customer?.toLowerCase().includes(term)
      );
      if (!matchesSearch) return false;
    }

    // Payment filter - using new type_payment field
    if (paymentFilter !== "All" && order.type_payment !== paymentFilter) {
      return false;
    }

    // Platform filter - filter by exact platform name
    if (platformFilter !== "All") {
      if (order.jenis_platform !== platformFilter) {
        return false;
      }
    }

    return true;
  });

  // Pagination
  const totalPages = pageSize === "All" ? 1 : Math.ceil(filteredOrders.length / pageSize);
  const paginatedOrders = pageSize === "All"
    ? filteredOrders
    : filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Counts - all platforms now use NinjaVan (including Shopee and Tiktok)
  const counts = {
    total: orders.length,
    ninjavanCod: orders.filter((o: any) => o.type_payment === "COD").length,
    ninjavanCash: orders.filter((o: any) => o.type_payment === "CASH").length,
  };

  // Checkbox handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrders(new Set(paginatedOrders.map((o: any) => o.id)));
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

  const isAllSelected = paginatedOrders.length > 0 && paginatedOrders.every((o: any) => selectedOrders.has(o.id));

  // Bulk Ship action
  const handleBulkShipped = async () => {
    if (selectedOrders.size === 0) {
      toast.error("Please select orders to mark as shipped");
      return;
    }

    setIsShipping(true);
    const today = getMalaysiaDate();

    try {
      // Update delivery status for all selected orders
      // CASH orders keep their SEO (already set to "Successful Delivery" at key-in)
      // COD orders get SEO = "Shipped"
      const updatePromises = Array.from(selectedOrders).map((orderId) => {
        const order = orders.find((o: any) => o.id === orderId);
        const isCash = order?.type_payment === "CASH";

        const updateData: any = {
          delivery_status: "Shipped",
          date_processed: today,
        };

        // Only set SEO for non-CASH orders (CASH already has "Successful Delivery" from key-in)
        if (!isCash) {
          updateData.seo = "Shipped";
        }

        return supabase
          .from("customer_purchases")
          .update(updateData)
          .eq("id", orderId);
      });

      await Promise.all(updatePromises);

      toast.success(`${selectedOrders.size} order(s) marked as Shipped`);
      queryClient.invalidateQueries({ queryKey: ["logistic-order"] });
      queryClient.invalidateQueries({ queryKey: ["logistic-processed"] });
      setSelectedOrders(new Set());
    } catch (error: any) {
      toast.error(error.message || "Failed to update orders");
    } finally {
      setIsShipping(false);
    }
  };

  // Bulk Print action
  const handleBulkPrint = async () => {
    if (selectedOrders.size === 0) {
      toast.error("Please select orders to print waybills");
      return;
    }

    const selectedOrdersList = paginatedOrders.filter((o: any) => selectedOrders.has(o.id));

    // Separate orders by kurier type:
    // - Ninjavan: use ninjavan-waybill API (fetch from NinjaVan)
    // - Poslaju/Marketplace: use merge-waybills (already have PDF URL)
    const ninjavanOrdersForPrint = selectedOrdersList.filter(
      (o: any) => o.kurier?.includes('Ninjavan') && o.tracking_number
    );
    const pdfUrlOrders = selectedOrdersList.filter(
      (o: any) => (o.kurier?.includes('Poslaju') || getOrderPlatform(o) === "Shopee" || getOrderPlatform(o) === "Tiktok") && o.waybill_url
    );

    if (ninjavanOrdersForPrint.length === 0 && pdfUrlOrders.length === 0) {
      toast.error("Selected orders do not have waybills to print");
      return;
    }

    setIsPrinting(true);

    try {
      // Handle NinjaVan orders (fetch waybill from API)
      if (ninjavanOrdersForPrint.length > 0) {
        const trackingNumbers = ninjavanOrdersForPrint.map((o: any) => o.tracking_number);

        const response = await supabase.functions.invoke("ninjavan-waybill", {
          body: { trackingNumbers },
        });

        if (response.error) {
          console.error("NinjaVan waybill error:", response.error);
          toast.error("Failed to fetch NinjaVan waybills");
        } else if (response.data) {
          const blob = new Blob([response.data], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
          toast.success(`NinjaVan waybill for ${trackingNumbers.length} order(s) opened`);
        }
      }

      // Handle Poslaju/Shopee/Tiktok orders (merge existing PDF URLs)
      if (pdfUrlOrders.length > 0) {
        const waybillUrls = pdfUrlOrders.map((o: any) => o.waybill_url);

        const response = await supabase.functions.invoke("merge-waybills", {
          body: { waybillUrls },
        });

        if (response.error) {
          console.error("PDF merge error:", response.error);
          toast.error("Failed to merge waybills");
        } else if (response.data) {
          const blob = new Blob([response.data], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
          const poslajuCount = pdfUrlOrders.filter((o: any) => o.kurier?.includes('Poslaju')).length;
          const otherCount = pdfUrlOrders.length - poslajuCount;
          const msg = poslajuCount > 0 && otherCount > 0
            ? `Poslaju (${poslajuCount}) + Marketplace (${otherCount}) waybills opened`
            : poslajuCount > 0
            ? `Poslaju waybill for ${poslajuCount} order(s) opened`
            : `Marketplace waybill for ${otherCount} order(s) opened`;
          toast.success(msg);
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate waybills");
    } finally {
      setIsPrinting(false);
    }
  };

  const handleFilterChange = () => {
    setCurrentPage(1);
    setSelectedOrders(new Set());
  };

  // Bulk Delete action
  const handleBulkDelete = async () => {
    if (selectedOrders.size === 0) {
      toast.error("Please select orders to delete");
      return;
    }

    const result = await Swal.fire({
      icon: "warning",
      title: "Delete Orders?",
      text: `Are you sure you want to delete ${selectedOrders.size} order(s)? This action cannot be undone.`,
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    setIsDeleting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const selectedOrdersList = paginatedOrders.filter((o: any) => selectedOrders.has(o.id));

      // Cancel NinjaVan tracking for orders that have tracking numbers (NinjaVan platform only)
      for (const order of selectedOrdersList) {
        if (order.tracking_number && order.kurier?.includes('Ninjavan')) {
          try {
            await supabase.functions.invoke("ninjavan-cancel", {
              body: { trackingNumber: order.tracking_number, profileId: user?.id },
              headers: { Authorization: `Bearer ${session?.session?.access_token}` },
            });
          } catch (cancelError) {
            console.error("Failed to cancel tracking:", order.tracking_number, cancelError);
          }
        }
      }

      // Delete orders
      const deletePromises = Array.from(selectedOrders).map((orderId) =>
        supabase.from("customer_purchases").delete().eq("id", orderId)
      );

      await Promise.all(deletePromises);

      toast.success(`${selectedOrders.size} order(s) deleted successfully`);
      queryClient.invalidateQueries({ queryKey: ["logistic-order"] });
      setSelectedOrders(new Set());
    } catch (error: any) {
      toast.error(error.message || "Failed to delete orders");
    } finally {
      setIsDeleting(false);
    }
  };

  // Generate NinjaVan tracking for an order - using new schema field names
  const handleGenerateTracking = async (order: any) => {
    const { value: postcode, isConfirmed } = await Swal.fire({
      title: "Generate Tracking",
      text: "Enter or confirm postcode for shipping:",
      input: "text",
      inputValue: order.postcode_customer || "",
      inputPlaceholder: "Enter postcode (e.g., 15100)",
      showCancelButton: true,
      confirmButtonText: "Generate Tracking",
      cancelButtonText: "Cancel",
      inputValidator: (value) => {
        if (!value || value.trim().length < 5) {
          return "Please enter a valid postcode";
        }
        return null;
      },
    });

    if (!isConfirmed || !postcode) return;

    setGeneratingTrackingFor(order.id);

    try {
      const { data: session } = await supabase.auth.getSession();

      const orderData = {
        profileId: user?.id,
        customerName: order.name_customer || "Customer",
        phone: order.phone_customer || "",
        address: order.address_customer || "",
        postcode: postcode.trim(),
        city: order.city_customer || "",
        state: order.state_customer || "",
        price: Number(order.total_sale || 0),
        paymentMethod: order.type_payment || "CASH",
        productName: order.bundle?.name || "Product",
        productSku: order.bundle?.sku || "",
        quantity: order.unit || 1,
        nota: order.nota_staff || "",
      };

      const response = await supabase.functions.invoke("ninjavan-order", {
        body: orderData,
        headers: { Authorization: `Bearer ${session?.session?.access_token}` },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to generate tracking");
      }

      const result = response.data;

      if (!result.success || !result.trackingNumber) {
        throw new Error(result.error || "Failed to get tracking number");
      }

      // Update the order with tracking number
      const { error: updateError } = await supabase
        .from("customer_purchases")
        .update({ tracking_number: result.trackingNumber })
        .eq("id", order.id);

      if (updateError) throw updateError;

      // Update customer postcode if changed - now stored directly in customer_purchases
      if (postcode !== order.postcode_customer) {
        await supabase
          .from("customer_purchases")
          .update({ postcode_customer: postcode.trim() })
          .eq("id", order.id);
      }

      toast.success(`Tracking generated: ${result.trackingNumber}`);
      queryClient.invalidateQueries({ queryKey: ["logistic-order"] });
    } catch (error: any) {
      console.error("Generate tracking error:", error);
      toast.error(error.message || "Failed to generate tracking number");
    } finally {
      setGeneratingTrackingFor(null);
    }
  };

  // Check if order needs tracking generation (courier orders without tracking)
  const needsTrackingGeneration = (order: any) => {
    const kurier = order.kurier || '';
    return (kurier.includes('Poslaju') || kurier.includes('Ninjavan')) && !order.tracking_number;
  };

  // Open edit dialog - using new schema field names
  const handleOpenEdit = (order: any) => {
    setEditingOrder(order);
    setEditForm({
      customerName: order.name_customer || "",
      phone: order.phone_customer || "",
      address: order.address_customer || "",
      postcode: order.postcode_customer || "",
      city: order.city_customer || "",
      state: order.state_customer || "",
      quantity: order.unit || 1,
      totalPrice: Number(order.total_sale || 0),
      paymentMethod: order.type_payment || "CASH",
      notaStaff: order.nota_staff || "",
      productId: order.bundle_id || "",
      kurier: order.kurier || "",
    });
    setEditDialogOpen(true);
  };

  // Save edited order
  const handleSaveEdit = async () => {
    if (!editingOrder) return;

    setIsSavingEdit(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      const hasExistingTracking = !!editingOrder.tracking_number;
      const isPoslaju = isPoslajuOrder(editingOrder);
      const isNinjavan = editingOrder?.kurier?.includes('Ninjavan');

      // Step 1: If has existing NinjaVan tracking, cancel it first
      if (hasExistingTracking && isNinjavan) {
        toast.info("Cancelling existing NinjaVan tracking...");
        const cancelResponse = await supabase.functions.invoke("ninjavan-cancel", {
          body: { trackingNumber: editingOrder.tracking_number, profileId: user?.id },
          headers: { Authorization: `Bearer ${session?.session?.access_token}` },
        });

        if (cancelResponse.error) {
          console.error("Cancel tracking error:", cancelResponse.error);
        } else {
          toast.success("Existing tracking cancelled");
        }
      }

      // Step 2: Update order details in database - using new schema field names
      const updateData: any = {
        unit: editForm.quantity,
        total_sale: editForm.totalPrice,
        type_payment: editForm.paymentMethod,
        nota_staff: editForm.notaStaff,
        address_customer: editForm.address,
        state_customer: editForm.state,
        postcode_customer: editForm.postcode,
        city_customer: editForm.city,
        phone_customer: editForm.phone,
        name_customer: editForm.customerName,
        kurier: editForm.kurier,
        updated_at: new Date().toISOString(),
      };

      // Always recalculate costs from bundle (no API call)
      const bundleId = editForm.productId || editingOrder.bundle_id;
      if (bundleId) {
        updateData.bundle_id = bundleId;
        const bundle = allProducts.find((p: any) => p.id === bundleId);
        if (bundle) {
          const qty = Number(editForm.quantity) || 1;
          const isEastMY = ['Sabah', 'Sarawak', 'SABAH', 'SARAWAK', 'Labuan', 'LABUAN'].includes(editForm.state || '');
          const basePostage = isEastMY ? (Number(bundle.kos_postage_ss) || 0) : (Number(bundle.kos_postage_sm) || 0);
          const codFee = editForm.paymentMethod === 'COD' ? (Number(bundle.postage_cod) || 0) : 0;

          updateData.cost_baseproduct = (Number(bundle.base_cost) || 0) * qty;
          updateData.cost_hq = (Number(bundle.hq_cost) || 0) * qty;
          updateData.cost_postage = basePostage + codFee;
        }
      }

      // Clear tracking number if it was cancelled
      if (hasExistingTracking && isNinjavan) {
        updateData.tracking_number = null;
      }

      const { error: updateError } = await supabase
        .from("customer_purchases")
        .update(updateData)
        .eq("id", editingOrder.id);

      if (updateError) throw updateError;

      // Step 3: Generate new tracking based on selected courier
      const selectedKurier = editForm.kurier || '';
      const shouldGenerateTracking = selectedKurier.includes('Poslaju') || selectedKurier.includes('Ninjavan');

      if (shouldGenerateTracking) {
        toast.info("Generating new tracking...");

        const bundle = allProducts.find((p: any) => p.id === editForm.productId) || editingOrder.bundle;

        const orderData = {
          profileId: user?.id,
          customerName: editForm.customerName,
          phone: editForm.phone,
          address: editForm.address,
          postcode: editForm.postcode,
          city: editForm.city,
          state: editForm.state,
          price: editForm.totalPrice,
          paymentMethod: editForm.paymentMethod,
          productName: bundle?.name || "Product",
          productSku: bundle?.sku || "",
          quantity: editForm.quantity,
          nota: editForm.notaStaff,
          marketerIdStaff: editingOrder.marketer_id_staff || user?.username || '',
          idSale: editingOrder.id_sale || '',
          weight: bundle?.weight || 0.5,
        };

        // Use Poslaju or NinjaVan based on selected courier
        const functionName = selectedKurier.includes('Poslaju') ? "poslaju-order" : "ninjavan-order";
        const response = await supabase.functions.invoke(functionName, {
          body: orderData,
          headers: { Authorization: `Bearer ${session?.session?.access_token}` },
        });

        if (response.error) {
          throw new Error(response.error.message || "Failed to generate tracking");
        }

        const result = response.data;

        if (!result.success || !result.trackingNumber) {
          throw new Error(result.error || "Failed to get tracking number");
        }

        // Update order with new tracking number (and waybill URL for Poslaju)
        const trackingUpdate: any = { tracking_number: result.trackingNumber };
        if (result.pdfLink) {
          trackingUpdate.waybill_url = result.pdfLink;
        }
        await supabase
          .from("customer_purchases")
          .update(trackingUpdate)
          .eq("id", editingOrder.id);

        toast.success(`Order updated! New tracking: ${result.trackingNumber}`);
      } else {
        toast.success("Order updated successfully");
      }

      queryClient.invalidateQueries({ queryKey: ["logistic-order"] });
      setEditDialogOpen(false);
      setEditingOrder(null);
    } catch (error: any) {
      console.error("Save edit error:", error);
      toast.error(error.message || "Failed to save changes");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Malaysian states list
  const MALAYSIAN_STATES = [
    "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan",
    "Pahang", "Perak", "Perlis", "Pulau Pinang", "Sabah",
    "Sarawak", "Selangor", "Terengganu", "Kuala Lumpur", "Labuan", "Putrajaya"
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Order Management</h1>
        <p className="text-muted-foreground mt-2">
          Manage pending orders ready for shipment
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setPlatformFilter("All")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-6 h-6 text-orange-500" />
              <div>
                <p className="text-xl font-bold">{counts.total}</p>
                <p className="text-xs text-muted-foreground">Total Order</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-yellow-600" />
              <div>
                <p className="text-xl font-bold">{counts.ninjavanCod}</p>
                <p className="text-xs text-muted-foreground">Ninjavan COD</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-green-500" />
              <div>
                <p className="text-xl font-bold">{counts.ninjavanCash}</p>
                <p className="text-xs text-muted-foreground">Ninjavan CASH</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search customer name or phone..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); handleFilterChange(); }}
                    className="pl-10"
                  />
                </div>
                <Button
                  onClick={() => { setStartDate(""); setEndDate(""); }}
                  className="shrink-0 bg-blue-500 hover:bg-blue-600 text-white"
                >
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); handleFilterChange(); }}
                  className="w-40"
                />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); handleFilterChange(); }}
                  className="w-40"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Platform:</span>
                <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); handleFilterChange(); }}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt === "All" ? "All Order" : opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Payment:</span>
                <Select value={paymentFilter} onValueChange={(v) => { setPaymentFilter(v); handleFilterChange(); }}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Show:</span>
                <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(v === "All" ? "All" : Number(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size.toString()} value={size.toString()}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">entries</span>
              </div>

              <div className="flex-1" />

              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={handleBulkDelete}
                  disabled={selectedOrders.size === 0 || isDeleting}
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Delete ({selectedOrders.size})
                </Button>
                <Button
                  variant="outline"
                  onClick={handleBulkPrint}
                  disabled={selectedOrders.size === 0 || isPrinting}
                >
                  {isPrinting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Printer className="w-4 h-4 mr-2" />}
                  Print ({selectedOrders.size})
                </Button>
                <Button
                  onClick={handleBulkShipped}
                  disabled={selectedOrders.size === 0 || isShipping}
                >
                  {isShipping ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                  Shipped ({selectedOrders.size})
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
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
                      <th className="p-2 text-left">Tarikh Order</th>
                      <th className="p-2 text-left">Id Staff</th>
                      <th className="p-2 text-left">Sales Name</th>
                      <th className="p-2 text-left">Nama Pelanggan</th>
                      <th className="p-2 text-left">Phone</th>
                      <th className="p-2 text-left">Produk</th>
                      <th className="p-2 text-left">Unit</th>
                      <th className="p-2 text-left">Kurier</th>
                      <th className="p-2 text-left">Tracking</th>
                      <th className="p-2 text-left">Total Sales</th>
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
                      <th className="p-2 text-left">WhatsApp</th>
                      <th className="p-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.length > 0 ? (
                      paginatedOrders.map((order: any, index: number) => (
                        <tr key={order.id} className="border-b hover:bg-muted/30">
                          <td className="p-2">
                            <Checkbox
                              checked={selectedOrders.has(order.id)}
                              onCheckedChange={(checked) => handleSelectOrder(order.id, !!checked)}
                            />
                          </td>
                          <td className="p-2">{pageSize === "All" ? index + 1 : (currentPage - 1) * (pageSize as number) + index + 1}</td>
                          <td className="p-2 whitespace-nowrap">{order.id_sale || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.date_order || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.marketer_id_staff || "-"}</td>
                          <td className="p-2">{profilesMap.get(order.marketer_id_staff) || order.marketer_id_staff || "-"}</td>
                          <td className="p-2">{order.name_customer || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.phone_customer || "-"}</td>
                          <td className="p-2">
                            {order.bundle?.name ? (
                              <span className="truncate max-w-[150px] block">{order.bundle?.name}</span>
                            ) : (
                              <Select onValueChange={(v) => handleUpdateProduct(order.id, v)}>
                                <SelectTrigger className="w-[140px] h-7 text-xs">
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {allProducts.map((product: any) => (
                                    <SelectItem key={product.id} value={product.id}>
                                      {product.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                          <td className="p-2 text-center">{order.unit || 1}</td>
                          <td className="p-2 whitespace-nowrap">
                            <span className="text-xs">{order.kurier || "-"}</span>
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            {order.tracking_number ? (
                              <span className="font-mono text-xs">{order.tracking_number}</span>
                            ) : needsTrackingGeneration(order) ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleGenerateTracking(order)}
                                disabled={generatingTrackingFor === order.id}
                                className="h-6 px-2 text-xs"
                              >
                                {generatingTrackingFor === order.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Navigation className="w-3 h-3" />
                                )}
                              </Button>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="p-2 whitespace-nowrap">RM {Number(order.total_sale || 0).toFixed(2)}</td>
                          <td className="p-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${order.type_payment === "COD" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                              {order.type_payment || "-"}
                            </span>
                          </td>
                          <td className="p-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${order.delivery_status === "Pending" ? "bg-yellow-100 text-yellow-700" : order.delivery_status === "Shipped" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
                              {order.delivery_status || "-"}
                            </span>
                          </td>
                          <td className="p-2">
                            <span className={`text-xs font-medium ${
                              getOrderPlatform(order) === "Tiktok" ? "text-pink-600" :
                              getOrderPlatform(order) === "Shopee" ? "text-orange-500" :
                              getOrderPlatform(order) === "Facebook" ? "text-blue-600" :
                              getOrderPlatform(order) === "Google" ? "text-green-600" :
                              getOrderPlatform(order) === "Database" ? "text-purple-600" :
                              "text-gray-600"
                            }`}>
                              {getOrderPlatform(order) || "-"}
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
                            <span className={`text-xs ${order.seos === "Successful Delivery" ? "text-green-600" : "text-gray-500"}`}>
                              {order.seos || "-"}
                            </span>
                          </td>
                          <td className="p-2">
                            {whatsappMap.get(order.marketer_id_staff) && (
                              <a
                                href={`https://wa.me/6${(whatsappMap.get(order.marketer_id_staff) || "").replace(/^0/, "").replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center w-7 h-7 bg-green-500 hover:bg-green-600 text-white rounded"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </a>
                            )}
                          </td>
                          <td className="p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(order)}
                              className="h-7 w-7 p-0"
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={24} className="text-center py-12 text-muted-foreground">
                          No pending orders found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * (pageSize as number) + 1} to {Math.min(currentPage * (pageSize as number), filteredOrders.length)} of {filteredOrders.length} entries
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
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

      {/* Edit Order Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Order</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer Name</Label>
                <Input
                  id="customerName"
                  value={editForm.customerName}
                  onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="postcode">Postcode</Label>
                <Input
                  id="postcode"
                  value={editForm.postcode}
                  onChange={(e) => setEditForm({ ...editForm, postcode: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Select
                  value={editForm.state}
                  onValueChange={(v) => setEditForm({ ...editForm, state: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {MALAYSIAN_STATES.map((state) => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={editForm.quantity}
                  onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalPrice">Total Price (RM)</Label>
                <Input
                  id="totalPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.totalPrice}
                  onChange={(e) => setEditForm({ ...editForm, totalPrice: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Payment Method</Label>
                <Select
                  value={editForm.paymentMethod}
                  onValueChange={(v) => setEditForm({ ...editForm, paymentMethod: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">CASH</SelectItem>
                    <SelectItem value="COD">COD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="kurier">Kurier</Label>
              <Select
                value={editForm.kurier}
                onValueChange={(v) => setEditForm({ ...editForm, kurier: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select kurier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Poslaju COD">Poslaju COD</SelectItem>
                  <SelectItem value="Poslaju CASH">Poslaju CASH</SelectItem>
                  <SelectItem value="Ninjavan COD">Ninjavan COD</SelectItem>
                  <SelectItem value="Ninjavan CASH">Ninjavan CASH</SelectItem>
                  <SelectItem value="Kurier Tiktok">Kurier Tiktok</SelectItem>
                  <SelectItem value="Kurier Shopee">Kurier Shopee</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product">Product</Label>
              <Select
                value={editForm.productId}
                onValueChange={(v) => setEditForm({ ...editForm, productId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {allProducts.map((product: any) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notaStaff">Notes</Label>
              <Input
                id="notaStaff"
                value={editForm.notaStaff}
                onChange={(e) => setEditForm({ ...editForm, notaStaff: e.target.value })}
                placeholder="Staff notes..."
              />
            </div>

            {editingOrder && (editForm.kurier?.includes('Poslaju') || editForm.kurier?.includes('Ninjavan')) && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> This is a {editForm.kurier?.includes('Poslaju') ? 'Poslaju' : 'NinjaVan'} order ({getOrderPlatform(editingOrder)}).
                  {editingOrder.tracking_number ? (
                    <> Current tracking <span className="font-mono">{editingOrder.tracking_number}</span> will be cancelled and a new one will be generated.</>
                  ) : (
                    <> A new tracking number will be generated.</>
                  )}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isSavingEdit}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSavingEdit}>
              {isSavingEdit ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LogisticOrder;
