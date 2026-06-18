'use client';

import { useCallback, useEffect, useState } from 'react';
import { Monitor, X, AlertTriangle, Camera, Shield, WifiOff } from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import GasAlertBadge from '@/components/nodes/GasAlertBadge';

interface MonitorNode {
  id: number;
  sektorId: string;
  sektorName: string;
  picName: string;
  enabled: boolean;
}

interface ViolationData {
  id: string;
  timestamp: string;
  nodeId: number;
  sektorId: string;
  acknowledged: boolean;
}

function getMjpegStreamUrl(nodeId: number): string {
  return `/api/monitor/stream/${nodeId}`;
}

function withRetryToken(url: string, retryToken: number): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${retryToken}`;
}

export default function MonitorPage() {
  const [nodes, setNodes] = useState<MonitorNode[]>([]);
  const [engineOnline, setEngineOnline] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [violationCounts, setViolationCounts] = useState<Record<number, number>>({});
  const [streamErrors, setStreamErrors] = useState<Record<number, boolean>>({});
  const [retryTokens, setRetryTokens] = useState<Record<number, number>>({});

  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch('/api/nodes');
      if (!res.ok) return;
      const data = await res.json() as MonitorNode[];
      setNodes(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }, []);

  const fetchViolations = useCallback(async () => {
    try {
      const res = await fetch('/api/violations');
      if (!res.ok) return;
      const data = await res.json() as ViolationData[];
      if (!Array.isArray(data)) return;

      const counts: Record<number, number> = {};
      for (const violation of data) {
        counts[violation.nodeId] = (counts[violation.nodeId] || 0) + 1;
      }
      setViolationCounts(counts);
    } catch {
      // ignore
    }
  }, []);

  const fetchEngineHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor/health', { cache: 'no-store' });
      setEngineOnline(res.ok);
    } catch {
      setEngineOnline(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void fetchNodes();
      void fetchViolations();
      void fetchEngineHealth();
    }, 0);

    const nodeInterval = setInterval(() => {
      void fetchNodes();
      void fetchViolations();
    }, 15000);
    const healthInterval = setInterval(() => {
      void fetchEngineHealth();
    }, 5000);

    return () => {
      clearTimeout(initialLoad);
      clearInterval(nodeInterval);
      clearInterval(healthInterval);
    };
  }, [fetchEngineHealth, fetchNodes, fetchViolations]);

  useEffect(() => {
    const retryInterval = setInterval(() => {
      setRetryTokens((prev) => {
        const next = { ...prev };
        for (const [key, hasError] of Object.entries(streamErrors)) {
          if (hasError) {
            const nodeId = Number(key);
            next[nodeId] = (next[nodeId] || 0) + 1;
          }
        }
        return next;
      });
    }, 3000);

    return () => clearInterval(retryInterval);
  }, [streamErrors]);

  const enabledNodes = nodes.filter((node) => node.enabled !== false);
  const selectedCam = selected !== null
    ? enabledNodes.find((node) => node.id === selected) ?? null
    : null;
  const totalViolations = Object.values(violationCounts).reduce((a, b) => a + b, 0);

  return (
    <PageTransition>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 stagger-item stagger-1">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Live Monitor</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Pantau kamera CCTV real-time (MJPEG)</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-5 p-3 rounded-xl stagger-item stagger-2"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${engineOnline ? 'animate-pulse-dot' : ''}`}
            style={{ background: engineOnline ? '#4ade80' : 'var(--orange)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {engineOnline ? 'Engine Online' : 'Engine Offline'}
          </span>
        </div>
        <div className="w-px h-4" style={{ background: 'var(--border)' }} />
        <div className="flex items-center gap-1.5">
          <Camera size={13} style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{enabledNodes.length}</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>kamera aktif</span>
        </div>
        <div className="w-px h-4" style={{ background: 'var(--border)' }} />
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={13} style={{ color: 'var(--orange)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--orange)' }}>{totalViolations}</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>pelanggaran tercatat</span>
        </div>
      </div>

      {enabledNodes.length === 0 ? (
        <div className="card p-12 text-center stagger-item stagger-3">
          <Monitor size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Belum ada node aktif</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Tambahkan node di Kelola Node untuk mulai menampilkan kamera.</p>
        </div>
      ) : !engineOnline ? (
        <div className="card p-12 text-center stagger-item stagger-3">
          <WifiOff size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Backend monitor MJPEG tidak terhubung</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Pastikan backend Python berjalan dan engine monitor aktif.</p>
        </div>
      ) : (
        <div className={`grid gap-5 stagger-item stagger-3 ${
          enabledNodes.length === 1 ? 'grid-cols-1 max-w-2xl' : 'grid-cols-1 md:grid-cols-2'
        }`}>
          {enabledNodes.map((node) => {
            const violationCount = violationCounts[node.id] || 0;
            const streamFailed = streamErrors[node.id] === true;

            return (
              <div key={node.id}
                className="card overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg"
                onClick={() => setSelected(node.id)}
              >
                <div className="relative" style={{ background: '#0a0a0a' }}>
                  <img
                    src={withRetryToken(getMjpegStreamUrl(node.id), retryTokens[node.id] || 0)}
                    alt={node.sektorName}
                    className="w-full block"
                    style={{ aspectRatio: '16/9', objectFit: 'cover', opacity: streamFailed ? 0.2 : 1 }}
                    onLoad={() => setStreamErrors((prev) => ({ ...prev, [node.id]: false }))}
                    onError={() => setStreamErrors((prev) => ({ ...prev, [node.id]: true }))}
                  />
                  {streamFailed && (
                    <div className="flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
                      <div className="text-center">
                        <WifiOff size={24} className="mx-auto mb-2 opacity-40" />
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Stream belum tersedia, mencoba ulang...</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{node.sektorName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <GasAlertBadge nodeId={node.id} />
                    {violationCount > 0 && (
                      <span className="text-[11px] font-bold px-2 py-1 rounded-lg" style={{ background: '#fef0e8', color: 'var(--orange)' }}>
                        {violationCount} tercatat
                      </span>
                    )}
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: streamFailed ? 'var(--orange)' : '#4ade80' }} />
                      <span className="text-[10px] font-semibold uppercase" style={{ color: streamFailed ? 'var(--orange)' : '#4ade80' }}>
                        {streamFailed ? 'Retry' : 'Live'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedCam && (
        <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center p-0 md:p-8"
          style={{ background: 'rgba(26,26,46,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSelected(null)}
        >
          <div className="card w-full md:max-w-4xl h-full md:h-auto max-h-[100vh] md:max-h-[90vh] overflow-y-auto md:rounded-xl rounded-none animate-fade-in"
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: '0 20px 60px rgba(26,26,46,0.3)' }}
          >
            <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)' }}>
                  <Camera size={14} color="white" />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{selectedCam.sektorName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <GasAlertBadge nodeId={selectedCam.id} />
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: '#f0faf5' }}>
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: '#4ade80' }} />
                  <span className="text-[10px] font-bold uppercase" style={{ color: '#16a34a' }}>MJPEG</span>
                </div>
                <button onClick={() => setSelected(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors"
                  style={{ minWidth: 44, minHeight: 44 }}>
                  <X size={18} style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
            </div>

            <div style={{ background: '#0a0a0a' }}>
              <img
                src={withRetryToken(getMjpegStreamUrl(selectedCam.id), retryTokens[selectedCam.id] || 0)}
                alt={selectedCam.sektorName}
                className="w-full block"
                style={{ aspectRatio: '16/9', objectFit: 'contain' }}
                onLoad={() => setStreamErrors((prev) => ({ ...prev, [selectedCam.id]: false }))}
                onError={() => setStreamErrors((prev) => ({ ...prev, [selectedCam.id]: true }))}
              />
            </div>

            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Shield size={12} style={{ color: (violationCounts[selectedCam.id] || 0) > 0 ? 'var(--orange)' : 'var(--accent)' }} />
                  <span className="text-xs font-medium" style={{ color: (violationCounts[selectedCam.id] || 0) > 0 ? 'var(--orange)' : 'var(--accent)' }}>
                    {(violationCounts[selectedCam.id] || 0) > 0 ? `${violationCounts[selectedCam.id] || 0} pelanggaran tercatat` : 'Belum ada pelanggaran tercatat'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={12} style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Node #{selectedCam.id} · PIC {selectedCam.picName || 'belum diisi'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}
