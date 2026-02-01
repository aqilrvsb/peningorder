import React, { useState, useMemo, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useBundles } from '@/context/BundleContext';
import { supabase } from '@/integrations/supabase/client';
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
  Plus, Search, Trash2, UserPlus, Loader2, Users, User, UserCheck,
  Calendar, RotateCcw, Download, Upload, Pencil, FileSpreadsheet,
  DollarSign, Target, XCircle, ShoppingCart, UserCircle
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
import { getMalaysiaDate } from '@/lib/utils';
import * as XLSX from 'xlsx';

// Jenis Prospek is now auto-determined by OrderForm based on lead date

const Prospects: React.FC = () => {
  const { profile } = useAuth();
  const { prospects, addProspect, updateProspect, deleteProspect, isLoading } = useData();
  const { products } = useBundles();
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState(getMalaysiaDate());
  const [endDate, setEndDate] = useState(getMalaysiaDate());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingProspect, setEditingProspect] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [prospectToDelete, setProspectToDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showFormatDialog, setShowFormatDialog] = useState(false);
  const [ordersModalOpen, setOrdersModalOpen] = useState(false);
  const [selectedProspectOrders, setSelectedProspectOrders] = useState<any[]>([]);
  const [selectedProspectName, setSelectedProspectName] = useState('');
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  const [formData, setFormData] = useState({
    namaProspek: '',
    noTelefon: '',
    niche: '',
    tarikhPhoneNumber: '',
    adminIdStaff: '',
  });

  const canCreate = profile?.role === 'marketer' || profile?.role === 'admin';

  // Filter prospects based on search and date range
  const filteredProspects = useMemo(() => {
    return prospects.filter((prospect) => {
      const matchesSearch =
        prospect.namaProspek.toLowerCase().includes(search.toLowerCase()) ||
        prospect.noTelefon.includes(search) ||
        prospect.niche.toLowerCase().includes(search.toLowerCase());

      const prospectDate = prospect.tarikhPhoneNumber;
      const matchesStartDate = !startDate || (prospectDate && prospectDate >= startDate);
      const matchesEndDate = !endDate || (prospectDate && prospectDate <= endDate);

      return matchesSearch && matchesStartDate && matchesEndDate;
    });
  }, [prospects, search, startDate, endDate]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalLead = filteredProspects.length;
    const totalNP = filteredProspects.filter(p => p.jenisProspek === 'NP').length;
    const totalEP = filteredProspects.filter(p => p.jenisProspek === 'EP').length;
    const totalSales = filteredProspects
      .filter(p => p.statusClosed === 'closed')
      .reduce((sum, p) => sum + (p.priceClosed || 0), 0);
    const leadClose = filteredProspects.filter(p => p.statusClosed === 'closed').length;
    const leadXClose = filteredProspects.filter(p => !p.statusClosed || p.statusClosed !== 'closed').length;

    // Profile, Proses, X Process stats
    const profileCount = filteredProspects.filter(p => p.profile && p.profile.trim() !== '').length;
    const prosesCount = filteredProspects.filter(p => p.statusClosed && p.statusClosed.trim() !== '').length;
    const xProsesCount = filteredProspects.filter(p => !p.statusClosed || p.statusClosed.trim() === '').length;

    const profilePercent = totalLead > 0 ? ((profileCount / totalLead) * 100).toFixed(1) : '0';
    const prosesPercent = totalLead > 0 ? ((prosesCount / totalLead) * 100).toFixed(1) : '0';
    const xProsesPercent = totalLead > 0 ? ((xProsesCount / totalLead) * 100).toFixed(1) : '0';

    return {
      totalLead, totalNP, totalEP, totalSales, leadClose, leadXClose,
      profileCount, prosesCount, xProsesCount,
      profilePercent, prosesPercent, xProsesPercent
    };
  }, [filteredProspects]);

  const resetFilters = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
  };

  const handleViewOrders = async (prospect: any) => {
    if (!prospect.countOrder || prospect.countOrder === 0) return;

    setSelectedProspectName(prospect.namaProspek);
    setIsLoadingOrders(true);
    setOrdersModalOpen(true);

    try {
      // Fetch orders for this lead by phone number and marketer
      const { data: orders, error } = await (supabase as any)
        .from('customer_purchases')
        .select('date_order, total_price, produk, quantity')
        .eq('no_phone', prospect.noTelefon)
        .eq('marketer_id_staff', prospect.marketerIdStaff)
        .order('date_order', { ascending: false });

      if (error) throw error;
      setSelectedProspectOrders(orders || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast({
        title: 'Error',
        description: 'Gagal mendapatkan senarai order.',
        variant: 'destructive',
      });
      setSelectedProspectOrders([]);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    // Auto uppercase for text fields
    let processedValue = value;
    if (field === 'namaProspek' || field === 'adminIdStaff') {
      processedValue = value.toUpperCase();
    }
    setFormData((prev) => ({ ...prev, [field]: processedValue }));
  };

  const resetForm = () => {
    setFormData({
      namaProspek: '',
      noTelefon: '',
      niche: '',
      tarikhPhoneNumber: '',
      adminIdStaff: '',
    });
    setEditingProspect(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.namaProspek || !formData.noTelefon || !formData.niche || !formData.tarikhPhoneNumber) {
      toast({
        title: 'Error',
        description: 'Sila lengkapkan semua medan yang diperlukan.',
        variant: 'destructive',
      });
      return;
    }

    // Validate phone starts with 6
    if (!formData.noTelefon.startsWith('6')) {
      toast({
        title: 'Error',
        description: 'No. Telefon mesti bermula dengan 6.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingProspect) {
        await updateProspect(editingProspect.id, {
          namaProspek: formData.namaProspek,
          noTelefon: formData.noTelefon,
          niche: formData.niche,
          tarikhPhoneNumber: formData.tarikhPhoneNumber,
          adminIdStaff: formData.adminIdStaff,
        });
        toast({
          title: 'Prospect Dikemaskini',
          description: 'Prospect telah berjaya dikemaskini.',
        });
      } else {
        await addProspect({
          namaProspek: formData.namaProspek,
          noTelefon: formData.noTelefon,
          niche: formData.niche,
          jenisProspek: '', // Will be auto-determined by OrderForm based on lead date
          tarikhPhoneNumber: formData.tarikhPhoneNumber,
          adminIdStaff: formData.adminIdStaff,
          marketerIdStaff: '', // Will be auto-filled in DataContext for marketers
          statusClosed: '',
          priceClosed: 0,
        });
        toast({
          title: 'Prospect Ditambah',
          description: 'Prospect baru telah berjaya ditambah.',
        });
      }

      resetForm();
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving prospect:', error);
      toast({
        title: 'Error',
        description: 'Gagal menyimpan prospect.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (prospect: any) => {
    setEditingProspect(prospect);
    setFormData({
      namaProspek: prospect.namaProspek || '',
      noTelefon: prospect.noTelefon || '',
      niche: prospect.niche || '',
      tarikhPhoneNumber: prospect.tarikhPhoneNumber || '',
      adminIdStaff: prospect.adminIdStaff || '',
    });
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setProspectToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!prospectToDelete) return;
    try {
      await deleteProspect(prospectToDelete);
      toast({
        title: 'Prospect Dipadam',
        description: 'Prospect telah berjaya dipadam.',
      });
    } catch (error) {
      console.error('Error deleting prospect:', error);
      toast({
        title: 'Error',
        description: 'Gagal memadam prospect.',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setProspectToDelete(null);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.csv') && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast({
        title: 'Error',
        description: 'Sila muat naik fail Excel (.xlsx, .xls) atau CSV.',
        variant: 'destructive',
      });
      return;
    }

    setIsImporting(true);
    try {
      // Read file as ArrayBuffer for Excel, or text for CSV
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      let data: any[][] = [];

      if (isExcel) {
        // Parse Excel file using xlsx library
        const arrayBuffer = await file.arrayBuffer();
        // Use cellDates: true to get JavaScript Date objects for date cells
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        data = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false });
      } else {
        // Parse CSV file
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        data = lines.map(line => line.split(',').map(v => v.trim().replace(/"/g, '')));
      }

      if (data.length < 2) {
        toast({
          title: 'Error',
          description: 'Fail tidak mengandungi data.',
          variant: 'destructive',
        });
        return;
      }

      // Parse header to find column indexes
      const header = data[0].map((h: string) => (h || '').toString().trim().toLowerCase());
      const namaIdx = header.findIndex((h: string) => h.includes('nama'));
      const phoneIdx = header.findIndex((h: string) => h.includes('telefon') || h.includes('phone'));
      const nicheIdx = header.findIndex((h: string) => h.includes('niche') || h.includes('product') || h.includes('sku'));
      const tarikhIdx = header.findIndex((h: string) => h.includes('tarikh'));
      const adminIdx = header.findIndex((h: string) => h.includes('admin'));

      let successCount = 0;
      let errorCount = 0;
      let duplicateCount = 0;

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0 || row.every((cell: any) => !cell)) continue;

        const nama = namaIdx >= 0 && row[namaIdx] ? row[namaIdx].toString().toUpperCase().trim() : '';
        let phone = phoneIdx >= 0 && row[phoneIdx] ? row[phoneIdx].toString().trim().replace(/\D/g, '') : '';
        const nicheValue = nicheIdx >= 0 && row[nicheIdx] ? row[nicheIdx].toString().toUpperCase().trim() : '';
        let tarikhRaw = tarikhIdx >= 0 && row[tarikhIdx] ? row[tarikhIdx] : '';
        const admin = adminIdx >= 0 && row[adminIdx] ? row[adminIdx].toString().toUpperCase().trim() : '';

        console.log('Raw tarikh from Excel:', tarikhRaw, 'Type:', typeof tarikhRaw);

        // Auto-fix phone number format
        if (phone) {
          if (phone.startsWith('0')) {
            // If starts with 0, replace with 6 (e.g., 0123456789 -> 6123456789)
            phone = '6' + phone.substring(1);
          } else if (!phone.startsWith('6')) {
            // If doesn't start with 6, add 60 at front
            phone = '60' + phone;
          }
        }

        // Convert date to YYYY-MM-DD format
        let tarikh = '';
        if (tarikhRaw) {
          // If it's a JavaScript Date object (from Excel date cell)
          if (tarikhRaw instanceof Date) {
            const year = tarikhRaw.getFullYear();
            const month = String(tarikhRaw.getMonth() + 1).padStart(2, '0');
            const day = String(tarikhRaw.getDate()).padStart(2, '0');
            tarikh = `${year}-${month}-${day}`;
            console.log('Converted Date object:', tarikh);
          }
          // If it's a string
          else {
            const tarikhStr = tarikhRaw.toString().trim();
            // Check if it's an Excel serial number (all digits, value > 40000)
            if (/^\d+$/.test(tarikhStr) && Number(tarikhStr) > 40000) {
              const serial = Number(tarikhStr);
              const excelEpoch = new Date(1899, 11, 30);
              const date = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              tarikh = `${year}-${month}-${day}`;
              console.log('Converted from serial:', tarikh);
            }
            // Check if format is DD-MM-YYYY or DD-MM-YY
            else if (tarikhStr.match(/^\d{2}-\d{2}-\d{2,4}$/)) {
              const [day, month, year] = tarikhStr.split('-');
              console.log('Split date - day:', day, 'month:', month, 'year:', year);
              const fullYear = year.length === 2 ? `20${year}` : year;
              // Month stays in middle: DD-MM-YYYY → YYYY-MM-DD
              tarikh = `${fullYear}-${month}-${day}`;
              console.log('Converted from DD-MM-YYYY:', tarikh);
            }
            // If already in YYYY-MM-DD format, keep as is
            else {
              tarikh = tarikhStr;
            }
          }
        }

        // Match niche by product name or SKU (case-insensitive), save as SKU
        const product = products.find(p => p.name.toUpperCase() === nicheValue || p.sku.toUpperCase() === nicheValue);
        const niche = product ? product.sku : nicheValue; // Use product SKU if found, otherwise use raw value

        // Validate required fields
        if (!nama || !phone || !niche || !tarikh) {
          errorCount++;
          continue;
        }

        // Check for duplicate: same phone + marketer + date
        const isDuplicate = prospects.some(p =>
          p.noTelefon === phone &&
          p.marketerIdStaff === profile?.idstaff &&
          p.tarikhPhoneNumber === tarikh
        );

        if (isDuplicate) {
          duplicateCount++;
          continue; // Skip duplicate
        }

        try {
          await addProspect({
            namaProspek: nama,
            noTelefon: phone,
            niche: niche,
            jenisProspek: 'EP', // Set to EP for imported leads
            tarikhPhoneNumber: tarikh,
            adminIdStaff: admin,
            marketerIdStaff: '', // Will be auto-filled in DataContext for marketers
            statusClosed: '',
            priceClosed: 0,
          });
          successCount++;
        } catch (error: any) {
          console.error('Import error:', error);
          errorCount++;
        }
      }

      toast({
        title: 'Import Selesai',
        description: `${successCount} prospect berjaya diimport. ${duplicateCount} duplicate dilangkau. ${errorCount} gagal.`,
      });
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: 'Error',
        description: 'Gagal mengimport fail.',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const exportCSV = () => {
    const headers = ['No', 'Tarikh', 'Nama', 'Phone', 'Niche', 'Profile', 'Jenis Prospek', 'Count Order', 'Admin Id', 'Status', 'Price'];
    const rows = filteredProspects.map((prospect, idx) => [
      idx + 1,
      prospect.tarikhPhoneNumber || '-',
      prospect.namaProspek,
      prospect.noTelefon,
      prospect.niche,
      prospect.profile || '-',
      prospect.jenisProspek || '-', // Determined by OrderForm
      prospect.countOrder || 0,
      prospect.adminIdStaff || '-',
      prospect.statusClosed || '-',
      prospect.priceClosed > 0 ? prospect.priceClosed.toFixed(2) : '-',
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prospects.csv';
    a.click();
    window.URL.revokeObjectURL(url);
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
          <h1 className="text-2xl font-bold text-primary">Leads</h1>
          <p className="text-muted-foreground">Urus prospek dan leads</p>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileImport}
              className="hidden"
            />
            <Button variant="outline" onClick={() => setShowFormatDialog(true)}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Import Format
            </Button>
            <Button variant="outline" onClick={handleImportClick} disabled={isImporting}>
              {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Import Excel
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button><UserPlus className="w-4 h-4 mr-2" />Add Prospect</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingProspect ? 'Edit Prospect' : 'Add New Prospect'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="namaProspek">Nama Prospek *</Label>
                    <Input 
                      id="namaProspek" 
                      placeholder="Nama prospek" 
                      value={formData.namaProspek} 
                      onChange={(e) => handleChange('namaProspek', e.target.value)} 
                      className="uppercase"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="noTelefon">No. Telefon * (Mula dengan 6)</Label>
                    <Input 
                      id="noTelefon" 
                      placeholder="60123456789" 
                      value={formData.noTelefon} 
                      onChange={(e) => handleChange('noTelefon', e.target.value.replace(/\D/g, ''))} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="niche">Niche (Product) *</Label>
                    <Select
                      value={formData.niche}
                      onValueChange={(value) => handleChange('niche', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih product">
                          {formData.niche || "Pilih product"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.sku}>{product.sku} - {product.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tarikhPhoneNumber">Tarikh Phone Number *</Label>
                    <Input 
                      id="tarikhPhoneNumber" 
                      type="date" 
                      value={formData.tarikhPhoneNumber} 
                      onChange={(e) => handleChange('tarikhPhoneNumber', e.target.value)} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminIdStaff">Admin ID Staff (Optional)</Label>
                    <Input 
                      id="adminIdStaff" 
                      placeholder="AD-001" 
                      value={formData.adminIdStaff} 
                      onChange={(e) => handleChange('adminIdStaff', e.target.value)} 
                      className="uppercase"
                    />
                  </div>
                  <DialogFooter className="gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => {
                      setIsDialogOpen(false);
                      resetForm();
                    }}>Batal</Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {editingProspect ? 'Kemaskini' : 'Tambah'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="w-4 h-4 text-blue-500" />
            <span className="text-xs uppercase font-medium">Total Lead</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.totalLead}</p>
        </div>

        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
            <User className="w-4 h-4" />
            <span className="text-xs uppercase font-medium">Total NP Lead</span>
          </div>
          <p className="text-2xl font-bold text-green-700 dark:text-green-300">{stats.totalNP}</p>
        </div>

        <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-1">
            <UserCheck className="w-4 h-4" />
            <span className="text-xs uppercase font-medium">Total EP Lead</span>
          </div>
          <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{stats.totalEP}</p>
        </div>

        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs uppercase font-medium">Total Sales</span>
          </div>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">RM {stats.totalSales.toFixed(2)}</p>
        </div>

        <div className="bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 mb-1">
            <Target className="w-4 h-4" />
            <span className="text-xs uppercase font-medium">Lead Close</span>
          </div>
          <p className="text-2xl font-bold text-teal-700 dark:text-teal-300">{stats.leadClose}</p>
        </div>

        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-1">
            <XCircle className="w-4 h-4" />
            <span className="text-xs uppercase font-medium">Lead XClose</span>
          </div>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">{stats.leadXClose}</p>
        </div>
      </div>

      {/* Profile, Proses, X Process Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
              <UserCircle className="w-4 h-4" />
              <span className="text-xs uppercase font-medium">Profile</span>
            </div>
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{stats.profilePercent}%</span>
          </div>
          <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{stats.profileCount}</p>
        </div>

        <div className="bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400">
              <Target className="w-4 h-4" />
              <span className="text-xs uppercase font-medium">Proses</span>
            </div>
            <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">{stats.prosesPercent}%</span>
          </div>
          <p className="text-2xl font-bold text-cyan-700 dark:text-cyan-300">{stats.prosesCount}</p>
        </div>

        <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <XCircle className="w-4 h-4" />
              <span className="text-xs uppercase font-medium">X Process</span>
            </div>
            <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">{stats.xProsesPercent}%</span>
          </div>
          <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{stats.xProsesCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Start Date</span>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40"
          />
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">End Date</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40"
          />
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama, phone, niche..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={resetFilters}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button onClick={exportCSV} className="bg-green-600 hover:bg-green-700 text-white">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">No</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Tarikh</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Nama</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Niche</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Profile</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Jenis Prospek</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Count Order</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Admin Id</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Price</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredProspects.length > 0 ? (
                filteredProspects.map((prospect, index) => (
                  <tr key={prospect.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-foreground">{index + 1}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{prospect.tarikhPhoneNumber || '-'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{prospect.namaProspek}</td>
                    <td className="px-4 py-3 text-sm font-mono text-foreground">{prospect.noTelefon}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{prospect.niche}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{prospect.profile || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        prospect.jenisProspek === 'NP'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                      }`}>
                        {prospect.jenisProspek}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-center font-medium text-foreground">
                      {prospect.countOrder > 0 ? (
                        <button
                          onClick={() => handleViewOrders(prospect)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
                        >
                          <ShoppingCart className="w-3 h-3" />
                          {prospect.countOrder}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{prospect.adminIdStaff || '-'}</td>
                    <td className="px-4 py-3">
                      {prospect.statusClosed ? (
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          prospect.statusClosed === 'closed'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                        }`}>
                          {prospect.statusClosed.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {prospect.priceClosed > 0 ? `RM ${prospect.priceClosed.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditClick(prospect)}
                          className="p-1.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(prospect.id)}
                          className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">
                    Tiada prospect dijumpai.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Padam Prospect?</AlertDialogTitle>
            <AlertDialogDescription>
              Adakah anda pasti mahu memadam prospect ini? Tindakan ini tidak boleh dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Padam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Format Dialog */}
      <Dialog open={showFormatDialog} onOpenChange={setShowFormatDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Format Import Excel/CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sila gunakan format berikut untuk import prospect. Fail mestilah dalam format CSV atau Excel.
            </p>
            <div className="bg-muted/50 rounded-lg p-4 overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 font-semibold">Nama</th>
                    <th className="text-left py-2 px-2 font-semibold">Telefon</th>
                    <th className="text-left py-2 px-2 font-semibold">SKU</th>
                    <th className="text-left py-2 px-2 font-semibold">Tarikh</th>
                    <th className="text-left py-2 px-2 font-semibold">Admin</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-muted-foreground">
                    <td className="py-2 px-2">ALI BIN ABU</td>
                    <td className="py-2 px-2">60123456789</td>
                    <td className="py-2 px-2">PRODUCT NAME</td>
                    <td className="py-2 px-2">2024-01-15</td>
                    <td className="py-2 px-2">AD-001</td>
                  </tr>
                  <tr className="text-muted-foreground">
                    <td className="py-2 px-2">SITI AMINAH</td>
                    <td className="py-2 px-2">60198765432</td>
                    <td className="py-2 px-2">ANOTHER PRODUCT</td>
                    <td className="py-2 px-2">2024-01-16</td>
                    <td className="py-2 px-2"></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Nota:</strong></p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Nama</strong> - Nama prospek (wajib)</li>
                <li><strong>Telefon</strong> - No. telefon, mesti bermula dengan 6 (wajib)</li>
                <li><strong>SKU</strong> - SKU produk dari senarai Product (wajib)</li>
                <li><strong>Tarikh</strong> - Format: YYYY-MM-DD (wajib)</li>
                <li><strong>Admin</strong> - Admin ID Staff (optional)</li>
              </ul>
              <p className="mt-2 text-amber-600 dark:text-amber-400">
                <strong>Nota:</strong> Jenis Prospek (NP/EP) akan ditentukan secara automatik semasa membuat order.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowFormatDialog(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Orders Modal */}
      <Dialog open={ordersModalOpen} onOpenChange={setOrdersModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-blue-500" />
              Senarai Order - {selectedProspectName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {isLoadingOrders ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : selectedProspectOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Tarikh Order</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Price</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Bundle</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedProspectOrders.map((order, idx) => (
                      <tr key={idx} className="hover:bg-muted/30">
                        <td className="px-3 py-2 text-foreground">{order.date_order || '-'}</td>
                        <td className="px-3 py-2 text-foreground">RM {(order.total_price || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-foreground">{order.produk || '-'}</td>
                        <td className="px-3 py-2 text-foreground text-center">{order.quantity || 1}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30">
                    <tr>
                      <td className="px-3 py-2 font-semibold text-foreground">Total</td>
                      <td className="px-3 py-2 font-semibold text-foreground">
                        RM {selectedProspectOrders.reduce((sum, o) => sum + (o.total_price || 0), 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 font-semibold text-foreground text-center">
                        {selectedProspectOrders.reduce((sum, o) => sum + (o.quantity || 1), 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Tiada order dijumpai.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setOrdersModalOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Prospects;