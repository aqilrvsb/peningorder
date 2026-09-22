import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AUDIT_MODE } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import Swal from 'sweetalert2';
import { Settings, Plus, Pencil, Trash2, Loader2, DollarSign, Percent, Gift } from 'lucide-react';

type PnlRole = 'marketer' | 'admin';

interface PnlTier {
  id: string;
  role: PnlRole;
  min_gross_profit: number;
  max_gross_profit: number | null;
  commission_percent: number;
  bonus_amount: number;
  created_at: string;
}

interface FormData {
  role: PnlRole;
  min_gross_profit: string;
  max_gross_profit: string;
  commission_percent: string;
  bonus_amount: string;
}

const initialFormData: FormData = {
  role: 'marketer',
  min_gross_profit: '',
  max_gross_profit: '',
  commission_percent: '',
  bonus_amount: '',
};

const AccountPNLConfig: React.FC = () => {
  const [configs, setConfigs] = useState<PnlTier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState<PnlTier | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [filterRole, setFilterRole] = useState<'all' | PnlRole>('all');

  const fetchConfigs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('pnl_config')
        .select('*')
        .order('role', { ascending: true })
        .order('min_gross_profit', { ascending: true });
      if (error) throw error;
      setConfigs((data || []) as PnlTier[]);
    } catch (error) {
      console.error('Error fetching PNL configs:', error);
      toast({ title: 'Error', description: 'Gagal memuatkan konfigurasi PNL.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchConfigs(); }, []);

  const handleOpenDialog = (config?: PnlTier) => {
    if (config) {
      setEditingConfig(config);
      setFormData({
        role: config.role,
        min_gross_profit: String(config.min_gross_profit),
        max_gross_profit: config.max_gross_profit != null ? String(config.max_gross_profit) : '',
        commission_percent: String(config.commission_percent),
        bonus_amount: String(config.bonus_amount),
      });
    } else {
      setEditingConfig(null);
      setFormData(initialFormData);
    }
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingConfig(null);
    setFormData(initialFormData);
  };

  const handleSave = async () => {
    if (!formData.min_gross_profit || !formData.commission_percent) {
      toast({ title: 'Ralat', description: 'Sila lengkapkan medan yang diperlukan.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const configData = {
        role: formData.role,
        min_gross_profit: parseFloat(formData.min_gross_profit),
        max_gross_profit: formData.max_gross_profit ? parseFloat(formData.max_gross_profit) : null,
        commission_percent: parseFloat(formData.commission_percent),
        bonus_amount: parseFloat(formData.bonus_amount) || 0,
      };
      if (editingConfig) {
        const { error } = await (supabase as any).from('pnl_config').update(configData).eq('id', editingConfig.id);
        if (error) throw error;
        toast({ title: 'Berjaya', description: 'Tier PNL dikemaskini.' });
      } else {
        // owner_user_id defaults to tenant_owner() at the DB level.
        const { error } = await (supabase as any).from('pnl_config').insert([configData]);
        if (error) throw error;
        toast({ title: 'Berjaya', description: 'Tier PNL baru ditambah.' });
      }
      handleCloseDialog();
      fetchConfigs();
    } catch (error: any) {
      console.error('Error saving PNL config:', error);
      toast({ title: 'Error', description: error.message || 'Gagal menyimpan tier PNL.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Padam Tier?',
      text: 'Tindakan ini tidak boleh dibatalkan.',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Ya, Padam',
      cancelButtonText: 'Batal',
    });
    if (!result.isConfirmed) return;
    try {
      const { error } = await (supabase as any).from('pnl_config').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Berjaya', description: 'Tier PNL dipadam.' });
      fetchConfigs();
    } catch (error: any) {
      console.error('Error deleting PNL config:', error);
      toast({ title: 'Error', description: error.message || 'Gagal memadam tier PNL.', variant: 'destructive' });
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', minimumFractionDigits: 0 }).format(value);

  const filteredConfigs = filterRole === 'all' ? configs : configs.filter((c) => c.role === filterRole);

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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Settings className="w-6 h-6" />
            PNL Configuration
          </h1>
          <p className="text-muted-foreground mt-1">Konfigurasi tier gaji berdasarkan Gross Profit</p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Tier
        </Button>
      </div>

      {/* Role Filter */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-4">
          <Label className="font-medium">Filter by Role:</Label>
          <Select value={filterRole} onValueChange={(value: 'all' | PnlRole) => setFilterRole(value)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="marketer">Marketer</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Configuration Table */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-lg font-semibold text-foreground mb-4">Salary Tiers</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left">No</th>
                <th className="p-3 text-left">Role</th>
                <th className="p-3 text-left">Gross Profit Range</th>
                <th className="p-3 text-left">Commission %</th>
                <th className="p-3 text-left">Bonus</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredConfigs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">
                    Tiada konfigurasi. Klik "Add Tier" untuk menambah.
                  </td>
                </tr>
              ) : (
                filteredConfigs.map((config, index) => (
                  <tr key={config.id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3">{index + 1}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        config.role === 'marketer'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      }`}>
                        {config.role.charAt(0).toUpperCase() + config.role.slice(1)}
                      </span>
                    </td>
                    <td className="p-3">
                      {formatCurrency(config.min_gross_profit)} - {config.max_gross_profit != null ? formatCurrency(config.max_gross_profit) : 'Above'}
                    </td>
                    <td className="p-3 font-medium text-primary">{config.commission_percent}%</td>
                    <td className="p-3 font-medium text-green-600">{formatCurrency(config.bonus_amount)}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleOpenDialog(config)} className="gap-1">
                          <Pencil className="w-3 h-3" />
                          Edit
                        </Button>
                        {!AUDIT_MODE && (
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(config.id)} className="gap-1">
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">How it works:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <DollarSign className="w-4 h-4 text-blue-500 mt-0.5" />
            <div>
              <p className="font-medium">Gross Profit</p>
              <p className="text-muted-foreground">Collection - Spend - Cost Product - Postage</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Percent className="w-4 h-4 text-primary mt-0.5" />
            <div>
              <p className="font-medium">Commission</p>
              <p className="text-muted-foreground">% of Gross Profit</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Gift className="w-4 h-4 text-green-500 mt-0.5" />
            <div>
              <p className="font-medium">Bonus</p>
              <p className="text-muted-foreground">Fixed amount per tier</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) handleCloseDialog(); else setShowDialog(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingConfig ? 'Edit PNL Tier' : 'Add New PNL Tier'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={formData.role} onValueChange={(value: PnlRole) => setFormData({ ...formData, role: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketer">Marketer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Gross Profit (RM) *</Label>
                <Input type="number" placeholder="0" value={formData.min_gross_profit}
                  onChange={(e) => setFormData({ ...formData, min_gross_profit: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Max Gross Profit (RM)</Label>
                <Input type="number" placeholder="Kosong = tiada had" value={formData.max_gross_profit}
                  onChange={(e) => setFormData({ ...formData, max_gross_profit: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Commission % *</Label>
                <Input type="number" step="0.1" placeholder="1.0" value={formData.commission_percent}
                  onChange={(e) => setFormData({ ...formData, commission_percent: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Bonus (RM)</Label>
                <Input type="number" placeholder="0" value={formData.bonus_amount}
                  onChange={(e) => setFormData({ ...formData, bonus_amount: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingConfig ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountPNLConfig;
