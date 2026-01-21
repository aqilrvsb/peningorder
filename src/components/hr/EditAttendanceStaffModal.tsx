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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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

const STAFF_ROLES = [
  "Managing Director",
  "Business Support Exec",
  "Customer Support",
  "Logistic",
  "Multimedia",
];

const EditAttendanceStaffModal = ({ open, onOpenChange, staff }: EditAttendanceStaffModalProps) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    ic_number: "",
    phone: "",
    address: "",
    role: "",
  });

  // Populate form when staff changes
  useEffect(() => {
    if (staff) {
      setFormData({
        name: staff.name || "",
        ic_number: staff.ic_number || "",
        phone: staff.phone || "",
        address: staff.address || "",
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
          ic_number: data.ic_number || null,
          phone: data.phone || null,
          address: data.address || null,
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
            <Label htmlFor="edit-ic_number">IC Number</Label>
            <Input
              id="edit-ic_number"
              placeholder="e.g. 901234-14-5678"
              value={formData.ic_number}
              onChange={(e) => setFormData({ ...formData, ic_number: e.target.value })}
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

          <div className="space-y-2">
            <Label htmlFor="edit-address">Address</Label>
            <Textarea
              id="edit-address"
              placeholder="Full address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-role">Role *</Label>
            <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {STAFF_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
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
