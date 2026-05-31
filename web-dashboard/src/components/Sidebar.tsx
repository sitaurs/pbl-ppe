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
  Users,
  KeyRound,
  ScrollText,
  Plug,
} from 'lucide-react';
import { PermissionGate } from '@/components/access/PermissionGate';
import { useCurrentUser } from '@/hooks/use-current-user';
import type { PermissionId } from '@/lib/rbac/permission-types';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; color?: string }>;
  /** null = public (everyone with session). Otherwise permission required. */
  permission: PermissionId | null;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, permission: null },
  { href: '/monitor', label: 'Live Monitor', icon: Monitor, permission: 'live:view' },
  { href: '/violations', label: 'Pelanggaran', icon: AlertTriangle, permission: 'violation:read' },
  { href: '/nodes', label: 'Kelola Node', icon: Server, permission: 'node:read' },
  { href: '/map', label: 'Peta Sektor', icon: Map, permission: 'sector:read' },
  { href: '/reports', label: 'Laporan', icon: BarChart3, permission: 'report:read' },
  { href: '/sectors', label: 'Kelola Sektor', icon: Map, permission: 'sector:read' },
  { href: '/users', label: 'Kelola User', icon: Users, permission: 'user:read' },
  { href: '/roles', label: 'Kelola Role', icon: KeyRound, permission: 'role:read' },
  { href: '/audit-log', label: 'Audit Log', icon: ScrollText, permission: 'audit-log:read' },
  { href: '/settings', label: 'Pengaturan', icon: Settings, permission: 'setting:read' },
  { href: '/settings/integrations', label: 'Integrasi', icon: Plug, permission: 'setting:update:system' },
];

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const PUBLIC_PATHS = new Set(['/login', '/403', '/change-password']);

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useCurrentUser();

  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved !== null) setCollapsed(saved === 'true');
  }, []);

  // Defense in depth: jangan render sidebar di halaman publik (login, 403, change-password)
  // walaupun LayoutShell juga sudah filter — biar tidak ada chance bocor.
  // Early return SETELAH semua hooks dipanggil agar tidak melanggar Rules of Hooks.
  if (pathname && PUBLIC_PATHS.has(pathname)) {
    return null;
  }

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar_collapsed', String(next));
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { collapsed: next } }));
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname?.startsWith(href) ?? false;
  };

  const renderNavLink = (item: NavItem) => {
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
  };

  const profileName = user?.fullName || user?.username || 'Pengguna';
  const profileRole = user?.role.name.replace(/_/g, ' ') ?? '—';
  const profileInitials = user ? getInitials(user.fullName || user.username) : 'AD';

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
        {navItems.map((item) =>
          item.permission === null ? (
            renderNavLink(item)
          ) : (
            <PermissionGate key={item.href} permission={item.permission}>
              {renderNavLink(item)}
            </PermissionGate>
          ),
        )}
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
            {profileInitials}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: '#f1f5f9' }}>{profileName}</p>
              <p className="text-[10px]" style={{ color: '#94a3b8' }}>{profileRole}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
