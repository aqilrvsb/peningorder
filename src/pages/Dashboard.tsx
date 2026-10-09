import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { usePospadaEnabled } from '@/hooks/usePospadaEnabled';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  LayoutDashboard,
  Calendar,
  TrendingUp,
  TrendingDown,
  DollarSign,
  RotateCcw,
  Wallet,
  BarChart3,
  Facebook,
  Database,
  ShoppingBag,
  Play,
  Search as SearchIcon,
  Users,
  UserPlus,
  UserCheck,
  Phone,
  Target,
  Percent,
  Package,
  Clock,
  Truck,
  ClipboardList,
  CreditCard,
  Banknote,
  LineChart as LineChartIcon,
  Globe,
  CheckCircle,
  AtSign,
} from 'lucide-react';
import { format, parseISO, isWithinInterval, eachDayOfInterval } from 'date-fns';
import { getMalaysiaStartOfMonth, getMalaysiaDate, fetchAllRows, cn } from '@/lib/utils';
import { PageHeader, StatCard, IconTile, CardsSkeleton, EmptyState, type Tone } from '@/components/common/SoftUI';
import { useTeam } from '@/hooks/useTeam';
import { TeamFilter } from '@/components/TeamFilter';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import DateApplyButton from '@/components/DateApplyButton';
import UnappliedDateNote from '@/components/UnappliedDateNote';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  ChartLegend,
  Filler
);

interface Spend {
  id: string;
  product: string;
  jenis_platform: string;
  total_spend: number;
  tarikh_spend: string;
  marketer_id_staff: string;
}

// ---- Presentation helpers (soft-UI layout only — no data logic) ----

// StatCard laid out vertically (tile on top) on phones and in the 5-up grid, so long
// "RM 123,456.00" values get the full card width; value size scales with the screen there.
const KPI = 'flex-col items-stretch gap-3 p-3 sm:p-4 xl:flex-col xl:items-start xl:gap-2 [&_p:first-child]:text-lg sm:[&_p:first-child]:text-xl xl:[&_p:first-child]:text-[length:clamp(1rem,1.25vw,1.375rem)]';
// 2 per row on phones, 3 on tablets, 5 on wide screens.
const KPI_GRID = 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5';

/** Brand-gradient highlight tile (Closing Rate / Pending Tracking), same shape as a KPI StatCard. */
const HighlightCard: React.FC<{ icon: React.ElementType; label: React.ReactNode; value: React.ReactNode; hint: React.ReactNode; className?: string }> = ({ icon: Icon, label, value, hint, className }) => (
  <div className={cn('stat-card-highlight flex flex-col gap-3 p-3 sm:p-4', className)}>
    <span className="icon-tile bg-white/20 text-white"><Icon /></span>
    <div className="min-w-0">
      <p className="truncate text-lg font-bold leading-tight tracking-tight text-white sm:text-xl">{value}</p>
      <p className="mt-1 truncate text-xs font-medium text-white/80">{label}</p>
      <p className="mt-0.5 truncate text-[11px] text-white/70">{hint}</p>
    </div>
  </div>
);

/** Platform sales card: tile + share %, total, then closing / customer-type breakdown rows. */
const PlatformCard: React.FC<{ icon: React.ElementType; tone: Tone; label: string; value: string; percent: string; children?: React.ReactNode }> = ({ icon, tone, label, value, percent, children }) => (
  <div className="stat-card flex flex-col p-4">
    <div className="flex items-start justify-between gap-3">
      <IconTile icon={icon} tone={tone} />
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{percent}</span>
    </div>
    <p className="mt-3 truncate text-xl font-bold leading-tight tracking-tight">{value}</p>
    <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
    {children}
  </div>
);

interface ClosingSplit {
  manual: number; manualPct: number; waBot: number; waBotPct: number; website: number; websitePct: number;
  call: number; callPct: number; live: number; livePct: number; shop: number; shopPct: number;
}
interface CustomerSplit { np: number; npPct: number; ep: number; epPct: number; ec: number; ecPct: number }

