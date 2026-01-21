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
  Receipt,
  TrendingUp,
  Clock,
  CheckCircle,
  CreditCard,
  XCircle,
  FileText,
  Webhook,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  roles: string[];
}

const navItems: NavItem[] = [
  // ============ MARKETER ROLE ============
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: <LayoutDashboard className="w-5 h-5" />,
    roles: ['marketer', 'bod', 'logistic'],
  },
  {
    label: 'Order',
    path: '/dashboard/orders/new',
    icon: <ClipboardList className="w-5 h-5" />,
    roles: ['marketer'],
  },
  {
    label: 'History',
    path: '/dashboard/orders',
    icon: <History className="w-5 h-5" />,
    roles: ['marketer'],
  },
  {
    label: 'Leads',
    path: '/dashboard/prospects',
    icon: <Users className="w-5 h-5" />,
    roles: ['marketer'],
  },
  {
    label: 'Spend',
    path: '/dashboard/spend',
    icon: <Wallet className="w-5 h-5" />,
    roles: ['marketer'],
  },
  {
    label: 'Reporting Spend',
    path: '/dashboard/reporting-spend',
    icon: <BarChart3 className="w-5 h-5" />,
    roles: ['marketer'],
  },
  {
    label: 'Top 10',
    path: '/dashboard/top10',
    icon: <Trophy className="w-5 h-5" />,
    roles: ['marketer', 'bod'],
  },
  {
    label: 'PNL',
    path: '/dashboard/pnl',
    icon: <Receipt className="w-5 h-5" />,
    roles: ['marketer'],
  },
  {
    label: 'Bundle Date Order',
    path: '/dashboard/bundle-date-order',
    icon: <TrendingUp className="w-5 h-5" />,
    roles: ['marketer'],
  },
  {
    label: 'Reward',
    path: '/dashboard/reward',
    icon: <Trophy className="w-5 h-5" />,
    roles: ['marketer'],
  },
  {
    label: 'Webhook Settings',
    path: '/dashboard/webhook-settings',
    icon: <Webhook className="w-5 h-5" />,
    roles: ['marketer'],
  },
  // ============ BOD ROLE ============
  {
    label: 'Reporting Spend',
    path: '/dashboard/reporting-spend-bod',
    icon: <BarChart3 className="w-5 h-5" />,
    roles: ['bod'],
  },
  {
    label: 'Report Sales',
    path: '/dashboard/report-sales',
    icon: <FileSpreadsheet className="w-5 h-5" />,
    roles: ['bod'],
  },
  {
    label: 'Report Leads',
    path: '/dashboard/report-leads',
    icon: <Users className="w-5 h-5" />,
    roles: ['bod'],
  },
  {
    label: 'Report Admin Prospect',
    path: '/dashboard/report-admin-prospect',
    icon: <Users className="w-5 h-5" />,
    roles: ['bod'],
  },
  {
    label: 'PNL Config',
    path: '/dashboard/pnl-config',
    icon: <Receipt className="w-5 h-5" />,
    roles: ['bod'],
  },
  {
    label: 'Dashboard Logistic',
    path: '/dashboard/dashboard-logistic',
    icon: <Truck className="w-5 h-5" />,
    roles: ['bod'],
  },
  {
    label: 'Report Pembelian',
    path: '/dashboard/report-pembelian',
    icon: <ShoppingCart className="w-5 h-5" />,
    roles: ['bod'],
  },
  // ============ LOGISTIC ROLE - INVENTORY ============
  {
    label: 'Product',
    path: '/dashboard/logistics/inventory-product',
    icon: <Package className="w-5 h-5" />,
    roles: ['logistic'],
  },
  {
    label: 'Transaction Processed/Return',
    path: '/dashboard/logistics/inventory-transaction',
    icon: <TrendingUp className="w-5 h-5" />,
    roles: ['logistic'],
  },
  {
    label: 'Bundle Date Order',
    path: '/dashboard/logistics/inventory-transaction-bundle',
    icon: <TrendingUp className="w-5 h-5" />,
    roles: ['logistic'],
  },
  {
    label: 'Stock In',
    path: '/dashboard/logistics/stock-in',
    icon: <ArrowDownToLine className="w-5 h-5" />,
    roles: ['logistic'],
  },
  {
    label: 'Stock Out',
    path: '/dashboard/logistics/stock-out',
    icon: <ArrowUpFromLine className="w-5 h-5" />,
    roles: ['logistic'],
  },
  {
    label: 'Bundle',
    path: '/dashboard/logistics/inventory-bundle',
    icon: <Boxes className="w-5 h-5" />,
    roles: ['logistic'],
  },
  // ============ LOGISTIC ROLE - LOGISTICS ============
  {
    label: 'Order',
    path: '/dashboard/logistics/order',
    icon: <ClipboardList className="w-5 h-5" />,
    roles: ['logistic'],
  },
  {
    label: 'Processed',
    path: '/dashboard/logistics/processed',
    icon: <Truck className="w-5 h-5" />,
    roles: ['logistic'],
  },
  {
    label: 'Return',
    path: '/dashboard/logistics/return',
    icon: <RotateCcw className="w-5 h-5" />,
    roles: ['logistic'],
  },
  {
    label: 'Pending Tracking',
    path: '/dashboard/logistics/pending-tracking',
    icon: <Clock className="w-5 h-5" />,
    roles: ['logistic'],
  },
  // ============ LOGISTIC ROLE - CUSTOMER HQ ============
  {
    label: 'Customer HQ',
    path: '/dashboard/logistics/customers',
    icon: <Users className="w-5 h-5" />,
    roles: ['logistic'],
  },
  {
    label: 'Ninjavan Settings',
    path: '/dashboard/logistics/ninjavan-settings',
    icon: <Settings className="w-5 h-5" />,
    roles: ['logistic'],
  },
  // ============ ACCOUNT ROLE ============
  {
    label: 'Report Profit',
    path: '/dashboard/account/report-profit',
    icon: <TrendingUp className="w-5 h-5" />,
    roles: ['account'],
  },
  {
    label: 'Report Spend',
    path: '/dashboard/account/report-spend',
    icon: <Wallet className="w-5 h-5" />,
    roles: ['account'],
  },
  {
    label: 'Pengesahan',
    path: '/dashboard/account/pengesahan',
    icon: <ClipboardList className="w-5 h-5" />,
    roles: ['account'],
  },
  {
    label: 'Approved',
    path: '/dashboard/account/approved',
    icon: <CheckCircle className="w-5 h-5" />,
    roles: ['account'],
  },
  {
    label: 'Rejected',
    path: '/dashboard/account/rejected',
    icon: <XCircle className="w-5 h-5" />,
    roles: ['account'],
  },
  {
    label: 'Expenses',
    path: '/dashboard/account/expenses',
    icon: <CreditCard className="w-5 h-5" />,
    roles: ['account'],
  },
  {
    label: 'Customer HQ',
    path: '/dashboard/account/customers',
    icon: <Users className="w-5 h-5" />,
    roles: ['account'],
  },
  {
    label: 'Invoice Settings',
    path: '/dashboard/account/invoice-settings',
    icon: <FileText className="w-5 h-5" />,
    roles: ['account'],
  },
  {
    label: 'PNL Config',
    path: '/dashboard/account/pnl-config',
    icon: <Receipt className="w-5 h-5" />,
    roles: ['account'],
  },
  // ============ ADMIN ROLE ============
  {
    label: 'Leads',
    path: '/dashboard/admin/leads',
    icon: <Users className="w-5 h-5" />,
    roles: ['admin'],
  },
  // ============ HR ROLE ============
  {
    label: 'User',
    path: '/dashboard/hr/users',
    icon: <Users className="w-5 h-5" />,
    roles: ['hr'],
  },
  {
    label: 'Attendance',
    path: '/dashboard/hr/attendance',
    icon: <ClipboardList className="w-5 h-5" />,
    roles: ['hr'],
  },
];

