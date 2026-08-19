import { Ban, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Renders a payment receipt (Detail Bayaran) inline.
 *
 * The stored `receipt_payment_type` is unreliable — uploads are always saved as
 * "image" even when the file is a PDF — so we detect the real kind from the URL:
 *   - .pdf            -> embedded <iframe> (renders in-modal; won't show in <img>)
 *   - uploaded blob / image extension -> <img>
 *   - anything else (a pasted external link) -> "Buka link resit" button
 */
export function ReceiptViewer({ url, type }: { url?: string | null; type?: string | null }) {
  if (!url) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-amber-700 dark:text-amber-400 text-xs flex items-center gap-2">
        <Ban className="w-4 h-4" /> Tiada resit dimuat naik untuk order ini.
      </div>
    );
  }

  const isPdf = /\.pdf(\?|#|$)/i.test(url);
  const isImage =
    url.includes("vercel-storage.com") || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(url);

  if (isPdf) {
    return (
      <div className="space-y-2">
        <iframe
          src={url}
          title="Resit"
          className="w-full h-[70vh] rounded-lg border border-border bg-muted"
        />
        <Button variant="outline" size="sm" className="w-full" onClick={() => window.open(url, "_blank")}>
          <ExternalLink className="w-4 h-4 mr-2" /> Buka PDF penuh
        </Button>
      </div>
    );
  }

  // A genuine pasted external link (not a blob, not a known image) — open it.
  if (type === "link" && !isImage) {
    return (
      <Button variant="outline" className="w-full" onClick={() => window.open(url, "_blank")}>
        <ExternalLink className="w-4 h-4 mr-2" /> Buka link resit
      </Button>
    );
  }

  return (
    <img
      src={url}
      alt="Resit"
      className="w-full rounded-lg border border-border max-h-[70vh] object-contain bg-muted"
    />
  );
}

export default ReceiptViewer;
