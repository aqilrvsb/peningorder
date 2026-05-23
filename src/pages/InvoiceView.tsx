import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import dziLogo from "/dzi-logo.jpg";

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  bill_to_name: string;
  bill_to_address: string | null;
  bill_to_phone: string | null;
  items: InvoiceItem[];
  total: number;
  notes: string | null;
}

interface InvoiceSettings {
  company_name: string;
  registration_no: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

const InvoiceView = () => {
  const { id } = useParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        const [invRes, setRes] = await Promise.all([
          (supabase as any).from("invoices").select("*").eq("id", id).single(),
          (supabase as any).from("invoice_settings").select("*").limit(1).maybeSingle(),
        ]);
        if (invRes.error) throw invRes.error;
        setInvoice(invRes.data);
        setSettings(setRes.data || null);
      } catch (error) {
        console.error("Error fetching invoice:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const downloadPDF = () => window.print();

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-lg">Loading invoice...</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-lg text-red-600">Invoice not found</p>
      </div>
    );
  }

  // Fill to at least 8 rows for visual balance
  const displayItems = [...invoice.items];
  while (displayItems.length < 8) {
    displayItems.push({ description: "", quantity: 0, unit_price: 0 });
  }

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          body { margin: 0 !important; padding: 0 !important; }
          html, body { width: 210mm; height: 297mm; }
          * { color: #000000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
      <div className="min-h-screen bg-white p-8 flex justify-center print:p-4">
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
          className="w-full max-w-[210mm] bg-white p-8"
          style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", color: "black" }}
        >
          {/* Header: Title + Logo */}
          <div className="flex items-start justify-between mb-8">
            <div className="flex-1 text-center">
              <h1 className="text-3xl font-bold tracking-wide" style={{ marginTop: "12px" }}>INVOICE</h1>
            </div>
            <img
              src={dziLogo}
              alt="Company Logo"
              className="w-24 h-24 rounded-full object-cover"
            />
          </div>

          {/* Company Name + Invoice Number/Date */}
          <div className="grid grid-cols-2 gap-8 mb-6">
            <div>
              <p className="font-bold text-sm uppercase mb-2">{settings?.company_name || "COMPANY NAME"}</p>
              <p className="text-sm">
                <span className="font-semibold">NAME</span> : {settings?.company_name || "-"}
              </p>
              <p className="text-sm">
                <span className="font-semibold">ADDRESS</span> : {settings?.address || "-"}
              </p>
              <p className="text-sm">
                <span className="font-semibold">PHONE</span> : {settings?.phone || "-"}
              </p>
            </div>
            <div>
              <p className="text-sm mb-1">
                INVOICE <span className="font-semibold">NUMBER</span> : {invoice.invoice_number}
              </p>
              <p className="text-sm mb-1">
                DATE OF <span className="font-semibold">INVOICE</span> : {invoice.invoice_date}
              </p>
              <p className="text-sm">
                DUE DATE : {invoice.due_date || "-"}
              </p>
            </div>
          </div>

          {/* Bill To */}
          <div className="mb-6">
            <p className="font-bold text-sm uppercase mb-2">BILL TO</p>
            <p className="text-sm">
              <span className="font-semibold">NAME</span> : {invoice.bill_to_name}
            </p>
            <p className="text-sm">
              <span className="font-semibold">ADDRESS</span> : {invoice.bill_to_address || "-"}
            </p>
            <p className="text-sm">
              <span className="font-semibold">PHONE</span> : {invoice.bill_to_phone || "-"}
            </p>
          </div>

          {/* Items Table */}
          <table className="w-full border-collapse border border-black mb-6">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-black py-2 px-2 text-center text-xs font-bold w-12">NO</th>
                <th className="border border-black py-2 px-2 text-center text-xs font-bold">DESCRIPTION</th>
                <th className="border border-black py-2 px-2 text-center text-xs font-bold w-24">QUANTITY</th>
                <th className="border border-black py-2 px-2 text-center text-xs font-bold w-28">UNIT PRICE<br />(RM)</th>
                <th className="border border-black py-2 px-2 text-center text-xs font-bold w-28">TOTAL<br />(RM)</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map((item, idx) => (
                <tr key={idx}>
                  <td className="border border-black py-2 px-2 text-sm text-center">
                    {item.description ? idx + 1 : ""}
                  </td>
                  <td className="border border-black py-2 px-2 text-sm">{item.description}</td>
                  <td className="border border-black py-2 px-2 text-sm text-center">
                    {item.description ? item.quantity : ""}
                  </td>
                  <td className="border border-black py-2 px-2 text-sm text-center">
                    {item.description ? item.unit_price.toFixed(2) : ""}
                  </td>
                  <td className="border border-black py-2 px-2 text-sm text-center">
                    {item.description ? (item.quantity * item.unit_price).toFixed(2) : ""}
                  </td>
                </tr>
              ))}
              <tr className="font-bold">
                <td colSpan={2} className="border border-black py-2 px-2 text-sm italic">
                  Thank you for your business!
                </td>
                <td colSpan={2} className="border border-black py-2 px-2 text-sm text-center">
                  TOTAL
                </td>
                <td className="border border-black py-2 px-2 text-sm text-center">
                  RM {invoice.total.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Notes */}
          {invoice.notes && (
            <div className="mb-6 text-sm">
              <p className="font-semibold mb-1">Notes:</p>
              <p className="whitespace-pre-line">{invoice.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="text-center text-sm mt-8 pt-4 border-t border-gray-300">
            <p>If you have any questions about this invoice, please contact us</p>
            {settings?.phone && <p>Tel: {settings.phone}</p>}
            {settings?.email && <p>Email: {settings.email}</p>}
          </div>
        </div>
      </div>
    </>
  );
};

export default InvoiceView;
