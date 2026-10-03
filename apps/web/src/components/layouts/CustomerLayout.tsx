import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { getStoredSession, logout } from '@/lib/auth';
import {
  LayoutDashboard,
  ShoppingCart,
  FileSpreadsheet,
  FileCheck2,
  Users,
  GitCompare,
  Inbox,
  HelpCircle,
  FileText,
  ShieldCheck,
  AlertTriangle,
  Leaf,
  Layers,
  Calculator,
  BarChart3,
  Package,
  Boxes,
  Bell,
  Settings,
  Menu,
  LogOut,
  Building2,
} from 'lucide-react';

interface NavSection {
  title?: string;
  items: Array<{
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
}

const customerNav: NavSection[] = [
  {
    items: [{ label: 'Dashboard', href: '/customer/dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'PROCUREMENT',
    items: [
      { label: 'Purchases', href: '/customer/purchases', icon: ShoppingCart },
      { label: 'Invoices', href: '/customer/invoices', icon: FileSpreadsheet },
      { label: 'Purchase Orders', href: '/customer/purchase-orders', icon: FileCheck2 },
    ],
  },
  {
    title: 'SUPPLIERS',
    items: [
      { label: 'All Suppliers', href: '/customer/suppliers', icon: Users },
      { label: 'Supplier Comparison', href: '/customer/suppliers/comparison', icon: GitCompare },
    ],
  },
  {
    title: 'CATALOG',
    items: [{ label: 'Products', href: '/customer/products', icon: Boxes }],
  },
  {
    title: 'DATA COLLECTION',
    items: [
      { label: 'Data Requests', href: '/customer/data-requests', icon: Inbox },
      { label: 'Questionnaires', href: '/customer/questionnaires', icon: HelpCircle },
    ],
  },
  {
    title: 'EVIDENCE',
    items: [
      { label: 'Documents', href: '/customer/documents', icon: FileText },
      { label: 'Evidence Center', href: '/customer/evidence-center', icon: ShieldCheck },
      { label: 'Anomalies', href: '/customer/anomalies', icon: AlertTriangle },
    ],
  },
  {
    title: 'CARBON',
    items: [
      { label: 'Carbon Overview', href: '/customer/carbon/overview', icon: Leaf },
      { label: 'Scope 3', href: '/customer/carbon/scope-3', icon: Layers },
      { label: 'Calculations', href: '/customer/carbon/calculations', icon: Calculator },
    ],
  },
  {
    title: 'REPORTING',
    items: [
      { label: 'Reports', href: '/customer/reports', icon: BarChart3 },
      { label: 'Evidence Packs', href: '/customer/evidence-packs', icon: Package },
    ],
  },
  {
    items: [
      { label: 'Notifications', href: '/customer/notifications', icon: Bell },
      { label: 'Settings', href: '/customer/settings', icon: Settings },
    ],
  },
];

export const CustomerLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [session, setSession] = useState(getStoredSession());

  useEffect(() => {
    setSession(getStoredSession());
  }, [pathname]);

  const handleSignOut = () => {
    logout((path) => router.push(path));
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-16 items-center gap-3 px-6 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold shadow-sm">
            CP
          </div>
          <div>
            <span className="font-bold text-slate-900 dark:text-slate-100 text-base">CarbonPilot</span>
            <span className="block text-[10px] font-semibold tracking-wider uppercase text-emerald-600 dark:text-emerald-400">
              Buyer Portal
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {customerNav.map((section, idx) => (
            <div key={idx} className="space-y-1">
              {section.title && (
                <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {section.title}
                </p>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 font-semibold dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                    )}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200">
              {session?.user.name?.slice(0, 2)?.toUpperCase() ?? 'CU'}
            </div>
            <div className="truncate flex-1">
              <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                {session?.user.name ?? 'Customer User'}
              </p>
              <p className="truncate text-[10px] text-slate-400">
                {session?.user.organization.name ?? 'Customer Organization'}
              </p>
            </div>
            <button type="button" onClick={handleSignOut} title="Sign out" className="text-slate-400 hover:text-rose-500">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200/80 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden text-slate-500 hover:text-slate-700"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Building2 className="h-4 w-4 text-emerald-600" />
              <span>{session?.user.organization.name ?? 'Customer Organization'} (Customer)</span>
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Verified Buyer
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/supplier/dashboard"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Switch to Supplier View →
            </Link>
            <Link
              href="/customer/notifications"
              className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500" />
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
};
