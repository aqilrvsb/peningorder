import React from 'react';
import { Package } from 'lucide-react';
import type { MainProduct } from '@/hooks/useProductFilter';

/** Main-product dropdown: "Semua Produk" ('' ) or one product from the products table. */
export const ProductFilter: React.FC<{ value: string; onChange: (v: string) => void; products: MainProduct[]; className?: string }> = ({ value, onChange, products, className }) => (
  <div className={`flex min-w-0 items-center gap-2 ${className || ''}`}>
    <Package className="w-4 h-4 text-muted-foreground shrink-0" />
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm shadow-xs transition-[border-color,box-shadow] focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 sm:w-auto"
    >
      <option value="">Semua Produk</option>
      {products.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  </div>
);

export default ProductFilter;
