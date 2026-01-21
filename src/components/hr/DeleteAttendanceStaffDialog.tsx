import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface AttendanceStaff {
  id: string;
  name: string;
  role: string;
}

interface DeleteAttendanceStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: AttendanceStaff | null;
}

const DeleteAttendanceStaffDialog = ({ open, onOpenChange, staff }: DeleteAttendanceStaffDialogProps) => {
  const queryClient = useQueryClient();

  const deleteStaffMutation = useMutation({
    mutationFn: async () => {
      if (!staff) throw new Error("No staff selected");

      // Soft delete - set is_active to false
      const { error } = await supabase
        .from("attendance_staff")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", staff.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Staff deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["hr-attendance-staff"] });
      queryClient.invalidateQueries({ queryKey: ["hr-attendance-users"] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete staff");
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Staff</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong>{staff?.name}</strong> ({staff?.role})?
            This action will remove them from the attendance list.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              deleteStaffMutation.mutate();
            }}
            className="bg-red-600 hover:bg-red-700"
            disabled={deleteStaffMutation.isPending}
          >
            {deleteStaffMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteAttendanceStaffDialog;
