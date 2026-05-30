'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Monitor,
  AlertTriangle,
  Server,
  BarChart3,
  Settings,
  Shield,
  PanelLeftClose,
  PanelLeftOpen,
  Map,
} from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/monitor', label: 'Live Monitor', icon: Monitor },
  { href: '/violations', label: 'Log Pelanggaran', icon: AlertTriangle },
  { href: '/nodes', label: 'Kelola Node', icon: Server },
  { href: '/map', label: 'Peta Sektor', icon: Map },
  { href: '/reports', label: 'Laporan', icon: BarChart3 },
  { href: '/settings', label: 'Pengaturan', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved !== null) setCollapsed(saved === 'true');
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar_collapsed', String(next));
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { collapsed: next } }));
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={`hidden md:flex flex-col fixed h-[calc(100vh-24px)] top-3 left-3 z-10 rounded-2xl transition-all duration-300 ${
        collapsed ? 'w-[68px]' : 'w-64'
      }`}
      style={{
        background: 'var(--sidebar-bg)',
        boxShadow: '0 8px 32px rgba(26,26,46,0.15)',
      }}
    >
      {/* Logo */}
      <div className={`flex items-center border-b border-white/10 ${collapsed ? 'p-3 justify-center' : 'px-4 py-4 gap-3'}`}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--orange)' }}>
          <Shield size={18} color="white" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight" style={{ color: '#f1f5f9' }}>SafeGuard</p>
            <p className="text-[10px]" style={{ color: '#94a3b8' }}>APD Monitoring</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden ${collapsed ? 'px-2' : 'px-3'}`}>
        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center rounded-lg transition-colors duration-150 ${
                collapsed ? 'justify-center w-11 h-11 mx-auto' : 'gap-3 px-3 py-2.5'
              } ${active ? 'bg-white/10' : 'hover:bg-white/5'}`}
              style={{
                color: active ? '#fff' : 'var(--sidebar-text)',
                borderLeft: !collapsed && active ? '3px solid var(--orange)' : !collapsed ? '3px solid transparent' : undefined,
              }}
            >
              <Icon size={collapsed ? 20 : 18} style={{ color: active ? 'var(--orange)' : undefined }} />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Toggle + Profile */}
      <div className="border-t border-white/10 p-3 space-y-2">
        {/* Toggle */}
        <button
          onClick={toggleCollapsed}
          className={`flex items-center rounded-lg transition-colors duration-150 hover:bg-white/5 ${
            collapsed ? 'justify-center w-11 h-11 mx-auto' : 'gap-3 px-3 py-2 w-full'
          }`}
          style={{ color: 'var(--sidebar-text)' }}
          title={collapsed ? 'Expand' : 'Minimize'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && <span className="text-xs font-medium">Minimize</span>}
        </button>

        {/* Profile */}
        <div className={`flex items-center rounded-lg ${collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2'}`}
          style={{ background: 'rgba(232,114,11,0.08)' }}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white"
            style={{ background: 'var(--orange)' }}
          >
            AD
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: '#f1f5f9' }}>Administrator</p>
              <p className="text-[10px]" style={{ color: '#94a3b8' }}>Admin</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
