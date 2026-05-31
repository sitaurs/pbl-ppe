'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Filter, RefreshCw, Clock, Send, Download, Check, Trash2 } from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import { PermissionGate } from '@/components/access/PermissionGate';
import { useApiFetch } from '@/hooks/use-csrf-token';

interface Violation {
  id: number | string;
  timestamp: string;
  sektorId?: string;
  sektorName?: string;
  picName?: string;
  picPhone?: string;
  violations?: string[];
  ppeMissing?: string[];
  cameraSource?: string;
  waStatus?: string;
  acknowledged?: boolean;
}

export default function ViolationsPage() {
  const apiFetch = useApiFetch();
  const [violations, setViolations] = useState<Violation[]>([]);
  const [filterSector, setFilterSector] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchViolations();
    const interval = setInterval(fetchViolations, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchViolations = async () => {
    try {
      const res = await fetch('/api/violations');
      if (res.ok) {
        const data = await res.json();
        // Normalize ppeMissing -> violations untuk kompatibilitas tampilan lama
        const normalized: Violation[] = (data as Violation[]).map((v) => ({
          ...v,
          violations: v.violations ?? v.ppeMissing ?? [],
        }));
        setViolations(normalized);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const sectors = [...new Set(violations.map((v) => v.sektorName).filter(Boolean))] as string[];
  const filtered = filterSector === 'all'
    ? violations
    : violations.filter((v) => v.sektorName === filterSector);

  const exportCsv = () => {
    const headers = ['id', 'timestamp', 'sektorId', 'sektorName', 'picName', 'violations'];
    const rows = filtered.map((v) =>
      [
        v.id,
        v.timestamp,
        v.sektorId ?? '',
        v.sektorName ?? '',
        v.picName ?? '',
        (v.violations ?? []).join('|'),
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `violations_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const acknowledge = async (v: Violation): Promise<void> => {
    try {
      await apiFetch(`/api/violations/${v.id}/acknowledge`, {
        method: 'POST',
      });
      await fetchViolations();
    } catch {
      // silent
    }
  };

  const remove = async (v: Violation): Promise<void> => {
    if (!confirm('Hapus pelanggaran ini? Tindakan ini tidak dapat dibatalkan.')) return;
    try {
      await apiFetch(`/api/violations/${v.id}`, { method: 'DELETE' });
      await fetchViolations();
    } catch {
      // silent
    }
  };

  return (
    <PageTransition>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 stagger-item stagger-1">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Log Pelanggaran</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Riwayat deteksi pelanggaran APD</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <PermissionGate permission="violation:export">
            <button
              type="button"
              onClick={exportCsv}
              className="flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-lg font-medium text-sm"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              <Download size={14} /> Ekspor CSV
            </button>
          </PermissionGate>
          <button onClick={fetchViolations} className="btn-primary flex items-center gap-2 min-h-[44px]">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="card p-4 mb-4 stagger-item stagger-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Filter size={16} style={{ color: 'var(--text-muted)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Filter Sektor:</span>
            <select value={filterSector} onChange={e => setFilterSector(e.target.value)} className="text-sm min-h-[44px]">
              <option value="all">Semua Sektor</option>
              {sectors.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <span className="sm:ml-auto text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            {filtered.length} data ditemukan
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden stagger-item stagger-3">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <AlertTriangle size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Tidak ada pelanggaran tercatat.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3">Waktu</th>
                  <th className="text-left px-4 py-3">Sektor</th>
                  <th className="text-left px-4 py-3">Pelanggaran</th>
                  <th className="text-left px-4 py-3">PIC</th>
                  <th className="text-left px-4 py-3">No WA</th>
                  <th className="text-left px-4 py-3">Status WA</th>
                  <th className="text-right px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <tr key={String(v.id)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                        <span className="text-xs font-mono">
                          {new Date(v.timestamp).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {v.sektorId && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded mr-1" style={{ background: 'var(--accent)', color: 'white' }}>{v.sektorId}</span>
                      )}
                      <span className="text-sm">{v.sektorName ?? ''}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {v.violations?.map((vl, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: '#f5ede8', color: 'var(--orange)' }}>{vl}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">{v.picName ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{v.picPhone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Send size={11} style={{ color: v.waStatus === 'sent' ? 'var(--accent)' : 'var(--orange)' }} />
                        <span className="text-xs font-medium" style={{ color: v.waStatus === 'sent' ? 'var(--accent)' : 'var(--orange)' }}>
                          {v.waStatus === 'sent' ? 'Terkirim' : v.waStatus === 'failed' ? 'Gagal' : v.acknowledged ? 'Dikonfirmasi' : 'Pending'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {!v.acknowledged && (
                          <PermissionGate permission="violation:acknowledge">
                            <button
                              type="button"
                              onClick={() => acknowledge(v)}
                              className="p-2 rounded-lg hover:bg-emerald-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                              title="Acknowledge"
                              style={{ color: 'var(--success)' }}
                              aria-label="Acknowledge pelanggaran"
                            >
                              <Check size={14} />
                            </button>
                          </PermissionGate>
                        )}
                        <PermissionGate permission="violation:delete">
                          <button
                            type="button"
                            onClick={() => remove(v)}
                            className="btn-danger p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                            title="Hapus"
                            aria-label="Hapus pelanggaran"
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
        )}
      </div>
    </PageTransition>
  );
}
