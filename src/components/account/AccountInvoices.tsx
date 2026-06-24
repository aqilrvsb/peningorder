import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  Plus,
  Trash2,
  Eye,
  FileText,
  Save,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { getMalaysiaDate } from "@/lib/utils";
import { AUDIT_MODE } from "@/lib/audit";

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  bill_to_name: string;
  bill_to_address: string | null;
  bill_to_phone: string | null;
  items: InvoiceItem[];
  total: number;
  notes: string | null;
  created_at: string;
}

const AccountInvoices = () => {
  const queryClient = useQueryClient();
  const today = getMalaysiaDate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState("");

  // Form states
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [billToName, setBillToName] = useState("");
  const [billToAddress, setBillToAddress] = useState("");
  const [billToPhone, setBillToPhone] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: "", quantity: 1, unit_price: 0 },
  ]);
  const [notes, setNotes] = useState("");

  // Fetch invoices
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Invoice[];
    },
  });

  // Generate next invoice number (e.g., INV-2026-0001)
  const generateInvoiceNumber = async (): Promise<string> => {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const { data } = await (supabase as any)
      .from("invoices")
      .select("invoice_number")
      .like("invoice_number", `${prefix}%`)
      .order("invoice_number", { ascending: false })
      .limit(1);

    if (!data || data.length === 0) return `${prefix}0001`;
    const lastNum = parseInt(data[0].invoice_number.split("-").pop() || "0", 10);
    return `${prefix}${String(lastNum + 1).padStart(4, "0")}`;
  };

  const openCreateDialog = async () => {
    setIsEditing(false);
    setEditingId(null);
    const num = await generateInvoiceNumber();
    setInvoiceNumber(num);
    setInvoiceDate(today);
    setDueDate("");
    setBillToName("");
    setBillToAddress("");
    setBillToPhone("");
    setItems([{ description: "", quantity: 1, unit_price: 0 }]);
    setNotes("");
    setDialogOpen(true);
  };

  const openEditDialog = (inv: Invoice) => {
    setIsEditing(true);
    setEditingId(inv.id);
    setInvoiceNumber(inv.invoice_number);
    setInvoiceDate(inv.invoice_date);
    setDueDate(inv.due_date || "");
    setBillToName(inv.bill_to_name);
    setBillToAddress(inv.bill_to_address || "");
    setBillToPhone(inv.bill_to_phone || "");
    setItems(inv.items && inv.items.length > 0 ? inv.items : [{ description: "", quantity: 1, unit_price: 0 }]);
    setNotes(inv.notes || "");
    setDialogOpen(true);
  };

  const addItem = () => {
    setItems([...items, { description: "", quantity: 1, unit_price: 0 }]);
  };

  const removeItem = (idx: number) => {
    if (items.length === 1) {
      toast.error("At least one item is required");
      return;
    }
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof InvoiceItem, value: string | number) => {
    const newItems = [...items];
    if (field === "description") {
      newItems[idx].description = String(value);
    } else if (field === "quantity") {
      newItems[idx].quantity = Number(value) || 0;
    } else if (field === "unit_price") {
      newItems[idx].unit_price = Number(value) || 0;
    }
    setItems(newItems);
  };

  const calcItemTotal = (item: InvoiceItem) => item.quantity * item.unit_price;
  const calcGrandTotal = () => items.reduce((sum, item) => sum + calcItemTotal(item), 0);

  const handleSubmit = async () => {
    if (!billToName.trim()) {
      toast.error("Bill To Name is required");
      return;
    }
    const validItems = items.filter((item) => item.description.trim());
    if (validItems.length === 0) {
      toast.error("At least one item with a description is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        bill_to_name: billToName.trim(),
        bill_to_address: billToAddress.trim() || null,
        bill_to_phone: billToPhone.trim() || null,
        items: validItems,
        total: calcGrandTotal(),
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (isEditing && editingId) {
        const { error } = await (supabase as any)
          .from("invoices")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Invoice updated successfully");
      } else {
        const { error } = await (supabase as any).from("invoices").insert(payload);
        if (error) throw error;
        toast.success("Invoice created successfully");
      }

      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to save invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this invoice?")) return;
    try {
      const { error } = await (supabase as any).from("invoices").delete().eq("id", id);
      if (error) throw error;
      toast.success("Invoice deleted");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to delete");
    }
  };

  const handleView = (id: string) => {
    window.open(`/invoice-view/${id}`, "_blank");
  };

  const filteredInvoices = invoices.filter((inv) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      inv.invoice_number.toLowerCase().includes(term) ||
      inv.bill_to_name.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-muted-foreground text-sm">Create and manage invoices</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Create Invoice
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-md mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by invoice number or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No invoices yet. Click "Create Invoice" to start.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left">Invoice No.</th>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Due Date</th>
                    <th className="p-2 text-left">Bill To</th>
                    <th className="p-2 text-right">Total (RM)</th>
                    <th className="p-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((inv) => (
                    <tr key={inv.id} className="border-b hover:bg-muted/30">
                      <td className="p-2 font-mono">{inv.invoice_number}</td>
                      <td className="p-2 whitespace-nowrap">{inv.invoice_date}</td>
                      <td className="p-2 whitespace-nowrap">{inv.due_date || "-"}</td>
                      <td className="p-2">{inv.bill_to_name}</td>
                      <td className="p-2 text-right font-semibold">
                        RM {Number(inv.total || 0).toFixed(2)}
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1 justify-center">
                          <Button size="sm" variant="outline" onClick={() => handleView(inv.id)}>
                            <Eye className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEditDialog(inv)}>
                            Edit
                          </Button>
                          {!AUDIT_MODE && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => handleDelete(inv.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Invoice Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Invoice" : "Create Invoice"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Invoice Header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Invoice Number</Label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  disabled={isEditing}
                />
              </div>
              <div className="space-y-2">
                <Label>Invoice Date</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date (optional)</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            {/* Bill To */}
            <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
              <h3 className="font-semibold">Bill To</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    placeholder="Customer name"
                    value={billToName}
                    onChange={(e) => setBillToName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    placeholder="Customer phone"
                    value={billToPhone}
                    onChange={(e) => setBillToPhone(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Textarea
                  placeholder="Customer address"
                  value={billToAddress}
                  onChange={(e) => setBillToAddress(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            {/* Items */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Items</h3>
                <Button size="sm" variant="outline" onClick={addItem}>
                  <Plus className="w-3 h-3 mr-1" />
                  Add Item
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-1 text-left w-12">No</th>
                      <th className="p-1 text-left">Description</th>
                      <th className="p-1 text-right w-24">Qty</th>
                      <th className="p-1 text-right w-32">Unit Price (RM)</th>
                      <th className="p-1 text-right w-32">Total (RM)</th>
                      <th className="p-1 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-1">{idx + 1}</td>
                        <td className="p-1">
                          <Input
                            placeholder="Item description"
                            value={item.description}
                            onChange={(e) => updateItem(idx, "description", e.target.value)}
                            className="h-8"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="p-1 text-right font-medium">
                          {calcItemTotal(item).toFixed(2)}
                        </td>
                        <td className="p-1">
                          {!AUDIT_MODE && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-red-600"
                              onClick={() => removeItem(idx)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold border-t-2">
                      <td colSpan={4} className="p-1 text-right">
                        TOTAL:
                      </td>
                      <td className="p-1 text-right text-lg">
                        RM {calcGrandTotal().toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Additional notes for the invoice"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {isEditing ? "Update Invoice" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountInvoices;
