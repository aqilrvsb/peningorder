import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import dziLogo from "/dzi-logo.jpg";
import signature from "/signature.jpg";

interface PaymentVoucher {
  id: string;
  voucher_number: string;
  date: string;
  pay_to: string;
  pay_by: string;
  payment_method: string;
  amount: number;
  purpose_of_payment: string;
  note: string;
}

const PaymentVoucherInvoice = () => {
  const { id } = useParams();
  const [voucher, setVoucher] = useState<PaymentVoucher | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVoucher = async () => {
      if (!id) return;

      const { data, error } = await supabase
        .from("payment_vouchers")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Error fetching payment voucher:", error);
        setLoading(false);
        return;
      }

      if (data) {
        setVoucher(data);
      }

      setLoading(false);
    };

    fetchVoucher();
  }, [id]);

  const downloadPDF = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-lg">Loading payment voucher...</p>
      </div>
    );
  }

  if (!voucher) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-lg text-red-600">Payment voucher not found</p>
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

          {/* Title */}
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-black underline">PAYMENT VOUCHER</h2>
          </div>

          {/* Voucher Details Section */}
          <div className="mb-8 space-y-3">
            <div className="flex">
              <span className="w-52 text-sm font-bold text-black">Payment Voucher Number</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
                {voucher.voucher_number}
              </span>
            </div>
            <div className="flex">
              <span className="w-52 text-sm font-bold text-black">Date</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
                {voucher.date}
              </span>
            </div>
            <div className="flex">
              <span className="w-52 text-sm font-bold text-black">Pay To</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
                {voucher.pay_to}
              </span>
            </div>
            <div className="flex">
              <span className="w-52 text-sm font-bold text-black">Pay By</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
                {voucher.pay_by}
              </span>
            </div>
            <div className="flex">
              <span className="w-52 text-sm font-bold text-black">Payment Method</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
                {voucher.payment_method}
              </span>
            </div>
            <div className="flex">
              <span className="w-52 text-sm font-bold text-black">Amount</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2 font-bold">
                RM {Number(voucher.amount).toFixed(2)}
              </span>
            </div>
            <div className="flex">
              <span className="w-52 text-sm font-bold text-black">Purpose of Payment</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
                {voucher.purpose_of_payment || "-"}
              </span>
            </div>
            <div className="flex">
              <span className="w-52 text-sm font-bold text-black">Note</span>
              <span className="text-sm text-black">:</span>
              <span className="flex-1 border-b border-gray-300 ml-2 text-sm text-black px-2">
                {voucher.note || "-"}
              </span>
            </div>
          </div>

          {/* Spacer */}
          <div className="mb-16"></div>

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

export default PaymentVoucherInvoice;
