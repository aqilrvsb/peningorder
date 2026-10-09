import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import StaffRoleSelect from "./StaffRoleSelect";
import { MissingHint } from "@/components/common/SoftUI";

interface AttendanceStaff {
  id: string;
  name: string;
  ic_number: string | null;
  phone: string | null;
  address: string | null;
  role: string;
}

interface EditAttendanceStaffModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: AttendanceStaff | null;
}

const EditAttendanceStaffModal = ({ open, onOpenChange, staff }: EditAttendanceStaffModalProps) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    role: "",
  });

  // Populate form when staff changes
  useEffect(() => {
    if (staff) {
      setFormData({
        name: staff.name || "",
        phone: staff.phone || "",
        role: staff.role || "",
      });
    }
  }, [staff]);

  const updateStaffMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!staff) throw new Error("No staff selected");

      const { data: result, error } = await supabase
        .from("attendance_staff")
        .update({
          name: data.name,
          phone: data.phone || null,
          role: data.role,
          updated_at: new Date().toISOString(),
        })
        .eq("id", staff.id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      toast.success("Staff updated successfully");
      queryClient.invalidateQueries({ queryKey: ["hr-attendance-staff"] });
      queryClient.invalidateQueries({ queryKey: ["hr-attendance-users"] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update staff");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!formData.role) {
      toast.error("Role is required");
      return;
    }

    updateStaffMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Staff</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                placeholder="Full name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone Number</Label>
              <Input
                id="edit-phone"
                placeholder="e.g. 60123456789"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-role">Role *</Label>
            <StaffRoleSelect
              value={formData.role}
              onChange={(value) => setFormData({ ...formData, role: value })}
              onGoToRoles={() => onOpenChange(false)}
            />
          </div>

          <MissingHint items={[{ label: "Name", done: !!formData.name.trim() }, { label: "Role", done: !!formData.role }]} />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateStaffMutation.isPending}>
              {updateStaffMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditAttendanceStaffModal;
