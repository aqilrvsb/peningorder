import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
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
  XCircle,
  FileText,
  Receipt,
  Webhook,
  FilePlus,
  Database,
  ScanLine,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Megaphone,
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
  { label: 'Webhook Settings', path: '/dashboard/webhook-settings', icon: <Webhook className="w-5 h-5" /> },
];

// ============ LOGISTIC ROLE ============
// ============ MANAGEMENT ROLE (Logistic + Account merged) ============
const managementItems: NavItem[] = [
  { label: 'Product', path: '/dashboard/logistics/inventory-product', icon: <Package className="w-5 h-5" /> },
  { label: 'Bundle', path: '/dashboard/logistics/inventory-bundle', icon: <Boxes className="w-5 h-5" /> },
  { label: 'Order', path: '/dashboard/logistics/order', icon: <ShoppingCart className="w-5 h-5" /> },
  { label: 'Processed', path: '/dashboard/logistics/processed', icon: <CheckCircle className="w-5 h-5" /> },
  { label: 'Return', path: '/dashboard/logistics/return', icon: <RotateCcw className="w-5 h-5" /> },
  { label: 'Pending Tracking', path: '/dashboard/logistics/pending-tracking', icon: <Clock className="w-5 h-5" /> },
  { label: 'Report Profit', path: '/dashboard/account/report-profit', icon: <TrendingUp className="w-5 h-5" /> },
  { label: 'Pending COD Collection', path: '/dashboard/account/pending-tracking', icon: <DollarSign className="w-5 h-5" /> },
  { label: 'Invoice Settings', path: '/dashboard/account/invoice-settings', icon: <FileText className="w-5 h-5" /> },
  { label: 'Courier Settings', path: '/dashboard/logistics/courier-settings', icon: <Settings className="w-5 h-5" /> },
];

type GroupKey = 'marketer' | 'management';

interface RoleGroup {
  key: GroupKey;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
}

const roleGroups: RoleGroup[] = [
  { key: 'marketer', label: 'Marketer Role', icon: <Megaphone className="w-5 h-5" />, items: marketerItems },
  { key: 'management', label: 'Management Role', icon: <Truck className="w-5 h-5" />, items: managementItems },
];

const Sidebar: React.FC = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);

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
    <aside
      className={cn(
        'min-h-screen bg-background border-r border-border flex flex-col transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo & Toggle */}
      <div className="p-4 flex items-center justify-between">
        {!collapsed && (
          <h1 className="text-xl font-bold text-primary">
            pening<span className="text-foreground">order</span>
          </h1>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
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
        {/* Dashboard — always visible */}
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

        {/* Role groups */}
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

        {/* Open Ticket — standalone, no submenu */}
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
            </div>
          )}
        </div>
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
  );
};

export default Sidebar;