const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const { orders, prospects, isLoading, ensureOrdersFrom } = useData();
  const pospadaEnabled = usePospadaEnabled();
  const navigate = useNavigate();
  const [spends, setSpends] = useState<Spend[]>([]);
  const [spendsLoading, setSpendsLoading] = useState(true);

  // Date filter state - default to start of month to current day (Malaysia timezone)
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaDate());
  // Picked dates; the data follows startDate/endDate, which only change on Filter.
  const [pendingStart, setPendingStart] = useState(startDate);
  const [pendingEnd, setPendingEnd] = useState(endDate);
  const applyDates = () => { setStartDate(pendingStart); setEndDate(pendingEnd); };
  const [teamFilter, setTeamFilter] = useState(''); // '' = all team (client with staff)

  // Check user role — individual mode: every tenant ('client') gets the marketer dashboard
  const isMarketer = profile?.role === 'marketer' || profile?.role === 'admin' || profile?.role === 'client' || profile?.role === 'superadmin';
  const isLogistic = profile?.role === 'logistic';
  const isBOD = profile?.role === 'bod';
  const isAccount = profile?.role === 'account';
  const userIdStaff = profile?.idstaff;

  // Widen the server-side fetch window if the user filters earlier than loaded
  useEffect(() => { ensureOrdersFrom(startDate); }, [startDate]);

  // Redirect account role to Report Profit page
  useEffect(() => {
    if (isAccount) {
      navigate('/dashboard/account/report-profit', { replace: true });
    }
  }, [isAccount, navigate]);

  // All orders for logistic and BOD (fetched directly from Supabase)
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [allOrdersLoading, setAllOrdersLoading] = useState(true);

  // All spends and prospects for BOD
  const [allSpends, setAllSpends] = useState<Spend[]>([]);
  const [allProspects, setAllProspects] = useState<any[]>([]);
  const [bodDataLoading, setBodDataLoading] = useState(true);

  // Fetch spends for the dashboard — RLS scopes rows to this tenant already
  useEffect(() => {
    const fetchSpends = async () => {
      setSpendsLoading(true);
      try {
        // fetchAllRows + order so the marketer dashboard's Total Spend / ROAS
        // are complete and deterministic (the old uncapped .select('*') was
        // silently truncated to an arbitrary 1000 rows by PostgREST).
        const data = await fetchAllRows(() =>
          (supabase as any).from('spends').select('*').order('created_at', { ascending: false })
        );
        setSpends(data || []);
      } catch (error) {
        console.error('Error fetching spends:', error);
      } finally {
        setSpendsLoading(false);
      }
    };

    if (isMarketer) {
      fetchSpends();
    }
  }, [isMarketer]);

  // Fetch all orders for logistic and BOD roles
  useEffect(() => {
    const fetchAllOrders = async () => {
      setAllOrdersLoading(true);
      try {
        const data = await fetchAllRows(() =>
          (supabase as any)
            .from('customer_purchases')
            .select('*')
            .order('created_at', { ascending: false })
        );
        setAllOrders(data);
      } catch (error) {
        console.error('Error fetching all orders:', error);
      } finally {
        setAllOrdersLoading(false);
      }
    };

    if (isLogistic || isBOD) {
      fetchAllOrders();
    }
  }, [isLogistic, isBOD]);

  // Fetch all spends and prospects for BOD
  useEffect(() => {
    const fetchBODData = async () => {
      setBodDataLoading(true);
      try {
        const [spendsData, prospectsData] = await Promise.all([
          fetchAllRows(() => (supabase as any).from('spends').select('*')),
          fetchAllRows(() => (supabase as any).from('prospects').select('*')),
        ]);

        setAllSpends(spendsData);
        setAllProspects(prospectsData);
      } catch (error) {
        console.error('Error fetching BOD data:', error);
      } finally {
        setBodDataLoading(false);
      }
    };

    if (isBOD) {
      fetchBODData();
    }
  }, [isBOD]);

  // Filter orders by date range
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (!order.dateOrder) return false;
      if (teamFilter && ((order as any).marketerIdStaff || '') !== teamFilter) return false;
      try {
        const orderDate = parseISO(order.dateOrder);
        return isWithinInterval(orderDate, {
          start: parseISO(startDate),
          end: parseISO(endDate)
        });
      } catch {
        return false;
      }
    });
  }, [orders, startDate, endDate, teamFilter]);

  // Filter spends by date range
  const filteredSpends = useMemo(() => {
    return spends.filter(spend => {
      if (!spend.tarikh_spend) return false;
      if (teamFilter && (spend.marketer_id_staff || '') !== teamFilter) return false;
      try {
        const spendDate = parseISO(spend.tarikh_spend);
        return isWithinInterval(spendDate, {
          start: parseISO(startDate),
          end: parseISO(endDate)
        });
      } catch {
        return false;
      }
    });
  }, [spends, startDate, endDate, teamFilter]);

  // Filter prospects by date range
  const filteredProspects = useMemo(() => {
    return prospects.filter(prospect => {
      if (!prospect.tarikhPhoneNumber) return false;
      if (teamFilter && ((prospect as any).marketerIdStaff || '') !== teamFilter) return false;
      try {
        const prospectDate = parseISO(prospect.tarikhPhoneNumber);
        return isWithinInterval(prospectDate, {
          start: parseISO(startDate),
          end: parseISO(endDate)
        });
      } catch {
        return false;
      }
    });
  }, [prospects, startDate, endDate, teamFilter]);

  // Calculate marketer stats
  const marketerStats = useMemo(() => {
    // Total Parcel = number of orders in the selected date range
    const totalParcel = filteredOrders.length;

    // Total Sales
    const totalSales = filteredOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    // Total Sales from Pospada bookings (orders with a pospada date).
    const totalSalesPospada = filteredOrders.filter((o: any) => o.pospadaDate).reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

    // Collection = money in hand. CASH = paid upfront; COD = only after remittance
    // (date_payment stamped by the COD_REMITTED webhook). Returns = no money.
    const isCollected = (o: any) => {
      if (o.deliveryStatus === 'Return' || o.deliveryStatus === 'Failed') return false;
      const isCod = o.caraBayaran === 'COD' || o.kurier?.includes('COD');
      return !isCod || !!o.tarikhBayaran;
    };
    const collectionOrders = filteredOrders.filter(isCollected);
    const totalCollection = collectionOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

    // Return (parcel came back)
    const returnOrders = filteredOrders.filter(o => o.deliveryStatus === 'Return' || o.deliveryStatus === 'Failed');
    const totalReturn = returnOrders.reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

    // Remaining = outstanding money = Total Sales - Collection - Return (COD not yet remitted)
    const totalRemaining = totalSales - totalCollection - totalReturn;

    // Total Spend
    const totalSpend = filteredSpends.reduce((sum, s) => sum + (Number(s.total_spend) || 0), 0);

    // ROAS SALES (Return on Ad Spend) = Total Sales / Total Spend
    const roas = totalSpend > 0 ? totalSales / totalSpend : 0;

    // ROAS COLLECTION = Total Collection / Total Spend
    const roasCollection = totalSpend > 0 ? totalCollection / totalSpend : 0;

    // Cost Product and Postage
    // Cost product always applies. Tiktok postage = settlement fees (abs).
    const totalCostProduct = filteredOrders.reduce((sum, o) => sum + (o.kosProduk || 0), 0);
    const totalPostage = filteredOrders.reduce((sum, o) => {
      return sum + (o.jenisPlatform === 'Tiktok'
        ? Math.abs(o.kosPos || 0)
        : (o.kosPos || 0));
    }, 0);

    // Commission (order-based): sum of the bundle commission snapshotted onto
    // each order at key-in. Used for staff on pay_mode = 'commission_order'.
    const totalCommissionOrder = filteredOrders.reduce((sum, o) => sum + (o.commission || 0), 0);

    // Gross Profit (Sales) = Total Sales - Spend - Cost Product - Postage
    const grossProfitSales = totalSales - totalSpend - totalCostProduct - totalPostage;

    // Gross Profit (Collection) = Total Collection - Spend - Cost Product - Postage
    const grossProfitCollection = totalCollection - totalSpend - totalCostProduct - totalPostage;

    // Sales by Platform
    const salesFB = filteredOrders.filter(o => o.jenisPlatform === 'Facebook').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const salesDatabase = filteredOrders.filter(o => o.jenisPlatform === 'Database').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const salesThreads = filteredOrders.filter(o => o.jenisPlatform === 'Threads').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const salesTiktok = filteredOrders.filter(o => o.jenisPlatform === 'Tiktok').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const salesGoogle = filteredOrders.filter(o => o.jenisPlatform === 'Google').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

    // Closing breakdown per platform (with percentages)
    const getClosingByPlatform = (platform: string, platformTotal: number) => {
      const platformOrders = filteredOrders.filter(o => o.jenisPlatform === platform);
      const manual = platformOrders.filter(o => o.jenisClosing === 'Manual').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
      const waBot = platformOrders.filter(o => o.jenisClosing === 'Wa Bot').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
      const website = platformOrders.filter(o => o.jenisClosing === 'Website').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
      const call = platformOrders.filter(o => o.jenisClosing === 'Call').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
      const live = platformOrders.filter(o => o.jenisClosing === 'Live').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
      const shop = platformOrders.filter(o => o.jenisClosing === 'Shop' || o.jenisClosing === 'Beg Lead').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
      return {
        manual, manualPct: platformTotal > 0 ? (manual / platformTotal) * 100 : 0,
        waBot, waBotPct: platformTotal > 0 ? (waBot / platformTotal) * 100 : 0,
        website, websitePct: platformTotal > 0 ? (website / platformTotal) * 100 : 0,
        call, callPct: platformTotal > 0 ? (call / platformTotal) * 100 : 0,
        live, livePct: platformTotal > 0 ? (live / platformTotal) * 100 : 0,
        shop, shopPct: platformTotal > 0 ? (shop / platformTotal) * 100 : 0,
      };
    };

    // Customer type breakdown per platform (with percentages)
    const getCustomerByPlatform = (platform: string, platformTotal: number) => {
      const platformOrders = filteredOrders.filter(o => o.jenisPlatform === platform);
      const np = platformOrders.filter(o => o.jenisCustomer === 'NP').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
      const ep = platformOrders.filter(o => o.jenisCustomer === 'EP').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
      const ec = platformOrders.filter(o => o.jenisCustomer === 'EC').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
      return {
        np, npPct: platformTotal > 0 ? (np / platformTotal) * 100 : 0,
        ep, epPct: platformTotal > 0 ? (ep / platformTotal) * 100 : 0,
        ec, ecPct: platformTotal > 0 ? (ec / platformTotal) * 100 : 0,
      };
    };

    const closingFB = getClosingByPlatform('Facebook', salesFB);
    const closingDatabase = getClosingByPlatform('Database', salesDatabase);
    const closingThreads = getClosingByPlatform('Threads', salesThreads);
    const closingTiktok = getClosingByPlatform('Tiktok', salesTiktok);
    const closingGoogle = getClosingByPlatform('Google', salesGoogle);

    const customerFB = getCustomerByPlatform('Facebook', salesFB);
    const customerDatabase = getCustomerByPlatform('Database', salesDatabase);
    const customerThreads = getCustomerByPlatform('Threads', salesThreads);
    const customerTiktok = getCustomerByPlatform('Tiktok', salesTiktok);
    const customerGoogle = getCustomerByPlatform('Google', salesGoogle);

    // Sales by Customer Type
    const salesNP = filteredOrders.filter(o => o.jenisCustomer === 'NP').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const salesEP = filteredOrders.filter(o => o.jenisCustomer === 'EP').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const salesEC = filteredOrders.filter(o => o.jenisCustomer === 'EC').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

    // Sales by Jenis Closing
    const salesManual = filteredOrders.filter(o => o.jenisClosing === 'Manual').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const salesWaBot = filteredOrders.filter(o => o.jenisClosing === 'Wa Bot').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const salesWebsite = filteredOrders.filter(o => o.jenisClosing === 'Website').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const salesCall = filteredOrders.filter(o => o.jenisClosing === 'Call').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const salesLive = filteredOrders.filter(o => o.jenisClosing === 'Live').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);
    const salesShop = filteredOrders.filter(o => o.jenisClosing === 'Shop' || o.jenisClosing === 'Beg Lead').reduce((sum, o) => sum + (o.hargaJualanSebenar || 0), 0);

    // Total Lead
    const totalLead = filteredProspects.length;
    const totalLeadNP = filteredProspects.filter(p => p.jenisProspek === 'NP').length;
    const totalLeadEP = filteredProspects.filter(p => p.jenisProspek === 'EP').length;

    // Closed leads (prospects with statusClosed not empty)
    const closedLeads = filteredProspects.filter(p => p.statusClosed && p.statusClosed.trim() !== '').length;

    // Average KPK (Kos Per Klik) = Total Spend / Total Lead
    const averageKPK = totalLead > 0 ? totalSpend / totalLead : 0;

    // Closing Rate Lead = Closed Leads / Total Lead * 100
    const closingRate = totalLead > 0 ? (closedLeads / totalLead) * 100 : 0;

    // Calculate percentages (based on total sales as reference)
    const collectionPercent = totalSales > 0 ? (totalCollection / totalSales) * 100 : 0;
    const returnPercent = totalSales > 0 ? (totalReturn / totalSales) * 100 : 0;
    const fbPercent = totalSales > 0 ? (salesFB / totalSales) * 100 : 0;
    const dbPercent = totalSales > 0 ? (salesDatabase / totalSales) * 100 : 0;
    const threadsPercent = totalSales > 0 ? (salesThreads / totalSales) * 100 : 0;
    const tiktokPercent = totalSales > 0 ? (salesTiktok / totalSales) * 100 : 0;
    const googlePercent = totalSales > 0 ? (salesGoogle / totalSales) * 100 : 0;
    const npPercent = totalSales > 0 ? (salesNP / totalSales) * 100 : 0;
    const epPercent = totalSales > 0 ? (salesEP / totalSales) * 100 : 0;
    const ecPercent = totalSales > 0 ? (salesEC / totalSales) * 100 : 0;
    const manualPercent = totalSales > 0 ? (salesManual / totalSales) * 100 : 0;
    const waBotPercent = totalSales > 0 ? (salesWaBot / totalSales) * 100 : 0;
    const websitePercent = totalSales > 0 ? (salesWebsite / totalSales) * 100 : 0;
    const callPercent = totalSales > 0 ? (salesCall / totalSales) * 100 : 0;
    const livePercent = totalSales > 0 ? (salesLive / totalSales) * 100 : 0;
    const shopPercent = totalSales > 0 ? (salesShop / totalSales) * 100 : 0;

    return {
      totalParcel,
      totalSales,
      totalSalesPospada,
      totalCollection,
      collectionPercent,
      totalRemaining,
      totalReturn,
      returnPercent,
      totalSpend,
      roas,
      roasCollection,
      totalCostProduct,
      totalPostage,
      totalCommissionOrder,
      grossProfitSales,
      salesFB,
      fbPercent,
      salesDatabase,
      dbPercent,
      salesThreads,
      threadsPercent,
      salesTiktok,
      tiktokPercent,
      salesGoogle,
      googlePercent,
      closingFB,
      closingDatabase,
      closingThreads,
      closingTiktok,
      closingGoogle,
      customerFB,
      customerDatabase,
      customerThreads,
      customerTiktok,
      customerGoogle,
      salesNP,
      npPercent,
      salesEP,
      epPercent,
      salesEC,
      ecPercent,
      salesManual,
      manualPercent,
      salesWaBot,
      waBotPercent,
      salesWebsite,
      websitePercent,
      salesCall,
      callPercent,
      salesLive,
      livePercent,
      salesShop,
      shopPercent,
      totalLead,
      totalLeadNP,
      totalLeadEP,
      averageKPK,
      closingRate,
    };
  }, [filteredOrders, filteredSpends, filteredProspects]);

  // Filter all orders by date range for logistic
  const filteredAllOrders = useMemo(() => {
    return allOrders.filter(order => {
      if (!order.date_order) return false;
      try {
        const orderDate = parseISO(order.date_order);
        return isWithinInterval(orderDate, {
          start: parseISO(startDate),
          end: parseISO(endDate)
        });
      } catch {
        return false;
      }
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

  // Filter all spends by date range for BOD
  const filteredAllSpends = useMemo(() => {
    return allSpends.filter(spend => {
      if (!spend.tarikh_spend) return false;
      try {
        const spendDate = parseISO(spend.tarikh_spend);
        return isWithinInterval(spendDate, {
          start: parseISO(startDate),
          end: parseISO(endDate)
        });
      } catch {
        return false;
      }
    });
  }, [allSpends, startDate, endDate]);

  // Filter all prospects by date range for BOD
  const filteredAllProspects = useMemo(() => {
    return allProspects.filter(prospect => {
      if (!prospect.tarikh_phone_number) return false;
      try {
        const prospectDate = parseISO(prospect.tarikh_phone_number);
        return isWithinInterval(prospectDate, {
          start: parseISO(startDate),
          end: parseISO(endDate)
        });
      } catch {
        return false;
      }
    });
  }, [allProspects, startDate, endDate]);

  // Calculate BOD stats (all marketers combined)
  const bodStats = useMemo(() => {
    // Total Sales
    const totalSales = filteredAllOrders.reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
    // Total Sales from Pospada bookings (orders with a pospada date).
    const totalSalesPospada = filteredAllOrders.filter((o: any) => o.pospada_date).reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);

    // Total Collection (orders with seo === 'Successful Delivery')
    const collectionOrders = filteredAllOrders.filter(o => o.seo === 'Successful Delivery');
    const totalCollection = collectionOrders.reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);

    // Return (only orders with delivery_status = 'Return')
    const returnOrders = filteredAllOrders.filter(o => o.delivery_status === 'Return');
    const totalReturn = returnOrders.reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);

    // Total Spend (all marketers)
    const totalSpend = filteredAllSpends.reduce((sum, s) => sum + (Number(s.total_spend) || 0), 0);

    // ROAS SALES
    const roas = totalSpend > 0 ? totalSales / totalSpend : 0;

    // ROAS COLLECTION
    const roasCollection = totalSpend > 0 ? totalCollection / totalSpend : 0;

    // Sales by Platform
    const salesFB = filteredAllOrders.filter(o => o.jenis_platform === 'Facebook').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
    const salesDatabase = filteredAllOrders.filter(o => o.jenis_platform === 'Database').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
    const salesShopee = filteredAllOrders.filter(o => o.jenis_platform === 'Shopee').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
    const salesTiktok = filteredAllOrders.filter(o => o.jenis_platform === 'Tiktok').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
    const salesGoogle = filteredAllOrders.filter(o => o.jenis_platform === 'Google').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);

    // Closing breakdown per platform (BOD) with percentages
    const getClosingByPlatformBod = (platform: string, platformTotal: number) => {
      const platformOrders = filteredAllOrders.filter(o => o.jenis_platform === platform);
      const manual = platformOrders.filter(o => o.jenis_closing === 'Manual').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
      const waBot = platformOrders.filter(o => o.jenis_closing === 'Wa Bot').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
      const website = platformOrders.filter(o => o.jenis_closing === 'Website').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
      const call = platformOrders.filter(o => o.jenis_closing === 'Call').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
      const live = platformOrders.filter(o => o.jenis_closing === 'Live').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
      const shop = platformOrders.filter(o => o.jenis_closing === 'Shop' || o.jenis_closing === 'Beg Lead').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
      return {
        manual, manualPct: platformTotal > 0 ? (manual / platformTotal) * 100 : 0,
        waBot, waBotPct: platformTotal > 0 ? (waBot / platformTotal) * 100 : 0,
        website, websitePct: platformTotal > 0 ? (website / platformTotal) * 100 : 0,
        call, callPct: platformTotal > 0 ? (call / platformTotal) * 100 : 0,
        live, livePct: platformTotal > 0 ? (live / platformTotal) * 100 : 0,
        shop, shopPct: platformTotal > 0 ? (shop / platformTotal) * 100 : 0,
      };
    };

    const closingFB = getClosingByPlatformBod('Facebook', salesFB);
    const closingDatabase = getClosingByPlatformBod('Database', salesDatabase);
    const closingShopee = getClosingByPlatformBod('Shopee', salesShopee);
    const closingTiktok = getClosingByPlatformBod('Tiktok', salesTiktok);
    const closingGoogle = getClosingByPlatformBod('Google', salesGoogle);

    // Customer type breakdown per platform (BOD) with percentages
    const getCustomerByPlatformBod = (platform: string, platformTotal: number) => {
      const platformOrders = filteredAllOrders.filter(o => o.jenis_platform === platform);
      const np = platformOrders.filter(o => o.jenis_customer === 'NP').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
      const ep = platformOrders.filter(o => o.jenis_customer === 'EP').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
      const ec = platformOrders.filter(o => o.jenis_customer === 'EC').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
      return {
        np, npPct: platformTotal > 0 ? (np / platformTotal) * 100 : 0,
        ep, epPct: platformTotal > 0 ? (ep / platformTotal) * 100 : 0,
        ec, ecPct: platformTotal > 0 ? (ec / platformTotal) * 100 : 0,
      };
    };

    const customerFB = getCustomerByPlatformBod('Facebook', salesFB);
    const customerDatabase = getCustomerByPlatformBod('Database', salesDatabase);
    const customerShopee = getCustomerByPlatformBod('Shopee', salesShopee);
    const customerTiktok = getCustomerByPlatformBod('Tiktok', salesTiktok);
    const customerGoogle = getCustomerByPlatformBod('Google', salesGoogle);

    // Sales by Customer Type
    const salesNP = filteredAllOrders.filter(o => o.jenis_customer === 'NP').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
    const salesEP = filteredAllOrders.filter(o => o.jenis_customer === 'EP').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
    const salesEC = filteredAllOrders.filter(o => o.jenis_customer === 'EC').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);

    // Sales by Jenis Closing
    const salesManual = filteredAllOrders.filter(o => o.jenis_closing === 'Manual').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
    const salesWaBot = filteredAllOrders.filter(o => o.jenis_closing === 'Wa Bot').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
    const salesWebsite = filteredAllOrders.filter(o => o.jenis_closing === 'Website').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
    const salesCall = filteredAllOrders.filter(o => o.jenis_closing === 'Call').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
    const salesLive = filteredAllOrders.filter(o => o.jenis_closing === 'Live').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);
    const salesShop = filteredAllOrders.filter(o => o.jenis_closing === 'Shop' || o.jenis_closing === 'Beg Lead').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0);

    // Total Lead (all marketers)
    const totalLead = filteredAllProspects.length;
    const totalLeadNP = filteredAllProspects.filter(p => p.jenis_prospek === 'NP').length;
    const totalLeadEP = filteredAllProspects.filter(p => p.jenis_prospek === 'EP').length;

    // Closed leads
    const closedLeads = filteredAllProspects.filter(p => p.status_closed && p.status_closed.trim() !== '').length;

    // Average KPK
    const averageKPK = totalLead > 0 ? totalSpend / totalLead : 0;

    // Closing Rate
    const closingRate = totalLead > 0 ? (closedLeads / totalLead) * 100 : 0;

    // Calculate percentages
    const returnPercent = totalSales > 0 ? (totalReturn / totalSales) * 100 : 0;
    const fbPercent = totalSales > 0 ? (salesFB / totalSales) * 100 : 0;
    const dbPercent = totalSales > 0 ? (salesDatabase / totalSales) * 100 : 0;
    const shopeePercent = totalSales > 0 ? (salesShopee / totalSales) * 100 : 0;
    const tiktokPercent = totalSales > 0 ? (salesTiktok / totalSales) * 100 : 0;
    const googlePercent = totalSales > 0 ? (salesGoogle / totalSales) * 100 : 0;
    const npPercent = totalSales > 0 ? (salesNP / totalSales) * 100 : 0;
    const epPercent = totalSales > 0 ? (salesEP / totalSales) * 100 : 0;
    const ecPercent = totalSales > 0 ? (salesEC / totalSales) * 100 : 0;
    const manualPercent = totalSales > 0 ? (salesManual / totalSales) * 100 : 0;
    const waBotPercent = totalSales > 0 ? (salesWaBot / totalSales) * 100 : 0;
    const websitePercent = totalSales > 0 ? (salesWebsite / totalSales) * 100 : 0;
    const callPercent = totalSales > 0 ? (salesCall / totalSales) * 100 : 0;
    const livePercent = totalSales > 0 ? (salesLive / totalSales) * 100 : 0;
    const shopPercent = totalSales > 0 ? (salesShop / totalSales) * 100 : 0;

    return {
      totalSales,
      totalSalesPospada,
      totalCollection,
      totalReturn,
      returnPercent,
      totalSpend,
      roas,
      roasCollection,
      salesFB,
      fbPercent,
      salesDatabase,
      dbPercent,
      salesShopee,
      shopeePercent,
      salesTiktok,
      tiktokPercent,
      salesGoogle,
      googlePercent,
      closingFB,
      closingDatabase,
      closingShopee,
      closingTiktok,
      closingGoogle,
      customerFB,
      customerDatabase,
      customerShopee,
      customerTiktok,
      customerGoogle,
      salesNP,
      npPercent,
      salesEP,
      epPercent,
      salesEC,
      ecPercent,
      salesManual,
      manualPercent,
      salesWaBot,
      waBotPercent,
      salesWebsite,
      websitePercent,
      salesCall,
      callPercent,
      salesLive,
      livePercent,
      salesShop,
      shopPercent,
      totalLead,
      totalLeadNP,
      totalLeadEP,
      averageKPK,
      closingRate,
    };
  }, [filteredAllOrders, filteredAllSpends, filteredAllProspects]);

  // Chart data for BOD - Sales by date (Chart.js format)
  const bodChartData = useMemo(() => {
    if (!startDate || !endDate) return { labels: [], datasets: [] };

    try {
      const days = eachDayOfInterval({
        start: parseISO(startDate),
        end: parseISO(endDate)
      });

      const labels = days.map(day => format(day, 'dd-MMM'));
      const totalSalesData: number[] = [];
      const salesNPData: number[] = [];
      const salesEPData: number[] = [];
      const salesECData: number[] = [];

      days.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayOrders = filteredAllOrders.filter(o => o.date_order === dateStr);

        totalSalesData.push(dayOrders.reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0));
        salesNPData.push(dayOrders.filter(o => o.jenis_customer === 'NP').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0));
        salesEPData.push(dayOrders.filter(o => o.jenis_customer === 'EP').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0));
        salesECData.push(dayOrders.filter(o => o.jenis_customer === 'EC').reduce((sum, o) => sum + (Number(o.harga_jualan_sebenar) || 0), 0));
      });

      return {
        labels,
        datasets: [
          {
            label: 'Total Sales',
            data: totalSalesData,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: false,
          },
          {
            label: 'Sales NP',
            data: salesNPData,
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: false,
          },
          {
            label: 'Sales EP',
            data: salesEPData,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: false,
          },
          {
            label: 'Sales EC',
            data: salesECData,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: false,
          },
        ],
      };
    } catch {
      return { labels: [], datasets: [] };
    }
  }, [filteredAllOrders, startDate, endDate]);

  // Chart.js options for BOD chart
  const bodChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: function(context: any) {
            const value = context.parsed.y;
            return `${context.dataset.label}: RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return `RM ${(value / 1000).toFixed(0)}k`;
          },
        },
      },
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    },
  };

  const formatCurrency = (value: number) => {
    return `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  // ---- Presentation helpers (closures over the formatters / date state above) ----

  // One "label ........ RM x (y%)" line inside a platform card.
  const breakdownRow = (label: string, dot: string, value: number, pct: number) => (
    <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        {label}
      </span>
      {/* ml-auto: when a narrow 5-up card wraps the value onto its own line, it stays right-aligned. */}
      <span className="ml-auto whitespace-nowrap text-right font-medium tabular-nums text-foreground">
        {formatCurrency(value)} <span className="font-normal text-muted-foreground">({formatPercent(pct)})</span>
      </span>
    </div>
  );

  // Closing-type rows (Manual / WA Bot / Website / Call, plus Live / Shop where shown).
  const closingRows = (c: ClosingSplit, extra: { live?: boolean; shop?: boolean } = {}) => (
    <div className="mt-4 space-y-1.5 border-t border-border/70 pt-3">
      {breakdownRow('Manual', 'bg-slate-400', c.manual, c.manualPct)}
      {breakdownRow('WA Bot', 'bg-green-500', c.waBot, c.waBotPct)}
      {breakdownRow('Website', 'bg-violet-500', c.website, c.websitePct)}
      {breakdownRow('Call', 'bg-sky-500', c.call, c.callPct)}
      {extra.live && breakdownRow('Live', 'bg-rose-500', c.live, c.livePct)}
      {extra.shop && breakdownRow('Shop', 'bg-orange-500', c.shop, c.shopPct)}
    </div>
  );

  // Customer-type rows (NP / EP / EC).
  const customerRows = (c: CustomerSplit) => (
    <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3">
      {breakdownRow('NP', 'bg-cyan-500', c.np, c.npPct)}
      {breakdownRow('EP', 'bg-emerald-500', c.ep, c.epPct)}
      {breakdownRow('EC', 'bg-amber-500', c.ec, c.ecPct)}
    </div>
  );

  // Date range toolbar (same on every role's dashboard; Team filter only for marketer view).
  const dateFilterBar = (withTeam: boolean) => (
    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex items-center gap-2 sm:h-10">
          <IconTile icon={Calendar} tone="blue" size="sm" />
          <span className="whitespace-nowrap text-sm font-medium text-foreground">Date Range:</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="startDate">From</Label>
            <Input
              id="startDate"
              type="date"
              value={pendingStart}
              onChange={(e) => setPendingStart(e.target.value)}
              className="w-full sm:w-40"
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="endDate">To</Label>
            <Input
              id="endDate"
              type="date"
              value={pendingEnd}
              onChange={(e) => setPendingEnd(e.target.value)}
              className="w-full sm:w-40"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateApplyButton onClick={applyDates} />
          <UnappliedDateNote pendingStart={pendingStart} pendingEnd={pendingEnd} startDate={startDate} endDate={endDate} />
        </div>
        {withTeam && <TeamFilter value={teamFilter} onChange={setTeamFilter} />}
      </div>
    </div>
  );

  if (isLoading || (isMarketer && spendsLoading)) {
    return <CardsSkeleton count={8} />;
  }

  // Staff payout view: a marketer staff is paid either by bundle commission per
  // order ('commission_order' — hide cost/postage/gross-profit, show Commission)
  // or a % of gross profit ('gross_profit' — keep everything, add Commission).
  const isStaffPayout = profile?.role === 'marketer';
  const payMode = profile?.payMode || 'commission_order';
  const commissionOrderMode = isStaffPayout && payMode === 'commission_order';
  const commissionValue = payMode === 'gross_profit'
    ? marketerStats.grossProfitSales * ((profile?.commissionPercent || 0) / 100)
    : marketerStats.totalCommissionOrder;

  // Marketer Dashboard
  if (isMarketer) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title={<>Welcome back, {profile?.fullName || 'Marketer'}!</>}
          description="Your performance dashboard"
          icon={LayoutDashboard}
          tone="brand"
        />

        {/* Date Filter */}
        {dateFilterBar(true)}

        {/* Main Stats Row */}
        <div className={KPI_GRID}>
          <StatCard className={KPI} icon={Package} tone="blue" label="TOTAL PARCEL" value={marketerStats.totalParcel} hint="Orders in period" />
          <StatCard className={KPI} icon={DollarSign} tone="green" label="TOTAL SALES" value={formatCurrency(marketerStats.totalSales)} hint="100%" />
          {pospadaEnabled && (
            <StatCard className={KPI} icon={Calendar} tone="purple" label="TOTAL SALES POSPADA" value={formatCurrency(marketerStats.totalSalesPospada)} hint="Booking orders" />
          )}
          <StatCard className={KPI} icon={DollarSign} tone="cyan" label="TOTAL COLLECTION" value={formatCurrency(marketerStats.totalCollection)} hint={formatPercent(marketerStats.collectionPercent)} />
          {/* Remaining = Total Sales - Collection - Return (outstanding COD) */}
          <StatCard className={KPI} icon={Clock} tone="orange" label="REMAINING" value={formatCurrency(marketerStats.totalRemaining)} hint="Sales − Collection − Return" />
          <StatCard className={KPI} icon={RotateCcw} tone="red" label="RETURN" value={formatCurrency(marketerStats.totalReturn)} hint={formatPercent(marketerStats.returnPercent)} />
          <StatCard className={KPI} icon={Wallet} tone="amber" label="TOTAL SPEND" value={formatCurrency(marketerStats.totalSpend)} hint="Ad Budget" />
          <StatCard className={KPI} icon={BarChart3} tone="indigo" label="ROAS SALES" value={`${marketerStats.roas.toFixed(2)}x`} hint="Sales / Spend" />
          <StatCard className={KPI} icon={BarChart3} tone="green" label="ROAS COLLECTION" value={`${marketerStats.roasCollection.toFixed(2)}x`} hint="Collection / Spend" />
          {/* COST PRODUCT — hidden for commission-order staff */}
          {!commissionOrderMode && (
            <StatCard className={KPI} icon={Package} tone="pink" label="COST PRODUCT" value={formatCurrency(marketerStats.totalCostProduct)} />
          )}
          {/* POSTAGE — hidden for commission-order staff */}
          {!commissionOrderMode && (
            <StatCard className={KPI} icon={Truck} tone="slate" label="POSTAGE" value={formatCurrency(marketerStats.totalPostage)} />
          )}

          {/* GROSS PROFIT card removed on request. */}

          {/* COMMISSION card removed on request. */}
        </div>

        {/* Platform Sales Row with Closing Breakdown */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <PlatformCard icon={Facebook} tone="blue" label="SALES FB" value={formatCurrency(marketerStats.salesFB)} percent={formatPercent(marketerStats.fbPercent)}>
            {closingRows(marketerStats.closingFB)}
            {customerRows(marketerStats.customerFB)}
          </PlatformCard>
          <PlatformCard icon={Database} tone="purple" label="SALES DATABASE" value={formatCurrency(marketerStats.salesDatabase)} percent={formatPercent(marketerStats.dbPercent)}>
            {closingRows(marketerStats.closingDatabase)}
            {customerRows(marketerStats.customerDatabase)}
          </PlatformCard>
          <PlatformCard icon={AtSign} tone="slate" label="SALES THREADS" value={formatCurrency(marketerStats.salesThreads)} percent={formatPercent(marketerStats.threadsPercent)}>
            {closingRows(marketerStats.closingThreads)}
            {customerRows(marketerStats.customerThreads)}
          </PlatformCard>
          <PlatformCard icon={Play} tone="pink" label="SALES TIKTOK" value={formatCurrency(marketerStats.salesTiktok)} percent={formatPercent(marketerStats.tiktokPercent)}>
            {closingRows(marketerStats.closingTiktok, { live: true })}
            {customerRows(marketerStats.customerTiktok)}
          </PlatformCard>
          <PlatformCard icon={SearchIcon} tone="red" label="SALES GOOGLE" value={formatCurrency(marketerStats.salesGoogle)} percent={formatPercent(marketerStats.googlePercent)}>
            {closingRows(marketerStats.closingGoogle)}
            {customerRows(marketerStats.customerGoogle)}
          </PlatformCard>
        </div>

        {/* Closing Summary Row (All Platforms) */}
        <div className={KPI_GRID}>
          <StatCard className={KPI} icon={ClipboardList} tone="slate" label="CLOSING MANUAL" value={formatCurrency(marketerStats.salesManual)} hint={formatPercent(marketerStats.manualPercent)} />
          <StatCard className={KPI} icon={Phone} tone="green" label="CLOSING WA BOT" value={formatCurrency(marketerStats.salesWaBot)} hint={formatPercent(marketerStats.waBotPercent)} />
          <StatCard className={KPI} icon={Globe} tone="purple" label="CLOSING WEBSITE" value={formatCurrency(marketerStats.salesWebsite)} hint={formatPercent(marketerStats.websitePercent)} />
          <StatCard className={KPI} icon={Phone} tone="blue" label="CLOSING CALL" value={formatCurrency(marketerStats.salesCall)} hint={formatPercent(marketerStats.callPercent)} />
          <StatCard className={KPI} icon={Play} tone="pink" label="CLOSING LIVE" value={formatCurrency(marketerStats.salesLive)} hint={formatPercent(marketerStats.livePercent)} />
        </div>

        {/* Customer Type Sales Row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard className={KPI} icon={UserPlus} tone="cyan" label="SALES NP" value={formatCurrency(marketerStats.salesNP)} hint={<>{formatPercent(marketerStats.npPercent)} - New Prospect</>} />
          <StatCard className={KPI} icon={Users} tone="amber" label="SALES EP" value={formatCurrency(marketerStats.salesEP)} hint={<>{formatPercent(marketerStats.epPercent)} - Existing Prospect</>} />
          <StatCard className={KPI} icon={UserCheck} tone="green" label="SALES EC" value={formatCurrency(marketerStats.salesEC)} hint={<>{formatPercent(marketerStats.ecPercent)} - Existing Customer</>} />
        </div>

        {/* Lead Stats Row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard className={KPI} icon={Phone} tone="indigo" label="TOTAL LEAD" value={marketerStats.totalLead} hint="Prospects in period" />
          <StatCard className={KPI} icon={Target} tone="cyan" label="AVERAGE KPK" value={formatCurrency(marketerStats.averageKPK)} hint="Kos Per Lead" />
          {/* Closing Rate Lead */}
          <HighlightCard className="col-span-2 lg:col-span-1" icon={Percent} label="CLOSING RATE" value={formatPercent(marketerStats.closingRate)} hint="Lead Conversion" />
        </div>
      </div>
    );
  }

  // Logistic Dashboard
  if (isLogistic) {
    if (allOrdersLoading) {
      return <CardsSkeleton count={8} />;
    }

    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title={<>Welcome back, {profile?.fullName || 'Logistic'}!</>}
          description="Logistics operations dashboard"
          icon={LayoutDashboard}
          tone="brand"
        />

        {/* Date Filter */}
        {dateFilterBar(false)}

        {/* Main Stats Row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard className={KPI} icon={Package} tone="blue" label="TOTAL ORDER" value={logisticStats.totalOrder} hint="All orders in period" />
          <StatCard className={KPI} icon={Clock} tone="amber" label="TOTAL PENDING" value={logisticStats.totalPending} hint="Awaiting processing" />
          <StatCard className={KPI} icon={Truck} tone="cyan" label="TOTAL PROCESS" value={logisticStats.totalProcess} hint="Shipped orders" />
          <StatCard className={KPI} icon={RotateCcw} tone="red" label="TOTAL RETURN" value={logisticStats.totalReturn} hint="Returned orders" />
        </div>

        {/* Platform Stats Row */}
        <div className={KPI_GRID}>
          <StatCard className={KPI} icon={Facebook} tone="blue" label="TOTAL FACEBOOK" value={logisticStats.totalFacebook} hint="Facebook orders" />
          <StatCard className={KPI} icon={Database} tone="purple" label="TOTAL DATABASE" value={logisticStats.totalDatabase} hint="Database orders" />
          <StatCard className={KPI} icon={SearchIcon} tone="green" label="TOTAL GOOGLE" value={logisticStats.totalGoogle} hint="Google orders" />
          <StatCard className={KPI} icon={ShoppingBag} tone="orange" label="TOTAL SHOPEE" value={logisticStats.totalShopee} hint="Shopee orders" />
          <StatCard className={KPI} icon={Play} tone="pink" label="TOTAL TIKTOK" value={logisticStats.totalTiktok} hint="TikTok orders" />
        </div>

        {/* Payment Stats Row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard className={KPI} icon={Banknote} tone="green" label="TOTAL CASH" value={logisticStats.totalCash} hint="Cash payments" />
          <StatCard className={KPI} icon={CreditCard} tone="amber" label="TOTAL COD" value={logisticStats.totalCOD} hint="Cash on Delivery" />
          {/* Total Pending Tracking */}
          <HighlightCard className="col-span-2 lg:col-span-1" icon={ClipboardList} label="PENDING TRACKING" value={logisticStats.totalPendingTracking} hint="COD awaiting delivery confirmation" />
        </div>
      </div>
    );
  }

  // BOD Dashboard - Business Owner Dashboard
  if (isBOD) {
    if (allOrdersLoading || bodDataLoading) {
      return <CardsSkeleton count={8} />;
    }

    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title={<>Welcome back, {profile?.fullName || 'Owner'}!</>}
          description="Business performance overview - All marketers combined"
          icon={LayoutDashboard}
          tone="brand"
        />

        {/* Date Filter */}
        {dateFilterBar(false)}

        {/* Main Stats Row */}
        <div className={KPI_GRID}>
          <StatCard className={KPI} icon={DollarSign} tone="green" label="TOTAL SALES" value={formatCurrency(bodStats.totalSales)} hint="100%" />
          {pospadaEnabled && (
            <StatCard className={KPI} icon={Calendar} tone="purple" label="TOTAL SALES POSPADA" value={formatCurrency(bodStats.totalSalesPospada)} hint="Booking orders" />
          )}
          <StatCard className={KPI} icon={CheckCircle} tone="cyan" label="TOTAL COLLECTION" value={formatCurrency(bodStats.totalCollection)} hint="Successful Delivery" />
          <StatCard className={KPI} icon={RotateCcw} tone="red" label="RETURN" value={formatCurrency(bodStats.totalReturn)} hint={formatPercent(bodStats.returnPercent)} />
          <StatCard className={KPI} icon={Wallet} tone="amber" label="TOTAL SPEND" value={formatCurrency(bodStats.totalSpend)} hint="Ad Budget" />
          <StatCard className={KPI} icon={BarChart3} tone="indigo" label="ROAS SALES" value={`${bodStats.roas.toFixed(2)}x`} hint="Sales / Spend" />
          <StatCard className={KPI} icon={BarChart3} tone="green" label="ROAS COLLECTION" value={`${bodStats.roasCollection.toFixed(2)}x`} hint="Collection / Spend" />
        </div>

        {/* Platform Sales Row with Closing Breakdown */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <PlatformCard icon={Facebook} tone="blue" label="SALES FB" value={formatCurrency(bodStats.salesFB)} percent={formatPercent(bodStats.fbPercent)}>
            {closingRows(bodStats.closingFB)}
            {customerRows(bodStats.customerFB)}
          </PlatformCard>
          <PlatformCard icon={Database} tone="purple" label="SALES DATABASE" value={formatCurrency(bodStats.salesDatabase)} percent={formatPercent(bodStats.dbPercent)}>
            {closingRows(bodStats.closingDatabase)}
            {customerRows(bodStats.customerDatabase)}
          </PlatformCard>
          <PlatformCard icon={ShoppingBag} tone="orange" label="SALES SHOPEE" value={formatCurrency(bodStats.salesShopee)} percent={formatPercent(bodStats.shopeePercent)}>
            {closingRows(bodStats.closingShopee, { live: true, shop: true })}
            {customerRows(bodStats.customerShopee)}
          </PlatformCard>
          <PlatformCard icon={Play} tone="pink" label="SALES TIKTOK" value={formatCurrency(bodStats.salesTiktok)} percent={formatPercent(bodStats.tiktokPercent)}>
            {closingRows(bodStats.closingTiktok, { live: true, shop: true })}
            {customerRows(bodStats.customerTiktok)}
          </PlatformCard>
          <PlatformCard icon={SearchIcon} tone="red" label="SALES GOOGLE" value={formatCurrency(bodStats.salesGoogle)} percent={formatPercent(bodStats.googlePercent)}>
            {closingRows(bodStats.closingGoogle)}
            {customerRows(bodStats.customerGoogle)}
          </PlatformCard>
        </div>

        {/* Closing Summary Row (All Platforms) */}
        <div className={KPI_GRID}>
          <StatCard className={KPI} icon={ClipboardList} tone="slate" label="CLOSING MANUAL" value={formatCurrency(bodStats.salesManual)} hint={formatPercent(bodStats.manualPercent)} />
          <StatCard className={KPI} icon={Phone} tone="green" label="CLOSING WA BOT" value={formatCurrency(bodStats.salesWaBot)} hint={formatPercent(bodStats.waBotPercent)} />
          <StatCard className={KPI} icon={Globe} tone="purple" label="CLOSING WEBSITE" value={formatCurrency(bodStats.salesWebsite)} hint={formatPercent(bodStats.websitePercent)} />
          <StatCard className={KPI} icon={Phone} tone="blue" label="CLOSING CALL" value={formatCurrency(bodStats.salesCall)} hint={formatPercent(bodStats.callPercent)} />
          <StatCard className={KPI} icon={Play} tone="pink" label="CLOSING LIVE" value={formatCurrency(bodStats.salesLive)} hint={formatPercent(bodStats.livePercent)} />
          <StatCard className={KPI} icon={ShoppingBag} tone="orange" label="CLOSING SHOP" value={formatCurrency(bodStats.salesShop)} hint={formatPercent(bodStats.shopPercent)} />
        </div>

        {/* Customer Type Sales Row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard className={KPI} icon={UserPlus} tone="cyan" label="SALES NP" value={formatCurrency(bodStats.salesNP)} hint={<>{formatPercent(bodStats.npPercent)} - New Prospect</>} />
          <StatCard className={KPI} icon={Users} tone="amber" label="SALES EP" value={formatCurrency(bodStats.salesEP)} hint={<>{formatPercent(bodStats.epPercent)} - Existing Prospect</>} />
          <StatCard className={KPI} icon={UserCheck} tone="green" label="SALES EC" value={formatCurrency(bodStats.salesEC)} hint={<>{formatPercent(bodStats.ecPercent)} - Existing Customer</>} />
        </div>

        {/* Lead Stats Row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard className={KPI} icon={Phone} tone="indigo" label="TOTAL LEAD" value={bodStats.totalLead} hint="Prospects in period" />
          <StatCard className={KPI} icon={Target} tone="cyan" label="AVERAGE KPK" value={formatCurrency(bodStats.averageKPK)} hint="Kos Per Lead" />
          {/* Closing Rate Lead */}
          <HighlightCard className="col-span-2 lg:col-span-1" icon={Percent} label="CLOSING RATE" value={formatPercent(bodStats.closingRate)} hint="Lead Conversion" />
        </div>

        {/* Sales Chart - Chart.js */}
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-start gap-3">
            <IconTile icon={LineChartIcon} tone="blue" size="sm" />
            <h2 className="pt-1 text-base font-semibold text-foreground sm:text-lg sm:pt-0.5">
              Sales Trend from {format(parseISO(startDate), 'dd-MMM-yyyy')} to {format(parseISO(endDate), 'dd-MMM-yyyy')}
            </h2>
          </div>
          <div className="h-64 sm:h-80">
            <Line data={bodChartData} options={bodChartOptions} />
          </div>
        </div>
      </div>
    );
  }

  // Default Dashboard for other roles (admin, account)
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={<>Welcome back, {profile?.fullName || 'User'}!</>}
        description="Here's an overview of your system and performance."
        icon={LayoutDashboard}
        tone="brand"
      />

      {/* Default dashboard content - can be customized per role later */}
      <div className="rounded-xl border border-border/80 bg-card shadow-sm">
        <EmptyState icon={LayoutDashboard} title={<>Dashboard for {profile?.role || 'user'} role coming soon...</>} />
      </div>
    </div>
  );
};

export default Dashboard;
