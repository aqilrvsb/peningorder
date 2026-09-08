import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/hooks/useTeam";
import { TeamFilter } from "@/components/TeamFilter";
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, fetchAllRows } from "@/lib/utils";
import {
  Package, Clock, Truck, RotateCcw, CheckCircle2, Loader2, Calendar,
  Banknote, CreditCard, AlertTriangle, PackageCheck,
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
          .select("marketer_id_staff, delivery_status, jenis_platform, type_payment, kurier, total_sale, seos")
          .gte("date_order", startDate)
          .lte("date_order", endDate)
          .order("date_order", { ascending: false })
      );
      return data || [];
    },
  });

  const rows = teamFilter ? orders.filter((o: any) => (o.marketer_id_staff || "") === teamFilter) : orders;

  const isCod = (o: any) => o.type_payment === "COD" || (o.kurier || "").includes("COD");

  const isPickup = (o: any) => (o.kurier || "").toUpperCase().includes("PICKUP");

  // Problematic = a Shipped (in-transit) order whose live parcel status (seos)
  // hints a delivery problem — high chance of Return.
  const PROBLEM_RE = /problem|failed|gagal|unsuccess|unable|reject|reschedul|not available|no answer|wrong address|attempt|tidak dapat|return/i;
  const isProblem = (o: any) => o.delivery_status === "Shipped" && PROBLEM_RE.test(o.seos || "");

  // Courier name from the kurier field ("JNT COD" -> "JNT", "PICKUP" -> "Pickup").
  const courierOf = (o: any): string => {
    const k = (o.kurier || "").trim();
    if (!k) return "Lain-lain";
    const up = k.toUpperCase();
    if (up.includes("PICKUP")) return "Pickup";
    if (up.includes("TIKTOK")) return "Kurier Tiktok";
    if (up.includes("SHOPEE")) return "Kurier Shopee";
    return k.replace(/\s+(COD|CASH)$/i, "").trim() || "Lain-lain";
  };

  // Count a subset and its COD / Cash / Pickup split in one pass.
  const tally = (list: any[]) => {
    let cod = 0, cash = 0, pickup = 0;
    for (const o of list) {
      if (isPickup(o)) pickup++;
      isCod(o) ? cod++ : cash++;
    }
    return { n: list.length, cod, cash, pickup };
  };

  const s = useMemo(() => {
    const by = (pred: (o: any) => boolean) => tally(rows.filter(pred));
    // Courier compare — one card per courier actually keyed in (for this date
    // range + team), most orders first.
    const courierNames = [...new Set(rows.map(courierOf))];
    const couriers = courierNames
      .map((name) => ({ name, t: tally(rows.filter((o: any) => courierOf(o) === name)) }))
      .sort((a, b) => b.t.n - a.t.n);
    return {
      total: tally(rows),
      success: by((o: any) => o.delivery_status === "Success"),
      pending: by((o: any) => o.delivery_status === "Pending"),
      process: by((o: any) => o.delivery_status === "Shipped"),
      returned: by((o: any) => o.delivery_status === "Return"),
      problematic: by(isProblem),
      pickup: by(isPickup),
      cash: rows.filter((o: any) => !isCod(o)).length,
      cod: rows.filter((o: any) => isCod(o)).length,
      couriers,
    };
  }, [rows]);

  // Left-border colour per courier for the compare row.
  const COURIER_BORDER: Record<string, string> = {
    JNT: "border-l-red-500", Poslaju: "border-l-yellow-500", Ninjavan: "border-l-rose-500",
    DHL: "border-l-amber-500", SPX: "border-l-orange-500", Pickup: "border-l-blue-500",
  };

  // Small COD/Cash/Pickup breakdown shown inside every lifecycle/platform box.
  const Split = ({ v }: { v: { cod: number; cash: number; pickup: number } }) => (
    <p className="text-[11px] mt-1 flex items-center gap-2 flex-wrap">
      <span className="text-orange-600 font-medium">COD {v.cod}</span>
      <span className="text-muted-foreground">·</span>
      <span className="text-green-600 font-medium">Cash {v.cash}</span>
      <span className="text-muted-foreground">·</span>
      <span className="text-blue-600 font-medium">Pickup {v.pickup}</span>
    </p>
  );

  const Stat = ({ icon, label, value, sub, color, border, split }: any) => (
    <div className={`bg-card border-l-4 ${border} border border-border rounded-xl p-4`}>
      <div className={`flex items-center gap-2 ${color} mb-1`}>{icon}<span className="text-xs uppercase font-semibold tracking-wide">{label}</span></div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      {split && <Split v={split} />}
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
          {/* Row 1 — order lifecycle, in order:
              Order → Pending → Process → Problematic → Success → Return */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Stat icon={<Package className="w-4 h-4" />} label="Total Order" value={s.total.n} split={s.total} sub="All orders in period" color="text-primary" border="border-l-primary" />
            <Stat icon={<Clock className="w-4 h-4" />} label="Total Pending" value={s.pending.n} split={s.pending} sub="Awaiting processing" color="text-amber-600" border="border-l-amber-500" />
            <Stat icon={<Truck className="w-4 h-4" />} label="Total Process" value={s.process.n} split={s.process} sub="Shipped orders" color="text-blue-600" border="border-l-blue-500" />
            <Stat icon={<AlertTriangle className="w-4 h-4" />} label="Total Problematic" value={s.problematic.n} split={s.problematic} sub="Shipped — status ada masalah" color="text-red-600" border="border-l-red-500" />
            <Stat icon={<CheckCircle2 className="w-4 h-4" />} label="Total Success" value={s.success.n} split={s.success} sub="Delivered orders" color="text-green-600" border="border-l-green-500" />
            <Stat icon={<RotateCcw className="w-4 h-4" />} label="Total Return" value={s.returned.n} split={s.returned} sub="Returned orders" color="text-red-600" border="border-l-red-600" />
          </div>

          {/* Row 2 — Courier Compare (per courier keyed in, by date range) */}
          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-2">Courier Compare</p>
            {s.couriers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tiada order dalam tempoh ini.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {s.couriers.map((c) => (
                  <Stat
                    key={c.name}
                    icon={<Truck className="w-4 h-4" />}
                    label={c.name}
                    value={c.t.n}
                    split={c.t}
                    sub="orders"
                    color="text-foreground"
                    border={COURIER_BORDER[c.name] || "border-l-primary"}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Row 3 — payment + total pickup */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Stat icon={<Banknote className="w-4 h-4" />} label="Total Cash" value={s.cash} sub="Cash payments" color="text-green-600" border="border-l-green-500" />
            <Stat icon={<CreditCard className="w-4 h-4" />} label="Total COD" value={s.cod} sub="Cash on Delivery" color="text-orange-600" border="border-l-orange-500" />
            <Stat icon={<PackageCheck className="w-4 h-4" />} label="Total Pickup" value={s.pickup.n} sub="Self pickup / collect" color="text-blue-600" border="border-l-blue-500" />
          </div>
        </>
      )}
    </div>
  );
};

export default LogisticSummary;
