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
import ReportingSpendBOD from "./pages/ReportingSpendBOD";
import Logistics from "./pages/Logistics";
import Finance from "./pages/Finance";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import NinjavanSettings from "./pages/NinjavanSettings";
import Top10 from "./pages/Top10";
import ReportSales from "./pages/ReportSales";
import ReportLeads from "./pages/ReportLeads";
import DashboardLogistic from "./pages/DashboardLogistic";
import ReportPembelian from "./pages/ReportPembelian";
import Profile from "./pages/Profile";
import PNL from "./pages/PNL";
import PNLConfig from "./pages/PNLConfig";
import AdminLeads from "./pages/AdminLeads";
import ReportAdminProspect from "./pages/ReportAdminProspect";
import Invoice from "./pages/Invoice";
// New Logistic Role components
import LogisticProductManagement from "./components/logistic/LogisticProductManagement";
import LogisticProductTransaction from "./components/logistic/LogisticProductTransaction";
import LogisticBundleTransaction from "./components/logistic/LogisticBundleTransaction";
import LogisticStockIn from "./components/logistic/LogisticStockIn";
import LogisticStockOut from "./components/logistic/LogisticStockOut";
import LogisticBundleManagement from "./components/logistic/LogisticBundleManagement";
import LogisticOrder from "./components/logistic/LogisticOrder";
import LogisticProcessed from "./components/logistic/LogisticProcessed";
import LogisticReturn from "./components/logistic/LogisticReturn";
import LogisticPendingTracking from "./components/logistic/LogisticPendingTracking";
import LogisticCustomers from "./components/logistic/LogisticCustomers";
// Marketer components
import MarketerBundleTransaction from "./components/marketer/MarketerBundleTransaction";
// Account components
import AccountPengesahan from "./components/account/AccountPengesahan";
import AccountApproved from "./components/account/AccountApproved";

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
                <Route path="/invoice" element={<Invoice />} />
                <Route path="/dashboard" element={<DashboardLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="orders" element={<Orders />} />
                  <Route path="orders/new" element={<OrderForm />} />
                  <Route path="prospects" element={<Prospects />} />
                  <Route path="spend" element={<Spend />} />
                  <Route path="reporting-spend" element={<ReportingSpend />} />
                  <Route path="reporting-spend-bod" element={<ReportingSpendBOD />} />
                  <Route path="top10" element={<Top10 />} />
                  <Route path="pnl" element={<PNL />} />
                  <Route path="bundle-date-order" element={<MarketerBundleTransaction />} />
                  <Route path="pnl-config" element={<PNLConfig />} />
                  <Route path="report-sales" element={<ReportSales />} />
                  <Route path="report-leads" element={<ReportLeads />} />
                  <Route path="report-admin-prospect" element={<ReportAdminProspect />} />
                  <Route path="dashboard-logistic" element={<DashboardLogistic />} />
                  <Route path="report-pembelian" element={<ReportPembelian />} />
                  <Route path="logistics" element={<Logistics />} />
                  {/* New Logistic Role routes - Inventory */}
                  <Route path="logistics/inventory-product" element={<LogisticProductManagement />} />
                  <Route path="logistics/inventory-transaction" element={<LogisticProductTransaction />} />
                  <Route path="logistics/inventory-transaction-bundle" element={<LogisticBundleTransaction />} />
                  <Route path="logistics/stock-in" element={<LogisticStockIn />} />
                  <Route path="logistics/stock-out" element={<LogisticStockOut />} />
                  <Route path="logistics/inventory-bundle" element={<LogisticBundleManagement />} />
                  {/* New Logistic Role routes - Logistics */}
                  <Route path="logistics/order" element={<LogisticOrder />} />
                  <Route path="logistics/processed" element={<LogisticProcessed />} />
                  <Route path="logistics/return" element={<LogisticReturn />} />
                  <Route path="logistics/pending-tracking" element={<LogisticPendingTracking />} />
                  {/* New Logistic Role routes - Customer HQ */}
                  <Route path="logistics/customers" element={<LogisticCustomers />} />
                  <Route path="logistics/ninjavan-settings" element={<NinjavanSettings />} />
                  {/* Account Role routes */}
                  <Route path="account/pengesahan" element={<AccountPengesahan />} />
                  <Route path="account/approved" element={<AccountApproved />} />
                  <Route path="finance" element={<Finance />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="admin/leads" element={<AdminLeads />} />
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
