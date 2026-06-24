import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DollarSign,
  Upload,
  FileText,
  Image,
  Building2,
  Megaphone,
  Package,
  MoreHorizontal,
  Eye,
  Download,
} from "lucide-react";
import * as XLSX from 'xlsx';
import { toast } from "sonner";
import Swal from "sweetalert2";
import { put } from "@vercel/blob";

const PAGE_SIZE_OPTIONS = [10, 50, 100, "All"] as const;
const CATEGORY_OPTIONS = ["Overhead", "Marketing", "Cost Product", "Other"] as const;
// Categories available in add/edit form (Cost Product is auto-calculated)
const FORM_CATEGORY_OPTIONS = ["Overhead", "Marketing", "Other"] as const;
const TYPE_OPTIONS = ["VAR", "FIX"] as const;
const PLATFORM_OPTIONS = ["FACEBOOK", "TIKTOK", "SHOPEE", "DATABASE", "GOOGLE"] as const;
type CategoryType = typeof CATEGORY_OPTIONS[number];
type ExpenseType = typeof TYPE_OPTIONS[number];
type PlatformType = typeof PLATFORM_OPTIONS[number];

interface Expense {
  id: string;
  type: ExpenseType;
  category: CategoryType;
  platform: string | null;
  description: string;
  total: number;
  date: string;
  attachment_url: string | null;
  created_at: string;
}

// Category icon and color mapping
const categoryConfig: Record<CategoryType, { icon: any; color: string; bgColor: string }> = {
  "Overhead": { icon: Building2, color: "text-purple-700", bgColor: "bg-purple-100" },
  "Marketing": { icon: Megaphone, color: "text-blue-700", bgColor: "bg-blue-100" },
  "Cost Product": { icon: Package, color: "text-orange-700", bgColor: "bg-orange-100" },
  "Other": { icon: MoreHorizontal, color: "text-gray-700", bgColor: "bg-gray-100" },
};

