import React, { useState, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Calendar,
  Package,
  Truck,
  Clock,
  RotateCcw,
  ShoppingBag,
  Play,
  Banknote,
  CreditCard,
  ClipboardList,
  Loader2,
  Facebook,
  Database,
  Search,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth } from '@/lib/utils';

const DashboardLogistic: React.FC = () => {
  // Date filter state - default to current month (Malaysia timezone)
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());

  // All orders
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch all orders
  useEffect(() => {
    const fetchAllOrders = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from('customer_purchases')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setAllOrders(data || []);
      } catch (error) {
        console.error('Error fetching all orders:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllOrders();
  }, []);

  // Filter orders by date range (simple string comparison for YYYY-MM-DD format)
  const filteredAllOrders = useMemo(() => {
    return allOrders.filter(order => {
      if (!order.date_order) return false;
      const orderDate = order.date_order.substring(0, 10); // Get YYYY-MM-DD part
      return orderDate >= startDate && orderDate <= endDate;
    });
  }, [allOrders, startDate, endDate]);

  // Calculate logistic stats
  const logisticStats = useMemo(() => {
    const totalOrder = filteredAllOrders.length;
    const totalPending = filteredAllOrders.filter(o => o.delivery_status === 'Pending').length;
    const totalProcess = filteredAllOrders.filter(o => o.delivery_status === 'Shipped').length;
    const totalReturn = filteredAllOrders.filter(o => o.delivery_status === 'Return').length;

    // Separate platform counts
    const totalFacebook = filteredAllOrders.filter(o => o.jenis_platform === 'Facebook').length;
    const totalDatabase = filteredAllOrders.filter(o => o.jenis_platform === 'Database').length;
    const totalGoogle = filteredAllOrders.filter(o => o.jenis_platform === 'Google').length;
    const totalShopee = filteredAllOrders.filter(o => o.jenis_platform === 'Shopee').length;
    const totalTiktok = filteredAllOrders.filter(o => o.jenis_platform === 'Tiktok').length;
    const totalCash = filteredAllOrders.filter(o => o.type_payment === 'CASH').length;
    const totalCOD = filteredAllOrders.filter(o => o.type_payment === 'COD').length;

    // Total Pending Tracking: Shipped + COD + (SEO is null OR SEO != 'Successful Delivery')
    // All platforms now use NinjaVan (including Tiktok and Shopee)
    const totalPendingTracking = filteredAllOrders.filter(o =>
      o.delivery_status === 'Shipped' &&
      (!o.seo || o.seo !== 'Successful Delivery') &&
      o.type_payment === 'COD'
    ).length;

    return {
      totalOrder,
      totalPending,
      totalProcess,
      totalReturn,
      totalFacebook,
      totalDatabase,
      totalGoogle,
      totalShopee,
      totalTiktok,
      totalCash,
      totalCOD,
      totalPendingTracking,
    };
  }, [filteredAllOrders]);

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
        <h1 className="text-2xl font-bold text-primary">
          Dashboard Logistic
        </h1>
        <p className="text-muted-foreground mt-1">
          Logistics operations overview
        </p>
      </div>

      {/* Date Filter */}
      <div className="stat-card">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-5 h-5" />
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
      </div>

      {/* Main Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Order */}
        <div className="stat-card border-l-4 border-l-primary">
          <div className="flex items-center gap-2 text-primary mb-2">
            <Package className="w-5 h-5" />
            <span className="text-sm font-medium">TOTAL ORDER</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{logisticStats.totalOrder}</p>
          <p className="text-xs text-muted-foreground mt-1">All orders in period</p>
        </div>

        {/* Total Pending */}
        <div className="stat-card border-l-4 border-l-warning">
          <div className="flex items-center gap-2 text-warning mb-2">
            <Clock className="w-5 h-5" />
            <span className="text-sm font-medium">TOTAL PENDING</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{logisticStats.totalPending}</p>
          <p className="text-xs text-muted-foreground mt-1">Awaiting processing</p>
        </div>

        {/* Total Process */}
        <div className="stat-card border-l-4 border-l-info">
          <div className="flex items-center gap-2 text-info mb-2">
            <Truck className="w-5 h-5" />
            <span className="text-sm font-medium">TOTAL PROCESS</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{logisticStats.totalProcess}</p>
          <p className="text-xs text-muted-foreground mt-1">Shipped orders</p>
        </div>

        {/* Total Return */}
        <div className="stat-card border-l-4 border-l-destructive">
          <div className="flex items-center gap-2 text-destructive mb-2">
            <RotateCcw className="w-5 h-5" />
            <span className="text-sm font-medium">TOTAL RETURN</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{logisticStats.totalReturn}</p>
          <p className="text-xs text-muted-foreground mt-1">Returned orders</p>
        </div>
      </div>

      {/* Platform Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Total Facebook */}
        <div className="stat-card">
          <div className="flex items-center gap-2 text-blue-600 mb-2">
            <Facebook className="w-5 h-5" />
            <span className="text-sm font-medium">TOTAL FACEBOOK</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{logisticStats.totalFacebook}</p>
          <p className="text-xs text-muted-foreground mt-1">Facebook orders</p>
        </div>

        {/* Total Database */}
        <div className="stat-card">
          <div className="flex items-center gap-2 text-purple-600 mb-2">
            <Database className="w-5 h-5" />
            <span className="text-sm font-medium">TOTAL DATABASE</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{logisticStats.totalDatabase}</p>
          <p className="text-xs text-muted-foreground mt-1">Database orders</p>
        </div>

        {/* Total Google */}
        <div className="stat-card">
          <div className="flex items-center gap-2 text-green-600 mb-2">
            <Search className="w-5 h-5" />
            <span className="text-sm font-medium">TOTAL GOOGLE</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{logisticStats.totalGoogle}</p>
          <p className="text-xs text-muted-foreground mt-1">Google orders</p>
        </div>

        {/* Total Shopee */}
        <div className="stat-card">
          <div className="flex items-center gap-2 text-orange-600 mb-2">
            <ShoppingBag className="w-5 h-5" />
            <span className="text-sm font-medium">TOTAL SHOPEE</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{logisticStats.totalShopee}</p>
          <p className="text-xs text-muted-foreground mt-1">Shopee orders</p>
        </div>

        {/* Total TikTok */}
        <div className="stat-card">
          <div className="flex items-center gap-2 text-pink-600 mb-2">
            <Play className="w-5 h-5" />
            <span className="text-sm font-medium">TOTAL TIKTOK</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{logisticStats.totalTiktok}</p>
          <p className="text-xs text-muted-foreground mt-1">TikTok orders</p>
        </div>
      </div>

      {/* Payment Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {/* Total Cash */}
        <div className="stat-card">
          <div className="flex items-center gap-2 text-emerald-600 mb-2">
            <Banknote className="w-5 h-5" />
            <span className="text-sm font-medium">TOTAL CASH</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{logisticStats.totalCash}</p>
          <p className="text-xs text-muted-foreground mt-1">Cash payments</p>
        </div>

        {/* Total COD */}
        <div className="stat-card">
          <div className="flex items-center gap-2 text-amber-600 mb-2">
            <CreditCard className="w-5 h-5" />
            <span className="text-sm font-medium">TOTAL COD</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{logisticStats.totalCOD}</p>
          <p className="text-xs text-muted-foreground mt-1">Cash on Delivery</p>
        </div>

        {/* Total Pending Tracking */}
        <div className="stat-card-highlight">
          <div className="flex items-center gap-2 text-white/80 mb-2">
            <ClipboardList className="w-5 h-5" />
            <span className="text-sm font-medium">PENDING TRACKING</span>
          </div>
          <p className="text-2xl font-bold text-white">{logisticStats.totalPendingTracking}</p>
          <p className="text-xs text-white/60 mt-1">COD awaiting delivery confirmation</p>
        </div>
      </div>
    </div>
  );
};

export default DashboardLogistic;
