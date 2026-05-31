'use client';

/**
 * AuditLogTable — tabel audit log dengan pagination.
 *
 * Sesuai Req 13.4.
 */
import type { AuditAction } from '@/lib/audit/action-types';

export interface AuditEntry {
  id: string;
  userId: string;
  action: AuditAction | string;
  resourceType: string | null;
  resourceId: string | null;
  timestamp: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: string | null;
}

interface Props {
  entries: AuditEntry[];
  userMap: Map<string, string>; // userId → username
  loading: boolean;
}

function actionCategory(action: string): { color: string; bg: string } {
  if (action.startsWith('auth:login') || action === 'auth:logout') {
    return { color: '#1a3a6b', bg: '#e8ecf5' };
  }
  if (action.startsWith('auth:permission-denied') || action.startsWith('auth:account-lockout') || action.startsWith('auth:sector-denied')) {
    return { color: '#c4442e', bg: '#f5ebe8' };
  }
  if (action.startsWith('auth:2fa')) {
    return { color: '#2d7a5f', bg: '#e8f0ed' };
  }
  if (action.startsWith('user:') || action.startsWith('role:')) {
    return { color: '#b8860b', bg: '#f5f0e5' };
  }
  if (action.startsWith('node:') || action.startsWith('violation:') || action.startsWith('report:')) {
    return { color: '#1a3a6b', bg: '#e8ecf5' };
  }
  if (action.startsWith('setting:') || action.startsWith('service-token:')) {
    return { color: '#e8720b', bg: '#f5ede8' };
  }
  if (action.startsWith('audit-log:')) {
    return { color: '#4a4a5e', bg: '#eaeaea' };
  }
  return { color: '#4a4a5e', bg: '#eaeaea' };
}

function truncate(s: string, len: number): string {
  if (s.length <= len) return s;
  return s.slice(0, len) + '...';
}

export function AuditLogTable({ entries, userMap, loading }: Props): React.ReactElement {
  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="skeleton h-10 rounded-lg" />
        ))}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="p-10 text-center" style={{ color: 'var(--text-muted)' }}>
        Tidak ada entri audit log untuk filter ini.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left px-4 py-3">Waktu</th>
            <th className="text-left px-4 py-3">User</th>
            <th className="text-left px-4 py-3">Action</th>
            <th className="text-left px-4 py-3">Resource</th>
            <th className="text-left px-4 py-3">IP</th>
            <th className="text-left px-4 py-3">Metadata</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const cat = actionCategory(String(e.action));
            const username = userMap.get(e.userId) ?? e.userId;
            const meta = e.metadata ?? '';
            return (
              <tr key={e.id}>
                <td className="px-4 py-3 text-xs font-mono whitespace-nowrap">
                  {new Date(e.timestamp).toLocaleString('id-ID', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </td>
                <td className="px-4 py-3 text-xs font-mono">{username}</td>
                <td className="px-4 py-3">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold"
                    style={{ background: cat.bg, color: cat.color }}
                  >
                    {e.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {e.resourceType ? (
                    <span>
                      <span className="text-slate-500">{e.resourceType}</span>
                      {e.resourceId && (
                        <span className="font-mono text-slate-400"> #{e.resourceId.slice(0, 8)}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs font-mono">{e.ipAddress ?? '—'}</td>
                <td className="px-4 py-3 text-xs" title={meta}>
                  <span className="text-slate-600">{meta ? truncate(meta, 60) : '—'}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default AuditLogTable;
