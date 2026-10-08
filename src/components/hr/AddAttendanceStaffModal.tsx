import { useState } from "react";
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

interface AddAttendanceStaffModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AddAttendanceStaffModal = ({ open, onOpenChange }: AddAttendanceStaffModalProps) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    role: "",
  });

  const createStaffMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: result, error } = await supabase
        .from("attendance_staff")
        .insert({
          name: data.name,
          phone: data.phone || null,
          role: data.role,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      toast.success("Staff added successfully");
      queryClient.invalidateQueries({ queryKey: ["hr-attendance-staff"] });
      queryClient.invalidateQueries({ queryKey: ["hr-attendance-users"] });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to add staff");
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      role: "",
    });
  };

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

    createStaffMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Staff</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="Full name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              placeholder="e.g. 60123456789"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role *</Label>
            <StaffRoleSelect
              value={formData.role}
              onChange={(value) => setFormData({ ...formData, role: value })}
              onGoToRoles={() => onOpenChange(false)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createStaffMutation.isPending}>
              {createStaffMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Staff
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddAttendanceStaffModal;
