'use client';

/**
 * /roles — manajemen role + permission picker. Permission: role:read.
 *
 * Sesuai Req 6.3, 6.4.
 */
import { useCallback, useEffect, useState } from 'react';
import { Plus, KeyRound, Pencil, Lock } from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import { PermissionGate } from '@/components/access/PermissionGate';
import { RoleEditor, type RoleDetail } from '@/components/roles/RoleEditor';
import { useApiFetch } from '@/hooks/use-csrf-token';

interface RolesResponse {
  roles: RoleDetail[];
}

export default function RolesPage(): React.ReactElement {
  const apiFetch = useApiFetch();
  const [roles, setRoles] = useState<RoleDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDetail | null>(null);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/roles');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as RolesResponse;
      setRoles(data.roles);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  return (
    <PageTransition>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 stagger-item stagger-1">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Kelola Role
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Definisi peran dan permission. 5 role default tidak dapat dihapus atau di-rename.
          </p>
        </div>
        <PermissionGate permission="role:create">
          <button
            type="button"
            onClick={() => {
              setEditingRole(null);
              setEditorOpen(true);
            }}
            className="btn-primary flex items-center gap-2 min-h-[44px] self-start sm:self-auto"
          >
            <Plus size={14} /> Buat Role
          </button>
        </PermissionGate>
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
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : roles.length === 0 ? (
          <div className="p-10 text-center">
            <KeyRound size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Belum ada role tersedia.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3">Nama</th>
                  <th className="text-left px-4 py-3">Deskripsi</th>
                  <th className="text-left px-4 py-3">Permission</th>
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-right px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{r.name.replace(/_/g, ' ')}</span>
                        {r.isDefault && (
                          <span
                            title="Role default tidak dapat diubah/dihapus"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                            style={{ background: '#f5f0e5', color: 'var(--warning)' }}
                          >
                            <Lock size={10} /> Default
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {r.description ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">{r.permissions.length} izin</td>
                    <td className="px-4 py-3 text-xs">{r.userCount} user</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <PermissionGate permission="role:update">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRole(r);
                              setEditorOpen(true);
                            }}
                            className="p-2 rounded-lg hover:bg-blue-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                            title={r.isDefault ? 'Edit permission (nama dikunci)' : 'Edit role'}
                            style={{ color: 'var(--accent)' }}
                            aria-label={`Edit role ${r.name}`}
                          >
                            <Pencil size={14} />
                          </button>
                        </PermissionGate>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editorOpen && (
        <RoleEditor
          role={editingRole}
          onClose={() => {
            setEditorOpen(false);
            setEditingRole(null);
          }}
          onSaved={fetchRoles}
        />
      )}
    </PageTransition>
  );
}
