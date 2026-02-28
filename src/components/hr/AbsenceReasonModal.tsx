import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Check } from "lucide-react";

interface AbsenceReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  date: string;
  existingReason?: string | null;
  onSave: (reason: string) => Promise<void>;
  onMarkPresent?: () => Promise<void>;
  isLoading?: boolean;
}

const AbsenceReasonModal = ({
  open,
  onOpenChange,
  employeeName,
  date,
  existingReason,
  onSave,
  onMarkPresent,
  isLoading = false,
}: AbsenceReasonModalProps) => {
  const [reason, setReason] = useState("");

  // Populate reason when modal opens or existingReason changes
  useEffect(() => {
    if (open) {
      setReason(existingReason || "");
    }
  }, [open, existingReason]);

  const handleSave = async () => {
    await onSave(reason);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-MY", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>
            {existingReason ? "View/Edit Absence Reason" : "Mark as Absent"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Employee</p>
            <p className="font-medium">{employeeName}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Date</p>
            <p className="font-medium">{formatDate(date)}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Absence *</Label>
            <Textarea
              id="reason"
              placeholder="Enter reason for absence (e.g., MC, Annual Leave, Emergency Leave, etc.)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <div>
            {existingReason && onMarkPresent && (
              <Button
                onClick={onMarkPresent}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700 gap-1"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Mark Present
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isLoading || !reason.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {existingReason ? "Update" : "Mark Absent"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AbsenceReasonModal;
