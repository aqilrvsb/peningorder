import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { TeamFilter } from "@/components/TeamFilter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMalaysiaDate, fetchAllRows } from "@/lib/utils";
import { TablePagination } from "@/components/TablePagination";
import { CalendarClock, Loader2, Search, Truck, Lock, RefreshCw, Boxes } from "lucide-react";
import { toast } from "sonner";
import Swal from "sweetalert2";

// "Order Pospada" — bookings keyed in with a future dispatch date. They wait here
// until that date, when logistic generates the ParcelDaily tracking (the booking
// had none) and the order moves to Processed.
const daysUntil = (dateStr: string, today: string) => {
  const d = Math.round((new Date(dateStr).getTime() - new Date(today).getTime()) / 86400000);
  return d;
};

const LogisticOrderPospada = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = getMalaysiaDate();

  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const { nameByIdstaff } = useTeam();
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ["logistic-pospada"],
    queryFn: async () => {
      const data = await fetchAllRows(() =>
        supabase
          .from("customer_purchases")
          .select(`*, bundle:logistic_bundles(name, sku)`)
          .eq("delivery_status", "Pending")
          .not("pospada_date", "is", null)
          .order("pospada_date", { ascending: true })
      );
      return data || [];
    },
  });

  const filteredOrders = orders.filter((order: any) => {
    if (teamFilter && (order.marketer_id_staff || "") !== teamFilter) return false;
    if (search.trim()) {
      const terms = search.toLowerCase().split("+").map((s) => s.trim()).filter(Boolean);
      const ok = terms.every((t) =>
        order.name_customer?.toLowerCase().includes(t) ||
        order.phone_customer?.toLowerCase().includes(t) ||
        order.bundle?.name?.toLowerCase().includes(t) ||
        order.address_customer?.toLowerCase().includes(t)
      );
      if (!ok) return false;
    }
    return true;
  });

  const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const dueCount = filteredOrders.filter((o: any) => (o.pospada_date || "") <= today).length;
  const upcomingCount = filteredOrders.length - dueCount;
  const totalBox = filteredOrders.reduce((sum: number, o: any) => sum + (Number(o.unit) || 0), 0);

  const handleSync = async () => {
    setIsSyncing(true);
    try { await refetch(); toast.success("Synced"); } finally { setIsSyncing(false); }
  };

  // Generate tracking for a due booking, then move it to Processed.
  const handleProcess = async (order: any) => {
    const isPickup = String(order.kurier || "").toUpperCase() === "PICKUP";

    // Self-collect bookings have no courier — just mark collected -> Processed.
    if (isPickup) {
      const { isConfirmed } = await Swal.fire({
        title: "Proses Pospada (Pickup)",
        text: "Tandakan order pickup ini sebagai selesai (Processed)?",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Ya, proses",
        cancelButtonText: "Batal",
      });
      if (!isConfirmed) return;
      setProcessingId(order.id);
      try {
        const isCash = order.type_payment === "CASH" || order.type_payment === "Pickup";
        const { error } = await supabase
          .from("customer_purchases")
          .update({ delivery_status: "Shipped", date_processed: today, ...(isCash ? {} : { seo: "Shipped" }) })
          .eq("id", order.id);
        if (error) throw error;
        toast.success(`Pospada pickup ${order.id_sale || "order"} diproses.`);
        queryClient.invalidateQueries({ queryKey: ["logistic-pospada"] });
        queryClient.invalidateQueries({ queryKey: ["logistic-processed"] });
      } catch (error: any) {
        toast.error(error.message || "Gagal proses pospada");
      } finally {
        setProcessingId(null);
      }
      return;
    }

    const { value: postcode, isConfirmed } = await Swal.fire({
      title: "Proses Pospada",
      text: "Sahkan poskod untuk jana tracking:",
      input: "text",
      inputValue: order.postcode_customer || "",
      inputPlaceholder: "cth: 15100",
      showCancelButton: true,
      confirmButtonText: "Jana Tracking",
      cancelButtonText: "Batal",
      inputValidator: (value) => (!value || value.trim().length < 5 ? "Sila masukkan poskod yang sah" : null),
    });
    if (!isConfirmed || !postcode) return;

    setProcessingId(order.id);
    try {
      const k = String(order.kurier || "").toLowerCase();
      const courierCode = k.includes("jnt") || k.includes("j&t") ? "jnt"
        : k.includes("poslaju") ? "poslaju"
        : k.includes("dhl") ? "dhl"
        : k.includes("spx") || k.includes("shopee") ? "spx"
        : "ninjavan";

      const response = await supabase.functions.invoke("parceldaily-order", {
        body: {
          profileId: user?.id,
          customerName: order.name_customer || "Customer",
          phone: order.phone_customer || "",
          address: order.address_customer || "",
          postcode: postcode.trim(),
          city: order.city_customer || "",
          state: order.state_customer || "",
          price: Number(order.total_sale || 0),
          paymentMethod: order.type_payment || "CASH",
          productName: order.bundle?.name || "Product",
          productSku: order.bundle?.sku || "",
          quantity: order.unit || 1,
          nota: order.nota_staff || "",
          courier: courierCode,
        },
      });
      if (response.error) throw new Error(response.error.message || "Failed to generate tracking");
      const result = response.data;
      if (result?.error) throw new Error(result.error);
      if (!result?.orderId) throw new Error("Courier did not return an orderId");

      const isCash = order.type_payment === "CASH";
      const { error: updateError } = await supabase
        .from("customer_purchases")
        .update({
          tracking_number: result.trackingNumber || result.orderId,
          pd_order_id: result.orderId,
          ...(result.shippingPrice != null && { cost_postage: Number(result.shippingPrice) }),
          ...(postcode !== order.postcode_customer && { postcode_customer: postcode.trim() }),
          // Move the booking to Processed.
          delivery_status: "Shipped",
          date_processed: today,
          ...(isCash ? {} : { seo: "Shipped" }),
        })
        .eq("id", order.id);
      if (updateError) throw updateError;

      toast.success(`Pospada ${order.id_sale || "order"} diproses — tracking dijana.`);
      queryClient.invalidateQueries({ queryKey: ["logistic-pospada"] });
      queryClient.invalidateQueries({ queryKey: ["logistic-processed"] });
    } catch (error: any) {
      console.error("Process pospada error:", error);
      toast.error(error.message || "Gagal proses pospada");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Order Pospada</h1>
          <p className="text-muted-foreground mt-2">Booking order — tracking dijana pada tarikh pospada</p>
        </div>
        <Button variant="outline" onClick={handleSync} disabled={isSyncing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} /> Sync
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card><CardContent className="p-6">
          <div className="flex items-center gap-3">
            <CalendarClock className="w-8 h-8 text-purple-500" />
            <div>
              <p className="text-2xl font-bold">{filteredOrders.length}</p>
              <p className="text-sm text-muted-foreground">Total Order Pospada</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-6">
          <div className="flex items-center gap-3">
            <Boxes className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold text-blue-600">{totalBox}</p>
              <p className="text-sm text-muted-foreground">Total Box Pospada</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-6">
          <div className="flex items-center gap-3">
            <Truck className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-green-600">{dueCount}</p>
              <p className="text-sm text-muted-foreground">Sedia diproses (due)</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-6">
          <div className="flex items-center gap-3">
            <Lock className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold text-amber-600">{upcomingCount}</p>
              <p className="text-sm text-muted-foreground">Akan datang</p>
            </div>
          </div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <Card><CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search... (use + to combine)"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="pl-10"
            />
          </div>
          <TeamFilter value={teamFilter} onChange={(v) => { setTeamFilter(v); setCurrentPage(1); }} />
        </div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left">No</th>
                    <th className="p-2 text-left text-blue-600 dark:text-blue-400">ID Staff</th>
                    <th className="p-2 text-left text-blue-600 dark:text-blue-400">Nama</th>
                    <th className="p-2 text-left">Tarikh Order</th>
                    <th className="p-2 text-left">Tarikh Pospada</th>
                    <th className="p-2 text-left">Nama Pelanggan</th>
                    <th className="p-2 text-left">Phone</th>
                    <th className="p-2 text-left">Produk</th>
                    <th className="p-2 text-left">Kurier</th>
                    <th className="p-2 text-left">Total Sales</th>
                    <th className="p-2 text-left">Cara Bayaran</th>
                    <th className="p-2 text-left">Alamat</th>
                    <th className="p-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.length > 0 ? (
                    paginatedOrders.map((order: any, index: number) => {
                      const due = (order.pospada_date || "") <= today;
                      const inDays = daysUntil(order.pospada_date, today);
                      return (
                        <tr key={order.id} className="border-b hover:bg-muted/30">
                          <td className="p-2">{(currentPage - 1) * pageSize + index + 1}</td>
                          <td className="p-2 whitespace-nowrap font-mono text-blue-600 dark:text-blue-400">{order.marketer_id_staff || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{nameByIdstaff.get(order.marketer_id_staff || "") || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.date_order || "-"}</td>
                          <td className="p-2 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${due ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                              {order.pospada_date}
                            </span>
                          </td>
                          <td className="p-2">{order.name_customer || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{order.phone_customer || "-"}</td>
                          <td className="p-2"><span className="truncate max-w-[150px] block">{order.bundle?.name || order.nota_staff || "-"}</span></td>
                          <td className="p-2 whitespace-nowrap">{order.kurier || "-"}</td>
                          <td className="p-2 whitespace-nowrap">RM {Number(order.total_sale || 0).toFixed(2)}</td>
                          <td className="p-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${order.type_payment === "COD" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                              {order.type_payment || "-"}
                            </span>
                          </td>
                          <td className="p-2">
                            <div className="max-w-[150px]">
                              <p className="text-xs truncate">{order.address_customer || "-"}</p>
                              <p className="text-xs text-muted-foreground truncate">{order.postcode_customer} {order.city_customer}</p>
                            </div>
                          </td>
                          <td className="p-2">
                            {due ? (
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                                disabled={processingId === order.id}
                                onClick={() => handleProcess(order)}
                              >
                                {processingId === order.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Truck className="w-3 h-3 mr-1" />}
                                Proses
                              </Button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                                <Lock className="w-3 h-3" /> {inDays} hari lagi
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr><td colSpan={13} className="text-center py-12 text-muted-foreground">Tiada order pospada.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination page={currentPage} pageSize={pageSize} total={filteredOrders.length} onPageChange={setCurrentPage} />
          </>
        )}
      </CardContent></Card>
    </div>
  );
};

export default LogisticOrderPospada;
