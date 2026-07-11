import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { DataProvider } from "@/context/DataContext";
import { BundleProvider } from "@/context/BundleContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/layout/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import OrderForm from "./pages/OrderForm";
import Prospects from "./pages/Prospects";
import Spend from "./pages/Spend";
import ReportingSpend from "./pages/ReportingSpend";
import CourierSettings from "./pages/CourierSettings";
import Billing from "./pages/Billing";
import Profile from "./pages/Profile";
import InvoiceView from "./pages/InvoiceView";
// Marketer components
import MarketerWebhookSettings from "./components/marketer/MarketerWebhookSettings";
// Logistic Role components
import LogisticProductManagement from "./components/logistic/LogisticProductManagement";
import LogisticBundleManagement from "./components/logistic/LogisticBundleManagement";
import LogisticOrder from "./components/logistic/LogisticOrder";
import LogisticProcessed from "./components/logistic/LogisticProcessed";
import LogisticReturn from "./components/logistic/LogisticReturn";
import LogisticPendingTracking from "./components/logistic/LogisticPendingTracking";
import LogisticCustomers from "./components/logistic/LogisticCustomers";
import LogisticUpdateCostProduct from "./components/logistic/LogisticUpdateCostProduct";
// Account Role components
import AccountExpenses from "./components/account/AccountExpenses";
import AccountInvoiceSettings from "./components/account/AccountInvoiceSettings";
import AccountInvoices from "./components/account/AccountInvoices";
import AccountReportProfit from "./components/account/AccountReportProfit";
import AccountPendingTracking from "./components/account/AccountPendingTracking";
import AccountSuccessTracking from "./components/account/AccountSuccessTracking";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <DataProvider>
        <BundleProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/invoice-view/:id" element={<InvoiceView />} />
                <Route path="/dashboard" element={<DashboardLayout />}>
                  <Route index element={<Dashboard />} />
                  {/* Marketer Role */}
                  <Route path="orders" element={<Orders />} />
                  <Route path="orders/new" element={<OrderForm />} />
                  <Route path="prospects" element={<Prospects />} />
                  <Route path="spend" element={<Spend />} />
                  <Route path="reporting-spend" element={<ReportingSpend />} />
                  <Route path="webhook-settings" element={<MarketerWebhookSettings />} />
                  {/* Logistic Role - Inventory */}
                  <Route path="logistics/inventory-product" element={<LogisticProductManagement />} />
                  <Route path="logistics/inventory-bundle" element={<LogisticBundleManagement />} />
                  {/* Logistic Role - Orders */}
                  <Route path="logistics/order" element={<LogisticOrder />} />
                  <Route path="logistics/processed" element={<LogisticProcessed />} />
                  <Route path="logistics/return" element={<LogisticReturn />} />
                  <Route path="logistics/pending-tracking" element={<LogisticPendingTracking />} />
                  <Route path="logistics/customers" element={<LogisticCustomers />} />
                  <Route path="logistics/update-cost-product" element={<LogisticUpdateCostProduct />} />
                  <Route path="logistics/courier-settings" element={<CourierSettings />} />
                  <Route path="settings/courier" element={<CourierSettings />} />
                  {/* Account Role */}
                  <Route path="account/report-profit" element={<AccountReportProfit />} />
                  <Route path="account/expenses" element={<AccountExpenses />} />
                  <Route path="account/pending-tracking" element={<AccountPendingTracking />} />
                  <Route path="account/success-tracking" element={<AccountSuccessTracking />} />
                  <Route path="account/invoice-settings" element={<AccountInvoiceSettings />} />
                  <Route path="account/invoices" element={<AccountInvoices />} />
                  {/* Bottom nav */}
                  <Route path="billing" element={<Billing />} />
                  <Route path="profile" element={<Profile />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </BundleProvider>
      </DataProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
