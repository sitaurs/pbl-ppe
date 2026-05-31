'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import { UserMenuWidget } from './shell/UserMenuWidget';

const PUBLIC_PATHS = new Set(['/login', '/403', '/change-password']);

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const isPublicPage = pathname ? PUBLIC_PATHS.has(pathname) : false;

  useEffect(() => {
    // Load initial state
    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved !== null) {
      setCollapsed(saved === 'true');
    }

    // Listen for toggle events from Sidebar
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setCollapsed(detail.collapsed);
    };
    window.addEventListener('sidebar-toggle', handler);
    return () => window.removeEventListener('sidebar-toggle', handler);
  }, []);

  // Login/403/change-password jangan ditampilkan dengan sidebar.
  if (isPublicPage) {
    return <main className="flex-1 w-full">{children}</main>;
  }

  return (
    <>
      <Sidebar />
      <main
        className={`transition-all duration-300 flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto ${
          collapsed ? 'md:ml-[84px]' : 'md:ml-[280px]'
        }`}
      >
        {/* Top bar with user menu (Req 14.7) */}
        <div className="flex items-center justify-end mb-4">
          <UserMenuWidget />
        </div>
        {children}
      </main>
    </>
  );
}
