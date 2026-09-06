import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/hooks/useTeam";
import { TeamFilter } from "@/components/TeamFilter";
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, fetchAllRows } from "@/lib/utils";
import {
  Package, Clock, Truck, RotateCcw, CheckCircle2, Loader2, Calendar,
  Facebook, Database, Globe, ShoppingBag, Video, Banknote, CreditCard, ClipboardList,
} from "lucide-react";

// Logistic Summary — top-of-page overview of all orders in a date range.
const LogisticSummary = () => {
  const [pendingStart, setPendingStart] = useState(getMalaysiaStartOfMonth());
  const [pendingEnd, setPendingEnd] = useState(getMalaysiaEndOfMonth());
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  const [teamFilter, setTeamFilter] = useState("");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["logistic-summary", startDate, endDate],
    queryFn: async () => {
      const data = await fetchAllRows(() =>
        supabase
          .from("customer_purchases")
          .select("marketer_id_staff, delivery_status, jenis_platform, type_payment, kurier, total_sale")
          .gte("date_order", startDate)
          .lte("date_order", endDate)
          .order("date_order", { ascending: false })
      );
      return data || [];
    },
  });

  const rows = teamFilter ? orders.filter((o: any) => (o.marketer_id_staff || "") === teamFilter) : orders;

  const s = useMemo(() => {
    const platform = (o: any) => o.jenis_platform || "Manual";
    const isCod = (o: any) => o.type_payment === "COD" || (o.kurier || "").includes("COD");
    return {
      total: rows.length,
      success: rows.filter((o: any) => o.delivery_status === "Success").length,
      pending: rows.filter((o: any) => o.delivery_status === "Pending").length,
      process: rows.filter((o: any) => o.delivery_status === "Shipped").length,
      returned: rows.filter((o: any) => o.delivery_status === "Return").length,
      facebook: rows.filter((o: any) => platform(o) === "Facebook").length,
      database: rows.filter((o: any) => platform(o) === "Database").length,
      google: rows.filter((o: any) => platform(o) === "Google").length,
      shopee: rows.filter((o: any) => platform(o) === "Shopee").length,
      tiktok: rows.filter((o: any) => platform(o) === "Tiktok").length,
      cash: rows.filter((o: any) => !isCod(o)).length,
      cod: rows.filter((o: any) => isCod(o)).length,
      // Pending Tracking = shipped & at courier (exclude pickup) — includes CASH + COD.
      pendingTracking: rows.filter((o: any) =>
        o.delivery_status === "Shipped" && !(o.kurier || "").toUpperCase().includes("PICKUP")).length,
    };
  }, [rows]);

  const Stat = ({ icon, label, value, sub, color, border }: any) => (
    <div className={`bg-card border-l-4 ${border} border border-border rounded-xl p-4`}>
      <div className={`flex items-center gap-2 ${color} mb-1`}>{icon}<span className="text-xs uppercase font-semibold tracking-wide">{label}</span></div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Summary</h1>
        <p className="text-muted-foreground mt-1">Ringkasan operasi logistik</p>
      </div>

      {/* Date range + team */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2"><Calendar className="w-5 h-5 text-muted-foreground" /><span className="text-sm font-medium">Date Range:</span></div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">From</label>
            <input type="date" value={pendingStart} onChange={(e) => setPendingStart(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">To</label>
            <input type="date" value={pendingEnd} onChange={(e) => setPendingEnd(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm" />
          </div>
          <button onClick={() => { setStartDate(pendingStart); setEndDate(pendingEnd); }} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Apply</button>
          <div className="ml-auto"><TeamFilter value={teamFilter} onChange={setTeamFilter} /></div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Row 1 — order lifecycle (Total Order + Total Success first) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Stat icon={<Package className="w-4 h-4" />} label="Total Order" value={s.total} sub="All orders in period" color="text-primary" border="border-l-primary" />
            <Stat icon={<CheckCircle2 className="w-4 h-4" />} label="Total Success" value={s.success} sub="Delivered orders" color="text-green-600" border="border-l-green-500" />
            <Stat icon={<Clock className="w-4 h-4" />} label="Total Pending" value={s.pending} sub="Awaiting processing" color="text-amber-600" border="border-l-amber-500" />
            <Stat icon={<Truck className="w-4 h-4" />} label="Total Process" value={s.process} sub="Shipped orders" color="text-blue-600" border="border-l-blue-500" />
            <Stat icon={<RotateCcw className="w-4 h-4" />} label="Total Return" value={s.returned} sub="Returned orders" color="text-red-600" border="border-l-red-500" />
          </div>

          {/* Row 2 — platform breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Stat icon={<Facebook className="w-4 h-4" />} label="Total Facebook" value={s.facebook} sub="Facebook orders" color="text-blue-600" border="border-l-blue-400" />
            <Stat icon={<Database className="w-4 h-4" />} label="Total Database" value={s.database} sub="Database orders" color="text-purple-600" border="border-l-purple-400" />
            <Stat icon={<Globe className="w-4 h-4" />} label="Total Google" value={s.google} sub="Google orders" color="text-green-600" border="border-l-green-400" />
            <Stat icon={<ShoppingBag className="w-4 h-4" />} label="Total Shopee" value={s.shopee} sub="Shopee orders" color="text-orange-600" border="border-l-orange-400" />
            <Stat icon={<Video className="w-4 h-4" />} label="Total Tiktok" value={s.tiktok} sub="TikTok orders" color="text-pink-600" border="border-l-pink-400" />
          </div>

          {/* Row 3 — payment + pending tracking (incl. cash) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Stat icon={<Banknote className="w-4 h-4" />} label="Total Cash" value={s.cash} sub="Cash payments" color="text-green-600" border="border-l-green-500" />
            <Stat icon={<CreditCard className="w-4 h-4" />} label="Total COD" value={s.cod} sub="Cash on Delivery" color="text-orange-600" border="border-l-orange-500" />
            <div className="bg-primary text-primary-foreground rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1"><ClipboardList className="w-4 h-4" /><span className="text-xs uppercase font-semibold tracking-wide">Pending Tracking</span></div>
              <p className="text-2xl font-bold">{s.pendingTracking}</p>
              <p className="text-xs opacity-80 mt-0.5">Awaiting delivery confirmation (COD + Cash)</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LogisticSummary;
