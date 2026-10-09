import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '@/context/DataContext';
import { useBundles } from '@/context/BundleContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useTeam } from '@/hooks/useTeam';
import { TeamFilter } from '@/components/TeamFilter';
import { ReceiptViewer } from '@/components/ReceiptViewer';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { usePospadaEnabled } from '@/hooks/usePospadaEnabled';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  Search, RotateCcw, Download, Users, DollarSign, Package,
  Truck, RotateCw, Clock, Calendar, Pencil, Trash2, Car, FileText, MessageCircle, Receipt, Upload, Loader2, Printer, Ban, History
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { PageHeader, StatCard, EmptyState, MissingHint } from '@/components/common/SoftUI';
import { put } from '@vercel/blob';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AUDIT_MODE } from '@/lib/audit';
import { TablePagination } from '@/components/TablePagination';
import { formatRM, formatDMY } from '@/lib/utils';
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
import DateApplyButton from '@/components/DateApplyButton';
import UnappliedDateNote from '@/components/UnappliedDateNote';

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

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, "All"];

// Summary-box StatCard: 2 per row on phones, 3 on tablets, 6 on wide screens. Tile sits above
// the value on phones and in the 6-up grid (boxes are narrow there); value capped at text-xl.
const BOX = 'flex-col items-stretch gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4 xl:flex-col xl:items-start xl:gap-2 [&_p:first-child]:text-lg sm:[&_p:first-child]:text-xl xl:[&_p:first-child]:text-[length:clamp(1rem,1.25vw,1.375rem)]';
const BOX_GRID = 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6';
// Extra lines under a box's label (they wrap instead of truncating).
const boxLine = 'block whitespace-normal leading-snug';
const DELIVERY_STATUS_OPTIONS = ["All", "Pending", "Shipped", "Return", "Success"];
const COLLECTION_STATUS_OPTIONS = ["All", "Collection", "Remaining"];

