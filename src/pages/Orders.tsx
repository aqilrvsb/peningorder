import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/context/DataContext';
import { useBundles } from '@/context/BundleContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  Search, RotateCcw, Download, Users, DollarSign, Package,
  Truck, RotateCw, Clock, Calendar, Pencil, Trash2, Car, FileText, MessageCircle, Receipt, Upload, Loader2
} from 'lucide-react';
import { put } from '@vercel/blob';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface OrderForTracking {
  id: string;
  idSale: string;
  marketerName: string;
  noPhone: string;
  alamat: string;
  poskod: string;
  bandar: string;
  negeri: string;
  caraBayaran: string;
  produk: string;
  marketerIdStaff: string;
  hargaJualanSebenar: number;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DELIVERY_STATUS_OPTIONS = ["All", "Pending", "Shipped", "Remaining", "Return", "Success", "Failed"];
const COLLECTION_STATUS_OPTIONS = ["All", "null", "Pending", "Success", "Return"];

// Helper to get collection status based on delivery_status and seo
const getCollectionStatus = (deliveryStatus: string, seo: string | null): string => {
  if (deliveryStatus === 'Pending') return 'null';
  if (deliveryStatus === 'Shipped' && seo !== 'Successful Delivery') return 'Pending';
  if (deliveryStatus === 'Shipped' && seo === 'Successful Delivery') return 'Success';
  if (deliveryStatus === 'Return' || deliveryStatus === 'Failed') return 'Return';
  return 'null';
};

// Helper to get Malaysia date (UTC+8)
const getMalaysiaDate = () => {
  const now = new Date();
  const malaysiaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return malaysiaTime.toISOString().split('T')[0];
};

// Helper to get first day of current month in Malaysia timezone
const getMalaysiaStartOfMonth = () => {
  const now = new Date();
  const malaysiaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const year = malaysiaTime.getUTCFullYear();
  const month = String(malaysiaTime.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
};

const Orders: React.FC = () => {
  const navigate = useNavigate();
  const { orders, updateOrder, deleteOrder, refreshData } = useData();
  const { bundles, products } = useBundles();
  const { profile } = useAuth();
  const isMarketer = profile?.role === 'marketer';
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaDate());
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState("All");
  const [collectionFilter, setCollectionFilter] = useState("All");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<{ id: string; trackingNo: string; platform: string; receiptImageUrl?: string; waybillUrl?: string; noPhone?: string; marketerIdStaff?: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Regenerate tracking state
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [orderForTracking, setOrderForTracking] = useState<OrderForTracking | null>(null);
  const [regeneratePoskod, setRegeneratePoskod] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Payment details modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedOrderPayment, setSelectedOrderPayment] = useState<typeof orders[0] | null>(null);
  const [isConfirmingCollection, setIsConfirmingCollection] = useState(false);

  // Receipt upload state
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string>('');
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Delivery status filter
      if (deliveryStatusFilter !== "All") {
        if (deliveryStatusFilter === "Remaining") {
          // Remaining = Shipped but seo !== 'Successful Delivery'
          if (!(order.deliveryStatus === 'Shipped' && order.seo !== 'Successful Delivery')) {
            return false;
          }
        } else if (order.deliveryStatus !== deliveryStatusFilter) {
          return false;
        }
      }

      // Collection status filter
      if (collectionFilter !== "All") {
        const orderCollectionStatus = getCollectionStatus(order.deliveryStatus, order.seo);
        if (orderCollectionStatus !== collectionFilter) {
          return false;
        }
      }

      const matchesSearch =
        order.noTempahan.toLowerCase().includes(search.toLowerCase()) ||
        order.produk.toLowerCase().includes(search.toLowerCase()) ||
        order.marketerName.toLowerCase().includes(search.toLowerCase()) ||
        order.noPhone.toLowerCase().includes(search.toLowerCase()) ||
        (order.noTracking || '').toLowerCase().includes(search.toLowerCase());

      const orderDate = order.dateOrder || order.tarikhTempahan;
      const matchesStartDate = !startDate || orderDate >= startDate;
      const matchesEndDate = !endDate || orderDate <= endDate;

      return matchesSearch && matchesStartDate && matchesEndDate;
    });
  }, [orders, search, startDate, endDate, deliveryStatusFilter, collectionFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / pageSize);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Calculate stats - use filteredOrders to match date range filters
  const stats = useMemo(() => {
    const totalCustomer = filteredOrders.length;
    const totalSales = filteredOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const totalUnit = filteredOrders.reduce((sum, o) => sum + (o.kuantiti || 0), 0);
    const totalCash = filteredOrders.filter(o => o.caraBayaran === 'CASH').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const totalCOD = filteredOrders.filter(o => o.caraBayaran === 'COD').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const totalPending = filteredOrders.filter(o => o.deliveryStatus === 'Pending').length;
    const totalShipped = filteredOrders.filter(o => o.deliveryStatus === 'Shipped').length;

    // Remaining = Shipped but seo !== 'Successful Delivery'
    const remainingOrders = filteredOrders.filter(o => o.deliveryStatus === 'Shipped' && o.seo !== 'Successful Delivery');
    const totalRemaining = remainingOrders.length;
    const totalSalesRemaining = remainingOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

    // Success = Shipped and seo === 'Successful Delivery'
    const successOrders = filteredOrders.filter(o => o.deliveryStatus === 'Shipped' && o.seo === 'Successful Delivery');
    const totalSuccess = successOrders.length;
    const totalSalesSuccess = successOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

    // Return
    const returnOrders = filteredOrders.filter(o => o.deliveryStatus === 'Failed' || o.deliveryStatus === 'Return');
    const totalReturn = returnOrders.length;
    const totalSalesReturn = returnOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

    // Total Collection (seo === 'Successful Delivery')
    const collectionOrders = filteredOrders.filter(o => o.seo === 'Successful Delivery');
    const totalCollection = collectionOrders.length;
    const totalSalesCollection = collectionOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

    return {
      totalCustomer, totalSales, totalReturn, totalUnit, totalPending, totalShipped, totalCash, totalCOD,
      totalRemaining, totalSalesRemaining, totalSuccess, totalSalesSuccess, totalSalesReturn,
      totalCollection, totalSalesCollection
    };
  }, [filteredOrders]);

  const resetFilters = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
    setDeliveryStatusFilter("All");
    setCollectionFilter("All");
    setCurrentPage(1);
  };

  const handleWhatsAppClick = (order: typeof orders[0]) => {
    // Format phone number - remove leading 0 and add Malaysia country code
    let phone = order.noPhone || "";
    phone = phone.replace(/\D/g, ""); // Remove non-digits
    if (phone.startsWith("0")) {
      phone = "60" + phone.substring(1);
    } else if (!phone.startsWith("60")) {
      phone = "60" + phone;
    }

    // Format date as DD/MM/YYYY, HH:MM am/pm
    const orderDate = order.dateOrder || order.tarikhTempahan || '';
    let formattedDate = orderDate;
    if (orderDate) {
      try {
        const date = new Date(orderDate);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'pm' : 'am';
        const hour12 = hours % 12 || 12;
        formattedDate = `${day}/${month}/${year}, ${String(hour12).padStart(2, '0')}:${minutes} ${ampm}`;
      } catch {
        formattedDate = orderDate;
      }
    }

    const tracking = order.noTracking || '-';

    // Build message with order details
    const message = `DFR NOTIFICATION ORDER

Nama Pelanggan : ${order.marketerName || "-"}
Phone : ${order.noPhone || "-"}
Pakej : ${order.produk || "-"}
Tarikh Membeli : ${formattedDate}
Tracking Number : ${tracking}
Harga Jualan : RM${Number(order.hargaJualanSebenar || 0).toFixed(2)}
Cara Bayaran : ${order.kurier || order.caraBayaran || "-"}

https://www.ninjavan.co/en-my/tracking?id=${tracking}`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodedMessage}`;
    window.open(whatsappUrl, "_blank");
  };

  const exportCSV = () => {
    const headers = ['No', 'Id Sales', 'Tarikh Order', 'Tarikh Process', 'Nama Pelanggan', 'Phone', 'Produk', 'Tracking No', 'Total Sales', 'Jenis Platform', 'Jenis Customer', 'Negeri', 'Alamat', 'Cara Bayaran', 'Delivery Status'];
    const rows = filteredOrders.map((order, idx) => [
      idx + 1,
      order.idSale || '-',
      order.dateOrder || order.tarikhTempahan,
      order.dateProcessed || '-',
      order.marketerName,
      order.noPhone,
      order.produk,
      order.noTracking || '-',
      order.hargaJualanSebenar,
      order.jenisPlatform || '-',
      order.jenisCustomer || '-',
      order.negeri,
      order.alamat,
      order.kurier || order.caraBayaran || '-',
      order.deliveryStatus,
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'order_history.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handlePaymentClick = (order: typeof orders[0]) => {
    setSelectedOrderPayment(order);
    setReceiptFile(null);
    setReceiptPreview('');
    setPaymentModalOpen(true);
  };

  // Handle receipt file selection
  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Upload receipt to Vercel Blob
  const handleUploadReceipt = async () => {
    if (!receiptFile || !selectedOrderPayment) return;

    setIsUploadingReceipt(true);
    try {
      const token = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;
      if (!token) {
        throw new Error('Blob storage token not configured');
      }

      const timestamp = Date.now();
      const cleanFileName = receiptFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `receipts/${timestamp}-${cleanFileName}`;
      const blob = await put(filename, receiptFile, { access: 'public', token });

      // Update order with receipt URL and set seo to 'Successful Delivery' (collection confirmed)
      await updateOrder(selectedOrderPayment.id, {
        receiptImageUrl: blob.url,
        seo: 'Successful Delivery' // Receipt uploaded = payment collected
      });

      toast({
        title: 'Berjaya',
        description: 'Resit bayaran telah dimuat naik.',
      });

      // Refresh data and close modal
      await refreshData();
      setPaymentModalOpen(false);
      setReceiptFile(null);
      setReceiptPreview('');
      setSelectedOrderPayment(null);
    } catch (error: any) {
      console.error('Receipt upload error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal memuat naik resit. Sila cuba lagi.',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  const handleEditClick = (order: typeof orders[0]) => {
    // Navigate to order form with order data in state
    navigate('/dashboard/orders/new', { state: { editOrder: order } });
  };

  const handleDeleteClick = (order: typeof orders[0]) => {
    setOrderToDelete({
      id: order.id,
      trackingNo: order.noTracking,
      platform: order.jenisPlatform,
      receiptImageUrl: order.receiptImageUrl,
      waybillUrl: order.waybillUrl,
      noPhone: order.noPhone,
      marketerIdStaff: order.marketerIdStaff,
    });
    setDeleteDialogOpen(true);
  };

  const handleRegenerateClick = (order: typeof orders[0]) => {
    setOrderForTracking({
      id: order.id,
      idSale: order.idSale,
      marketerName: order.marketerName,
      noPhone: order.noPhone,
      alamat: order.alamat,
      poskod: order.poskod,
      bandar: order.bandar,
      negeri: order.negeri,
      caraBayaran: order.caraBayaran,
      produk: order.produk,
      marketerIdStaff: order.marketerIdStaff,
      hargaJualanSebenar: order.hargaJualanSebenar,
    });
    setRegeneratePoskod(order.poskod);
    setRegenerateDialogOpen(true);
  };

  const handleConfirmRegenerate = async () => {
    if (!orderForTracking) return;
    
    setIsRegenerating(true);
    try {
      // Generate new id_sale if order doesn't have one
      let idSale = orderForTracking.idSale;
      if (!idSale) {
        const { data: saleIdData, error: saleIdError } = await supabase.rpc('generate_sale_id');
        if (saleIdError) throw saleIdError;
        idSale = saleIdData;
        
        // Update the order with new id_sale
        await supabase.from('customer_purchases').update({ id_sale: idSale }).eq('id', orderForTracking.id);
      }
      
      // Determine COD based on cara_bayaran
      const isCOD = orderForTracking.caraBayaran === 'COD';
      
      // Call Ninjavan API with correct parameter names
      const { data: ninjavanResult, error: ninjavanError } = await supabase.functions.invoke('ninjavan-order', {
        body: {
          idSale: idSale,
          customerName: orderForTracking.marketerName,
          phone: orderForTracking.noPhone,
          address: orderForTracking.alamat,
          postcode: regeneratePoskod,
          city: orderForTracking.bandar,
          state: orderForTracking.negeri,
          caraBayaran: orderForTracking.caraBayaran,
          produk: orderForTracking.produk,
          marketerIdStaff: orderForTracking.marketerIdStaff,
          price: orderForTracking.hargaJualanSebenar,
        }
      });

      if (ninjavanError) throw ninjavanError;
      
      if (ninjavanResult?.error) {
        throw new Error(ninjavanResult.error);
      }

      const trackingNumber = ninjavanResult?.trackingNumber;
      if (!trackingNumber) {
        throw new Error('No tracking number returned from Ninjavan');
      }

      // Update order with tracking number
      await updateOrder(orderForTracking.id, { noTracking: trackingNumber });
      
      toast({
        title: 'Berjaya',
        description: `Tracking number ${trackingNumber} telah dijana.`,
      });
      
      setRegenerateDialogOpen(false);
      setOrderForTracking(null);
      setRegeneratePoskod('');
      await refreshData();
    } catch (error: any) {
      console.error('Regenerate tracking error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal menjana tracking number. Sila cuba lagi.',
        variant: 'destructive',
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!orderToDelete) return;

    setIsDeleting(true);
    try {
      const isNinjavanOrder = orderToDelete.platform !== 'Shopee' && orderToDelete.platform !== 'Tiktok';

      // If it's a Ninjavan order and has tracking number, cancel via API first
      if (isNinjavanOrder && orderToDelete.trackingNo) {
        try {
          const { data: cancelResult, error: cancelError } = await supabase.functions.invoke('ninjavan-cancel', {
            body: { trackingNumber: orderToDelete.trackingNo }
          });

          if (cancelError) {
            console.error('Ninjavan cancel error:', cancelError);
            toast({
              title: 'Amaran',
              description: 'Gagal membatalkan order di Ninjavan. Order akan dipadam dari sistem sahaja.',
              variant: 'destructive',
            });
          } else if (cancelResult?.error) {
            console.error('Ninjavan cancel API error:', cancelResult.error);
            toast({
              title: 'Amaran',
              description: cancelResult.error,
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Berjaya',
              description: 'Order Ninjavan telah dibatalkan.',
            });
          }
        } catch (err) {
          console.error('Cancel API call failed:', err);
        }
      }

      // Delete images from Vercel Blob storage if they exist
      const deleteFromBlob = async (url: string) => {
        try {
          const response = await fetch('/api/delete-blob', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          });
          if (!response.ok) {
            console.error('Failed to delete from Blob:', url);
          }
        } catch (err) {
          console.error('Blob delete error:', err);
        }
      };

      // Delete receipt image if exists
      if (orderToDelete.receiptImageUrl) {
        await deleteFromBlob(orderToDelete.receiptImageUrl);
      }

      // Delete waybill if exists
      if (orderToDelete.waybillUrl) {
        await deleteFromBlob(orderToDelete.waybillUrl);
      }

      // Delete the order from database
      await deleteOrder(orderToDelete.id);

      // Decrement count_order for the lead
      if (orderToDelete.noPhone && orderToDelete.marketerIdStaff) {
        try {
          // Find the lead by phone number and marketer
          const { data: lead } = await (supabase as any)
            .from('prospects')
            .select('id, count_order')
            .eq('marketer_id_staff', orderToDelete.marketerIdStaff)
            .eq('no_telefon', orderToDelete.noPhone)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lead && lead.count_order > 0) {
            await (supabase as any)
              .from('prospects')
              .update({
                count_order: lead.count_order - 1,
                updated_at: new Date().toISOString(),
              })
              .eq('id', lead.id);
          }
        } catch (err) {
          console.error('Error decrementing count_order:', err);
        }
      }

      toast({
        title: 'Order Dipadam',
        description: 'Order dan fail berkaitan telah berjaya dipadam.',
      });

      await refreshData();
    } catch (error) {
      console.error('Error deleting order:', error);
      toast({
        title: 'Error',
        description: 'Gagal memadam order. Sila cuba lagi.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setOrderToDelete(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary">Order History</h1>
        <p className="text-muted-foreground">
          Monitor and manage your order history
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-10 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="w-4 h-4 text-blue-500" />
            <span className="text-xs uppercase font-medium">Total Customer</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.totalCustomer}</p>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs uppercase font-medium">Total Sales</span>
          </div>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">RM {stats.totalSales.toLocaleString()}</p>
        </div>

        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs uppercase font-medium">Total Cash</span>
          </div>
          <p className="text-2xl font-bold text-green-700 dark:text-green-300">RM {stats.totalCash.toLocaleString()}</p>
        </div>

        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs uppercase font-medium">Total COD</span>
          </div>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">RM {stats.totalCOD.toLocaleString()}</p>
        </div>

        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs uppercase font-medium">Collection</span>
          </div>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{stats.totalCollection}</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">RM {stats.totalSalesCollection.toLocaleString()}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Package className="w-4 h-4 text-purple-500" />
            <span className="text-xs uppercase font-medium">Total Unit</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.totalUnit}</p>
        </div>

        <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs uppercase font-medium">Pending</span>
          </div>
          <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{stats.totalPending}</p>
        </div>

        <div className="bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 mb-1">
            <Truck className="w-4 h-4" />
            <span className="text-xs uppercase font-medium">Shipped</span>
          </div>
          <p className="text-2xl font-bold text-teal-700 dark:text-teal-300">{stats.totalShipped}</p>
        </div>

        <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs uppercase font-medium">Remaining</span>
          </div>
          <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{stats.totalRemaining}</p>
          <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">RM {stats.totalSalesRemaining.toLocaleString()}</p>
        </div>

        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1">
            <Package className="w-4 h-4" />
            <span className="text-xs uppercase font-medium">Success</span>
          </div>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{stats.totalSuccess}</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">RM {stats.totalSalesSuccess.toLocaleString()}</p>
        </div>

        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-1">
            <RotateCw className="w-4 h-4" />
            <span className="text-xs uppercase font-medium">Return</span>
          </div>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">{stats.totalReturn}</p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">RM {stats.totalSalesReturn.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters - like logistic Order layout */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex flex-col gap-4">
          {/* Row 1: Search + Blue Search Button + Dates */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Name, phone, tracking..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
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
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-40"
              />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-40"
              />
            </div>
          </div>

          {/* Row 2: Dropdowns and buttons */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Delivery status dropdown */}
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-muted-foreground" />
              <Select
                value={deliveryStatusFilter}
                onValueChange={(v) => {
                  setDeliveryStatusFilter(v);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DELIVERY_STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Collection status dropdown */}
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              <Select
                value={collectionFilter}
                onValueChange={(v) => {
                  setCollectionFilter(v);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Collection" />
                </SelectTrigger>
                <SelectContent>
                  {COLLECTION_STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status === 'null' ? '-' : status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Page size */}
            <Select
              value={pageSize.toString()}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Reset Filters & Export CSV */}
            <Button variant="outline" onClick={resetFilters}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset Filters
            </Button>
            <Button onClick={exportCSV} className="bg-green-600 hover:bg-green-700 text-white">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">No</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Id Sales</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Tarikh Order</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Tarikh Process</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Nama Pelanggan</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Produk</th>
                {!isMarketer && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Unit</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Tracking No</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Total Sales</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Cara Bayaran</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Delivery Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Jenis Platform</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Jenis Closing</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Jenis Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Negeri</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Alamat</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Nota</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">SEO</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase">Collection</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">WhatsApp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedOrders.length > 0 ? (
                paginatedOrders.map((order, idx) => (
                  <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-foreground">{(currentPage - 1) * pageSize + idx + 1}</td>
                    <td className="px-4 py-3 text-sm font-mono text-foreground">{order.idSale || '-'}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{order.dateOrder || order.tarikhTempahan}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{order.dateProcessed || '-'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{order.marketerName}</td>
                    <td className="px-4 py-3 text-sm font-mono text-foreground">{order.noPhone}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{order.produk}</td>
                    {!isMarketer && (
                      <td className="px-4 py-3 text-sm text-foreground">{order.kuantiti || 1}</td>
                    )}
                    <td className="px-4 py-3 text-sm font-mono text-foreground">
                      {order.noTracking ? (
                        order.noTracking
                      ) : order.jenisPlatform !== 'Shopee' && order.jenisPlatform !== 'Tiktok' ? (
                        <button
                          onClick={() => handleRegenerateClick(order)}
                          className="p-1.5 rounded-md hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600 dark:text-orange-400 transition-colors"
                          title="Generate Tracking"
                        >
                          <Car className="w-4 h-4" />
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">RM {order.hargaJualanSebenar.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm">
                      {order.caraBayaran === 'CASH' ? (
                        <button
                          onClick={() => handlePaymentClick(order)}
                          className={`hover:underline cursor-pointer font-medium ${
                            order.receiptImageUrl
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {order.kurier || 'CASH'}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">{order.kurier || order.caraBayaran || '-'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        order.deliveryStatus === 'Success' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                        order.deliveryStatus === 'Shipped' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                        order.deliveryStatus === 'Pending' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' :
                        order.deliveryStatus === 'Processing' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' :
                        'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {order.deliveryStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{order.jenisPlatform || '-'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{order.jenisClosing || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`font-medium ${
                          order.jenisCustomer === "NP"
                            ? "text-green-600"
                            : order.jenisCustomer === "EP"
                            ? "text-purple-600"
                            : order.jenisCustomer === "EC"
                            ? "text-amber-600"
                            : "text-muted-foreground"
                        }`}
                      >
                        {order.jenisCustomer || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{order.negeri}</td>
                    <td className="px-4 py-3 text-sm text-foreground max-w-xs truncate">{order.alamat}</td>
                    <td className="px-4 py-3 text-sm text-foreground max-w-xs truncate">{order.notaStaff || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        order.seos === 'Successful Delivery' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                        order.seos === 'Shipped' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                        order.seos === 'Return' || order.seos === 'Returned to Sender' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                        'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400'
                      }`}>
                        {order.seos || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const collectionStatus = getCollectionStatus(order.deliveryStatus, order.seo);
                        return (
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            collectionStatus === 'Success' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                            collectionStatus === 'Pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                            collectionStatus === 'Return' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400'
                          }`}>
                            {collectionStatus === 'null' ? '-' : collectionStatus}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleWhatsAppClick(order)}
                        className="p-1.5 rounded-md hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 transition-colors"
                        title="WhatsApp Customer"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {/* Invoice Icon - always visible */}
                        <a
                          href={`/invoice?order=${order.id}&type=customer`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-600 dark:text-purple-400 transition-colors"
                          title="View Invoice"
                        >
                          <Receipt className="w-4 h-4" />
                        </a>
                        {/* Edit & Delete - only for Pending orders */}
                        {order.deliveryStatus === 'Pending' && (
                          <>
                            <button
                              onClick={() => handleEditClick(order)}
                              className="p-1.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"
                              title="Edit Order"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(order)}
                              className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                              title="Delete Order"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={isMarketer ? 21 : 22} className="px-4 py-12 text-center text-muted-foreground">
                    No orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Padam Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Adakah anda pasti mahu memadam order ini? 
              {orderToDelete?.trackingNo && orderToDelete.platform !== 'Shopee' && orderToDelete.platform !== 'Tiktok' && (
                <span className="block mt-2 text-orange-600 dark:text-orange-400">
                  Order Ninjavan (Tracking: {orderToDelete.trackingNo}) juga akan dibatalkan.
                </span>
              )}
              Tindakan ini tidak boleh dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Memadam...' : 'Padam'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerate Tracking Dialog */}
      <Dialog open={regenerateDialogOpen} onOpenChange={setRegenerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Jana Tracking Number</DialogTitle>
            <DialogDescription>
              Masukkan poskod untuk menjana tracking number Ninjavan.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-foreground">Poskod</label>
            <Input
              type="text"
              value={regeneratePoskod}
              onChange={(e) => setRegeneratePoskod(e.target.value)}
              placeholder="Masukkan poskod"
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenerateDialogOpen(false)} disabled={isRegenerating}>
              Batal
            </Button>
            <Button onClick={handleConfirmRegenerate} disabled={isRegenerating || !regeneratePoskod}>
              {isRegenerating ? 'Menjana...' : 'Jana Tracking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Details Modal */}
      <Dialog open={paymentModalOpen} onOpenChange={(open) => {
        setPaymentModalOpen(open);
        if (!open) {
          setReceiptFile(null);
          setReceiptPreview('');
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Butiran Bayaran</DialogTitle>
          </DialogHeader>
          {selectedOrderPayment && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Tarikh Bayaran</p>
                  <p className="text-sm font-medium text-foreground">{selectedOrderPayment.tarikhBayaran || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Jenis Bayaran</p>
                  <p className="text-sm font-medium text-foreground">{selectedOrderPayment.jenisBayaran || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Bank</p>
                  <p className="text-sm font-medium text-foreground">{selectedOrderPayment.bank || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Harga Jualan</p>
                  <p className="text-sm font-medium text-foreground">RM {selectedOrderPayment.hargaJualanSebenar?.toFixed(2)}</p>
                </div>
              </div>

              {/* Receipt Image */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Resit Bayaran</p>
                {selectedOrderPayment.receiptImageUrl ? (
                  <a
                    href={selectedOrderPayment.receiptImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={selectedOrderPayment.receiptImageUrl}
                      alt="Resit Bayaran"
                      className="max-w-full h-48 object-contain rounded-lg border border-border cursor-pointer hover:opacity-80 transition-opacity"
                    />
                  </a>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-red-500 italic">Tiada resit dimuat naik</p>

                    {/* Upload receipt form */}
                    <div className="border border-dashed border-red-300 dark:border-red-700 rounded-lg p-4 bg-red-50/50 dark:bg-red-950/20">
                      <p className="text-sm font-medium text-foreground mb-2">Muat Naik Resit</p>
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleReceiptFileChange}
                          className="hidden"
                          id="receipt-upload-modal"
                        />
                        <label
                          htmlFor="receipt-upload-modal"
                          className="flex items-center justify-center gap-2 w-full px-4 py-2 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors bg-background"
                        >
                          <Upload className="w-4 h-4" />
                          <span className="text-sm text-muted-foreground">
                            {receiptFile ? receiptFile.name : 'Pilih gambar resit'}
                          </span>
                        </label>
                      </div>

                      {/* Preview */}
                      {receiptPreview && (
                        <div className="mt-3">
                          <img
                            src={receiptPreview}
                            alt="Preview"
                            className="max-w-full h-32 object-contain rounded-lg border border-border"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPaymentModalOpen(false)}>
              Tutup
            </Button>
            {selectedOrderPayment && !selectedOrderPayment.receiptImageUrl && receiptFile && (
              <Button
                onClick={handleUploadReceipt}
                disabled={isUploadingReceipt}
                className="bg-green-600 hover:bg-green-700"
              >
                {isUploadingReceipt ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Memuat naik...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Simpan Resit
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Orders;
