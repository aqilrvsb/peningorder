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
import { Loader2, Receipt, Users, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

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
        .select("employee_name, total_deductions, items, pay_date, status, bank_account, bank_name, ic_number, phone_number, department, employment_type")
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
    const map = new Map<string, {
      count: number;
      total: number;
      items: { description: string; amount: number }[];
      bank_account: string;
      bank_name: string;
      ic_number: string;
      phone_number: string;
      department: string;
      employment_type: string;
    }>();

    claims.forEach((claim: any) => {
      const name = claim.employee_name;
      const existing = map.get(name) || {
        count: 0, total: 0, items: [],
        bank_account: claim.bank_account || "-",
        bank_name: claim.bank_name || "-",
        ic_number: claim.ic_number || "-",
        phone_number: claim.phone_number || "-",
        department: claim.department || "-",
        employment_type: claim.employment_type || "-",
      };
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

  // Generate merged invoice PDF for an employee
  const generateMergedPDF = (emp: typeof employeeSummary[0]) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    const blueHeader: [number, number, number] = [62, 110, 142];
    const goldColor: [number, number, number] = [218, 165, 32];

    // Logo
    doc.setFillColor(...goldColor);
    doc.circle(30, 30, 15, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("DZI", 24, 28);
    doc.setFontSize(7);
    doc.text("HOLISTIK", 21, 34);

    // Company header
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("DZI HOLISTIK ENTERPRISE", 60, 20);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("PT 2811, TINGKAT 1 TAMAN D'SAID KG PADANG LANDAK, MUKIM PELAGAT,", 60, 28);
    doc.text("22000 JERTEH, TERENGGANU", 60, 34);
    doc.text("TEL: 016-2569963 (HR)", 60, 40);

    // Title
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("CLAIM SUMMARY", pageWidth / 2, 55, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Period: ${startDate} to ${endDate}`, pageWidth / 2, 62, { align: "center" });

    // Employee details
    const detailsStartY = 72;
    const labelX = 20;
    const colonX = 82;
    const valueX = 86;

    doc.setFontSize(10);
    const details = [
      ["Employee Name", emp.name],
      ["Identification Card Number", emp.ic_number],
      ["Phone Number", emp.phone_number],
      ["Department", emp.department],
      ["Employment Type", emp.employment_type],
    ];

    details.forEach((detail, index) => {
      const y = detailsStartY + index * 8;
      doc.setFont("helvetica", "normal");
      doc.text(detail[0], labelX, y);
      doc.text(":", colonX, y);
      doc.text(detail[1], valueX, y);
    });

    // Deductions table
    const deductionsY = detailsStartY + details.length * 8 + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("DEDUCTIONS", labelX, deductionsY);

    const tableData = emp.items.map((item) => [
      item.description,
      `RM ${Number(item.amount).toFixed(2)}`,
    ]);

    autoTable(doc, {
      startY: deductionsY + 5,
      head: [["DESCRIPTION", "AMOUNT"]],
      body: tableData,
      theme: "grid",
      headStyles: {
        fillColor: blueHeader,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        fontSize: 10,
      },
      footStyles: {
        fillColor: blueHeader,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        fontSize: 10,
      },
      foot: [["TOTAL DEDUCTIONS", `RM ${emp.total.toFixed(2)}`]],
      columnStyles: {
        0: { cellWidth: 125, halign: "left" },
        1: { cellWidth: 45, halign: "right" },
      },
      styles: {
        fontSize: 9,
        cellPadding: 4,
      },
      margin: { left: 20, right: 20 },
    });

    // Payment details
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    doc.setFont("helvetica", "normal");
    doc.text("Net Pay", labelX, finalY);
    doc.text(":", colonX, finalY);
    doc.text(`RM ${emp.total.toFixed(2)}`, valueX, finalY);

    doc.text("Bank Account", labelX, finalY + 8);
    doc.text(":", colonX, finalY + 8);
    doc.text(emp.bank_account, valueX, finalY + 8);

    doc.text("Bank Name", labelX, finalY + 16);
    doc.text(":", colonX, finalY + 16);
    doc.text(emp.bank_name, valueX, finalY + 16);

    // Authorization
    const authY = finalY + 35;
    doc.setFontSize(9);
    doc.text("Authorized by:", pageWidth - 75, authY);
    doc.setFont("helvetica", "bold");
    doc.text("Managing Director - DFR Empire", pageWidth - 75, authY + 6);

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(pageWidth - 75, authY + 20, pageWidth - 15, authY + 20);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Muhammad Fahmi Bin Ramelan", pageWidth - 75, authY + 26);

    doc.save(`Claim_Summary_${emp.name.replace(/\s+/g, "_")}_${startDate}_to_${endDate}.pdf`);
    toast.success("PDF generated successfully");
  };

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
                      <th className="p-3 text-center">Invoice</th>
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
                          <td className="p-3 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => generateMergedPDF(emp)}
                              className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title="Download merged invoice"
                            >
                              <FileText className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-muted-foreground">
                          No claims found for this date range.
                        </td>
                      </tr>
                    )}
                    {paginatedData.length > 0 && (
                      <tr className="bg-muted/50 font-bold">
                        <td className="p-3" colSpan={2}>Grand Total</td>
                        <td className="p-3 text-center">{totalClaims}</td>
                        <td className="p-3 text-right">RM {grandTotal.toFixed(2)}</td>
                        <td className="p-3"></td>
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
