import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type MainProduct = { id: string; name: string; sku: string | null; filter_group?: string | null };

/** One dropdown option: a product, or every product sharing a filter_group (e.g. "AL KAUSSAR"). */
export type ProductOption = { id: string; name: string; skus: string[]; names: string[] };

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
 * Products → dropdown options. Products with the same filter_group (Logistic → Product → Kumpulan)
 * become one option named after the group; its id is the group's first product (by name), so it stays
 * a product uuid (Salary per-product lock keeps working).
 */
export const toProductOptions = (products: MainProduct[]): ProductOption[] => {
  const byKey = new Map<string, ProductOption>();
  for (const p of products) {
    const group = (p.filter_group || '').trim();
    const key = group ? `g:${norm(group)}` : `p:${p.id}`;
    const opt = byKey.get(key) || { id: p.id, name: group || p.name, skus: [], names: [] };
    if (p.sku) opt.skus.push(norm(p.sku));
    opt.names.push(norm(p.name));
    byKey.set(key, opt);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Main-product filter (products table, not bundles). An order matches when its bundle contains the
 * product (or any product of its group); a spend matches on its `product` (SKU, or name on old rows).
 * productId '' = all products (everything matches).
 */
export function useProductFilter(productId: string) {
  const { data: allProducts = [] } = useQuery({
    queryKey: ['main-products-filter'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // filter_group may not exist yet on an older database → fall back to plain products.
      const withGroup = await (supabase as any).from('products').select('id, name, sku, filter_group').order('name');
      if (!withGroup.error) return (withGroup.data || []) as MainProduct[];
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

  const products = toProductOptions(allProducts);
  const product = productId ? products.find((p) => p.id === productId) || null : null;
  const skus = new Set(product?.skus || []);
  const keys = new Set([...(product?.skus || []), ...(product?.names || [])]);

  const matchOrder = (o: { bundle_id?: string | null; bundle?: { sku?: string | null } | null }) => {
    if (!product) return true;
    const sku = o.bundle?.sku ?? (o.bundle_id ? bundleSkuById.get(o.bundle_id) : '');
    return [...bundleProductSkus(sku)].some((s) => skus.has(s));
  };
  const matchSpend = (s: { product?: string | null }) => !product || keys.has(norm(s.product));

  return { products, allProducts, product, matchOrder, matchSpend };
}
