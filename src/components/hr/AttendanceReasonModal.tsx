import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Eye, Loader2, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ReceiptViewer } from "@/components/ReceiptViewer";
import { ATTACHMENT_ACCEPT, attachmentProblem, useAttendanceFileUrl } from "./attendanceFiles";

export type ReasonSave = { reason: string; file: File | null; removeAttachment: boolean };

interface AttendanceReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  date: string;
  statusLabel: string;
  existingReason?: string | null;
  existingAttachment?: { path: string; name: string | null } | null;
  onSave: (data: ReasonSave) => Promise<void>;
  isLoading?: boolean;
}

// Reason + optional attachment (MC slip etc., image / PDF) for a Half Day / Absent day.
// Same field + "Lihat" viewer as Spend's receipt. Nothing here is required.
const AttendanceReasonModal = ({
  open,
  onOpenChange,
  employeeName,
  date,
  statusLabel,
  existingReason,
  existingAttachment,
  onSave,
  isLoading = false,
}: AttendanceReasonModalProps) => {
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [inputKey, setInputKey] = useState(0); // resets the file input

  useEffect(() => {
    if (open) {
      setReason(existingReason || "");
      setFile(null);
      setRemoveExisting(false);
      setInputKey((k) => k + 1);
    }
  }, [open, existingReason]);

  const hasExisting = !!existingAttachment && !removeExisting;
  const { data: viewUrl, isLoading: urlLoading } = useAttendanceFileUrl(viewing && existingAttachment ? existingAttachment.path : null);

  const pick = (f: File | undefined) => {
    if (!f) return setFile(null);
    const problem = attachmentProblem(f);
    if (problem) {
      toast.error(problem);
      setInputKey((k) => k + 1);
      return;
    }
    setFile(f);
  };

  const changed = reason.trim() !== (existingReason || "").trim() || !!file || removeExisting;

  const formatDate = (dateStr: string) =>
    dateStr
      ? new Date(dateStr).toLocaleDateString("en-MY", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
      : "";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Sebab {statusLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="section-label">Employee</p>
                <p className="font-medium">{employeeName}</p>
              </div>
              <div className="space-y-1">
                <p className="section-label">Date</p>
                <p className="font-medium">{formatDate(date)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="attendance-reason">Reason</Label>
              <Textarea
                id="attendance-reason"
                placeholder="cth. MC, Cuti Tahunan, Emergency, Separuh hari pagi"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="attendance-file" className="flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5" /> Lampiran / Bukti (MC, surat) <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                key={inputKey}
                id="attendance-file"
                type="file"
                accept={ATTACHMENT_ACCEPT}
                onChange={(e) => pick(e.target.files?.[0])}
              />
              {file ? (
                <p className="text-xs text-muted-foreground">
                  Fail dipilih: {file.name}
                  {hasExisting && " — akan menggantikan lampiran sedia ada."}
                </p>
              ) : hasExisting ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-2 py-1.5">
                  <span className="truncate text-xs text-muted-foreground">Lampiran sedia ada: {existingAttachment!.name || "fail"}</span>
                  <div className="flex flex-shrink-0 gap-1">
                    <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => setViewing(true)}>
                      <Eye className="mr-1 h-3.5 w-3.5" /> Lihat
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:text-red-700" title="Buang lampiran" onClick={() => setRemoveExisting(true)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : removeExisting ? (
                <p className="text-xs text-red-600">
                  Lampiran akan dibuang bila Simpan.{" "}
                  <button type="button" className="underline" onClick={() => setRemoveExisting(false)}>Undo</button>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Gambar (JPG/PNG) atau PDF, maksimum 10MB.</p>
              )}
            </div>
          </div>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={() => onSave({ reason, file, removeAttachment: removeExisting })} disabled={isLoading || !changed}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Same viewer as Spend: image inline, PDF embedded. */}
      <Dialog open={viewing} onOpenChange={setViewing}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lampiran — {employeeName}</DialogTitle>
          </DialogHeader>
          {urlLoading || !viewUrl
            ? <div className="shimmer h-64 w-full rounded-xl" aria-busy="true" />
            : <ReceiptViewer url={viewUrl} />}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AttendanceReasonModal;
