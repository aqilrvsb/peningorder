import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AUDIT_MODE } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Settings, Plus, Pencil, Trash2, Loader2, DollarSign, Percent, Gift } from 'lucide-react';

interface PNLConfig {
  id: string;
  role: 'marketer' | 'admin';
  min_gross_profit: number;
  max_gross_profit: number | null;
  commission_percent: number;
  bonus_amount: number;
  created_at: string;
}

interface FormData {
  role: 'marketer' | 'admin';
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

const PNLConfig: React.FC = () => {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<PNLConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState<PNLConfig | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [filterRole, setFilterRole] = useState<'all' | 'marketer' | 'admin'>('all');

  // Fetch configurations
  const fetchConfigs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('pnl_config')
        .select('*')
        .order('role', { ascending: true })
        .order('min_gross_profit', { ascending: true });

      if (error) throw error;
      setConfigs(data || []);
    } catch (error) {
      console.error('Error fetching PNL configs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load PNL configurations',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleOpenDialog = (config?: PNLConfig) => {
    if (config) {
      setEditingConfig(config);
      setFormData({
        role: config.role,
        min_gross_profit: config.min_gross_profit.toString(),
        max_gross_profit: config.max_gross_profit?.toString() || '',
        commission_percent: config.commission_percent.toString(),
        bonus_amount: config.bonus_amount.toString(),
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
    // Validate form
    if (!formData.min_gross_profit || !formData.commission_percent) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
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
        // Update existing
        const { error } = await (supabase as any)
          .from('pnl_config')
          .update(configData)
          .eq('id', editingConfig.id);

        if (error) throw error;
        toast({
          title: 'Success',
          description: 'PNL configuration updated successfully',
        });
      } else {
        // Create new
        const { error } = await (supabase as any)
          .from('pnl_config')
          .insert([configData]);

        if (error) throw error;
        toast({
          title: 'Success',
          description: 'PNL configuration created successfully',
        });
      }

      handleCloseDialog();
      fetchConfigs();
    } catch (error) {
      console.error('Error saving PNL config:', error);
      toast({
        title: 'Error',
        description: 'Failed to save PNL configuration',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this configuration?')) return;

    try {
      const { error } = await (supabase as any)
        .from('pnl_config')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({
        title: 'Success',
        description: 'PNL configuration deleted successfully',
      });
      fetchConfigs();
    } catch (error) {
      console.error('Error deleting PNL config:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete PNL configuration',
        variant: 'destructive',
      });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const filteredConfigs = filterRole === 'all'
    ? configs
    : configs.filter(c => c.role === filterRole);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Settings className="w-6 h-6" />
            PNL Configuration
          </h1>
          <p className="text-muted-foreground mt-1">Configure salary tiers based on sales and ROAS performance</p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Tier
        </Button>
      </div>

      {/* Role Filter */}
      <div className="stat-card">
        <div className="flex items-center gap-4">
          <Label className="font-medium">Filter by Role:</Label>
          <Select value={filterRole} onValueChange={(value: 'all' | 'marketer' | 'admin') => setFilterRole(value)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="marketer">Marketer</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Configuration Table */}
      <div className="form-section">
        <h2 className="text-lg font-semibold text-foreground mb-4">Salary Tiers</h2>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Role</th>
                <th>Gross Profit Range</th>
                <th>Commission %</th>
                <th>Bonus</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredConfigs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">
                    No configurations found. Click "Add Tier" to create one.
                  </td>
                </tr>
              ) : (
                filteredConfigs.map((config, index) => (
                  <tr key={config.id}>
                    <td>{index + 1}</td>
                    <td>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        config.role === 'marketer'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      }`}>
                        {config.role.charAt(0).toUpperCase() + config.role.slice(1)}
                      </span>
                    </td>
                    <td>
                      {formatCurrency(config.min_gross_profit)} - {config.max_gross_profit ? formatCurrency(config.max_gross_profit) : 'Above'}
                    </td>
                    <td className="font-medium text-primary">{config.commission_percent}%</td>
                    <td className="font-medium text-green-600">{formatCurrency(config.bonus_amount)}</td>
                    <td>
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenDialog(config)}
                          className="gap-1"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </Button>
                        {!AUDIT_MODE && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(config.id)}
                            className="gap-1"
                          >
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

      {/* Legend/Info */}
      <div className="form-section">
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
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingConfig ? 'Edit PNL Tier' : 'Add New PNL Tier'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Role Selection */}
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select
                value={formData.role}
                onValueChange={(value: 'marketer' | 'admin') => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketer">Marketer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Gross Profit Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Gross Profit (RM) *</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.min_gross_profit}
                  onChange={(e) => setFormData({ ...formData, min_gross_profit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Gross Profit (RM)</Label>
                <Input
                  type="number"
                  placeholder="Leave empty for no limit"
                  value={formData.max_gross_profit}
                  onChange={(e) => setFormData({ ...formData, max_gross_profit: e.target.value })}
                />
              </div>
            </div>

            {/* Commission & Bonus */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Commission % *</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="1.0"
                  value={formData.commission_percent}
                  onChange={(e) => setFormData({ ...formData, commission_percent: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Bonus (RM)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.bonus_amount}
                  onChange={(e) => setFormData({ ...formData, bonus_amount: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
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

export default PNLConfig;
