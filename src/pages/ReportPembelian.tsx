import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, RotateCcw, Download, Calendar, Loader2, ShoppingCart } from 'lucide-react';
import { useData } from '@/context/DataContext';
import { useBundles } from '@/context/BundleContext';
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const ReportPembelian: React.FC = () => {
  const { orders, isLoading } = useData();
  const { bundles } = useBundles();
  const [search, setSearch] = useState('');

  // Date filter - default to current month (Malaysia timezone)
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());

  // Payment details modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedOrderPayment, setSelectedOrderPayment] = useState<any>(null);

  // Filter orders by date range and search
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Filter by dateOrder (mapped from date_order)
      if (!order.dateOrder) return false;

      // Simple string comparison for YYYY-MM-DD format
      if (order.dateOrder < startDate || order.dateOrder > endDate) return false;

      // Filter by search (no ID Staff filter - show all)
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch =
          (order.noTempahan || '').toLowerCase().includes(searchLower) ||
          (order.produk || '').toLowerCase().includes(searchLower) ||
          (order.marketerName || '').toLowerCase().includes(searchLower) ||
          (order.noPhone || '').toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [orders, search, startDate, endDate]);

  const resetFilters = () => {
    setSearch('');
    setStartDate(getMalaysiaStartOfMonth());
    setEndDate(getMalaysiaEndOfMonth());
  };

  const exportCSV = () => {
    const headers = ['No', 'Tarikh Order', 'ID Staff', 'Nama Pelanggan', 'Phone', 'Produk', 'Unit', 'Tracking No', 'Total Sales', 'Cara Bayaran', 'Delivery Status', 'Jenis Platform', 'Jenis Customer', 'Negeri', 'Alamat', 'SEO'];
    const rows = filteredOrders.map((order, idx) => [
      idx + 1,
      order.dateOrder,
      order.marketerIdStaff,
      order.marketerName,
      order.noPhone,
      order.produk,
      order.kuantiti || 1,
      order.noTracking || '-',
      order.hargaJualanSebenar,
      order.caraBayaran || '-',
      order.deliveryStatus,
      order.jenisPlatform || '-',
      order.jenisCustomer || '-',
      order.negeri,
      order.alamat,
      order.seo || '-',
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'report_pembelian.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handlePaymentClick = (order: any) => {
    setSelectedOrderPayment(order);
    setPaymentModalOpen(true);
  };

  const getProductDisplay = (produk: string) => {
    const bundle = bundles.find(b => b.name === produk);
    if (bundle && bundle.productName) {
      return `${bundle.name} + ${bundle.productName}`;
    }
    return produk;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <ShoppingCart className="w-6 h-6" />
          Report Pembelian
        </h1>
        <p className="text-muted-foreground mt-1">
          Laporan semua pembelian mengikut tarikh
        </p>
      </div>

      {/* Filters */}
      <div className="stat-card">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">From</span>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-40"
            />
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">To</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-40"
            />
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={resetFilters}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
            <Button onClick={exportCSV} className="bg-green-600 hover:bg-green-700 text-white">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Row */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>Total Orders: <strong className="text-foreground">{filteredOrders.length}</strong></span>
        <span>Total Sales: <strong className="text-success">RM {filteredOrders.reduce((sum, o) => sum + (Number(o.hargaJualanSebenar) || 0), 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1600px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">No</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">Tarikh Order</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">ID Staff</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">Nama Pelanggan</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">Produk</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">Unit</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">Tracking No</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">Total Sales</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">Cara Bayaran</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">Delivery Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">Jenis Platform</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">Jenis Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">Negeri</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">Alamat</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">SEO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order, index) => (
                  <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">{index + 1}</td>
                    <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">{order.dateOrder}</td>
                    <td className="px-4 py-3 text-sm font-medium text-primary whitespace-nowrap">{order.marketerIdStaff}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap">{order.marketerName}</td>
                    <td className="px-4 py-3 text-sm font-mono text-foreground whitespace-nowrap">{order.noPhone}</td>
                    <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">{getProductDisplay(order.produk)}</td>
                    <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">{order.kuantiti || 1}</td>
                    <td className="px-4 py-3 text-sm font-mono text-foreground whitespace-nowrap">{order.noTracking || '-'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap">RM {(Number(order.hargaJualanSebenar) || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {order.caraBayaran === 'CASH' ? (
                        <button
                          onClick={() => handlePaymentClick(order)}
                          className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium"
                        >
                          CASH
                        </button>
                      ) : (
                        <span className="text-muted-foreground">{order.caraBayaran || '-'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
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
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{order.jenisPlatform || '-'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{order.jenisCustomer || '-'}</td>
                    <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">{order.negeri}</td>
                    <td className="px-4 py-3 text-sm text-foreground max-w-xs truncate">{order.alamat}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        order.seo === 'Successful Delivery' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                        order.seo === 'Shipped' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                        order.seo === 'Return' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                        'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400'
                      }`}>
                        {order.seo || '-'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={16} className="px-4 py-12 text-center text-muted-foreground">
                    No orders found for the selected date range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Details Modal */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
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
                  <p className="text-sm font-medium text-foreground">RM {(Number(selectedOrderPayment.hargaJualanSebenar) || 0).toFixed(2)}</p>
                </div>
              </div>
              {selectedOrderPayment.receiptImageUrl && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Resit Bayaran</p>
                  <img
                    src={selectedOrderPayment.receiptImageUrl}
                    alt="Receipt"
                    className="max-w-full h-auto rounded-lg border border-border"
                  />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReportPembelian;
