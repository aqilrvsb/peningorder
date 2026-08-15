import React, { useState, useMemo, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useBundles } from '@/context/BundleContext';
import { supabase } from '@/integrations/supabase/client';
import { useTeam } from '@/hooks/useTeam';
import { TeamFilter } from '@/components/TeamFilter';
import { AUDIT_MODE } from '@/lib/audit';
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
import { Checkbox } from '@/components/ui/checkbox';
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
import { parse, format } from 'date-fns';
import Swal from 'sweetalert2';

// Jenis Prospek is now auto-determined by OrderForm based on lead date

const Prospects: React.FC = () => {
  const { profile } = useAuth();
  const { prospects, addProspect, updateProspect, deleteProspect, isLoading } = useData();
  const { products } = useBundles();
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const { nameByIdstaff } = useTeam();
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
  const [selectedProspectIds, setSelectedProspectIds] = useState<string[]>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  const [formData, setFormData] = useState({
    namaProspek: '',
    noTelefon: '',
    niche: '',
    tarikhPhoneNumber: '',
    adminIdStaff: '',
  });

  const canCreate = profile?.role === 'marketer' || profile?.role === 'admin' || profile?.role === 'client' || profile?.role === 'superadmin';

  // Filter prospects based on search and date range
  const filteredProspects = useMemo(() => {
    return prospects.filter((prospect) => {
      if (teamFilter && ((prospect as any).marketerIdStaff || '') !== teamFilter) return false;
      const matchesSearch =
        prospect.namaProspek.toLowerCase().includes(search.toLowerCase()) ||
        prospect.noTelefon.includes(search) ||
        prospect.niche.toLowerCase().includes(search.toLowerCase());

      const prospectDate = prospect.tarikhPhoneNumber;
      const matchesStartDate = !startDate || (prospectDate && prospectDate >= startDate);
      const matchesEndDate = !endDate || (prospectDate && prospectDate <= endDate);

      return matchesSearch && matchesStartDate && matchesEndDate;
    });
  }, [prospects, search, startDate, endDate, teamFilter]);

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

  const handleToggleSelect = (id: string) => {
    setSelectedProspectIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedProspectIds.length === filteredProspects.length) {
      setSelectedProspectIds([]);
    } else {
      setSelectedProspectIds(filteredProspects.map(p => p.id));
    }
  };

  const handleBulkDeleteClick = () => {
    setBulkDeleteDialogOpen(true);
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedProspectIds.length === 0) return;
    setIsDeletingBulk(true);
    try {
      let successCount = 0;
      let errorCount = 0;

      for (const id of selectedProspectIds) {
        try {
          await deleteProspect(id);
          successCount++;
        } catch (error) {
          console.error('Error deleting prospect:', id, error);
          errorCount++;
        }
      }

      toast({
        title: 'Bulk Delete Selesai',
        description: `${successCount} prospect berjaya dipadam. ${errorCount} gagal.`,
      });

      setSelectedProspectIds([]);
    } catch (error) {
      console.error('Bulk delete error:', error);
      toast({
        title: 'Error',
        description: 'Gagal memadam prospect.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingBulk(false);
      setBulkDeleteDialogOpen(false);
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

    // Show loading indicator
    Swal.fire({
      title: 'Importing...',
      html: 'Please wait while we import your data',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      // Read file as ArrayBuffer for Excel, or text for CSV
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      let data: any[][] = [];

      if (isExcel) {
        // Parse Excel file - get raw text values
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false, raw: false });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        data = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, dateNF: 'dd/mm/yyyy' });
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

        // Convert date to YYYY-MM-DD format using date-fns
        let tarikh = '';
        if (tarikhRaw) {
          const tarikhStr = tarikhRaw.toString().trim();
          console.log('Raw date from Excel:', tarikhStr);

          try {
            let parsedDate: Date | null = null;

            // Try DD-MM-YYYY format (e.g., "01-02-2026")
            if (tarikhStr.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
              parsedDate = parse(tarikhStr, 'dd-MM-yyyy', new Date());
            }
            // Try DD/MM/YYYY format (e.g., "01/02/2026")
            else if (tarikhStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
              parsedDate = parse(tarikhStr, 'dd/MM/yyyy', new Date());
            }
            // Try YYYY-MM-DD format (already correct)
            else if (tarikhStr.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
              tarikh = tarikhStr;
            }

            if (parsedDate && !isNaN(parsedDate.getTime())) {
              tarikh = format(parsedDate, 'yyyy-MM-dd');
              console.log('Parsed date:', tarikhStr, '→', tarikh);
            } else if (!tarikh) {
              console.error('Failed to parse date:', tarikhStr);
              tarikh = '';
            }
          } catch (error) {
            console.error('Date parse error:', error);
            tarikh = '';
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
            adminIdStaff: '',
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

      // Close loading and show success
      Swal.close();
      toast({
        title: 'Import Selesai',
        description: `${successCount} prospect berjaya diimport. ${duplicateCount} duplicate dilangkau. ${errorCount} gagal.`,
      });
    } catch (error) {
      console.error('Import error:', error);
      // Close loading and show error
      Swal.close();
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
    const headers = ['No', 'Tarikh', 'Nama', 'Phone', 'Niche', 'Jenis Prospek'];
    const rows = filteredProspects.map((prospect, idx) => [
      idx + 1,
      prospect.tarikhPhoneNumber || '-',
      prospect.namaProspek,
      prospect.noTelefon,
      prospect.niche,
      prospect.jenisProspek || '-', // Determined by OrderForm
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
            {!AUDIT_MODE && selectedProspectIds.length > 0 && (
              <Button variant="destructive" onClick={handleBulkDeleteClick}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete ({selectedProspectIds.length})
              </Button>
            )}
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
      <div className="grid grid-cols-1 sm:max-w-xs gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="w-4 h-4 text-blue-500" />
            <span className="text-xs uppercase font-medium">Total Lead</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.totalLead}</p>
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

        <TeamFilter value={teamFilter} onChange={setTeamFilter} />

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
                <th className="px-4 py-3 text-center">
                  <Checkbox
                    checked={selectedProspectIds.length === filteredProspects.length && filteredProspects.length > 0}
                    onCheckedChange={handleToggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">No</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">ID Staff</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">Nama Staff</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Tarikh</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Nama</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Niche</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredProspects.length > 0 ? (
                filteredProspects.map((prospect, index) => (
                  <tr key={prospect.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-center">
                      <Checkbox
                        checked={selectedProspectIds.includes(prospect.id)}
                        onCheckedChange={() => handleToggleSelect(prospect.id)}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{index + 1}</td>
                    <td className="px-4 py-3 text-sm font-mono text-blue-600 dark:text-blue-400">{(prospect as any).marketerIdStaff || '-'}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{nameByIdstaff.get((prospect as any).marketerIdStaff || '') || '-'}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{prospect.tarikhPhoneNumber || '-'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{prospect.namaProspek}</td>
                    <td className="px-4 py-3 text-sm font-mono text-foreground">{prospect.noTelefon}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{prospect.niche}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditClick(prospect)}
                          className="p-1.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {!AUDIT_MODE && (
                          <button
                            onClick={() => handleDeleteClick(prospect.id)}
                            className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
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

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Padam {selectedProspectIds.length} Prospect?</AlertDialogTitle>
            <AlertDialogDescription>
              Adakah anda pasti mahu memadam {selectedProspectIds.length} prospect yang dipilih? Tindakan ini tidak boleh dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingBulk}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBulkDelete}
              disabled={isDeletingBulk}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingBulk ? 'Memadam...' : 'Padam'}
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
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-muted-foreground">
                    <td className="py-2 px-2">ALI BIN ABU</td>
                    <td className="py-2 px-2">60123456789</td>
                    <td className="py-2 px-2">PRODUCT NAME</td>
                    <td className="py-2 px-2">2024-01-15</td>
                  </tr>
                  <tr className="text-muted-foreground">
                    <td className="py-2 px-2">SITI AMINAH</td>
                    <td className="py-2 px-2">60198765432</td>
                    <td className="py-2 px-2">ANOTHER PRODUCT</td>
                    <td className="py-2 px-2">2024-01-16</td>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedProspectOrders.map((order, idx) => (
                      <tr key={idx} className="hover:bg-muted/30">
                        <td className="px-3 py-2 text-foreground">{order.date_order || '-'}</td>
                        <td className="px-3 py-2 text-foreground">RM {(order.total_price || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-foreground">{order.produk || '-'}</td>
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