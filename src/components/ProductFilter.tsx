import React from 'react';
import { Package } from 'lucide-react';
import type { MainProduct } from '@/hooks/useProductFilter';

/** Main-product dropdown: "Semua Produk" ('' ) or one product from the products table. */
export const ProductFilter: React.FC<{ value: string; onChange: (v: string) => void; products: MainProduct[]; className?: string }> = ({ value, onChange, products, className }) => (
  <div className={`flex items-center gap-2 ${className || ''}`}>
    <Package className="w-4 h-4 text-muted-foreground shrink-0" />
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
    >
      <option value="">Semua Produk</option>
      {products.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  </div>
);

export default ProductFilter;
