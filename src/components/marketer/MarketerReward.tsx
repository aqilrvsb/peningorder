import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Wallet, TrendingUp, Trophy, Gift, Percent, Loader2, Target, CheckCircle, Clock, Circle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface PNLConfig {
  id: string;
  role: 'marketer' | 'admin';
  min_sales: number;
  max_sales: number | null;
  roas_min: number;
  roas_max: number;
  commission_percent: number;
  bonus_amount: number;
}

const MarketerReward = () => {
  const { profile } = useAuth();

  // Month filter - default to current month
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  // Generate month options
  const months = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
  ];

  // Generate year options (last 3 years)
  const years = Array.from({ length: 3 }, (_, i) => currentYear - i);

  // Calculate date range for selected month
  const dateRange = useMemo(() => {
    const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${lastDay}`;
    return { startDate, endDate };
  }, [selectedYear, selectedMonth]);

  // Fetch PNL configs for marketer role - sorted by bonus_amount ascending (lower to top)
  const { data: pnlConfigs = [], isLoading: configsLoading } = useQuery({
    queryKey: ["pnl-configs-marketer"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pnl_config")
        .select("*")
        .eq("role", "marketer")
        .order("bonus_amount", { ascending: true });

      if (error) throw error;
      return (data || []) as PNLConfig[];
    },
  });

  // Fetch orders for selected month (delivery_status != 'Return')
  const { data: ordersData = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["marketer-reward-orders", dateRange.startDate, dateRange.endDate, profile?.idstaff],
    queryFn: async () => {
      if (!profile?.idstaff) return [];

      const { data, error } = await supabase
        .from("customer_purchases")
        .select("id, total_sale, delivery_status, date_order")
        .eq("marketer_id_staff", profile.idstaff)
        .neq("delivery_status", "Return")
        .gte("date_order", dateRange.startDate)
        .lte("date_order", dateRange.endDate);

      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.idstaff,
  });

  // Fetch spends for selected month
  const { data: spendsData = [], isLoading: spendsLoading } = useQuery({
    queryKey: ["marketer-reward-spends", dateRange.startDate, dateRange.endDate, profile?.idstaff],
    queryFn: async () => {
      if (!profile?.idstaff) return [];

      const { data, error } = await supabase
        .from("spends")
        .select("id, total_spend, tarikh_spend")
        .eq("id_staff", profile.idstaff)
        .gte("tarikh_spend", dateRange.startDate)
        .lte("tarikh_spend", dateRange.endDate);

      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.idstaff,
  });

  // Calculate totals
  const stats = useMemo(() => {
    const totalSales = ordersData.reduce((sum, order: any) => sum + (Number(order.total_sale) || 0), 0);
    const totalSpend = spendsData.reduce((sum, spend: any) => sum + (Number(spend.total_spend) || 0), 0);
    const roas = totalSpend > 0 ? totalSales / totalSpend : 0;

    return { totalSales, totalSpend, roas };
  }, [ordersData, spendsData]);

  // Calculate tier progress
  const tierProgress = useMemo(() => {
    if (!pnlConfigs.length) return [];

    return pnlConfigs.map((config, index) => {
      const minSales = config.min_sales;
      const maxSales = config.max_sales || (pnlConfigs[index + 1]?.min_sales || minSales * 2);
      const salesRange = maxSales - minSales;

      // Determine status based on current sales
      let status: 'achieved' | 'in_progress' | 'not_started';
      let progressPercent = 0;

      if (stats.totalSales >= maxSales) {
        // Achieved this tier
        status = 'achieved';
        progressPercent = 100;
      } else if (stats.totalSales >= minSales) {
        // In progress for this tier
        status = 'in_progress';
        progressPercent = Math.min(100, ((stats.totalSales - minSales) / salesRange) * 100);
      } else if (index === 0) {
        // First tier - show progress towards it
        status = 'in_progress';
        progressPercent = Math.min(100, (stats.totalSales / minSales) * 100);
      } else {
        // Not started
        status = 'not_started';
        progressPercent = 0;
      }

      // Check ROAS requirement
      const roasMet = stats.roas >= config.roas_min && stats.roas <= config.roas_max;
      const salesMet = stats.totalSales >= minSales && (config.max_sales === null || stats.totalSales <= config.max_sales);
      const fullyQualified = salesMet && roasMet;

      // Calculate commission and bonus if qualified
      const commission = fullyQualified ? stats.totalSales * (config.commission_percent / 100) : 0;
      const bonus = fullyQualified ? config.bonus_amount : 0;

      return {
        ...config,
        tierNumber: index + 1,
        status,
        progressPercent,
        roasMet,
        salesMet,
        fullyQualified,
        commission,
        bonus,
        maxSalesDisplay: config.max_sales || 'Above',
      };
    });
  }, [pnlConfigs, stats]);

  // Get current qualified tier
  const qualifiedTier = useMemo(() => {
    const qualified = tierProgress.filter(t => t.fullyQualified);
    return qualified.length > 0 ? qualified[qualified.length - 1] : null;
  }, [tierProgress]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const getStatusColor = (status: 'achieved' | 'in_progress' | 'not_started') => {
    switch (status) {
      case 'achieved':
        return 'bg-green-500';
      case 'in_progress':
        return 'bg-yellow-500';
      case 'not_started':
        return 'bg-red-500';
    }
  };

  const getStatusBgColor = (status: 'achieved' | 'in_progress' | 'not_started') => {
    switch (status) {
      case 'achieved':
        return 'bg-green-100 border-green-300 dark:bg-green-900/20 dark:border-green-800';
      case 'in_progress':
        return 'bg-yellow-100 border-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-800';
      case 'not_started':
        return 'bg-red-100 border-red-300 dark:bg-red-900/20 dark:border-red-800';
    }
  };

  const getStatusIcon = (status: 'achieved' | 'in_progress' | 'not_started') => {
    switch (status) {
      case 'achieved':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      case 'not_started':
        return <Circle className="w-5 h-5 text-red-400" />;
    }
  };

  const getStatusLabel = (status: 'achieved' | 'in_progress' | 'not_started') => {
    switch (status) {
      case 'achieved':
        return 'Achieved';
      case 'in_progress':
        return 'In Progress';
      case 'not_started':
        return 'Not Started';
    }
  };

  const isLoading = configsLoading || ordersLoading || spendsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Trophy className="w-6 h-6" />
          Reward Progress
        </h1>
        <p className="text-muted-foreground mt-1">
          Track your performance and rewards based on sales targets
        </p>
      </div>

      {/* Month Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Target className="w-5 h-5" />
              <span className="font-medium text-foreground">Period:</span>
            </div>
            <div className="flex gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Month</Label>
                <Select
                  value={selectedMonth.toString()}
                  onValueChange={(value) => setSelectedMonth(parseInt(value))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((month) => (
                      <SelectItem key={month.value} value={month.value.toString()}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Year</Label>
                <Select
                  value={selectedYear.toString()}
                  onValueChange={(value) => setSelectedYear(parseInt(value))}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-emerald-600 mb-2">
              <DollarSign className="w-5 h-5" />
              <span className="text-sm font-medium">Total Sales</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(stats.totalSales)}</p>
            <p className="text-xs text-muted-foreground mt-1">Excluding returns</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-blue-600 mb-2">
              <Wallet className="w-5 h-5" />
              <span className="text-sm font-medium">Total Spend</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(stats.totalSpend)}</p>
            <p className="text-xs text-muted-foreground mt-1">Ad spending</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-purple-600 mb-2">
              <TrendingUp className="w-5 h-5" />
              <span className="text-sm font-medium">ROAS</span>
            </div>
            <p className="text-2xl font-bold">{stats.roas.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">Return on Ad Spend</p>
          </CardContent>
        </Card>
      </div>

      {/* Qualified Tier Summary */}
      {qualifiedTier && (
        <Card className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-800/50 rounded-full">
                  <Trophy className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-semibold text-green-700 dark:text-green-400">
                    Congratulations! You qualified for Tier {qualifiedTier.tierNumber}
                  </p>
                  <p className="text-sm text-green-600 dark:text-green-500">
                    Sales: {formatCurrency(qualifiedTier.min_sales)} - {typeof qualifiedTier.maxSalesDisplay === 'number' ? formatCurrency(qualifiedTier.maxSalesDisplay) : qualifiedTier.maxSalesDisplay} | ROAS: {qualifiedTier.roas_min} - {qualifiedTier.roas_max}
                  </p>
                </div>
              </div>
              <div className="flex gap-4 text-right">
                <div>
                  <p className="text-xs text-green-600 dark:text-green-500">Commission</p>
                  <p className="text-lg font-bold text-green-700 dark:text-green-400">{formatCurrency(qualifiedTier.commission)}</p>
                  <p className="text-xs text-muted-foreground">({qualifiedTier.commission_percent}%)</p>
                </div>
                <div>
                  <p className="text-xs text-green-600 dark:text-green-500">Bonus</p>
                  <p className="text-lg font-bold text-green-700 dark:text-green-400">{formatCurrency(qualifiedTier.bonus)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tier Progress Cards */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Target className="w-5 h-5" />
          Reward Tiers
        </h2>

        {tierProgress.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No reward tiers configured. Please contact your administrator.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {tierProgress.map((tier) => (
              <Card
                key={tier.id}
                className={`border-2 transition-all ${getStatusBgColor(tier.status)}`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* Tier Info */}
                    <div className="flex items-center gap-3 lg:w-48 flex-shrink-0">
                      {getStatusIcon(tier.status)}
                      <div>
                        <p className="font-semibold">Tier {tier.tierNumber}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          tier.status === 'achieved' ? 'bg-green-200 text-green-700 dark:bg-green-800 dark:text-green-300' :
                          tier.status === 'in_progress' ? 'bg-yellow-200 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-300' :
                          'bg-red-200 text-red-700 dark:bg-red-800 dark:text-red-300'
                        }`}>
                          {getStatusLabel(tier.status)}
                        </span>
                      </div>
                    </div>

                    {/* Progress Section */}
                    <div className="flex-1 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Sales Target: {formatCurrency(tier.min_sales)} - {typeof tier.maxSalesDisplay === 'number' ? formatCurrency(tier.maxSalesDisplay) : tier.maxSalesDisplay}
                        </span>
                        <span className="font-medium">{tier.progressPercent.toFixed(1)}%</span>
                      </div>
                      <div className="relative">
                        <Progress
                          value={tier.progressPercent}
                          className="h-4"
                        />
                        <div
                          className={`absolute inset-0 h-4 rounded-full ${getStatusColor(tier.status)} opacity-80`}
                          style={{ width: `${tier.progressPercent}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          ROAS Required: {tier.roas_min} - {tier.roas_max}
                          {tier.roasMet ? (
                            <span className="text-green-600 ml-1">(Met: {stats.roas.toFixed(2)})</span>
                          ) : (
                            <span className="text-red-500 ml-1">(Current: {stats.roas.toFixed(2)})</span>
                          )}
                        </span>
                        <span>Current Sales: {formatCurrency(stats.totalSales)}</span>
                      </div>
                    </div>

                    {/* Rewards */}
                    <div className="flex gap-4 lg:w-64 flex-shrink-0 justify-end">
                      <div className="text-center">
                        <div className="flex items-center gap-1 text-primary mb-1">
                          <Percent className="w-4 h-4" />
                          <span className="text-xs">Commission</span>
                        </div>
                        <p className={`font-bold ${tier.fullyQualified ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {tier.commission_percent}%
                        </p>
                        {tier.fullyQualified && (
                          <p className="text-xs text-green-600">{formatCurrency(tier.commission)}</p>
                        )}
                      </div>
                      <div className="text-center">
                        <div className="flex items-center gap-1 text-primary mb-1">
                          <Gift className="w-4 h-4" />
                          <span className="text-xs">Bonus</span>
                        </div>
                        <p className={`font-bold ${tier.fullyQualified ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {formatCurrency(tier.bonus_amount)}
                        </p>
                        {tier.fullyQualified && (
                          <p className="text-xs text-green-600">Earned!</p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Status Legend:</h3>
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-green-500" />
              <span>Achieved - Target met</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-yellow-500" />
              <span>In Progress - Working towards target</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-red-500" />
              <span>Not Started - Below threshold</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            * To qualify for rewards, both Sales and ROAS requirements must be met.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default MarketerReward;
