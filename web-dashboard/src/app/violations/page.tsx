'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Filter, RefreshCw, Clock, Send } from 'lucide-react';
import PageTransition from '@/components/PageTransition';

interface Violation {
  id: number;
  timestamp: string;
  sektorId: string;
  sektorName: string;
  picName: string;
  picPhone: string;
  violations: string[];
  cameraSource: string;
  waStatus: string;
}

export default function ViolationsPage() {
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
      if (res.ok) setViolations(await res.json());
    } catch {} finally { setLoading(false); }
  };

  const sectors = [...new Set(violations.map(v => v.sektorName).filter(Boolean))];
  const filtered = filterSector === 'all' ? violations : violations.filter(v => v.sektorName === filterSector);

  return (
    <PageTransition>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 stagger-item stagger-1">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Log Pelanggaran</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Riwayat deteksi pelanggaran APD</p>
        </div>
        <button onClick={fetchViolations} className="btn-primary flex items-center gap-2 min-h-[44px] self-start sm:self-auto">
          <RefreshCw size={14} /> Refresh
        </button>
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
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <tr key={v.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                        <span className="text-xs font-mono">
                          {new Date(v.timestamp).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold px-2 py-0.5 rounded mr-1" style={{ background: 'var(--accent)', color: 'white' }}>{v.sektorId}</span>
                      <span className="text-sm">{v.sektorName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {v.violations?.map((vl, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: '#f5ede8', color: 'var(--orange)' }}>{vl}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">{v.picName}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{v.picPhone}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Send size={11} style={{ color: v.waStatus === 'sent' ? 'var(--accent)' : 'var(--orange)' }} />
                        <span className="text-xs font-medium" style={{ color: v.waStatus === 'sent' ? 'var(--accent)' : 'var(--orange)' }}>
                          {v.waStatus === 'sent' ? 'Terkirim' : v.waStatus === 'failed' ? 'Gagal' : 'Pending'}
                        </span>
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
