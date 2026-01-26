import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
    if (!claim) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Colors matching template
    const blueHeader: [number, number, number] = [91, 176, 196]; // #5bb0c4
    const goldColor: [number, number, number] = [218, 165, 32];

    // Left side - DZI HOLISTIK Logo (circle)
    doc.setFillColor(...goldColor);
    doc.circle(30, 30, 15, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("DZI", 24, 28);
    doc.setFontSize(7);
    doc.text("HOLISTIK", 21, 34);

    // Right side - Company Name and Address
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("DZI HOLISTIK ENTERPRISE", 60, 20);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("PT 2811, TINGKAT 1 TAMAN D'SAID KG PADANG LANDAK, MUKIM PELAGAT,", 60, 28);
    doc.text("22000 JERTEH, TERENGGANU", 60, 34);
    doc.text("TEL: 016-2569963 (HR)", 60, 40);

    // Employee Details Section
    const detailsStartY = 60;
    const labelX = 20;
    const colonX = 82;
    const valueX = 86;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    const details = [
      ["Employee Name", claim.employee_name],
      ["Identification Card Number", claim.ic_number],
      ["Phone Number", claim.phone_number],
      ["Department", claim.department],
      ["Employment Type", claim.employment_type],
      ["Pay Date", claim.pay_date],
    ];

    details.forEach((detail, index) => {
      const y = detailsStartY + index * 8;
      doc.setFont("helvetica", "normal");
      doc.text(detail[0], labelX, y);
      doc.text(":", colonX, y);
      doc.text(detail[1], valueX, y);
    });

    // DEDUCTIONS Section
    const deductionsY = detailsStartY + details.length * 8 + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("DEDUCTIONS", labelX, deductionsY);

    // Prepare table data - fill to 10 rows
    const displayItems = [...claim.items];
    while (displayItems.length < 10) {
      displayItems.push({ description: "", amount: 0 });
    }

    const tableData = displayItems.map((item) => [
      item.description,
      item.amount > 0 ? `RM ${Number(item.amount).toFixed(2)}` : "",
    ]);

    autoTable(doc, {
      startY: deductionsY + 5,
      head: [["DESCRIPTION", "AMOUNT"]],
      body: tableData,
      foot: [["TOTAL DEDUCTIONS", `RM ${claim.total_deductions.toFixed(2)}`]],
      theme: "grid",
      headStyles: {
        fillColor: blueHeader,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        fontSize: 10,
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: 3,
      },
      footStyles: {
        fillColor: blueHeader,
        textColor: [0, 0, 0],
        fontStyle: "bold",
        halign: "center",
        fontSize: 10,
      },
      columnStyles: {
        0: { cellWidth: 125, halign: "left" },
        1: { cellWidth: 45, halign: "right", fillColor: [255, 255, 255] },
      },
      margin: { left: 20, right: 20 },
    });

    // Payment Details
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    doc.setFont("helvetica", "normal");
    doc.text("Net Pay", labelX, finalY);
    doc.text(":", colonX, finalY);
    doc.text(`RM ${claim.net_pay.toFixed(2)}`, valueX, finalY);

    doc.text("Bank Account", labelX, finalY + 8);
    doc.text(":", colonX, finalY + 8);
    doc.text(claim.bank_account, valueX, finalY + 8);

    doc.text("Bank Name", labelX, finalY + 16);
    doc.text(":", colonX, finalY + 16);
    doc.text(claim.bank_name, valueX, finalY + 16);

    // Authorization Section (bottom right)
    const authY = finalY + 35;
    doc.setFontSize(9);
    doc.text("Authorized by:", pageWidth - 75, authY);
    doc.text("Managing Director – DFR Empire", pageWidth - 75, authY + 6);

    // Signature line
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(pageWidth - 75, authY + 20, pageWidth - 15, authY + 20);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Muhammad Fahmi Bin Ramelan", pageWidth - 75, authY + 26);

    // Save PDF
    doc.save(`Claim_Invoice_${claim.invoice_number}_${claim.employee_name.replace(/\s+/g, "_")}.pdf`);
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
    <div className="min-h-screen bg-white p-8 flex justify-center">
      {/* Download PDF Button */}
      <button
        onClick={downloadPDF}
        className="fixed top-4 right-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Download PDF
      </button>

      <div
        className="w-full max-w-[210mm] bg-white"
        style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}
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
  );
};

export default ClaimInvoice;
