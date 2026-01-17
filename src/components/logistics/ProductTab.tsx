import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Package, TrendingUp, CheckCircle, XCircle, Edit, Trash2, Calendar, Loader2 } from 'lucide-react';
import { useBundles } from '@/context/BundleContext';
import { supabase } from '@/integrations/supabase/client';

interface FilteredStock {
  productId: string;
  stockIn: number;
  stockOut: number;
}

interface OrderStock {
  productId: string;
  returnIn: number;
  processedOut: number;
}

const ProductTab: React.FC = () => {
  const { products, bundles, isLoading, addProduct, updateProduct, deleteProduct } = useBundles();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<typeof products[0] | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filteredStocks, setFilteredStocks] = useState<FilteredStock[]>([]);
  const [orderStocks, setOrderStocks] = useState<OrderStock[]>([]);
  const [allTimeOrderStocks, setAllTimeOrderStocks] = useState<OrderStock[]>([]); // For Quantity calculation (no date filter)
  const [isFilterLoading, setIsFilterLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    baseCost: '',
  });

  // Helper: Get product_id from bundle name (produk field in orders)
  const getProductIdFromBundleName = (bundleName: string): string | null => {
    const bundle = bundles.find(b => b.name === bundleName);
    return bundle?.productId || null;
  };

  // Fetch all-time order stocks (for Quantity calculation - no date filter)
  useEffect(() => {
    const fetchAllTimeOrderStocks = async () => {
      try {
        // Fetch Return orders (delivery_status = 'Return')
        const { data: returnData, error: returnError } = await supabase
          .from('customer_purchases' as any)
          .select('produk, quantity')
          .eq('delivery_status', 'Return');

        if (returnError) throw returnError;

        // Fetch Shipped orders (delivery_status = 'Shipped')
        const { data: shippedData, error: shippedError } = await supabase
          .from('customer_purchases' as any)
          .select('produk, quantity')
          .eq('delivery_status', 'Shipped');

        if (shippedError) throw shippedError;

        // Aggregate by product_id
        const orderMap = new Map<string, { returnIn: number; processedOut: number }>();

        ((returnData as any[]) || []).forEach((order: any) => {
          const productId = getProductIdFromBundleName(order.produk);
          if (productId) {
            const existing = orderMap.get(productId) || { returnIn: 0, processedOut: 0 };
            existing.returnIn += order.quantity || 1;
            orderMap.set(productId, existing);
          }
        });

        ((shippedData as any[]) || []).forEach((order: any) => {
          const productId = getProductIdFromBundleName(order.produk);
          if (productId) {
            const existing = orderMap.get(productId) || { returnIn: 0, processedOut: 0 };
            existing.processedOut += order.quantity || 1;
            orderMap.set(productId, existing);
          }
        });

        const result: OrderStock[] = Array.from(orderMap.entries()).map(([productId, stocks]) => ({
          productId,
          returnIn: stocks.returnIn,
          processedOut: stocks.processedOut,
        }));

        setAllTimeOrderStocks(result);
      } catch (error) {
        console.error('Error fetching all-time order stocks:', error);
      }
    };

    if (bundles.length > 0) {
      fetchAllTimeOrderStocks();
    }
  }, [bundles]);

  // Fetch filtered stock movements and order stocks when date filters change
  useEffect(() => {
    const fetchFilteredData = async () => {
      setIsFilterLoading(true);
      try {
        // Fetch stock movements (Stock In / Stock Out)
        let stockQuery = supabase
          .from('stock_movements' as any)
          .select('product_id, type, quantity, date');

        if (startDate) {
          stockQuery = stockQuery.gte('date', startDate);
        }
        if (endDate) {
          stockQuery = stockQuery.lte('date', endDate);
        }

        const { data: stockData, error: stockError } = await stockQuery;
        if (stockError) throw stockError;

        // Aggregate stock movements by product
        const stockMap = new Map<string, { stockIn: number; stockOut: number }>();
        ((stockData as any[]) || []).forEach((movement: any) => {
          const existing = stockMap.get(movement.product_id) || { stockIn: 0, stockOut: 0 };
          if (movement.type === 'in') {
            existing.stockIn += movement.quantity;
          } else if (movement.type === 'out') {
            existing.stockOut += movement.quantity;
          }
          stockMap.set(movement.product_id, existing);
        });

        const filteredStockResult: FilteredStock[] = Array.from(stockMap.entries()).map(([productId, stocks]) => ({
          productId,
          stockIn: stocks.stockIn,
          stockOut: stocks.stockOut,
        }));
        setFilteredStocks(filteredStockResult);

        // Fetch Return In orders (filter by date_return)
        let returnQuery = supabase
          .from('customer_purchases' as any)
          .select('produk, quantity, date_return')
          .eq('delivery_status', 'Return');

        if (startDate) {
          returnQuery = returnQuery.gte('date_return', startDate);
        }
        if (endDate) {
          returnQuery = returnQuery.lte('date_return', endDate);
        }

        const { data: returnData, error: returnError } = await returnQuery;
        if (returnError) throw returnError;

        // Fetch Processed Out orders (filter by date_processed)
        let processedQuery = supabase
          .from('customer_purchases' as any)
          .select('produk, quantity, date_processed')
          .eq('delivery_status', 'Shipped');

        if (startDate) {
          processedQuery = processedQuery.gte('date_processed', startDate);
        }
        if (endDate) {
          processedQuery = processedQuery.lte('date_processed', endDate);
        }

        const { data: processedData, error: processedError } = await processedQuery;
        if (processedError) throw processedError;

        // Aggregate order stocks by product_id
        const orderMap = new Map<string, { returnIn: number; processedOut: number }>();

        ((returnData as any[]) || []).forEach((order: any) => {
          const productId = getProductIdFromBundleName(order.produk);
          if (productId) {
            const existing = orderMap.get(productId) || { returnIn: 0, processedOut: 0 };
            existing.returnIn += order.quantity || 1;
            orderMap.set(productId, existing);
          }
        });

        ((processedData as any[]) || []).forEach((order: any) => {
          const productId = getProductIdFromBundleName(order.produk);
          if (productId) {
            const existing = orderMap.get(productId) || { returnIn: 0, processedOut: 0 };
            existing.processedOut += order.quantity || 1;
            orderMap.set(productId, existing);
          }
        });

        const orderStockResult: OrderStock[] = Array.from(orderMap.entries()).map(([productId, stocks]) => ({
          productId,
          returnIn: stocks.returnIn,
          processedOut: stocks.processedOut,
        }));
        setOrderStocks(orderStockResult);

      } catch (error) {
        console.error('Error fetching filtered data:', error);
      } finally {
        setIsFilterLoading(false);
      }
    };

    fetchFilteredData();
  }, [startDate, endDate, bundles]);

  const hasDateFilter = startDate || endDate;

  // Get stock values - filtered if date filter applied, otherwise original
  const getStockIn = (productId: string, originalStockIn: number) => {
    if (!hasDateFilter) return originalStockIn;
    const filtered = filteredStocks.find(f => f.productId === productId);
    return filtered?.stockIn || 0;
  };

  const getStockOut = (productId: string, originalStockOut: number) => {
    if (!hasDateFilter) return originalStockOut;
    const filtered = filteredStocks.find(f => f.productId === productId);
    return filtered?.stockOut || 0;
  };

  // Get Return In for a product (filtered by date if date filter applied)
  const getReturnIn = (productId: string) => {
    if (!hasDateFilter) {
      const allTime = allTimeOrderStocks.find(f => f.productId === productId);
      return allTime?.returnIn || 0;
    }
    const filtered = orderStocks.find(f => f.productId === productId);
    return filtered?.returnIn || 0;
  };

  // Get Processed Out for a product (filtered by date if date filter applied)
  const getProcessedOut = (productId: string) => {
    if (!hasDateFilter) {
      const allTime = allTimeOrderStocks.find(f => f.productId === productId);
      return allTime?.processedOut || 0;
    }
    const filtered = orderStocks.find(f => f.productId === productId);
    return filtered?.processedOut || 0;
  };

  // Calculate Quantity: Stock In + Return In - Stock Out - Processed Out (ALL TIME, no date filter)
  const getQuantity = (productId: string, originalStockIn: number, originalStockOut: number) => {
    const allTimeReturn = allTimeOrderStocks.find(f => f.productId === productId);
    const returnIn = allTimeReturn?.returnIn || 0;
    const processedOut = allTimeReturn?.processedOut || 0;
    return originalStockIn + returnIn - originalStockOut - processedOut;
  };

  // Stats - filtered by date for Stock In/Out/Return In/Processed Out, but NOT by product (totals)
  const stats = {
    totalProducts: products.length,
    activeProducts: products.filter((p) => p.isActive).length,
    inactiveProducts: products.filter((p) => !p.isActive).length,
    // Stock In/Out: filtered by date only (not by product)
    stockIn: hasDateFilter
      ? filteredStocks.reduce((sum, f) => sum + f.stockIn, 0)
      : products.reduce((sum, p) => sum + p.stockIn, 0),
    stockOut: hasDateFilter
      ? filteredStocks.reduce((sum, f) => sum + f.stockOut, 0)
      : products.reduce((sum, p) => sum + p.stockOut, 0),
    // Return In / Processed Out: filtered by date only (not by product)
    returnIn: hasDateFilter
      ? orderStocks.reduce((sum, f) => sum + f.returnIn, 0)
      : allTimeOrderStocks.reduce((sum, f) => sum + f.returnIn, 0),
    processedOut: hasDateFilter
      ? orderStocks.reduce((sum, f) => sum + f.processedOut, 0)
      : allTimeOrderStocks.reduce((sum, f) => sum + f.processedOut, 0),
    // Total Quantity: ALL TIME (Stock In + Return In - Stock Out - Processed Out)
    totalQuantity: products.reduce((sum, p) => {
      const allTimeReturn = allTimeOrderStocks.find(f => f.productId === p.id);
      const returnIn = allTimeReturn?.returnIn || 0;
      const processedOut = allTimeReturn?.processedOut || 0;
      return sum + (p.stockIn + returnIn - p.stockOut - processedOut);
    }, 0),
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingProduct) {
      await updateProduct(editingProduct.id, {
        name: formData.name,
        sku: formData.sku,
        baseCost: parseFloat(formData.baseCost) || 0,
      });
    } else {
      await addProduct({
        sku: formData.sku,
        name: formData.name,
        baseCost: parseFloat(formData.baseCost) || 0,
        stockIn: 0,
        stockOut: 0,
        quantity: 0,
        isActive: true,
      });
    }

    setFormData({ name: '', sku: '', baseCost: '' });
    setEditingProduct(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (product: typeof products[0]) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku,
      baseCost: product.baseCost.toString(),
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    await deleteProduct(id);
  };

  const openNewDialog = () => {
    setEditingProduct(null);
    setFormData({ name: '', sku: '', baseCost: '' });
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
      <div>
        <h2 className="text-2xl font-bold text-primary">Inventory Management</h2>
        <p className="text-muted-foreground">Manage your inventory quantities and stock levels</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <Card className="border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Products</p>
                <p className="text-2xl font-bold">{stats.totalProducts}</p>
              </div>
              <Package className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Quantity</p>
                <p className="text-2xl font-bold">{stats.totalQuantity.toLocaleString()}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Products</p>
                <p className="text-2xl font-bold">{stats.activeProducts}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-success" />
            </div>
          </CardContent>
        </Card>

        <Card className="border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Inactive Products</p>
                <p className="text-2xl font-bold">{stats.inactiveProducts}</p>
              </div>
              <XCircle className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Stock In {hasDateFilter && '(Filtered)'}</p>
                <p className="text-2xl font-bold">{stats.stockIn.toLocaleString()}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-success" />
            </div>
          </CardContent>
        </Card>

        <Card className="border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Return In {hasDateFilter && '(Filtered)'}</p>
                <p className="text-2xl font-bold">{stats.returnIn.toLocaleString()}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Stock Out {hasDateFilter && '(Filtered)'}</p>
                <p className="text-2xl font-bold">{stats.stockOut.toLocaleString()}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-destructive rotate-180" />
            </div>
          </CardContent>
        </Card>

        <Card className="border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Processed Out {hasDateFilter && '(Filtered)'}</p>
                <p className="text-2xl font-bold">{stats.processedOut.toLocaleString()}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-orange-500 rotate-180" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Date Filters */}
      <Card className="border">
        <CardContent className="p-4">
          <h3 className="font-semibold mb-4">Date Filters (Stock In/Out only)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pr-10"
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pr-10"
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>
          {hasDateFilter && (
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-3"
              onClick={() => { setStartDate(''); setEndDate(''); }}
            >
              Clear Filter
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card className="border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">Inventory Management</h3>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openNewDialog} className="bg-primary hover:bg-primary/90">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-background">
                <DialogHeader>
                  <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Product Name</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>SKU</Label>
                      <Input
                        value={formData.sku}
                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Base Cost</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.baseCost}
                      onChange={(e) => setFormData({ ...formData, baseCost: e.target.value })}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full bg-primary hover:bg-primary/90">
                    {editingProduct ? 'Update Product' : 'Create Product'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Base Cost</TableHead>
                  <TableHead>Stock In {hasDateFilter && '(Filtered)'}</TableHead>
                  <TableHead>Return In {hasDateFilter && '(Filtered)'}</TableHead>
                  <TableHead>Stock Out {hasDateFilter && '(Filtered)'}</TableHead>
                  <TableHead>Processed Out {hasDateFilter && '(Filtered)'}</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length > 0 ? (
                  products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.sku}</TableCell>
                      <TableCell>{product.name}</TableCell>
                      <TableCell>RM {product.baseCost.toFixed(2)}</TableCell>
                      <TableCell className="text-success">
                        {isFilterLoading ? '...' : getStockIn(product.id, product.stockIn).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-blue-500">
                        {isFilterLoading ? '...' : getReturnIn(product.id).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-destructive">
                        {isFilterLoading ? '...' : getStockOut(product.id, product.stockOut).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-orange-500">
                        {isFilterLoading ? '...' : getProcessedOut(product.id).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-bold">{getQuantity(product.id, product.stockIn, product.stockOut).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(product)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(product.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No products found. Add your first product.
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

export default ProductTab;
