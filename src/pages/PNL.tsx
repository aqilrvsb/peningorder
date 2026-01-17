import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { FileText, Calculator, Loader2, DollarSign, TrendingUp, Percent, Gift } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';

interface PNLConfig {
  id: string;
  role: 'marketer' | 'admin';
  min_sales: number;
  max_sales: number | null;
  roas_min: number;
  roas_max: number;
  commission_percent: number;
  bonus_amount: number;
  created_at: string;
}

interface SalaryData {
  totalSales: number;
  totalSpend: number;
  roas: number;
  commission: number;
  bonus: number;
  totalSalary: number;
  tier: PNLConfig | null;
}

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const PNL: React.FC = () => {
  const { profile } = useAuth();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [isLoading, setIsLoading] = useState(false);
  const [pnlConfigs, setPnlConfigs] = useState<PNLConfig[]>([]);

  // Salary Statement Dialog
  const [showSalaryDialog, setShowSalaryDialog] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [salaryData, setSalaryData] = useState<SalaryData | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Generate year options (current year and 5 years back)
  const yearOptions = useMemo(() => {
    const years = [];
    for (let i = 0; i < 6; i++) {
      years.push((currentYear - i).toString());
    }
    return years;
  }, [currentYear]);

  // Fetch PNL configurations
  useEffect(() => {
    const fetchConfigs = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from('pnl_config')
          .select('*')
          .order('min_sales', { ascending: true });

        if (error) throw error;
        setPnlConfigs(data || []);
      } catch (error) {
        console.error('Error fetching PNL configs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfigs();
  }, []);

  // Calculate salary for a specific month
  const calculateSalary = async (month: number) => {
    setIsCalculating(true);
    setSelectedMonth(month);
    setShowSalaryDialog(true);

    try {
      const year = parseInt(selectedYear);
      const startDate = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');

      const marketerIdStaff = profile?.idstaff || '';

      // Fetch shipped orders only (delivery_status = 'Shipped' or 'Success')
      const { data: orders, error: ordersError } = await (supabase as any)
        .from('customer_purchases')
        .select('total_price, delivery_status')
        .eq('marketer_id_staff', marketerIdStaff)
        .gte('date_order', startDate)
        .lte('date_order', endDate)
        .in('delivery_status', ['Shipped', 'Success']);

      if (ordersError) throw ordersError;

      // Fetch spend for the period
      const { data: spends, error: spendsError } = await (supabase as any)
        .from('spends')
        .select('total_spend')
        .eq('marketer_id_staff', marketerIdStaff)
        .gte('tarikh_spend', startDate)
        .lte('tarikh_spend', endDate);

      if (spendsError) throw spendsError;

      // Calculate totals
      const totalSales = orders?.reduce((sum: number, o: any) => sum + (Number(o.total_price) || 0), 0) || 0;
      const totalSpend = spends?.reduce((sum: number, s: any) => sum + (Number(s.total_spend) || 0), 0) || 0;
      const roas = totalSpend > 0 ? totalSales / totalSpend : 0;

      // Find matching tier based on sales, ROAS, and role
      const userRole = profile?.role || 'marketer';
      let matchingTier: PNLConfig | null = null;
      for (const config of pnlConfigs) {
        // Check role match (only marketer and admin have PNL tiers)
        const roleMatch = config.role === userRole;
        const salesMatch = totalSales >= config.min_sales &&
          (config.max_sales === null || totalSales < config.max_sales);
        const roasMatch = roas >= config.roas_min && roas <= config.roas_max;

        if (roleMatch && salesMatch && roasMatch) {
          matchingTier = config;
          break;
        }
      }

      // Calculate commission and bonus
      const commission = matchingTier ? (totalSales * matchingTier.commission_percent / 100) : 0;
      const bonus = matchingTier ? matchingTier.bonus_amount : 0;
      const totalSalary = commission + bonus;

      setSalaryData({
        totalSales,
        totalSpend,
        roas,
        commission,
        bonus,
        totalSalary,
        tier: matchingTier,
      });
    } catch (error) {
      console.error('Error calculating salary:', error);
      setSalaryData(null);
    } finally {
      setIsCalculating(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const getMonthName = (month: number) => {
    return MONTHS.find(m => m.value === month)?.label || '';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary">PNL Statement</h1>
        <p className="text-muted-foreground mt-1">View your monthly profit & loss statements</p>
      </div>

      {/* Year Filter */}
      <div className="stat-card">
        <div className="flex items-center gap-4">
          <Label className="font-medium">Select Year:</Label>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Monthly Table */}
      <div className="form-section">
        <h2 className="text-lg font-semibold text-foreground mb-4">Monthly PNL - {selectedYear}</h2>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-16">No</th>
                <th>Month</th>
                <th className="text-center w-40">Action</th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((month) => (
                <tr key={month.value}>
                  <td className="font-medium">{month.value}</td>
                  <td>{month.label} {selectedYear}</td>
                  <td className="text-center">
                    <Button
                      size="sm"
                      onClick={() => calculateSalary(month.value)}
                      className="gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      PNL
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Salary Statement Dialog */}
      <Dialog open={showSalaryDialog} onOpenChange={setShowSalaryDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-primary" />
              Salary Statement - {selectedMonth ? getMonthName(selectedMonth) : ''} {selectedYear}
            </DialogTitle>
          </DialogHeader>

          {isCalculating ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Calculating...</span>
            </div>
          ) : salaryData ? (
            <div className="space-y-6 py-4">
              {/* Staff Info */}
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Staff ID</p>
                <p className="text-lg font-semibold">{profile?.idstaff}</p>
              </div>

              {/* Performance Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-blue-600 mb-1">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-xs font-medium">NET SALES</span>
                  </div>
                  <p className="text-xl font-bold">{formatCurrency(salaryData.totalSales)}</p>
                </div>

                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-purple-600 mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs font-medium">ROAS</span>
                  </div>
                  <p className="text-xl font-bold">{salaryData.roas.toFixed(2)}</p>
                </div>
              </div>

              {/* Tier Info */}
              {salaryData.tier ? (
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                  <p className="text-sm text-green-600 font-medium mb-2">Qualifying Tier</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Sales Range:</span>
                      <span className="ml-1 font-medium">
                        {formatCurrency(salaryData.tier.min_sales)} - {salaryData.tier.max_sales ? formatCurrency(salaryData.tier.max_sales) : 'Above'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">ROAS:</span>
                      <span className="ml-1 font-medium">{salaryData.tier.roas_min} - {salaryData.tier.roas_max}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                  <p className="text-sm text-amber-600 font-medium">No matching tier found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your sales or ROAS does not match any configured tier.
                  </p>
                </div>
              )}

              {/* Salary Breakdown */}
              <div className="space-y-3 border-t pt-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Percent className="w-4 h-4" />
                    <span>Commission ({salaryData.tier?.commission_percent || 0}%)</span>
                  </div>
                  <span className="font-medium">{formatCurrency(salaryData.commission)}</span>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Gift className="w-4 h-4" />
                    <span>Bonus</span>
                  </div>
                  <span className="font-medium">{formatCurrency(salaryData.bonus)}</span>
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-dashed">
                  <span className="font-semibold text-lg">Total Salary</span>
                  <span className="font-bold text-xl text-primary">{formatCurrency(salaryData.totalSalary)}</span>
                </div>
              </div>

              {/* Period Info */}
              <div className="text-xs text-muted-foreground text-center pt-2 border-t">
                Period: {selectedMonth ? format(startOfMonth(new Date(parseInt(selectedYear), selectedMonth - 1)), 'dd MMM yyyy') : ''} - {selectedMonth ? format(endOfMonth(new Date(parseInt(selectedYear), selectedMonth - 1)), 'dd MMM yyyy') : ''}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <p>Unable to calculate salary. Please try again.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PNL;
