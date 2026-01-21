import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Loader2, ChevronLeft, ChevronRight, UserPlus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, getDaysInMonth, startOfMonth, getDay } from "date-fns";
import AddAttendanceStaffModal from "./AddAttendanceStaffModal";
import EditAttendanceStaffModal from "./EditAttendanceStaffModal";
import DeleteAttendanceStaffDialog from "./DeleteAttendanceStaffDialog";

type AttendanceStatus = "present" | "absent" | null;

interface AttendanceRecord {
  id: string;
  user_id: string;
  date: string;
  status: AttendanceStatus;
}

interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  idstaff: string | null;
  is_active: boolean;
  role?: string;
  staffType?: "profile" | "attendance_staff"; // To differentiate source
  // Extra fields for attendance_staff
  phone?: string | null;
  address?: string | null;
}

interface AttendanceStaffData {
  id: string;
  name: string;
  ic_number: string | null;
  phone: string | null;
  address: string | null;
  role: string;
}

const HRAttendance = () => {
  const queryClient = useQueryClient();
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth());
  const [roleFilter, setRoleFilter] = useState("all");
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [showEditStaffModal, setShowEditStaffModal] = useState(false);
  const [showDeleteStaffDialog, setShowDeleteStaffDialog] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<AttendanceStaffData | null>(null);

  // Generate years for dropdown (current year +/- 2 years)
  const years = Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - 2 + i);

  // Months array
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Get days in selected month
  const daysInMonth = getDaysInMonth(new Date(selectedYear, selectedMonth));
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Get the first day of month (0 = Sunday, 1 = Monday, etc.)
  const getFirstDayOfMonth = () => {
    return getDay(startOfMonth(new Date(selectedYear, selectedMonth)));
  };

  // Check if a day is weekend (Saturday = 6, Sunday = 0)
  const isWeekend = (day: number) => {
    const date = new Date(selectedYear, selectedMonth, day);
    const dayOfWeek = getDay(date);
    return dayOfWeek === 0 || dayOfWeek === 6;
  };

  // Fetch all users with their roles (marketer, admin, and attendance_staff)
  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ["hr-attendance-users"],
    queryFn: async () => {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .eq("is_active", true)
        .order("full_name", { ascending: true });

      if (profilesError) throw profilesError;

      // Fetch user_roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Fetch attendance_staff (non-login staff)
      const { data: attendanceStaff, error: staffError } = await supabase
        .from("attendance_staff")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (staffError) throw staffError;

      // Create a map of user_id to role
      const rolesMap = new Map(roles?.map((r: any) => [r.user_id, r.role]) || []);

      // Filter only marketers and admins from profiles
      const profileUsers = (profiles || [])
        .map((profile: any) => ({
          ...profile,
          role: rolesMap.get(profile.id) || "unknown",
          staffType: "profile" as const,
        }))
        .filter((u: UserProfile) => u.role === "marketer" || u.role === "admin");

      // Map attendance_staff to same structure
      const staffUsers = (attendanceStaff || []).map((staff: any) => ({
        id: staff.id,
        username: staff.name,
        full_name: staff.name,
        idstaff: staff.ic_number,
        is_active: staff.is_active,
        role: staff.role,
        staffType: "attendance_staff" as const,
        phone: staff.phone,
        address: staff.address,
      }));

      // Combine both arrays
      return [...profileUsers, ...staffUsers];
    },
  });

  // Fetch attendance records for the selected month
  const { data: attendanceRecords = [], isLoading: isLoadingAttendance } = useQuery({
    queryKey: ["hr-attendance-records", selectedYear, selectedMonth],
    queryFn: async () => {
      const startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`;
      const endDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${daysInMonth}`;

      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate);

      if (error) throw error;
      return data || [];
    },
  });

  // Create attendance map for quick lookup
  const attendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceStatus>();
    attendanceRecords.forEach((record: AttendanceRecord) => {
      const key = `${record.user_id}-${record.date}`;
      map.set(key, record.status as AttendanceStatus);
    });
    return map;
  }, [attendanceRecords]);

  // Toggle attendance mutation
  const toggleAttendanceMutation = useMutation({
    mutationFn: async (data: { userId: string; date: string; currentStatus: AttendanceStatus }) => {
      const { userId, date, currentStatus } = data;

      // Cycle through: null -> present -> absent -> null
      let newStatus: AttendanceStatus;
      if (currentStatus === null) {
        newStatus = "present";
      } else if (currentStatus === "present") {
        newStatus = "absent";
      } else {
        newStatus = null;
      }

      if (newStatus === null) {
        // Delete the record
        const { error } = await supabase
          .from("attendance")
          .delete()
          .eq("user_id", userId)
          .eq("date", date);

        if (error) throw error;
      } else {
        // Upsert the record
        const { error } = await supabase
          .from("attendance")
          .upsert({
            user_id: userId,
            date: date,
            status: newStatus,
          }, {
            onConflict: "user_id,date",
          });

        if (error) throw error;
      }

      return { userId, date, newStatus };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-attendance-records", selectedYear, selectedMonth] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update attendance");
    },
  });

  // Filter users based on role
  const filteredUsers = users.filter((user: UserProfile) => {
    return roleFilter === "all" || user.role === roleFilter;
  });

  // Get attendance status for a user on a specific day
  const getAttendanceStatus = (userId: string, day: number): AttendanceStatus => {
    const date = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const key = `${userId}-${date}`;
    return attendanceMap.get(key) || null;
  };

  // Handle click on attendance cell
  const handleAttendanceClick = (userId: string, day: number) => {
    const date = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const currentStatus = getAttendanceStatus(userId, day);
    toggleAttendanceMutation.mutate({ userId, date, currentStatus });
  };

  // Count attendance for a user
  const countAttendance = (userId: string) => {
    let present = 0;
    let absent = 0;

    daysArray.forEach((day) => {
      const status = getAttendanceStatus(userId, day);
      if (status === "present") present++;
      else if (status === "absent") absent++;
    });

    return { present, absent };
  };

  // Navigate to previous/next month
  const goToPreviousMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  // Get day name abbreviation
  const getDayName = (day: number) => {
    const date = new Date(selectedYear, selectedMonth, day);
    return format(date, "EEE").charAt(0);
  };

  const isLoading = isLoadingUsers || isLoadingAttendance;

  // Handle edit staff
  const handleEditStaff = (user: UserProfile) => {
    setSelectedStaff({
      id: user.id,
      name: user.full_name,
      ic_number: user.idstaff,
      phone: user.phone || null,
      address: user.address || null,
      role: user.role || "",
    });
    setShowEditStaffModal(true);
  };

  // Handle delete staff
  const handleDeleteStaff = (user: UserProfile) => {
    setSelectedStaff({
      id: user.id,
      name: user.full_name,
      ic_number: user.idstaff,
      phone: user.phone || null,
      address: user.address || null,
      role: user.role || "",
    });
    setShowDeleteStaffDialog(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Attendance</h1>
          <p className="text-muted-foreground text-sm">
            Track daily attendance for marketers and admins
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Month/Year Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month, index) => (
                    <SelectItem key={index} value={String(index)}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={goToNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Role Filter */}
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="marketer">Marketer</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="Managing Director">Managing Director</SelectItem>
                <SelectItem value="Business Support Exec">Business Support Exec</SelectItem>
                <SelectItem value="Customer Support">Customer Support</SelectItem>
                <SelectItem value="Logistic">Logistic</SelectItem>
                <SelectItem value="Multimedia">Multimedia</SelectItem>
              </SelectContent>
            </Select>

            {/* Add Staff Button */}
            <Button onClick={() => setShowAddStaffModal(true)} className="ml-2">
              <UserPlus className="h-4 w-4 mr-2" />
              Add Staff
            </Button>

            {/* Legend */}
            <div className="flex items-center gap-4 ml-auto text-sm">
              <div className="flex items-center gap-1">
                <div className="w-6 h-6 rounded bg-green-100 flex items-center justify-center">
                  <Check className="h-4 w-4 text-green-600" />
                </div>
                <span className="text-muted-foreground">Present</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-6 h-6 rounded bg-red-100 flex items-center justify-center">
                  <X className="h-4 w-4 text-red-600" />
                </div>
                <span className="text-muted-foreground">Absent</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-6 h-6 rounded bg-gray-100"></div>
                <span className="text-muted-foreground">Not Marked</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Grid */}
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 sticky left-0 bg-background z-10 min-w-[180px]">Employee</th>
                    <th className="text-center p-1 bg-muted/30 min-w-[50px]">Role</th>
                    {daysArray.map((day) => (
                      <th
                        key={day}
                        className={`text-center p-1 min-w-[32px] ${isWeekend(day) ? "bg-gray-100" : ""}`}
                      >
                        <div className="flex flex-col items-center">
                          <span className="text-xs text-muted-foreground">{getDayName(day)}</span>
                          <span className="font-medium">{day}</span>
                        </div>
                      </th>
                    ))}
                    <th className="text-center p-1 bg-green-50 min-w-[40px]">P</th>
                    <th className="text-center p-1 bg-red-50 min-w-[40px]">A</th>
                    <th className="text-center p-1 min-w-[70px]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((user: UserProfile) => {
                      const { present, absent } = countAttendance(user.id);
                      return (
                        <tr key={user.id} className="border-b hover:bg-muted/30">
                          <td className="p-2 sticky left-0 bg-background z-10">
                            <div>
                              <p className="font-medium">{user.full_name}</p>
                              <p className="text-xs text-muted-foreground">{user.idstaff || user.username}</p>
                            </div>
                          </td>
                          <td className="text-center p-1">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              user.role === "marketer" ? "bg-blue-100 text-blue-800" :
                              user.role === "admin" ? "bg-purple-100 text-purple-800" :
                              user.role === "Managing Director" ? "bg-amber-100 text-amber-800" :
                              user.role === "Business Support Exec" ? "bg-green-100 text-green-800" :
                              user.role === "Customer Support" ? "bg-pink-100 text-pink-800" :
                              user.role === "Logistic" ? "bg-orange-100 text-orange-800" :
                              user.role === "Multimedia" ? "bg-cyan-100 text-cyan-800" :
                              "bg-gray-100 text-gray-800"
                            }`}>
                              {user.role}
                            </span>
                          </td>
                          {daysArray.map((day) => {
                            const status = getAttendanceStatus(user.id, day);
                            const weekend = isWeekend(day);
                            return (
                              <td
                                key={day}
                                className={`text-center p-1 ${weekend ? "bg-gray-50" : ""}`}
                              >
                                <button
                                  onClick={() => handleAttendanceClick(user.id, day)}
                                  disabled={toggleAttendanceMutation.isPending}
                                  className={`w-7 h-7 rounded transition-colors flex items-center justify-center ${
                                    status === "present"
                                      ? "bg-green-100 hover:bg-green-200"
                                      : status === "absent"
                                      ? "bg-red-100 hover:bg-red-200"
                                      : "bg-gray-100 hover:bg-gray-200"
                                  }`}
                                >
                                  {status === "present" && <Check className="h-4 w-4 text-green-600" />}
                                  {status === "absent" && <X className="h-4 w-4 text-red-600" />}
                                </button>
                              </td>
                            );
                          })}
                          <td className="text-center p-1 bg-green-50 font-bold text-green-700">{present}</td>
                          <td className="text-center p-1 bg-red-50 font-bold text-red-700">{absent}</td>
                          <td className="text-center p-1">
                            {user.staffType === "attendance_staff" ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleEditStaff(user)}
                                  className="p-1 rounded hover:bg-blue-100 text-blue-600"
                                  title="Edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteStaff(user)}
                                  className="p-1 rounded hover:bg-red-100 text-red-600"
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={daysInMonth + 5} className="text-center py-12 text-muted-foreground">
                        No employees found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Staff Modal */}
      <AddAttendanceStaffModal
        open={showAddStaffModal}
        onOpenChange={setShowAddStaffModal}
      />

      {/* Edit Staff Modal */}
      <EditAttendanceStaffModal
        open={showEditStaffModal}
        onOpenChange={setShowEditStaffModal}
        staff={selectedStaff}
      />

      {/* Delete Staff Dialog */}
      <DeleteAttendanceStaffDialog
        open={showDeleteStaffDialog}
        onOpenChange={setShowDeleteStaffDialog}
        staff={selectedStaff}
      />
    </div>
  );
};

export default HRAttendance;
