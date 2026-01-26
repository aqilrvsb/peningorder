import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import dziLogo from "/dzi-logo.jpg";
import signature from "/signature.jpg";

interface ClaimItem {
  description: string;
  amount: number;
}

interface Claim {
  id: string;
  employee_name: string;
  ic_number: string;
  phone_number: string;
  department: string;
  employment_type: string;
  pay_date: string;
  invoice_number: string;
  items: ClaimItem[];
  total_deductions: number;
  net_pay: number;
  bank_account: string;
  bank_name: string;
}

const ClaimInvoice = () => {
  const { id } = useParams();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClaim = async () => {
      if (!id) return;

      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Error fetching claim:", error);
      } else {
        setClaim(data);
      }
      setLoading(false);
    };

    fetchClaim();
  }, [id]);

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

  if (!claim) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-lg text-red-600">Claim not found</p>
      </div>
    );
  }

  // Prepare items to fill 10 rows
  const displayItems = [...claim.items];
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
            <p className="text-sm text-black">TEL: 016-2569963 (HR)</p>
          </div>
        </div>

        {/* Employee Details Section */}
        <div className="mb-8 space-y-2">
          <div className="flex">
            <span className="w-52 text-sm text-black">Employee Name</span>
            <span className="text-sm text-black">:</span>
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              {claim.employee_name}
            </span>
          </div>
          <div className="flex">
            <span className="w-52 text-sm text-black">Identification Card Number</span>
            <span className="text-sm text-black">:</span>
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              {claim.ic_number}
            </span>
          </div>
          <div className="flex">
            <span className="w-52 text-sm text-black">Phone Number</span>
            <span className="text-sm text-black">:</span>
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              {claim.phone_number}
            </span>
          </div>
          <div className="flex">
            <span className="w-52 text-sm text-black">Department</span>
            <span className="text-sm text-black">:</span>
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              {claim.department}
            </span>
          </div>
          <div className="flex">
            <span className="w-52 text-sm text-black">Employment Type</span>
            <span className="text-sm text-black">:</span>
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              {claim.employment_type}
            </span>
          </div>
          <div className="flex">
            <span className="w-52 text-sm text-black">Pay Date</span>
            <span className="text-sm text-black">:</span>
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              {claim.pay_date}
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
              {/* Display items (filled to 10 rows) */}
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
                  RM {claim.total_deductions.toFixed(2)}
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
              RM {claim.net_pay.toFixed(2)}
            </span>
          </div>
          <div className="flex">
            <span className="w-28 text-sm text-black">Bank Account</span>
            <span className="text-sm text-black">:</span>
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              {claim.bank_account}
            </span>
          </div>
          <div className="flex">
            <span className="w-28 text-sm text-black">Bank Name</span>
            <span className="text-sm text-black">:</span>
            <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
              {claim.bank_name}
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

export default ClaimInvoice;
