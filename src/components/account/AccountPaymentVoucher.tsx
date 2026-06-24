import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getMalaysiaDate } from "@/lib/utils";
import { AUDIT_MODE } from "@/lib/audit";
import {
  Loader2,
  Plus,
  Trash2,
  Edit2,
  FileText,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import Swal from "sweetalert2";

const PAGE_SIZE_OPTIONS = [10, 50, 100, "All"] as const;
const PAYMENT_METHOD_OPTIONS = [
  "Cash",
  "Bank Transfer",
  "Cheque",
  "Online Banking",
  "E-Wallet",
];

interface PaymentVoucher {
  id: string;
  voucher_number: string;
  date: string;
  pay_to: string;
  pay_by: string;
  payment_method: string;
  amount: number;
  purpose_of_payment: string;
  note: string;
  created_at: string;
}

const AccountPaymentVoucher = () => {
  const queryClient = useQueryClient();
  const today = getMalaysiaDate();
  const firstDayOfMonth = today.substring(0, 8) + "01";

  // Filter states
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [pageSize, setPageSize] = useState<number | "All">(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [formDate, setFormDate] = useState(today);
  const [formPayTo, setFormPayTo] = useState("");
  const [formPayBy, setFormPayBy] = useState("");
  const [formPaymentMethod, setFormPaymentMethod] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formPurpose, setFormPurpose] = useState("");
  const [formNote, setFormNote] = useState("");

  // Generate next voucher number
  const generateVoucherNumber = async () => {
    const { data, error } = await supabase
      .from("payment_vouchers")
      .select("voucher_number")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0 || !data[0].voucher_number) {
      return `PV-${new Date().getFullYear()}-0001`;
    }

    const latest = data[0].voucher_number;
    const match = latest.match(/PV-(\d{4})-(\d+)/);

    if (match) {
      const year = parseInt(match[1]);
      const currentYear = new Date().getFullYear();
      if (year === currentYear) {
        const num = parseInt(match[2]) + 1;
        return `PV-${currentYear}-${num.toString().padStart(4, "0")}`;
      }
      return `PV-${currentYear}-0001`;
    }

    return `PV-${new Date().getFullYear()}-0001`;
  };

  // Fetch vouchers
  const { data: vouchers = [], isLoading } = useQuery({
    queryKey: ["payment-vouchers", startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("payment_vouchers")
        .select("*")
        .order("created_at", { ascending: false });

      if (startDate) query = query.gte("date", startDate);
      if (endDate) query = query.lte("date", endDate);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as PaymentVoucher[];
    },
  });

  // Pagination
  const totalPages =
    pageSize === "All" ? 1 : Math.ceil(vouchers.length / (pageSize as number));
  const paginatedData =
    pageSize === "All"
      ? vouchers
      : vouchers.slice(
          (currentPage - 1) * (pageSize as number),
          currentPage * (pageSize as number)
        );

  // Totals
  const totalAmount = vouchers.reduce(
    (sum, v) => sum + Number(v.amount || 0),
    0
  );

  // Reset form
  const resetForm = () => {
    setFormDate(today);
    setFormPayTo("");
    setFormPayBy("");
    setFormPaymentMethod("");
    setFormAmount("");
    setFormPurpose("");
    setFormNote("");
    setIsEditing(false);
    setEditingId(null);
  };

  const handleAddClick = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEditClick = (v: PaymentVoucher) => {
    setFormDate(v.date);
    setFormPayTo(v.pay_to);
    setFormPayBy(v.pay_by);
    setFormPaymentMethod(v.payment_method);
    setFormAmount(v.amount.toString());
    setFormPurpose(v.purpose_of_payment || "");
    setFormNote(v.note || "");
    setIsEditing(true);
    setEditingId(v.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formDate) {
      toast.error("Please select date");
      return;
    }
    if (!formPayTo.trim()) {
      toast.error("Please enter Pay To");
      return;
    }
    if (!formPayBy.trim()) {
      toast.error("Please enter Pay By");
      return;
    }
    if (!formPaymentMethod) {
      toast.error("Please select Payment Method");
      return;
    }
    if (!formAmount || Number(formAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsSubmitting(true);
    try {
      let voucherNumber = "";
      if (!isEditing) {
        voucherNumber = await generateVoucherNumber();
      }

      const voucherData: any = {
        date: formDate,
        pay_to: formPayTo.trim(),
        pay_by: formPayBy.trim(),
        payment_method: formPaymentMethod,
        amount: Number(formAmount),
        purpose_of_payment: formPurpose.trim(),
        note: formNote.trim(),
        updated_at: new Date().toISOString(),
      };

      if (isEditing && editingId) {
        const { error } = await supabase
          .from("payment_vouchers")
          .update(voucherData)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Payment voucher updated successfully");
      } else {
        voucherData.voucher_number = voucherNumber;
        const { error } = await supabase
          .from("payment_vouchers")
          .insert(voucherData);
        if (error) throw error;
        toast.success("Payment voucher added successfully");
      }

      queryClient.invalidateQueries({ queryKey: ["payment-vouchers"] });
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Failed to save payment voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      icon: "warning",
      title: "Delete Payment Voucher?",
      text: "This action cannot be undone.",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      const { error } = await supabase
        .from("payment_vouchers")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Payment voucher deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["payment-vouchers"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to delete");
    }
  };

  const openInvoice = (id: string) => {
    window.open(`/invoice/payment-voucher/${id}`, "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Payment Voucher</h1>
          <p className="text-muted-foreground mt-2">
            Manage payment vouchers for company transactions
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleAddClick}>
              <Plus className="w-4 h-4 mr-2" />
              Add Voucher
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {isEditing ? "Edit Payment Voucher" : "Add Payment Voucher"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Amount (RM) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pay To *</Label>
                  <Input
                    placeholder="Recipient name"
                    value={formPayTo}
                    onChange={(e) => setFormPayTo(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pay By *</Label>
                  <Input
                    placeholder="Payer name"
                    value={formPayBy}
                    onChange={(e) => setFormPayBy(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Payment Method *</Label>
                <Select
                  value={formPaymentMethod}
                  onValueChange={setFormPaymentMethod}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Purpose of Payment</Label>
                <Textarea
                  placeholder="Purpose of this payment"
                  value={formPurpose}
                  onChange={(e) => setFormPurpose(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Note</Label>
                <Textarea
                  placeholder="Additional notes"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setIsDialogOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  {isEditing ? "Update" : "Add"} Voucher
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Receipt className="w-6 h-6 text-blue-500" />
              <div>
                <p className="text-xl font-bold">{vouchers.length}</p>
                <p className="text-xs text-muted-foreground">Total Vouchers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Receipt className="w-6 h-6 text-green-500" />
              <div>
                <p className="text-xl font-bold">
                  RM {totalAmount.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">Total Amount</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                Start:
              </span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-40"
              />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                End:
              </span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
              <Select
                value={pageSize.toString()}
                onValueChange={(v) => {
                  setPageSize(v === "All" ? "All" : Number(v));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-20">
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
              <span className="text-sm text-muted-foreground">entries</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-3 text-left">No</th>
                      <th className="p-3 text-left">Voucher No</th>
                      <th className="p-3 text-left">Date</th>
                      <th className="p-3 text-left">Pay To</th>
                      <th className="p-3 text-left">Pay By</th>
                      <th className="p-3 text-left">Method</th>
                      <th className="p-3 text-right">Amount (RM)</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData.length > 0 ? (
                      paginatedData.map((v, index) => (
                        <tr
                          key={v.id}
                          className="border-b hover:bg-muted/30"
                        >
                          <td className="p-3">
                            {pageSize === "All"
                              ? index + 1
                              : (currentPage - 1) * (pageSize as number) +
                                index +
                                1}
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() => openInvoice(v.id)}
                              className="text-blue-600 hover:text-blue-700 hover:underline"
                            >
                              {v.voucher_number}
                            </button>
                          </td>
                          <td className="p-3 whitespace-nowrap">{v.date}</td>
                          <td className="p-3 font-medium">{v.pay_to}</td>
                          <td className="p-3">{v.pay_by}</td>
                          <td className="p-3">{v.payment_method}</td>
                          <td className="p-3 text-right font-medium">
                            RM {Number(v.amount).toFixed(2)}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openInvoice(v.id)}
                                className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                title="View voucher"
                              >
                                <FileText className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditClick(v)}
                                className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              {!AUDIT_MODE && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(v.id)}
                                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={8}
                          className="text-center py-12 text-muted-foreground"
                        >
                          No payment vouchers found for this date range.
                        </td>
                      </tr>
                    )}
                    {paginatedData.length > 0 && (
                      <tr className="bg-muted/50 font-bold">
                        <td className="p-3" colSpan={6}>
                          Grand Total
                        </td>
                        <td className="p-3 text-right">
                          RM {totalAmount.toFixed(2)}
                        </td>
                        <td className="p-3"></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing{" "}
                    {(currentPage - 1) * (pageSize as number) + 1} to{" "}
                    {Math.min(
                      currentPage * (pageSize as number),
                      vouchers.length
                    )}{" "}
                    of {vouchers.length} entries
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) =>
                          Math.min(totalPages, prev + 1)
                        )
                      }
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountPaymentVoucher;
