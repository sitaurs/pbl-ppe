'use client';

/**
 * SectorCreateDialog — modal form POST /api/sectors atau PUT /api/sectors/:id.
 *
 * Sektor id mengikuti regex `^S-\d{2,3}$`.
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useApiFetch } from '@/hooks/use-csrf-token';
import type { SectorRow } from './SectorTable';

interface Props {
  sector: SectorRow | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

const SECTOR_ID_REGEX = /^S-\d{2,3}$/;

export function SectorCreateDialog({ sector, onClose, onSaved }: Props): React.ReactElement {
  const apiFetch = useApiFetch();
  const isEdit = sector !== null;
  const [id, setId] = useState(sector?.id ?? '');
  const [name, setName] = useState(sector?.name ?? '');
  const [description, setDescription] = useState(sector?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setId(sector?.id ?? '');
    setName(sector?.name ?? '');
    setDescription(sector?.description ?? '');
  }, [sector]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (!isEdit && !SECTOR_ID_REGEX.test(id)) {
      setError('ID sektor harus mengikuti format S-01, S-02, S-100, dst.');
      return;
    }
    setSubmitting(true);
    try {
      const res = isEdit
        ? await apiFetch(`/api/sectors/${sector!.id}`, {
            method: 'PUT',
            body: JSON.stringify({ name, description }),
          })
        : await apiFetch('/api/sectors', {
            method: 'POST',
            body: JSON.stringify({ id, name, description }),
          });
      if (res.ok) {
        onSaved();
        onClose();
        return;
      }
      const data = (await res.json()) as { error?: string };
      if (data.error === 'sector_id_exists') {
        setError('ID sektor sudah dipakai.');
      } else {
        setError(data.error ?? 'Gagal menyimpan sektor.');
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
        className="bg-white rounded-2xl shadow-xl w-full max-w-md my-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-bold">{isEdit ? `Edit Sektor ${sector?.id}` : 'Tambah Sektor Baru'}</h2>
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
            <span className="font-medium">ID Sektor</span>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value.toUpperCase())}
              required
              disabled={isEdit}
              pattern="S-\d{2,3}"
              placeholder="S-01"
              className="font-mono"
            />
            <span className="text-xs text-slate-500">Format: S-01, S-02, ..., S-999.</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Nama Sektor</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={1}
              maxLength={100}
              placeholder="cth: Area Loading Dock"
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

export default SectorCreateDialog;
