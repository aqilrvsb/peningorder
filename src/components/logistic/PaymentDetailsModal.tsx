import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, CreditCard, Building2, Receipt, ExternalLink, X } from "lucide-react";

interface PaymentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    tarikh_bayaran?: string;
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
            <Receipt className="w-5 h-5" />
            Payment Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Customer Name */}
          <div className="text-sm text-muted-foreground mb-2">
            Customer: <span className="font-medium text-foreground">{customerName}</span>
          </div>

          {/* Payment Date */}
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Calendar className="w-5 h-5 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Payment Date</p>
              <p className="font-medium">{order.tarikh_bayaran || "-"}</p>
            </div>
          </div>

          {/* Payment Type */}
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <CreditCard className="w-5 h-5 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Payment Type</p>
              <p className="font-medium">{order.jenis_bayaran || order.payment_method || "-"}</p>
            </div>
          </div>

          {/* Bank */}
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Building2 className="w-5 h-5 text-purple-500" />
            <div>
              <p className="text-xs text-muted-foreground">Bank</p>
              <p className="font-medium">{order.bank || "-"}</p>
            </div>
          </div>

          {/* Amount */}
          <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="text-green-600 font-bold text-lg">RM</div>
            <div>
              <p className="text-xs text-muted-foreground">Amount Paid</p>
              <p className="font-bold text-green-700">RM {Number(order.total_price || 0).toFixed(2)}</p>
            </div>
          </div>

          {/* Receipt Image */}
          {order.receipt_image_url && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Receipt className="w-4 h-4" />
                Payment Receipt
              </p>
              <div className="relative border rounded-lg overflow-hidden bg-muted/30">
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="animate-pulse text-muted-foreground">Loading...</div>
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
            <div className="text-center py-4 text-muted-foreground border border-dashed rounded-lg">
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
