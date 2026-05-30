import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, ChevronLeft, ChevronRight, FileText, DollarSign, Users, Pencil, Save } from "lucide-react";
import { getDaysInMonth, getDay } from "date-fns";
import { toast } from "sonner";

// Salary hierarchy by role
const SALARY_HIERARCHY: Record<string, number> = {
  "Managing Director": 7000,
  "Business Support Exec": 1700,
  "Multimedia": 1500,
  "Customer Support": 1200,
  "marketer": 1500,
  "admin": 1200,
  "Logistic": 1000,
};

// Hardcoded role overrides (idstaff -> role)
const ROLE_OVERRIDES: Record<string, string> = {
  "MR-001": "Managing Director", // Muhammad Fahmi Bin Ramelan
};

// Fighter ROAS commission table
const FIGHTER_ROAS_COMMISSION: { minRoas: number; percent: number }[] = [
  { minRoas: 2.8, percent: 10 },
  { minRoas: 2.7, percent: 8 },
  { minRoas: 2.6, percent: 6 },
  { minRoas: 2.5, percent: 4 },
  { minRoas: 2.4, percent: 2 },
  { minRoas: 2.2, percent: 0 },
];

interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  idstaff: string | null;
  is_active: boolean;
  role?: string;
  staff_type?: string;
  staffType?: "profile" | "attendance_staff";
  phone?: string | null;
  ic_number?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
}

interface AttendanceRecord {
  id: string;
  user_id: string;
  date: string;
  status: "present" | "absent" | null;
}

interface PNLConfig {
  id: string;
  role: string;
  min_gross_profit: number;
  max_gross_profit: number | null;
  commission_percent: number;
  bonus_amount: number;
}

interface SalaryOverride {
  id: string;
  user_id: string;
  year: number;
  month: number;
  basic_salary: number | null;
  allowance: number;
  commission: number | null;
  bonus: number | null;
  leave_deduction_mode: 'auto' | 'manual';
  leave_deduction_amount: number;
  leave_entitlement: number;
  leave_taken: number;
  remark_basic: string | null;
  remark_allowance: string | null;
  remark_commission: string | null;
  remark_bonus: string | null;
  remark_leave: string | null;
  notes: string | null;
}

