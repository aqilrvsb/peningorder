import React, { useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBundles } from '@/context/BundleContext';
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
  Plus, Trash2, Loader2, DollarSign, RotateCcw, Pencil
} from 'lucide-react';
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
import { getMalaysiaYesterday } from '@/lib/utils';

const PLATFORM_OPTIONS = ['Facebook', 'Tiktok', 'Shopee', 'Database', 'Google'];
const JENIS_CLOSING_OPTIONS = ['Website', 'Wa Bot', 'Manual', 'Call', 'Live', 'Shop'];

interface Spend {
  id: string;
  product: string;
  jenisPlatform: string;
  jenisClosing: string;
  totalSpend: number;
  tarikhSpend: string;
  marketerIdStaff: string;
  createdAt: string;
}

const Spend: React.FC = () => {
  const { profile } = useAuth();
  const { products } = useBundles();
  const [spends, setSpends] = useState<Spend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState(getMalaysiaYesterday());
  const [endDate, setEndDate] = useState(getMalaysiaYesterday());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingSpend, setEditingSpend] = useState<Spend | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [spendToDelete, setSpendToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    product: '',
    jenisPlatform: '',
    jenisClosing: '',
    totalSpend: '',
    tarikhSpend: '',
  });

  const canCreate = profile?.role === 'marketer' || profile?.role === 'admin';

  // Check if current user is marketer (should only see their own data)
  const isMarketer = profile?.role === 'marketer';
  const userIdStaff = profile?.idstaff;

  // Fetch spends data
  const fetchSpends = async () => {
    setIsLoading(true);
    try {
      let query = (supabase as any).from('spends').select('*').order('created_at', { ascending: false });

      // Marketers only see their own spends
      if (isMarketer && userIdStaff) {
        query = query.eq('marketer_id_staff', userIdStaff);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSpends((data || []).map((d: any) => ({
        id: d.id,
        product: d.product,
        jenisPlatform: d.jenis_platform,
        jenisClosing: d.jenis_closing || '',
        totalSpend: parseFloat(d.total_spend) || 0,
        tarikhSpend: d.tarikh_spend,
        marketerIdStaff: d.marketer_id_staff || '',
        createdAt: d.created_at,
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

  // Filter spends based on date range
  const filteredSpends = useMemo(() => {
    return spends.filter((spend) => {
      const spendDate = spend.tarikhSpend;
      const matchesStartDate = !startDate || (spendDate && spendDate >= startDate);
      const matchesEndDate = !endDate || (spendDate && spendDate <= endDate);
      return matchesStartDate && matchesEndDate;
    });
  }, [spends, startDate, endDate]);

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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.product || !formData.jenisPlatform || !formData.jenisClosing || !formData.totalSpend || !formData.tarikhSpend) {
      toast({
        title: 'Error',
        description: 'Sila lengkapkan semua medan yang diperlukan.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingSpend) {
        const { error } = await (supabase as any).from('spends').update({
          product: formData.product,
          jenis_platform: formData.jenisPlatform,
          jenis_closing: formData.jenisClosing,
          total_spend: parseFloat(formData.totalSpend),
          tarikh_spend: formData.tarikhSpend,
          updated_at: new Date().toISOString(),
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
                  <Label htmlFor="jenisClosing">Jenis Closing *</Label>
                  <Select value={formData.jenisClosing} onValueChange={(value) => handleChange('jenisClosing', value)}>
                    <SelectTrigger><SelectValue placeholder="Pilih jenis closing" /></SelectTrigger>
                    <SelectContent>
                      {JENIS_CLOSING_OPTIONS.map((opt) => (
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
            <span className="text-xs uppercase font-medium">Total Spend Shopee</span>
          </div>
          <p className="text-xl font-bold text-foreground">RM {(stats.platformSpends['Shopee'] || 0).toFixed(2)}</p>
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
              <TableHead>Tarikh Spend</TableHead>
              <TableHead className="text-right">Total Spend</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Jenis Closing</TableHead>
              <TableHead className="w-24">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSpends.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Tiada data spend
                </TableCell>
              </TableRow>
            ) : (
              filteredSpends.map((spend, idx) => (
                <TableRow key={spend.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{idx + 1}</TableCell>
                  <TableCell>{spend.tarikhSpend}</TableCell>
                  <TableCell className="text-right">RM {spend.totalSpend.toFixed(2)}</TableCell>
                  <TableCell>{spend.product}</TableCell>
                  <TableCell>{spend.jenisPlatform}</TableCell>
                  <TableCell>{spend.jenisClosing || '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditClick(spend)}
                        className="p-1.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(spend.id)}
                        className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
