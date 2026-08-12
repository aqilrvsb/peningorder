import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Truck,
  DollarSign,
  BarChart3,
  Settings,
  LogOut,
  ClipboardList,
  PanelLeftClose,
  PanelLeft,
  History,
  Package,
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  Trophy,
  UserCircle,
  RotateCcw,
  FileSpreadsheet,
  TrendingUp,
  Clock,
  CheckCircle,
  CreditCard,
  Ticket,
  ShieldCheck,
  XCircle,
  FileText,
  Receipt,
  Banknote,
  Webhook,
  FilePlus,
  Database,
  ScanLine,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Megaphone,
  Plug,
  Lock,
  X,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

// ============ MARKETER ROLE ============
const marketerItems: NavItem[] = [
  { label: 'Order', path: '/dashboard/orders/new', icon: <ClipboardList className="w-5 h-5" /> },
  { label: 'History', path: '/dashboard/orders', icon: <History className="w-5 h-5" /> },
  { label: 'Leads', path: '/dashboard/prospects', icon: <Users className="w-5 h-5" /> },
  { label: 'Spend', path: '/dashboard/spend', icon: <Wallet className="w-5 h-5" /> },
  { label: 'Reporting Spend', path: '/dashboard/reporting-spend', icon: <BarChart3 className="w-5 h-5" /> },
  { label: 'Team', path: '/dashboard/team', icon: <UserPlus className="w-5 h-5" /> },
  // Webhook Settings hidden — replaced by the Integration hub.
];

// ============ LOGISTIC ROLE ============
const logisticItems: NavItem[] = [
  { label: 'Product', path: '/dashboard/logistics/inventory-product', icon: <Package className="w-5 h-5" /> },
  { label: 'Bundle', path: '/dashboard/logistics/inventory-bundle', icon: <Boxes className="w-5 h-5" /> },
  { label: 'Order', path: '/dashboard/logistics/order', icon: <ShoppingCart className="w-5 h-5" /> },
  { label: 'Processed', path: '/dashboard/logistics/processed', icon: <CheckCircle className="w-5 h-5" /> },
  { label: 'Return', path: '/dashboard/logistics/return', icon: <RotateCcw className="w-5 h-5" /> },
  { label: 'Pending Tracking', path: '/dashboard/logistics/pending-tracking', icon: <Clock className="w-5 h-5" /> },
];

// ============ FINANCE ROLE ============
const financeItems: NavItem[] = [
  { label: 'Sales Overview', path: '/dashboard/account/sales-overview', icon: <BarChart3 className="w-5 h-5" /> },
  { label: 'Report Profit', path: '/dashboard/account/report-profit', icon: <TrendingUp className="w-5 h-5" /> },
  { label: 'Pending COD Collection', path: '/dashboard/account/pending-tracking', icon: <DollarSign className="w-5 h-5" /> },
  { label: 'Order Cash', path: '/dashboard/account/order-cash', icon: <Banknote className="w-5 h-5" /> },
  { label: 'Invoice Settings', path: '/dashboard/account/invoice-settings', icon: <FileText className="w-5 h-5" /> },
];

// ============ SUPERADMIN (SaaS owner) ============
// The platform owner does NOT key in orders — they only oversee/report on what
// clients do, plus manage plan pricing & settings. Hence a flat reporting nav,
// no Marketer/Management role menus.
const adminItems: NavItem[] = [
  { label: 'Reporting', path: '/dashboard/admin/clients', icon: <BarChart3 className="w-5 h-5" /> },
  { label: 'Client Management', path: '/dashboard/admin/manage-clients', icon: <Users className="w-5 h-5" /> },
  { label: 'Transactions', path: '/dashboard/admin/transactions', icon: <CreditCard className="w-5 h-5" /> },
  { label: 'Tickets', path: '/dashboard/admin/tickets', icon: <Ticket className="w-5 h-5" /> },
  { label: 'Pricing Plans', path: '/dashboard/admin/pricing', icon: <Receipt className="w-5 h-5" /> },
  { label: 'Settings', path: '/dashboard/admin/settings', icon: <Settings className="w-5 h-5" /> },
];

type GroupKey = 'marketer' | 'logistic' | 'finance';

interface RoleGroup {
  key: GroupKey;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
}

const baseRoleGroups: RoleGroup[] = [
  { key: 'marketer', label: 'Marketer Role', icon: <Megaphone className="w-5 h-5" />, items: marketerItems },
  { key: 'logistic', label: 'Logistic', icon: <Truck className="w-5 h-5" />, items: logisticItems },
  { key: 'finance', label: 'Finance', icon: <DollarSign className="w-5 h-5" />, items: financeItems },
];

