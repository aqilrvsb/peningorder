import React, { useState } from 'react';
import { useData } from '@/context/DataContext';
import { useBundles } from '@/context/BundleContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Package, Truck, CheckCircle2, Clock, XCircle, Printer, Send, Loader2, RotateCcw, ClipboardList, Save, Wallet } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { STATUS_OPTIONS, KURIER_OPTIONS } from '@/types';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import StockInTab from '@/components/logistics/StockInTab';
import StockOutTab from '@/components/logistics/StockOutTab';
import { getMalaysiaDate } from '@/lib/utils';

const PLATFORM_OPTIONS = ['All', 'Facebook', 'Tiktok', 'Shopee', 'Database', 'Google'];
const CARA_BAYARAN_OPTIONS = ['All', 'CASH', 'COD'];
const PAGE_SIZE_OPTIONS = [10, 50, 100];

const Logistics: React.FC = () => {
  const { orders, updateOrder, refreshData } = useData();
  const { bundles } = useBundles();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  // Date filters for Order tab (filters by date_order)
  const [orderStartDate, setOrderStartDate] = useState('');
  const [orderEndDate, setOrderEndDate] = useState('');

  // Date filters for Shipment tab (filters by date_processed)
  const [shipmentStartDate, setShipmentStartDate] = useState('');
  const [shipmentEndDate, setShipmentEndDate] = useState('');

  // New filter states
  const [platformFilter, setPlatformFilter] = useState('All');
  const [caraBayaranFilter, setCaraBayaranFilter] = useState('All');

  // Pagination state
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Checkbox selection state
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedShipmentOrders, setSelectedShipmentOrders] = useState<Set<string>>(new Set());

  // Pagination state for Shipment tab
  const [shipmentPageSize, setShipmentPageSize] = useState(10);
  const [shipmentCurrentPage, setShipmentCurrentPage] = useState(1);

  // Filter states for Shipment tab
  const [shipmentPlatformFilter, setShipmentPlatformFilter] = useState('All');
  const [shipmentCaraBayaranFilter, setShipmentCaraBayaranFilter] = useState('All');
  const [shipmentSearch, setShipmentSearch] = useState('');

  // Return tab states
  const [returnStartDate, setReturnStartDate] = useState('');
  const [returnEndDate, setReturnEndDate] = useState('');
  const [returnPageSize, setReturnPageSize] = useState(10);
  const [returnCurrentPage, setReturnCurrentPage] = useState(1);
  const [selectedReturnOrders, setSelectedReturnOrders] = useState<Set<string>>(new Set());
  const [returnPlatformFilter, setReturnPlatformFilter] = useState('All');
  const [returnCaraBayaranFilter, setReturnCaraBayaranFilter] = useState('All');
  const [returnSearch, setReturnSearch] = useState('');

  // Pending Tracking tab states
  const [pendingTrackingStartDate, setPendingTrackingStartDate] = useState('');
  const [pendingTrackingEndDate, setPendingTrackingEndDate] = useState('');
  const [pendingTrackingPageSize, setPendingTrackingPageSize] = useState(10);
  const [pendingTrackingCurrentPage, setPendingTrackingCurrentPage] = useState(1);
  const [selectedPendingTrackingOrders, setSelectedPendingTrackingOrders] = useState<Set<string>>(new Set());
  const [pendingTrackingPlatformFilter, setPendingTrackingPlatformFilter] = useState('All');
  const [pendingTrackingCaraBayaranFilter, setPendingTrackingCaraBayaranFilter] = useState('All');
  const [pendingTrackingSearch, setPendingTrackingSearch] = useState('');

  // Bulk update states for Pending Tracking
  const [bulkStatus, setBulkStatus] = useState<'Success' | 'Return'>('Success');
  const [bulkDate, setBulkDate] = useState('');
  const [bulkTrackingList, setBulkTrackingList] = useState('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Loading states
  const [isShipping, setIsShipping] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isPendingAction, setIsPendingAction] = useState(false);
  const [isShipmentPrinting, setIsShipmentPrinting] = useState(false);
  const [isReturnPrinting, setIsReturnPrinting] = useState(false);
  const [isPendingTrackingPrinting, setIsPendingTrackingPrinting] = useState(false);

  // Determine current tab from URL path
  const getTabFromPath = () => {
    if (location.pathname.includes('/logistics/stock-in')) return 'stock-in';
    if (location.pathname.includes('/logistics/stock-out')) return 'stock-out';
    if (location.pathname.includes('/logistics/order')) return 'order';
    if (location.pathname.includes('/logistics/shipment')) return 'shipment';
    if (location.pathname.includes('/logistics/return')) return 'return';
    if (location.pathname.includes('/logistics/pending-tracking')) return 'pending-tracking';
    return 'order';
  };

  const currentTab = getTabFromPath();

  const handleTabChange = (value: string) => {
    navigate(`/dashboard/logistics/${value}`);
    // Reset selections when changing tabs
    setSelectedOrders(new Set());
    setSelectedShipmentOrders(new Set());
    setSelectedReturnOrders(new Set());
    setSelectedPendingTrackingOrders(new Set());
    setCurrentPage(1);
    setShipmentCurrentPage(1);
    setReturnCurrentPage(1);
    setPendingTrackingCurrentPage(1);
    // Auto-refresh data when switching tabs
    refreshData();
  };

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [kurierFilter, setKurierFilter] = useState<string>('all');

  // Filter orders for Order tab - only Pending, filter by date_order
  const pendingOrders = orders.filter((order) => {
    const isPending = order.deliveryStatus === 'Pending';
    if (!isPending) return false;

    // Advanced search with + for combining filters (e.g., "CASH+Facebook")
    let matchesSearch = true;
    if (search.trim()) {
      const searchTerms = search.toLowerCase().split('+').map(s => s.trim()).filter(Boolean);

      if (searchTerms.length > 1) {
        // Multiple terms with + means ALL must match (AND logic)
        matchesSearch = searchTerms.every(term => {
          return (
            order.marketerName.toLowerCase().includes(term) ||
            order.noPhone.toLowerCase().includes(term) ||
            order.alamat.toLowerCase().includes(term) ||
            (order.caraBayaran && order.caraBayaran.toLowerCase().includes(term)) ||
            (order.jenisPlatform && order.jenisPlatform.toLowerCase().includes(term)) ||
            (order.negeri && order.negeri.toLowerCase().includes(term)) ||
            (order.produk && order.produk.toLowerCase().includes(term))
          );
        });
      } else {
        // Single term - normal search (OR logic)
        const term = searchTerms[0] || '';
        matchesSearch =
          order.marketerName.toLowerCase().includes(term) ||
          order.noPhone.toLowerCase().includes(term) ||
          order.alamat.toLowerCase().includes(term) ||
          (order.caraBayaran && order.caraBayaran.toLowerCase().includes(term)) ||
          (order.jenisPlatform && order.jenisPlatform.toLowerCase().includes(term)) ||
          (order.negeri && order.negeri.toLowerCase().includes(term)) ||
          (order.produk && order.produk.toLowerCase().includes(term));
      }
    }

    // Platform filter
    const matchesPlatform = platformFilter === 'All' || order.jenisPlatform === platformFilter;

    // Cara Bayaran filter
    const matchesCaraBayaran = caraBayaranFilter === 'All' || order.caraBayaran === caraBayaranFilter;

    // Date filter by date_order
    let matchesDate = true;
    if (orderStartDate || orderEndDate) {
      const orderDate = order.dateOrder ? new Date(order.dateOrder) : null;
      if (orderDate) {
        if (orderStartDate) {
          matchesDate = matchesDate && orderDate >= new Date(orderStartDate);
        }
        if (orderEndDate) {
          matchesDate = matchesDate && orderDate <= new Date(orderEndDate);
        }
      } else {
        matchesDate = false;
      }
    }

    return matchesSearch && matchesDate && matchesPlatform && matchesCaraBayaran;
  });

  // Filter orders for Shipment tab - only Shipped, filter by date_processed
  const shippedOrders = orders.filter((order) => {
    const isShipped = order.deliveryStatus === 'Shipped';
    if (!isShipped) return false;

    // Advanced search with + for combining filters (e.g., "CASH+Facebook")
    let matchesSearch = true;
    if (shipmentSearch.trim()) {
      const searchTerms = shipmentSearch.toLowerCase().split('+').map(s => s.trim()).filter(Boolean);

      if (searchTerms.length > 1) {
        // Multiple terms with + means ALL must match (AND logic)
        matchesSearch = searchTerms.every(term => {
          return (
            order.marketerName.toLowerCase().includes(term) ||
            order.noPhone.toLowerCase().includes(term) ||
            order.alamat.toLowerCase().includes(term) ||
            (order.caraBayaran && order.caraBayaran.toLowerCase().includes(term)) ||
            (order.jenisPlatform && order.jenisPlatform.toLowerCase().includes(term)) ||
            (order.negeri && order.negeri.toLowerCase().includes(term)) ||
            (order.produk && order.produk.toLowerCase().includes(term))
          );
        });
      } else {
        // Single term - normal search (OR logic)
        const term = searchTerms[0] || '';
        matchesSearch =
          order.marketerName.toLowerCase().includes(term) ||
          order.noPhone.toLowerCase().includes(term) ||
          order.alamat.toLowerCase().includes(term) ||
          (order.caraBayaran && order.caraBayaran.toLowerCase().includes(term)) ||
          (order.jenisPlatform && order.jenisPlatform.toLowerCase().includes(term)) ||
          (order.negeri && order.negeri.toLowerCase().includes(term)) ||
          (order.produk && order.produk.toLowerCase().includes(term));
      }
    }

    // Platform filter
    const matchesPlatform = shipmentPlatformFilter === 'All' || order.jenisPlatform === shipmentPlatformFilter;

    // Cara Bayaran filter
    const matchesCaraBayaran = shipmentCaraBayaranFilter === 'All' || order.caraBayaran === shipmentCaraBayaranFilter;

    // Date filter by date_processed
    let matchesDate = true;
    if (shipmentStartDate || shipmentEndDate) {
      const processedDate = order.dateProcessed ? new Date(order.dateProcessed) : null;
      if (processedDate) {
        if (shipmentStartDate) {
          matchesDate = matchesDate && processedDate >= new Date(shipmentStartDate);
        }
        if (shipmentEndDate) {
          matchesDate = matchesDate && processedDate <= new Date(shipmentEndDate);
        }
      } else {
        matchesDate = false;
      }
    }

    return matchesSearch && matchesDate && matchesPlatform && matchesCaraBayaran;
  });

  // Filter orders for Return tab - only Return status, filter by date_return
  const returnOrders = orders.filter((order) => {
    const isReturn = order.deliveryStatus === 'Return';
    if (!isReturn) return false;

    // Advanced search with + for combining filters (e.g., "CASH+Facebook")
    let matchesSearch = true;
    if (returnSearch.trim()) {
      const searchTerms = returnSearch.toLowerCase().split('+').map(s => s.trim()).filter(Boolean);

      if (searchTerms.length > 1) {
        // Multiple terms with + means ALL must match (AND logic)
        matchesSearch = searchTerms.every(term => {
          return (
            order.marketerName.toLowerCase().includes(term) ||
            order.noPhone.toLowerCase().includes(term) ||
            order.alamat.toLowerCase().includes(term) ||
            (order.caraBayaran && order.caraBayaran.toLowerCase().includes(term)) ||
            (order.jenisPlatform && order.jenisPlatform.toLowerCase().includes(term)) ||
            (order.negeri && order.negeri.toLowerCase().includes(term)) ||
            (order.produk && order.produk.toLowerCase().includes(term)) ||
            (order.marketerIdStaff && order.marketerIdStaff.toLowerCase().includes(term))
          );
        });
      } else {
        // Single term - normal search (OR logic)
        const term = searchTerms[0] || '';
        matchesSearch =
          order.marketerName.toLowerCase().includes(term) ||
          order.noPhone.toLowerCase().includes(term) ||
          order.alamat.toLowerCase().includes(term) ||
          (order.caraBayaran && order.caraBayaran.toLowerCase().includes(term)) ||
          (order.jenisPlatform && order.jenisPlatform.toLowerCase().includes(term)) ||
          (order.negeri && order.negeri.toLowerCase().includes(term)) ||
          (order.produk && order.produk.toLowerCase().includes(term)) ||
          (order.idstaff && order.idstaff.toLowerCase().includes(term));
      }
    }

    // Platform filter
    const matchesPlatform = returnPlatformFilter === 'All' || order.jenisPlatform === returnPlatformFilter;

    // Cara Bayaran filter
    const matchesCaraBayaran = returnCaraBayaranFilter === 'All' || order.caraBayaran === returnCaraBayaranFilter;

    // Date filter by date_return
    let matchesDate = true;
    if (returnStartDate || returnEndDate) {
      const dateReturn = order.dateReturn ? new Date(order.dateReturn) : null;
      if (dateReturn) {
        if (returnStartDate) {
          matchesDate = matchesDate && dateReturn >= new Date(returnStartDate);
        }
        if (returnEndDate) {
          matchesDate = matchesDate && dateReturn <= new Date(returnEndDate);
        }
      } else {
        matchesDate = false;
      }
    }

    return matchesSearch && matchesDate && matchesPlatform && matchesCaraBayaran;
  });

  // Filter orders for Pending Tracking tab - Shipped AND (SEO is null OR SEO != 'Successfull Delivery') AND COD only, filter by date_order
  const pendingTrackingOrders = orders.filter((order) => {
    const isShipped = order.deliveryStatus === 'Shipped';
    const seoNotSuccess = !order.seo || order.seo !== 'Successfull Delivery';
    const isCOD = order.caraBayaran === 'COD';
    if (!isShipped || !seoNotSuccess || !isCOD) return false;

    // Advanced search with + for combining filters
    let matchesSearch = true;
    if (pendingTrackingSearch.trim()) {
      const searchTerms = pendingTrackingSearch.toLowerCase().split('+').map(s => s.trim()).filter(Boolean);

      if (searchTerms.length > 1) {
        matchesSearch = searchTerms.every(term => {
          return (
            order.marketerName.toLowerCase().includes(term) ||
            order.noPhone.toLowerCase().includes(term) ||
            order.alamat.toLowerCase().includes(term) ||
            (order.caraBayaran && order.caraBayaran.toLowerCase().includes(term)) ||
            (order.jenisPlatform && order.jenisPlatform.toLowerCase().includes(term)) ||
            (order.negeri && order.negeri.toLowerCase().includes(term)) ||
            (order.produk && order.produk.toLowerCase().includes(term)) ||
            (order.noTracking && order.noTracking.toLowerCase().includes(term)) ||
            (order.marketerIdStaff && order.marketerIdStaff.toLowerCase().includes(term))
          );
        });
      } else {
        const term = searchTerms[0] || '';
        matchesSearch =
          order.marketerName.toLowerCase().includes(term) ||
          order.noPhone.toLowerCase().includes(term) ||
          order.alamat.toLowerCase().includes(term) ||
          (order.caraBayaran && order.caraBayaran.toLowerCase().includes(term)) ||
          (order.jenisPlatform && order.jenisPlatform.toLowerCase().includes(term)) ||
          (order.negeri && order.negeri.toLowerCase().includes(term)) ||
          (order.produk && order.produk.toLowerCase().includes(term)) ||
          (order.noTracking && order.noTracking.toLowerCase().includes(term)) ||
          (order.marketerIdStaff && order.marketerIdStaff.toLowerCase().includes(term));
      }
    }

    // Platform filter
    const matchesPlatform = pendingTrackingPlatformFilter === 'All' || order.jenisPlatform === pendingTrackingPlatformFilter;

    // Cara Bayaran filter
    const matchesCaraBayaran = pendingTrackingCaraBayaranFilter === 'All' || order.caraBayaran === pendingTrackingCaraBayaranFilter;

    // Date filter by date_order
    let matchesDate = true;
    if (pendingTrackingStartDate || pendingTrackingEndDate) {
      const dateOrder = order.dateOrder ? new Date(order.dateOrder) : null;
      if (dateOrder) {
        if (pendingTrackingStartDate) {
          matchesDate = matchesDate && dateOrder >= new Date(pendingTrackingStartDate);
        }
        if (pendingTrackingEndDate) {
          matchesDate = matchesDate && dateOrder <= new Date(pendingTrackingEndDate);
        }
      } else {
        matchesDate = false;
      }
    }

    return matchesSearch && matchesDate && matchesPlatform && matchesCaraBayaran;
  });

  // Pagination logic for Order tab
  const totalPages = Math.ceil(pendingOrders.length / pageSize);
  const paginatedOrders = pendingOrders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Pagination logic for Shipment tab
  const shipmentTotalPages = Math.ceil(shippedOrders.length / shipmentPageSize);
  const paginatedShipmentOrders = shippedOrders.slice(
    (shipmentCurrentPage - 1) * shipmentPageSize,
    shipmentCurrentPage * shipmentPageSize
  );

  // Pagination logic for Return tab
  const returnTotalPages = Math.ceil(returnOrders.length / returnPageSize);
  const paginatedReturnOrders = returnOrders.slice(
    (returnCurrentPage - 1) * returnPageSize,
    returnCurrentPage * returnPageSize
  );

  // Pagination logic for Pending Tracking tab
  const pendingTrackingTotalPages = Math.ceil(pendingTrackingOrders.length / pendingTrackingPageSize);
  const paginatedPendingTrackingOrders = pendingTrackingOrders.slice(
    (pendingTrackingCurrentPage - 1) * pendingTrackingPageSize,
    pendingTrackingCurrentPage * pendingTrackingPageSize
  );

  // Order tab counts - Pending orders
  const orderCounts = {
    totalPending: pendingOrders.length,
    cashPending: pendingOrders.filter((o) => o.caraBayaran === 'CASH').length,
    codPending: pendingOrders.filter((o) => o.caraBayaran === 'COD').length,
  };

  // Shipment tab counts - Shipped orders
  const shipmentCounts = {
    totalShipped: shippedOrders.length,
    cashShipped: shippedOrders.filter((o) => o.caraBayaran === 'CASH').length,
    codShipped: shippedOrders.filter((o) => o.caraBayaran === 'COD').length,
  };

  // Return tab counts
  const returnCounts = {
    totalReturn: returnOrders.length,
    cashReturn: returnOrders.filter((o) => o.caraBayaran === 'CASH').length,
    codReturn: returnOrders.filter((o) => o.caraBayaran === 'COD').length,
    totalSalesReturn: returnOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0),
  };

  // Pending Tracking tab counts (COD only)
  const pendingTrackingCounts = {
    totalOrder: pendingTrackingOrders.length,
    codOrder: pendingTrackingOrders.filter((o) => o.caraBayaran === 'COD').length,
    totalSales: pendingTrackingOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0),
  };

  // Process order - update delivery_status to Shipped and set date_processed
  const handleProcessOrder = async (orderId: string) => {
    const today = getMalaysiaDate();
    try {
      await updateOrder(orderId, {
        deliveryStatus: 'Shipped',
        dateProcessed: today
      });
      toast({
        title: 'Order Processed',
        description: 'Order has been marked as Shipped.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to process order.',
        variant: 'destructive',
      });
    }
  };

  // Checkbox handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(paginatedOrders.map(order => order.id));
      setSelectedOrders(allIds);
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

  const isAllSelected = paginatedOrders.length > 0 && paginatedOrders.every(order => selectedOrders.has(order.id));
  const isSomeSelected = selectedOrders.size > 0;

  // Bulk Shipped action
  const handleBulkShipped = async () => {
    if (selectedOrders.size === 0) {
      toast({
        title: 'No orders selected',
        description: 'Please select orders to mark as shipped.',
        variant: 'destructive',
      });
      return;
    }

    setIsShipping(true);
    const today = getMalaysiaDate();

    try {
      // Update all selected orders - also set SEO to 'Shipped'
      const updatePromises = Array.from(selectedOrders).map(orderId =>
        supabase
          .from('customer_purchases')
          .update({
            delivery_status: 'Shipped',
            date_processed: today,
            seo: 'Shipped',
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId)
      );

      await Promise.all(updatePromises);

      toast({
        title: 'Orders Shipped',
        description: `${selectedOrders.size} order(s) have been marked as Shipped.`,
      });

      // Refresh data and clear selection
      await refreshData();
      setSelectedOrders(new Set());
    } catch (error) {
      console.error('Error updating orders:', error);
      toast({
        title: 'Error',
        description: 'Failed to update orders. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsShipping(false);
    }
  };

  // Bulk Print waybill action
  const handleBulkPrint = async () => {
    if (selectedOrders.size === 0) {
      toast({
        title: 'No orders selected',
        description: 'Please select orders to print waybills.',
        variant: 'destructive',
      });
      return;
    }

    const selectedOrdersList = paginatedOrders.filter(order => selectedOrders.has(order.id));

    // Separate Ninjavan orders and Shopee/Tiktok orders
    const ninjavanOrders = selectedOrdersList.filter(
      order => order.jenisPlatform !== 'Shopee' && order.jenisPlatform !== 'Tiktok' && order.noTracking
    );
    const marketplaceOrders = selectedOrdersList.filter(
      order => (order.jenisPlatform === 'Shopee' || order.jenisPlatform === 'Tiktok') && order.waybillUrl
    );

    if (ninjavanOrders.length === 0 && marketplaceOrders.length === 0) {
      toast({
        title: 'No waybills available',
        description: 'Selected orders do not have waybills to print.',
        variant: 'destructive',
      });
      return;
    }

    setIsPrinting(true);

    try {
      // Handle Ninjavan orders
      if (ninjavanOrders.length > 0) {
        const trackingNumbers = ninjavanOrders.map(order => order.noTracking).filter(Boolean);

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ninjavan-waybill`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ trackingNumbers }),
          }
        );

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/pdf')) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            toast({
              title: 'Ninjavan Waybill Generated',
              description: `Waybill for ${trackingNumbers.length} Ninjavan order(s) opened in new tab.`,
            });
          }
        } else {
          console.error('Failed to fetch Ninjavan waybills');
          toast({
            title: 'Warning',
            description: 'Failed to fetch some Ninjavan waybills.',
            variant: 'destructive',
          });
        }
      }

      // Handle Shopee/Tiktok orders
      if (marketplaceOrders.length > 0) {
        const waybillUrls = marketplaceOrders.map(order => order.waybillUrl).filter(Boolean);

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/merge-waybills`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ waybillUrls }),
          }
        );

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/pdf')) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            toast({
              title: 'Marketplace Waybill Generated',
              description: `Waybill for ${waybillUrls.length} Shopee/Tiktok order(s) opened in new tab.`,
            });
          }
        } else {
          console.error('Failed to fetch marketplace waybills');
          toast({
            title: 'Warning',
            description: 'Failed to fetch some Shopee/Tiktok waybills.',
            variant: 'destructive',
          });
        }
      }
    } catch (error: any) {
      console.error('Error fetching waybill:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate waybill. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsPrinting(false);
    }
  };

  // Reset page when filters change
  const handleFilterChange = () => {
    setCurrentPage(1);
    setSelectedOrders(new Set());
  };

  // Reset page when shipment filters change
  const handleShipmentFilterChange = () => {
    setShipmentCurrentPage(1);
    setSelectedShipmentOrders(new Set());
  };

  // Reset page when return filters change
  const handleReturnFilterChange = () => {
    setReturnCurrentPage(1);
    setSelectedReturnOrders(new Set());
  };

  // Reset page when pending tracking filters change
  const handlePendingTrackingFilterChange = () => {
    setPendingTrackingCurrentPage(1);
    setSelectedPendingTrackingOrders(new Set());
  };

  // Return checkbox handlers
  const handleReturnSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(paginatedReturnOrders.map(order => order.id));
      setSelectedReturnOrders(allIds);
    } else {
      setSelectedReturnOrders(new Set());
    }
  };

  const handleReturnSelectOrder = (orderId: string, checked: boolean) => {
    const newSelection = new Set(selectedReturnOrders);
    if (checked) {
      newSelection.add(orderId);
    } else {
      newSelection.delete(orderId);
    }
    setSelectedReturnOrders(newSelection);
  };

  const isReturnAllSelected = paginatedReturnOrders.length > 0 && paginatedReturnOrders.every(order => selectedReturnOrders.has(order.id));
  const isReturnSomeSelected = selectedReturnOrders.size > 0;

  // Bulk Print waybill action for Return tab
  const handleReturnBulkPrint = async () => {
    if (selectedReturnOrders.size === 0) {
      toast({
        title: 'No orders selected',
        description: 'Please select orders to print waybills.',
        variant: 'destructive',
      });
      return;
    }

    const selectedOrdersList = paginatedReturnOrders.filter(order => selectedReturnOrders.has(order.id));

    // Separate Ninjavan orders and Shopee/Tiktok orders
    const ninjavanOrders = selectedOrdersList.filter(
      order => order.jenisPlatform !== 'Shopee' && order.jenisPlatform !== 'Tiktok' && order.noTracking
    );
    const marketplaceOrders = selectedOrdersList.filter(
      order => (order.jenisPlatform === 'Shopee' || order.jenisPlatform === 'Tiktok') && order.waybillUrl
    );

    if (ninjavanOrders.length === 0 && marketplaceOrders.length === 0) {
      toast({
        title: 'No waybills available',
        description: 'Selected orders do not have waybills to print.',
        variant: 'destructive',
      });
      return;
    }

    setIsReturnPrinting(true);

    try {
      // Handle Ninjavan orders
      if (ninjavanOrders.length > 0) {
        const trackingNumbers = ninjavanOrders.map(order => order.noTracking).filter(Boolean);

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ninjavan-waybill`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ trackingNumbers }),
          }
        );

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/pdf')) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            toast({
              title: 'Ninjavan Waybill Generated',
              description: `Waybill for ${trackingNumbers.length} Ninjavan order(s) opened in new tab.`,
            });
          }
        } else {
          console.error('Failed to fetch Ninjavan waybills');
          toast({
            title: 'Warning',
            description: 'Failed to fetch some Ninjavan waybills.',
            variant: 'destructive',
          });
        }
      }

      // Handle Shopee/Tiktok orders
      if (marketplaceOrders.length > 0) {
        const waybillUrls = marketplaceOrders.map(order => order.waybillUrl).filter(Boolean);

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/merge-waybills`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ waybillUrls }),
          }
        );

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/pdf')) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            toast({
              title: 'Marketplace Waybill Generated',
              description: `Waybill for ${waybillUrls.length} Shopee/Tiktok order(s) opened in new tab.`,
            });
          }
        } else {
          console.error('Failed to fetch marketplace waybills');
          toast({
            title: 'Warning',
            description: 'Failed to fetch some Shopee/Tiktok waybills.',
            variant: 'destructive',
          });
        }
      }
    } catch (error: any) {
      console.error('Error fetching waybill:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate waybill. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsReturnPrinting(false);
    }
  };

  // Shipment checkbox handlers
  const handleShipmentSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(paginatedShipmentOrders.map(order => order.id));
      setSelectedShipmentOrders(allIds);
    } else {
      setSelectedShipmentOrders(new Set());
    }
  };

  const handleShipmentSelectOrder = (orderId: string, checked: boolean) => {
    const newSelection = new Set(selectedShipmentOrders);
    if (checked) {
      newSelection.add(orderId);
    } else {
      newSelection.delete(orderId);
    }
    setSelectedShipmentOrders(newSelection);
  };

  const isShipmentAllSelected = paginatedShipmentOrders.length > 0 && paginatedShipmentOrders.every(order => selectedShipmentOrders.has(order.id));
  const isShipmentSomeSelected = selectedShipmentOrders.size > 0;

  // Bulk Pending action - revert shipped orders back to pending
  const handleBulkPending = async () => {
    if (selectedShipmentOrders.size === 0) {
      toast({
        title: 'No orders selected',
        description: 'Please select orders to mark as pending.',
        variant: 'destructive',
      });
      return;
    }

    setIsPendingAction(true);

    try {
      // Update all selected orders - set date_processed to null, delivery_status to Pending, and SEO to null
      const updatePromises = Array.from(selectedShipmentOrders).map(orderId =>
        supabase
          .from('customer_purchases')
          .update({
            delivery_status: 'Pending',
            date_processed: null,
            seo: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId)
      );

      await Promise.all(updatePromises);

      toast({
        title: 'Orders Reverted',
        description: `${selectedShipmentOrders.size} order(s) have been reverted to Pending.`,
      });

      // Refresh data and clear selection
      await refreshData();
      setSelectedShipmentOrders(new Set());
    } catch (error) {
      console.error('Error updating orders:', error);
      toast({
        title: 'Error',
        description: 'Failed to update orders. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsPendingAction(false);
    }
  };

  // Bulk Print waybill action for Shipment tab
  const handleShipmentBulkPrint = async () => {
    if (selectedShipmentOrders.size === 0) {
      toast({
        title: 'No orders selected',
        description: 'Please select orders to print waybills.',
        variant: 'destructive',
      });
      return;
    }

    const selectedOrdersList = paginatedShipmentOrders.filter(order => selectedShipmentOrders.has(order.id));

    // Separate Ninjavan orders and Shopee/Tiktok orders
    const ninjavanOrders = selectedOrdersList.filter(
      order => order.jenisPlatform !== 'Shopee' && order.jenisPlatform !== 'Tiktok' && order.noTracking
    );
    const marketplaceOrders = selectedOrdersList.filter(
      order => (order.jenisPlatform === 'Shopee' || order.jenisPlatform === 'Tiktok') && order.waybillUrl
    );

    if (ninjavanOrders.length === 0 && marketplaceOrders.length === 0) {
      toast({
        title: 'No waybills available',
        description: 'Selected orders do not have waybills to print.',
        variant: 'destructive',
      });
      return;
    }

    setIsShipmentPrinting(true);

    try {
      // Handle Ninjavan orders
      if (ninjavanOrders.length > 0) {
        const trackingNumbers = ninjavanOrders.map(order => order.noTracking).filter(Boolean);

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ninjavan-waybill`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ trackingNumbers }),
          }
        );

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/pdf')) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            toast({
              title: 'Ninjavan Waybill Generated',
              description: `Waybill for ${trackingNumbers.length} Ninjavan order(s) opened in new tab.`,
            });
          }
        } else {
          console.error('Failed to fetch Ninjavan waybills');
          toast({
            title: 'Warning',
            description: 'Failed to fetch some Ninjavan waybills.',
            variant: 'destructive',
          });
        }
      }

      // Handle Shopee/Tiktok orders
      if (marketplaceOrders.length > 0) {
        const waybillUrls = marketplaceOrders.map(order => order.waybillUrl).filter(Boolean);

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/merge-waybills`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ waybillUrls }),
          }
        );

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/pdf')) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            toast({
              title: 'Marketplace Waybill Generated',
              description: `Waybill for ${waybillUrls.length} Shopee/Tiktok order(s) opened in new tab.`,
            });
          }
        } else {
          console.error('Failed to fetch marketplace waybills');
          toast({
            title: 'Warning',
            description: 'Failed to fetch some Shopee/Tiktok waybills.',
            variant: 'destructive',
          });
        }
      }
    } catch (error: any) {
      console.error('Error fetching waybill:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate waybill. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsShipmentPrinting(false);
    }
  };

  // Pending Tracking checkbox handlers
  const handlePendingTrackingSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(paginatedPendingTrackingOrders.map(order => order.id));
      setSelectedPendingTrackingOrders(allIds);
    } else {
      setSelectedPendingTrackingOrders(new Set());
    }
  };

  const handlePendingTrackingSelectOrder = (orderId: string, checked: boolean) => {
    const newSelection = new Set(selectedPendingTrackingOrders);
    if (checked) {
      newSelection.add(orderId);
    } else {
      newSelection.delete(orderId);
    }
    setSelectedPendingTrackingOrders(newSelection);
  };

  const isPendingTrackingAllSelected = paginatedPendingTrackingOrders.length > 0 && paginatedPendingTrackingOrders.every(order => selectedPendingTrackingOrders.has(order.id));
  const isPendingTrackingSomeSelected = selectedPendingTrackingOrders.size > 0;

  // Bulk Print waybill action for Pending Tracking tab
  const handlePendingTrackingBulkPrint = async () => {
    if (selectedPendingTrackingOrders.size === 0) {
      toast({
        title: 'No orders selected',
        description: 'Please select orders to print waybills.',
        variant: 'destructive',
      });
      return;
    }

    const selectedOrdersList = paginatedPendingTrackingOrders.filter(order => selectedPendingTrackingOrders.has(order.id));

    // Separate Ninjavan orders and Shopee/Tiktok orders
    const ninjavanOrders = selectedOrdersList.filter(
      order => order.jenisPlatform !== 'Shopee' && order.jenisPlatform !== 'Tiktok' && order.noTracking
    );
    const marketplaceOrders = selectedOrdersList.filter(
      order => (order.jenisPlatform === 'Shopee' || order.jenisPlatform === 'Tiktok') && order.waybillUrl
    );

    if (ninjavanOrders.length === 0 && marketplaceOrders.length === 0) {
      toast({
        title: 'No waybills available',
        description: 'Selected orders do not have waybills to print.',
        variant: 'destructive',
      });
      return;
    }

    setIsPendingTrackingPrinting(true);

    try {
      // Handle Ninjavan orders
      if (ninjavanOrders.length > 0) {
        const trackingNumbers = ninjavanOrders.map(order => order.noTracking).filter(Boolean);

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ninjavan-waybill`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ trackingNumbers }),
          }
        );

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/pdf')) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            toast({
              title: 'Ninjavan Waybill Generated',
              description: `Waybill for ${trackingNumbers.length} Ninjavan order(s) opened in new tab.`,
            });
          }
        } else {
          console.error('Failed to fetch Ninjavan waybills');
          toast({
            title: 'Warning',
            description: 'Failed to fetch some Ninjavan waybills.',
            variant: 'destructive',
          });
        }
      }

      // Handle Shopee/Tiktok orders
      if (marketplaceOrders.length > 0) {
        const waybillUrls = marketplaceOrders.map(order => order.waybillUrl).filter(Boolean);

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/merge-waybills`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ waybillUrls }),
          }
        );

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/pdf')) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            toast({
              title: 'Marketplace Waybill Generated',
              description: `Waybill for ${waybillUrls.length} Shopee/Tiktok order(s) opened in new tab.`,
            });
          }
        } else {
          console.error('Failed to fetch marketplace waybills');
          toast({
            title: 'Warning',
            description: 'Failed to fetch some Shopee/Tiktok waybills.',
            variant: 'destructive',
          });
        }
      }
    } catch (error: any) {
      console.error('Error fetching waybill:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate waybill. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsPendingTrackingPrinting(false);
    }
  };

  // Bulk update for Pending Tracking - update by tracking numbers
  const handleBulkTrackingUpdate = async () => {
    if (!bulkDate) {
      toast({
        title: 'Date Required',
        description: 'Please select a date.',
        variant: 'destructive',
      });
      return;
    }

    if (!bulkTrackingList.trim()) {
      toast({
        title: 'Tracking Numbers Required',
        description: 'Please enter tracking numbers.',
        variant: 'destructive',
      });
      return;
    }

    // Parse tracking numbers (split by newlines, commas, or spaces)
    const trackingNumbers = bulkTrackingList
      .split(/[\n,\s]+/)
      .map(t => t.trim())
      .filter(Boolean);

    if (trackingNumbers.length === 0) {
      toast({
        title: 'No Tracking Numbers',
        description: 'Please enter valid tracking numbers.',
        variant: 'destructive',
      });
      return;
    }

    setIsBulkUpdating(true);

    try {
      // Find orders by tracking numbers
      const ordersToUpdate = orders.filter(order =>
        order.noTracking && trackingNumbers.includes(order.noTracking)
      );

      if (ordersToUpdate.length === 0) {
        toast({
          title: 'No Matching Orders',
          description: 'No orders found with the provided tracking numbers.',
          variant: 'destructive',
        });
        setIsBulkUpdating(false);
        return;
      }

      let updateData: any;
      if (bulkStatus === 'Success') {
        // Success: SEO='Successfull Delivery', tarikh_bayaran=date, delivery_status stays 'Shipped'
        updateData = {
          seo: 'Successfull Delivery',
          tarikh_bayaran: bulkDate,
          delivery_status: 'Shipped',
          updated_at: new Date().toISOString(),
        };
      } else {
        // Return: SEO='Return', date_return=date, delivery_status='Return'
        updateData = {
          seo: 'Return',
          date_return: bulkDate,
          delivery_status: 'Return',
          updated_at: new Date().toISOString(),
        };
      }

      const updatePromises = ordersToUpdate.map(order =>
        supabase
          .from('customer_purchases')
          .update(updateData)
          .eq('id', order.id)
      );

      await Promise.all(updatePromises);

      toast({
        title: 'Orders Updated',
        description: `${ordersToUpdate.length} order(s) have been updated to ${bulkStatus}.`,
      });

      // Clear form and refresh data
      setBulkTrackingList('');
      setBulkDate('');
      await refreshData();
    } catch (error) {
      console.error('Error updating orders:', error);
      toast({
        title: 'Error',
        description: 'Failed to update orders. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Pending':
        return <Clock className="w-5 h-5 text-warning" />;
      case 'Processing':
        return <Package className="w-5 h-5 text-info" />;
      case 'Shipped':
        return <Truck className="w-5 h-5 text-primary" />;
      case 'Success':
        return <CheckCircle2 className="w-5 h-5 text-success" />;
      case 'Failed':
        return <XCircle className="w-5 h-5 text-destructive" />;
      default:
        return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Tabs */}
      <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
        {/* Order Tab - duplicate of Shipment */}
        <TabsContent value="order" className="space-y-6">
          {/* Section Title */}
          <h2 className="text-xl font-semibold text-foreground">Order Management</h2>

          {/* Order Stats - 3 boxes for Pending orders */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="stat-card flex items-center gap-3">
              <Clock className="w-5 h-5 text-warning" />
              <div>
                <p className="text-2xl font-bold text-foreground">{orderCounts.totalPending}</p>
                <p className="text-sm text-muted-foreground">Total Order Pending</p>
              </div>
            </div>
            <div className="stat-card flex items-center gap-3">
              <Package className="w-5 h-5 text-success" />
              <div>
                <p className="text-2xl font-bold text-foreground">{orderCounts.cashPending}</p>
                <p className="text-sm text-muted-foreground">Total Order Cash Pending</p>
              </div>
            </div>
            <div className="stat-card flex items-center gap-3">
              <Truck className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{orderCounts.codPending}</p>
                <p className="text-sm text-muted-foreground">Total Order COD Pending</p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search... (use + to combine, e.g. CASH+Facebook)"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); handleFilterChange(); }}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={orderStartDate}
                  onChange={(e) => { setOrderStartDate(e.target.value); handleFilterChange(); }}
                  className="w-40"
                  placeholder="Start Date"
                />
                <Input
                  type="date"
                  value={orderEndDate}
                  onChange={(e) => { setOrderEndDate(e.target.value); handleFilterChange(); }}
                  className="w-40"
                  placeholder="End Date"
                />
              </div>
            </div>

            {/* Additional Filters Row */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Platform Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Platform:</span>
                <Select value={platformFilter} onValueChange={(value) => { setPlatformFilter(value); handleFilterChange(); }}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cara Bayaran Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Cara Bayaran:</span>
                <Select value={caraBayaranFilter} onValueChange={(value) => { setCaraBayaranFilter(value); handleFilterChange(); }}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {CARA_BAYARAN_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Page Size Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Show:</span>
                <Select value={pageSize.toString()} onValueChange={(value) => { setPageSize(Number(value)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">entries</span>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleBulkPrint}
                  disabled={!isSomeSelected || isPrinting}
                  className="gap-2"
                >
                  {isPrinting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                  Print ({selectedOrders.size})
                </Button>
                <Button
                  onClick={handleBulkShipped}
                  disabled={!isSomeSelected || isShipping}
                  className="gap-2"
                >
                  {isShipping ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Shipped ({selectedOrders.size})
                </Button>
              </div>
            </div>
          </div>

          {/* Order Table */}
          <div className="form-section overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </th>
                    <th>No</th>
                    <th>Tarikh Order</th>
                    <th>ID Staff</th>
                    <th>Nama Pelanggan</th>
                    <th>Phone</th>
                    <th>Produk</th>
                    <th>Unit</th>
                    <th>Total Sales</th>
                    <th>Cara Bayaran</th>
                    <th>Delivery Status</th>
                    <th>Tracking Number</th>
                    <th>Jenis Platform</th>
                    <th>Jenis Customer</th>
                    <th>Negeri</th>
                    <th>Alamat</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.length > 0 ? (
                    paginatedOrders.map((order, index) => (
                      <tr key={order.id}>
                        <td>
                          <Checkbox
                            checked={selectedOrders.has(order.id)}
                            onCheckedChange={(checked) => handleSelectOrder(order.id, checked as boolean)}
                            aria-label={`Select order ${index + 1}`}
                          />
                        </td>
                        <td>{(currentPage - 1) * pageSize + index + 1}</td>
                        <td>{order.dateOrder || '-'}</td>
                        <td>{order.marketerIdStaff || '-'}</td>
                        <td>{order.marketerName || '-'}</td>
                        <td>{order.noPhone || '-'}</td>
                        <td>
                          {(() => {
                            const bundle = bundles.find(b => b.name === order.produk);
                            if (bundle && bundle.productName) {
                              return `${bundle.name} + ${bundle.productName}`;
                            }
                            return order.produk || '-';
                          })()}
                        </td>
                        <td>{order.kuantiti || 1}</td>
                        <td>RM {order.hargaJualanSebenar?.toFixed(2) || '0.00'}</td>
                        <td>
                          {order.caraBayaran === 'CASH' ? (
                            <span className="text-blue-600 dark:text-blue-400 font-medium">
                              CASH
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{order.caraBayaran || '-'}</span>
                          )}
                        </td>
                        <td>
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-warning/20 text-warning">
                            {order.deliveryStatus || 'Pending'}
                          </span>
                        </td>
                        <td>{order.noTracking || '-'}</td>
                        <td>{order.jenisPlatform || '-'}</td>
                        <td>{order.jenisCustomer || '-'}</td>
                        <td>{order.negeri || '-'}</td>
                        <td>
                          <div className="max-w-xs">
                            <p className="text-sm truncate">{order.alamat}</p>
                            <p className="text-xs text-muted-foreground">
                              {order.poskod} {order.bandar}
                            </p>
                          </div>
                        </td>
                        <td>
                          <Button
                            size="sm"
                            onClick={() => handleProcessOrder(order.id)}
                          >
                            Process
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={17}
                        className="text-center py-12 text-muted-foreground"
                      >
                        No pending orders found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, pendingOrders.length)} of {pendingOrders.length} entries
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className="w-8 h-8 p-0"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Shipment Tab - Shipped orders */}
        <TabsContent value="shipment" className="space-y-6">
          {/* Section Title */}
          <h2 className="text-xl font-semibold text-foreground">Processed Management</h2>

          {/* Shipment Stats - 3 boxes for Shipped orders */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="stat-card flex items-center gap-3">
              <Truck className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{shipmentCounts.totalShipped}</p>
                <p className="text-sm text-muted-foreground">Total Order Shipped</p>
              </div>
            </div>
            <div className="stat-card flex items-center gap-3">
              <Package className="w-5 h-5 text-success" />
              <div>
                <p className="text-2xl font-bold text-foreground">{shipmentCounts.cashShipped}</p>
                <p className="text-sm text-muted-foreground">Total Order Cash Shipped</p>
              </div>
            </div>
            <div className="stat-card flex items-center gap-3">
              <Truck className="w-5 h-5 text-info" />
              <div>
                <p className="text-2xl font-bold text-foreground">{shipmentCounts.codShipped}</p>
                <p className="text-sm text-muted-foreground">Total Order COD Shipped</p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search... (use + to combine, e.g. CASH+Facebook)"
                  value={shipmentSearch}
                  onChange={(e) => { setShipmentSearch(e.target.value); handleShipmentFilterChange(); }}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={shipmentStartDate}
                  onChange={(e) => { setShipmentStartDate(e.target.value); handleShipmentFilterChange(); }}
                  className="w-40"
                  placeholder="Start Date"
                />
                <Input
                  type="date"
                  value={shipmentEndDate}
                  onChange={(e) => { setShipmentEndDate(e.target.value); handleShipmentFilterChange(); }}
                  className="w-40"
                  placeholder="End Date"
                />
              </div>
            </div>

            {/* Additional Filters Row */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Platform Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Platform:</span>
                <Select value={shipmentPlatformFilter} onValueChange={(value) => { setShipmentPlatformFilter(value); handleShipmentFilterChange(); }}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cara Bayaran Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Cara Bayaran:</span>
                <Select value={shipmentCaraBayaranFilter} onValueChange={(value) => { setShipmentCaraBayaranFilter(value); handleShipmentFilterChange(); }}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {CARA_BAYARAN_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Page Size Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Show:</span>
                <Select value={shipmentPageSize.toString()} onValueChange={(value) => { setShipmentPageSize(Number(value)); setShipmentCurrentPage(1); }}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">entries</span>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleShipmentBulkPrint}
                  disabled={!isShipmentSomeSelected || isShipmentPrinting}
                  className="gap-2"
                >
                  {isShipmentPrinting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                  Print ({selectedShipmentOrders.size})
                </Button>
                <Button
                  variant="outline"
                  onClick={handleBulkPending}
                  disabled={!isShipmentSomeSelected || isPendingAction}
                  className="gap-2"
                >
                  {isPendingAction ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Clock className="w-4 h-4" />
                  )}
                  Pending ({selectedShipmentOrders.size})
                </Button>
              </div>
            </div>
          </div>

          {/* Shipment Table */}
          <div className="form-section overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <Checkbox
                        checked={isShipmentAllSelected}
                        onCheckedChange={handleShipmentSelectAll}
                        aria-label="Select all"
                      />
                    </th>
                    <th>No</th>
                    <th>Tarikh Process</th>
                    <th>Tarikh Order</th>
                    <th>ID Staff</th>
                    <th>Nama Pelanggan</th>
                    <th>Phone</th>
                    <th>Produk</th>
                    <th>Unit</th>
                    <th>Total Sales</th>
                    <th>Cara Bayaran</th>
                    <th>Delivery Status</th>
                    <th>Tracking Number</th>
                    <th>Jenis Platform</th>
                    <th>Jenis Customer</th>
                    <th>Negeri</th>
                    <th>Alamat</th>
                    <th>SEO</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedShipmentOrders.length > 0 ? (
                    paginatedShipmentOrders.map((order, index) => (
                      <tr key={order.id}>
                        <td>
                          <Checkbox
                            checked={selectedShipmentOrders.has(order.id)}
                            onCheckedChange={(checked) => handleShipmentSelectOrder(order.id, checked as boolean)}
                            aria-label={`Select order ${index + 1}`}
                          />
                        </td>
                        <td>{(shipmentCurrentPage - 1) * shipmentPageSize + index + 1}</td>
                        <td>{order.dateProcessed || '-'}</td>
                        <td>{order.dateOrder || '-'}</td>
                        <td>{order.marketerIdStaff || '-'}</td>
                        <td>{order.marketerName || '-'}</td>
                        <td>{order.noPhone || '-'}</td>
                        <td>
                          {(() => {
                            const bundle = bundles.find(b => b.name === order.produk);
                            if (bundle && bundle.productName) {
                              return `${bundle.name} + ${bundle.productName}`;
                            }
                            return order.produk || '-';
                          })()}
                        </td>
                        <td>{order.kuantiti || 1}</td>
                        <td>RM {order.hargaJualanSebenar?.toFixed(2) || '0.00'}</td>
                        <td>
                          {order.caraBayaran === 'CASH' ? (
                            <span className="text-blue-600 dark:text-blue-400 font-medium">
                              CASH
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{order.caraBayaran || '-'}</span>
                          )}
                        </td>
                        <td>
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary">
                            {order.deliveryStatus || 'Shipped'}
                          </span>
                        </td>
                        <td>{order.noTracking || '-'}</td>
                        <td>{order.jenisPlatform || '-'}</td>
                        <td>{order.jenisCustomer || '-'}</td>
                        <td>{order.negeri || '-'}</td>
                        <td>
                          <div className="max-w-xs">
                            <p className="text-sm truncate">{order.alamat}</p>
                            <p className="text-xs text-muted-foreground">
                              {order.poskod} {order.bandar}
                            </p>
                          </div>
                        </td>
                        <td>
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-warning/20 text-warning">
                            {order.seo || '-'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={18}
                        className="text-center py-12 text-muted-foreground"
                      >
                        No shipped orders found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {shipmentTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  Showing {(shipmentCurrentPage - 1) * shipmentPageSize + 1} to {Math.min(shipmentCurrentPage * shipmentPageSize, shippedOrders.length)} of {shippedOrders.length} entries
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShipmentCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={shipmentCurrentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, shipmentTotalPages) }, (_, i) => {
                      let pageNum;
                      if (shipmentTotalPages <= 5) {
                        pageNum = i + 1;
                      } else if (shipmentCurrentPage <= 3) {
                        pageNum = i + 1;
                      } else if (shipmentCurrentPage >= shipmentTotalPages - 2) {
                        pageNum = shipmentTotalPages - 4 + i;
                      } else {
                        pageNum = shipmentCurrentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={shipmentCurrentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setShipmentCurrentPage(pageNum)}
                          className="w-8 h-8 p-0"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShipmentCurrentPage(prev => Math.min(shipmentTotalPages, prev + 1))}
                    disabled={shipmentCurrentPage === shipmentTotalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Return Tab - Return orders */}
        <TabsContent value="return" className="space-y-6">
          {/* Section Title */}
          <h2 className="text-xl font-semibold text-foreground">Return Management</h2>

          {/* Return Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="stat-card flex items-center gap-3">
              <RotateCcw className="w-5 h-5 text-destructive" />
              <div>
                <p className="text-2xl font-bold text-foreground">{returnCounts.totalReturn}</p>
                <p className="text-sm text-muted-foreground">Total Return</p>
              </div>
            </div>
            <div className="stat-card flex items-center gap-3">
              <Package className="w-5 h-5 text-success" />
              <div>
                <p className="text-2xl font-bold text-foreground">{returnCounts.cashReturn}</p>
                <p className="text-sm text-muted-foreground">Total Cash Return</p>
              </div>
            </div>
            <div className="stat-card flex items-center gap-3">
              <Truck className="w-5 h-5 text-info" />
              <div>
                <p className="text-2xl font-bold text-foreground">{returnCounts.codReturn}</p>
                <p className="text-sm text-muted-foreground">Total COD Return</p>
              </div>
            </div>
            <div className="stat-card flex items-center gap-3">
              <Wallet className="w-5 h-5 text-warning" />
              <div>
                <p className="text-2xl font-bold text-foreground">RM {returnCounts.totalSalesReturn.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <p className="text-sm text-muted-foreground">Total Sales Return</p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search... (use + to combine, e.g. CASH+Facebook)"
                  value={returnSearch}
                  onChange={(e) => { setReturnSearch(e.target.value); handleReturnFilterChange(); }}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={returnStartDate}
                  onChange={(e) => { setReturnStartDate(e.target.value); handleReturnFilterChange(); }}
                  className="w-40"
                  placeholder="Start Date"
                />
                <Input
                  type="date"
                  value={returnEndDate}
                  onChange={(e) => { setReturnEndDate(e.target.value); handleReturnFilterChange(); }}
                  className="w-40"
                  placeholder="End Date"
                />
              </div>
            </div>

            {/* Additional Filters Row */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Platform Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Platform:</span>
                <Select value={returnPlatformFilter} onValueChange={(value) => { setReturnPlatformFilter(value); handleReturnFilterChange(); }}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cara Bayaran Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Cara Bayaran:</span>
                <Select value={returnCaraBayaranFilter} onValueChange={(value) => { setReturnCaraBayaranFilter(value); handleReturnFilterChange(); }}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {CARA_BAYARAN_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Page Size Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Show:</span>
                <Select value={returnPageSize.toString()} onValueChange={(value) => { setReturnPageSize(Number(value)); setReturnCurrentPage(1); }}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">entries</span>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleReturnBulkPrint}
                  disabled={!isReturnSomeSelected || isReturnPrinting}
                  className="gap-2"
                >
                  {isReturnPrinting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                  Print ({selectedReturnOrders.size})
                </Button>
              </div>
            </div>
          </div>

          {/* Return Table */}
          <div className="form-section overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <Checkbox
                        checked={isReturnAllSelected}
                        onCheckedChange={handleReturnSelectAll}
                        aria-label="Select all"
                      />
                    </th>
                    <th>No</th>
                    <th>Tarikh Return</th>
                    <th>Tarikh Order</th>
                    <th>ID Staff</th>
                    <th>Nama Pelanggan</th>
                    <th>Phone</th>
                    <th>Produk</th>
                    <th>Unit</th>
                    <th>Total Sales</th>
                    <th>Cara Bayaran</th>
                    <th>Delivery Status</th>
                    <th>Tracking Number</th>
                    <th>Jenis Platform</th>
                    <th>Jenis Customer</th>
                    <th>Negeri</th>
                    <th>Alamat</th>
                    <th>SEO</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedReturnOrders.length > 0 ? (
                    paginatedReturnOrders.map((order, index) => (
                      <tr key={order.id}>
                        <td>
                          <Checkbox
                            checked={selectedReturnOrders.has(order.id)}
                            onCheckedChange={(checked) => handleReturnSelectOrder(order.id, checked as boolean)}
                            aria-label={`Select order ${index + 1}`}
                          />
                        </td>
                        <td>{(returnCurrentPage - 1) * returnPageSize + index + 1}</td>
                        <td>{order.dateReturn || '-'}</td>
                        <td>{order.dateOrder || '-'}</td>
                        <td>{order.marketerIdStaff || '-'}</td>
                        <td>{order.marketerName || '-'}</td>
                        <td>{order.noPhone || '-'}</td>
                        <td>
                          {(() => {
                            const bundle = bundles.find(b => b.name === order.produk);
                            if (bundle && bundle.productName) {
                              return `${bundle.name} + ${bundle.productName}`;
                            }
                            return order.produk || '-';
                          })()}
                        </td>
                        <td>{order.kuantiti || 1}</td>
                        <td>RM {order.hargaJualanSebenar?.toFixed(2) || '0.00'}</td>
                        <td>
                          {order.caraBayaran === 'CASH' ? (
                            <span className="text-blue-600 dark:text-blue-400 font-medium">
                              CASH
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{order.caraBayaran || '-'}</span>
                          )}
                        </td>
                        <td>
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-destructive/20 text-destructive">
                            {order.deliveryStatus || 'Return'}
                          </span>
                        </td>
                        <td>{order.noTracking || '-'}</td>
                        <td>{order.jenisPlatform || '-'}</td>
                        <td>{order.jenisCustomer || '-'}</td>
                        <td>{order.negeri || '-'}</td>
                        <td>
                          <div className="max-w-xs">
                            <p className="text-sm truncate">{order.alamat}</p>
                            <p className="text-xs text-muted-foreground">
                              {order.poskod} {order.bandar}
                            </p>
                          </div>
                        </td>
                        <td>
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-destructive/20 text-destructive">
                            {order.seo || '-'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={18}
                        className="text-center py-12 text-muted-foreground"
                      >
                        No return orders found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {returnTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  Showing {(returnCurrentPage - 1) * returnPageSize + 1} to {Math.min(returnCurrentPage * returnPageSize, returnOrders.length)} of {returnOrders.length} entries
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReturnCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={returnCurrentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, returnTotalPages) }, (_, i) => {
                      let pageNum;
                      if (returnTotalPages <= 5) {
                        pageNum = i + 1;
                      } else if (returnCurrentPage <= 3) {
                        pageNum = i + 1;
                      } else if (returnCurrentPage >= returnTotalPages - 2) {
                        pageNum = returnTotalPages - 4 + i;
                      } else {
                        pageNum = returnCurrentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={returnCurrentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setReturnCurrentPage(pageNum)}
                          className="w-8 h-8 p-0"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReturnCurrentPage(prev => Math.min(returnTotalPages, prev + 1))}
                    disabled={returnCurrentPage === returnTotalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Pending Tracking Tab */}
        <TabsContent value="pending-tracking" className="space-y-6">
          {/* Section Title */}
          <h2 className="text-xl font-semibold text-foreground">Pending Tracking Management</h2>

          {/* Pending Tracking Stats (COD only) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="stat-card flex items-center gap-3">
              <ClipboardList className="w-5 h-5 text-warning" />
              <div>
                <p className="text-2xl font-bold text-foreground">{pendingTrackingCounts.totalOrder}</p>
                <p className="text-sm text-muted-foreground">Total Order</p>
              </div>
            </div>
            <div className="stat-card flex items-center gap-3">
              <Truck className="w-5 h-5 text-info" />
              <div>
                <p className="text-2xl font-bold text-foreground">{pendingTrackingCounts.codOrder}</p>
                <p className="text-sm text-muted-foreground">Total Order COD</p>
              </div>
            </div>
            <div className="stat-card flex items-center gap-3">
              <Package className="w-5 h-5 text-success" />
              <div>
                <p className="text-2xl font-bold text-foreground">RM {pendingTrackingCounts.totalSales.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">Total Sales</p>
              </div>
            </div>
          </div>

          {/* Bulk Update Form */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Bulk Update Tracking</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Status</label>
                <Select value={bulkStatus} onValueChange={(value: 'Success' | 'Return') => setBulkStatus(value)}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Success">Success</SelectItem>
                    <SelectItem value="Return">Return</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Date</label>
                <Input
                  type="date"
                  value={bulkDate}
                  onChange={(e) => setBulkDate(e.target.value)}
                  className="bg-background"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-foreground mb-1.5">Tracking Numbers</label>
                <Textarea
                  placeholder="Paste tracking numbers here (one per line, comma, or space separated)"
                  value={bulkTrackingList}
                  onChange={(e) => setBulkTrackingList(e.target.value)}
                  className="bg-background resize-none"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button
                onClick={handleBulkTrackingUpdate}
                disabled={isBulkUpdating}
                className="gap-2"
              >
                {isBulkUpdating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search... (use + to combine, e.g. CASH+Facebook)"
                  value={pendingTrackingSearch}
                  onChange={(e) => { setPendingTrackingSearch(e.target.value); handlePendingTrackingFilterChange(); }}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={pendingTrackingStartDate}
                  onChange={(e) => { setPendingTrackingStartDate(e.target.value); handlePendingTrackingFilterChange(); }}
                  className="w-40"
                  placeholder="Start Date"
                />
                <Input
                  type="date"
                  value={pendingTrackingEndDate}
                  onChange={(e) => { setPendingTrackingEndDate(e.target.value); handlePendingTrackingFilterChange(); }}
                  className="w-40"
                  placeholder="End Date"
                />
              </div>
            </div>

            {/* Additional Filters Row */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Platform Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Platform:</span>
                <Select value={pendingTrackingPlatformFilter} onValueChange={(value) => { setPendingTrackingPlatformFilter(value); handlePendingTrackingFilterChange(); }}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cara Bayaran Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Cara Bayaran:</span>
                <Select value={pendingTrackingCaraBayaranFilter} onValueChange={(value) => { setPendingTrackingCaraBayaranFilter(value); handlePendingTrackingFilterChange(); }}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {CARA_BAYARAN_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Page Size Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Show:</span>
                <Select value={pendingTrackingPageSize.toString()} onValueChange={(value) => { setPendingTrackingPageSize(Number(value)); setPendingTrackingCurrentPage(1); }}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">entries</span>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handlePendingTrackingBulkPrint}
                  disabled={!isPendingTrackingSomeSelected || isPendingTrackingPrinting}
                  className="gap-2"
                >
                  {isPendingTrackingPrinting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                  Print ({selectedPendingTrackingOrders.size})
                </Button>
              </div>
            </div>
          </div>

          {/* Pending Tracking Table */}
          <div className="form-section overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <Checkbox
                        checked={isPendingTrackingAllSelected}
                        onCheckedChange={handlePendingTrackingSelectAll}
                        aria-label="Select all"
                      />
                    </th>
                    <th>No</th>
                    <th>Tarikh Order</th>
                    <th>ID Staff</th>
                    <th>Nama Pelanggan</th>
                    <th>Phone</th>
                    <th>Produk</th>
                    <th>Unit</th>
                    <th>Total Sales</th>
                    <th>Cara Bayaran</th>
                    <th>Delivery Status</th>
                    <th>SEO</th>
                    <th>Tracking Number</th>
                    <th>Jenis Platform</th>
                    <th>Jenis Customer</th>
                    <th>Negeri</th>
                    <th>Alamat</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPendingTrackingOrders.length > 0 ? (
                    paginatedPendingTrackingOrders.map((order, index) => (
                      <tr key={order.id}>
                        <td>
                          <Checkbox
                            checked={selectedPendingTrackingOrders.has(order.id)}
                            onCheckedChange={(checked) => handlePendingTrackingSelectOrder(order.id, checked as boolean)}
                            aria-label={`Select order ${index + 1}`}
                          />
                        </td>
                        <td>{(pendingTrackingCurrentPage - 1) * pendingTrackingPageSize + index + 1}</td>
                        <td>{order.dateOrder || '-'}</td>
                        <td>{order.marketerIdStaff || '-'}</td>
                        <td>{order.marketerName || '-'}</td>
                        <td>{order.noPhone || '-'}</td>
                        <td>
                          {(() => {
                            const bundle = bundles.find(b => b.name === order.produk);
                            if (bundle && bundle.productName) {
                              return `${bundle.name} + ${bundle.productName}`;
                            }
                            return order.produk || '-';
                          })()}
                        </td>
                        <td>{order.kuantiti || 1}</td>
                        <td>RM {order.hargaJualanSebenar?.toFixed(2) || '0.00'}</td>
                        <td>
                          {order.caraBayaran === 'CASH' ? (
                            <span className="text-blue-600 dark:text-blue-400 font-medium">
                              CASH
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{order.caraBayaran || '-'}</span>
                          )}
                        </td>
                        <td>
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary">
                            {order.deliveryStatus || 'Shipped'}
                          </span>
                        </td>
                        <td>
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-warning/20 text-warning">
                            {order.seo || '-'}
                          </span>
                        </td>
                        <td>{order.noTracking || '-'}</td>
                        <td>{order.jenisPlatform || '-'}</td>
                        <td>{order.jenisCustomer || '-'}</td>
                        <td>{order.negeri || '-'}</td>
                        <td>
                          <div className="max-w-xs">
                            <p className="text-sm truncate">{order.alamat}</p>
                            <p className="text-xs text-muted-foreground">
                              {order.poskod} {order.bandar}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={17}
                        className="text-center py-12 text-muted-foreground"
                      >
                        No pending tracking orders found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pendingTrackingTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  Showing {(pendingTrackingCurrentPage - 1) * pendingTrackingPageSize + 1} to {Math.min(pendingTrackingCurrentPage * pendingTrackingPageSize, pendingTrackingOrders.length)} of {pendingTrackingOrders.length} entries
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPendingTrackingCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={pendingTrackingCurrentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, pendingTrackingTotalPages) }, (_, i) => {
                      let pageNum;
                      if (pendingTrackingTotalPages <= 5) {
                        pageNum = i + 1;
                      } else if (pendingTrackingCurrentPage <= 3) {
                        pageNum = i + 1;
                      } else if (pendingTrackingCurrentPage >= pendingTrackingTotalPages - 2) {
                        pageNum = pendingTrackingTotalPages - 4 + i;
                      } else {
                        pageNum = pendingTrackingCurrentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={pendingTrackingCurrentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setPendingTrackingCurrentPage(pageNum)}
                          className="w-8 h-8 p-0"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPendingTrackingCurrentPage(prev => Math.min(pendingTrackingTotalPages, prev + 1))}
                    disabled={pendingTrackingCurrentPage === pendingTrackingTotalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="stock-in" className="mt-6">
          <StockInTab />
        </TabsContent>

        <TabsContent value="stock-out" className="mt-6">
          <StockOutTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Logistics;
