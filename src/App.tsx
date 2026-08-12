import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Suspense, lazy } from "react";
import type { ReactElement } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider, useAuth } from "@/context/AuthContext";
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
const Integration = lazy(() => import("./pages/Integration"));
const TeamManagement = lazy(() => import("./pages/TeamManagement"));
// Superadmin (SaaS owner) pages
const AdminClients = lazy(() => import("./pages/admin/AdminClients"));
const AdminTransactions = lazy(() => import("./pages/admin/AdminTransactions"));
const AdminTickets = lazy(() => import("./pages/admin/AdminTickets"));
const AdminPricing = lazy(() => import("./pages/admin/AdminPricing"));
const AdminClientManage = lazy(() => import("./pages/admin/AdminClientManage"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
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
const SalesOverview = lazy(() => import("./components/account/SalesOverview"));
const AccountReportProfit = lazy(() => import("./components/account/AccountReportProfit"));
const AccountInvoiceSettings = lazy(() => import("./components/account/AccountInvoiceSettings"));
const AccountOrderCash = lazy(() => import("./components/account/AccountOrderCash"));
const AccountPendingTracking = lazy(() => import("./components/account/AccountPendingTracking"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

// Role separation: the platform owner (superadmin) is a reporting/settings role
// and must never reach the client order-entry pages; clients must never reach
// the admin pages. RoleGate redirects the wrong role to its own home.
const RoleGate = ({ need, allowExpired, marketerOk, logisticOk, children }: { need: "admin" | "client"; allowExpired?: boolean; marketerOk?: boolean; logisticOk?: boolean; children: ReactElement }) => {
  const { profile, isLoading } = useAuth();
  const location = useLocation();
  const isClientTenant = profile?.role === "client";
  // Has this client filled in their ParcelDaily Merchant ID + Token? Cached so
  // navigation doesn't refetch constantly; invalidated after they save the config.
  const { data: courierConfigured } = useQuery({
    queryKey: ["courier-configured", profile?.id],
    enabled: isClientTenant,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("parceldaily_config")
        .select("merchant_id, token")
        .limit(1)
        .maybeSingle();
      return !!(data?.merchant_id?.trim() && data?.token?.trim());
    },
  });

  if (isLoading) return <RouteFallback />;
  const isAdmin = profile?.role === "superadmin";
  const isMarketer = profile?.role === "marketer";
  const isLogistic = profile?.role === "logistic";
  if (need === "admin" && !isAdmin) return <Navigate to="/dashboard" replace />;
  if (need === "client" && isAdmin) return <Navigate to="/dashboard/admin/clients" replace />;
  // Marketer staff: restricted to their own Marketer Role pages + Profile.
  // Everything else (logistic, finance, integration, courier, billing, team)
  // bounces back to their dashboard.
  if (need === "client" && isMarketer && !marketerOk) return <Navigate to="/dashboard" replace />;
  // Logistic staff: restricted to the Logistic section + Dashboard + Profile.
  if (need === "client" && isLogistic && !logisticOk) return <Navigate to="/dashboard" replace />;
  // Expired / deactivated clients keep read access to nothing but Billing (to
  // resubscribe) and Profile. Staff (marketer/logistic) follow the client's
  // tenant and are never expiry-frozen or courier-gated here.
  if (need === "client" && !isAdmin && !isMarketer && !isLogistic && !allowExpired) {
    const exp = profile?.planExpiresAt ? new Date(profile.planExpiresAt) : null;
    const frozen = profile?.isActive === false || (exp !== null && exp.getTime() < Date.now());
    if (frozen) return <Navigate to="/dashboard/billing" replace />;

    // Not expired but ParcelDaily not set up yet → force Courier Settings first.
    // (Profile has no gate and Billing uses allowExpired, so both stay reachable.)
    const onCourier = location.pathname.includes("courier");
    if (isClientTenant && !onCourier) {
      if (courierConfigured === undefined) return <RouteFallback />; // still checking
      if (!courierConfigured) return <Navigate to="/dashboard/settings/courier" replace />;
    }
  }
  return children;
};

// /dashboard home: admins land on cross-client Reporting, clients on their own
// order dashboard.
const DashboardHome = () => {
  const { profile, isLoading } = useAuth();
  if (isLoading) return <RouteFallback />;
  if (profile?.role === "superadmin") return <Navigate to="/dashboard/admin/clients" replace />;
  // Wrap in RoleGate (marketerOk so staff keep their dashboard) so the expiry +
  // courier-config gates also apply to the home dashboard.
  return <RoleGate need="client" marketerOk logisticOk><Dashboard /></RoleGate>;
};

const clientOnly = (el: ReactElement) => <RoleGate need="client">{el}</RoleGate>;
// Pages a marketer staff may reach (their own Marketer Role work).
const marketerAllowed = (el: ReactElement) => <RoleGate need="client" marketerOk>{el}</RoleGate>;
// Pages a logistic staff may reach (the Logistic section). Client also allowed.
const logisticAllowed = (el: ReactElement) => <RoleGate need="client" logisticOk>{el}</RoleGate>;
// Billing stays reachable even when the plan has expired (that's where they resubscribe).
const clientBilling = (el: ReactElement) => <RoleGate need="client" allowExpired>{el}</RoleGate>;
const adminOnly = (el: ReactElement) => <RoleGate need="admin">{el}</RoleGate>;

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
                    <Route index element={<DashboardHome />} />
                    {/* Marketer Role — client + their marketer staff */}
                    <Route path="orders" element={marketerAllowed(<Orders />)} />
                    <Route path="orders/new" element={marketerAllowed(<OrderForm />)} />
                    <Route path="prospects" element={marketerAllowed(<Prospects />)} />
                    <Route path="spend" element={marketerAllowed(<Spend />)} />
                    <Route path="reporting-spend" element={marketerAllowed(<ReportingSpend />)} />
                    <Route path="team" element={clientOnly(<TeamManagement />)} />
                    <Route path="webhook-settings" element={clientOnly(<MarketerWebhookSettings />)} />
                    <Route path="integration" element={clientOnly(<Integration />)} />
                    {/* Logistic Role - Inventory (client + logistic staff) */}
                    <Route path="logistics/inventory-product" element={logisticAllowed(<LogisticProductManagement />)} />
                    <Route path="logistics/inventory-bundle" element={logisticAllowed(<LogisticBundleManagement />)} />
                    {/* Logistic Role - Orders (client + logistic staff) */}
                    <Route path="logistics/order" element={logisticAllowed(<LogisticOrder />)} />
                    <Route path="logistics/processed" element={logisticAllowed(<LogisticProcessed />)} />
                    <Route path="logistics/return" element={logisticAllowed(<LogisticReturn />)} />
                    <Route path="logistics/pending-tracking" element={logisticAllowed(<LogisticPendingTracking />)} />
                    <Route path="logistics/courier-settings" element={clientOnly(<CourierSettings />)} />
                    <Route path="settings/courier" element={clientOnly(<CourierSettings />)} />
                    {/* Account Role */}
                    <Route path="account/sales-overview" element={clientOnly(<SalesOverview />)} />
                    <Route path="account/report-profit" element={clientOnly(<AccountReportProfit />)} />
                    <Route path="account/pending-tracking" element={clientOnly(<AccountPendingTracking />)} />
                    <Route path="account/order-cash" element={clientOnly(<AccountOrderCash />)} />
                    <Route path="account/invoice-settings" element={clientOnly(<AccountInvoiceSettings />)} />
                    {/* Support — client ticket submission */}
                    <Route path="tickets" element={clientOnly(<Tickets />)} />
                    {/* Superadmin — reporting + settings only */}
                    <Route path="admin/clients" element={adminOnly(<AdminClients />)} />
                    <Route path="admin/manage-clients" element={adminOnly(<AdminClientManage />)} />
                    <Route path="admin/settings" element={adminOnly(<AdminSettings />)} />
                    <Route path="admin/transactions" element={adminOnly(<AdminTransactions />)} />
                    <Route path="admin/tickets" element={adminOnly(<AdminTickets />)} />
                    <Route path="admin/pricing" element={adminOnly(<AdminPricing />)} />
                    {/* Bottom nav — Billing is client-only; Profile shared */}
                    <Route path="billing" element={clientBilling(<Billing />)} />
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
