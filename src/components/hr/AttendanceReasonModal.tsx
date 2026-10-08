import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface AttendanceReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  date: string;
  statusLabel: string;
  existingReason?: string | null;
  onSave: (reason: string) => Promise<void>;
  isLoading?: boolean;
}

// Reason for a Half Day / Absent day. Optional — the click cycle never asks for it.
const AttendanceReasonModal = ({
  open,
  onOpenChange,
  employeeName,
  date,
  statusLabel,
  existingReason,
  onSave,
  isLoading = false,
}: AttendanceReasonModalProps) => {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason(existingReason || "");
  }, [open, existingReason]);

  const formatDate = (dateStr: string) =>
    dateStr
      ? new Date(dateStr).toLocaleDateString("en-MY", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
      : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Sebab {statusLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Employee</p>
              <p className="font-medium">{employeeName}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-medium">{formatDate(date)}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="attendance-reason">Reason</Label>
            <Textarea
              id="attendance-reason"
              autoFocus
              placeholder="cth. MC, Cuti Tahunan, Emergency, Separuh hari pagi"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <div>
            {existingReason && (
              <Button variant="ghost" className="text-red-600 hover:text-red-700" disabled={isLoading} onClick={() => onSave("")}>
                Buang sebab
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={() => onSave(reason)} disabled={isLoading || !reason.trim()}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Simpan
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AttendanceReasonModal;
