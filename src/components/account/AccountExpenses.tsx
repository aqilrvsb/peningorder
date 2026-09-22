import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Loader2, Plus, Trash2, Edit2, DollarSign, Upload, FileText, Image as ImageIcon,
  Building2, Megaphone, Package, MoreHorizontal, Eye, Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import { put } from '@vercel/blob';
import { toast } from '@/hooks/use-toast';
import { AUDIT_MODE } from '@/lib/audit';
import { getMalaysiaDate, getMalaysiaStartOfMonth, fetchAllRows, formatDMY } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [10, 50, 100, 'All'] as const;
// Summary-card categories. "Cost Product" is auto-derived from orders, so the
// Add/Edit form only lets the user pick the three manual ones.
const CATEGORY_OPTIONS = ['Overhead', 'Marketing', 'Cost Product', 'Other'] as const;
const FORM_CATEGORY_OPTIONS = ['Overhead', 'Marketing', 'Other'] as const;
// Same platform set as Spend / Orders / Report Profit (capitalised, no Shopee).
const PLATFORM_OPTIONS = ['Facebook', 'Threads', 'Tiktok', 'Database', 'Google'] as const;

type CategoryType = typeof CATEGORY_OPTIONS[number];

interface Expense {
  id: string;
  category: CategoryType;
  platform: string | null;
  description: string;
  total: number;
  date: string;
  attachment_url: string | null;
  created_at: string;
}