const Sidebar: React.FC<{ mobileOpen?: boolean; onClose?: () => void }> = ({ mobileOpen = false, onClose }) => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);

  // The platform owner (superadmin) is a reporting/settings role only — never
  // the client order-entry menus. Clients get the Marketer/Management groups.
  const isAdmin = profile?.role === 'superadmin';
  const isMarketer = profile?.role === 'marketer'; // a client's staff member
  // Expired / deactivated clients: every tab is locked, only Billing (+ Profile)
  // stays reachable — matches the route guard in App.tsx. Staff aren't expiry-frozen.
  const planExp = profile?.planExpiresAt ? new Date(profile.planExpiresAt) : null;
  const frozen = !isAdmin && !isMarketer && (profile?.isActive === false || (planExp !== null && planExp.getTime() < Date.now()));
  // Admin: no role groups. Staff: only the Marketer group, minus the Team page
  // (Team is client-only). Client: all groups.
  const roleGroups: RoleGroup[] = isAdmin
    ? []
    : isMarketer
      ? [{ ...baseRoleGroups[0], items: baseRoleGroups[0].items.filter((i) => i.path !== '/dashboard/team') }]
      : baseRoleGroups;

  // ParcelDaily credit balance (clients only).
  const [pdCredit, setPdCredit] = useState<{ loading: boolean; credit: string | null; configured: boolean }>(
    { loading: false, credit: null, configured: false },
  );
  const fetchPdCredit = async () => {
    setPdCredit((p) => ({ ...p, loading: true }));
    try {
      const { data } = await supabase.functions.invoke('parceldaily-account');
      setPdCredit({ loading: false, credit: data?.ok ? (data.credit ?? null) : null, configured: !!data?.configured });
    } catch {
      setPdCredit({ loading: false, credit: null, configured: false });
    }
  };
  useEffect(() => {
    if (!isAdmin && profile?.id) fetchPdCredit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, isAdmin]);

  // Groups expand/collapse independently. Start with the group whose child
  // page is active (plus Marketer as the default when on the dashboard).
  const initialExpanded: Set<GroupKey> = (() => {
    const set = new Set<GroupKey>();
    for (const g of roleGroups) {
      if (g.items.some((i) => location.pathname.startsWith(i.path))) set.add(g.key);
    }
    if (set.size === 0) set.add('marketer');
    return set;
  })();
  const [expandedGroups, setExpandedGroups] = useState<Set<GroupKey>>(initialExpanded);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const handleNavClick = () => {
    queryClient.invalidateQueries();
    onClose?.(); // close the mobile drawer after navigating
  };

  const isItemActive = (path: string) => location.pathname === path;
  const isDashboardActive = location.pathname === '/dashboard';

  const toggleGroup = (key: GroupKey) => {
    // Independent toggle: each group opens/closes on its own
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <>
      {/* Mobile backdrop — tap to close the drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={cn(
          'bg-background border-r border-border flex flex-col transition-transform duration-300',
          // Mobile: off-canvas fixed drawer (always full width), slides in when open.
          'fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: normal in-flow sidebar, always visible, collapsible.
          'md:static md:z-auto md:translate-x-0 md:min-h-screen md:max-w-none',
          collapsed ? 'md:w-16' : 'md:w-64',
        )}
      >
      {/* Logo & Toggle */}
      <div className="p-4 flex items-center justify-between">
        {!collapsed && (
          <h1 className="text-xl font-bold text-primary">
            pening<span className="text-foreground">order</span>
          </h1>
        )}
        {/* Desktop: collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:block p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
        {/* Mobile: close drawer */}
        <button
          onClick={onClose}
          className="md:hidden p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {!collapsed && (
        <div className="px-6 pb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Navigation
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto pb-3">
        {frozen && !collapsed && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>Langganan tamat. Semua tab dikunci — sila subscribe di <b>Billing</b>.</span>
          </div>
        )}
        <div className={cn('space-y-1', frozen && 'pointer-events-none select-none opacity-40')}>
        {/* Client home (Dashboard). Hidden for admin — the platform owner has
            no personal order dashboard, only cross-client reporting. */}
        {!isAdmin && (
          <Link
            to="/dashboard"
            title={collapsed ? 'Dashboard' : undefined}
            onClick={handleNavClick}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-muted-foreground hover:bg-muted hover:text-foreground',
              isDashboardActive && 'bg-primary text-primary-foreground font-medium hover:bg-primary hover:text-primary-foreground',
              collapsed && 'justify-center px-2'
            )}
          >
            <LayoutDashboard className="w-5 h-5" />
            {!collapsed && <span className="text-sm">Dashboard</span>}
          </Link>
        )}

        {/* Admin reporting nav — flat, no order-entry. */}
        {isAdmin && adminItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            title={collapsed ? item.label : undefined}
            onClick={handleNavClick}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-muted-foreground hover:bg-muted hover:text-foreground',
              (isItemActive(item.path) || (item.path === '/dashboard/admin/clients' && isDashboardActive)) &&
                'bg-primary text-primary-foreground font-medium hover:bg-primary hover:text-primary-foreground',
              collapsed && 'justify-center px-2'
            )}
          >
            {item.icon}
            {!collapsed && <span className="text-sm">{item.label}</span>}
          </Link>
        ))}

        {/* Role groups (clients only) */}
        {roleGroups.map((group) => {
          const isExpanded = expandedGroups.has(group.key);
          return (
            <div key={group.key} className="pt-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.key)}
                title={collapsed ? group.label : undefined}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-foreground/80 hover:bg-muted hover:text-foreground',
                  isExpanded && !collapsed && 'bg-muted/60',
                  collapsed && 'justify-center px-2'
                )}
              >
                {group.icon}
                {!collapsed && (
                  <>
                    <span className="text-sm font-medium flex-1 text-left">{group.label}</span>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </>
                )}
              </button>

              {isExpanded && !collapsed && (
                <div className="mt-1 ml-3 pl-3 border-l border-border/70 space-y-0.5">
                  {group.items.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={handleNavClick}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-muted-foreground hover:bg-muted hover:text-foreground',
                        isItemActive(item.path) && 'bg-primary text-primary-foreground font-medium hover:bg-primary hover:text-primary-foreground'
                      )}
                    >
                      {item.icon}
                      <span className="text-sm">{item.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Courier Settings — standalone (cross-cutting), sits above Integration. */}
        {!isAdmin && !isMarketer && (
          <Link
            to="/dashboard/logistics/courier-settings"
            title={collapsed ? 'Courier Settings' : undefined}
            onClick={handleNavClick}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-muted-foreground hover:bg-muted hover:text-foreground',
              isItemActive('/dashboard/logistics/courier-settings') && 'bg-primary text-primary-foreground font-medium hover:bg-primary hover:text-primary-foreground',
              collapsed && 'justify-center px-2'
            )}
          >
            <Settings className="w-5 h-5" />
            {!collapsed && <span className="text-sm">Courier Settings</span>}
          </Link>
        )}

        {/* Integration — order channels (WooCommerce, Shoppego, OnPay, Convertly). */}
        {!isAdmin && !isMarketer && (
          <Link
            to="/dashboard/integration"
            title={collapsed ? 'Integration' : undefined}
            onClick={handleNavClick}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-muted-foreground hover:bg-muted hover:text-foreground',
              isItemActive('/dashboard/integration') && 'bg-primary text-primary-foreground font-medium hover:bg-primary hover:text-primary-foreground',
              collapsed && 'justify-center px-2'
            )}
          >
            <Plug className="w-5 h-5" />
            {!collapsed && <span className="text-sm">Integration</span>}
          </Link>
        )}

        {/* Open Ticket — client support submission. Admin handles tickets via
            the admin Tickets page instead. */}
        {!isAdmin && !isMarketer && (
          <Link
            to="/dashboard/tickets"
            title={collapsed ? 'Open Ticket' : undefined}
            onClick={handleNavClick}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-muted-foreground hover:bg-muted hover:text-foreground',
              isItemActive('/dashboard/tickets') && 'bg-primary text-primary-foreground font-medium hover:bg-primary hover:text-primary-foreground',
              collapsed && 'justify-center px-2'
            )}
          >
            <Ticket className="w-5 h-5" />
            {!collapsed && <span className="text-sm">Open Ticket</span>}
          </Link>
        )}
        </div>
      </nav>

      {/* User Profile & Logout */}
      <div className="p-3 border-t border-border">
        <div className={cn('flex items-center gap-3 px-3 py-2 mb-2', collapsed && 'justify-center px-0')}>
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0 uppercase">
            {profile?.email?.charAt(0) || 'U'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{profile?.email || 'User'}</p>
              {profile?.idstaff && (
                <p className="text-xs text-muted-foreground truncate">ID: {profile.idstaff}</p>
              )}
              {!isAdmin && pdCredit.configured && (
                <p className="text-xs mt-0.5 flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <span className="truncate">
                    PD Credit: <span className="font-semibold">{pdCredit.credit != null ? `RM ${Number(pdCredit.credit).toFixed(2)}` : '—'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); fetchPdCredit(); }}
                    title="Refresh PD credit"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RefreshCw className={cn('w-3 h-3', pdCredit.loading && 'animate-spin')} />
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
        {/* Billing is a client concern (their subscription). Admin/staff don't subscribe. */}
        {!isAdmin && !isMarketer && (
          <Link
            to="/dashboard/billing"
            title={collapsed ? 'Billing' : undefined}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200',
              isItemActive('/dashboard/billing') && 'bg-primary text-primary-foreground font-medium hover:bg-primary hover:text-primary-foreground',
              collapsed && 'justify-center px-2'
            )}
          >
            <CreditCard className="w-5 h-5" />
            {!collapsed && <span className="text-sm">Billing</span>}
          </Link>
        )}
        <Link
          to="/dashboard/profile"
          title={collapsed ? 'Profile' : undefined}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200',
            isItemActive('/dashboard/profile') && 'bg-primary text-primary-foreground font-medium hover:bg-primary hover:text-primary-foreground',
            collapsed && 'justify-center px-2'
          )}
        >
          <UserCircle className="w-5 h-5" />
          {!collapsed && <span className="text-sm">Profile</span>}
        </Link>
        <button
          onClick={handleLogout}
          title={collapsed ? 'Logout' : undefined}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200',
            collapsed && 'justify-center px-2'
          )}
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && <span className="text-sm">Logout</span>}
        </button>
      </div>
      </aside>
    </>
  );
};

export default Sidebar;