const Sidebar: React.FC = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  // Handle navigation click - invalidate all queries to refresh data
  const handleNavClick = (path: string) => {
    // Invalidate all queries to force refresh when navigating
    queryClient.invalidateQueries();
  };

  const filteredNavItems = navItems.filter((item) =>
    item.roles.includes(profile?.role || '')
  );

  const isItemActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <aside 
      className={cn(
        "min-h-screen bg-background border-r border-border flex flex-col transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo & Toggle */}
      <div className="p-4 flex items-center justify-between">
        {!collapsed && (
          <h1 className="text-xl font-bold text-primary">
            DFR<span className="text-foreground">Empire</span>
          </h1>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
      </div>

      {/* Navigation Label */}
      {!collapsed && (
        <div className="px-6 pb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Navigation
          </span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {filteredNavItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            title={collapsed ? item.label : undefined}
            onClick={() => handleNavClick(item.path)}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-muted-foreground hover:bg-muted hover:text-foreground',
              isItemActive(item.path) && 'bg-primary text-primary-foreground font-medium hover:bg-primary hover:text-primary-foreground',
              collapsed && 'justify-center px-2'
            )}
          >
            {item.icon}
            {!collapsed && <span className="text-sm">{item.label}</span>}
          </Link>
        ))}
      </nav>

      {/* User Profile & Logout */}
      <div className="p-3 border-t border-border">
        <div className={cn(
          "flex items-center gap-3 px-3 py-2 mb-2",
          collapsed && "justify-center px-0"
        )}>
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
            {profile?.idstaff?.charAt(0) || 'U'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {profile?.idstaff || 'User'}
              </p>
            </div>
          )}
        </div>
        <Link
          to="/dashboard/profile"
          title={collapsed ? "Profile" : undefined}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200",
            isItemActive('/dashboard/profile') && 'bg-primary text-primary-foreground font-medium hover:bg-primary hover:text-primary-foreground',
            collapsed && "justify-center px-2"
          )}
        >
          <UserCircle className="w-5 h-5" />
          {!collapsed && <span className="text-sm">Profile</span>}
        </Link>
        <button
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200",
            collapsed && "justify-center px-2"
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
