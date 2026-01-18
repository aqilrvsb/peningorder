import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface Bundle {
  id: string;
  name: string;
  productId: string;
  productName: string;
  productSku: string;
  units: number;
  // Normal prices (Facebook, Database, Google) by customer type
  priceNormalNp: number;
  priceNormalEp: number;
  priceNormalEc: number;
  // Shopee prices by customer type
  priceShopeeNp: number;
  priceShopeeEp: number;
  priceShopeeEc: number;
  // TikTok prices by customer type
  priceTiktokNp: number;
  priceTiktokEp: number;
  priceTiktokEc: number;
  isActive: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  baseCost: number;
  stockIn: number;
  stockOut: number;
  quantity: number;
  isActive: boolean;
}

interface BundleContextType {
  bundles: Bundle[];
  products: Product[];
  isLoading: boolean;
  refreshData: () => Promise<void>;
  addBundle: (bundle: Omit<Bundle, 'id' | 'productName' | 'productSku'>) => Promise<void>;
  updateBundle: (id: string, bundle: Partial<Bundle>) => Promise<void>;
  deleteBundle: (id: string) => Promise<void>;
  toggleBundleActive: (id: string) => Promise<void>;
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>;
  updateProduct: (id: string, product: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  getActiveBundles: () => Bundle[];
}

const BundleContext = createContext<BundleContextType | undefined>(undefined);

export const BundleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshData = async () => {
    setIsLoading(true);
    try {
      // Fetch products using raw query to bypass type issues
      const { data: productsData, error: productsError } = await supabase
        .from('products' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (productsError) throw productsError;

      const mappedProducts: Product[] = ((productsData as any[]) || []).map((p: any) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        baseCost: Number(p.base_cost),
        stockIn: p.stock_in,
        stockOut: p.stock_out,
        quantity: p.quantity,
        isActive: p.is_active,
      }));
      setProducts(mappedProducts);

      // Note: The 'bundles' table has been deleted.
      // Logistic users should use LogisticBundleManagement with 'logistic_bundles' table instead.
      // Setting empty bundles array since the table no longer exists.
      setBundles([]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const addBundle = async (bundle: Omit<Bundle, 'id' | 'productName' | 'productSku'>) => {
    // Note: The 'bundles' table has been deleted.
    // This function is kept for interface compatibility but does nothing.
    toast({ title: 'Not Available', description: 'Bundle management has been moved to Logistic Bundle Management.', variant: 'destructive' });
  };

  const updateBundle = async (id: string, bundle: Partial<Bundle>) => {
    // Note: The 'bundles' table has been deleted.
    // This function is kept for interface compatibility but does nothing.
    toast({ title: 'Not Available', description: 'Bundle management has been moved to Logistic Bundle Management.', variant: 'destructive' });
  };

  const deleteBundle = async (id: string) => {
    // Note: The 'bundles' table has been deleted.
    // This function is kept for interface compatibility but does nothing.
    toast({ title: 'Not Available', description: 'Bundle management has been moved to Logistic Bundle Management.', variant: 'destructive' });
  };

  const toggleBundleActive = async (id: string) => {
    // Note: The 'bundles' table has been deleted.
    // This function is kept for interface compatibility but does nothing.
    toast({ title: 'Not Available', description: 'Bundle management has been moved to Logistic Bundle Management.', variant: 'destructive' });
  };

  const addProduct = async (product: Omit<Product, 'id'>) => {
    try {
      const { error } = await supabase.from('products' as any).insert({
        sku: product.sku,
        name: product.name,
        base_cost: product.baseCost,
        stock_in: product.stockIn,
        stock_out: product.stockOut,
        quantity: product.quantity,
        is_active: product.isActive,
      });
      if (error) throw error;
      await refreshData();
      toast({ title: 'Product Created', description: 'New product has been added successfully.' });
    } catch (error: any) {
      console.error('Error adding product:', error);
      // Check for duplicate SKU error
      if (error?.code === '23505') {
        toast({ 
          title: 'SKU Already Exists', 
          description: `A product with SKU "${product.sku}" already exists. Please use a different SKU.`, 
          variant: 'destructive' 
        });
      } else {
        toast({ title: 'Error', description: 'Failed to add product', variant: 'destructive' });
      }
    }
  };

  const updateProduct = async (id: string, product: Partial<Product>) => {
    try {
      const updateData: any = {};
      if (product.sku !== undefined) updateData.sku = product.sku;
      if (product.name !== undefined) updateData.name = product.name;
      if (product.baseCost !== undefined) updateData.base_cost = product.baseCost;
      if (product.stockIn !== undefined) updateData.stock_in = product.stockIn;
      if (product.stockOut !== undefined) updateData.stock_out = product.stockOut;
      if (product.quantity !== undefined) updateData.quantity = product.quantity;
      if (product.isActive !== undefined) updateData.is_active = product.isActive;
      updateData.updated_at = new Date().toISOString();

      const { error } = await supabase.from('products' as any).update(updateData).eq('id', id);
      if (error) throw error;
      await refreshData();
      toast({ title: 'Product Updated', description: 'Product has been updated successfully.' });
    } catch (error) {
      console.error('Error updating product:', error);
      toast({ title: 'Error', description: 'Failed to update product', variant: 'destructive' });
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      const { error } = await supabase.from('products' as any).delete().eq('id', id);
      if (error) throw error;
      await refreshData();
      toast({ title: 'Product Deleted', description: 'Product has been removed.' });
    } catch (error) {
      console.error('Error deleting product:', error);
      toast({ title: 'Error', description: 'Failed to delete product', variant: 'destructive' });
    }
  };

  const getActiveBundles = () => {
    return bundles.filter(b => b.isActive);
  };

  return (
    <BundleContext.Provider value={{ 
      bundles, 
      products,
      isLoading,
      refreshData,
      addBundle, 
      updateBundle, 
      deleteBundle, 
      toggleBundleActive,
      addProduct,
      updateProduct,
      deleteProduct,
      getActiveBundles 
    }}>
      {children}
    </BundleContext.Provider>
  );
};

export const useBundles = () => {
  const context = useContext(BundleContext);
  if (context === undefined) {
    throw new Error('useBundles must be used within a BundleProvider');
  }
  return context;
};
