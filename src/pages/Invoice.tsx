import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Loader2, FileText } from "lucide-react";

// Default company info (fallback if not configured)
const DEFAULT_COMPANY = {
  name: "DFR EMPIRE SDN BHD",
  reg: "",
  address: "",
  phone: "",
  email: "",
  website: "dfrventure.com",
};

const Invoice = () => {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("order");
  const invoiceType = searchParams.get("type"); // "customer" for customer_purchases
  const [orderData, setOrderData] = useState<any>(null);
  const [companyInfo, setCompanyInfo] = useState(DEFAULT_COMPANY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch invoice settings for company info
        const { data: invoiceSettings } = await supabase
          .from("invoice_settings")
          .select("*")
          .limit(1)
          .single();

        if (invoiceSettings) {
          setCompanyInfo({
            name: invoiceSettings.company_name || DEFAULT_COMPANY.name,
            reg: invoiceSettings.registration_no || "",
            address: invoiceSettings.address || "",
            phone: invoiceSettings.phone || "",
            email: invoiceSettings.email || "",
            website: invoiceSettings.website || "",
          });
        }

        if (invoiceType === "customer" && orderId) {
          // Fetch customer purchase by ID
          const { data: purchase, error } = await supabase
            .from("customer_purchases")
            .select(`
              *,
              bundle:logistic_bundles(name, sku)
            `)
            .eq("id", orderId)
            .single();

          if (error) throw error;
          if (!purchase) {
            setOrderData(null);
            return;
          }

          setOrderData({
            type: "customer",
            id: purchase.id,
            id_sale: purchase.id_sale,
            date_order: purchase.date_order,
            date_processed: purchase.date_processed,
            customer_name: purchase.name_customer,
            customer_phone: purchase.phone_customer,
            customer_address: purchase.address_customer,
            customer_city: purchase.city_customer,
            customer_postcode: purchase.postcode_customer,
            customer_state: purchase.state_customer,
            bundle_name: purchase.bundle?.name,
            bundle_sku: purchase.bundle?.sku,
            unit: purchase.unit || 1,
            total_sale: purchase.total_sale,
            type_payment: purchase.type_payment,
            delivery_status: purchase.delivery_status,
            jenis_platform: purchase.jenis_platform,
            jenis_closing: purchase.jenis_closing,
            jenis_customer: purchase.jenis_customer,
            tracking_number: purchase.tracking_number,
            marketer_name: purchase.marketer_name,
            marketer_id_staff: purchase.marketer_id_staff,
            seo: purchase.seo,
          });
        }
      } catch (error) {
        console.error("Error fetching invoice data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [orderId, invoiceType]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-gray-600">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (!orderData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800">Invoice Not Found</h2>
          <p className="text-gray-600 mt-2">Order ID: {orderId}</p>
        </div>
      </div>
    );
  }

  // Render Customer Purchase Invoice
  return (
    <div className="min-h-screen bg-white p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8 pb-8 border-b-2 border-gray-200">
          <div>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {companyInfo.name} {companyInfo.reg ? `(${companyInfo.reg})` : ""}
              </h2>
              {companyInfo.address && <p className="text-sm text-gray-700 mt-1">{companyInfo.address}</p>}
              {companyInfo.phone && <p className="text-sm text-gray-700">Tel: {companyInfo.phone}</p>}
              {companyInfo.email && <p className="text-sm text-gray-700">Email: {companyInfo.email}</p>}
              {companyInfo.website && <p className="text-sm text-gray-700">Website: {companyInfo.website}</p>}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">INVOICE</h1>
            <p className="text-gray-600 mt-1">
              Order #{orderData.id_sale || orderData.id?.substring(0, 8)}
            </p>
          </div>
          <div className="sm:text-right">
            <div className={`inline-block px-4 py-2 rounded-lg mb-4 ${
              orderData.delivery_status === "Shipped" ? "bg-blue-50" :
              orderData.delivery_status === "Return" ? "bg-red-50" :
              "bg-yellow-50"
            }`}>
              <span className={`font-bold text-lg uppercase ${
                orderData.delivery_status === "Shipped" ? "text-blue-600" :
                orderData.delivery_status === "Return" ? "text-red-600" :
                "text-yellow-600"
              }`}>
                {orderData.delivery_status}
              </span>
            </div>
            <p className="text-sm text-gray-600">Invoice Date</p>
            <p className="text-lg font-semibold text-gray-900">
              {orderData.date_order ? format(new Date(orderData.date_order), "dd MMMM yyyy") : "-"}
            </p>
            <p className="text-sm text-gray-600 mt-2">Platform</p>
            <p className="text-sm font-medium text-gray-700">
              {orderData.jenis_platform || "Manual"}
            </p>
          </div>
        </div>

        {/* Billing Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 mb-8">
          <div>
            <h2 className="text-sm font-semibold text-gray-600 uppercase mb-3">Bill To</h2>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="font-bold text-lg text-gray-900">
                {orderData.customer_name?.toUpperCase() || "CUSTOMER"}
              </p>
              <p className="text-sm text-gray-700 mt-2">
                Phone: {orderData.customer_phone || "-"}
              </p>
              {orderData.customer_address && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-1">Delivery Address</p>
                  <p className="text-sm text-gray-700">{orderData.customer_address}</p>
                  {orderData.customer_postcode && (
                    <p className="text-sm text-gray-700">
                      {orderData.customer_postcode} {orderData.customer_city}
                    </p>
                  )}
                  <p className="text-sm text-gray-700">{orderData.customer_state}</p>
                </div>
              )}
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-600 uppercase mb-3">Payment Information</h2>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Payment Method</span>
                  <span className={`text-sm font-semibold px-2 py-0.5 rounded ${
                    orderData.type_payment === "COD" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"
                  }`}>
                    {orderData.type_payment || "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Platform</span>
                  <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                    orderData.jenis_platform === "Facebook"
                      ? "bg-blue-100 text-blue-800"
                      : orderData.jenis_platform === "Tiktok"
                      ? "bg-pink-100 text-pink-800"
                      : orderData.jenis_platform === "Shopee"
                      ? "bg-orange-100 text-orange-800"
                      : orderData.jenis_platform === "Database"
                      ? "bg-purple-100 text-purple-800"
                      : orderData.jenis_platform === "Google"
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}>
                    {orderData.jenis_platform || "Manual"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Closing Type</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {orderData.jenis_closing || "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Customer Type</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {orderData.jenis_customer || "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Status</span>
                  <span className={`text-sm font-bold uppercase ${
                    orderData.delivery_status === "Shipped" ? "text-blue-600" :
                    orderData.delivery_status === "Return" ? "text-red-600" :
                    "text-yellow-600"
                  }`}>{orderData.delivery_status}</span>
                </div>
                {orderData.tracking_number && (
                  <div className="flex justify-between pt-2 border-t border-gray-200">
                    <span className="text-sm text-gray-600">Tracking No.</span>
                    <span className="text-xs font-mono text-gray-700">
                      {orderData.tracking_number}
                    </span>
                  </div>
                )}
                {orderData.seo && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">SEO Status</span>
                    <span className={`text-sm font-semibold ${
                      orderData.seo === "Successful Delivery" ? "text-green-600" : "text-gray-600"
                    }`}>
                      {orderData.seo}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-600 uppercase mb-3">Order Details</h2>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full min-w-[500px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Product</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Quantity</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Total</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                <tr className="border-b border-gray-100">
                  <td className="py-4 px-4">
                    <p className="font-semibold text-gray-900">{orderData.bundle_name || "Product"}</p>
                    {orderData.bundle_sku && (
                      <p className="text-xs text-gray-500">SKU: {orderData.bundle_sku}</p>
                    )}
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className="inline-block bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-semibold">
                      {orderData.unit}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right font-bold text-gray-900">
                    RM {parseFloat(orderData.total_sale || 0).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Marketer Info */}
        {orderData.marketer_name && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-600 uppercase mb-3">Sales Information</h2>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Sales Person</span>
                <span className="text-sm font-semibold text-gray-900">
                  {orderData.marketer_name} ({orderData.marketer_id_staff})
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Total Summary */}
        <div className="flex justify-end mb-8">
          <div className="w-full sm:w-80">
            <div className="bg-gray-50 rounded-lg p-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-semibold text-gray-900">
                  RM {parseFloat(orderData.total_sale || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tax (0%)</span>
                <span className="font-semibold text-gray-900">RM 0.00</span>
              </div>
              <div className="border-t border-gray-300 pt-3 flex justify-between">
                <span className="text-lg font-bold text-gray-900">Total Amount</span>
                <span className="text-2xl font-bold text-blue-600">
                  RM {parseFloat(orderData.total_sale || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t-2 border-gray-200 pt-6 mt-8">
          <div className="text-center space-y-2">
            <p className="text-sm text-gray-600">Thank you for your business!</p>
            <p className="text-xs text-gray-500">
              This is a computer-generated invoice and does not require a signature.
            </p>
            <p className="text-xs text-gray-400 mt-4">
              Generated on {format(new Date(), "dd MMMM yyyy 'at' HH:mm")}
            </p>
          </div>
        </div>

        {/* Print Button - Hidden when printing */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center print:hidden">
          <button
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg shadow-lg transition-colors"
          >
            Print Invoice
          </button>
          <button
            onClick={() => window.close()}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold px-8 py-3 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Print-specific styles */}
      <style>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default Invoice;
