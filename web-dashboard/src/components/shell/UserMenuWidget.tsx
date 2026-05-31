'use client';

/**
 * UserMenuWidget — avatar + nama + role + dropdown menu di header.
 *
 * Sesuai Req 14.7 dan `design.md §Frontend Components & Pages`.
 *
 * Items:
 *  - "Akun saya" → /account/security
 *  - "Audit Log" (gated `audit-log:read`) → /audit-log
 *  - "Logout" → POST /api/auth/logout → /login
 */
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, User, ScrollText, LogOut } from 'lucide-react';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useApiFetch } from '@/hooks/use-csrf-token';
import { usePermission } from '@/hooks/use-permission';

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserMenuWidget(): React.ReactElement | null {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const { user, loading, refresh } = useCurrentUser();
  const canSeeAuditLog = usePermission('audit-log:read');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (loading || !user) return null;

  const handleLogout = async (): Promise<void> => {
    setOpen(false);
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore network error; cookie still cleared client-side
    }
    await refresh();
    router.push('/login');
  };

  const initials = getInitials(user.fullName || user.username);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-black/5 min-h-[44px]"
        style={{ color: 'var(--text-primary)' }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ background: 'var(--accent)' }}
          aria-hidden="true"
        >
          {initials}
        </div>
        <div className="hidden sm:flex flex-col items-start leading-tight">
          <span className="text-sm font-semibold">{user.fullName || user.username}</span>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {user.role.name.replace(/_/g, ' ')}
          </span>
        </div>
        <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-56 rounded-xl shadow-lg border overflow-hidden z-50"
          style={{ background: 'var(--card-bg)', borderColor: 'var(--border)' }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {user.fullName || user.username}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              {user.email}
            </p>
          </div>
          <Link
            href="/account/security"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-black/5"
            style={{ color: 'var(--text-primary)' }}
          >
            <User size={14} /> Akun saya
          </Link>
          {canSeeAuditLog && (
            <Link
              href="/audit-log"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-black/5"
              style={{ color: 'var(--text-primary)' }}
            >
              <ScrollText size={14} /> Audit Log
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-black/5 border-t"
            style={{ color: 'var(--danger)', borderColor: 'var(--border)' }}
          >
            <LogOut size={14} /> Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default UserMenuWidget;
