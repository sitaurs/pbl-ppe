'use client';

/**
 * /users — manajemen user. Permission: user:read.
 *
 * Sesuai Req 5.1, 5.2, 5.3, 5.4, 5.5.
 */
import { useCallback, useEffect, useState } from 'react';
import { Plus, Users, RefreshCw } from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import { PermissionGate } from '@/components/access/PermissionGate';
import { UserTable, type UserRow } from '@/components/users/UserTable';
import { UserCreateDialog, type RoleOption } from '@/components/users/UserCreateDialog';
import { UserEditDrawer } from '@/components/users/UserEditDrawer';
import type { SectorOption } from '@/components/sectors/SectorAssignmentSelector';
import { useApiFetch } from '@/hooks/use-csrf-token';

interface UsersResponse {
  users: UserRow[];
}
interface RolesResponse {
  roles: { id: string; name: string; description: string | null; isDefault: boolean; userCount: number; permissions: string[] }[];
}
interface SectorsResponse {
  sectors: { id: string; name: string }[];
}

export default function UsersPage(): React.ReactElement {
  const apiFetch = useApiFetch();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [sectors, setSectors] = useState<SectorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [tempPasswordTarget, setTempPasswordTarget] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, rolesRes, sectorsRes] = await Promise.all([
        apiFetch('/api/users'),
        apiFetch('/api/roles'),
        apiFetch('/api/sectors'),
      ]);
      if (!usersRes.ok) throw new Error(`users HTTP ${usersRes.status}`);
      if (!rolesRes.ok) throw new Error(`roles HTTP ${rolesRes.status}`);
      if (!sectorsRes.ok) throw new Error(`sectors HTTP ${sectorsRes.status}`);
      const usersData = (await usersRes.json()) as UsersResponse;
      const rolesData = (await rolesRes.json()) as RolesResponse;
      const sectorsData = (await sectorsRes.json()) as SectorsResponse;
      setUsers(usersData.users);
      setRoles(rolesData.roles.map((r) => ({ id: r.id, name: r.name })));
      setSectors(sectorsData.sectors.map((s) => ({ id: s.id, name: s.name })));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleResetPassword = async (user: UserRow): Promise<void> => {
    if (!confirm(`Reset password untuk ${user.username}? Password sementara akan ditampilkan satu kali.`)) {
      return;
    }
    try {
      const res = await apiFetch(`/api/users/${user.id}/reset-password`, { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { temporaryPassword: string };
        setTempPassword(data.temporaryPassword);
        setTempPasswordTarget(user.username);
      } else {
        alert('Gagal reset password.');
      }
    } catch {
      alert('Tidak dapat menghubungi server.');
    }
  };

  const handleUnlock = async (user: UserRow): Promise<void> => {
    try {
      const res = await apiFetch(`/api/users/${user.id}/unlock`, { method: 'POST' });
      if (res.ok) {
        await fetchAll();
      }
    } catch {
      // ignore
    }
  };

  const handleDelete = async (user: UserRow): Promise<void> => {
    if (!confirm(`Hapus user ${user.username}? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      const res = await apiFetch(`/api/users/${user.id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchAll();
      } else {
        const data = (await res.json()) as { error?: string; message?: string };
        alert(data.message ?? data.error ?? 'Gagal menghapus.');
      }
    } catch {
      alert('Tidak dapat menghubungi server.');
    }
  };

  return (
    <PageTransition>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 stagger-item stagger-1">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Kelola User
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Manajemen akun pengguna SafeGuard APD.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => fetchAll()}
            className="flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-lg font-medium text-sm"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <PermissionGate permission="user:create">
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="btn-primary flex items-center gap-2 min-h-[44px]"
            >
              <Plus size={14} /> Tambah User
            </button>
          </PermissionGate>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-red-100 border border-red-300 p-3 rounded text-sm text-red-800 mb-4">
          {error}
        </div>
      )}

      <div className="card overflow-hidden stagger-item stagger-2">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton h-10 rounded-lg" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center">
            <Users size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Belum ada user terdaftar.
            </p>
          </div>
        ) : (
          <UserTable
            users={users}
            onEdit={(u) => setEditingUser(u)}
            onResetPassword={handleResetPassword}
            onUnlock={handleUnlock}
            onDelete={handleDelete}
          />
        )}
      </div>

      {dialogOpen && (
        <UserCreateDialog
          roles={roles}
          sectors={sectors}
          onClose={() => setDialogOpen(false)}
          onCreated={fetchAll}
        />
      )}
      {editingUser && (
        <UserEditDrawer
          user={editingUser}
          roles={roles}
          sectors={sectors}
          onClose={() => setEditingUser(null)}
          onSaved={fetchAll}
        />
      )}
      {tempPassword && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-3 my-auto">
            <h2 className="text-lg font-bold">Password Sementara</h2>
            <p className="text-sm">
              Untuk <span className="font-mono font-semibold">{tempPasswordTarget}</span>:
            </p>
            <pre className="bg-slate-100 rounded-lg p-3 font-mono text-base select-all break-all">
              {tempPassword}
            </pre>
            <p className="text-xs text-orange-600">
              Password ini hanya ditampilkan sekali. Salin sekarang dan kirim kepada user.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(tempPassword)}
                className="px-4 py-2 rounded-lg border min-h-[44px]"
                style={{ borderColor: 'var(--border)' }}
              >
                Salin
              </button>
              <button
                type="button"
                onClick={() => {
                  setTempPassword(null);
                  setTempPasswordTarget(null);
                }}
                className="btn-primary min-h-[44px]"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}
