'use client';

/**
 * UserCreateDialog — modal form untuk POST /api/users.
 *
 * Sesuai Req 5.2, 5.3.
 */
import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import { SectorAssignmentSelector, type SectorOption } from '@/components/sectors/SectorAssignmentSelector';
import { useApiFetch } from '@/hooks/use-csrf-token';

const SECTOR_SCOPED_ROLES = new Set(['Supervisor', 'PIC_Sektor']);

export interface RoleOption {
  id: string;
  name: string;
}

interface Props {
  roles: RoleOption[];
  sectors: SectorOption[];
  onClose: () => void;
  onCreated: () => void;
}

export function UserCreateDialog({ roles, sectors, onClose, onCreated }: Props): React.ReactElement {
  const apiFetch = useApiFetch();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '');
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      const res = await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username,
          email,
          fullName,
          password,
          roleId,
          sectorIds: requiresSector ? sectorIds : undefined,
        }),
      });
      if (res.ok) {
        onCreated();
        onClose();
        return;
      }
      const data = (await res.json()) as { error?: string; rules?: string[] };
      if (data.rules && data.rules.length > 0) {
        setError(`Pelanggaran password: ${data.rules.join(', ')}`);
      } else if (data.error === 'sector_assignment_required') {
        setError('Role ini wajib memiliki minimal satu sektor.');
      } else if (data.error === 'role_not_found') {
        setError('Role tidak ditemukan.');
      } else if (data.error === 'invalid_request') {
        setError('Data tidak valid. Periksa username, email, dan password.');
      } else {
        setError(data.error ?? 'Gagal membuat user.');
      }
    } catch {
      setError('Tidak dapat menghubungi server.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
      <form
        onSubmit={submit}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-bold">Tambah User Baru</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {error && (
            <div role="alert" className="bg-red-100 border border-red-300 p-3 rounded text-sm text-red-800">
              {error}
            </div>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={32}
              pattern="[-a-zA-Z0-9._]+"
              autoComplete="off"
              placeholder="cth: budi.k3"
            />
            <span className="text-xs text-slate-500">3–32 karakter alfanumerik, titik, underscore, dash.</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Nama Lengkap</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={1}
              maxLength={100}
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Password Awal</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              maxLength={256}
              autoComplete="new-password"
            />
            <PasswordStrengthMeter password={password} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Role</span>
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          {requiresSector && (
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Sektor yang Ditugaskan</span>
              <SectorAssignmentSelector
                value={sectorIds}
                onChange={setSectorIds}
                sectors={sectors}
                placeholder="Pilih satu atau lebih sektor..."
              />
              <span className="text-xs text-slate-500">
                Wajib minimal satu sektor untuk role Supervisor / PIC_Sektor.
              </span>
            </div>
          )}
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            User akan dipaksa mengganti password saat login pertama.
          </p>
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

export default UserCreateDialog;
