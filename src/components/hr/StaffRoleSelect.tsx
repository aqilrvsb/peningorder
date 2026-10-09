import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHrRoles } from "./useHrPeople";

interface StaffRoleSelectProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when the user follows the link to HR → Role (so the modal can close). */
  onGoToRoles?: () => void;
}

// Role dropdown for Add/Edit Staff — options come from HR → Role.
const StaffRoleSelect = ({ value, onChange, onGoToRoles }: StaffRoleSelectProps) => {
  const { data: roles = [], isLoading } = useHrRoles();
  // Keep a staff's current role visible even if it isn't in the list (e.g. legacy value).
  const names = roles.map((r) => r.name);
  if (value && !names.includes(value)) names.unshift(value);

  if (!isLoading && names.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        Belum ada role.{" "}
        <Link to="/dashboard/hr/roles" onClick={onGoToRoles} className="font-medium text-primary underline">
          Tambah role di HR → Role
        </Link>{" "}
        dahulu.
      </p>
    );
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={isLoading}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? "Loading…" : "Select role"} />
      </SelectTrigger>
      <SelectContent>
        {names.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default StaffRoleSelect;
