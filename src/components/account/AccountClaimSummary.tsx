import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { getMalaysiaDate } from "@/lib/utils";
import { Loader2, Receipt, Users } from "lucide-react";

const PAGE_SIZE_OPTIONS = [10, 50, 100, "All"] as const;

const AccountClaimSummary = () => {
  const today = getMalaysiaDate();
  const firstDayOfMonth = today.substring(0, 8) + "01";

  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [pageSize, setPageSize] = useState<number | "All">(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch claims within date range
  const { data: claims = [], isLoading } = useQuery({
    queryKey: ["account-claims-summary", startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("claims")
        .select("employee_name, total_deductions, items, pay_date, status")
        .order("pay_date", { ascending: false });

      if (startDate) {
        query = query.gte("pay_date", startDate);
      }
      if (endDate) {
        query = query.lte("pay_date", endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Group claims by employee
  const employeeSummary = useMemo(() => {
    const map = new Map<string, { count: number; total: number; items: { description: string; amount: number }[] }>();

    claims.forEach((claim: any) => {
      const name = claim.employee_name;
      const existing = map.get(name) || { count: 0, total: 0, items: [] };
      existing.count += 1;
      existing.total += Number(claim.total_deductions) || 0;

      // Collect all item descriptions
      const claimItems = claim.items || [];
      claimItems.forEach((item: any) => {
        existing.items.push({
          description: item.description,
          amount: Number(item.amount) || 0,
        });
      });

      map.set(name, existing);
    });

    // Convert to sorted array
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [claims]);

  // Grand total
  const grandTotal = employeeSummary.reduce((sum, emp) => sum + emp.total, 0);
  const totalClaims = employeeSummary.reduce((sum, emp) => sum + emp.count, 0);

  // Pagination
  const totalPages = pageSize === "All" ? 1 : Math.ceil(employeeSummary.length / (pageSize as number));
  const paginatedData = pageSize === "All"
    ? employeeSummary
    : employeeSummary.slice((currentPage - 1) * (pageSize as number), currentPage * (pageSize as number));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Claim Summary by Employee</h1>
        <p className="text-muted-foreground mt-2">
          Summary of total claims grouped by employee
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-500" />
              <div>
                <p className="text-xl font-bold">{employeeSummary.length}</p>
                <p className="text-xs text-muted-foreground">Employees</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Receipt className="w-6 h-6 text-orange-500" />
              <div>
                <p className="text-xl font-bold">{totalClaims}</p>
                <p className="text-xs text-muted-foreground">Total Claims</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Receipt className="w-6 h-6 text-green-500" />
              <div>
                <p className="text-xl font-bold">RM {grandTotal.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Total Amount</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Start:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                className="w-40"
              />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground whitespace-nowrap">End:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
              <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(v === "All" ? "All" : Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size.toString()} value={size.toString()}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">entries</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-3 text-left">No</th>
                      <th className="p-3 text-left">Employee</th>
                      <th className="p-3 text-center">Total Claims</th>
                      <th className="p-3 text-right">Total Amount (RM)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData.length > 0 ? (
                      paginatedData.map((emp, index) => (
                        <tr key={emp.name} className="border-b hover:bg-muted/30">
                          <td className="p-3">
                            {pageSize === "All" ? index + 1 : (currentPage - 1) * (pageSize as number) + index + 1}
                          </td>
                          <td className="p-3 font-medium">{emp.name}</td>
                          <td className="p-3 text-center">{emp.count}</td>
                          <td className="p-3 text-right font-medium">RM {emp.total.toFixed(2)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="text-center py-12 text-muted-foreground">
                          No claims found for this date range.
                        </td>
                      </tr>
                    )}
                    {paginatedData.length > 0 && (
                      <tr className="bg-muted/50 font-bold">
                        <td className="p-3" colSpan={2}>Grand Total</td>
                        <td className="p-3 text-center">{totalClaims}</td>
                        <td className="p-3 text-right">RM {grandTotal.toFixed(2)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * (pageSize as number) + 1} to {Math.min(currentPage * (pageSize as number), employeeSummary.length)} of {employeeSummary.length} entries
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountClaimSummary;
