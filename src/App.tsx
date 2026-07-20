import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { DataProvider } from "@/context/DataContext";
import { BundleProvider } from "@/context/BundleContext";
// Public entry points stay eager so the marketing landing + login paint
// instantly with no extra round-trip.
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import SalesLanding from "./sales/SalesLanding";
import CheckoutPage from "./sales/CheckoutPage";

// Everything behind /dashboard (and the standalone invoice view) is lazy-loaded
// so a first-time visitor to "/" never downloads the whole app. The dashboard
// bundle is fetched on demand only after the user navigates in / logs in.
const DashboardLayout = lazy(() => import("./components/layout/DashboardLayout"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderForm = lazy(() => import("./pages/OrderForm"));
const Prospects = lazy(() => import("./pages/Prospects"));
const Spend = lazy(() => import("./pages/Spend"));
const ReportingSpend = lazy(() => import("./pages/ReportingSpend"));
const CourierSettings = lazy(() => import("./pages/CourierSettings"));
const Billing = lazy(() => import("./pages/Billing"));
const Profile = lazy(() => import("./pages/Profile"));
const Invoice = lazy(() => import("./pages/Invoice"));
const Tickets = lazy(() => import("./pages/Tickets"));
// Superadmin (SaaS owner) pages
const AdminClients = lazy(() => import("./pages/admin/AdminClients"));
const AdminTransactions = lazy(() => import("./pages/admin/AdminTransactions"));
const AdminTickets = lazy(() => import("./pages/admin/AdminTickets"));
const AdminPricing = lazy(() => import("./pages/admin/AdminPricing"));
// Marketer components
const MarketerWebhookSettings = lazy(() => import("./components/marketer/MarketerWebhookSettings"));
// Logistic Role components
const LogisticProductManagement = lazy(() => import("./components/logistic/LogisticProductManagement"));
const LogisticBundleManagement = lazy(() => import("./components/logistic/LogisticBundleManagement"));
const LogisticOrder = lazy(() => import("./components/logistic/LogisticOrder"));
const LogisticProcessed = lazy(() => import("./components/logistic/LogisticProcessed"));
const LogisticReturn = lazy(() => import("./components/logistic/LogisticReturn"));
const LogisticPendingTracking = lazy(() => import("./components/logistic/LogisticPendingTracking"));
// Account Role components
const AccountReportProfit = lazy(() => import("./components/account/AccountReportProfit"));
const AccountInvoiceSettings = lazy(() => import("./components/account/AccountInvoiceSettings"));
const AccountPendingTracking = lazy(() => import("./components/account/AccountPendingTracking"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <DataProvider>
        <BundleProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  {/* Public marketing routes — no forced login */}
                  <Route path="/" element={<SalesLanding />} />
                  <Route path="/checkout" element={<CheckoutPage />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/invoice" element={<Invoice />} />
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
                    <Route path="logistics/courier-settings" element={<CourierSettings />} />
                    <Route path="settings/courier" element={<CourierSettings />} />
                    {/* Account Role */}
                    <Route path="account/report-profit" element={<AccountReportProfit />} />
                    <Route path="account/pending-tracking" element={<AccountPendingTracking />} />
                    <Route path="account/invoice-settings" element={<AccountInvoiceSettings />} />
                    {/* Support */}
                    <Route path="tickets" element={<Tickets />} />
                    {/* Superadmin */}
                    <Route path="admin/clients" element={<AdminClients />} />
                    <Route path="admin/transactions" element={<AdminTransactions />} />
                    <Route path="admin/tickets" element={<AdminTickets />} />
                    <Route path="admin/pricing" element={<AdminPricing />} />
                    {/* Bottom nav */}
                    <Route path="billing" element={<Billing />} />
                    <Route path="profile" element={<Profile />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </BundleProvider>
      </DataProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
