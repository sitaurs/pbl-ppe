'use client';

import { useState, useEffect } from 'react';
import { BarChart3, AlertTriangle, TrendingUp, Calendar } from 'lucide-react';
import PageTransition from '@/components/PageTransition';

interface Violation {
  id: number;
  timestamp: string;
  sektorId: string;
  sektorName: string;
  violations: string[];
}

export default function ReportsPage() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/violations').then(r => r.json()).then(setViolations).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Last 7 days
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const perDay = days.map(day => {
    const dateStr = day.toISOString().split('T')[0];
    const count = violations.filter(v => v.timestamp?.startsWith(dateStr)).length;
    return { day, count };
  });
  const maxCount = Math.max(...perDay.map(d => d.count), 1);

  // Per-sector breakdown
  const sectorMap: Record<string, number> = {};
  violations.forEach(v => {
    const name = v.sektorName || 'Tidak diketahui';
    sectorMap[name] = (sectorMap[name] || 0) + 1;
  });
  const sectorEntries = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);
  const totalV = violations.length;

  const todayCount = violations.filter(v => {
    const today = new Date().toISOString().split('T')[0];
    return v.timestamp?.startsWith(today);
  }).length;

  const avgPerDay = totalV > 0 ? Math.round(totalV / 7) : 0;

  return (
    <PageTransition>
      <div className="flex items-center justify-between mb-6 stagger-item stagger-1">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Laporan</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Analisis data pelanggaran APD</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 stagger-item stagger-2">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Total Pelanggaran</p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{totalV}</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--orange)' }}>
              <AlertTriangle size={18} color="white" />
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Hari Ini</p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'var(--accent)' }}>{todayCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent)' }}>
              <Calendar size={18} color="white" />
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Rata-rata/Hari</p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'var(--orange)' }}>{avgPerDay}</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--warning)' }}>
              <TrendingUp size={18} color="white" />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 stagger-item stagger-3">
          <div className="skeleton h-64 rounded-xl" />
          <div className="skeleton h-64 rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 stagger-item stagger-3">
          {/* Bar Chart */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={18} style={{ color: 'var(--accent)' }} />
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Pelanggaran 7 Hari Terakhir</h2>
            </div>
            <div className="flex items-end gap-2 sm:gap-3 h-44 mt-4">
              {perDay.map(({ day, count }, i) => (
                <div key={i} className="flex-1 min-w-[28px] flex flex-col items-center gap-1 h-full justify-end">
                  {count > 0 && <span className="text-[11px] font-bold" style={{ color: 'var(--accent)' }}>{count}</span>}
                  <div
                    className="w-full rounded-t-md transition-all duration-500"
                    style={{
                      height: count > 0 ? `${(count / maxCount) * 100}%` : '4px',
                      background: count > 0 ? 'var(--accent)' : 'var(--border)',
                      minHeight: '4px',
                    }}
                  />
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {day.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Sector Breakdown */}
          <div className="card p-5">
            <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Breakdown Per Sektor</h2>
            {sectorEntries.length === 0 ? (
              <p className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)' }}>Belum ada data.</p>
            ) : (
              <div className="space-y-4">
                {sectorEntries.map(([name, count], idx) => {
                  const pct = Math.round((count / totalV) * 100);
                  const colors = ['var(--orange)', 'var(--accent)', 'var(--warning)'];
                  return (
                    <div key={name}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{name}</span>
                        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{count} ({pct}%)</span>
                      </div>
                      <div className="w-full h-2.5 rounded-full" style={{ background: 'var(--border)' }}>
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: colors[idx % colors.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </PageTransition>
  );
}