const AccountSalary = () => {
  const queryClient = useQueryClient();
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth());

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editBasicSalary, setEditBasicSalary] = useState("");
  const [editAllowance, setEditAllowance] = useState("");
  const [editCommission, setEditCommission] = useState("");
  const [editBonus, setEditBonus] = useState("");
  const [editLeaveMode, setEditLeaveMode] = useState<'auto' | 'manual'>('auto');
  const [editLeaveAmount, setEditLeaveAmount] = useState("");
  const [editLeaveEntitlement, setEditLeaveEntitlement] = useState("");
  const [editLeaveTaken, setEditLeaveTaken] = useState("");
  const [editRemarkBasic, setEditRemarkBasic] = useState("");
  const [editRemarkAllowance, setEditRemarkAllowance] = useState("");
  const [editRemarkCommission, setEditRemarkCommission] = useState("");
  const [editRemarkBonus, setEditRemarkBonus] = useState("");
  const [editRemarkLeave, setEditRemarkLeave] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");

  // Generate years for dropdown
  const years = Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - 2 + i);

  // Months array
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Get days in selected month
  const daysInMonth = getDaysInMonth(new Date(selectedYear, selectedMonth));
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Check if a day is weekend
  const isWeekend = (day: number) => {
    const date = new Date(selectedYear, selectedMonth, day);
    const dayOfWeek = getDay(date);
    return dayOfWeek === 0 || dayOfWeek === 6;
  };

  // Total days in month (counts ALL days to match HRAttendance)
  const workingDaysInMonth = useMemo(() => {
    return daysInMonth;
  }, [daysInMonth]);

  // Fetch all users (HQ staff only from profiles + attendance_staff)
  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ["salary-users"],
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

      // Fetch attendance_staff
      const { data: attendanceStaff, error: staffError } = await supabase
        .from("attendance_staff")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (staffError) throw staffError;

      // Create a map of user_id to role
      const rolesMap = new Map(roles?.map((r: any) => [r.user_id, r.role]) || []);

      // Filter marketers and admins from profiles (including Fighter)
      const profileUsers = (profiles || [])
        .map((profile: any) => {
          const baseRole = rolesMap.get(profile.id) || "unknown";
          // Apply role override if exists (e.g., MR-001 is Managing Director)
          const role = ROLE_OVERRIDES[profile.idstaff] || baseRole;
          return {
            ...profile,
            role,
            staffType: "profile" as const,
          };
        })
        .filter((u: UserProfile) =>
          (u.role === "marketer" || u.role === "admin" || u.role === "Managing Director")
        );

      // Map attendance_staff
      const staffUsers = (attendanceStaff || []).map((staff: any) => ({
        id: staff.id,
        username: staff.name,
        full_name: staff.name,
        idstaff: staff.ic_number,
        ic_number: staff.ic_number,
        is_active: staff.is_active,
        role: staff.role,
        staffType: "attendance_staff" as const,
        phone: staff.phone,
        bank_name: staff.bank_name,
        bank_account: staff.bank_account,
      }));

      return [...profileUsers, ...staffUsers];
    },
  });

  // Fetch attendance records for the selected month
  const { data: attendanceRecords = [], isLoading: isLoadingAttendance } = useQuery({
    queryKey: ["salary-attendance", selectedYear, selectedMonth],
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

  // Fetch PNL configs
  const { data: pnlConfigs = [], isLoading: isLoadingPNL } = useQuery({
    queryKey: ["salary-pnl-configs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pnl_config")
        .select("*")
        .eq("role", "marketer")
        .order("min_gross_profit", { ascending: true });

      if (error) throw error;
      return (data || []) as PNLConfig[];
    },
  });

  // Fetch salary overrides for the selected month
  const { data: overrides = [] } = useQuery({
    queryKey: ["salary-overrides", selectedYear, selectedMonth],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("salary_overrides")
        .select("*")
        .eq("year", selectedYear)
        .eq("month", selectedMonth);
      if (error) throw error;
      return (data || []) as SalaryOverride[];
    },
  });

  // Build a quick lookup map by user_id
  const overrideMap = useMemo(() => {
    const map = new Map<string, SalaryOverride>();
    for (const o of overrides) map.set(o.user_id, o);
    return map;
  }, [overrides]);

  // Fetch orders (for collection calculation) - use fetchAllRows to bypass server row limit
  const { data: ordersData = [], isLoading: isLoadingOrders } = useQuery({
    queryKey: ["salary-orders", selectedYear, selectedMonth],
    queryFn: async () => {
      const startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`;
      const endDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${daysInMonth}`;

      return await fetchAllRows(() =>
        (supabase as any)
          .from("customer_purchases")
          .select("id, marketer_id_staff, total_sale, seo, date_order, cost_baseproduct, cost_postage, jenis_platform")
          .gte("date_order", startDate)
          .lte("date_order", endDate)
      );
    },
  });

  // Fetch spends - use fetchAllRows to bypass server row limit
  const { data: spendsData = [], isLoading: isLoadingSpends } = useQuery({
    queryKey: ["salary-spends", selectedYear, selectedMonth],
    queryFn: async () => {
      const startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`;
      const endDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${daysInMonth}`;

      return await fetchAllRows(() =>
        (supabase as any)
          .from("spends")
          .select("id, marketer_id_staff, total_spend, tarikh_spend")
          .gte("tarikh_spend", startDate)
          .lte("tarikh_spend", endDate)
      );
    },
  });

  // Calculate total company collection
  const totalCompanyCollection = useMemo(() => {
    return ordersData
      .filter((order: any) => order.seo === "Successful Delivery")
      .reduce((sum: number, order: any) => sum + (Number(order.total_sale) || 0), 0);
  }, [ordersData]);

  // Count attendance for a user (matches HRAttendance logic - counts ALL days)
  const countAttendance = (userId: string) => {
    let present = 0;
    let absent = 0;

    daysArray.forEach((day) => {
      const date = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const record = attendanceRecords.find(
        (r: AttendanceRecord) => r.user_id === userId && r.date === date
      );

      if (record?.status === "present") present++;
      else if (record?.status === "absent") absent++;
    });

    return { present, absent, totalWorking: present + absent };
  };

  // Calculate marketer stats (collection, spend, cost product, postage, gross profit, ROAS)
  const getMarketerStats = (idStaff: string) => {
    const marketerOrders = ordersData.filter((order: any) => order.marketer_id_staff === idStaff);
    const successOrders = marketerOrders.filter((order: any) => order.seo === "Successful Delivery");

    const collection = successOrders
      .reduce((sum: number, order: any) => sum + (Number(order.total_sale) || 0), 0);

    const totalSpend = spendsData
      .filter((spend: any) => spend.marketer_id_staff === idStaff)
      .reduce((sum: number, spend: any) => sum + (Number(spend.total_spend) || 0), 0);

    // Cost product always applies. Shopee/Tiktok postage = settlement fees (abs).
    const costProduct = marketerOrders
      .reduce((sum: number, order: any) => sum + (Number(order.cost_baseproduct) || 0), 0);

    const postage = marketerOrders
      .reduce((sum: number, order: any) => {
        const platform = order.jenis_platform;
        return sum + ((platform === 'Shopee' || platform === 'Tiktok')
          ? Math.abs(Number(order.cost_postage) || 0)
          : (Number(order.cost_postage) || 0));
      }, 0);

    const grossProfit = collection - totalSpend - costProduct - postage;
    const roas = totalSpend > 0 ? collection / totalSpend : 0;

    return { collection, totalSpend, costProduct, postage, grossProfit, roas };
  };

  // Calculate commission/bonus from PNL config based on gross profit
  const calculatePNLCommissionBonus = (grossProfit: number) => {
    const matchingConfig = pnlConfigs.find(config => {
      return grossProfit >= config.min_gross_profit &&
        (config.max_gross_profit === null || grossProfit <= config.max_gross_profit);
    });

    if (matchingConfig) {
      const commission = (grossProfit * matchingConfig.commission_percent) / 100;
      return { commission, bonus: matchingConfig.bonus_amount };
    }
    return { commission: 0, bonus: 0 };
  };

  // Calculate Fighter commission based on ROAS table
  const calculateFighterCommission = (collection: number, roas: number) => {
    const tier = FIGHTER_ROAS_COMMISSION.find(t => roas >= t.minRoas);
    if (tier) {
      return { commission: (collection * tier.percent) / 100, percent: tier.percent };
    }
    return { commission: 0, percent: 0 };
  };

  // Calculate salary for a user
  const calculateSalary = (user: UserProfile) => {
    const baseSalary = SALARY_HIERARCHY[user.role || ""] || 1200;
    const { present, totalWorking } = countAttendance(user.id);
    const override = overrideMap.get(user.id);

    // Basic salary calculation
    // Managing Director gets full salary without attendance calculation
    // If leave_deduction_mode is 'manual', use full base salary (auto-deduct disabled)
    const workingDays = totalWorking > 0 ? totalWorking : workingDaysInMonth;
    let calculatedBasic: number;
    if (user.role === "Managing Director") {
      calculatedBasic = baseSalary;
    } else if (override?.leave_deduction_mode === 'manual') {
      // Manual mode: use full base salary; manual deduction applied later
      calculatedBasic = baseSalary;
    } else {
      // Auto mode: deduct based on attendance
      calculatedBasic = workingDays > 0 ? (present / workingDays) * baseSalary : 0;
    }
    // Apply override if set
    const basicSalary = override?.basic_salary != null ? Number(override.basic_salary) : calculatedBasic;
    const allowance = override?.allowance != null ? Number(override.allowance) : 0;
    const manualLeaveDeduction = override?.leave_deduction_mode === 'manual' ? Number(override.leave_deduction_amount || 0) : 0;

    let commission = 0;
    let bonus = 0;

    // Customer Support: 10% of collection from their own marketer_id_staff only
    if (user.role === "Customer Support") {
      const csCollection = ordersData
        .filter((order: any) => order.marketer_id_staff === user.idstaff && order.seo === "Successful Delivery")
        .reduce((sum: number, order: any) => sum + (Number(order.total_sale) || 0), 0);
      commission = csCollection * 0.10;
    }
    // Fighter Marketer: ROAS-based commission table
    else if (user.staff_type === "Fighter") {
      const stats = getMarketerStats(user.idstaff || "");
      const fighterResult = calculateFighterCommission(stats.collection, stats.roas);
      commission = fighterResult.commission;
      // Fighter doesn't get bonus, only commission
    }
    // HQ Marketer/Admin: Use PNL config based on gross profit
    else if ((user.role === "marketer" || user.role === "admin") && user.staff_type !== "Fighter") {
      const stats = getMarketerStats(user.idstaff || "");
      const pnlResult = calculatePNLCommissionBonus(stats.grossProfit);
      commission = pnlResult.commission;
      bonus = pnlResult.bonus;
    }
    // Managing Director: commission only (PNL based on company-wide gross profit), no bonus
    else if (user.role === "Managing Director") {
      const companySpend = spendsData.reduce((sum: number, s: any) => sum + (Number(s.total_spend) || 0), 0);
      const companyCostProduct = ordersData.reduce((sum: number, o: any) => sum + (Number(o.cost_baseproduct) || 0), 0);
      const companyPostage = ordersData.reduce((sum: number, o: any) => {
        const platform = o.jenis_platform;
        return sum + ((platform === 'Shopee' || platform === 'Tiktok')
          ? Math.abs(Number(o.cost_postage) || 0)
          : (Number(o.cost_postage) || 0));
      }, 0);
      const companyGrossProfit = totalCompanyCollection - companySpend - companyCostProduct - companyPostage;
      const pnlResult = calculatePNLCommissionBonus(companyGrossProfit);
      commission = pnlResult.commission;
    }
    // Business Support Exec, Multimedia: no commission, no bonus
    else if (["Business Support Exec", "Multimedia"].includes(user.role || "")) {
      // No commission and no bonus for these roles
    }

    // Apply override for commission/bonus if set
    if (override?.commission != null) commission = Number(override.commission);
    if (override?.bonus != null) bonus = Number(override.bonus);

    const totalEarnings = basicSalary + allowance + commission + bonus - manualLeaveDeduction;

    return {
      baseSalary,
      basicSalary,
      allowance,
      commission,
      bonus,
      manualLeaveDeduction,
      totalEarnings,
      daysWorked: present,
      totalWorkingDays: workingDays,
      hasOverride: !!override,
    };
  };

  // Open Edit Dialog for a user
  const openEditDialog = (user: UserProfile) => {
    const override = overrideMap.get(user.id);
    const salary = calculateSalary(user);

    setEditingUser(user);
    setEditBasicSalary(override?.basic_salary != null ? String(override.basic_salary) : String(salary.basicSalary.toFixed(2)));
    setEditAllowance(override?.allowance != null ? String(override.allowance) : "0");
    setEditCommission(override?.commission != null ? String(override.commission) : String(salary.commission.toFixed(2)));
    setEditBonus(override?.bonus != null ? String(override.bonus) : String(salary.bonus.toFixed(2)));
    setEditLeaveMode(override?.leave_deduction_mode || 'auto');
    setEditLeaveAmount(override?.leave_deduction_amount != null ? String(override.leave_deduction_amount) : "0");
    setEditLeaveEntitlement(override?.leave_entitlement != null ? String(override.leave_entitlement) : "0");
    setEditLeaveTaken(override?.leave_taken != null ? String(override.leave_taken) : "0");
    setEditRemarkBasic(override?.remark_basic || "");
    setEditRemarkAllowance(override?.remark_allowance || "");
    setEditRemarkCommission(override?.remark_commission || "");
    setEditRemarkBonus(override?.remark_bonus || "");
    setEditRemarkLeave(override?.remark_leave || "");
    setEditNotes(override?.notes || "");
    setEditDialogOpen(true);
  };

  const handleSaveOverride = async () => {
    if (!editingUser) return;
    setIsSaving(true);
    try {
      const payload = {
        user_id: editingUser.id,
        year: selectedYear,
        month: selectedMonth,
        basic_salary: editBasicSalary === "" ? null : Number(editBasicSalary),
        allowance: Number(editAllowance) || 0,
        commission: editCommission === "" ? null : Number(editCommission),
        bonus: editBonus === "" ? null : Number(editBonus),
        leave_deduction_mode: editLeaveMode,
        leave_deduction_amount: Number(editLeaveAmount) || 0,
        leave_entitlement: Number(editLeaveEntitlement) || 0,
        leave_taken: Number(editLeaveTaken) || 0,
        remark_basic: editRemarkBasic.trim() || null,
        remark_allowance: editRemarkAllowance.trim() || null,
        remark_commission: editRemarkCommission.trim() || null,
        remark_bonus: editRemarkBonus.trim() || null,
        remark_leave: editRemarkLeave.trim() || null,
        notes: editNotes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await (supabase as any)
        .from("salary_overrides")
        .upsert(payload, { onConflict: 'user_id,year,month' });

      if (error) throw error;
      toast.success("Salary slip updated successfully");
      setEditDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["salary-overrides", selectedYear, selectedMonth] });
    } catch (error: any) {
      toast.error(error.message || "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  // Live preview total in dialog
  const editTotal = useMemo(() => {
    const basic = Number(editBasicSalary) || 0;
    const allow = Number(editAllowance) || 0;
    const comm = Number(editCommission) || 0;
    const bon = Number(editBonus) || 0;
    const leaveDeduction = editLeaveMode === 'manual' ? (Number(editLeaveAmount) || 0) : 0;
    return basic + allow + comm + bon - leaveDeduction;
  }, [editBasicSalary, editAllowance, editCommission, editBonus, editLeaveMode, editLeaveAmount]);

  // Filter users based on role
  const filteredUsers = users.filter((user: UserProfile) => {
    if (roleFilter === "all") return true;
    if (roleFilter === "Fighter") {
      return user.staff_type === "Fighter";
    }
    if (roleFilter === "marketer") {
      // HQ marketers only (exclude Fighter)
      return user.role === "marketer" && user.staff_type !== "Fighter";
    }
    return user.role === roleFilter;
  });

  // Navigate months
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 2,
    }).format(value);
  };

  // Open salary slip in new tab
  const openSalarySlip = (userId: string) => {
    window.open(`/salary/${userId}/${selectedYear}/${selectedMonth + 1}`, '_blank');
  };

  const isLoading = isLoadingUsers || isLoadingAttendance || isLoadingPNL || isLoadingOrders || isLoadingSpends;

  // Calculate totals
  const totals = useMemo(() => {
    return filteredUsers.reduce((acc, user) => {
      const salary = calculateSalary(user);
      return {
        basicSalary: acc.basicSalary + salary.basicSalary,
        commission: acc.commission + salary.commission,
        bonus: acc.bonus + salary.bonus,
        totalEarnings: acc.totalEarnings + salary.totalEarnings,
      };
    }, { basicSalary: 0, commission: 0, bonus: 0, totalEarnings: 0 });
  }, [filteredUsers, attendanceRecords, ordersData, spendsData]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6" />
            Salary
          </h1>
          <p className="text-muted-foreground text-sm">
            View and generate salary slips for all employees
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
                <SelectItem value="marketer">Marketer HQ</SelectItem>
                <SelectItem value="Fighter">Marketer Fighter</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="Managing Director">Managing Director</SelectItem>
                <SelectItem value="Business Support Exec">Business Support Exec</SelectItem>
                <SelectItem value="Customer Support">Customer Support</SelectItem>
                <SelectItem value="Logistic">Logistic</SelectItem>
                <SelectItem value="Multimedia">Multimedia</SelectItem>
              </SelectContent>
            </Select>

            {/* Summary */}
            <div className="flex items-center gap-4 ml-auto text-sm">
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">{filteredUsers.length} employees</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Total Basic Salary</p>
            <p className="text-xl font-bold text-blue-600">{formatCurrency(totals.basicSalary)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Total Commission</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(totals.commission)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Total Bonus</p>
            <p className="text-xl font-bold text-amber-600">{formatCurrency(totals.bonus)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Total Earnings</p>
            <p className="text-xl font-bold text-purple-600">{formatCurrency(totals.totalEarnings)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Salary Table */}
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
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-semibold">Employee</th>
                    <th className="text-center p-3 font-semibold">Role</th>
                    <th className="text-center p-3 font-semibold">Days Worked</th>
                    <th className="text-right p-3 font-semibold">Basic Salary</th>
                    <th className="text-right p-3 font-semibold">Commission</th>
                    <th className="text-right p-3 font-semibold">Bonus</th>
                    <th className="text-right p-3 font-semibold">Total Earnings</th>
                    <th className="text-center p-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((user: UserProfile) => {
                      const salary = calculateSalary(user);
                      return (
                        <tr key={user.id} className="border-b hover:bg-muted/30">
                          <td className="p-3">
                            <div>
                              <p className="font-medium">{user.full_name}</p>
                              <p className="text-xs text-muted-foreground">{user.idstaff || user.username}</p>
                            </div>
                          </td>
                          <td className="text-center p-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              user.staff_type === "Fighter" ? "bg-red-100 text-red-800" :
                              user.role === "marketer" ? "bg-blue-100 text-blue-800" :
                              user.role === "admin" ? "bg-purple-100 text-purple-800" :
                              user.role === "Managing Director" ? "bg-amber-100 text-amber-800" :
                              user.role === "Business Support Exec" ? "bg-green-100 text-green-800" :
                              user.role === "Customer Support" ? "bg-pink-100 text-pink-800" :
                              user.role === "Logistic" ? "bg-orange-100 text-orange-800" :
                              user.role === "Multimedia" ? "bg-cyan-100 text-cyan-800" :
                              "bg-gray-100 text-gray-800"
                            }`}>
                              {user.staff_type === "Fighter" ? "Fighter" : user.role}
                            </span>
                          </td>
                          <td className="text-center p-3">
                            <span className="font-medium">{salary.daysWorked}</span>
                            <span className="text-muted-foreground">/{salary.totalWorkingDays}</span>
                          </td>
                          <td className="text-right p-3 font-medium">{formatCurrency(salary.basicSalary)}</td>
                          <td className="text-right p-3 font-medium text-green-600">
                            {salary.commission > 0 ? formatCurrency(salary.commission) : "-"}
                          </td>
                          <td className="text-right p-3 font-medium text-amber-600">
                            {salary.bonus > 0 ? formatCurrency(salary.bonus) : "-"}
                          </td>
                          <td className="text-right p-3 font-bold text-primary">{formatCurrency(salary.totalEarnings)}</td>
                          <td className="text-center p-3">
                            <div className="flex gap-1 justify-center">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openSalarySlip(user.id)}
                                className="gap-1"
                              >
                                <FileText className="w-4 h-4" />
                                View
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditDialog(user)}
                                className={`gap-1 ${salary.hasOverride ? 'border-purple-500 text-purple-700' : ''}`}
                                title={salary.hasOverride ? 'Has override' : 'Edit slip'}
                              >
                                <Pencil className="w-4 h-4" />
                                Edit
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-muted-foreground">
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

      {/* Edit Salary Slip Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Slip Gaji</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              {/* Employee Info */}
              <div className="bg-muted/30 rounded-lg p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-bold">{editingUser.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {editingUser.idstaff || editingUser.username} — {editingUser.role}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Items Table — left 2 cols */}
                <div className="lg:col-span-2 border rounded-lg p-3">
                  <h3 className="font-semibold mb-2">Items</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-1">Item</th>
                        <th className="text-right p-1">Amount (RM)</th>
                        <th className="text-left p-1">Remark / Adjustment</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="p-1 font-medium">Basic Salary</td>
                        <td className="p-1">
                          <Input
                            type="number"
                            step="0.01"
                            value={editBasicSalary}
                            onChange={(e) => setEditBasicSalary(e.target.value)}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            placeholder="Auto"
                            value={editRemarkBasic}
                            onChange={(e) => setEditRemarkBasic(e.target.value)}
                            className="h-8"
                          />
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-1 font-medium">Allowance</td>
                        <td className="p-1">
                          <Input
                            type="number"
                            step="0.01"
                            value={editAllowance}
                            onChange={(e) => setEditAllowance(e.target.value)}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            placeholder="Auto"
                            value={editRemarkAllowance}
                            onChange={(e) => setEditRemarkAllowance(e.target.value)}
                            className="h-8"
                          />
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-1 font-medium">Commission</td>
                        <td className="p-1">
                          <Input
                            type="number"
                            step="0.01"
                            value={editCommission}
                            onChange={(e) => setEditCommission(e.target.value)}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            placeholder="Auto"
                            value={editRemarkCommission}
                            onChange={(e) => setEditRemarkCommission(e.target.value)}
                            className="h-8"
                          />
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-1 font-medium">Bonus</td>
                        <td className="p-1">
                          <Input
                            type="number"
                            step="0.01"
                            value={editBonus}
                            onChange={(e) => setEditBonus(e.target.value)}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            placeholder="Auto"
                            value={editRemarkBonus}
                            onChange={(e) => setEditRemarkBonus(e.target.value)}
                            className="h-8"
                          />
                        </td>
                      </tr>
                      <tr className={`border-b ${editLeaveMode === 'manual' ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                        <td className="p-1 font-medium text-red-600">Leave Deduction</td>
                        <td className="p-1">
                          <Input
                            type="number"
                            step="0.01"
                            value={editLeaveAmount}
                            onChange={(e) => setEditLeaveAmount(e.target.value)}
                            disabled={editLeaveMode === 'auto'}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            placeholder={editLeaveMode === 'auto' ? 'Auto (from attendance)' : 'Manual'}
                            value={editRemarkLeave}
                            onChange={(e) => setEditRemarkLeave(e.target.value)}
                            className="h-8"
                          />
                        </td>
                      </tr>
                      <tr className="font-bold bg-muted/30">
                        <td className="p-2">Total Earnings</td>
                        <td className="p-2 text-right text-primary">
                          RM {editTotal.toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Leave Summary & Mode — right col */}
                <div className="space-y-4">
                  <div className="border rounded-lg p-3 bg-blue-50/30 dark:bg-blue-950/10">
                    <h3 className="font-semibold mb-2">Leave Summary</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Entitlement (Days)</Label>
                        <Input
                          type="number"
                          value={editLeaveEntitlement}
                          onChange={(e) => setEditLeaveEntitlement(e.target.value)}
                          className="h-7 w-20 text-right"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Taken (Days)</Label>
                        <Input
                          type="number"
                          value={editLeaveTaken}
                          onChange={(e) => setEditLeaveTaken(e.target.value)}
                          className="h-7 w-20 text-right"
                        />
                      </div>
                      <div className="flex items-center justify-between font-semibold text-green-700 dark:text-green-400">
                        <span className="text-xs">Balance (Days)</span>
                        <span>{(Number(editLeaveEntitlement) || 0) - (Number(editLeaveTaken) || 0)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-3">
                    <h3 className="font-semibold mb-2">Leave Deduction Mode</h3>
                    <RadioGroup value={editLeaveMode} onValueChange={(v) => setEditLeaveMode(v as 'auto' | 'manual')}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="auto" id="mode-auto" />
                        <Label htmlFor="mode-auto" className="cursor-pointer text-sm">
                          Auto Deduct (System)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="manual" id="mode-manual" />
                        <Label htmlFor="mode-manual" className="cursor-pointer text-sm">
                          Manual Deduction
                        </Label>
                      </div>
                    </RadioGroup>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      Pilih Manual jika dah kira sendiri (supaya sistem tak tolak lagi)
                    </p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea
                  placeholder="Additional notes about this salary adjustment..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveOverride} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountSalary;
