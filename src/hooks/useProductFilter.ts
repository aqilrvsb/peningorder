import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type MainProduct = { id: string; name: string; sku: string | null };

const norm = (v: string | null | undefined) => (v || '').trim().toLowerCase();

// Bundle SKU is "SKU_A-2 + SKU_B-1" -> { "sku_a", "sku_b" }
export const bundleProductSkus = (bundleSku: string | null | undefined) =>
  new Set(
    (bundleSku || '')
      .split('+')
      .map((part) => norm(part.trim().replace(/-\d+$/, '')))
      .filter(Boolean),
  );

/**
 * Main-product filter (products table, not bundles). An order matches when its
 * bundle contains the product; a spend matches on its `product` name.
 * productId '' = all products (everything matches).
 */
export function useProductFilter(productId: string) {
  const { data: products = [] } = useQuery({
    queryKey: ['main-products-filter'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('products').select('id, name, sku').order('name');
      if (error) throw error;
      return (data || []) as MainProduct[];
    },
  });
  const { data: bundleSkuById = new Map<string, string>() } = useQuery({
    queryKey: ['bundle-sku-map'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('logistic_bundles').select('id, sku');
      if (error) throw error;
      return new Map<string, string>((data || []).map((b: any) => [b.id, b.sku || '']));
    },
  });

  const product = productId ? products.find((p) => p.id === productId) || null : null;
  const pSku = norm(product?.sku);
  const pName = norm(product?.name);

  const matchOrder = (o: { bundle_id?: string | null; bundle?: { sku?: string | null } | null }) => {
    if (!product) return true;
    const sku = o.bundle?.sku ?? (o.bundle_id ? bundleSkuById.get(o.bundle_id) : '');
    return !!pSku && bundleProductSkus(sku).has(pSku);
  };
  const matchSpend = (s: { product?: string | null }) => !product || norm(s.product) === pName;

  return { products, product, matchOrder, matchSpend };
}
