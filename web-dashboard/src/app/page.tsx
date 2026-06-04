'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Server, AlertTriangle, ShieldCheck, Activity, Camera, Clock } from 'lucide-react';
import PageTransition from '@/components/PageTransition';

interface NodeData {
  id: number;
  sektorId: string;
  sektorName: string;
  picName: string;
  picPhone: string;
  cameraSource: string;
  enabled: boolean;
}

interface ViolationData {
  id: number;
  timestamp: string;
  sektorId: string;
  sektorName: string;
  picName: string;
  violations: string[];
  waStatus: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [violations, setViolations] = useState<ViolationData[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [lastFetchAgo, setLastFetchAgo] = useState(0);
  const lastFetchTime = useRef(Date.now());

  // Live thumbnail refs & state
  const latestFrames = useRef<Record<string, string>>({});
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  // Real-time clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }) + ' WIB'
      );
      setLastFetchAgo(Math.floor((Date.now() - lastFetchTime.current) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Fetch data
  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch('/api/nodes');
      if (res.ok) setNodes(await res.json());
    } catch {}
  }, []);

  const fetchViolations = useCallback(async () => {
    try {
      const res = await fetch('/api/violations');
      if (res.ok) setViolations(await res.json());
      lastFetchTime.current = Date.now();
    } catch {}
  }, []);

  useEffect(() => {
    fetchNodes();
    fetchViolations();
    const interval = setInterval(() => { fetchNodes(); fetchViolations(); }, 15000);
    return () => clearInterval(interval);
  }, [fetchNodes, fetchViolations]);

  // WebSocket connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
        const wsHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        ws = new WebSocket(`ws://${wsHost}:8765`);
        ws.onopen = () => setWsConnected(true);
        ws.onclose = () => {
          setWsConnected(false);
          reconnectTimer = setTimeout(connect, 5000);
        };
        ws.onerror = () => setWsConnected(false);
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // Python kirim { event:'video_frame', node_id, camera_source, sector_name, frame }
            if (data.event === 'video_frame' && data.frame) {
              // Key by camera_source DAN sector_name agar lookup fleksibel.
              const camSrc = String(data.camera_source ?? data.node_id ?? '');
              if (camSrc) latestFrames.current[camSrc] = data.frame;
              if (data.sector_name) latestFrames.current[data.sector_name] = data.frame;
              // Tampilkan frame pertama segera (jangan tunggu 30 detik).
              setThumbnails((prev) =>
                Object.keys(prev).length === 0 ? { ...latestFrames.current } : prev,
              );
            }
          } catch {}
        };
      } catch {
        setWsConnected(false);
      }
    };

    connect();

    // Copy frames to state every 30 seconds
    const thumbInterval = setInterval(() => {
      const current = { ...latestFrames.current };
      if (Object.keys(current).length > 0) {
        setThumbnails(current);
      }
    }, 30000);

    return () => {
      clearTimeout(reconnectTimer);
      clearInterval(thumbInterval);
      ws?.close();
    };
  }, []);

  // Computed data
  const enabledNodes = nodes.filter(n => n.enabled !== false);
  const today = new Date().toISOString().split('T')[0];
  const todayViolations = violations.filter(v => v.timestamp?.startsWith(today));
  const todayCount = todayViolations.length;
  const totalDetections = violations.length;

  // Yesterday violations for micro-trend
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const yesterdayCount = violations.filter(v => v.timestamp?.startsWith(yesterdayStr)).length;
  const microTrend = yesterdayCount > 0 ? `+${todayCount - yesterdayCount} dari kemarin` : '-';

  const complianceRate = totalDetections > 0
    ? Math.round(((totalDetections - todayCount) / Math.max(totalDetections, 1)) * 100)
    : 100;

  // Sectors with active violations (today) sorted first
  const sectorViolationCounts: Record<string, number> = {};
  todayViolations.forEach(v => {
    sectorViolationCounts[v.sektorId] = (sectorViolationCounts[v.sektorId] || 0) + 1;
  });

  const sortedNodes = [...enabledNodes].sort((a, b) => {
    const aCount = sectorViolationCounts[a.sektorId] || 0;
    const bCount = sectorViolationCounts[b.sektorId] || 0;
    return bCount - aCount;
  });

  // Recent activity (max 8)
  const recentActivity = violations.slice(0, 8);

  return (
    <PageTransition>
      {/* Section 1: Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 stagger-item stagger-1">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Monitoring APD Real-time</p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{currentTime}</span>
          <div className={`w-2 h-2 rounded-full ${wsConnected ? 'animate-pulse-dot' : ''}`}
            style={{ background: wsConnected ? 'var(--accent)' : 'var(--orange)' }} />
        </div>
      </div>

      {/* Section 2: Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger-item stagger-2">
        <Link href="/nodes" className="card p-5 cursor-pointer hover:-translate-y-0.5 transition-transform">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Node Aktif</p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{enabledNodes.length}</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>kamera terdaftar</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#1a3a6b' }}>
              <Server size={18} color="white" />
            </div>
          </div>
        </Link>

        <Link href="/violations" className="card p-5 cursor-pointer hover:-translate-y-0.5 transition-transform">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Pelanggaran Hari Ini</p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'var(--orange)' }}>{todayCount}</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{microTrend}</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--orange)' }}>
              <AlertTriangle size={18} color="white" />
            </div>
          </div>
        </Link>

        <Link href="/reports" className="card p-5 cursor-pointer hover:-translate-y-0.5 transition-transform">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Compliance Rate</p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'var(--accent)' }}>{complianceRate}%</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>tingkat kepatuhan</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent)' }}>
              <ShieldCheck size={18} color="white" />
            </div>
          </div>
        </Link>

        <Link href="/violations" className="card p-5 cursor-pointer hover:-translate-y-0.5 transition-transform">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Total Deteksi</p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'var(--orange)' }}>{totalDetections}</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>seluruh riwayat</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--orange)' }}>
              <Activity size={18} color="white" />
            </div>
          </div>
        </Link>
      </div>

      {/* Section 3: Live Sektor Preview */}
      <div className="mb-6 stagger-item stagger-3">
        <h2 className="text-base font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Live Sektor Preview</h2>
        <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory' }}>
          {sortedNodes.slice(0, 5).map((node) => {
            const hasViolation = (sectorViolationCounts[node.sektorId] || 0) > 0;
            const thumb =
              thumbnails[String(node.cameraSource)] ||
              thumbnails[node.sektorName] ||
              thumbnails[String(node.id)] ||
              thumbnails[node.sektorId];
            return (
              <div
                key={node.id}
                onClick={() => router.push('/monitor')}
                className="flex-shrink-0 w-48 sm:w-56 min-w-[180px] rounded-lg overflow-hidden cursor-pointer hover:-translate-y-0.5 transition-transform"
                style={{
                  scrollSnapAlign: 'start',
                  border: '1px solid var(--border)',
                  borderLeft: hasViolation ? '3px solid var(--orange)' : '1px solid var(--border)',
                  background: 'var(--card-bg)',
                }}
              >
                {/* Thumbnail area */}
                <div className="h-28 flex items-center justify-center" style={{ background: '#1a1a2e' }}>
                  {thumb ? (
                    <img src={`data:image/jpeg;base64,${thumb}`} alt={node.sektorName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Camera size={24} style={{ color: 'var(--sidebar-text)' }} />
                      <span className="text-[10px]" style={{ color: 'var(--sidebar-text)' }}>Menunggu stream</span>
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="p-3 flex items-center justify-between">
                  <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{node.sektorName}</span>
                  {hasViolation && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--orange)', color: 'white' }}>
                      {sectorViolationCounts[node.sektorId]}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {enabledNodes.length === 0 && (
            <div className="text-sm py-8 text-center w-full" style={{ color: 'var(--text-muted)' }}>
              Belum ada node aktif.
            </div>
          )}
        </div>
      </div>

      {/* Section 4: Chart + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6 stagger-item stagger-4">
        {/* Left: Chart */}
        <div className="lg:col-span-2 card p-5">
          <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Grafik Pelanggaran 7 Hari</h2>
          <WeeklyChart violations={violations} />
          <Link href="/reports" className="inline-block mt-4 text-xs font-medium hover:underline" style={{ color: 'var(--accent)' }}>
            Lihat Laporan Lengkap →
          </Link>
        </div>

        {/* Right: Activity Feed */}
        <div className="lg:col-span-1 card p-5">
          <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Aktivitas Terbaru</h2>
          {recentActivity.length === 0 ? (
            <div className="text-center py-8">
              <ShieldCheck size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Semua aman.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((v) => (
                <div key={v.id} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: 'var(--orange)' }} />
                  <div className="flex-1 flex flex-wrap items-center gap-x-1.5 text-[11px] leading-tight">
                    <span className="font-mono font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {new Date(v.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{v.sektorName?.split('(')[0]?.trim()}</span>
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{v.violations?.join(', ')}</span>
                    <span className="text-[9px] font-bold px-1 rounded" style={{
                      background: v.waStatus === 'sent' ? '#e8f0ed' : '#f5ebe8',
                      color: v.waStatus === 'sent' ? '#2d7a5f' : '#c4442e'
                    }}>
                      WA {v.waStatus === 'sent' ? '✓' : '✗'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link href="/violations" className="inline-block mt-4 text-xs font-medium hover:underline" style={{ color: 'var(--accent)' }}>
            Lihat Semua →
          </Link>
        </div>
      </div>

      {/* Section 5: Ringkasan Sektor */}
      <div className="card p-5 mb-6 stagger-item stagger-5">
        <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Ringkasan Sektor</h2>
        {nodes.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Belum ada node terdaftar.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="px-3 py-2">Sektor</th>
                  <th className="px-3 py-2">PIC</th>
                  <th className="px-3 py-2">Pelanggaran Hari Ini</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((node) => (
                  <tr key={node.id} className="cursor-pointer" onClick={() => router.push('/monitor')}>
                    <td className="px-3 py-2 font-medium">{node.sektorName}</td>
                    <td className="px-3 py-2">{node.picName}</td>
                    <td className="px-3 py-2">
                      <span className="font-bold" style={{ color: (sectorViolationCounts[node.sektorId] || 0) > 0 ? 'var(--orange)' : 'var(--success)' }}>
                        {sectorViolationCounts[node.sektorId] || 0}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`badge ${node.enabled !== false ? 'badge-success' : 'badge-danger'}`}>
                        {node.enabled !== false ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 6: Auto-refresh indicator */}
      <div className="text-center pb-16 md:pb-4">
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          Data diperbarui {lastFetchAgo} detik lalu
        </span>
      </div>
    </PageTransition>
  );
}

/* ── Weekly Bar Chart Component ──────────── */
function WeeklyChart({ violations }: { violations: ViolationData[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const perDay = days.map(day => {
    const count = violations.filter(v => {
      if (!v.timestamp) return false;
      return new Date(v.timestamp).toDateString() === day.toDateString();
    }).length;
    return { day, count };
  });

  const maxCount = Math.max(...perDay.map(d => d.count), 1);
  const average = perDay.reduce((sum, d) => sum + d.count, 0) / 7;
  const avgPercent = maxCount > 0 ? (average / maxCount) * 100 : 0;

  return (
    <div className="relative">
      {/* Average dashed line */}
      {average > 0 && (
        <div
          className="absolute left-0 right-0 border-t border-dashed pointer-events-none"
          style={{
            bottom: `calc(${avgPercent}% + 20px)`,
            borderColor: 'var(--text-muted)',
            opacity: 0.5,
          }}
        >
          <span className="absolute -top-3 right-0 text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
            avg {average.toFixed(1)}
          </span>
        </div>
      )}
      <div className="flex items-end gap-2 sm:gap-3 h-36">
        {perDay.map(({ day, count }, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            {count > 0 && (
              <span className="text-[10px] font-bold" style={{ color: 'var(--orange)' }}>{count}</span>
            )}
            <div
              className="w-full rounded-t-md transition-all duration-500"
              style={{
                height: count > 0 ? `${(count / maxCount) * 100}%` : '4px',
                background: count > 0 ? 'var(--orange)' : 'var(--border)',
                minHeight: '4px',
              }}
            />
            <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
              {day.toLocaleDateString('id-ID', { weekday: 'short' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
