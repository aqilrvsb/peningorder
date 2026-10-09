import React, { useState } from 'react';
import { AUDIT_MODE } from '@/lib/audit';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Plus, Trash2, Boxes } from 'lucide-react';
import { useBundles } from '@/context/BundleContext';
import { TableSkeleton, EmptyState } from '@/components/common/SoftUI';

const BundleTab: React.FC = () => {
  const { bundles, products, isLoading, addBundle, updateBundle, deleteBundle, toggleBundleActive } = useBundles();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState<typeof bundles[0] | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    productId: '',
    units: '1',
    // Normal prices by customer type
    priceNormalNp: '0.00',
    priceNormalEp: '0.00',
    priceNormalEc: '0.00',
    // Threads prices by customer type
    priceThreadsNp: '0.00',
    priceThreadsEp: '0.00',
    priceThreadsEc: '0.00',
    // TikTok prices by customer type
    priceTiktokNp: '0.00',
    priceTiktokEp: '0.00',
    priceTiktokEc: '0.00',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingBundle) {
      await updateBundle(editingBundle.id, {
        name: formData.name,
        productId: formData.productId,
        units: parseInt(formData.units) || 1,
        // Normal prices by customer type
        priceNormalNp: parseFloat(formData.priceNormalNp) || 0,
        priceNormalEp: parseFloat(formData.priceNormalEp) || 0,
        priceNormalEc: parseFloat(formData.priceNormalEc) || 0,
        // Threads prices by customer type
        priceThreadsNp: parseFloat(formData.priceThreadsNp) || 0,
        priceThreadsEp: parseFloat(formData.priceThreadsEp) || 0,
        priceThreadsEc: parseFloat(formData.priceThreadsEc) || 0,
        // TikTok prices by customer type
        priceTiktokNp: parseFloat(formData.priceTiktokNp) || 0,
        priceTiktokEp: parseFloat(formData.priceTiktokEp) || 0,
        priceTiktokEc: parseFloat(formData.priceTiktokEc) || 0,
      });
    } else {
      await addBundle({
        name: formData.name,
        productId: formData.productId,
        units: parseInt(formData.units) || 1,
        // Normal prices by customer type
        priceNormalNp: parseFloat(formData.priceNormalNp) || 0,
        priceNormalEp: parseFloat(formData.priceNormalEp) || 0,
        priceNormalEc: parseFloat(formData.priceNormalEc) || 0,
        // Threads prices by customer type
        priceThreadsNp: parseFloat(formData.priceThreadsNp) || 0,
        priceThreadsEp: parseFloat(formData.priceThreadsEp) || 0,
        priceThreadsEc: parseFloat(formData.priceThreadsEc) || 0,
        // TikTok prices by customer type
        priceTiktokNp: parseFloat(formData.priceTiktokNp) || 0,
        priceTiktokEp: parseFloat(formData.priceTiktokEp) || 0,
        priceTiktokEc: parseFloat(formData.priceTiktokEc) || 0,
        isActive: true,
      });
    }

    resetForm();
    setIsDialogOpen(false);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      productId: '',
      units: '1',
      priceNormalNp: '0.00',
      priceNormalEp: '0.00',
      priceNormalEc: '0.00',
      priceThreadsNp: '0.00',
      priceThreadsEp: '0.00',
      priceThreadsEc: '0.00',
      priceTiktokNp: '0.00',
      priceTiktokEp: '0.00',
      priceTiktokEc: '0.00',
    });
    setEditingBundle(null);
  };

  const handleEdit = (bundle: typeof bundles[0]) => {
    setEditingBundle(bundle);
    setFormData({
      name: bundle.name,
      productId: bundle.productId,
      units: bundle.units.toString(),
      priceNormalNp: bundle.priceNormalNp.toFixed(2),
      priceNormalEp: bundle.priceNormalEp.toFixed(2),
      priceNormalEc: bundle.priceNormalEc.toFixed(2),
      priceThreadsNp: bundle.priceThreadsNp.toFixed(2),
      priceThreadsEp: bundle.priceThreadsEp.toFixed(2),
      priceThreadsEc: bundle.priceThreadsEc.toFixed(2),
      priceTiktokNp: bundle.priceTiktokNp.toFixed(2),
      priceTiktokEp: bundle.priceTiktokEp.toFixed(2),
      priceTiktokEc: bundle.priceTiktokEc.toFixed(2),
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    await deleteBundle(id);
  };

  const handleToggleActive = async (id: string) => {
    await toggleBundleActive(id);
  };

  const openNewDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <Card className="border">
        <CardContent className="p-4 sm:p-6">
          <TableSkeleton cols={6} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bundle Table */}
      <Card className="border">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
            <div className="min-w-0">
              <h3 className="font-semibold text-xl">Bundle Pricing Management</h3>
              <p className="text-sm text-muted-foreground">
                Create and manage product bundles with tiered pricing for agents
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openNewDialog} className="self-start">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Bundle
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-background max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingBundle ? 'Edit Bundle' : 'Create New Bundle'}</DialogTitle>
                  <DialogDescription>
                    Set up a product bundle with pricing for different platforms and customer types
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Bundle Name</Label>
                      <Input
                        placeholder="e.g., Premium Pack"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Select Product</Label>
                      <Select
                        value={formData.productId}
                        onValueChange={(value) => setFormData({ ...formData, productId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a product" />
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
                  </div>

                  <div className="space-y-2">
                    <Label>Units in Bundle</Label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.units}
                      onChange={(e) => setFormData({ ...formData, units: e.target.value })}
                      required
                      className="w-32"
                    />
                  </div>

                  {/* Normal Prices Section */}
                  <div className="border rounded-xl p-3 sm:p-4 space-y-3">
                    <h4 className="font-semibold text-sm text-blue-600">Normal Price (Facebook, Database, Google)</h4>
                    <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">NP (New Prospect)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.priceNormalNp}
                          onChange={(e) => setFormData({ ...formData, priceNormalNp: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">EP (Existing Prospect)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.priceNormalEp}
                          onChange={(e) => setFormData({ ...formData, priceNormalEp: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">EC (Existing Customer)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.priceNormalEc}
                          onChange={(e) => setFormData({ ...formData, priceNormalEc: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Threads Prices Section */}
                  <div className="border rounded-xl p-3 sm:p-4 space-y-3">
                    <h4 className="font-semibold text-sm text-orange-600">Threads Price</h4>
                    <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">NP (New Prospect)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.priceThreadsNp}
                          onChange={(e) => setFormData({ ...formData, priceThreadsNp: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">EP (Existing Prospect)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.priceThreadsEp}
                          onChange={(e) => setFormData({ ...formData, priceThreadsEp: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">EC (Existing Customer)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.priceThreadsEc}
                          onChange={(e) => setFormData({ ...formData, priceThreadsEc: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* TikTok Prices Section */}
                  <div className="border rounded-xl p-3 sm:p-4 space-y-3">
                    <h4 className="font-semibold text-sm text-pink-600">TikTok Price</h4>
                    <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">NP (New Prospect)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.priceTiktokNp}
                          onChange={(e) => setFormData({ ...formData, priceTiktokNp: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">EP (Existing Prospect)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.priceTiktokEp}
                          onChange={(e) => setFormData({ ...formData, priceTiktokEp: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">EC (Existing Customer)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.priceTiktokEc}
                          onChange={(e) => setFormData({ ...formData, priceTiktokEc: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="w-full">
                    {editingBundle ? 'Update Bundle' : 'Create Bundle'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Bundle Name</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead className="text-center" colSpan={3}>
                    <span className="text-blue-600">Normal Price</span>
                  </TableHead>
                  <TableHead className="text-center" colSpan={3}>
                    <span className="text-orange-600">Threads Price</span>
                  </TableHead>
                  <TableHead className="text-center" colSpan={3}>
                    <span className="text-pink-600">TikTok Price</span>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
                <TableRow className="text-xs bg-muted/40">
                  <TableHead></TableHead>
                  <TableHead></TableHead>
                  <TableHead></TableHead>
                  <TableHead className="text-blue-600">NP</TableHead>
                  <TableHead className="text-blue-600">EP</TableHead>
                  <TableHead className="text-blue-600">EC</TableHead>
                  <TableHead className="text-orange-600">NP</TableHead>
                  <TableHead className="text-orange-600">EP</TableHead>
                  <TableHead className="text-orange-600">EC</TableHead>
                  <TableHead className="text-pink-600">NP</TableHead>
                  <TableHead className="text-pink-600">EP</TableHead>
                  <TableHead className="text-pink-600">EC</TableHead>
                  <TableHead></TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bundles.length > 0 ? (
                  bundles.map((bundle) => (
                    <TableRow key={bundle.id}>
                      <TableCell className="font-medium">{bundle.name}</TableCell>
                      <TableCell>
                        {bundle.productName} ({bundle.productSku})
                      </TableCell>
                      <TableCell>{bundle.units.toLocaleString()}</TableCell>
                      {/* Normal prices */}
                      <TableCell className="text-blue-600 whitespace-nowrap">RM {bundle.priceNormalNp.toFixed(2)}</TableCell>
                      <TableCell className="text-blue-600 whitespace-nowrap">RM {bundle.priceNormalEp.toFixed(2)}</TableCell>
                      <TableCell className="text-blue-600 whitespace-nowrap">RM {bundle.priceNormalEc.toFixed(2)}</TableCell>
                      {/* Threads prices */}
                      <TableCell className="text-orange-600 whitespace-nowrap">RM {bundle.priceThreadsNp.toFixed(2)}</TableCell>
                      <TableCell className="text-orange-600 whitespace-nowrap">RM {bundle.priceThreadsEp.toFixed(2)}</TableCell>
                      <TableCell className="text-orange-600 whitespace-nowrap">RM {bundle.priceThreadsEc.toFixed(2)}</TableCell>
                      {/* TikTok prices */}
                      <TableCell className="text-pink-600 whitespace-nowrap">RM {bundle.priceTiktokNp.toFixed(2)}</TableCell>
                      <TableCell className="text-pink-600 whitespace-nowrap">RM {bundle.priceTiktokEp.toFixed(2)}</TableCell>
                      <TableCell className="text-pink-600 whitespace-nowrap">RM {bundle.priceTiktokEc.toFixed(2)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={bundle.isActive}
                            onCheckedChange={() => handleToggleActive(bundle.id)}
                          />
                          <Badge variant={bundle.isActive ? 'default' : 'secondary'}>
                            {bundle.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(bundle)}
                          >
                            Edit
                          </Button>
                          {!AUDIT_MODE && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDelete(bundle.id)}
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
                    <TableCell colSpan={14} className="p-0">
                      <EmptyState icon={Boxes} title="No bundles found. Create your first bundle." />
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

export default BundleTab;
