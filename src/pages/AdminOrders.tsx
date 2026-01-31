import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search, Download, Users, DollarSign, Package,
  Truck, RotateCw, Clock, Calendar, RefreshCw, Loader2
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Order {
  id: string;
  idSale: string;
  marketerName: string;
  noPhone: string;
  alamat: string;
  poskod: string;
  negeri: string;
  produk: string;
  kurier: string;
  caraBayaran: string;
  noTracking: string;
  deliveryStatus: string;
  hargaJualanSebenar: number;
  jenisPlatform: string;
  jenisCustomer: string;
  dateOrder: string;
  dateProcessed: string;
  marketerIdStaff: string;
  seo: string | null;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DELIVERY_STATUS_OPTIONS = ["All", "Pending", "Shipped", "Remaining", "Return", "Success", "Failed"];
const COLLECTION_STATUS_OPTIONS = ["All", "null", "Pending", "Success", "Return"];
const CARA_BAYARAN_OPTIONS = ['All', 'Ninjavan COD', 'Ninjavan CASH', 'Poslaju COD', 'Poslaju CASH', 'PICKUP'];

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

const AdminOrders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaDate());
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState("All");
  const [collectionFilter, setCollectionFilter] = useState("All");
  const [caraBayaranFilter, setCaraBayaranFilter] = useState("All");

  // Fetch all orders
  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_purchases')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedOrders: Order[] = (data || []).map((d: any) => ({
        id: d.id,
        idSale: d.id_sale || '',
        marketerName: d.marketer_name || '',
        noPhone: d.no_phone || '',
        alamat: d.alamat || '',
        poskod: d.poskod || '',
        negeri: d.negeri || '',
        produk: d.produk || '',
        kurier: d.kurier || '',
        caraBayaran: d.cara_bayaran || '',
        noTracking: d.no_tracking || '',
        deliveryStatus: d.delivery_status || 'Pending',
        hargaJualanSebenar: d.harga_jualan_sebenar || 0,
        jenisPlatform: d.jenis_platform || '',
        jenisCustomer: d.jenis_customer || '',
        dateOrder: d.date_order || d.tarikh_tempahan || '',
        dateProcessed: d.date_processed || '',
        marketerIdStaff: d.marketer_id_staff || '',
        seo: d.seo || null,
      }));

      setOrders(mappedOrders);
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Search filter
      const searchLower = search.toLowerCase();
      const matchesSearch = !search ||
        (order.marketerName && order.marketerName.toLowerCase().includes(searchLower)) ||
        (order.noPhone && order.noPhone.toLowerCase().includes(searchLower)) ||
        (order.idSale && order.idSale.toLowerCase().includes(searchLower)) ||
        (order.noTracking && order.noTracking.toLowerCase().includes(searchLower)) ||
        (order.produk && order.produk.toLowerCase().includes(searchLower)) ||
        (order.marketerIdStaff && order.marketerIdStaff.toLowerCase().includes(searchLower));

      // Date filter
      const orderDate = order.dateOrder || '';
      const matchesDate = (!startDate || orderDate >= startDate) && (!endDate || orderDate <= endDate);

      // Delivery status filter
      const matchesDeliveryStatus = deliveryStatusFilter === "All" || order.deliveryStatus === deliveryStatusFilter;

      // Collection status filter
      const orderCollectionStatus = getCollectionStatus(order.deliveryStatus, order.seo);
      const matchesCollection = collectionFilter === "All" || orderCollectionStatus === collectionFilter;

      // Cara Bayaran filter
      const matchesCaraBayaran = caraBayaranFilter === 'All' || order.kurier === caraBayaranFilter;

      return matchesSearch && matchesDate && matchesDeliveryStatus && matchesCollection && matchesCaraBayaran;
    });
  }, [orders, search, startDate, endDate, deliveryStatusFilter, collectionFilter, caraBayaranFilter]);

  // Paginated orders
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredOrders.slice(startIndex, startIndex + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredOrders.length / pageSize);

  // Statistics
  const stats = useMemo(() => {
    const totalCash = filteredOrders.filter(o => o.kurier?.includes('CASH')).reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const totalCOD = filteredOrders.filter(o => o.kurier?.includes('COD')).reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const totalSales = totalCash + totalCOD;
    return { totalOrders: filteredOrders.length, totalCash, totalCOD, totalSales };
  }, [filteredOrders]);

  // Export CSV
  const exportCSV = () => {
    const headers = ['No', 'Id Sales', 'Marketer', 'Tarikh Order', 'Tarikh Process', 'Nama Pelanggan', 'Phone', 'Produk', 'Tracking No', 'Total Sales', 'Jenis Platform', 'Jenis Customer', 'Negeri', 'Alamat', 'Cara Bayaran', 'Delivery Status'];
    const rows = filteredOrders.map((order, idx) => [
      idx + 1,
      order.idSale || '-',
      order.marketerIdStaff || '-',
      order.dateOrder,
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
    a.download = `admin_orders_${startDate}_to_${endDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">All Orders</h1>
          <p className="text-muted-foreground mt-1">View all orders from all marketers</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchOrders} variant="outline" size="sm" disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={exportCSV} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Orders</p>
              <p className="text-xl font-bold">{stats.totalOrders}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Sales</p>
              <p className="text-xl font-bold">RM {stats.totalSales.toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center">
              <Truck className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Online Payment</p>
              <p className="text-xl font-bold">RM {stats.totalCash.toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500/10 rounded-full flex items-center justify-center">
              <Clock className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">COD</p>
              <p className="text-xl font-bold">RM {stats.totalCOD.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="form-section">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, tracking, marketer..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">to</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <Select value={deliveryStatusFilter} onValueChange={(v) => { setDeliveryStatusFilter(v); setCurrentPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="Delivery Status" />
            </SelectTrigger>
            <SelectContent>
              {DELIVERY_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={caraBayaranFilter} onValueChange={(v) => { setCaraBayaranFilter(v); setCurrentPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="Cara Bayaran" />
            </SelectTrigger>
            <SelectContent>
              {CARA_BAYARAN_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="data-table-container">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">No</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Id Sale</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Marketer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Tarikh Order</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Nama Pelanggan</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">No Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Produk</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Tracking No</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Total Sales</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Cara Bayaran</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Delivery Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Platform</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Jenis Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Negeri</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-8 text-center text-muted-foreground">
                      No orders found
                    </td>
                  </tr>
                ) : (
                  paginatedOrders.map((order, index) => (
                    <tr key={order.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm">{(currentPage - 1) * pageSize + index + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium">{order.idSale || '-'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-primary">{order.marketerIdStaff || '-'}</td>
                      <td className="px-4 py-3 text-sm">{order.dateOrder || '-'}</td>
                      <td className="px-4 py-3 text-sm font-medium">{order.marketerName}</td>
                      <td className="px-4 py-3 text-sm">{order.noPhone}</td>
                      <td className="px-4 py-3 text-sm">{order.produk}</td>
                      <td className="px-4 py-3 text-sm font-mono">{order.noTracking || '-'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">RM {order.hargaJualanSebenar.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm">
                        {order.kurier?.includes('CASH') ? (
                          <span className="text-blue-600 dark:text-blue-400 font-medium">
                            {order.kurier}
                          </span>
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
                      <td className="px-4 py-3 text-sm">{order.jenisPlatform || '-'}</td>
                      <td className="px-4 py-3 text-sm">{order.jenisCustomer || '-'}</td>
                      <td className="px-4 py-3 text-sm">{order.negeri || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && filteredOrders.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">entries</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredOrders.length)} of {filteredOrders.length}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminOrders;
