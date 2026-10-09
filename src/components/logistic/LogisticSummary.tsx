import { useMemo, useState, type ElementType, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/hooks/useTeam";
import { TeamFilter } from "@/components/TeamFilter";
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth, fetchAllRows } from "@/lib/utils";
import {
  Package, Clock, Truck, RotateCcw, CheckCircle2, Calendar,
  Banknote, CreditCard, AlertTriangle, PackageCheck, Ban, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, IconTile, CardsSkeleton, EmptyState, type Tone } from "@/components/common/SoftUI";

import UnappliedDateNote from '@/components/UnappliedDateNote';
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
      // Success & Return are OUTCOMES of a shipped parcel — subsets of Shipped,
      // shown for detail. They are NOT added into the top-line tally.
      success: by((o: any) => o.delivery_status === "Success"),
      pending: by((o: any) => o.delivery_status === "Pending"),
      // Total Shipped = ever shipped (in-transit + delivered + returned) so the
      // three top-line states partition every order:
      //   Pending + Shipped + Reject = Total Order.
      process: by((o: any) => ["Shipped", "Success", "Return"].includes(o.delivery_status)),
      returned: by((o: any) => o.delivery_status === "Return"),
      // Reject = catch-all for anything not Pending/Shipped/Success/Return
      // (Rejected, Cancelled, …).
      rejected: by((o: any) => !["Pending", "Shipped", "Success", "Return"].includes(o.delivery_status)),
      problematic: by(isProblem),
      pickup: by(isPickup),
      cash: rows.filter((o: any) => !isCod(o)).length,
      cod: rows.filter((o: any) => isCod(o)).length,
      couriers,
    };
  }, [rows]);

  // Icon-tile colour per courier for the compare row.
  const COURIER_TONE: Record<string, Tone> = {
    JNT: "red", Poslaju: "amber", Ninjavan: "pink",
    DHL: "cyan", SPX: "orange", Pickup: "blue",
  };

  // Small COD/Cash/Pickup breakdown shown inside every lifecycle/platform box.
  const Split = ({ v }: { v: { cod: number; cash: number; pickup: number } }) => (
    <p className="text-[11px] mt-1.5 flex items-center gap-x-2 gap-y-0.5 flex-wrap">
      <span className="text-orange-600 dark:text-orange-400 font-medium">COD {v.cod}</span>
      <span className="text-muted-foreground">·</span>
      <span className="text-green-600 dark:text-green-400 font-medium">Cash {v.cash}</span>
      <span className="text-muted-foreground">·</span>
      <span className="text-blue-600 dark:text-blue-400 font-medium">Pickup {v.pickup}</span>
    </p>
  );

  // Soft stat tile: icon tile + small label on top, big value, then sub text and
  // the COD/Cash/Pickup split (kept stacked so nothing is truncated on phones).
  const Stat = ({ icon, label, value, sub, tone, split }: {
    icon: ElementType; label: ReactNode; value: ReactNode; sub?: ReactNode; tone: Tone;
    split?: { cod: number; cash: number; pickup: number };
  }) => (
    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex min-w-0 items-center gap-2">
        <IconTile icon={icon} tone={tone} size="sm" />
        <span className="section-label truncate">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-bold leading-tight tracking-tight text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      {split && <Split v={split} />}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Summary" description="Ringkasan operasi logistik" icon={BarChart3} tone="brand" />

      {/* Date range + team */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex items-center gap-2 sm:self-center"><IconTile icon={Calendar} tone="blue" size="sm" /><span className="whitespace-nowrap text-sm font-medium">Date Range:</span></div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
            <div className="min-w-0">
              <label className="section-label mb-1 block">From</label>
              <input type="date" value={pendingStart} onChange={(e) => setPendingStart(e.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm shadow-xs focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 sm:w-44" />
            </div>
            <div className="min-w-0">
              <label className="section-label mb-1 block">To</label>
              <input type="date" value={pendingEnd} onChange={(e) => setPendingEnd(e.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm shadow-xs focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 sm:w-44" />
            </div>
          </div>
          <Button onClick={() => { setStartDate(pendingStart); setEndDate(pendingEnd); }} className="h-10 w-full sm:w-auto">Apply</Button>
          <UnappliedDateNote pendingStart={pendingStart} pendingEnd={pendingEnd} startDate={startDate} endDate={endDate} />
          <div className="sm:ml-auto"><TeamFilter value={teamFilter} onChange={setTeamFilter} /></div>
        </div>
      </div>

      {isLoading ? (
        <CardsSkeleton count={8} />
      ) : (
        <>
          {/* Row 1 — top-line lifecycle. These three partition every order, so:
              Total Order = Total Pending + Total Shipped + Total Reject. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={Package} label="Total Order" value={s.total.n} split={s.total} sub="All orders in period" tone="indigo" />
            <Stat icon={Clock} label="Total Pending" value={s.pending.n} split={s.pending} sub="Awaiting processing" tone="amber" />
            <Stat icon={Truck} label="Total Shipped" value={s.process.n} split={s.process} sub="Ever shipped (incl. success/return)" tone="blue" />
            <Stat icon={Ban} label="Total Reject" value={s.rejected.n} split={s.rejected} sub="Rejected / cancelled" tone="slate" />
          </div>

          {/* Breakdown of Shipped — Success vs Return (subsets of Total Shipped). */}
          <div>
            <p className="section-label mb-2">Breakdown of Shipped</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat icon={CheckCircle2} label="Total Success" value={s.success.n} split={s.success} sub="Delivered orders" tone="green" />
              <Stat icon={RotateCcw} label="Total Return" value={s.returned.n} split={s.returned} sub="Returned orders" tone="red" />
              <Stat icon={Truck} label="Remaining Ship" value={s.process.n - s.success.n - s.returned.n} sub="Shipped, still in transit" tone="cyan" />
            </div>
          </div>

          {/* Row 2 — Courier Compare (per courier keyed in, by date range) */}
          <div>
            <p className="section-label mb-2">Courier Compare</p>
            {s.couriers.length === 0 ? (
              <EmptyState icon={Truck} title="Tiada order dalam tempoh ini." className="rounded-xl border border-dashed py-8" />
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {s.couriers.map((c) => (
                  <Stat
                    key={c.name}
                    icon={Truck}
                    label={c.name}
                    value={c.t.n}
                    split={c.t}
                    sub="orders"
                    tone={COURIER_TONE[c.name] || "slate"}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Row 3 — payment + total pickup */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat icon={Banknote} label="Total Cash" value={s.cash} sub="Cash payments" tone="green" />
            <Stat icon={CreditCard} label="Total COD" value={s.cod} sub="Cash on Delivery" tone="orange" />
            <Stat icon={PackageCheck} label="Total Pickup" value={s.pickup.n} sub="Self pickup / collect" tone="blue" />
          </div>
        </>
      )}
    </div>
  );
};

export default LogisticSummary;