const categoryConfig: Record<CategoryType, { icon: any; color: string; bgColor: string }> = {
  Overhead: { icon: Building2, color: 'text-purple-700 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
  Marketing: { icon: Megaphone, color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  'Cost Product': { icon: Package, color: 'text-orange-700 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  Other: { icon: MoreHorizontal, color: 'text-gray-700 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-800' },
};

const AccountExpenses: React.FC = () => {
  const queryClient = useQueryClient();
  const today = getMalaysiaDate();

  // Filters
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(today);
  const [filterCategory, setFilterCategory] = useState<'all' | CategoryType>('all');
  const [filterPlatform, setFilterPlatform] = useState<'all' | string>('all');
  const [pageSize, setPageSize] = useState<number | 'All'>(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Dialog / form
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formCategory, setFormCategory] = useState<CategoryType>('Overhead');
  const [formPlatform, setFormPlatform] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formTotal, setFormTotal] = useState('');
  const [formDate, setFormDate] = useState(today);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [existingAttachment, setExistingAttachment] = useState<string | null>(null);

  // Expenses in range (paginated past the 1000-row cap).
  const { data: expenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ['account-expenses', startDate, endDate],
    queryFn: async () => {
      const data = await fetchAllRows(() =>
        (supabase as any)
          .from('expenses')
          .select('id, category, platform, description, total, date, attachment_url, created_at')
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: false })
      );
      return (data || []) as Expense[];
    },
  });

  // Cost Product is derived from the orders' base cost (same figure Report Profit
  // uses), so the "Cost Product" card/monthly reflects real product cost.
  const { data: costProductRows = [] } = useQuery<{ cost_baseproduct: number; date_order: string }[]>({
    queryKey: ['account-expenses-cost-product', startDate, endDate],
    queryFn: async () => {
      const data = await fetchAllRows(() =>
        (supabase as any)
          .from('customer_purchases')
          .select('cost_baseproduct, date_order')
          .gte('date_order', startDate)
          .lte('date_order', endDate)
      );
      return (data || []) as { cost_baseproduct: number; date_order: string }[];
    },
  });

  const costProductTotal = useMemo(
    () => costProductRows.reduce((sum, o) => sum + (Number(o.cost_baseproduct) || 0), 0),
    [costProductRows],
  );

  // Client-side category + platform filter.
  const filteredExpenses = useMemo(() => expenses.filter((e) => {
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    if (filterPlatform !== 'all' && (e.platform || '') !== filterPlatform) return false;
    return true;
  }), [expenses, filterCategory, filterPlatform]);

  const totalPages = pageSize === 'All' ? 1 : Math.max(1, Math.ceil(filteredExpenses.length / pageSize));
  const paginatedExpenses = pageSize === 'All'
    ? filteredExpenses
    : filteredExpenses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Card totals: Overhead/Marketing/Other from the expenses table; Cost Product
  // from orders (overrides any Cost Product rows to avoid double counting).
  const categoryTotals = useMemo(() => {
    const totals: Record<CategoryType, number> = { Overhead: 0, Marketing: 0, 'Cost Product': 0, Other: 0 };
    expenses.forEach((e) => {
      if (e.category && totals[e.category as CategoryType] !== undefined) {
        totals[e.category as CategoryType] += Number(e.total) || 0;
      }
    });
    totals['Cost Product'] = costProductTotal;
    return totals;
  }, [expenses, costProductTotal]);

  const totalExpenses = Object.values(categoryTotals).reduce((s, v) => s + v, 0);

  // Per-platform breakdown per category (from the expenses table only).
  const categoryPlatformTotals = useMemo(() => {
    const result: Record<CategoryType, Record<string, number>> = {
      Overhead: {}, Marketing: {}, 'Cost Product': {}, Other: {},
    };
    expenses.forEach((e) => {
      const cat = (e.category as CategoryType) || 'Other';
      if (result[cat] && e.platform) {
        result[cat][e.platform] = (result[cat][e.platform] || 0) + (Number(e.total) || 0);
      }
    });
    return result;
  }, [expenses]);

  // Monthly summary — one row per month in the range (even empty ones), newest first.
  const monthlySummary = useMemo(() => {
    type MonthData = { categories: Record<CategoryType, number>; categoryPlatforms: Record<CategoryType, Record<string, number>> };
    const initMonth = (): MonthData => ({
      categories: { Overhead: 0, Marketing: 0, 'Cost Product': 0, Other: 0 },
      categoryPlatforms: { Overhead: {}, Marketing: {}, 'Cost Product': {}, Other: {} },
    });
    const summary: Record<string, MonthData> = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cur <= end) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
        summary[key] = initMonth();
        cur.setMonth(cur.getMonth() + 1);
      }
    }

    expenses.forEach((e) => {
      const month = (e.date || '').substring(0, 7);
      if (!month) return;
      if (!summary[month]) summary[month] = initMonth();
      const cat = (e.category as CategoryType) || 'Other';
      if (summary[month].categories[cat] !== undefined) summary[month].categories[cat] += Number(e.total) || 0;
      if (e.platform && summary[month].categoryPlatforms[cat]) {
        summary[month].categoryPlatforms[cat][e.platform] = (summary[month].categoryPlatforms[cat][e.platform] || 0) + (Number(e.total) || 0);
      }
    });

    costProductRows.forEach((o) => {
      const month = (o.date_order || '').substring(0, 7);
      if (!month) return;
      if (!summary[month]) summary[month] = initMonth();
      summary[month].categories['Cost Product'] += Number(o.cost_baseproduct) || 0;
    });

    return Object.entries(summary)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, data]) => ({
        month,
        ...data.categories,
        categoryPlatforms: data.categoryPlatforms,
        total: Object.values(data.categories).reduce((s, v) => s + v, 0),
      }));
  }, [expenses, costProductRows, startDate, endDate]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      toast({ title: 'Format tidak sah', description: 'Hanya JPEG, PNG atau PDF dibenarkan.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Fail terlalu besar', description: 'Saiz maksimum 5MB.', variant: 'destructive' });
      return;
    }
    setAttachmentFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => setAttachmentPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setAttachmentPreview(null);
    }
  };

  const resetForm = () => {
    setFormCategory('Overhead');
    setFormPlatform('');
    setFormDescription('');
    setFormTotal('');
    setFormDate(today);
    setAttachmentFile(null);
    setAttachmentPreview(null);
    setExistingAttachment(null);
    setIsEditing(false);
    setEditingId(null);
  };

  const handleAddClick = () => { resetForm(); setIsDialogOpen(true); };

  const handleEditClick = (expense: Expense) => {
    setFormCategory((expense.category as CategoryType) || 'Other');
    setFormPlatform(expense.platform || '');
    setFormDescription(expense.description);
    setFormTotal(String(expense.total));
    setFormDate(expense.date);
    setExistingAttachment(expense.attachment_url);
    setAttachmentFile(null);
    setAttachmentPreview(null);
    setIsEditing(true);
    setEditingId(expense.id);
    setIsDialogOpen(true);
  };

  const uploadToBlob = async (file: File): Promise<string> => {
    const token = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;
    if (!token) throw new Error('Blob storage token not configured');
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-');
    const blob = await put(`expenses/${Date.now()}-${cleanName}`, file, { access: 'public', token });
    return blob.url;
  };

  // Best-effort blob cleanup — never blocks the row operation.
  const deleteFromBlob = async (url: string) => {
    try {
      await fetch('/api/delete-blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
    } catch (err) {
      console.error('Blob delete error:', err);
    }
  };

  const handleSubmit = async () => {
    if (!formDescription.trim()) {
      toast({ title: 'Error', description: 'Sila masukkan description.', variant: 'destructive' });
      return;
    }
    if (!formTotal || Number(formTotal) <= 0) {
      toast({ title: 'Error', description: 'Sila masukkan jumlah yang sah.', variant: 'destructive' });
      return;
    }
    if (!formDate) {
      toast({ title: 'Error', description: 'Sila pilih tarikh.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      let attachmentUrl = existingAttachment;
      if (attachmentFile) {
        if (existingAttachment) await deleteFromBlob(existingAttachment);
        attachmentUrl = await uploadToBlob(attachmentFile);
      }

      const payload = {
        // `type` is NOT NULL in the schema (legacy VAR/FIX); we don't expose it, so
        // stamp a constant to satisfy the constraint.
        type: 'VAR',
        category: formCategory,
        platform: formPlatform || null,
        description: formDescription.trim(),
        total: Number(formTotal),
        date: formDate,
        attachment_url: attachmentUrl,
        updated_at: new Date().toISOString(),
      };

      if (isEditing && editingId) {
        const { error } = await (supabase as any).from('expenses').update(payload).eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Expense Dikemaskini', description: 'Perbelanjaan telah dikemaskini.' });
      } else {
        const { error } = await (supabase as any).from('expenses').insert(payload);
        if (error) throw error;
        toast({ title: 'Expense Ditambah', description: 'Perbelanjaan baru telah ditambah.' });
      }

      queryClient.invalidateQueries({ queryKey: ['account-expenses'] });
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Error saving expense:', error);
      toast({ title: 'Error', description: error.message || 'Gagal menyimpan perbelanjaan.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, attachmentUrl: string | null) => {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Padam Expense?',
      text: 'Tindakan ini tidak boleh dibatalkan.',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Ya, Padam',
      cancelButtonText: 'Batal',
    });
    if (!result.isConfirmed) return;
    try {
      if (attachmentUrl) await deleteFromBlob(attachmentUrl);
      const { error } = await (supabase as any).from('expenses').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Expense Dipadam', description: 'Perbelanjaan telah dipadam.' });
      queryClient.invalidateQueries({ queryKey: ['account-expenses'] });
    } catch (error: any) {
      console.error('Error deleting expense:', error);
      toast({ title: 'Error', description: error.message || 'Gagal memadam.', variant: 'destructive' });
    }
  };

  const fileIcon = (url: string) => (url.toLowerCase().includes('.pdf') ? <FileText className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />);

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${names[parseInt(month, 10) - 1] || month} ${year}`;
  };

  const exportToXLSX = () => {
    const data = filteredExpenses.map((e, i) => ({
      No: i + 1,
      Category: e.category || 'Other',
      Platform: e.platform || '-',
      Description: e.description,
      'Total (RM)': Number(e.total).toFixed(2),
      Date: e.date,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 5 }, { wch: 15 }, { wch: 12 }, { wch: 40 }, { wch: 15 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
    XLSX.writeFile(wb, `expenses_${startDate}_to_${endDate}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header + Add */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <DollarSign className="w-6 h-6" />
            Expenses
          </h1>
          <p className="text-muted-foreground mt-1">Urus perbelanjaan mengikut kategori: Overhead, Marketing, Other</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button onClick={handleAddClick}><Plus className="w-4 h-4 mr-2" />Add Expense</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Expense' : 'Add New Expense'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={formCategory} onValueChange={(v) => setFormCategory(v as CategoryType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORM_CATEGORY_OPTIONS.map((cat) => {
                      const cfg = categoryConfig[cat];
                      const Icon = cfg.icon;
                      return (
                        <SelectItem key={cat} value={cat}>
                          <div className="flex items-center gap-2"><Icon className={`w-4 h-4 ${cfg.color}`} />{cat}</div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Platform (Optional)</Label>
                <Select value={formPlatform || '__none__'} onValueChange={(v) => setFormPlatform(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih platform (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- None --</SelectItem>
                    {PLATFORM_OPTIONS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="cth: Sewa pejabat, Facebook Ads, bahan mentah..." value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Total (RM)</Label>
                <Input type="number" step="0.01" min="0" placeholder="0.00" value={formTotal} onChange={(e) => setFormTotal(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Attachment (Optional)</Label>
                <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={handleFileChange} className="hidden" id="expense-attachment" />
                <label htmlFor="expense-attachment" className="flex items-center justify-center gap-2 w-full px-4 py-3 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors bg-background">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm text-muted-foreground">
                    {attachmentFile ? attachmentFile.name : existingAttachment ? 'Ganti lampiran sedia ada' : 'Muat naik JPEG, PNG atau PDF (max 5MB)'}
                  </span>
                </label>
                {(attachmentPreview || existingAttachment) && (
                  <div className="mt-2 p-2 bg-muted rounded-lg">
                    {attachmentPreview ? (
                      <img src={attachmentPreview} alt="Preview" className="w-full h-32 object-contain rounded" />
                    ) : existingAttachment && existingAttachment.toLowerCase().includes('.pdf') ? (
                      <div className="flex items-center gap-2 text-sm">
                        <FileText className="w-4 h-4" /><span>PDF dilampirkan</span>
                        <a href={existingAttachment} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Lihat</a>
                      </div>
                    ) : existingAttachment ? (
                      <img src={existingAttachment} alt="Lampiran" className="w-full h-32 object-contain rounded" />
                    ) : null}
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Batal</Button>
                <Button className="flex-1" onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {isEditing ? 'Kemaskini' : 'Tambah'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
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
              const all: Record<string, number> = {};
              Object.values(categoryPlatformTotals).forEach((pt) => {
                Object.entries(pt).forEach(([p, v]) => { all[p] = (all[p] || 0) + v; });
              });
              const platforms = PLATFORM_OPTIONS.filter((p) => all[p]);
              return platforms.length ? (
                <div className="mt-2 pt-2 border-t space-y-0.5">
                  {platforms.map((p) => (
                    <div key={p} className="flex justify-between text-xs text-muted-foreground">
                      <span>{p}</span><span>RM {all[p].toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : null;
            })()}
          </CardContent>
        </Card>
        {CATEGORY_OPTIONS.map((cat) => {
          const cfg = categoryConfig[cat];
          const Icon = cfg.icon;
          const breakdown = categoryPlatformTotals[cat] || {};
          const platforms = PLATFORM_OPTIONS.filter((p) => breakdown[p]);
          return (
            <Card key={cat}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Icon className={`w-6 h-6 ${cfg.color}`} />
                  <div>
                    <p className="text-xl font-bold">RM {categoryTotals[cat].toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{cat}</p>
                  </div>
                </div>
                {platforms.length > 0 && (
                  <div className="mt-2 pt-2 border-t space-y-0.5">
                    {platforms.map((p) => (
                      <div key={p} className="flex justify-between text-xs text-muted-foreground">
                        <span>{p}</span><span>RM {breakdown[p].toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Monthly summary */}
      {monthlySummary.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-4">Monthly Summary</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-3 text-left">Month</th>
                    {CATEGORY_OPTIONS.map((cat) => (<th key={cat} className="p-3 text-right">{cat}</th>))}
                    <th className="p-3 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySummary.map((row) => (
                    <tr key={row.month} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-medium">{formatMonth(row.month)}</td>
                      {CATEGORY_OPTIONS.map((cat) => {
                        const catPlatforms = row.categoryPlatforms[cat] || {};
                        const platforms = PLATFORM_OPTIONS.filter((p) => catPlatforms[p]);
                        return (
                          <td key={cat} className="p-3 text-right">
                            <div>RM {(row[cat] as number).toFixed(2)}</div>
                            {platforms.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {platforms.map((p) => (
                                  <div key={p} className="text-[10px] text-indigo-600 dark:text-indigo-400">{p}: RM {catPlatforms[p].toFixed(2)}</div>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-3 text-right font-bold">RM {row.total.toFixed(2)}</td>
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
              <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }} className="w-40" />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground whitespace-nowrap">End:</span>
              <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }} className="w-40" />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Category:</span>
              <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v as any); setCurrentPage(1); }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CATEGORY_OPTIONS.map((cat) => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Platform:</span>
              <Select value={filterPlatform} onValueChange={(v) => { setFilterPlatform(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  {PLATFORM_OPTIONS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(v === 'All' ? 'All' : Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((s) => (<SelectItem key={String(s)} value={String(s)}>{s}</SelectItem>))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">entries</span>
            </div>
            <Button onClick={exportToXLSX} className="bg-green-600 hover:bg-green-700 text-white">
              <Download className="w-4 h-4 mr-2" />Export XLSX
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
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
                        const cfg = categoryConfig[expense.category as CategoryType] || categoryConfig.Other;
                        const Icon = cfg.icon;
                        const no = pageSize === 'All' ? index + 1 : (currentPage - 1) * (pageSize as number) + index + 1;
                        return (
                          <tr key={expense.id} className="border-b border-border hover:bg-muted/30">
                            <td className="p-3">{no}</td>
                            <td className="p-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium inline-flex items-center gap-1 ${cfg.bgColor} ${cfg.color}`}>
                                <Icon className="w-3 h-3" />{expense.category || 'Other'}
                              </span>
                            </td>
                            <td className="p-3">
                              {expense.platform ? (
                                <span className="px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">{expense.platform}</span>
                              ) : (<span className="text-muted-foreground">-</span>)}
                            </td>
                            <td className="p-3">{expense.description}</td>
                            <td className="p-3 text-right font-medium">RM {Number(expense.total).toFixed(2)}</td>
                            <td className="p-3 whitespace-nowrap">{formatDMY(expense.date)}</td>
                            <td className="p-3 text-center">
                              {expense.attachment_url ? (
                                <a href={expense.attachment_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline">
                                  {fileIcon(expense.attachment_url)}<Eye className="w-3 h-3" />
                                </a>
                              ) : (<span className="text-muted-foreground">-</span>)}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="sm" onClick={() => handleEditClick(expense)} className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30">
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                {!AUDIT_MODE && (
                                  <Button variant="ghost" size="sm" onClick={() => handleDelete(expense.id, expense.attachment_url)} className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Tiada perbelanjaan untuk tempoh ini.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * (pageSize as number) + 1} to {Math.min(currentPage * (pageSize as number), filteredExpenses.length)} of {filteredExpenses.length} entries
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
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
