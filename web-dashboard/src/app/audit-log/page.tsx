'use client';

/**
 * /audit-log — daftar audit log + filter + ekspor CSV.
 *
 * Sesuai Req 13.4, 13.5.
 */
import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import { AuditLogFilters, type AuditFilterState } from '@/components/audit-log/AuditLogFilters';
import { AuditLogTable, type AuditEntry } from '@/components/audit-log/AuditLogTable';
import { useApiFetch } from '@/hooks/use-csrf-token';

interface AuditResponse {
  entries: AuditEntry[];
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
}

interface UsersResponse {
  users: { id: string; username: string }[];
}

const DEFAULT_FILTER: AuditFilterState = {
  from: '',
  to: '',
  action: '',
  userId: '',
  resourceType: '',
};

const PAGE_SIZE = 50;

function buildQuery(filter: AuditFilterState, page: number): string {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(PAGE_SIZE));
  if (filter.from) params.set('from', new Date(filter.from).toISOString());
  if (filter.to) params.set('to', new Date(filter.to).toISOString());
  if (filter.action) params.set('action', filter.action);
  if (filter.userId) params.set('userId', filter.userId);
  if (filter.resourceType) params.set('resourceType', filter.resourceType);
  return params.toString();
}

export default function AuditLogPage(): React.ReactElement {
  const apiFetch = useApiFetch();
  const [filter, setFilter] = useState<AuditFilterState>(DEFAULT_FILTER);
  const [appliedFilter, setAppliedFilter] = useState<AuditFilterState>(DEFAULT_FILTER);
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<AuditResponse['pagination']>({
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: 1,
  });
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (filterToUse: AuditFilterState, pageToUse: number) => {
      setLoading(true);
      setError(null);
      try {
        const qs = buildQuery(filterToUse, pageToUse);
        const res = await apiFetch(`/api/audit-log?${qs}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AuditResponse;
        setEntries(data.entries);
        setPagination(data.pagination);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [apiFetch],
  );

  // Fetch users once for resolving userId -> username (best effort).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/users');
        if (!res.ok) return;
        const data = (await res.json()) as UsersResponse;
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const u of data.users) map.set(u.id, u.username);
        setUserMap(map);
      } catch {
        // ignore — table will fall back to displaying raw userId
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  useEffect(() => {
    fetchData(appliedFilter, page);
  }, [fetchData, appliedFilter, page]);

  const handleApply = (): void => {
    setAppliedFilter(filter);
    setPage(1);
  };
  const handleReset = (): void => {
    setFilter(DEFAULT_FILTER);
    setAppliedFilter(DEFAULT_FILTER);
    setPage(1);
  };

  const handleExport = async (): Promise<void> => {
    const qs = buildQuery(appliedFilter, 1);
    try {
      const res = await apiFetch(`/api/audit-log/export?${qs}`);
      if (!res.ok) {
        alert('Gagal mengunduh CSV.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Tidak dapat menghubungi server.');
    }
  };

  return (
    <PageTransition>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 stagger-item stagger-1">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Audit Log
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Riwayat aksi sistem yang tidak dapat dimodifikasi (append-only).
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => fetchData(appliedFilter, page)}
            className="flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-lg font-medium text-sm"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button type="button" onClick={handleExport} className="btn-primary flex items-center gap-2 min-h-[44px]">
            <Download size={14} /> Ekspor CSV
          </button>
        </div>
      </div>

      <div className="card p-4 mb-4 stagger-item stagger-2">
        <AuditLogFilters value={filter} onChange={setFilter} onApply={handleApply} onReset={handleReset} />
      </div>

      {error && (
        <div role="alert" className="bg-red-100 border border-red-300 p-3 rounded text-sm text-red-800 mb-4">
          {error}
        </div>
      )}

      <div className="card overflow-hidden stagger-item stagger-3">
        <AuditLogTable entries={entries} userMap={userMap} loading={loading} />
      </div>

      <div className="flex items-center justify-between mt-4 text-sm stagger-item stagger-4">
        <span style={{ color: 'var(--text-muted)' }}>
          Menampilkan {entries.length} dari {pagination.total} entri (halaman {pagination.page}/
          {pagination.totalPages})
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-2 rounded-lg border min-h-[44px] disabled:opacity-50"
            style={{ borderColor: 'var(--border)' }}
          >
            ← Sebelumnya
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page >= pagination.totalPages}
            className="px-3 py-2 rounded-lg border min-h-[44px] disabled:opacity-50"
            style={{ borderColor: 'var(--border)' }}
          >
            Selanjutnya →
          </button>
        </div>
      </div>
    </PageTransition>
  );
}
