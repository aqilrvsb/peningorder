import { supabase } from "@/integrations/supabase/client";

const COURIER_RE = /poslaju|ninjavan|jnt|dhl|spx/i;

/**
 * Waybill PDF links for courier orders, ParcelDaily or the tenant's own courier (Bring Your Courier).
 * Orders without a stored label are fetched first via parceldaily-sync, which asks the right provider.
 */
export async function courierWaybillUrls(orders: any[]): Promise<{ urls: string[]; updated: number }> {
  const byId = new Map<string, string>();
  let updated = 0;
  const missing = orders.filter((o) => !o.waybill_url && COURIER_RE.test(o.kurier || ""));
  if (missing.length) {
    try {
      const { data } = await supabase.functions.invoke("parceldaily-sync", {
        body: { purchaseIds: missing.map((o) => o.id) },
      });
      for (const r of data?.results || []) if (r?.waybill_url) byId.set(r.id, r.waybill_url);
      updated = Number(data?.updated) || 0;
    } catch { /* print whatever already has a waybill */ }
  }
  const urls = orders.map((o) => o.waybill_url || byId.get(o.id) || null).filter(Boolean) as string[];
  return { urls, updated };
}

/** Merge the PDFs into one and open it in a new tab. Returns false when the merge failed. */
export async function openMergedWaybills(urls: string[]): Promise<boolean> {
  const response = await supabase.functions.invoke("merge-waybills", { body: { waybillUrls: urls } });
  if (response.error || !response.data) {
    console.error("Waybill merge error:", response.error);
    return false;
  }
  const blob = new Blob([response.data], { type: "application/pdf" });
  window.open(URL.createObjectURL(blob), "_blank");
  return true;
}
