import React, { useState, useEffect } from 'react';
import { AUDIT_MODE } from '@/lib/audit';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Minus, Calendar, Boxes, Edit, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBundles } from '@/context/BundleContext';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  date: string;
  description: string;
  masterAgentId: string;
}

const StockOutTab: React.FC = () => {
  const { products, refreshData: refreshProducts } = useBundles();
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<StockMovement | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [formData, setFormData] = useState({
    productId: '',
    masterAgentId: '',
    quantity: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
  });

  const fetchStockMovements = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('stock_movements' as any)
        .select(`
          *,
          products:product_id (id, name, sku)
        `)
        .eq('type', 'out')
        .order('date', { ascending: false });

      if (error) throw error;

      const mapped: StockMovement[] = ((data as any[]) || []).map((m: any) => ({
        id: m.id,
        productId: m.product_id,
        productName: m.products?.name || '',
        productSku: m.products?.sku || '',
        quantity: m.quantity,
        date: m.date,
        description: m.description || '',
        masterAgentId: m.master_agent_id || '',
      }));
      setStockMovements(mapped);
    } catch (error) {
      console.error('Error fetching stock movements:', error);
      toast({ title: 'Error', description: 'Failed to load stock movements', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStockMovements();
  }, []);

  const filteredMovements = stockMovements.filter(m => {
    if (startDate && m.date < startDate) return false;
    if (endDate && m.date > endDate) return false;
    return true;
  });

  // Stats based on filtered data
  const stats = {
    totalRecords: filteredMovements.length,
    totalUnits: filteredMovements.reduce((sum, m) => sum + m.quantity, 0),
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingMovement) {
        const { error } = await supabase
          .from('stock_movements' as any)
          .update({
            product_id: formData.productId,
            quantity: parseInt(formData.quantity),
            date: formData.date,
            description: formData.description || null,
            master_agent_id: formData.masterAgentId || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingMovement.id);

        if (error) throw error;
        toast({ title: 'Stock Updated', description: 'Stock entry has been updated successfully.' });
      } else {
        // Add stock out and update product quantity
        const { error } = await supabase
          .from('stock_movements' as any)
          .insert({
            product_id: formData.productId,
            type: 'out',
            quantity: parseInt(formData.quantity),
            date: formData.date,
            description: formData.description || null,
            master_agent_id: formData.masterAgentId || null,
          });

        if (error) throw error;

        // Update product stock_out and quantity
        const product = products.find(p => p.id === formData.productId);
        if (product) {
          await supabase
            .from('products' as any)
            .update({
              stock_out: product.stockOut + parseInt(formData.quantity),
              quantity: Math.max(0, product.quantity - parseInt(formData.quantity)),
              updated_at: new Date().toISOString(),
            })
            .eq('id', formData.productId);
        }

        toast({ title: 'Stock Out Recorded', description: 'Stock out has been recorded successfully.' });
      }

      await fetchStockMovements();
      await refreshProducts();
      resetForm();
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving stock:', error);
      toast({ title: 'Error', description: 'Failed to save stock entry', variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setFormData({
      productId: '',
      masterAgentId: '',
      quantity: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      description: '',
    });
    setEditingMovement(null);
  };

  const handleEdit = (movement: StockMovement) => {
    setEditingMovement(movement);
    setFormData({
      productId: movement.productId,
      masterAgentId: movement.masterAgentId,
      quantity: movement.quantity.toString(),
      date: movement.date,
      description: movement.description,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const movement = stockMovements.find(m => m.id === id);
      const { error } = await supabase.from('stock_movements' as any).delete().eq('id', id);
      if (error) throw error;

      // Update product stock
      if (movement) {
        const product = products.find(p => p.id === movement.productId);
        if (product) {
          await supabase
            .from('products' as any)
            .update({
              stock_out: Math.max(0, product.stockOut - movement.quantity),
              quantity: product.quantity + movement.quantity,
              updated_at: new Date().toISOString(),
            })
            .eq('id', movement.productId);
        }
      }

      await fetchStockMovements();
      await refreshProducts();
      toast({ title: 'Stock Deleted', description: 'Stock entry has been removed.' });
    } catch (error) {
      console.error('Error deleting stock:', error);
      toast({ title: 'Error', description: 'Failed to delete stock entry', variant: 'destructive' });
    }
  };

  const openNewDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-primary">Stock Out HQ</h2>
          <p className="text-muted-foreground">Manage HQ inventory and stock removals</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewDialog} className="bg-destructive hover:bg-destructive/90">
              <Minus className="w-4 h-4 mr-2" />
              Stock Out
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-background">
            <DialogHeader>
              <DialogTitle>{editingMovement ? 'Edit Stock Out' : 'Stock Out from HQ'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Product</Label>
                <Select
                  value={formData.productId}
                  onValueChange={(value) => setFormData({ ...formData, productId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} ({product.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Master Agent ID Staff (Optional)</Label>
                <Select
                  value={formData.masterAgentId || 'none'}
                  onValueChange={(value) => setFormData({ ...formData, masterAgentId: value === 'none' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not Selected (Regular Stock Out)" />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    <SelectItem value="none">Not Selected (Regular Stock Out)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Description (Optional)</Label>
                <Textarea
                  placeholder="Add notes about this stock out..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <Button type="submit" className="w-full bg-destructive hover:bg-destructive/90">
                {editingMovement ? 'Update Stock' : 'Stock Out'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Records</p>
                <p className="text-3xl font-bold">{stats.totalRecords}</p>
              </div>
              <Calendar className="w-10 h-10 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Units</p>
                <p className="text-3xl font-bold">{stats.totalUnits.toLocaleString()}</p>
              </div>
              <Boxes className="w-10 h-10 text-destructive" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Table */}
      <Card className="border">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4">Filter by Date</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.length > 0 ? (
                  filteredMovements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>{format(new Date(movement.date), 'dd-MM-yyyy')}</TableCell>
                      <TableCell>{movement.productName}</TableCell>
                      <TableCell>{movement.productSku}</TableCell>
                      <TableCell className="font-bold text-destructive">-{movement.quantity.toLocaleString()}</TableCell>
                      <TableCell>{movement.description || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleEdit(movement)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {!AUDIT_MODE && (
                            <Button
                              variant="destructive"
                              size="icon"
                              onClick={() => handleDelete(movement.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No stock entries found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StockOutTab;
