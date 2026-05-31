'use client';

/**
 * RoleEditor — form untuk POST /api/roles dan PUT /api/roles/:id.
 *
 * 5 default role (`isDefault=true`) tidak dapat di-rename atau dihapus
 * (Req 6.4). Disable rename + tooltip "Role default tidak dapat diubah/
 * dihapus".
 */
import { useEffect, useMemo, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { PermissionGate } from '@/components/access/PermissionGate';
import { PermissionTreePicker } from './PermissionTreePicker';
import { useApiFetch } from '@/hooks/use-csrf-token';
import type { PermissionId } from '@/lib/rbac/permission-types';

export interface RoleDetail {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  userCount: number;
  permissions: PermissionId[];
}

interface Props {
  role: RoleDetail | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

export function RoleEditor({ role, onClose, onSaved }: Props): React.ReactElement {
  const apiFetch = useApiFetch();
  const isEdit = role !== null;
  const isDefault = role?.isDefault === true;

  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [permissions, setPermissions] = useState<PermissionId[]>(role?.permissions ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(role?.name ?? '');
    setDescription(role?.description ?? '');
    setPermissions(role?.permissions ?? []);
  }, [role]);

  const lockedTooltip = isDefault ? 'Role default tidak dapat diubah/dihapus' : undefined;

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = isEdit
        ? await apiFetch(`/api/roles/${role!.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              // Default role: name tidak boleh berubah
              name: isDefault ? undefined : name,
              description,
              permissionIds: permissions,
            }),
          })
        : await apiFetch('/api/roles', {
            method: 'POST',
            body: JSON.stringify({ name, description, permissionIds: permissions }),
          });
      if (res.ok) {
        onSaved();
        onClose();
        return;
      }
      const data = (await res.json()) as { error?: string; message?: string };
      if (data.error === 'role_name_exists') {
        setError('Nama role sudah dipakai.');
      } else if (data.error === 'cannot_rename_default_role') {
        setError('Role default tidak dapat diubah namanya.');
      } else {
        setError(data.message ?? data.error ?? 'Gagal menyimpan role.');
      }
    } catch {
      setError('Tidak dapat menghubungi server.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!role) return;
    if (!confirm(`Hapus role "${role.name}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/roles/${role.id}`, { method: 'DELETE' });
      if (res.ok) {
        onSaved();
        onClose();
        return;
      }
      const data = (await res.json()) as { error?: string; assignedUserCount?: number };
      if (data.error === 'cannot_delete_default_role') {
        setError('Role default tidak dapat dihapus.');
      } else if (data.error === 'role_has_users') {
        setError(`Role masih digunakan oleh ${data.assignedUserCount ?? '?'} user.`);
      } else {
        setError(data.error ?? 'Gagal menghapus role.');
      }
    } catch {
      setError('Tidak dapat menghubungi server.');
    } finally {
      setSubmitting(false);
    }
  }

  const dialogTitle = useMemo(() => {
    if (!isEdit) return 'Buat Role Baru';
    return `Edit Role: ${role?.name}`;
  }, [isEdit, role]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
      <form
        onSubmit={submit}
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] my-auto flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-bold">{dialogTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div role="alert" className="bg-red-100 border border-red-300 p-3 rounded text-sm text-red-800">
              {error}
            </div>
          )}
          {isDefault && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded text-sm">
              Ini adalah role default. Nama tidak dapat diubah dan role tidak dapat dihapus,
              tetapi daftar permission masih dapat dimodifikasi.
            </div>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Nama Role</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={1}
              maxLength={64}
              disabled={isDefault}
              title={lockedTooltip}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Deskripsi</span>
            <textarea
              value={description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
            />
          </label>
          <div>
            <h3 className="text-sm font-semibold mb-2">Permission ({permissions.length} dipilih)</h3>
            <PermissionTreePicker value={permissions} onChange={setPermissions} disabled={submitting} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          {isEdit && (
            <PermissionGate permission="role:delete">
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting || isDefault}
                title={lockedTooltip}
                className="btn-danger px-4 py-2 min-h-[44px] flex items-center gap-2 disabled:opacity-50"
              >
                <Trash2 size={14} /> Hapus Role
              </button>
            </PermissionGate>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border min-h-[44px]"
              style={{ borderColor: 'var(--border)' }}
            >
              Batal
            </button>
            <button type="submit" disabled={submitting} className="btn-primary min-h-[44px] disabled:opacity-50">
              {submitting ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default RoleEditor;
