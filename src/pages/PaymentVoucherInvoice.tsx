import { useEffect, useState, useRef } from "react";
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

// Convert image URL to base64 data URL
const toBase64 = (url: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
};

const PaymentVoucherInvoice = () => {
  const { id } = useParams();
  const [voucher, setVoucher] = useState<PaymentVoucher | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoBase64, setLogoBase64] = useState("");
  const [sigAnggunBase64, setSigAnggunBase64] = useState("");
  const [sigFahmiBase64, setSigFahmiBase64] = useState("");
  const imagesReady = useRef(false);

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

  // Convert all images to base64 on mount
  useEffect(() => {
    const loadImages = async () => {
      const [logo, sigA, sigF] = await Promise.all([
        toBase64("/dzi-logo.jpg"),
        toBase64("/signature-shuhada.png"),
        toBase64("/signature.jpg"),
      ]);
      setLogoBase64(logo);
      setSigAnggunBase64(sigA);
      setSigFahmiBase64(sigF);
      imagesReady.current = true;
    };
    loadImages();
  }, []);

  const downloadPDF = () => {
    // Small delay to ensure base64 images are rendered
    setTimeout(() => {
      window.print();
    }, 300);
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
            background: #fff !important;
          }
          html, body {
            width: 210mm;
            height: 297mm;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          img {
            display: inline-block !important;
            visibility: visible !important;
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
        {/* A4 Page - Double border */}
        <div style={{
          width: "210mm",
          minHeight: "297mm",
          background: "#fff",
          border: "2px solid #000",
          outline: "1px solid #000",
          outlineOffset: "4px",
          padding: "50px 55px",
          fontFamily: "'Calibri', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          color: "#000",
          boxSizing: "border-box",
        }}>

          {/* Header Section */}
          <div style={{
            display: "flex",
            alignItems: "flex-start",
            marginBottom: "40px",
          }}>
            {/* Logo */}
            <div style={{ marginRight: "20px", flexShrink: 0 }}>
              {logoBase64 && (
                <img
                  src={logoBase64}
                  alt="DZI Holistik Logo"
                  style={{ width: "140px", height: "auto" }}
                />
              )}
            </div>

            {/* Title + Address - Center aligned */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <h1 style={{
                fontSize: "36px",
                fontWeight: "bold",
                margin: "0 0 6px 0",
                letterSpacing: "1px",
              }}>
                PAYMENT VOUCHER
              </h1>
              <p style={{
                fontSize: "14px",
                fontWeight: "bold",
                margin: "0 0 4px 0",
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
          <div style={{ marginBottom: "80px", paddingLeft: "30px" }}>
            {fields.map((field, idx) => (
              <div key={idx} style={{
                display: "flex",
                alignItems: "flex-start",
                marginBottom: "6px",
              }}>
                <span style={{
                  width: "240px",
                  fontWeight: "bold",
                  fontSize: "15px",
                  flexShrink: 0,
                }}>
                  {field.label}
                </span>
                <span style={{
                  width: "30px",
                  fontSize: "15px",
                  textAlign: "center",
                  flexShrink: 0,
                }}>
                  :
                </span>
                <span style={{
                  flex: 1,
                  fontSize: "15px",
                }}>
                  {field.value}
                </span>
              </div>
            ))}
          </div>

          {/* Spacer */}
          <div style={{ height: "40px" }}></div>

          {/* Authorization Section */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            paddingLeft: "30px",
            paddingRight: "30px",
          }}>
            {/* Prepared by */}
            <div style={{ textAlign: "left", width: "260px" }}>
              <p style={{
                fontSize: "14px",
                fontWeight: "bold",
                marginBottom: "4px",
              }}>
                Prepared by:
              </p>
              {sigAnggunBase64 && (
                <img
                  src={sigAnggunBase64}
                  alt="Shuhada Signature"
                  style={{ height: "50px", width: "auto", marginBottom: "2px", display: "block" }}
                />
              )}
              <p style={{
                fontSize: "13px",
                fontWeight: "bold",
                margin: 0,
              }}>
                (NIK NURSHUHADA BINTI NIK MOHD SAMRI)
              </p>
              <p style={{
                fontSize: "11px",
                fontWeight: "bold",
                margin: "2px 0 0 0",
              }}>
                GENERAL MANAGER
              </p>
            </div>

            {/* Approved by */}
            <div style={{ textAlign: "left", width: "260px" }}>
              <p style={{
                fontSize: "14px",
                fontWeight: "bold",
                marginBottom: "4px",
              }}>
                Approved by:
              </p>
              {sigFahmiBase64 && (
                <img
                  src={sigFahmiBase64}
                  alt="Signature"
                  style={{ height: "50px", width: "auto", marginBottom: "2px", display: "block" }}
                />
              )}
              <p style={{
                fontSize: "13px",
                fontWeight: "bold",
                margin: 0,
              }}>
                (MUHAMMAD FAHMI BIN RAMELAN)
              </p>
              <p style={{
                fontSize: "11px",
                fontWeight: "bold",
                margin: "2px 0 0 0",
              }}>
                DIRECTOR
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PaymentVoucherInvoice;
