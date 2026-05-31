'use client';

/**
 * /sectors — manajemen sektor + assignment user.
 */
import { useCallback, useEffect, useState } from 'react';
import { Plus, Map as MapIcon } from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import { PermissionGate } from '@/components/access/PermissionGate';
import { SectorTable, type SectorRow } from '@/components/sectors/SectorTable';
import { SectorCreateDialog } from '@/components/sectors/SectorCreateDialog';
import { SectorAssignmentDialog } from '@/components/sectors/SectorAssignmentDialog';
import { useApiFetch } from '@/hooks/use-csrf-token';

interface SectorsResponse {
  sectors: SectorRow[];
}

export default function SectorsPage(): React.ReactElement {
  const apiFetch = useApiFetch();
  const [sectors, setSectors] = useState<SectorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingSector, setEditingSector] = useState<SectorRow | null>(null);
  const [assigningSector, setAssigningSector] = useState<SectorRow | null>(null);

  const fetchSectors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/sectors');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SectorsResponse;
      setSectors(data.sectors);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchSectors();
  }, [fetchSectors]);

  const handleDelete = async (sector: SectorRow): Promise<void> => {
    if (sector.nodeCount > 0) {
      alert(`Sektor ini masih memiliki ${sector.nodeCount} node. Hapus atau pindahkan node terlebih dahulu.`);
      return;
    }
    if (!confirm(`Hapus sektor ${sector.id} (${sector.name})?`)) return;
    try {
      const res = await apiFetch(`/api/sectors/${sector.id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchSectors();
      } else {
        const data = (await res.json()) as { error?: string; nodeCount?: number };
        if (data.error === 'sector_has_nodes') {
          alert(`Sektor masih memiliki ${data.nodeCount ?? '?'} node.`);
        } else {
          alert(data.error ?? 'Gagal menghapus.');
        }
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
            Kelola Sektor
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Definisi sektor dan assignment user pengawas.
          </p>
        </div>
        <PermissionGate permission="sector:create">
          <button
            type="button"
            onClick={() => {
              setEditingSector(null);
              setCreateOpen(true);
            }}
            className="btn-primary flex items-center gap-2 min-h-[44px] self-start sm:self-auto"
          >
            <Plus size={14} /> Tambah Sektor
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
              <div key={i} className="skeleton h-10 rounded-lg" />
            ))}
          </div>
        ) : sectors.length === 0 ? (
          <div className="p-10 text-center">
            <MapIcon size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Belum ada sektor.
            </p>
          </div>
        ) : (
          <SectorTable
            sectors={sectors}
            onEdit={(s) => {
              setEditingSector(s);
              setCreateOpen(true);
            }}
            onAssign={(s) => setAssigningSector(s)}
            onDelete={handleDelete}
          />
        )}
      </div>

      {createOpen && (
        <SectorCreateDialog
          sector={editingSector}
          onClose={() => {
            setCreateOpen(false);
            setEditingSector(null);
          }}
          onSaved={fetchSectors}
        />
      )}
      {assigningSector && (
        <SectorAssignmentDialog
          sector={assigningSector}
          onClose={() => setAssigningSector(null)}
          onSaved={fetchSectors}
        />
      )}
    </PageTransition>
  );
}
