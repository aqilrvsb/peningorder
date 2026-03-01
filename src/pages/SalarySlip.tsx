import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/utils";
import { getDaysInMonth, getDay, format } from "date-fns";
import dziLogo from "/dzi-logo.jpg";
import signature from "/signature.jpg";

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
  ic_number?: string | null;
  phone?: string | null;
  role?: string;
  staff_type?: string;
  staffType?: "profile" | "attendance_staff";
  bank_name?: string | null;
  bank_account?: string | null;
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

const SalarySlip = () => {
  const { userId, year, month } = useParams();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [attendanceData, setAttendanceData] = useState({ present: 0, absent: 0, totalWorking: 0 });
  const [ordersData, setOrdersData] = useState<any[]>([]);
  const [spendsData, setSpendsData] = useState<any[]>([]);
  const [pnlConfigs, setPnlConfigs] = useState<PNLConfig[]>([]);
  const [totalCompanyCollection, setTotalCompanyCollection] = useState(0);
  const [totalCompanySpend, setTotalCompanySpend] = useState(0);
  const [staffDbData, setStaffDbData] = useState<{
    ic_number?: string;
    phone?: string;
    department?: string;
    employment_type?: string;
    bank_name?: string;
    bank_account?: string;
  } | null>(null);

  const selectedYear = parseInt(year || String(new Date().getFullYear()));
  const selectedMonth = parseInt(month || String(new Date().getMonth() + 1)) - 1;
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

  useEffect(() => {
    const fetchData = async () => {
      if (!userId || !year || !month) return;

      try {
        // Fetch user data - first try profiles, then attendance_staff
        let userData: UserProfile | null = null;
        let userRole = "";

        // Try profiles first
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (profile) {
          // Get role from user_roles
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .single();

          const baseRole = roleData?.role || "unknown";
          // Apply role override if exists (e.g., MR-001 is Managing Director)
          userRole = ROLE_OVERRIDES[profile.idstaff] || baseRole;
          userData = {
            ...profile,
            role: userRole,
            staffType: "profile",
          };
        } else {
          // Try attendance_staff
          const { data: staffData, error: staffError } = await supabase
            .from("attendance_staff")
            .select("*")
            .eq("id", userId)
            .single();

          if (staffData) {
            userData = {
              id: staffData.id,
              username: staffData.name,
              full_name: staffData.name,
              idstaff: staffData.ic_number,
              ic_number: staffData.ic_number,
              is_active: staffData.is_active,
              role: staffData.role,
              staffType: "attendance_staff",
              phone: staffData.phone,
              bank_name: staffData.bank_name,
              bank_account: staffData.bank_account,
            };
            userRole = staffData.role;
          }
        }

        if (!userData) {
          setLoading(false);
          return;
        }

        setUser(userData);

        // Fetch staff_database details for display
        const { data: staffDb } = await supabase
          .from("staff_database")
          .select("no_kad_pengenalan, no_telefon, jawatan, employment_type, nama_bank, no_akaun")
          .eq("nama", userData.full_name)
          .limit(1)
          .maybeSingle();

        if (staffDb) {
          setStaffDbData({
            ic_number: staffDb.no_kad_pengenalan || undefined,
            phone: staffDb.no_telefon || undefined,
            department: staffDb.jawatan || undefined,
            employment_type: staffDb.employment_type || undefined,
            bank_name: staffDb.nama_bank || undefined,
            bank_account: staffDb.no_akaun || undefined,
          });
        }

        // Date range
        const startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`;
        const endDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${daysInMonth}`;

        // Fetch attendance records
        const { data: attendance } = await supabase
          .from("attendance")
          .select("*")
          .eq("user_id", userId)
          .gte("date", startDate)
          .lte("date", endDate);

        // Count attendance (matches HRAttendance logic - counts ALL days)
        let present = 0;
        let absent = 0;
        daysArray.forEach((day) => {
          const date = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const record = (attendance || []).find((r: any) => r.date === date);
          if (record?.status === "present") present++;
          else if (record?.status === "absent") absent++;
        });
        setAttendanceData({ present, absent, totalWorking: present + absent });

        // Fetch orders for collection - use fetchAllRows to bypass server row limit
        const orders = await fetchAllRows(() =>
          (supabase as any)
            .from("customer_purchases")
            .select("id, marketer_id_staff, total_sale, seo, date_order")
            .gte("date_order", startDate)
            .lte("date_order", endDate)
        );

        setOrdersData(orders || []);

        // Calculate total company collection
        const companyCollection = (orders || [])
          .filter((order: any) => order.seo === "Successful Delivery")
          .reduce((sum: number, order: any) => sum + (Number(order.total_sale) || 0), 0);
        setTotalCompanyCollection(companyCollection);

        // Fetch spends - use fetchAllRows to bypass server row limit
        const spends = await fetchAllRows(() =>
          (supabase as any)
            .from("spends")
            .select("id, marketer_id_staff, total_spend, tarikh_spend")
            .gte("tarikh_spend", startDate)
            .lte("tarikh_spend", endDate)
        );

        setSpendsData(spends || []);

        // Calculate total company spend
        const companySpend = (spends || [])
          .reduce((sum: number, spend: any) => sum + (Number(spend.total_spend) || 0), 0);
        setTotalCompanySpend(companySpend);

        // Fetch PNL configs
        const { data: pnl } = await (supabase as any)
          .from("pnl_config")
          .select("*")
          .eq("role", "marketer")
          .order("min_sales", { ascending: true });

        setPnlConfigs(pnl || []);

      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId, year, month, selectedYear, selectedMonth, daysInMonth]);

  // Calculate marketer stats
  const getMarketerStats = () => {
    if (!user?.idstaff) return { collection: 0, totalSpend: 0, roas: 0 };

    const collection = ordersData
      .filter((order: any) => order.marketer_id_staff === user.idstaff && order.seo === "Successful Delivery")
      .reduce((sum: number, order: any) => sum + (Number(order.total_sale) || 0), 0);

    const totalSpend = spendsData
      .filter((spend: any) => spend.marketer_id_staff === user.idstaff)
      .reduce((sum: number, spend: any) => sum + (Number(spend.total_spend) || 0), 0);

    const roas = totalSpend > 0 ? collection / totalSpend : 0;

    return { collection, totalSpend, roas };
  };

  // Calculate PNL commission/bonus
  const calculatePNLCommissionBonus = (collection: number, roas: number) => {
    const matchingConfig = pnlConfigs.find(config => {
      const salesMatch = collection >= config.min_sales &&
        (config.max_sales === null || collection <= config.max_sales);
      const roasMatch = roas >= config.roas_min && roas <= config.roas_max;
      return salesMatch && roasMatch;
    });

    if (matchingConfig) {
      const commission = (collection * matchingConfig.commission_percent) / 100;
      return { commission, bonus: matchingConfig.bonus_amount, percent: matchingConfig.commission_percent };
    }
    return { commission: 0, bonus: 0, percent: 0 };
  };

  // Calculate Fighter commission based on ROAS
  const calculateFighterCommission = (collection: number, roas: number) => {
    const tier = FIGHTER_ROAS_COMMISSION.find(t => roas >= t.minRoas);
    if (tier) {
      return { commission: (collection * tier.percent) / 100, percent: tier.percent };
    }
    return { commission: 0, percent: 0 };
  };

  // Calculate salary
  const calculateSalary = () => {
    if (!user) return { basicSalary: 0, commission: 0, bonus: 0, totalEarnings: 0 };

    const baseSalary = SALARY_HIERARCHY[user.role || ""] || 1200;
    const { present, totalWorking } = attendanceData;

    // Basic salary calculation
    // Managing Director gets full salary without attendance calculation
    const workingDays = totalWorking > 0 ? totalWorking : workingDaysInMonth;
    const basicSalary = user.role === "Managing Director"
      ? baseSalary
      : (workingDays > 0 ? (present / workingDays) * baseSalary : 0);

    let commission = 0;
    let bonus = 0;
    let commissionPercent = 0;

    // Customer Support: 10% of their own collection
    if (user.role === "Customer Support") {
      const csCollection = ordersData
        .filter((order: any) => order.marketer_id_staff === user.idstaff && order.seo === "Successful Delivery")
        .reduce((sum: number, order: any) => sum + (Number(order.total_sale) || 0), 0);
      commission = csCollection * 0.10;
      commissionPercent = 10;
    }
    // Fighter (non-HQ marketer): ROAS-based commission
    else if (user.staff_type === "Fighter") {
      const stats = getMarketerStats();
      const fighterResult = calculateFighterCommission(stats.collection, stats.roas);
      commission = fighterResult.commission;
      commissionPercent = fighterResult.percent;
    }
    // HQ Marketer/Admin: Use PNL config
    else if ((user.role === "marketer" || user.role === "admin") && user.staff_type !== "Fighter") {
      const stats = getMarketerStats();
      const pnlResult = calculatePNLCommissionBonus(stats.collection, stats.roas);
      commission = pnlResult.commission;
      bonus = pnlResult.bonus;
      commissionPercent = pnlResult.percent;
    }
    // Managing Director: commission only (PNL based), no bonus
    else if (user.role === "Managing Director") {
      const roas = totalCompanySpend > 0 ? totalCompanyCollection / totalCompanySpend : 0;
      const pnlResult = calculatePNLCommissionBonus(totalCompanyCollection, roas);
      commission = pnlResult.commission;
      commissionPercent = pnlResult.percent;
    }
    // Business Support Exec, Multimedia: no commission, no bonus
    else if (["Business Support Exec", "Multimedia"].includes(user.role || "")) {
      // No commission and no bonus for these roles
    }

    const totalEarnings = basicSalary + commission + bonus;

    return {
      baseSalary,
      basicSalary,
      commission,
      commissionPercent,
      bonus,
      totalEarnings,
      daysWorked: present,
      totalWorkingDays: workingDays,
    };
  };

  const salary = calculateSalary();
  const marketerStats = getMarketerStats();

  const downloadPDF = () => {
    window.print();
  };

  const formatCurrency = (value: number) => {
    return `RM ${value.toFixed(2)}`;
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-lg">Loading salary slip...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-lg text-red-600">Employee not found</p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
        @media print {
          body {
            margin: 0 !important;
            padding: 0 !important;
          }
          html, body {
            width: 210mm;
            height: 297mm;
          }
          * {
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
      <div className="min-h-screen bg-white p-8 flex justify-center print:p-4">
        {/* Download PDF Button */}
        <button
          onClick={downloadPDF}
          className="print:hidden fixed top-4 right-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download PDF
        </button>

        <div
          className="w-full max-w-[210mm] bg-white"
          style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", color: 'black' }}
        >
          {/* Header Section */}
          <div className="flex items-start gap-4 mb-8">
            <img
              src={dziLogo}
              alt="DZI Holistik Logo"
              className="w-28 h-auto object-contain"
            />
            <div>
              <h1 className="text-2xl font-bold text-black tracking-wide mb-1">
                DZI HOLISTIK ENTERPRISE
              </h1>
              <p className="text-sm text-black leading-relaxed">
                PT 2811, TINGKAT 1 TAMAN D'SAID KG PADANG LANDAK, MUKIM PELAGAT,
              </p>
              <p className="text-sm text-black">22000 JERTEH, TERENGGANU</p>
              <p className="text-sm text-black">TEL: 016-2569963 (HR)</p>
            </div>
          </div>

          {/* Employee Details Section */}
          <div className="mb-8 space-y-2">
            <div className="flex">
              <span className="w-52 text-sm text-black">Month</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
                {monthNames[selectedMonth]} {selectedYear}
              </span>
            </div>
            <div className="flex">
              <span className="w-52 text-sm text-black">Employee Name</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
                {user.full_name}
              </span>
            </div>
            <div className="flex">
              <span className="w-52 text-sm text-black">Identification Card Number</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
                {staffDbData?.ic_number || user.ic_number || user.idstaff || "-"}
              </span>
            </div>
            <div className="flex">
              <span className="w-52 text-sm text-black">Phone Number</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
                {staffDbData?.phone || user.phone || "-"}
              </span>
            </div>
            <div className="flex">
              <span className="w-52 text-sm text-black">Department</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
                {staffDbData?.department || user.role || "-"}
              </span>
            </div>
            <div className="flex">
              <span className="w-52 text-sm text-black">Employment Type</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
                {staffDbData?.employment_type || "Full Time"}
              </span>
            </div>
            <div className="flex">
              <span className="w-52 text-sm text-black">Pay Date</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
                {format(new Date(), "dd/MM/yyyy")}
              </span>
            </div>
          </div>

          {/* Earnings Section */}
          <div className="mb-6">
            <h2 className="text-sm font-bold text-black mb-2">EARNINGS</h2>
            <table className="w-full border-collapse border border-black">
              <thead>
                <tr className="bg-[#d4a853]">
                  <th className="border border-black py-2 px-4 text-center text-sm font-bold text-white w-3/4">
                    DESCRIPTION
                  </th>
                  <th className="border border-black py-2 px-4 text-center text-sm font-bold text-white w-1/4">
                    AMOUNT
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Basic Salary */}
                <tr>
                  <td className="border border-black py-3 px-4 text-sm text-black font-semibold">
                    BASIC SALARY
                    <span className="font-normal text-gray-600 ml-2">
                      {user?.role === "Managing Director"
                        ? "(Full Salary)"
                        : `(${salary.daysWorked} days / ${salary.totalWorkingDays} days x ${formatCurrency(salary.baseSalary)})`
                      }
                    </span>
                  </td>
                  <td className="border border-black py-3 px-4 text-sm text-black text-right">
                    {formatCurrency(salary.basicSalary)}
                  </td>
                </tr>
                {/* Performance Bonus */}
                <tr>
                  <td className="border border-black py-3 px-4 text-sm text-black font-semibold">
                    PERFORMANCE BONUS
                  </td>
                  <td className="border border-black py-3 px-4 text-sm text-black text-right">
                    {salary.bonus > 0 ? formatCurrency(salary.bonus) : "-"}
                  </td>
                </tr>
                {/* Commissions */}
                <tr>
                  <td className="border border-black py-3 px-4 text-sm text-black font-semibold">
                    COMMISSIONS
                    {salary.commission > 0 && (
                      <span className="font-normal text-gray-600 ml-2">
                        ({salary.commissionPercent}%
                        {user?.role === "Customer Support" && " of Own Collection"}
                        {(user?.role === "marketer" || user?.role === "admin") && ` of Collection - ROAS: ${marketerStats.roas.toFixed(2)}`}
                        )
                      </span>
                    )}
                  </td>
                  <td className="border border-black py-3 px-4 text-sm text-black text-right">
                    {salary.commission > 0 ? formatCurrency(salary.commission) : "-"}
                  </td>
                </tr>
                {/* Marketer Performance Stats - Show for marketers/admin */}
                {(user?.role === "marketer" || user?.role === "admin") && (
                  <tr>
                    <td colSpan={2} className="border border-black py-2 px-4 text-xs text-gray-600 bg-gray-50">
                      <div className="flex justify-between">
                        <span>Collection: {formatCurrency(marketerStats.collection)}</span>
                        <span>Spend: {formatCurrency(marketerStats.totalSpend)}</span>
                        <span>ROAS: {marketerStats.roas.toFixed(2)}x</span>
                      </div>
                    </td>
                  </tr>
                )}
                {/* Total Earnings Row */}
                <tr className="bg-[#d4a853]">
                  <td className="border border-black py-2 px-4 text-center text-sm font-bold text-white">
                    TOTAL EARNINGS
                  </td>
                  <td className="border border-black py-2 px-4 bg-white text-sm text-black text-right font-bold">
                    {formatCurrency(salary.totalEarnings)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Net Pay and Bank Details */}
          <div className="mb-12 space-y-2">
            <div className="flex">
              <span className="w-28 text-sm text-black">Net Pay</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2 font-bold">
                {formatCurrency(salary.totalEarnings)}
              </span>
            </div>
            <div className="flex">
              <span className="w-28 text-sm text-black">Bank Account</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
                {staffDbData?.bank_account || user.bank_account || "-"}
              </span>
            </div>
            <div className="flex">
              <span className="w-28 text-sm text-black">Bank Name</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
                {staffDbData?.bank_name || user.bank_name || "-"}
              </span>
            </div>
          </div>

          {/* Authorization Section */}
          <div className="flex justify-end">
            <div className="text-center">
              <p className="text-sm text-black mb-1">Authorized by:</p>
              <p className="text-sm text-black mb-2">Managing Director – DFR Empire</p>
              <img
                src={signature}
                alt="Signature"
                className="w-32 h-auto mx-auto mb-1"
              />
              <p className="text-sm text-black border-t border-black pt-1">
                Muhammad Fahmi Bin Ramelan
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SalarySlip;
