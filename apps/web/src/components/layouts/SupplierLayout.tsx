import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { getStoredSession, logout } from '@/lib/auth';
import {
  LayoutDashboard,
  Building,
  Boxes,
  Users2,
  FileText,
  ShieldCheck,
  Bell,
  Settings,
  Menu,
  LogOut,
  Building2,
  Layers,
} from 'lucide-react';

interface NavSection {
  title?: string;
  items: Array<{
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
}

const supplierNav: NavSection[] = [
  {
    items: [{ label: 'Dashboard', href: '/supplier/dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'COMPANY',
    items: [
      { label: 'Company Profile', href: '/supplier/company/profile', icon: Building },
      { label: 'Products', href: '/supplier/products', icon: Boxes },
    ],
  },
  {
    title: 'CUSTOMERS',
    items: [{ label: 'Customers', href: '/supplier/customers', icon: Users2 }],
  },
  {
    title: 'DATA',
    items: [
      { label: 'Data Requests', href: '/supplier/data-requests', icon: Layers },
    ],
  },
  {
    title: 'DOCUMENTS',
    items: [{ label: 'Documents', href: '/supplier/documents', icon: FileText }],
  },
  {
    title: 'VERIFICATION',
    items: [{ label: 'Evidence', href: '/supplier/evidence', icon: ShieldCheck }],
  },
  {
    items: [
      { label: 'Notifications', href: '/supplier/notifications', icon: Bell },
      { label: 'Settings', href: '/supplier/settings', icon: Settings },
    ],
  },
];

export const SupplierLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white font-bold shadow-sm">
            CP
          </div>
          <div>
            <span className="font-bold text-slate-900 dark:text-slate-100 text-base">CarbonPilot</span>
            <span className="block text-[10px] font-semibold tracking-wider uppercase text-teal-600 dark:text-teal-400">
              Supplier Portal
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {supplierNav.map((section, idx) => (
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
                        ? 'bg-teal-50 text-teal-700 font-semibold dark:bg-teal-950/60 dark:text-teal-300'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                    )}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400')} />
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
              {session?.user.name?.slice(0, 2)?.toUpperCase() ?? 'SU'}
            </div>
            <div className="truncate flex-1">
              <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                {session?.user.name ?? 'Supplier User'}
              </p>
              <p className="truncate text-[10px] text-slate-400">
                {session?.user.organization.name ?? 'Supplier Organization'}
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
              <Building2 className="h-4 w-4 text-teal-600" />
              <span>{session?.user.organization.name ?? 'Supplier Organization'} (Supplier)</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/supplier/notifications"
              className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-teal-500" />
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
