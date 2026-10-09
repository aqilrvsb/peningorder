import React, { useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Sidebar from './Sidebar';

// Soft-UI shell: grey frame (sidebar + gutters) around a white centre panel. The sidebar
// stays put on desktop; on phones a sticky top bar opens it as a drawer.
const DashboardLayout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-canvas" aria-busy="true">
        <div className="hidden w-64 flex-col gap-3 p-4 md:flex">
          <div className="shimmer h-7 w-32" />
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer h-9 rounded-lg" />)}
        </div>
        <div className="flex-1 p-3 md:py-3 md:pl-0 md:pr-3">
          <div className="h-full min-h-[calc(100vh-1.5rem)] space-y-4 rounded-2xl border border-border/70 bg-background p-6 shadow-sm">
            <div className="shimmer h-8 w-56" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="shimmer h-20 rounded-xl" />)}
            </div>
            <div className="shimmer h-72 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col md:py-3 md:pr-3">
        {/* Mobile top bar — stays put while scrolling; hamburger opens the drawer. */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur-md md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="-ml-2 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-lg font-bold tracking-tight text-primary">pening<span className="text-foreground">order</span></span>
        </header>
        {/* White centre panel. key → each page fades in with a slight zoom. */}
        <main className="dashboard-main min-w-0 flex-1 overflow-x-auto bg-background md:rounded-2xl md:border md:border-border/70 md:shadow-sm">
          <div key={pathname} className="animate-fade-zoom p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