const AccountExpenses = () => {
  const queryClient = useQueryClient();
  const today = getMalaysiaDate();

  // Get first day of current month
  const firstDayOfMonth = today.substring(0, 8) + "01";

  // Filter states
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [filterCategory, setFilterCategory] = useState<"all" | CategoryType>("all");
  const [filterPlatform, setFilterPlatform] = useState<"all" | string>("all");
  const [pageSize, setPageSize] = useState<number | "All">(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [formType, setFormType] = useState<ExpenseType>("VAR");
  const [formCategory, setFormCategory] = useState<CategoryType>("Overhead");
  const [formDescription, setFormDescription] = useState("");
  const [formTotal, setFormTotal] = useState("");
  const [formDate, setFormDate] = useState(today);
  const [formPlatform, setFormPlatform] = useState<string>("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [existingAttachment, setExistingAttachment] = useState<string | null>(null);

  // Fetch expenses
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["account-expenses", startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("expenses")
        .select("*")
        .order("date", { ascending: false });

      if (startDate) {
        query = query.gte("date", startDate);
      }
      if (endDate) {
        query = query.lte("date", endDate);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []) as Expense[];
    },
  });

  // Fetch cost_baseproduct rows from customer_purchases (for Cost Product card + monthly)
  const { data: costProductRows = [] } = useQuery({
    queryKey: ["account-cost-product", startDate, endDate],
    queryFn: async () => {
      let query = (supabase as any)
        .from("customer_purchases")
        .select("cost_baseproduct, date_order, delivery_status");

      if (startDate) query = query.gte("date_order", startDate);
      if (endDate) query = query.lte("date_order", endDate);

      const { data, error } = await query.range(0, 49999);
      if (error) throw error;

      return (data || []) as Array<{ cost_baseproduct: number; date_order: string; delivery_status: string }>;
    },
  });

  const costProductTotal = useMemo(
    () => costProductRows.reduce((sum, o) => sum + (Number(o.cost_baseproduct) || 0), 0),
    [costProductRows]
  );

  // Fetch cash_flows Cash Out (to merge into Overhead/Marketing/Other cards)
  const { data: cashOutFlows = [] } = useQuery({
    queryKey: ["account-cashout-flows", startDate, endDate],
    queryFn: async () => {
      let query = (supabase as any)
        .from("cash_flows")
        .select("kategori, amount, date")
        .eq("flow_type", "Cash Out");

      if (startDate) query = query.gte("date", startDate);
      if (endDate) query = query.lte("date", endDate);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Array<{ kategori: string | null; amount: number; date: string }>;
    },
  });

  // Cash Out totals by kategori (Overhead, Marketing, Other)
  const cashOutByKategori = useMemo(() => {
    const totals: Record<string, number> = { Overhead: 0, Marketing: 0, Other: 0 };
    cashOutFlows.forEach((cf) => {
      const k = cf.kategori || "";
      if (totals[k] !== undefined) {
        totals[k] += Number(cf.amount) || 0;
      }
    });
    return totals;
  }, [cashOutFlows]);

  // Filter expenses by category and platform
  const filteredExpenses = expenses.filter((expense) => {
    if (filterCategory !== "all" && expense.category !== filterCategory) return false;
    if (filterPlatform !== "all" && (expense.platform || "").toUpperCase() !== filterPlatform) return false;
    return true;
  });

  // Pagination
  const totalPages = pageSize === "All" ? 1 : Math.ceil(filteredExpenses.length / pageSize);
  const paginatedExpenses = pageSize === "All"
    ? filteredExpenses
    : filteredExpenses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Calculate totals by category (expenses + cash flow cash out merged)
  const categoryTotals = useMemo(() => {
    const totals: Record<CategoryType, number> = {
      "Overhead": 0,
      "Marketing": 0,
      "Cost Product": 0,
      "Other": 0,
    };
    // Sum from expenses table
    expenses.forEach((e) => {
      if (e.category && totals[e.category as CategoryType] !== undefined) {
        totals[e.category as CategoryType] += Number(e.total);
      }
    });
    // Add cash_flows Cash Out by kategori
    totals["Overhead"] += cashOutByKategori["Overhead"] || 0;
    totals["Marketing"] += cashOutByKategori["Marketing"] || 0;
    totals["Other"] += cashOutByKategori["Other"] || 0;
    // Cost Product comes from customer_purchases
    totals["Cost Product"] = costProductTotal;
    return totals;
  }, [expenses, cashOutByKategori, costProductTotal]);

  const totalExpenses = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);

  // Calculate platform breakdown per category (from expenses only)
  const categoryPlatformTotals = useMemo(() => {
    const result: Record<CategoryType, Record<string, number>> = {
      "Overhead": {},
      "Marketing": {},
      "Cost Product": {},
      "Other": {},
    };
    expenses.forEach((e) => {
      const cat = (e.category as CategoryType) || "Other";
      if (result[cat] && e.platform) {
        result[cat][e.platform] = (result[cat][e.platform] || 0) + Number(e.total);
      }
    });
    return result;
  }, [expenses]);

  // Calculate monthly summary - show ALL months in date range
  const monthlySummary = useMemo(() => {
    type MonthData = {
      categories: Record<CategoryType, number>;
      categoryPlatforms: Record<CategoryType, Record<string, number>>;
    };
    const initMonth = (): MonthData => ({
      categories: { "Overhead": 0, "Marketing": 0, "Cost Product": 0, "Other": 0 },
      categoryPlatforms: { "Overhead": {}, "Marketing": {}, "Cost Product": {}, "Other": {} },
    });
    const summary: Record<string, MonthData> = {};

    // Generate all months between startDate and endDate
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const current = new Date(start.getFullYear(), start.getMonth(), 1);

      while (current <= end) {
        const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
        summary[monthKey] = initMonth();
        current.setMonth(current.getMonth() + 1);
      }
    }

    // Fill in actual expense data
    expenses.forEach((e) => {
      const month = e.date.substring(0, 7);
      if (!summary[month]) summary[month] = initMonth();
      const cat = (e.category as CategoryType) || "Other";
      if (summary[month].categories[cat] !== undefined) {
        summary[month].categories[cat] += Number(e.total);
      }
      // Track platform totals per category per month
      if (e.platform && summary[month].categoryPlatforms[cat]) {
        summary[month].categoryPlatforms[cat][e.platform] = (summary[month].categoryPlatforms[cat][e.platform] || 0) + Number(e.total);
      }
    });

    // Add cash_flows Cash Out by month
    cashOutFlows.forEach((cf) => {
      const month = cf.date.substring(0, 7);
      if (!summary[month]) summary[month] = initMonth();
      const k = cf.kategori || "";
      if (k === "Overhead" || k === "Marketing" || k === "Other") {
        summary[month].categories[k as CategoryType] += Number(cf.amount) || 0;
      }
    });

    // Add Cost Product from customer_purchases by month
    costProductRows.forEach((o) => {
      if (!o.date_order) return;
      const month = o.date_order.substring(0, 7);
      if (!summary[month]) summary[month] = initMonth();
      summary[month].categories["Cost Product"] += Number(o.cost_baseproduct) || 0;
    });

    // Sort by month descending
    return Object.entries(summary)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, data]) => ({
        month,
        ...data.categories,
        categoryPlatforms: data.categoryPlatforms,
        total: Object.values(data.categories).reduce((sum, val) => sum + val, 0),
      }));
  }, [expenses, cashOutFlows, costProductRows, startDate, endDate]);

  // Handle file change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        toast.error("Only JPEG, PNG, and PDF files are allowed");
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be less than 5MB");
        return;
      }
      setAttachmentFile(file);
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => setAttachmentPreview(reader.result as string);
        reader.readAsDataURL(file);
      } else {
        setAttachmentPreview(null);
      }
    }
  };

  // Reset form
  const resetForm = () => {
    setFormType("VAR");
    setFormCategory("Overhead");
    setFormPlatform("");
    setFormDescription("");
    setFormTotal("");
    setFormDate(today);
    setAttachmentFile(null);
    setAttachmentPreview(null);
    setExistingAttachment(null);
    setIsEditing(false);
    setEditingId(null);
  };

  // Open dialog for adding
  const handleAddClick = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  // Open dialog for editing
  const handleEditClick = (expense: Expense) => {
    setFormType(expense.type || "VAR");
    setFormCategory(expense.category || "Other");
    setFormPlatform(expense.platform || "");
    setFormDescription(expense.description);
    setFormTotal(expense.total.toString());
    setFormDate(expense.date);
    setExistingAttachment(expense.attachment_url);
    setAttachmentFile(null);
    setAttachmentPreview(null);
    setIsEditing(true);
    setEditingId(expense.id);
    setIsDialogOpen(true);
  };

  // Upload to Vercel Blob
  const uploadToVercelBlob = async (file: File): Promise<string> => {
    const token = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw new Error('Blob storage token not configured');
    }
    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-');
    const filename = `expenses/${timestamp}-${cleanFileName}`;
    const blob = await put(filename, file, { access: 'public', token });
    return blob.url;
  };

  // Delete from Vercel Blob
  const deleteFromBlob = async (url: string) => {
    try {
      const response = await fetch('/api/delete-blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        console.error('Failed to delete from Blob:', url);
      }
    } catch (err) {
      console.error('Blob delete error:', err);
    }
  };

  // Handle form submit
  const handleSubmit = async () => {
    if (!formDescription.trim()) {
      toast.error("Please enter a description");
      return;
    }
    if (!formTotal || Number(formTotal) <= 0) {
      toast.error("Please enter a valid total amount");
      return;
    }
    if (!formDate) {
      toast.error("Please select a date");
      return;
    }

    setIsSubmitting(true);

    try {
      let attachmentUrl = existingAttachment;

      // Upload new attachment if provided
      if (attachmentFile) {
        // Delete old attachment if exists
        if (existingAttachment) {
          await deleteFromBlob(existingAttachment);
        }
        attachmentUrl = await uploadToVercelBlob(attachmentFile);
      }

      const expenseData = {
        type: formType,
        category: formCategory,
        platform: formPlatform || null,
        description: formDescription.trim(),
        total: Number(formTotal),
        date: formDate,
        attachment_url: attachmentUrl,
        updated_at: new Date().toISOString(),
      };

      if (isEditing && editingId) {
        const { error } = await supabase
          .from("expenses")
          .update(expenseData)
          .eq("id", editingId);

        if (error) throw error;
        toast.success("Expense updated successfully");
      } else {
        const { error } = await supabase
          .from("expenses")
          .insert(expenseData);

        if (error) throw error;
        toast.success("Expense added successfully");
      }

      queryClient.invalidateQueries({ queryKey: ["account-expenses"] });
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Failed to save expense");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async (id: string, attachmentUrl: string | null) => {
    const result = await Swal.fire({
      icon: "warning",
      title: "Delete Expense?",
      text: "This action cannot be undone.",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      // Delete attachment from blob if exists
      if (attachmentUrl) {
        await deleteFromBlob(attachmentUrl);
      }

      const { error } = await supabase
        .from("expenses")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Expense deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["account-expenses"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to delete expense");
    }
  };

  // Get file icon based on URL
  const getFileIcon = (url: string) => {
    if (url.includes('.pdf')) return <FileText className="w-4 h-4" />;
    return <Image className="w-4 h-4" />;
  };

  // Format month display
  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  };

  // Export to XLSX
  const exportToXLSX = () => {
    const data = filteredExpenses.map((expense, index) => ({
      'No': index + 1,
      'Category': expense.category || 'Other',
      'Platform': expense.platform || '-',
      'Description': expense.description,
      'Total (RM)': Number(expense.total).toFixed(2),
      'Date': expense.date,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Expenses');

    // Auto-size columns
    const colWidths = [
      { wch: 5 },   // No
      { wch: 15 },  // Category
      { wch: 12 },  // Platform
      { wch: 40 },  // Description
      { wch: 15 },  // Total
      { wch: 12 },  // Date
    ];
    worksheet['!cols'] = colWidths;

    const fileName = `expenses_${startDate}_to_${endDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Expenses</h1>
          <p className="text-muted-foreground mt-2">
            Manage expenses by category: Overhead, Marketing, Other
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleAddClick}>
              <Plus className="w-4 h-4 mr-2" />
              Add Expense
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditing ? "Edit Expense" : "Add New Expense"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {/* Type */}
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as ExpenseType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VAR">VAR (Variable)</SelectItem>
                    <SelectItem value="FIX">FIX (Fixed)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={formCategory} onValueChange={(v) => setFormCategory(v as CategoryType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORM_CATEGORY_OPTIONS.map((cat) => {
                      const config = categoryConfig[cat];
                      const Icon = config.icon;
                      return (
                        <SelectItem key={cat} value={cat}>
                          <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 ${config.color}`} />
                            {cat}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Platform (Optional) */}
              <div className="space-y-2">
                <Label>Platform (Optional)</Label>
                <Select value={formPlatform || "__none__"} onValueChange={(v) => setFormPlatform(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select platform (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {PLATFORM_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  placeholder="e.g., Office Rent, Facebook Ads, Raw Materials..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              {/* Total */}
              <div className="space-y-2">
                <Label>Total (RM)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formTotal}
                  onChange={(e) => setFormTotal(e.target.value)}
                />
              </div>

              {/* Date */}
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>

              {/* Attachment */}
              <div className="space-y-2">
                <Label>Attachment (Optional)</Label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    id="attachment-upload"
                  />
                  <label
                    htmlFor="attachment-upload"
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors bg-background"
                  >
                    <Upload className="w-4 h-4" />
                    <span className="text-sm text-muted-foreground">
                      {attachmentFile
                        ? attachmentFile.name
                        : existingAttachment
                          ? 'Replace existing attachment'
                          : 'Upload JPEG, PNG, or PDF (max 5MB)'}
                    </span>
                  </label>
                  {(attachmentPreview || existingAttachment) && (
                    <div className="mt-2 p-2 bg-muted rounded-lg">
                      {attachmentPreview ? (
                        <img
                          src={attachmentPreview}
                          alt="Preview"
                          className="w-full h-32 object-cover rounded"
                        />
                      ) : existingAttachment && existingAttachment.includes('.pdf') ? (
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="w-4 h-4" />
                          <span>PDF attached</span>
                          <a href={existingAttachment} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                        </div>
                      ) : existingAttachment ? (
                        <img
                          src={existingAttachment}
                          alt="Existing attachment"
                          className="w-full h-32 object-cover rounded"
                        />
                      ) : null}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Supported: JPEG, PNG, PDF (max 5MB)
                </p>
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
                  {isEditing ? "Update" : "Add"} Expense
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards - Category Totals */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-red-500" />
              <div>
                <p className="text-xl font-bold">RM {totalExpenses.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Total Expenses</p>
              </div>
            </div>
            {(() => {
              const allPlatforms: Record<string, number> = {};
              Object.values(categoryPlatformTotals).forEach(pt => {
                Object.entries(pt).forEach(([p, v]) => {
                  allPlatforms[p] = (allPlatforms[p] || 0) + v;
                });
              });
              const hasAny = Object.keys(allPlatforms).length > 0;
              return hasAny ? (
                <div className="mt-2 pt-2 border-t space-y-0.5">
                  {PLATFORM_OPTIONS.filter(p => allPlatforms[p]).map(p => (
                    <div key={p} className="flex justify-between text-xs text-muted-foreground">
                      <span>{p}</span>
                      <span>RM {allPlatforms[p].toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : null;
            })()}
          </CardContent>
        </Card>
        {CATEGORY_OPTIONS.map((cat) => {
          const config = categoryConfig[cat];
          const Icon = config.icon;
          const platformBreakdown = categoryPlatformTotals[cat] || {};
          const hasPlatforms = Object.keys(platformBreakdown).length > 0;
          return (
            <Card key={cat}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Icon className={`w-6 h-6 ${config.color}`} />
                  <div>
                    <p className="text-xl font-bold">RM {categoryTotals[cat].toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{cat}</p>
                  </div>
                </div>
                {hasPlatforms && (
                  <div className="mt-2 pt-2 border-t space-y-0.5">
                    {PLATFORM_OPTIONS.filter(p => platformBreakdown[p]).map(p => (
                      <div key={p} className="flex justify-between text-xs text-muted-foreground">
                        <span>{p}</span>
                        <span>RM {platformBreakdown[p].toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Monthly Summary */}
      {monthlySummary.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-4">Monthly Summary</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-3 text-left">Month</th>
                    {CATEGORY_OPTIONS.map((cat) => (
                      <th key={cat} className="p-3 text-right">{cat}</th>
                    ))}
                    <th className="p-3 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySummary.map((row) => (
                    <tr key={row.month} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{formatMonth(row.month)}</td>
                      {CATEGORY_OPTIONS.map((cat) => {
                        const catPlatforms = row.categoryPlatforms[cat] || {};
                        const hasCatPlatforms = Object.keys(catPlatforms).length > 0;
                        return (
                          <td key={cat} className="p-3 text-right">
                            <div>RM {row[cat].toFixed(2)}</div>
                            {hasCatPlatforms && (
                              <div className="mt-1 space-y-0.5">
                                {PLATFORM_OPTIONS.filter(p => catPlatforms[p]).map(p => (
                                  <div key={p} className="text-[10px] text-indigo-600">
                                    {p}: RM {catPlatforms[p].toFixed(2)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-3 text-right font-bold">
                        RM {row.total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Start:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                className="w-40"
              />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground whitespace-nowrap">End:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                className="w-40"
              />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Category:</span>
              <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v as any); setCurrentPage(1); }}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Platform:</span>
              <Select value={filterPlatform} onValueChange={(v) => { setFilterPlatform(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  {PLATFORM_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
              <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(v === "All" ? "All" : Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size.toString()} value={size.toString()}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">entries</span>
            </div>
            <Button onClick={exportToXLSX} className="bg-green-600 hover:bg-green-700 text-white">
              <Download className="w-4 h-4 mr-2" />
              Export XLSX
            </Button>
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
                      <th className="p-3 text-left">Category</th>
                      <th className="p-3 text-left">Platform</th>
                      <th className="p-3 text-left">Description</th>
                      <th className="p-3 text-right">Total (RM)</th>
                      <th className="p-3 text-left">Date</th>
                      <th className="p-3 text-center">Attachment</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedExpenses.length > 0 ? (
                      paginatedExpenses.map((expense, index) => {
                        const config = categoryConfig[expense.category as CategoryType] || categoryConfig["Other"];
                        const Icon = config.icon;
                        return (
                          <tr key={expense.id} className="border-b hover:bg-muted/30">
                            <td className="p-3">
                              {pageSize === "All" ? index + 1 : (currentPage - 1) * (pageSize as number) + index + 1}
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium inline-flex items-center gap-1 ${config.bgColor} ${config.color}`}>
                                <Icon className="w-3 h-3" />
                                {expense.category || "Other"}
                              </span>
                            </td>
                            <td className="p-3">
                              {expense.platform ? (
                                <span className="px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                                  {expense.platform}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="p-3">{expense.description}</td>
                            <td className="p-3 text-right font-medium">
                              RM {Number(expense.total).toFixed(2)}
                            </td>
                            <td className="p-3 whitespace-nowrap">{expense.date}</td>
                            <td className="p-3 text-center">
                              {expense.attachment_url ? (
                                <a
                                  href={expense.attachment_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
                                >
                                  {getFileIcon(expense.attachment_url)}
                                  <Eye className="w-3 h-3" />
                                </a>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditClick(expense)}
                                  className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                {!AUDIT_MODE && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(expense.id, expense.attachment_url)}
                                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-muted-foreground">
                          No expenses found for this date range.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * (pageSize as number) + 1} to {Math.min(currentPage * (pageSize as number), filteredExpenses.length)} of {filteredExpenses.length} entries
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
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

export default AccountExpenses;
