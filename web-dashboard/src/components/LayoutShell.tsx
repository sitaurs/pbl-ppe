'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

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

  return (
    <>
      <Sidebar />
      <main
        className={`transition-all duration-300 flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto ${
          collapsed ? 'md:ml-[84px]' : 'md:ml-[280px]'
        }`}
      >
        {children}
      </main>
    </>
  );
}
