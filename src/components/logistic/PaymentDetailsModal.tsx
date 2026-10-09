import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, CreditCard, Building2, Receipt, ExternalLink, X } from "lucide-react";
import { formatDMY } from "@/lib/utils";
import { IconTile } from "@/components/common/SoftUI";

interface PaymentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    date_payment?: string;
    jenis_bayaran?: string;
    bank?: string;
    receipt_image_url?: string;
    payment_method?: string;
    total_price?: number;
    customer?: {
      name?: string;
    };
    marketer_name?: string;
  } | null;
}

const PaymentDetailsModal = ({ isOpen, onClose, order }: PaymentDetailsModalProps) => {
  const [imageLoading, setImageLoading] = useState(true);

  if (!order) return null;

  const customerName = order.customer?.name || order.marketer_name || "-";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconTile icon={Receipt} tone="green" size="sm" />
            Payment Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Customer Name */}
          <div className="text-sm text-muted-foreground mb-1 break-words">
            Customer: <span className="font-medium text-foreground">{customerName}</span>
          </div>

          {/* Payment Date */}
          <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-muted/30 p-3">
            <IconTile icon={Calendar} tone="blue" size="sm" />
            <div className="min-w-0">
              <p className="section-label">Payment Date</p>
              <p className="font-medium whitespace-nowrap">{formatDMY(order.date_payment)}</p>
            </div>
          </div>

          {/* Payment Type */}
          <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-muted/30 p-3">
            <IconTile icon={CreditCard} tone="green" size="sm" />
            <div className="min-w-0">
              <p className="section-label">Payment Type</p>
              <p className="font-medium">{order.jenis_bayaran || order.payment_method || "-"}</p>
            </div>
          </div>

          {/* Bank */}
          <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-muted/30 p-3">
            <IconTile icon={Building2} tone="purple" size="sm" />
            <div className="min-w-0">
              <p className="section-label">Bank</p>
              <p className="font-medium break-words">{order.bank || "-"}</p>
            </div>
          </div>

          {/* Amount */}
          <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-3 dark:border-green-500/30 dark:bg-green-500/10">
            <span className="icon-tile-sm icon-tile-green text-xs font-bold">RM</span>
            <div className="min-w-0">
              <p className="section-label">Amount Paid</p>
              <p className="font-bold whitespace-nowrap text-green-700 dark:text-green-400">RM {Number(order.total_price || 0).toFixed(2)}</p>
            </div>
          </div>

          {/* Receipt Image */}
          {order.receipt_image_url && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Receipt className="w-4 h-4 text-muted-foreground" />
                Payment Receipt
              </p>
              <div className="relative min-h-[120px] border rounded-xl overflow-hidden bg-muted/30">
                {imageLoading && (
                  <div className="shimmer absolute inset-0 flex items-center justify-center rounded-none">
                    <div className="relative text-xs text-muted-foreground">Loading...</div>
                  </div>
                )}
                <img
                  src={order.receipt_image_url}
                  alt="Payment Receipt"
                  className="w-full max-h-[300px] object-contain"
                  onLoad={() => setImageLoading(false)}
                  onError={() => setImageLoading(false)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => window.open(order.receipt_image_url, "_blank")}
                >
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Open
                </Button>
              </div>
            </div>
          )}

          {!order.receipt_image_url && (
            <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-xl">
              No receipt image available
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentDetailsModal;
