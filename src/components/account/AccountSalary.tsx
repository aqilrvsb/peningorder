import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronLeft, ChevronRight, FileText, DollarSign, Users } from "lucide-react";
import { getDaysInMonth, getDay } from "date-fns";

// Salary hierarchy by role
const SALARY_HIERARCHY: Record<string, number> = {
  "Managing Director": 7000,
  "Business Support Exec": 1700,
  "Multimedia": 1500,
  "Customer Support": 1200,
  "marketer": 1200,
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
  min_sales: number;
  max_sales: number | null;
  roas_min: number;
  roas_max: number;
  commission_percent: number;
  bonus_amount: number;
}

const AccountSalary = () => {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth());
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
        .order("min_sales", { ascending: true });

      if (error) throw error;
      return (data || []) as PNLConfig[];
    },
  });

  // Fetch orders (for collection calculation)
  const { data: ordersData = [], isLoading: isLoadingOrders } = useQuery({
    queryKey: ["salary-orders", selectedYear, selectedMonth],
    queryFn: async () => {
      const startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`;
      const endDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${daysInMonth}`;

      const { data, error } = await (supabase as any)
        .from("customer_purchases")
        .select("id, marketer_id_staff, total_sale, seo, date_order")
        .gte("date_order", startDate)
        .lte("date_order", endDate);

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch spends
  const { data: spendsData = [], isLoading: isLoadingSpends } = useQuery({
    queryKey: ["salary-spends", selectedYear, selectedMonth],
    queryFn: async () => {
      const startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`;
      const endDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${daysInMonth}`;

      const { data, error } = await (supabase as any)
        .from("spends")
        .select("id, marketer_id_staff, total_spend, tarikh_spend")
        .gte("tarikh_spend", startDate)
        .lte("tarikh_spend", endDate);

      if (error) throw error;
      return data || [];
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

  // Calculate marketer stats (collection, spend, ROAS)
  const getMarketerStats = (idStaff: string) => {
    const collection = ordersData
      .filter((order: any) => order.marketer_id_staff === idStaff && order.seo === "Successful Delivery")
      .reduce((sum: number, order: any) => sum + (Number(order.total_sale) || 0), 0);

    const totalSpend = spendsData
      .filter((spend: any) => spend.marketer_id_staff === idStaff)
      .reduce((sum: number, spend: any) => sum + (Number(spend.total_spend) || 0), 0);

    const roas = totalSpend > 0 ? collection / totalSpend : 0;

    return { collection, totalSpend, roas };
  };

  // Calculate commission/bonus from PNL config (for HQ marketers)
  const calculatePNLCommissionBonus = (collection: number, roas: number) => {
    const matchingConfig = pnlConfigs.find(config => {
      const salesMatch = collection >= config.min_sales &&
        (config.max_sales === null || collection <= config.max_sales);
      const roasMatch = roas >= config.roas_min && roas <= config.roas_max;
      return salesMatch && roasMatch;
    });

    if (matchingConfig) {
      const commission = (collection * matchingConfig.commission_percent) / 100;
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

    // Basic salary calculation
    const workingDays = totalWorking > 0 ? totalWorking : workingDaysInMonth;
    const basicSalary = workingDays > 0 ? (present / workingDays) * baseSalary : 0;

    let commission = 0;
    let bonus = 0;

    // Customer Support: 10% of company collection
    if (user.role === "Customer Support") {
      commission = totalCompanyCollection * 0.10;
    }
    // Fighter Marketer: ROAS-based commission table
    else if (user.staff_type === "Fighter") {
      const stats = getMarketerStats(user.idstaff || "");
      const fighterResult = calculateFighterCommission(stats.collection, stats.roas);
      commission = fighterResult.commission;
      // Fighter doesn't get bonus, only commission
    }
    // HQ Marketer/Admin: Use PNL config
    else if ((user.role === "marketer" || user.role === "admin") && user.staff_type !== "Fighter") {
      const stats = getMarketerStats(user.idstaff || "");
      const pnlResult = calculatePNLCommissionBonus(stats.collection, stats.roas);
      commission = pnlResult.commission;
      bonus = pnlResult.bonus;
    }
    // Managing Director, Business Support Exec, Multimedia: PNL based
    else if (["Managing Director", "Business Support Exec", "Multimedia"].includes(user.role || "")) {
      // These roles get bonus/commission from overall company performance
      // Using the highest qualifying tier based on company collection
      const companyRoas = spendsData.reduce((sum: number, s: any) => sum + (Number(s.total_spend) || 0), 0);
      const roas = companyRoas > 0 ? totalCompanyCollection / companyRoas : 0;
      const pnlResult = calculatePNLCommissionBonus(totalCompanyCollection, roas);
      commission = pnlResult.commission;
      bonus = pnlResult.bonus;
    }

    const totalEarnings = basicSalary + commission + bonus;

    return {
      baseSalary,
      basicSalary,
      commission,
      bonus,
      totalEarnings,
      daysWorked: present,
      totalWorkingDays: workingDays,
    };
  };

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
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openSalarySlip(user.id)}
                              className="gap-1"
                            >
                              <FileText className="w-4 h-4" />
                              View Slip
                            </Button>
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
    </div>
  );
};

export default AccountSalary;
