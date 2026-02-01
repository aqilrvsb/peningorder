import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Plus, Search, Trash2, Loader2, Users,
  Calendar, RotateCcw, Download, Upload, Pencil,
  ShoppingCart, UserPlus, Inbox, Check, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Textarea } from '@/components/ui/textarea';
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
import * as XLSX from 'xlsx';
import { parse, format } from 'date-fns';
import Swal from 'sweetalert2';
import { getMalaysiaDate } from '@/lib/utils';

const STATUS_OPTIONS = [
  'INVALID',
  'TIDAK ANGKAT',
  'BUSY',
  'TAK MENGAKU',
  'SUDAH MEMBELI',
  'TUKAR FIKIRAN',
  'PRESENT',
  'DUPLICATE'
];

const AdminLeads: React.FC = () => {
  const { profile } = useAuth();
  const { prospects, addProspect, updateProspect, deleteProspect, isLoading, refreshData } = useData();
  const { products } = useBundles();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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

  // Get Leads feature
  const [getLeadsCount, setGetLeadsCount] = useState<number>(10);
  const [isGettingLeads, setIsGettingLeads] = useState(false);
  const [unclaimedLeadsCount, setUnclaimedLeadsCount] = useState<number>(0);

  // Status dialog (X icon)
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedProspectForStatus, setSelectedProspectForStatus] = useState<any>(null);
  const [statusFormData, setStatusFormData] = useState({
    statusProspect: '',
    umur: '',
    masalah: '',
    pekerjaan: '',
  });
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const [formData, setFormData] = useState({
    namaProspek: '',
    noTelefon: '',
    niche: '',
    tarikhPhoneNumber: '',
    adminIdStaff: '',
    marketerIdStaff: '',
  });

  // Fetch unclaimed leads count
  const fetchUnclaimedCount = async () => {
    try {
      const { count, error } = await (supabase as any)
        .from('prospects')
        .select('*', { count: 'exact', head: true })
        .or('admin_id_staff.is.null,admin_id_staff.eq.');

      if (!error) {
        setUnclaimedLeadsCount(count || 0);
      }
    } catch (e) {
      console.error('Error fetching unclaimed count:', e);
    }
  };

  useEffect(() => {
    fetchUnclaimedCount();
  }, [prospects]);

  // Handle Get Leads - claim leads for this admin
  const handleGetLeads = async () => {
    if (!profile?.idstaff) {
      toast({
        title: 'Error',
        description: 'Admin ID not found.',
        variant: 'destructive',
      });
      return;
    }

    if (getLeadsCount <= 0) {
      toast({
        title: 'Error',
        description: 'Please enter a valid number.',
        variant: 'destructive',
      });
      return;
    }

    if (getLeadsCount > unclaimedLeadsCount) {
      toast({
        title: 'Error',
        description: `Only ${unclaimedLeadsCount} unclaimed leads available.`,
        variant: 'destructive',
      });
      return;
    }

    setIsGettingLeads(true);

    try {
      // First, get the IDs of unclaimed leads (limit to requested count)
      const { data: unclaimedLeads, error: fetchError } = await (supabase as any)
        .from('prospects')
        .select('id')
        .or('admin_id_staff.is.null,admin_id_staff.eq.')
        .order('created_at', { ascending: true })
        .limit(getLeadsCount);

      if (fetchError) throw fetchError;

      if (!unclaimedLeads || unclaimedLeads.length === 0) {
        toast({
          title: 'No Leads',
          description: 'No unclaimed leads available.',
          variant: 'destructive',
        });
        return;
      }

      // Update each lead with admin_id_staff and admin_claimed_at timestamp
      const leadIds = unclaimedLeads.map((l: any) => l.id);
      const claimedAt = new Date().toISOString();
      const { error: updateError } = await (supabase as any)
        .from('prospects')
        .update({
          admin_id_staff: profile.idstaff,
          admin_claimed_at: claimedAt,
          updated_at: claimedAt
        })
        .in('id', leadIds);

      if (updateError) throw updateError;

      toast({
        title: 'Leads Claimed!',
        description: `Successfully claimed ${leadIds.length} leads.`,
      });

      // Refresh data
      await refreshData();
      await fetchUnclaimedCount();
    } catch (error) {
      console.error('Error getting leads:', error);
      toast({
        title: 'Error',
        description: 'Failed to claim leads. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGettingLeads(false);
    }
  };

  // Filter prospects based on admin assignment, search, date range (by admin_claimed_at)
  const filteredProspects = useMemo(() => {
    return prospects.filter((prospect) => {
      // Only show leads assigned to current admin
      const matchesAdmin = prospect.adminIdStaff === profile?.idstaff;

      const matchesSearch =
        prospect.namaProspek.toLowerCase().includes(search.toLowerCase()) ||
        prospect.noTelefon.includes(search) ||
        prospect.niche.toLowerCase().includes(search.toLowerCase()) ||
        (prospect.marketerIdStaff || '').toLowerCase().includes(search.toLowerCase());

      // Filter by admin_claimed_at date (when admin claimed the lead)
      const claimedDate = prospect.adminClaimedAt ? prospect.adminClaimedAt.split('T')[0] : '';
      const matchesStartDate = !startDate || (claimedDate && claimedDate >= startDate);
      const matchesEndDate = !endDate || (claimedDate && claimedDate <= endDate);

      return matchesAdmin && matchesSearch && matchesStartDate && matchesEndDate;
    });
  }, [prospects, search, startDate, endDate, profile?.idstaff]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalLead = filteredProspects.length;
    // Process Lead = has any status (not null/empty)
    const processLead = filteredProspects.filter(p => p.statusClosed && p.statusClosed !== '').length;
    // X Process Lead = no status yet
    const xProcessLead = filteredProspects.filter(p => !p.statusClosed || p.statusClosed === '').length;
    // Close Lead = status is 'closed'
    const closeLead = filteredProspects.filter(p => p.statusClosed === 'closed').length;
    // X Close Lead = has status but not 'closed'
    const xCloseLead = filteredProspects.filter(p => p.statusClosed && p.statusClosed !== '' && p.statusClosed !== 'closed').length;
    // Total Lead Profile = has profile info
    const totalLeadProfile = filteredProspects.filter(p => p.profile && p.profile !== '').length;
    // Total Lead X Profile = no profile info
    const totalLeadXProfile = filteredProspects.filter(p => !p.profile || p.profile === '').length;
    // Total Lead Present = status is 'PRESENT'
    const totalLeadPresent = filteredProspects.filter(p => p.statusClosed === 'PRESENT').length;

    // Calculate percentages
    const processLeadPercent = totalLead > 0 ? ((processLead / totalLead) * 100).toFixed(1) : '0';
    const xProcessLeadPercent = totalLead > 0 ? ((xProcessLead / totalLead) * 100).toFixed(1) : '0';
    const closeLeadPercent = totalLead > 0 ? ((closeLead / totalLead) * 100).toFixed(1) : '0';
    const xCloseLeadPercent = totalLead > 0 ? ((xCloseLead / totalLead) * 100).toFixed(1) : '0';
    const totalLeadProfilePercent = totalLead > 0 ? ((totalLeadProfile / totalLead) * 100).toFixed(1) : '0';
    const totalLeadXProfilePercent = totalLead > 0 ? ((totalLeadXProfile / totalLead) * 100).toFixed(1) : '0';
    const totalLeadPresentPercent = totalLead > 0 ? ((totalLeadPresent / totalLead) * 100).toFixed(1) : '0';

    return {
      totalLead,
      processLead, processLeadPercent,
      xProcessLead, xProcessLeadPercent,
      closeLead, closeLeadPercent,
      xCloseLead, xCloseLeadPercent,
      totalLeadProfile, totalLeadProfilePercent,
      totalLeadXProfile, totalLeadXProfilePercent,
      totalLeadPresent, totalLeadPresentPercent
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

  // Handle Check icon - navigate to order page with lead data
  const handleGoToOrder = (prospect: any) => {
    // Store prospect data in sessionStorage for OrderForm to use
    const orderData = {
      prospectId: prospect.id,
      namaProspek: prospect.namaProspek,
      noTelefon: prospect.noTelefon,
      niche: prospect.niche,
      adminIdStaff: profile?.idstaff || '',
      marketerLeadIdStaff: prospect.marketerIdStaff,
    };
    sessionStorage.setItem('adminLeadOrder', JSON.stringify(orderData));
    navigate('/dashboard/orders/new');
  };

  // Handle X icon - open status dialog
  const handleOpenStatusDialog = (prospect: any) => {
    setSelectedProspectForStatus(prospect);
    setStatusFormData({
      statusProspect: '',
      umur: '',
      masalah: '',
      pekerjaan: '',
    });
    setStatusDialogOpen(true);
  };

  // Handle status update
  const handleUpdateStatus = async () => {
    if (!statusFormData.statusProspect) {
      toast({
        title: 'Error',
        description: 'Sila pilih Status Prospect.',
        variant: 'destructive',
      });
      return;
    }

    // Validate required fields when PRESENT is selected
    if (statusFormData.statusProspect === 'PRESENT') {
      if (!statusFormData.umur || !statusFormData.masalah || !statusFormData.pekerjaan) {
        toast({
          title: 'Error',
          description: 'Sila isi Umur, Masalah dan Pekerjaan.',
          variant: 'destructive',
        });
        return;
      }
    }

    if (!selectedProspectForStatus) return;

    setIsUpdatingStatus(true);

    try {
      // Build profile text from umur, masalah and pekerjaan (only for PRESENT)
      let profileText = '';
      if (statusFormData.statusProspect === 'PRESENT') {
        const profileParts: string[] = [];
        if (statusFormData.umur) {
          profileParts.push(`Umur: ${statusFormData.umur}`);
        }
        if (statusFormData.masalah) {
          profileParts.push(`Masalah: ${statusFormData.masalah}`);
        }
        if (statusFormData.pekerjaan) {
          profileParts.push(`Pekerjaan: ${statusFormData.pekerjaan}`);
        }
        profileText = profileParts.join(' | ');
      }

      const { error } = await (supabase as any)
        .from('prospects')
        .update({
          status_closed: statusFormData.statusProspect,
          profile: profileText || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedProspectForStatus.id);

      if (error) throw error;

      toast({
        title: 'Berjaya',
        description: 'Status prospect telah dikemaskini.',
      });

      setStatusDialogOpen(false);
      setSelectedProspectForStatus(null);
      await refreshData();
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: 'Error',
        description: 'Gagal mengemaskini status.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    let processedValue = value;
    if (field === 'namaProspek' || field === 'adminIdStaff' || field === 'marketerIdStaff') {
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
      marketerIdStaff: '',
    });
    setEditingProspect(null);
  };

  const handleEdit = (prospect: any) => {
    setEditingProspect(prospect);
    setFormData({
      namaProspek: prospect.namaProspek,
      noTelefon: prospect.noTelefon,
      niche: prospect.niche,
      tarikhPhoneNumber: prospect.tarikhPhoneNumber || '',
      adminIdStaff: prospect.adminIdStaff || '',
      marketerIdStaff: prospect.marketerIdStaff || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.namaProspek || !formData.noTelefon || !formData.niche || !formData.tarikhPhoneNumber || !formData.marketerIdStaff) {
      toast({
        title: 'Error',
        description: 'Sila lengkapkan semua medan yang diperlukan.',
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
          marketerIdStaff: formData.marketerIdStaff,
        });
        toast({ title: 'Berjaya', description: 'Lead telah dikemaskini.' });
      } else {
        await addProspect({
          namaProspek: formData.namaProspek,
          noTelefon: formData.noTelefon,
          niche: formData.niche,
          jenisProspek: '', // Will be determined by OrderForm
          tarikhPhoneNumber: formData.tarikhPhoneNumber,
          adminIdStaff: formData.adminIdStaff,
          marketerIdStaff: formData.marketerIdStaff,
          statusClosed: '',
          priceClosed: 0,
          countOrder: 0,
        });
        toast({ title: 'Berjaya', description: 'Lead baru telah ditambah.' });
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving prospect:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!prospectToDelete) return;
    try {
      await deleteProspect(prospectToDelete);
      toast({ title: 'Berjaya', description: 'Lead telah dipadam.' });
    } catch (error) {
      console.error('Error deleting prospect:', error);
    } finally {
      setDeleteDialogOpen(false);
      setProspectToDelete(null);
    }
  };

  const exportCSV = () => {
    const headers = ['No', 'Tarikh', 'Nama', 'Phone', 'Niche', 'Jenis Prospek', 'Count Order', 'Admin Id', 'Marketer', 'Status', 'Price'];
    const rows = filteredProspects.map((prospect, idx) => [
      idx + 1,
      prospect.tarikhPhoneNumber || '-',
      prospect.namaProspek,
      prospect.noTelefon,
      prospect.niche,
      prospect.jenisProspek || '-',
      prospect.countOrder || 0,
      prospect.adminIdStaff || '-',
      prospect.marketerIdStaff || '-',
      prospect.statusClosed || '-',
      prospect.priceClosed > 0 ? prospect.priceClosed.toFixed(2) : '-',
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_admin_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        // Parse Excel file
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
        Swal.close();
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

        // Auto-fix phone number format
        if (phone) {
          if (phone.startsWith('0')) {
            phone = '6' + phone.substring(1);
          } else if (!phone.startsWith('6')) {
            phone = '60' + phone;
          }
        }

        // Convert date to YYYY-MM-DD format using date-fns
        let tarikh = '';
        if (tarikhRaw) {
          const tarikhStr = tarikhRaw.toString().trim();

          try {
            let parsedDate: Date | null = null;

            // Try DD-MM-YYYY format
            if (tarikhStr.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
              parsedDate = parse(tarikhStr, 'dd-MM-yyyy', new Date());
            }
            // Try DD/MM/YYYY format
            else if (tarikhStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
              parsedDate = parse(tarikhStr, 'dd/MM/yyyy', new Date());
            }
            // Try YYYY-MM-DD format (already correct)
            else if (tarikhStr.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
              tarikh = tarikhStr;
            }

            if (parsedDate && !isNaN(parsedDate.getTime())) {
              tarikh = format(parsedDate, 'yyyy-MM-dd');
            }
          } catch (error) {
            console.error('Date parse error:', error);
            tarikh = '';
          }
        }

        // Match niche by product name or SKU
        const product = products.find(p => p.name.toUpperCase() === nicheValue || p.sku.toUpperCase() === nicheValue);
        const niche = product ? product.sku : nicheValue;

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
          continue;
        }

        try {
          await addProspect({
            namaProspek: nama,
            noTelefon: phone,
            niche: niche,
            jenisProspek: 'EP',
            tarikhPhoneNumber: tarikh,
            adminIdStaff: admin,
            marketerIdStaff: '',
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads Management</h1>
          <p className="text-muted-foreground">Manage your assigned leads</p>
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleImportCSV}
            ref={fileInputRef}
            className="hidden"
          />
          <Button variant="outline" size="sm" onClick={() => setShowFormatDialog(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Tambah Lead
          </Button>
        </div>
      </div>

      {/* Get Leads Section */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Inbox className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Unclaimed Leads</p>
              <p className="text-xl font-bold text-foreground">{unclaimedLeadsCount}</p>
            </div>
          </div>
          <div className="h-10 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Number of Leads</Label>
              <Input
                type="number"
                min={1}
                max={unclaimedLeadsCount}
                value={getLeadsCount}
                onChange={(e) => setGetLeadsCount(parseInt(e.target.value) || 0)}
                className="w-[120px]"
                placeholder="10"
              />
            </div>
            <Button
              onClick={handleGetLeads}
              disabled={isGettingLeads || unclaimedLeadsCount === 0}
              className="mt-5"
            >
              {isGettingLeads ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <UserPlus className="w-4 h-4 mr-2" />
              )}
              GET
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Total Lead</p>
            <p className="text-xl font-bold text-blue-500">{stats.totalLead}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Process Lead</p>
            <p className="text-xl font-bold text-green-500">{stats.processLead}</p>
            <p className="text-xs text-muted-foreground">{stats.processLeadPercent}%</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">X Process Lead</p>
            <p className="text-xl font-bold text-orange-500">{stats.xProcessLead}</p>
            <p className="text-xs text-muted-foreground">{stats.xProcessLeadPercent}%</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Close Lead</p>
            <p className="text-xl font-bold text-emerald-500">{stats.closeLead}</p>
            <p className="text-xs text-muted-foreground">{stats.closeLeadPercent}%</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">X Close Lead</p>
            <p className="text-xl font-bold text-red-500">{stats.xCloseLead}</p>
            <p className="text-xs text-muted-foreground">{stats.xCloseLeadPercent}%</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Lead Profile</p>
            <p className="text-xl font-bold text-purple-500">{stats.totalLeadProfile}</p>
            <p className="text-xs text-muted-foreground">{stats.totalLeadProfilePercent}%</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Lead X Profile</p>
            <p className="text-xl font-bold text-gray-500">{stats.totalLeadXProfile}</p>
            <p className="text-xs text-muted-foreground">{stats.totalLeadXProfilePercent}%</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Lead Present</p>
            <p className="text-xl font-bold text-amber-500">{stats.totalLeadPresent}</p>
            <p className="text-xs text-muted-foreground">{stats.totalLeadPresentPercent}%</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama, phone, niche..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-[150px]">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Dari (Tarikh Get)</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-[150px]">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Hingga (Tarikh Get)</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={resetFilters} title="Reset Filters">
            <RotateCcw className="w-4 h-4" />
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Tarikh Lead</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Tarikh Get</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Nama</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Niche</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Profile</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredProspects.length > 0 ? (
                filteredProspects.map((prospect, index) => (
                  <tr key={prospect.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-foreground">{index + 1}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{prospect.tarikhPhoneNumber || '-'}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{prospect.adminClaimedAt ? prospect.adminClaimedAt.split('T')[0] : '-'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{prospect.namaProspek}</td>
                    <td className="px-4 py-3 text-sm font-mono text-foreground">{prospect.noTelefon}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{prospect.niche}</td>
                    <td className="px-4 py-3 text-sm text-foreground max-w-[200px] truncate" title={prospect.profile || ''}>
                      {prospect.profile || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {prospect.statusClosed ? (
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          prospect.statusClosed === 'closed'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                        }`}>
                          {prospect.statusClosed}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleGoToOrder(prospect)}
                          className="p-1.5 rounded-lg hover:bg-green-100 text-muted-foreground hover:text-green-600 transition-colors"
                          title="Go to Order"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenStatusDialog(prospect)}
                          className="p-1.5 rounded-lg hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
                          title="Update Status"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    Tiada lead dijumpai.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProspect ? 'Edit Lead' : 'Tambah Lead Baru'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nama Prospek *</Label>
              <Input
                value={formData.namaProspek}
                onChange={(e) => handleChange('namaProspek', e.target.value)}
                placeholder="Masukkan nama"
              />
            </div>
            <div>
              <Label>No. Telefon *</Label>
              <Input
                value={formData.noTelefon}
                onChange={(e) => handleChange('noTelefon', e.target.value)}
                placeholder="60123456789"
              />
            </div>
            <div>
              <Label>Niche *</Label>
              <Select value={formData.niche} onValueChange={(v) => handleChange('niche', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Niche" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tarikh Phone Number *</Label>
              <Input
                type="date"
                value={formData.tarikhPhoneNumber}
                onChange={(e) => handleChange('tarikhPhoneNumber', e.target.value)}
              />
            </div>
            <div>
              <Label>Marketer ID Staff *</Label>
              <Input
                value={formData.marketerIdStaff}
                onChange={(e) => handleChange('marketerIdStaff', e.target.value)}
                placeholder="Masukkan ID staff marketer"
              />
            </div>
            <div>
              <Label>Admin ID Staff</Label>
              <Input
                value={formData.adminIdStaff}
                onChange={(e) => handleChange('adminIdStaff', e.target.value)}
                placeholder="Masukkan ID staff admin"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingProspect ? 'Kemaskini' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Padam Lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak boleh dibatalkan. Lead ini akan dipadam secara kekal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Padam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Format Dialog */}
      <Dialog open={showFormatDialog} onOpenChange={setShowFormatDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Format Import CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Fail CSV mesti mempunyai format berikut:
            </p>
            <div className="bg-muted p-3 rounded-lg font-mono text-xs">
              <p className="font-semibold mb-2">Header:</p>
              <p>Nama,Phone,Niche,Tarikh,Marketer</p>
              <p className="font-semibold mt-3 mb-2">Contoh Data:</p>
              <p>ALI BIN ABU,60123456789,Product A,2024-01-15,JOHN</p>
              <p>SITI BINTI AHMAD,60198765432,Product B,2024-01-16,JANE</p>
            </div>
            <Button onClick={() => { setShowFormatDialog(false); fileInputRef.current?.click(); }}>
              <Upload className="w-4 h-4 mr-2" />
              Pilih Fail CSV
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFormatDialog(false)}>Tutup</Button>
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

      {/* Status Dialog (X icon) */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Status Prospect</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Status Prospect *</Label>
              <Select
                value={statusFormData.statusProspect}
                onValueChange={(v) => setStatusFormData(prev => ({ ...prev, statusProspect: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {statusFormData.statusProspect === 'PRESENT' && (
              <>
                <div>
                  <Label>Umur *</Label>
                  <Input
                    value={statusFormData.umur}
                    onChange={(e) => setStatusFormData(prev => ({ ...prev, umur: e.target.value }))}
                    placeholder="Masukkan umur prospect"
                  />
                </div>
                <div>
                  <Label>Masalah *</Label>
                  <Textarea
                    value={statusFormData.masalah}
                    onChange={(e) => setStatusFormData(prev => ({ ...prev, masalah: e.target.value }))}
                    placeholder="Masukkan masalah prospect..."
                    rows={2}
                  />
                </div>
                <div>
                  <Label>Pekerjaan *</Label>
                  <Input
                    value={statusFormData.pekerjaan}
                    onChange={(e) => setStatusFormData(prev => ({ ...prev, pekerjaan: e.target.value }))}
                    placeholder="Masukkan pekerjaan prospect"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>Batal</Button>
            <Button onClick={handleUpdateStatus} disabled={isUpdatingStatus}>
              {isUpdatingStatus ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminLeads;
