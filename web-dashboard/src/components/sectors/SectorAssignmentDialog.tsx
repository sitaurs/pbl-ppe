'use client';

/**
 * SectorAssignmentDialog — pilih user (Supervisor/PIC_Sektor) untuk
 * sebuah sektor. Mengirim PUT /api/sectors/:id/users.
 */
import { useEffect, useMemo, useState } from 'react';
import { X, Check } from 'lucide-react';
import { useApiFetch } from '@/hooks/use-csrf-token';
import type { SectorRow } from './SectorTable';

const SCOPED_ROLES = new Set(['Supervisor', 'PIC_Sektor']);

interface UserOption {
  id: string;
  username: string;
  fullName: string;
  role: { id: string; name: string };
  sectorIds: string[];
}

interface Props {
  sector: SectorRow;
  onClose: () => void;
  onSaved: () => void;
}

export function SectorAssignmentDialog({ sector, onClose, onSaved }: Props): React.ReactElement {
  const apiFetch = useApiFetch();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/users');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { users: UserOption[] };
        if (cancelled) return;
        const scoped = data.users.filter((u) => SCOPED_ROLES.has(u.role.name));
        setUsers(scoped);
        const initial = new Set(scoped.filter((u) => u.sectorIds.includes(sector.id)).map((u) => u.id));
        setSelected(initial);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiFetch, sector.id]);

  const allUserIds = useMemo(() => users.map((u) => u.id), [users]);

  function toggle(id: string): void {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/sectors/${sector.id}/users`, {
        method: 'PUT',
        body: JSON.stringify({ userIds: Array.from(selected) }),
      });
      if (res.ok) {
        onSaved();
        onClose();
        return;
      }
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? 'Gagal menyimpan assignment.');
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
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] my-auto flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-lg font-bold">Tugaskan User</h2>
            <p className="text-xs text-slate-500">Sektor {sector.id} — {sector.name}</p>
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
        <div className="p-5 overflow-y-auto flex-1">
          {error && (
            <div role="alert" className="bg-red-100 border border-red-300 p-3 rounded text-sm text-red-800 mb-3">
              {error}
            </div>
          )}
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton h-10 rounded" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-slate-500">
              Tidak ada user dengan role Supervisor / PIC_Sektor. Buat user dengan role tersebut terlebih dahulu di halaman <em>Kelola User</em>.
            </p>
          ) : (
            <ul className="space-y-1">
              {users.map((u) => {
                const checked = selected.has(u.id);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => toggle(u.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 rounded-lg"
                    >
                      <span
                        className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                        style={{
                          borderColor: checked ? 'var(--accent)' : 'var(--border-strong)',
                          background: checked ? 'var(--accent)' : 'transparent',
                        }}
                      >
                        {checked && <Check size={11} color="white" />}
                      </span>
                      <span className="font-mono text-xs">@{u.username}</span>
                      <span className="text-slate-700">{u.fullName}</span>
                      <span className="badge badge-info ml-auto">{u.role.name.replace(/_/g, ' ')}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <span className="text-xs text-slate-500">
            {selected.size} dari {allUserIds.length} user dipilih
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border min-h-[44px]"
              style={{ borderColor: 'var(--border)' }}
            >
              Batal
            </button>
            <button type="submit" disabled={submitting || loading} className="btn-primary min-h-[44px] disabled:opacity-50">
              {submitting ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default SectorAssignmentDialog;
