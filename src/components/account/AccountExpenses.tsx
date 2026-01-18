import { useState } from "react";
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
import {
  Loader2,
  Plus,
  Trash2,
  Edit2,
  DollarSign,
  TrendingUp,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import Swal from "sweetalert2";

const PAGE_SIZE_OPTIONS = [10, 50, 100, "All"] as const;

interface Expense {
  id: string;
  type: "VAR" | "FIX";
  description: string;
  total: number;
  date: string;
  created_at: string;
}

const AccountExpenses = () => {
  const queryClient = useQueryClient();
  const today = getMalaysiaDate();

  // Get first day of current month
  const firstDayOfMonth = today.substring(0, 8) + "01";

  // Filter states
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [filterType, setFilterType] = useState<"all" | "VAR" | "FIX">("all");
  const [pageSize, setPageSize] = useState<number | "All">(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [formType, setFormType] = useState<"VAR" | "FIX">("VAR");
  const [formDescription, setFormDescription] = useState("");
  const [formTotal, setFormTotal] = useState("");
  const [formDate, setFormDate] = useState(today);

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

  // Calculate FIX expenses for the date range (monthly recurring)
  const calculateFixExpenses = () => {
    const fixExpenses = expenses.filter((e) => e.type === "FIX");

    if (!startDate || !endDate || fixExpenses.length === 0) {
      return { total: 0, count: fixExpenses.length };
    }

    // Get unique months in the date range
    const start = new Date(startDate);
    const end = new Date(endDate);

    let totalFixExpenses = 0;

    fixExpenses.forEach((expense) => {
      const expenseDate = new Date(expense.date);

      // Count how many months from expense date to end date (if expense date is before or within range)
      if (expenseDate <= end) {
        // Start counting from the later of: expense date or start date
        const countStart = expenseDate > start ? expenseDate : start;

        // Calculate months between countStart and end
        const startYear = countStart.getFullYear();
        const startMonth = countStart.getMonth();
        const endYear = end.getFullYear();
        const endMonth = end.getMonth();

        const monthsDiff = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;

        if (monthsDiff > 0) {
          totalFixExpenses += expense.total * monthsDiff;
        }
      }
    });

    return { total: totalFixExpenses, count: fixExpenses.length };
  };

  // Filter expenses by type
  const filteredExpenses = expenses.filter((expense) => {
    if (filterType === "all") return true;
    return expense.type === filterType;
  });

  // Pagination
  const totalPages = pageSize === "All" ? 1 : Math.ceil(filteredExpenses.length / pageSize);
  const paginatedExpenses = pageSize === "All"
    ? filteredExpenses
    : filteredExpenses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Calculate totals
  const varExpenses = expenses.filter((e) => e.type === "VAR");
  const varTotal = varExpenses.reduce((sum, e) => sum + Number(e.total), 0);
  const fixData = calculateFixExpenses();
  const totalExpenses = varTotal + fixData.total;

  // Reset form
  const resetForm = () => {
    setFormType("VAR");
    setFormDescription("");
    setFormTotal("");
    setFormDate(today);
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
    setFormType(expense.type);
    setFormDescription(expense.description);
    setFormTotal(expense.total.toString());
    setFormDate(expense.date);
    setIsEditing(true);
    setEditingId(expense.id);
    setIsDialogOpen(true);
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
      const expenseData = {
        type: formType,
        description: formDescription.trim(),
        total: Number(formTotal),
        date: formDate,
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
  const handleDelete = async (id: string) => {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Expenses</h1>
          <p className="text-muted-foreground mt-2">
            Manage VAR (variable/one-time) and FIX (monthly recurring) expenses
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
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as "VAR" | "FIX")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VAR">VAR (Variable/One-time)</SelectItem>
                    <SelectItem value="FIX">FIX (Monthly Recurring)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {formType === "VAR"
                    ? "One-time expense for the selected date only"
                    : "Monthly recurring expense - will be counted for each month from the date onwards"}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  placeholder="e.g., MODAL ADS, Rent, Utilities..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

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

              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
                {formType === "FIX" && (
                  <p className="text-xs text-muted-foreground">
                    This is the start date - expense will recur monthly from this date
                  </p>
                )}
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

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-red-500" />
              <div>
                <p className="text-xl font-bold">RM {totalExpenses.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Total Expenses</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-orange-500" />
              <div>
                <p className="text-xl font-bold">RM {varTotal.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">VAR Expenses ({varExpenses.length})</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-6 h-6 text-blue-500" />
              <div>
                <p className="text-xl font-bold">RM {fixData.total.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">FIX Expenses ({fixData.count})</p>
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
              <span className="text-sm text-muted-foreground whitespace-nowrap">Type:</span>
              <Select value={filterType} onValueChange={(v) => { setFilterType(v as any); setCurrentPage(1); }}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="VAR">VAR</SelectItem>
                  <SelectItem value="FIX">FIX</SelectItem>
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
                      <th className="p-3 text-left">Type</th>
                      <th className="p-3 text-left">Description</th>
                      <th className="p-3 text-right">Total (RM)</th>
                      <th className="p-3 text-left">Date</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedExpenses.length > 0 ? (
                      paginatedExpenses.map((expense, index) => (
                        <tr key={expense.id} className="border-b hover:bg-muted/30">
                          <td className="p-3">
                            {pageSize === "All" ? index + 1 : (currentPage - 1) * (pageSize as number) + index + 1}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              expense.type === "VAR"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-blue-100 text-blue-700"
                            }`}>
                              {expense.type}
                            </span>
                          </td>
                          <td className="p-3">{expense.description}</td>
                          <td className="p-3 text-right font-medium">
                            RM {Number(expense.total).toFixed(2)}
                          </td>
                          <td className="p-3 whitespace-nowrap">{expense.date}</td>
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
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(expense.id)}
                                className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-muted-foreground">
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
