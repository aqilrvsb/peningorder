import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

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
      <div style={{ minHeight: "100vh", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontSize: "18px" }}>Loading payment voucher...</p>
      </div>
    );
  }

  if (!voucher) {
    return (
      <div style={{ minHeight: "100vh", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontSize: "18px", color: "red" }}>Payment voucher not found</p>
      </div>
    );
  }

  const fields = [
    { label: "Payment Voucher Number", value: voucher.voucher_number },
    { label: "Date", value: voucher.date },
    { label: "Pay To", value: voucher.pay_to },
    { label: "Pay By", value: voucher.pay_by },
    { label: "Payment Method", value: voucher.payment_method },
    { label: "Amount", value: `RM ${Number(voucher.amount).toFixed(2)}` },
    { label: "Purpose of Payment", value: voucher.purpose_of_payment || "" },
    { label: "Note", value: voucher.note || "" },
  ];

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
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Download PDF Button */}
      <button
        onClick={downloadPDF}
        className="no-print"
        style={{
          position: "fixed",
          top: "16px",
          right: "16px",
          background: "#2563eb",
          color: "#fff",
          border: "none",
          padding: "10px 24px",
          borderRadius: "8px",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: "bold",
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Download PDF
      </button>

      <div style={{
        minHeight: "100vh",
        background: "#fff",
        display: "flex",
        justifyContent: "center",
        padding: "30px",
      }}>
        {/* A4 Page */}
        <div style={{
          width: "210mm",
          minHeight: "297mm",
          background: "#fff",
          border: "1.5px solid #000",
          padding: "50px 60px",
          fontFamily: "'Calibri', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          color: "#000",
          position: "relative",
          boxSizing: "border-box",
        }}>

          {/* Header Section */}
          <div style={{
            display: "flex",
            alignItems: "flex-start",
            marginBottom: "50px",
          }}>
            {/* Logo */}
            <div style={{ marginRight: "30px", flexShrink: 0 }}>
              <img
                src="/dzi-logo.jpg"
                alt="DZI Holistik Logo"
                style={{ width: "120px", height: "auto" }}
              />
            </div>

            {/* Title + Address - Center aligned */}
            <div style={{ flex: 1, textAlign: "center", paddingRight: "40px" }}>
              <h1 style={{
                fontSize: "32px",
                fontWeight: "bold",
                margin: "0 0 8px 0",
                letterSpacing: "1px",
              }}>
                PAYMENT VOUCHER
              </h1>
              <p style={{
                fontSize: "15px",
                fontWeight: "bold",
                margin: "0 0 6px 0",
              }}>
                DZI HOLISTIK
              </p>
              <p style={{ fontSize: "11px", margin: "0 0 1px 0" }}>
                PT2811, TINGKAT 1 TAMAN D'SAID KG PADANG LANDAK,
              </p>
              <p style={{ fontSize: "11px", margin: "0 0 1px 0" }}>
                MUKIM PELAGAT, 22000 JERTEH, TERENGGANU
              </p>
              <p style={{ fontSize: "11px", margin: "0 0 1px 0" }}>
                TEL: 011-1523 4741
              </p>
              <p style={{ fontSize: "11px", margin: "0" }}>
                EMEL: dziholistik@gmail.com
              </p>
            </div>
          </div>

          {/* Voucher Details */}
          <div style={{ marginBottom: "60px", paddingLeft: "20px" }}>
            {fields.map((field, idx) => (
              <div key={idx} style={{
                display: "flex",
                alignItems: "flex-start",
                marginBottom: "12px",
              }}>
                <span style={{
                  width: "220px",
                  fontWeight: "bold",
                  fontSize: "14px",
                  flexShrink: 0,
                }}>
                  {field.label}
                </span>
                <span style={{
                  width: "20px",
                  fontSize: "14px",
                  textAlign: "center",
                  flexShrink: 0,
                }}>
                  :
                </span>
                <span style={{
                  flex: 1,
                  fontSize: "14px",
                }}>
                  {field.value}
                </span>
              </div>
            ))}
          </div>

          {/* Spacer */}
          <div style={{ height: "60px" }}></div>

          {/* Authorization Section */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            paddingLeft: "20px",
            paddingRight: "20px",
          }}>
            {/* Prepared by */}
            <div style={{ width: "45%" }}>
              <p style={{
                fontSize: "13px",
                fontWeight: "bold",
                marginBottom: "60px",
              }}>
                Prepared by:
              </p>
              <p style={{
                fontSize: "11px",
                borderTop: "1px solid #000",
                paddingTop: "6px",
                textAlign: "center",
                margin: 0,
              }}>
                (WAN DAHLIA ANGGUN BINTI WAN MOHAMAD NAZERI)
              </p>
            </div>

            {/* Approved by */}
            <div style={{ width: "45%" }}>
              <p style={{
                fontSize: "13px",
                fontWeight: "bold",
                marginBottom: "4px",
              }}>
                Approved by:
              </p>
              <img
                src="/signature.jpg"
                alt="Signature"
                style={{ width: "120px", height: "auto", marginBottom: "4px" }}
              />
              <p style={{
                fontSize: "11px",
                fontWeight: "bold",
                borderTop: "1px solid #000",
                paddingTop: "6px",
                textAlign: "center",
                margin: 0,
              }}>
                (MUHAMMAD FAHMI BIN RAMELAN)
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PaymentVoucherInvoice;
