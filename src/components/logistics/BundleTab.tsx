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
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { useBundles } from '@/context/BundleContext';

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
    // Shopee prices by customer type
    priceShopeeNp: '0.00',
    priceShopeeEp: '0.00',
    priceShopeeEc: '0.00',
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
        // Shopee prices by customer type
        priceShopeeNp: parseFloat(formData.priceShopeeNp) || 0,
        priceShopeeEp: parseFloat(formData.priceShopeeEp) || 0,
        priceShopeeEc: parseFloat(formData.priceShopeeEc) || 0,
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
        // Shopee prices by customer type
        priceShopeeNp: parseFloat(formData.priceShopeeNp) || 0,
        priceShopeeEp: parseFloat(formData.priceShopeeEp) || 0,
        priceShopeeEc: parseFloat(formData.priceShopeeEc) || 0,
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
      priceShopeeNp: '0.00',
      priceShopeeEp: '0.00',
      priceShopeeEc: '0.00',
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
      priceShopeeNp: bundle.priceShopeeNp.toFixed(2),
      priceShopeeEp: bundle.priceShopeeEp.toFixed(2),
      priceShopeeEc: bundle.priceShopeeEc.toFixed(2),
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bundle Table */}
      <Card className="border">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-xl">Bundle Pricing Management</h3>
              <p className="text-sm text-muted-foreground">
                Create and manage product bundles with tiered pricing for agents
              </p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openNewDialog} className="bg-primary hover:bg-primary/90">
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
                  <div className="grid grid-cols-2 gap-4">
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
                  <div className="border rounded-lg p-4 space-y-3">
                    <h4 className="font-semibold text-sm text-blue-600">Normal Price (Facebook, Database, Google)</h4>
                    <div className="grid grid-cols-3 gap-4">
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

                  {/* Shopee Prices Section */}
                  <div className="border rounded-lg p-4 space-y-3">
                    <h4 className="font-semibold text-sm text-orange-600">Shopee Price</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">NP (New Prospect)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.priceShopeeNp}
                          onChange={(e) => setFormData({ ...formData, priceShopeeNp: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">EP (Existing Prospect)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.priceShopeeEp}
                          onChange={(e) => setFormData({ ...formData, priceShopeeEp: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">EC (Existing Customer)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.priceShopeeEc}
                          onChange={(e) => setFormData({ ...formData, priceShopeeEc: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* TikTok Prices Section */}
                  <div className="border rounded-lg p-4 space-y-3">
                    <h4 className="font-semibold text-sm text-pink-600">TikTok Price</h4>
                    <div className="grid grid-cols-3 gap-4">
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

                  <Button type="submit" className="w-full bg-primary hover:bg-primary/90">
                    {editingBundle ? 'Update Bundle' : 'Create Bundle'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bundle Name</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead className="text-center" colSpan={3}>
                    <span className="text-blue-600">Normal Price</span>
                  </TableHead>
                  <TableHead className="text-center" colSpan={3}>
                    <span className="text-orange-600">Shopee Price</span>
                  </TableHead>
                  <TableHead className="text-center" colSpan={3}>
                    <span className="text-pink-600">TikTok Price</span>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
                <TableRow className="text-xs">
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
                      <TableCell className="text-blue-600">RM {bundle.priceNormalNp.toFixed(2)}</TableCell>
                      <TableCell className="text-blue-600">RM {bundle.priceNormalEp.toFixed(2)}</TableCell>
                      <TableCell className="text-blue-600">RM {bundle.priceNormalEc.toFixed(2)}</TableCell>
                      {/* Shopee prices */}
                      <TableCell className="text-orange-600">RM {bundle.priceShopeeNp.toFixed(2)}</TableCell>
                      <TableCell className="text-orange-600">RM {bundle.priceShopeeEp.toFixed(2)}</TableCell>
                      <TableCell className="text-orange-600">RM {bundle.priceShopeeEc.toFixed(2)}</TableCell>
                      {/* TikTok prices */}
                      <TableCell className="text-pink-600">RM {bundle.priceTiktokNp.toFixed(2)}</TableCell>
                      <TableCell className="text-pink-600">RM {bundle.priceTiktokEp.toFixed(2)}</TableCell>
                      <TableCell className="text-pink-600">RM {bundle.priceTiktokEc.toFixed(2)}</TableCell>
                      <TableCell>
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
                    <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                      No bundles found. Create your first bundle.
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
