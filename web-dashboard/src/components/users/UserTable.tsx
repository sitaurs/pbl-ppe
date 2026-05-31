'use client';

/**
 * UserTable — Render daftar user (kolom username, fullName, email, role,
 * status, lastLoginAt, aksi).
 *
 * Sesuai Req 5.1 dan design.md §Frontend Components & Pages.
 */
import { Pencil, KeyRound, Lock, Unlock, Trash2 } from 'lucide-react';
import { PermissionGate } from '@/components/access/PermissionGate';

export interface UserRow {
  id: string;
  username: string;
  fullName: string;
  email: string;
  status: 'active' | 'disabled' | 'locked';
  totpEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  role: { id: string; name: string };
  sectorIds: string[];
}

interface Props {
  users: UserRow[];
  onEdit: (user: UserRow) => void;
  onResetPassword: (user: UserRow) => void;
  onUnlock: (user: UserRow) => void;
  onDelete: (user: UserRow) => void;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '—';
  const diff = Date.now() - ts;
  if (diff < 0) return new Date(iso).toLocaleString('id-ID');
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}d lalu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}j lalu`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}h lalu`;
  return new Date(iso).toLocaleDateString('id-ID');
}

function statusBadge(status: UserRow['status']): React.ReactElement {
  if (status === 'active') {
    return <span className="badge badge-success">Aktif</span>;
  }
  if (status === 'locked') {
    return <span className="badge badge-warning">Terkunci</span>;
  }
  return <span className="badge badge-danger">Nonaktif</span>;
}

export function UserTable({ users, onEdit, onResetPassword, onUnlock, onDelete }: Props): React.ReactElement {
  if (users.length === 0) {
    return (
      <div className="p-10 text-center" style={{ color: 'var(--text-muted)' }}>
        Belum ada user terdaftar.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left px-4 py-3">Username</th>
            <th className="text-left px-4 py-3">Nama Lengkap</th>
            <th className="text-left px-4 py-3">Email</th>
            <th className="text-left px-4 py-3">Role</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-left px-4 py-3">Login Terakhir</th>
            <th className="text-right px-4 py-3">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3">
                <div className="flex flex-col">
                  <span className="font-mono text-sm font-semibold">{u.username}</span>
                  {u.mustChangePassword && (
                    <span className="text-[10px]" style={{ color: 'var(--orange)' }}>
                      Harus ganti password
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">{u.fullName}</td>
              <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {u.email}
              </td>
              <td className="px-4 py-3">
                <span className="badge badge-info">{u.role.name.replace(/_/g, ' ')}</span>
              </td>
              <td className="px-4 py-3">{statusBadge(u.status)}</td>
              <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                {formatRelative(u.lastLoginAt)}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <PermissionGate permission="user:update">
                    <button
                      type="button"
                      onClick={() => onEdit(u)}
                      className="p-2 rounded-lg hover:bg-blue-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      title="Edit"
                      style={{ color: 'var(--accent)' }}
                      aria-label={`Edit ${u.username}`}
                    >
                      <Pencil size={14} />
                    </button>
                  </PermissionGate>
                  <PermissionGate permission="user:reset-password">
                    <button
                      type="button"
                      onClick={() => onResetPassword(u)}
                      className="p-2 rounded-lg hover:bg-blue-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      title="Reset Password"
                      style={{ color: 'var(--orange)' }}
                      aria-label={`Reset password ${u.username}`}
                    >
                      <KeyRound size={14} />
                    </button>
                  </PermissionGate>
                  {u.status === 'locked' ? (
                    <PermissionGate permission="user:update">
                      <button
                        type="button"
                        onClick={() => onUnlock(u)}
                        className="p-2 rounded-lg hover:bg-emerald-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                        title="Buka Kunci"
                        style={{ color: 'var(--success)' }}
                        aria-label={`Buka kunci ${u.username}`}
                      >
                        <Unlock size={14} />
                      </button>
                    </PermissionGate>
                  ) : (
                    <PermissionGate permission="user:update">
                      <button
                        type="button"
                        onClick={() => onEdit(u)}
                        className="p-2 rounded-lg hover:bg-slate-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                        title={u.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                        style={{ color: 'var(--text-muted)' }}
                        aria-label={`Toggle status ${u.username}`}
                      >
                        <Lock size={14} />
                      </button>
                    </PermissionGate>
                  )}
                  <PermissionGate permission="user:delete">
                    <button
                      type="button"
                      onClick={() => onDelete(u)}
                      className="btn-danger p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      title="Hapus"
                      aria-label={`Hapus ${u.username}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </PermissionGate>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default UserTable;
