'use client';

/**
 * UserEditDrawer — drawer untuk PUT /api/users/:id.
 *
 * Tidak mengubah password (gunakan reset terpisah). Mendukung:
 *  - Edit fullName, email
 *  - Ganti role
 *  - Ganti status (active/disabled)
 *  - Sektor assignment (jika role scoped)
 *
 * Sesuai Req 5.5.
 */
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  SectorAssignmentSelector,
  type SectorOption,
} from '@/components/sectors/SectorAssignmentSelector';
import { useApiFetch } from '@/hooks/use-csrf-token';
import type { UserRow } from './UserTable';
import type { RoleOption } from './UserCreateDialog';

const SECTOR_SCOPED_ROLES = new Set(['Supervisor', 'PIC_Sektor']);

interface Props {
  user: UserRow;
  roles: RoleOption[];
  sectors: SectorOption[];
  onClose: () => void;
  onSaved: () => void;
}

export function UserEditDrawer({ user, roles, sectors, onClose, onSaved }: Props): React.ReactElement {
  const apiFetch = useApiFetch();
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [roleId, setRoleId] = useState(user.role.id);
  const [status, setStatus] = useState<UserRow['status']>(user.status);
  const [sectorIds, setSectorIds] = useState<string[]>(user.sectorIds);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setFullName(user.fullName);
    setEmail(user.email);
    setRoleId(user.role.id);
    setStatus(user.status);
    setSectorIds(user.sectorIds);
  }, [user]);

  const selectedRole = useMemo(() => roles.find((r) => r.id === roleId), [roles, roleId]);
  const requiresSector = selectedRole ? SECTOR_SCOPED_ROLES.has(selectedRole.name) : false;

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (requiresSector && sectorIds.length === 0) {
      setError('Role Supervisor / PIC wajib memiliki minimal satu sektor.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          fullName,
          email,
          roleId,
          status,
          sectorIds: requiresSector ? sectorIds : sectorIds, // selalu kirim agar reset jika role berubah
        }),
      });
      if (res.ok) {
        onSaved();
        onClose();
        return;
      }
      const data = (await res.json()) as { error?: string };
      if (data.error === 'sector_assignment_required') {
        setError('Role ini wajib memiliki minimal satu sektor.');
      } else if (data.error === 'role_not_found') {
        setError('Role tidak ditemukan.');
      } else {
        setError(data.error ?? 'Gagal menyimpan perubahan.');
      }
    } catch {
      setError('Tidak dapat menghubungi server.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-end">
      <form
        onSubmit={submit}
        className="bg-white shadow-xl w-full max-w-md h-full flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-lg font-bold">Edit User</h2>
            <p className="text-xs text-slate-500">@{user.username}</p>
          </div>
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
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Nama Lengkap</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={1}
              maxLength={100}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Role</span>
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as UserRow['status'])}>
              <option value="active">Aktif</option>
              <option value="disabled">Nonaktif</option>
              <option value="locked">Terkunci</option>
            </select>
            <span className="text-xs text-slate-500">
              Mengubah ke Nonaktif akan mengakhiri seluruh sesi user (logout paksa).
            </span>
          </label>
          {requiresSector && (
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Sektor yang Ditugaskan</span>
              <SectorAssignmentSelector value={sectorIds} onChange={setSectorIds} sectors={sectors} />
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
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
      </form>
    </div>
  );
}

export default UserEditDrawer;