// Collection = did we get the money?
//   CASH  -> collected upfront (Success) as soon as the order exists
//   COD   -> Success only after Parcel Daily REMITS the money to us
//            (COD_REMITTED webhook stamps date_payment); Pending until then
//   Return/Failed delivery -> Return (no money)
const getCollectionStatus = (order: { deliveryStatus?: string; caraBayaran?: string; tarikhBayaran?: string; kurier?: string }): string => {
  if (order.deliveryStatus === 'Return' || order.deliveryStatus === 'Failed') return 'Return';
  const isCod = order.caraBayaran === 'COD' || order.kurier?.includes('COD');
  if (!isCod) return 'Success';            // CASH = paid upfront
  return order.tarikhBayaran ? 'Success' : 'Pending'; // COD = only after remittance
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

// Deep-link a tracking number to the courier's own tracking page. Unknown
// couriers fall back to parcelsapp (auto-detects the courier from the number).
const courierTrackUrl = (kurier: string, tn: string): string => {
  const k = (kurier || '').toLowerCase();
  const t = encodeURIComponent(tn || '');
  if (k.includes('jnt') || k.includes('j&t')) return `https://www.jtexpress.my/tracking?billcode=${t}`;
  if (k.includes('ninja')) return `https://www.ninjavan.co/en-my/tracking?id=${t}`;
  if (k.includes('poslaju') || k.includes('pos ')) return `https://track.pos.com.my/postal-services/quick-access?track-trace=${t}`;
  if (k.includes('dhl')) return `https://ecommerceportal.dhl.com/track/?ref=${t}`;
  if (k.includes('spx')) return `https://spx.com.my/${t}`;
  return `https://parcelsapp.com/en/tracking/${t}`;
};

// Open a WhatsApp chat with the customer (normalise to Malaysian 60… format).
const waLink = (phone: string): string | null => {
  let d = (phone || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('0')) d = '60' + d.slice(1);
  else if (!d.startsWith('60')) d = '60' + d;
  return `https://wa.me/${d}`;
};

const Orders: React.FC = () => {
  const navigate = useNavigate();
  const { orders, updateOrder, deleteOrder, refreshData, ensureOrdersFrom } = useData();
  const { bundles, products } = useBundles();
  const { profile } = useAuth();
  const isMarketer = profile?.role === 'marketer';
  const pospadaEnabled = usePospadaEnabled();
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaDate());
  // Picked dates; the data follows startDate/endDate, which only change on Filter.
  const [pendingStart, setPendingStart] = useState(startDate);
  const [pendingEnd, setPendingEnd] = useState(endDate);
  const applyDates = () => { setStartDate(pendingStart); setEndDate(pendingEnd); setCurrentPage(1); };
  const [pageSize, setPageSize] = useState<number | "All">(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState("All");
  const [collectionFilter, setCollectionFilter] = useState("All");
  const [paymentFilter, setPaymentFilter] = useState("All"); // All | Cash | COD | Pickup (clickable boxes)
  const [teamFilter, setTeamFilter] = useState('');
  const { nameByIdstaff } = useTeam();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<{ id: string; trackingNo: string; platform: string; kurier?: string; pdOrderId?: string; receiptImageUrl?: string; waybillUrl?: string; noPhone?: string; marketerIdStaff?: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [savingNotaId, setSavingNotaId] = useState<string | null>(null);

  // Inline-edit Nota Staff on the history table (save on blur if changed).
  const handleNotaSave = async (order: any, value: string) => {
    if ((value || '') === (order.notaStaff || '')) return;
    setSavingNotaId(order.id);
    try {
      await updateOrder(order.id, { notaStaff: value });
      toast({ title: 'Nota disimpan' });
    } catch {
      toast({ title: 'Error', description: 'Gagal simpan nota.', variant: 'destructive' });
    } finally {
      setSavingNotaId(null);
    }
  };

  // Bulk waybill print state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkPrinting, setIsBulkPrinting] = useState(false);

  // Regenerate tracking state
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [orderForTracking, setOrderForTracking] = useState<OrderForTracking | null>(null);
  const [regeneratePoskod, setRegeneratePoskod] = useState('');
  const [regeneratePrice, setRegeneratePrice] = useState('');
  const [regenerateError, setRegenerateError] = useState('');
  const [regenerateCourier, setRegenerateCourier] = useState<'ninjavan' | 'poslaju' | 'jnt' | 'dhl' | 'spx'>('poslaju');
  // Couriers the client enabled in Courier Settings (labels e.g. ['Poslaju','JNT']).
  const [allowedCouriers, setAllowedCouriers] = useState<string[] | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('my_allowed_couriers');
      const list = Array.isArray(data) ? (data as string[]).filter(Boolean) : [];
      setAllowedCouriers(list.length ? list : null);
    })();
  }, []);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Payment details modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedOrderPayment, setSelectedOrderPayment] = useState<typeof orders[0] | null>(null);
  const [isConfirmingCollection, setIsConfirmingCollection] = useState(false);

  // Receipt upload state
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string>('');
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);

  // Widen the server-side fetch window if the user filters earlier than loaded
  React.useEffect(() => { ensureOrdersFrom(startDate); }, [startDate]);

  // baseOrders = team + search + date only. The summary boxes are computed from
  // THIS set, so their totals stay stable and clicking a box narrows the table
  // (payment / delivery / collection) without changing the box numbers.
  const baseOrders = useMemo(() => {
    return orders.filter((order) => {
      if (teamFilter && (order.marketerIdStaff || '') !== teamFilter) return false;
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
  }, [orders, search, startDate, endDate, teamFilter]);

  const filteredOrders = useMemo(() => {
    return baseOrders.filter((order) => {
      // Payment box filter — Pickup by kurier, else CASH/COD.
      if (paymentFilter !== "All") {
        const isCodO = order.caraBayaran === 'COD' || (order.kurier?.includes('COD') ?? false);
        const isPickupO = (order.kurier || '').toUpperCase().includes('PICKUP');
        if (paymentFilter === 'Pickup' && !isPickupO) return false;
        if (paymentFilter === 'COD' && !isCodO) return false;
        if (paymentFilter === 'Cash' && (isCodO || isPickupO)) return false;
      }

      // Delivery status box filter. "Shipped" = ever shipped (Shipped/Success/Return);
      // "RemainingShip" = shipped but not yet Success/Return (delivery_status Shipped).
      if (deliveryStatusFilter !== "All") {
        const ds = order.deliveryStatus;
        if (deliveryStatusFilter === 'Shipped') {
          if (!['Shipped', 'Success', 'Return'].includes(ds)) return false;
        } else if (deliveryStatusFilter === 'RemainingShip') {
          if (ds !== 'Shipped') return false;
        } else if (ds !== deliveryStatusFilter) {
          return false;
        }
      }

      // Collection status filter
      if (collectionFilter !== "All") {
        const target = collectionFilter === 'Collection' ? 'Success' : collectionFilter === 'Remaining' ? 'Pending' : collectionFilter;
        if (getCollectionStatus(order) !== target) return false;
      }

      return true;
    });
  }, [baseOrders, deliveryStatusFilter, collectionFilter, paymentFilter]);

  // Pagination
  const effectivePageSize = pageSize === "All" ? filteredOrders.length : pageSize;
  const totalPages = pageSize === "All" ? 1 : Math.ceil(filteredOrders.length / pageSize);
  const paginatedOrders = pageSize === "All"
    ? filteredOrders
    : filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Calculate stats - use filteredOrders to match date range filters
  const stats = useMemo(() => {
    // Boxes are computed from baseOrders (team/search/date only) so their totals
    // stay stable while clicking a box narrows the table. (Local shadow.)
    const filteredOrders = baseOrders;
    const totalCustomer = filteredOrders.length;
    const totalSales = filteredOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const totalUnit = filteredOrders.reduce((sum, o) => sum + (o.kuantiti || 0), 0);
    const isPickupO = (o: any) => (o.kurier || '').toUpperCase().includes('PICKUP');
    const totalCash = filteredOrders.filter(o => !isPickupO(o) && (o.caraBayaran === 'CASH' || o.kurier?.includes('CASH'))).reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const totalCOD = filteredOrders.filter(o => o.caraBayaran === 'COD' || o.kurier?.includes('COD')).reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const totalPickup = filteredOrders.filter(isPickupO).reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const totalPending = filteredOrders.filter(o => o.deliveryStatus === 'Pending').length;
    const totalRejected = filteredOrders.filter(o => o.deliveryStatus === 'Rejected').length;
    // Shipped = ever shipped (in transit + delivered + returned); RemainingShip =
    // shipped but not yet Success/Return (still in transit).
    const totalShipped = filteredOrders.filter(o => ['Shipped', 'Success', 'Return'].includes(o.deliveryStatus)).length;
    const totalRemainingShip = filteredOrders.filter(o => o.deliveryStatus === 'Shipped').length;

    // Success = delivered (webhook set delivery_status = Success when seo = Successful Delivery)
    const successOrders = filteredOrders.filter(o => o.deliveryStatus === 'Success');
    const totalSuccess = successOrders.length;
    const totalSalesSuccess = successOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

    // Return (no money — parcel came back)
    const returnOrders = filteredOrders.filter(o => getCollectionStatus(o) === 'Return');
    const totalReturn = returnOrders.length;
    const totalSalesReturn = returnOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

    // Collection = money in hand (CASH upfront + COD remitted)
    const collectionOrders = filteredOrders.filter(o => getCollectionStatus(o) === 'Success');
    const totalCollection = collectionOrders.length;
    const totalSalesCollection = collectionOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

    // Remaining = outstanding money = Total Sales - Collection - Return
    //   (these three partition every order: COD not-yet-remitted = Pending = Remaining)
    const remainingOrders = filteredOrders.filter(o => getCollectionStatus(o) === 'Pending');
    const totalRemaining = remainingOrders.length;
    const totalSalesRemaining = totalSales - totalSalesCollection - totalSalesReturn;

    // Cost Product and Cost Postage totals
    const totalCostProduct = filteredOrders.reduce((sum, o) => sum + (o.kosProduk || 0), 0);
    const totalCostPostage = filteredOrders.reduce((sum, o) => sum + (o.kosPos || 0), 0);

    // ---- CASH vs COD breakdown for each metric ----
    const isCod = (o: any) => o.caraBayaran === 'COD' || (o.kurier?.includes('COD') ?? false);
    const sumRM = (arr: any[], cod: boolean) => arr.filter(o => isCod(o) === cod).reduce((s, o) => s + (o.hargaJualanSebenar || 0), 0);
    const cnt = (arr: any[], cod: boolean) => arr.filter(o => isCod(o) === cod).length;
    const sumUnit = (arr: any[], cod: boolean) => arr.filter(o => isCod(o) === cod).reduce((s, o) => s + (o.kuantiti || 0), 0);
    const sumCost = (arr: any[], cod: boolean, f: (o: any) => number) => arr.filter(o => isCod(o) === cod).reduce((s, o) => s + f(o), 0);
    const pendingOrders = filteredOrders.filter(o => o.deliveryStatus === 'Pending');
    const shippedOrders = filteredOrders.filter(o => o.deliveryStatus === 'Shipped');

    const split = {
      customer:    { cash: cnt(filteredOrders, false), cod: cnt(filteredOrders, true) },
      collection:  { cash: sumRM(collectionOrders, false), cod: sumRM(collectionOrders, true) },
      remaining:   { cash: sumRM(remainingOrders, false), cod: sumRM(remainingOrders, true) },
      success:     { cash: sumRM(successOrders, false),    cod: sumRM(successOrders, true) },
      ret:         { cash: sumRM(returnOrders, false),     cod: sumRM(returnOrders, true) },
      unit:        { cash: sumUnit(filteredOrders, false), cod: sumUnit(filteredOrders, true) },
      pending:     { cash: cnt(pendingOrders, false),      cod: cnt(pendingOrders, true) },
      shipped:     { cash: cnt(shippedOrders, false),      cod: cnt(shippedOrders, true) },
      costProduct: { cash: sumCost(filteredOrders, false, o => o.kosProduk || 0), cod: sumCost(filteredOrders, true, o => o.kosProduk || 0) },
      costPostage: { cash: sumCost(filteredOrders, false, o => o.kosPos || 0),    cod: sumCost(filteredOrders, true, o => o.kosPos || 0) },
    };

    // Pospada = booking orders (have a pospada date).
    const totalSalesPospada = filteredOrders.filter((o: any) => o.pospadaDate).reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

    return {
      totalCustomer, totalSales, totalReturn, totalUnit, totalPending, totalShipped, totalCash, totalCOD,
      totalPickup, totalRejected, totalRemainingShip,
      totalRemaining, totalSalesRemaining, totalSuccess, totalSalesSuccess, totalSalesReturn,
      totalCollection, totalSalesCollection, totalCostProduct, totalCostPostage, totalSalesPospada, split
    };
  }, [baseOrders]);

  const resetFilters = () => {
    setSearch('');
    setStartDate(''); setPendingStart('');
    setEndDate(''); setPendingEnd('');
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

    // Determine tracking URL based on courier
    const kurier = (order.kurier || '').toLowerCase();
    const trackingUrl = kurier.includes('poslaju') || kurier.includes('pos laju')
      ? `https://tracking.pos.com.my/tracking/${tracking}`
      : `https://www.ninjavan.co/en-my/tracking?id=${tracking}`;

    // Build message with order details
    const message = `PENINGORDER NOTIFICATION

Nama Pelanggan : ${order.marketerName || "-"}
Phone : ${order.noPhone || "-"}
Pakej : ${order.produk || "-"}
Tarikh Membeli : ${formattedDate}
Tracking Number : ${tracking}
Harga Jualan : RM${Number(order.hargaJualanSebenar || 0).toFixed(2)}
Cara Bayaran : ${order.kurier || order.caraBayaran || "-"}

${trackingUrl}`;

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
      kurier: order.kurier,
      pdOrderId: (order as any).pdOrderId,
      receiptImageUrl: order.receiptImageUrl,
      waybillUrl: order.waybillUrl,
      noPhone: order.noPhone,
      marketerIdStaff: order.marketerIdStaff,
    });
    setDeleteDialogOpen(true);
  };

  // All couriers (used to map a code -> label).
  const COURIER_CHOICES: { code: 'poslaju' | 'ninjavan' | 'jnt' | 'dhl' | 'spx'; label: string }[] = [
    { code: 'poslaju', label: 'Poslaju' },
    { code: 'ninjavan', label: 'Ninjavan' },
    { code: 'jnt', label: 'JNT' },
    { code: 'dhl', label: 'DHL' },
    { code: 'spx', label: 'SPX' },
  ];
  // Only the couriers the client enabled in Courier Settings are offered in the
  // dropdown (fall back to all if none configured).
  const availableCouriers = allowedCouriers && allowedCouriers.length
    ? COURIER_CHOICES.filter((c) => allowedCouriers.some((a) => a.toLowerCase() === c.label.toLowerCase()))
    : COURIER_CHOICES;
  // Map a saved kurier string ("JNT COD") back to a courier code.
  const kurierToCode = (kurier?: string): 'poslaju' | 'ninjavan' | 'jnt' | 'dhl' | 'spx' => {
    const k = (kurier || '').toUpperCase();
    if (k.includes('NINJAVAN')) return 'ninjavan';
    if (k.includes('JNT')) return 'jnt';
    if (k.includes('DHL')) return 'dhl';
    if (k.includes('SPX')) return 'spx';
    return 'poslaju';
  };
  // Inline courier pick in History (only for orders with no tracking yet). Saves
  // the chosen courier onto the order so the Generate-Tracking icon books it.
  const handleInlineCourierSave = async (order: typeof orders[0], code: string) => {
    const label = COURIER_CHOICES.find((c) => c.code === code)?.label || 'Poslaju';
    const isCod = (order.kurier || '').includes('COD') || order.caraBayaran === 'COD';
    await updateOrder(order.id, { kurier: `${label} ${isCod ? 'COD' : 'CASH'}` });
    toast({ title: 'Kurier disimpan', description: `${label} — klik ikon tracking untuk jana.` });
  };

  const handleRegenerateClick = (order: typeof orders[0]) => {
    // Generate using the courier the client already saved on this order.
    setRegenerateCourier(kurierToCode(order.kurier));
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
    setRegeneratePrice(order.hargaJualanSebenar > 0 ? String(order.hargaJualanSebenar) : '');
    setRegenerateError('');
    setRegenerateDialogOpen(true);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (pageOrders: typeof orders) => {
    setSelectedIds((prev) => {
      const pageIds = pageOrders.map((o) => o.id);
      const allSelected = pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  // Bulk waybill print: fetch stored waybill URLs (instant, from CHECKOUT webhook)
  // and open each PDF in its own tab for printing.
  const handleBulkPrintWaybills = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkPrinting(true);
    try {
      const { data, error } = await supabase.functions.invoke('parceldaily-waybill', {
        body: { mode: 'urls', purchaseIds: Array.from(selectedIds) },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const waybills: Array<{ waybillUrl: string; trackingNumber: string }> = data?.waybills || [];
      const missing: Array<{ trackingNumber: string; status: string }> = data?.missing || [];

      if (waybills.length === 0) {
        toast({
          title: 'Tiada Waybill',
          description: 'Order dipilih belum ada waybill. Tunggu webhook CHECKOUT (30-60 saat selepas jana tracking).',
          variant: 'destructive',
        });
        return;
      }

      // Merge all selected waybills into ONE PDF (one tab). The old loop opened
      // a tab per waybill — popup-blocked and unusable when printing 50-100+ orders.
      const waybillUrls = waybills.map((w) => w.waybillUrl);
      const { data: sessionData } = await supabase.auth.getSession();
      const merged = await supabase.functions.invoke('merge-waybills', {
        body: { waybillUrls },
        headers: { Authorization: `Bearer ${sessionData?.session?.access_token}` },
      });
      if (merged.error) throw new Error(merged.error.message || 'Gagal gabung waybill');
      const blob = new Blob([merged.data as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);

      toast({
        title: `${waybills.length} Waybill Digabung`,
        description: missing.length > 0
          ? `Satu PDF dibuka. ${missing.length} order belum ada waybill (masih pending).`
          : 'Semua waybill digabung dalam satu PDF — terus print.',
      });
    } catch (err: any) {
      console.error('Bulk print error:', err);
      toast({ title: 'Error', description: err.message || 'Gagal dapatkan waybill.', variant: 'destructive' });
    } finally {
      setIsBulkPrinting(false);
    }
  };

  // Turn a raw ParcelDaily/API error into a clear message the seller can act on.
  const translateTrackingError = (raw: string): string => {
    const s = (raw || '').toLowerCase();
    if (/price is required|price/.test(s)) return 'Order ini tiada harga jualan (RM 0). Sila edit order dan isi "Harga Jualan" dahulu, kemudian cuba jana tracking semula.';
    if (/credit|insufficient|balance|top.?up|baki/.test(s)) return 'Kredit ParcelDaily tak cukup untuk book kurier ini. Sila top up kredit ParcelDaily dahulu.';
    if (/postcode|poskod|postal/.test(s)) return 'Poskod tidak sah atau kurier ini tak cover kawasan tu. Sila semak poskod penerima atau pilih kurier lain.';
    if (/phone|contact|mobile/.test(s)) return 'Nombor telefon penerima tidak sah. Sila edit order dan betulkan nombor telefon.';
    if (/address|alamat/.test(s)) return 'Alamat penerima tidak lengkap. Sila edit order dan lengkapkan alamat.';
    if (/weight|kg|dimension|parcel size/.test(s)) return 'Berat/saiz parcel tidak sah. Sila semak produk/bundle order.';
    if (/token|unauthor|auth|merchant/.test(s)) return 'Sambungan ParcelDaily bermasalah (token/akaun). Sila semak tetapan di Courier Settings.';
    if (/not found|no service|no courier|unavailable/.test(s)) return 'Kurier ini tak tersedia untuk order ni. Sila cuba kurier lain.';
    return raw || 'Gagal menjana tracking number. Sila cuba lagi.';
  };

  const handleConfirmRegenerate = async () => {
    if (!orderForTracking) return;
    setRegenerateError('');

    // ParcelDaily needs a price > 0 (COD amount / parcel value). The client fills
    // it in right here in the dialog — no need to go edit the order separately.
    const orderPrice = Number(regeneratePrice) || 0;
    if (orderPrice <= 0) {
      setRegenerateError('Sila isi "Harga Jualan (RM)" dahulu — kurier perlukan harga untuk jana tracking.');
      return;
    }
    if (!regeneratePoskod.trim()) {
      setRegenerateError('Sila masukkan poskod penerima dahulu.');
      return;
    }

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
      
      // Save the price the client entered so the order records it (was RM 0
      // before, or the client corrected it here).
      if (orderPrice !== Number(orderForTracking.hargaJualanSebenar)) {
        await supabase.from('customer_purchases').update({ total_sale: orderPrice }).eq('id', orderForTracking.id);
      }

      // Determine COD based on cara_bayaran
      const isCOD = orderForTracking.caraBayaran === 'COD';

      // Route all couriers through Parcel Daily (unified middleware)
      const COURIER_LABELS: Record<string, string> = {
        ninjavan: 'Ninjavan',
        poslaju: 'Poslaju',
        jnt: 'JNT',
        dhl: 'DHL',
        spx: 'SPX',
      };
      const courierLabel = COURIER_LABELS[regenerateCourier] || regenerateCourier;

      const { data: courierResult, error: courierError } = await supabase.functions.invoke('parceldaily-order', {
        body: {
          idSale: idSale,
          courier: regenerateCourier,
          customerName: orderForTracking.marketerName, // misleading field name - actually name_customer
          phone: orderForTracking.noPhone,
          address: orderForTracking.alamat,
          postcode: regeneratePoskod,
          city: orderForTracking.bandar,
          state: orderForTracking.negeri,
          paymentMethod: orderForTracking.caraBayaran,
          productName: orderForTracking.produk,
          marketerIdStaff: orderForTracking.marketerIdStaff,
          price: orderPrice,
        }
      });

      if (courierError) throw courierError;
      if (courierResult?.error) throw new Error(courierResult.error);

      // Parcel Daily returns orderId immediately; tracking number arrives via checkout webhook.
      // For now, store the ParcelDaily orderId as a placeholder; webhook will overwrite with real tracking.
      const parcelDailyOrderId = courierResult?.orderId;
      if (!parcelDailyOrderId) {
        throw new Error(`Courier (${courierLabel}) did not return an orderId`);
      }

      const updateData: any = {
        pdOrderId: parcelDailyOrderId, // PD id kept separate; id_sale stays the ON-xxxxxxxx number
        noTracking: courierResult?.trackingNumber || parcelDailyOrderId,
        kurier: `${courierLabel} ${isCOD ? 'COD' : 'CASH'}`,
      };
      if (courierResult?.pdfLink) updateData.waybillUrl = courierResult.pdfLink;
      // Real shipping cost from PD quote — feeds profit reports
      if (courierResult?.shippingPrice != null) updateData.kosPos = Number(courierResult.shippingPrice);
      await updateOrder(orderForTracking.id, updateData);
      
      toast({
        title: 'Berjaya',
        description: `Tracking number ${updateData.noTracking} telah dijana.`,
      });
      
      setRegenerateDialogOpen(false);
      setOrderForTracking(null);
      setRegeneratePoskod('');
      await refreshData();
    } catch (error: any) {
      console.error('Regenerate tracking error:', error);
      const friendly = translateTrackingError(String(error?.message || ''));
      setRegenerateError(friendly);
      toast({
        title: 'Tak boleh jana tracking',
        description: friendly,
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
      // Any parcel-daily-managed courier: cancel at PD FIRST to free/refund credit.
      // Check the KURIER (e.g. "JNT COD"), not jenis_platform — the old code checked
      // jenis_platform (Facebook/Tiktok) so this never fired -> double cost.
      const isCourierOrder = ['Ninjavan', 'Poslaju', 'JNT', 'DHL', 'SPX'].some((c) => (orderToDelete.kurier || '').includes(c));
      const hasBooking = !!(orderToDelete.trackingNo || orderToDelete.pdOrderId);

      if (isCourierOrder && hasBooking) {
        try {
          const { data: cancelResult, error: cancelError } = await supabase.functions.invoke('parceldaily-cancel', {
            body: {
              purchaseId: orderToDelete.id,
              orderId: orderToDelete.pdOrderId || undefined,
              trackingNumber: orderToDelete.trackingNo || undefined,
            },
          });

          if (cancelError) {
            console.error('Parcel Daily cancel error:', cancelError);
            toast({
              title: 'Amaran',
              description: 'Gagal membatalkan order di courier. Order tetap dipadam dari sistem.',
              variant: 'destructive',
            });
          } else if (cancelResult?.error) {
            console.error('Parcel Daily cancel API error:', cancelResult.error);
            toast({
              title: 'Amaran',
              description: cancelResult.error,
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Berjaya',
              description: 'Order dibatalkan. Kredit (jika ada) akan dikembalikan.',
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

  // Click a summary box → filter the table on a single dimension (payment /
  // delivery / collection); the box totals stay stable (computed from baseOrders).
  const boxFilter = (opts: { pay?: string; del?: string; coll?: string }) => {
    setPaymentFilter(opts.pay ?? "All");
    setDeliveryStatusFilter(opts.del ?? "All");
    setCollectionFilter(opts.coll ?? "All");
    setCurrentPage(1);
  };
  const allCleared = paymentFilter === "All" && deliveryStatusFilter === "All" && collectionFilter === "All";

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Order History"
        description="Monitor and manage your order history"
        icon={History}
        tone="brand"
      />

      {/* Stats — Row 1: money & collection (clickable). Boxes computed from
          baseOrders so totals stay stable while a click narrows the table. */}
      <div className={BOX_GRID}>
        <StatCard
          className={BOX}
          icon={Users}
          tone="purple"
          label="Total Customer"
          value={stats.totalCustomer}
          hint={`CASH ${stats.split.customer.cash} · COD ${stats.split.customer.cod}`}
          onClick={() => boxFilter({})}
          active={allCleared}
        />

        <StatCard
          className={BOX}
          icon={DollarSign}
          tone="amber"
          label="Total Sales"
          value={`RM ${formatRM(stats.totalSales)}`}
          onClick={() => boxFilter({})}
        />

        <StatCard
          className={BOX}
          icon={DollarSign}
          tone="green"
          label="Total Cash"
          value={`RM ${formatRM(stats.totalCash)}`}
          onClick={() => boxFilter({ pay: "Cash" })}
          active={paymentFilter === "Cash"}
        />

        <StatCard
          className={BOX}
          icon={DollarSign}
          tone="blue"
          label="Total COD"
          value={`RM ${formatRM(stats.totalCOD)}`}
          onClick={() => boxFilter({ pay: "COD" })}
          active={paymentFilter === "COD"}
        />

        <StatCard
          className={BOX}
          icon={Package}
          tone="cyan"
          label="Total Pickup"
          value={`RM ${formatRM(stats.totalPickup)}`}
          onClick={() => boxFilter({ pay: "Pickup" })}
          active={paymentFilter === "Pickup"}
        />

        <StatCard
          className={BOX}
          icon={DollarSign}
          tone="green"
          label="Collection"
          value={stats.totalCollection}
          hint={<>
            <span className={`${boxLine} font-semibold text-emerald-600 dark:text-emerald-400`}>RM {formatRM(stats.totalSalesCollection)}</span>
            <span className={boxLine}>CASH RM {formatRM(stats.split.collection.cash)} · COD RM {formatRM(stats.split.collection.cod)}</span>
          </>}
          onClick={() => boxFilter({ coll: "Collection" })}
          active={collectionFilter === "Collection"}
        />

        <StatCard
          className={BOX}
          icon={Clock}
          tone="indigo"
          label="Remain Coll"
          value={stats.totalRemaining}
          hint={<>
            <span className={`${boxLine} font-semibold text-indigo-600 dark:text-indigo-400`}>RM {formatRM(stats.totalSalesRemaining)}</span>
            <span className={boxLine}>CASH RM {formatRM(stats.split.remaining.cash)} · COD RM {formatRM(stats.split.remaining.cod)}</span>
          </>}
          onClick={() => boxFilter({ coll: "Remaining" })}
          active={collectionFilter === "Remaining"}
        />

        {pospadaEnabled && (
          <StatCard
            className={BOX}
            icon={Calendar}
            tone="purple"
            label="Sales Pospada"
            value={`RM ${formatRM(stats.totalSalesPospada)}`}
          />
        )}
      </div>

      {/* Stats — Row 2: lifecycle (clickable) + costs.
          Pending + Rejected + Shipped = Total Order; Shipped = RemainingShip + Success + Return. */}
      <div className={BOX_GRID}>
        <StatCard
          className={BOX}
          icon={Clock}
          tone="orange"
          label="Pending"
          value={stats.totalPending}
          hint={`CASH ${stats.split.pending.cash} · COD ${stats.split.pending.cod}`}
          onClick={() => boxFilter({ del: "Pending" })}
          active={deliveryStatusFilter === "Pending"}
        />

        <StatCard
          className={BOX}
          icon={Ban}
          tone="slate"
          label="Rejected"
          value={stats.totalRejected}
          onClick={() => boxFilter({ del: "Rejected" })}
          active={deliveryStatusFilter === "Rejected"}
        />

        <StatCard
          className={BOX}
          icon={Truck}
          tone="cyan"
          label="Shipped"
          value={stats.totalShipped}
          hint="ever shipped"
          onClick={() => boxFilter({ del: "Shipped" })}
          active={deliveryStatusFilter === "Shipped"}
        />

        <StatCard
          className={BOX}
          icon={Truck}
          tone="blue"
          label="Remaining Ship"
          value={stats.totalRemainingShip}
          hint="in transit"
          onClick={() => boxFilter({ del: "RemainingShip" })}
          active={deliveryStatusFilter === "RemainingShip"}
        />

        <StatCard
          className={BOX}
          icon={Package}
          tone="green"
          label="Success"
          value={stats.totalSuccess}
          hint={<>
            <span className={`${boxLine} font-semibold text-emerald-600 dark:text-emerald-400`}>RM {formatRM(stats.totalSalesSuccess)}</span>
            <span className={boxLine}>CASH RM {formatRM(stats.split.success.cash)} · COD RM {formatRM(stats.split.success.cod)}</span>
          </>}
          onClick={() => boxFilter({ del: "Success" })}
          active={deliveryStatusFilter === "Success"}
        />

        <StatCard
          className={BOX}
          icon={RotateCw}
          tone="red"
          label="Return"
          value={stats.totalReturn}
          hint={<>
            <span className={`${boxLine} font-semibold text-red-600 dark:text-red-400`}>RM {formatRM(stats.totalSalesReturn)}</span>
            <span className={`${boxLine} font-semibold text-red-600 dark:text-red-400`}>{(stats.totalSales > 0 ? (stats.totalSalesReturn / stats.totalSales) * 100 : 0).toFixed(1)}% return</span>
          </>}
          onClick={() => boxFilter({ del: "Return" })}
          active={deliveryStatusFilter === "Return"}
        />

        <StatCard
          className={BOX}
          icon={Package}
          tone="pink"
          label="Cost Product"
          value={`RM ${formatRM(stats.totalCostProduct)}`}
          hint={<span className={boxLine}>CASH RM {formatRM(stats.split.costProduct.cash)} · COD RM {formatRM(stats.split.costProduct.cod)}</span>}
        />

        <StatCard
          className={BOX}
          icon={Truck}
          tone="indigo"
          label="Cost Postage"
          value={`RM ${formatRM(stats.totalCostPostage)}`}
          hint={<span className={boxLine}>CASH RM {formatRM(stats.split.costPostage.cash)} · COD RM {formatRM(stats.split.costPostage.cod)}</span>}
        />
      </div>

      {/* Filters - like logistic Order layout */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          {/* Row 1: Search + Search Button + Dates */}
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
            <div className="flex min-w-0 flex-1 gap-2">
              <div className="relative min-w-0 flex-1">
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
                onClick={() => { setStartDate(""); setPendingStart(""); setEndDate(""); setPendingEnd(""); }}
                className="shrink-0"
              >
                <Search className="w-4 h-4" />
                Search
              </Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Input
                  type="date"
                  value={pendingStart}
                  onChange={(e) => setPendingStart(e.target.value)}
                  className="w-full sm:w-40"
                />
                <Input
                  type="date"
                  value={pendingEnd}
                  onChange={(e) => setPendingEnd(e.target.value)}
                  className="w-full sm:w-40"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2"><DateApplyButton onClick={applyDates} /><UnappliedDateNote pendingStart={pendingStart} pendingEnd={pendingEnd} startDate={startDate} endDate={endDate} /></div>
            </div>
          </div>

          {/* Row 2: Dropdowns and buttons */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {/* Team filter (client with staff only) */}
            <TeamFilter value={teamFilter} onChange={(v) => { setTeamFilter(v); setCurrentPage(1); }} />

            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
              {/* Delivery status dropdown */}
              <div className="flex min-w-0 items-center gap-2">
                <Truck className="w-4 h-4 shrink-0 text-muted-foreground" />
                <Select
                  value={deliveryStatusFilter}
                  onValueChange={(v) => {
                    setDeliveryStatusFilter(v);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-36">
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
              <div className="flex min-w-0 items-center gap-2">
                <DollarSign className="w-4 h-4 shrink-0 text-emerald-500" />
                <Select
                  value={collectionFilter}
                  onValueChange={(v) => {
                    setCollectionFilter(v);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-36">
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
                  setPageSize(v === "All" ? "All" : Number(v));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size.toString()} value={size.toString()}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reset Filters & Export CSV */}
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button variant="outline" onClick={resetFilters}>
                <RotateCcw className="w-4 h-4" />
                Reset Filters
              </Button>
              <Button onClick={exportCSV} className="bg-green-600 hover:bg-green-700 text-white">
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    className="w-4 h-4 rounded border-border accent-indigo-600 cursor-pointer"
                    checked={paginatedOrders.length > 0 && paginatedOrders.every((o) => selectedIds.has(o.id))}
                    onChange={() => toggleSelectAll(paginatedOrders)}
                  />
                </th>
                <th className="px-4 py-3 text-left whitespace-nowrap">No</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Id Sales</th>
                <th className="px-4 py-3 text-left whitespace-nowrap text-blue-600 dark:text-blue-400">ID Staff</th>
                <th className="px-4 py-3 text-left whitespace-nowrap text-blue-600 dark:text-blue-400">Nama</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Tarikh Order</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Tarikh Process</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Nama Pelanggan</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Phone</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Produk</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Cara Bayaran</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Kurier</th>
                {pospadaEnabled && <th className="px-4 py-3 text-left whitespace-nowrap text-purple-600 dark:text-purple-400">Pospada</th>}
                <th className="px-4 py-3 text-left whitespace-nowrap">Tracking No</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Total Sales</th>
                <th className="px-4 py-3 text-left whitespace-nowrap text-pink-600 dark:text-pink-400">Cost Product</th>
                <th className="px-4 py-3 text-left whitespace-nowrap text-indigo-600 dark:text-indigo-400">Cost Postage</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Delivery Status</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Jenis Platform</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Jenis Closing</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Jenis Customer</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Negeri</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Alamat</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Parcel Status</th>
                <th className="px-4 py-3 text-left whitespace-nowrap text-emerald-600 dark:text-emerald-400">Collection</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">WhatsApp</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Nota Staff</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedOrders.length > 0 ? (
                paginatedOrders.map((order, idx) => (
                  <tr key={order.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select order ${order.idSale || order.id}`}
                        className="w-4 h-4 rounded border-border accent-indigo-600 cursor-pointer"
                        checked={selectedIds.has(order.id)}
                        onChange={() => toggleSelect(order.id)}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{pageSize === "All" ? idx + 1 : (currentPage - 1) * pageSize + idx + 1}</td>
                    <td className="px-4 py-3 text-sm font-mono text-foreground whitespace-nowrap">{order.idSale || '-'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-blue-600 dark:text-blue-400 whitespace-nowrap">{order.marketerIdStaff || '-'}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{nameByIdstaff.get(order.marketerIdStaff || '') || order.marketerName || '-'}</td>
                    <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">{formatDMY(order.dateOrder || order.tarikhTempahan)}</td>
                    <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">{formatDMY(order.dateProcessed)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{order.marketerName}</td>
                    <td className="px-4 py-3 text-sm font-mono text-foreground whitespace-nowrap">
                      {order.noPhone && waLink(order.noPhone) ? (
                        <a
                          href={waLink(order.noPhone)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 dark:text-green-400 hover:underline"
                          title="Buka WhatsApp pelanggan"
                        >
                          {order.noPhone}
                        </a>
                      ) : (
                        order.noPhone || '-'
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{order.produk}</td>
                    {/* Cara Bayaran — payment type ONLY (COD / CASH / PICKUP), never
                        the courier. CASH (or any order with a receipt) stays clickable
                        to view Butiran Bayaran. Sits before the Kurier column. */}
                    <td className="px-4 py-3 text-sm">
                      {(() => {
                        const isPickup = (order.kurier || '').toUpperCase().includes('PICKUP') || order.caraBayaran === 'Pickup';
                        const isCod = order.caraBayaran === 'COD' || (order.kurier || '').includes('COD');
                        const payLabel = isPickup ? 'PICKUP' : isCod ? 'COD' : 'CASH';
                        return (payLabel === 'CASH' || order.receiptImageUrl) ? (
                          <button
                            onClick={() => handlePaymentClick(order)}
                            title="Lihat butiran bayaran"
                            className={`hover:underline cursor-pointer font-medium inline-flex items-center gap-1 ${
                              order.receiptImageUrl ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {order.receiptImageUrl && <Receipt className="w-3.5 h-3.5" />}
                            {payLabel}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">{payLabel}</span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {/* No tracking yet → inline courier dropdown (options = couriers
                          enabled in Courier Settings). Selecting saves the courier;
                          the Generate-Tracking icon then books THAT courier. */}
                      {!order.noTracking && order.jenisPlatform !== 'Tiktok' && !(order.kurier || '').toUpperCase().includes('PICKUP') ? (
                        <Select value={kurierToCode(order.kurier)} onValueChange={(v) => handleInlineCourierSave(order, v)}>
                          <SelectTrigger className="h-8 w-28"><SelectValue placeholder="Pilih Kurier" /></SelectTrigger>
                          <SelectContent>
                            {availableCouriers.map((c) => (
                              <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (order.kurier || '-')}
                    </td>
                    {pospadaEnabled && (
                      <td className="px-4 py-3 text-sm">
                        {order.pospadaDate ? (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 whitespace-nowrap">
                            {formatDMY(order.pospadaDate)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm font-mono text-foreground whitespace-nowrap">
                      {order.noTracking ? (
                        <a
                          href={courierTrackUrl(order.kurier || '', order.noTracking)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                          title="Jejak parcel di laman kurier"
                        >
                          {order.noTracking}
                        </a>
                      ) : order.jenisPlatform !== 'Tiktok' ? (
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
                    <td className="px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap">RM {order.hargaJualanSebenar.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-pink-600 dark:text-pink-400 whitespace-nowrap">RM {(order.kosProduk || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-indigo-600 dark:text-indigo-400 whitespace-nowrap">RM {(order.kosPos || 0).toFixed(2)}</td>
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
                        const collectionStatus = getCollectionStatus(order);
                        return (
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            collectionStatus === 'Success' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                            collectionStatus === 'Pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                            collectionStatus === 'Return' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400'
                          }`}>
                            {collectionStatus}
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
                      <Textarea
                        defaultValue={order.notaStaff || ''}
                        onBlur={(e) => handleNotaSave(order, e.target.value)}
                        disabled={savingNotaId === order.id}
                        placeholder="Nota..."
                        rows={2}
                        className="min-w-[180px] text-xs resize-y"
                      />
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
                            {/* Delete only while Pending — once shipped it can't be cancelled/refunded at the courier. */}
                            {!AUDIT_MODE && order.deliveryStatus === 'Pending' && (
                              <button
                                onClick={() => handleDeleteClick(order)}
                                className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                                title="Delete Order"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={(isMarketer ? 25 : 26) - (pospadaEnabled ? 0 : 1)} className="p-0">
                    <EmptyState icon={History} title="No orders found." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <TablePagination
          page={currentPage}
          pageSize={pageSize === 'All' ? (filteredOrders.length || 1) : (pageSize as number)}
          total={filteredOrders.length}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Padam Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Adakah anda pasti mahu memadam order ini? 
              {orderToDelete?.trackingNo && orderToDelete.platform !== 'Tiktok' && (
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
              Pilih kurier dan masukkan poskod untuk menjana tracking number.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kurier</Label>
              <Select value={regenerateCourier} onValueChange={(v) => setRegenerateCourier(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kurier" />
                </SelectTrigger>
                <SelectContent>
                  {availableCouriers.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Poskod</Label>
              <Input
                type="text"
                value={regeneratePoskod}
                onChange={(e) => { setRegeneratePoskod(e.target.value); setRegenerateError(''); }}
                placeholder="Masukkan poskod"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Harga Jualan (RM)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={regeneratePrice}
                onChange={(e) => { setRegeneratePrice(e.target.value); setRegenerateError(''); }}
                placeholder="cth: 84.00"
              />
              <p className="text-xs text-muted-foreground">Kurier perlukan harga (jumlah COD / nilai parcel) untuk jana tracking. Harga akan disimpan ke order.</p>
            </div>
            {regenerateError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-400 sm:col-span-2">
                <span className="font-semibold">Tak boleh jana tracking:</span> {regenerateError}
              </div>
            )}
            <MissingHint
              className="sm:col-span-2"
              items={[
                { label: 'Poskod', done: !!regeneratePoskod.trim() },
                { label: 'Harga Jualan (RM)', done: Number(regeneratePrice) > 0 },
              ]}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenerateDialogOpen(false)} disabled={isRegenerating}>
              Batal
            </Button>
            <Button onClick={handleConfirmRegenerate} disabled={isRegenerating || !regeneratePoskod || !(Number(regeneratePrice) > 0)}>
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
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="section-label">Tarikh Bayaran</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{formatDMY(selectedOrderPayment.tarikhBayaran)}</p>
                </div>
                <div>
                  <p className="section-label">Jenis Bayaran</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{selectedOrderPayment.jenisBayaran || '-'}</p>
                </div>
                <div>
                  <p className="section-label">Bank</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{selectedOrderPayment.bank || '-'}</p>
                </div>
                <div>
                  <p className="section-label">Harga Jualan</p>
                  <p className="mt-1 text-sm font-medium text-foreground">RM {selectedOrderPayment.hargaJualanSebenar?.toFixed(2)}</p>
                </div>
              </div>

              {/* Receipt Image */}
              <div>
                <p className="section-label mb-2">Resit Bayaran</p>
                {selectedOrderPayment.receiptImageUrl ? (
                  <ReceiptViewer url={selectedOrderPayment.receiptImageUrl} type={(selectedOrderPayment as any).receiptType} />
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-red-500 italic">Tiada resit dimuat naik</p>

                    {/* Upload receipt form */}
                    <div className="rounded-xl border border-dashed border-red-200 bg-red-50/50 p-4 dark:border-red-500/30 dark:bg-red-950/20">
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
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Memuat naik...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
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
