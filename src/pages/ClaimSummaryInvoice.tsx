import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import dziLogo from "/dzi-logo.jpg";
import signature from "/signature.jpg";
import signatureShuhada from "/signature-shuhada.png";

interface ClaimItem {
  description: string;
  amount: number;
}

const ClaimSummaryInvoice = () => {
  const [searchParams] = useSearchParams();
  const employeeName = searchParams.get("employee") || "";
  const startDate = searchParams.get("start") || "";
  const endDate = searchParams.get("end") || "";

  const [loading, setLoading] = useState(true);
  const [mergedData, setMergedData] = useState<{
    employee_name: string;
    ic_number: string;
    phone_number: string;
    department: string;
    employment_type: string;
    items: ClaimItem[];
    total_deductions: number;
    net_pay: number;
    bank_account: string;
    bank_name: string;
  } | null>(null);

  useEffect(() => {
    const fetchClaims = async () => {
      if (!employeeName || !startDate || !endDate) {
        setLoading(false);
        return;
      }

      let query = supabase
        .from("claims")
        .select("*")
        .eq("employee_name", employeeName)
        .gte("pay_date", startDate)
        .lte("pay_date", endDate)
        .order("pay_date", { ascending: true });

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching claims:", error);
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setLoading(false);
        return;
      }

      // Merge all claims
      const allItems: ClaimItem[] = [];
      let totalDeductions = 0;
      const firstClaim = data[0];

      data.forEach((claim: any) => {
        const claimItems = claim.items || [];
        claimItems.forEach((item: any) => {
          allItems.push({
            description: item.description,
            amount: Number(item.amount) || 0,
          });
        });
        totalDeductions += Number(claim.total_deductions) || 0;
      });

      // Fetch employee details from staff_database by name
      let staffIc = firstClaim.ic_number || "-";
      let staffPhone = firstClaim.phone_number || "-";
      let staffDepartment = firstClaim.department || "-";
      let staffEmploymentType = firstClaim.employment_type || "-";

      const { data: staffDb } = await supabase
        .from("staff_database")
        .select("no_kad_pengenalan, no_telefon, jawatan, employment_type")
        .eq("nama", employeeName)
        .limit(1)
        .maybeSingle();

      if (staffDb) {
        staffIc = staffDb.no_kad_pengenalan || staffIc;
        staffPhone = staffDb.no_telefon || staffPhone;
        staffDepartment = staffDb.jawatan || staffDepartment;
        staffEmploymentType = staffDb.employment_type || staffEmploymentType;
      }

      setMergedData({
        employee_name: firstClaim.employee_name,
        ic_number: staffIc,
        phone_number: staffPhone,
        department: staffDepartment,
        employment_type: staffEmploymentType,
        items: allItems,
        total_deductions: totalDeductions,
        net_pay: totalDeductions,
        bank_account: firstClaim.bank_account || "-",
        bank_name: firstClaim.bank_name || "-",
      });

      setLoading(false);
    };

    fetchClaims();
  }, [employeeName, startDate, endDate]);

  const downloadPDF = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-lg">Loading invoice...</p>
      </div>
    );
  }

  if (!mergedData) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-lg text-red-600">No claims found</p>
      </div>
    );
  }

  // Prepare items to fill minimum 10 rows
  const displayItems = [...mergedData.items];
  while (displayItems.length < 10) {
    displayItems.push({ description: "", amount: 0 });
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
        {/* Download PDF Button - Hidden when printing */}
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
            <p className="text-sm text-black">TEL: 019-7238956 (HR)</p>
          </div>
        </div>

        {/* Employee Details Section */}
        <div className="mb-8 space-y-2">
          <div className="flex">
            <span className="w-52 text-sm text-black">Employee Name</span>
            <span className="text-sm text-black">:</span>
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              {mergedData.employee_name}
            </span>
          </div>
          <div className="flex">
            <span className="w-52 text-sm text-black">Identification Card Number</span>
            <span className="text-sm text-black">:</span>
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              {mergedData.ic_number}
            </span>
          </div>
          <div className="flex">
            <span className="w-52 text-sm text-black">Phone Number</span>
            <span className="text-sm text-black">:</span>
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              {mergedData.phone_number}
            </span>
          </div>
          <div className="flex">
            <span className="w-52 text-sm text-black">Department</span>
            <span className="text-sm text-black">:</span>
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              {mergedData.department}
            </span>
          </div>
          <div className="flex">
            <span className="w-52 text-sm text-black">Employment Type</span>
            <span className="text-sm text-black">:</span>
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              {mergedData.employment_type}
            </span>
          </div>
          <div className="flex">
            <span className="w-52 text-sm text-black">Pay Date</span>
            <span className="text-sm text-black">:</span>
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              {startDate} - {endDate}
            </span>
          </div>
        </div>

        {/* Deductions Section */}
        <div className="mb-6">
          <h2 className="text-sm font-bold text-black mb-2">DEDUCTIONS</h2>
          <table className="w-full border-collapse border border-black">
            <thead>
              <tr className="bg-[#5bb0c4]">
                <th className="border border-black py-2 px-4 text-center text-sm font-bold text-white w-3/4">
                  DESCRIPTION
                </th>
                <th className="border border-black py-2 px-4 text-center text-sm font-bold text-white w-1/4">
                  AMOUNT
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Display items (filled to minimum 10 rows) */}
              {displayItems.map((item, index) => (
                <tr key={index}>
                  <td className="border border-black py-3 px-4 text-sm text-black">
                    {item.description}
                  </td>
                  <td className="border border-black py-3 px-4 text-sm text-black text-right">
                    {item.amount > 0 ? `RM ${item.amount.toFixed(2)}` : ""}
                  </td>
                </tr>
              ))}
              {/* Total Deductions Row */}
              <tr className="bg-[#5bb0c4]">
                <td className="border border-black py-2 px-4 text-center text-sm font-bold text-white">
                  TOTAL DEDUCTIONS
                </td>
                <td className="border border-black py-2 px-4 bg-white text-sm text-black text-right font-bold">
                  RM {mergedData.total_deductions.toFixed(2)}
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
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              RM {mergedData.net_pay.toFixed(2)}
            </span>
          </div>
          <div className="flex">
            <span className="w-28 text-sm text-black">Bank Account</span>
            <span className="text-sm text-black">:</span>
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              {mergedData.bank_account}
            </span>
          </div>
          <div className="flex">
            <span className="w-28 text-sm text-black">Bank Name</span>
            <span className="text-sm text-black">:</span>
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              {mergedData.bank_name}
            </span>
          </div>
        </div>

        {/* Authorization Section */}
        <div className="flex justify-between items-start mt-8 px-4">
          <div className="text-left" style={{ width: "260px" }}>
            <p className="text-sm font-bold text-black mb-1">Prepared by:</p>
            <img
              src={signatureShuhada}
              alt="Shuhada Signature"
              style={{ height: "50px", width: "auto", marginBottom: "2px", display: "block" }}
            />
            <p className="text-sm font-bold text-black m-0">
              (NIK NURSHUHADA BINTI NIK MOHD SAMRI)
            </p>
            <p className="text-xs text-black font-bold mt-0.5">GENERAL MANAGER</p>
          </div>
          <div className="text-left" style={{ width: "260px" }}>
            <p className="text-sm font-bold text-black mb-1">Approved by:</p>
            <img
              src={signature}
              alt="Signature"
              style={{ height: "50px", width: "auto", marginBottom: "2px", display: "block" }}
            />
            <p className="text-sm font-bold text-black m-0">
              (MUHAMMAD FAHMI BIN RAMELAN)
            </p>
            <p className="text-xs text-black font-bold mt-0.5">DIRECTOR</p>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default ClaimSummaryInvoice;
