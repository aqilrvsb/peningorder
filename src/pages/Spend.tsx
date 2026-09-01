import React, { useState, useMemo } from 'react';
import { AUDIT_MODE } from '@/lib/audit';
import { useAuth } from '@/context/AuthContext';
import { useBundles } from '@/context/BundleContext';
import { useTeam } from '@/hooks/useTeam';
import { TeamFilter } from '@/components/TeamFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Plus, Trash2, Loader2, DollarSign, RotateCcw, Pencil, TrendingUp, Paperclip, Eye
} from 'lucide-react';
import { put } from '@vercel/blob';
import { ReceiptViewer } from '@/components/ReceiptViewer';
import { toast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { getMalaysiaYesterday, fetchAllRows } from '@/lib/utils';

const PLATFORM_OPTIONS = ['Facebook', 'Threads', 'Tiktok', 'Database', 'Google'];

interface Spend {
  id: string;
  product: string;
  jenisPlatform: string;
  jenisClosing: string;
  totalSpend: number;
  tarikhSpend: string;
  marketerIdStaff: string;
  createdAt: string;
  receiptUrl?: string;
  receiptType?: string;
}

const Spend: React.FC = () => {
  const { profile } = useAuth();
  const { products } = useBundles();
  const [spends, setSpends] = useState<Spend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [teamFilter, setTeamFilter] = useState('');
  const { nameByIdstaff } = useTeam();
  const [startDate, setStartDate] = useState(getMalaysiaYesterday());
  const [endDate, setEndDate] = useState(getMalaysiaYesterday());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingSpend, setEditingSpend] = useState<Spend | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);   // optional receipt (image/PDF)
  const [viewingReceipt, setViewingReceipt] = useState<Spend | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [spendToDelete, setSpendToDelete] = useState<string | null>(null);
  // Sales in the selected period — used only to compute the ROAS KPI (Sale / Spend).
  const [salesRows, setSalesRows] = useState<{ date_order: string; total_sale: number; marketer_id_staff: string }[]>([]);

  const [formData, setFormData] = useState({
    product: '',
    jenisPlatform: '',
    jenisClosing: '',
    totalSpend: '',
    tarikhSpend: '',
  });

  const canCreate = profile?.role === 'marketer' || profile?.role === 'admin' || profile?.role === 'client' || profile?.role === 'superadmin';

  // Check if current user is marketer (should only see their own data)
  const isMarketer = profile?.role === 'marketer';
  const userIdStaff = profile?.idstaff;

  // Fetch spends data
  const fetchSpends = async () => {
    setIsLoading(true);
    try {
      // fetchAllRows paginates past the PostgREST 1000-row cap so Total Spend
      // and per-platform totals are complete, not silently truncated.
      const data = await fetchAllRows(() => {
        let q = (supabase as any).from('spends').select('*').order('created_at', { ascending: false });
        if (isMarketer && userIdStaff) q = q.eq('marketer_id_staff', userIdStaff);
        return q;
      });
      setSpends((data || []).map((d: any) => ({
        id: d.id,
        product: d.product,
        jenisPlatform: d.jenis_platform,
        jenisClosing: d.jenis_closing || '',
        totalSpend: parseFloat(d.total_spend) || 0,
        tarikhSpend: d.tarikh_spend,
        marketerIdStaff: d.marketer_id_staff || '',
        createdAt: d.created_at,
        receiptUrl: d.receipt_url || '',
        receiptType: d.receipt_type || '',
      })));
    } catch (error) {
      console.error('Error fetching spends:', error);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchSpends();
  }, [isMarketer, userIdStaff]);

  // Fetch sales for the selected period to compute ROAS (Sale / Spend). Bounded
  // by the date range so we never pull the whole customer_purchases table.
  React.useEffect(() => {
    (async () => {
      try {
        const rows = await fetchAllRows(() => {
          let q = (supabase as any)
            .from('customer_purchases')
            .select('date_order, total_sale, marketer_id_staff');
          if (startDate) q = q.gte('date_order', startDate);
          if (endDate) q = q.lte('date_order', endDate);
          if (isMarketer && userIdStaff) q = q.eq('marketer_id_staff', userIdStaff);
          return q;
        });
        setSalesRows((rows || []).map((r: any) => ({
          date_order: r.date_order,
          total_sale: Number(r.total_sale) || 0,
          marketer_id_staff: r.marketer_id_staff || '',
        })));
      } catch (error) {
        console.error('Error fetching sales for ROAS:', error);
      }
    })();
  }, [startDate, endDate, isMarketer, userIdStaff]);

  // Filter spends based on date range
  const filteredSpends = useMemo(() => {
    return spends.filter((spend) => {
      if (teamFilter && (spend.marketerIdStaff || '') !== teamFilter) return false;
      const spendDate = spend.tarikhSpend;
      const matchesStartDate = !startDate || (spendDate && spendDate >= startDate);
      const matchesEndDate = !endDate || (spendDate && spendDate <= endDate);
      return matchesStartDate && matchesEndDate;
    });
  }, [spends, startDate, endDate, teamFilter]);

  // Calculate stats - Total Spend and dynamic platform totals
  const stats = useMemo(() => {
    const totalSpend = filteredSpends.reduce((sum, s) => sum + s.totalSpend, 0);
    
    // Calculate spend by platform dynamically
    const platformSpends: Record<string, number> = {};
    filteredSpends.forEach((spend) => {
      const platform = spend.jenisPlatform;
      if (platform) {
        platformSpends[platform] = (platformSpends[platform] || 0) + spend.totalSpend;
      }
    });

    return { totalSpend, platformSpends };
  }, [filteredSpends]);

  // ROAS = Total Sale / Total Spend for the same period + team filter.
  const totalSales = useMemo(
    () => salesRows
      .filter((r) => !teamFilter || r.marketer_id_staff === teamFilter)
      .reduce((sum, r) => sum + r.total_sale, 0),
    [salesRows, teamFilter],
  );
  const roas = stats.totalSpend > 0 ? totalSales / stats.totalSpend : 0;

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormData({
      product: '',
      jenisPlatform: '',
      jenisClosing: '',
      totalSpend: '',
      tarikhSpend: '',
    });
    setEditingSpend(null);
    setReceiptFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.product || !formData.jenisPlatform || !formData.totalSpend || !formData.tarikhSpend) {
      toast({
        title: 'Error',
        description: 'Sila lengkapkan semua medan yang diperlukan.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Optional receipt/proof upload (image or PDF) to Vercel Blob.
      let receiptUrl: string | null = null;
      if (receiptFile) {
        const token = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;
        if (!token) throw new Error('Blob storage token not configured');
        const cleanName = receiptFile.name.replace(/[^a-zA-Z0-9.-]/g, '-');
        const blob = await put(`spends/${Date.now()}-${cleanName}`, receiptFile, { access: 'public', token });
        receiptUrl = blob.url;
      }

      if (editingSpend) {
        const { error } = await (supabase as any).from('spends').update({
          product: formData.product,
          jenis_platform: formData.jenisPlatform,
          jenis_closing: formData.jenisClosing,
          total_spend: parseFloat(formData.totalSpend),
          tarikh_spend: formData.tarikhSpend,
          updated_at: new Date().toISOString(),
          // Only overwrite the receipt when a new file is chosen; keep the old one otherwise.
          ...(receiptUrl ? { receipt_url: receiptUrl, receipt_type: 'image' } : {}),
        }).eq('id', editingSpend.id);

        if (error) throw error;
        toast({ title: 'Spend Dikemaskini', description: 'Spend telah berjaya dikemaskini.' });
      } else {
        const { error } = await (supabase as any).from('spends').insert({
          product: formData.product,
          jenis_platform: formData.jenisPlatform,
          jenis_closing: formData.jenisClosing,
          total_spend: parseFloat(formData.totalSpend),
          tarikh_spend: formData.tarikhSpend,
          marketer_id_staff: profile?.idstaff || '',
          receipt_url: receiptUrl,
          receipt_type: receiptUrl ? 'image' : null,
        });

        if (error) throw error;
        toast({ title: 'Spend Ditambah', description: 'Spend baru telah berjaya ditambah.' });
      }

      resetForm();
      setIsDialogOpen(false);
      await fetchSpends();
    } catch (error) {
      console.error('Error saving spend:', error);
      toast({ title: 'Error', description: 'Gagal menyimpan spend.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (spend: Spend) => {
    setEditingSpend(spend);
    setFormData({
      product: spend.product,
      jenisPlatform: spend.jenisPlatform,
      jenisClosing: spend.jenisClosing,
      totalSpend: spend.totalSpend.toString(),
      tarikhSpend: spend.tarikhSpend,
    });
    setReceiptFile(null); // keep the existing receipt unless a new file is picked
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setSpendToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!spendToDelete) return;
    try {
      const { error } = await (supabase as any).from('spends').delete().eq('id', spendToDelete);
      if (error) throw error;
      toast({ title: 'Spend Dipadam', description: 'Spend telah berjaya dipadam.' });
      await fetchSpends();
    } catch (error) {
      console.error('Error deleting spend:', error);
      toast({ title: 'Error', description: 'Gagal memadam spend.', variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setSpendToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Spend</h1>
          <p className="text-muted-foreground">Urus perbelanjaan marketing</p>
        </div>
        {canCreate && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />Add Spend</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingSpend ? 'Edit Spend' : 'Add New Spend'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="product">Product *</Label>
                  <Select value={formData.product} onValueChange={(value) => handleChange('product', value)}>
                    <SelectTrigger><SelectValue placeholder="Pilih product" /></SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.sku}>{product.sku} - {product.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jenisPlatform">Jenis Platform *</Label>
                  <Select value={formData.jenisPlatform} onValueChange={(value) => handleChange('jenisPlatform', value)}>
                    <SelectTrigger><SelectValue placeholder="Pilih platform" /></SelectTrigger>
                    <SelectContent>
                      {PLATFORM_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totalSpend">Total Spend (RM) *</Label>
                  <Input 
                    id="totalSpend" 
                    type="number" 
                    step="0.01"
                    placeholder="0.00" 
                    value={formData.totalSpend} 
                    onChange={(e) => handleChange('totalSpend', e.target.value)} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tarikhSpend">Tarikh Spend *</Label>
                  <Input
                    id="tarikhSpend"
                    type="date"
                    value={formData.tarikhSpend}
                    onChange={(e) => handleChange('tarikhSpend', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="receiptFile" className="flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" /> Resit / Bukti Spend <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="receiptFile"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                  />
                  {receiptFile ? (
                    <p className="text-xs text-muted-foreground">Fail dipilih: {receiptFile.name}</p>
                  ) : editingSpend?.receiptUrl ? (
                    <p className="text-xs text-muted-foreground">Resit sedia ada dilampirkan — pilih fail baru untuk menggantikan.</p>
                  ) : null}
                </div>
                <DialogFooter className="gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => {
                    setIsDialogOpen(false);
                    resetForm();
                  }}>Batal</Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editingSpend ? 'Kemaskini' : 'Tambah'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats Cards - Total Spend + Platform Totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="w-4 h-4 text-green-500" />
            <span className="text-xs uppercase font-medium">Total Spend</span>
          </div>
          <p className="text-xl font-bold text-foreground">RM {stats.totalSpend.toFixed(2)}</p>
        </div>

        {/* ROAS = Sale / Spend for the selected period (informational KPI). */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <span className="text-xs uppercase font-medium">ROAS</span>
          </div>
          <p className="text-xl font-bold text-amber-600">{roas.toFixed(2)}x</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Sale RM {totalSales.toFixed(2)} / Spend</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="w-4 h-4 text-blue-500" />
            <span className="text-xs uppercase font-medium">Total Spend FB</span>
          </div>
          <p className="text-xl font-bold text-foreground">RM {(stats.platformSpends['Facebook'] || 0).toFixed(2)}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="w-4 h-4 text-purple-500" />
            <span className="text-xs uppercase font-medium">Total Spend Database</span>
          </div>
          <p className="text-xl font-bold text-foreground">RM {(stats.platformSpends['Database'] || 0).toFixed(2)}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="w-4 h-4 text-orange-500" />
            <span className="text-xs uppercase font-medium">Total Spend Google</span>
          </div>
          <p className="text-xl font-bold text-foreground">RM {(stats.platformSpends['Google'] || 0).toFixed(2)}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="w-4 h-4 text-pink-500" />
            <span className="text-xs uppercase font-medium">Total Spend Tiktok</span>
          </div>
          <p className="text-xl font-bold text-foreground">RM {(stats.platformSpends['Tiktok'] || 0).toFixed(2)}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="w-4 h-4 text-red-500" />
            <span className="text-xs uppercase font-medium">Total Spend Threads</span>
          </div>
          <p className="text-xl font-bold text-foreground">RM {(stats.platformSpends['Threads'] || 0).toFixed(2)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-muted-foreground mb-1">Start Date</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-background"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-muted-foreground mb-1">End Date</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-background"
            />
          </div>
          <div className="flex items-end"><TeamFilter value={teamFilter} onChange={setTeamFilter} /></div>
          <Button variant="outline" onClick={resetFilters}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-16">No</TableHead>
              <TableHead className="text-blue-600 dark:text-blue-400">ID Staff</TableHead>
              <TableHead className="text-blue-600 dark:text-blue-400">Nama</TableHead>
              <TableHead>Tarikh Spend</TableHead>
              <TableHead className="text-right">Total Spend</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Resit</TableHead>
              <TableHead className="w-24">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSpends.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Tiada data spend
                </TableCell>
              </TableRow>
            ) : (
              filteredSpends.map((spend, idx) => (
                <TableRow key={spend.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{idx + 1}</TableCell>
                  <TableCell className="font-mono text-blue-600 dark:text-blue-400">{spend.marketerIdStaff || '-'}</TableCell>
                  <TableCell>{nameByIdstaff.get(spend.marketerIdStaff || '') || '-'}</TableCell>
                  <TableCell>{spend.tarikhSpend}</TableCell>
                  <TableCell className="text-right">RM {spend.totalSpend.toFixed(2)}</TableCell>
                  <TableCell>{spend.product}</TableCell>
                  <TableCell>{spend.jenisPlatform}</TableCell>
                  <TableCell>
                    {spend.receiptUrl ? (
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setViewingReceipt(spend)}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> Lihat
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditClick(spend)}
                        className="p-1.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!AUDIT_MODE && (
                        <button
                          onClick={() => handleDeleteClick(spend.id)}
                          className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Receipt viewer — image shows inline, PDF renders via shared ReceiptViewer */}
      <Dialog open={!!viewingReceipt} onOpenChange={(o) => { if (!o) setViewingReceipt(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Resit Spend — {viewingReceipt?.product || ''}</DialogTitle>
          </DialogHeader>
          {viewingReceipt?.receiptUrl && (
            <ReceiptViewer url={viewingReceipt.receiptUrl} type={viewingReceipt.receiptType} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Padam Spend?</AlertDialogTitle>
            <AlertDialogDescription>
              Adakah anda pasti mahu memadam spend ini? Tindakan ini tidak boleh dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700">
              Padam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Spend;
