'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Monitor, X, AlertTriangle, Camera, Clock, Shield, WifiOff } from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import { getYoloWebSocketUrl } from '@/lib/ws-url';

interface CameraFrame {
  sector_id: string;
  sector_name: string;
  frame: string;
  violations: number;
  timestamp: string;
}

export default function MonitorPage() {
  const [frames, setFrames] = useState<Record<string, CameraFrame>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [violationCounts, setViolationCounts] = useState<Record<string, number>>({});
  const [nodeCount, setNodeCount] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const framesBuffer = useRef<Record<string, CameraFrame>>({});
  const connectRef = useRef<() => void>(() => { /* placeholder */ });

  const fetchNodeCount = useCallback(async () => {
    try {
      const res = await fetch('/api/nodes');
      if (!res.ok) return;
      const data = await res.json() as Array<{ enabled?: boolean }> | { nodes?: Array<{ enabled?: boolean }> };
      const nodes = Array.isArray(data) ? data : (data.nodes ?? []);
      setNodeCount(nodes.filter((node) => node.enabled !== false).length);
    } catch {
      // ignore
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    try {
      const wsUrl = getYoloWebSocketUrl();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => { setWsConnected(false); setTimeout(() => connectRef.current(), 3000); };
      ws.onerror = () => setWsConnected(false);
      ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          if (raw.event !== 'video_frame') return;
          const id = raw.node_id || raw.camera_source || 'default';
          const vCount = Array.isArray(raw.violations) ? raw.violations.length : 0;
          framesBuffer.current[id] = {
            sector_id: id,
            sector_name: raw.sector_name || `Kamera ${id}`,
            frame: raw.frame,
            violations: vCount,
            timestamp: raw.timestamp,
          };
          // Track total violations per camera
          if (vCount > 0) {
            setViolationCounts(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
          }
        } catch { /* ignore */ }
      };
    } catch { setWsConnected(false); }
  }, []);

  useLayoutEffect(() => {
    connectRef.current = connectWebSocket;
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    connectWebSocket();
    void fetchNodeCount();
    const renderInterval = setInterval(() => {
      setFrames({ ...framesBuffer.current });
    }, 150);
    const nodesInterval = setInterval(() => {
      void fetchNodeCount();
    }, 15000);
    return () => {
      clearInterval(renderInterval);
      clearInterval(nodesInterval);
      wsRef.current?.close();
    };
  }, [connectWebSocket, fetchNodeCount]);

  const cameraList = Object.values(frames);
  const selectedCam = selected ? frames[selected] : null;
  const totalViolations = Object.values(violationCounts).reduce((a, b) => a + b, 0);

  return (
    <PageTransition>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 stagger-item stagger-1">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Live Monitor</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Pantau kamera CCTV real-time</p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-4 mb-5 p-3 rounded-xl stagger-item stagger-2"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${wsConnected ? 'animate-pulse-dot' : ''}`}
            style={{ background: wsConnected ? '#4ade80' : 'var(--orange)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {wsConnected ? 'Engine Online' : 'Engine Offline'}
          </span>
        </div>
        <div className="w-px h-4" style={{ background: 'var(--border)' }} />
        <div className="flex items-center gap-1.5">
          <Camera size={13} style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{cameraList.length}</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>kamera aktif</span>
        </div>
        <div className="w-px h-4" style={{ background: 'var(--border)' }} />
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={13} style={{ color: 'var(--orange)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--orange)' }}>{totalViolations}</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>pelanggaran terdeteksi</span>
        </div>
      </div>

      {/* Camera Grid */}
      {cameraList.length === 0 ? (
        <div className="card p-12 text-center stagger-item stagger-3">
          {nodeCount === 0 ? (
            <>
              <Monitor size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Belum ada node aktif</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Tambahkan node di Kelola Node untuk mulai menampilkan kamera.</p>
            </>
          ) : wsConnected ? (
            <>
              <Monitor size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Menunggu frame dari backend...</p>
            </>
          ) : (
            <>
              <WifiOff size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Backend tidak terhubung</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Jalankan: python ServiceAPDBackend.py</p>
            </>
          )}
        </div>
      ) : (
        <div className={`grid gap-5 stagger-item stagger-3 ${
          cameraList.length === 1 ? 'grid-cols-1 max-w-2xl' : 'grid-cols-1 md:grid-cols-2'
        }`}>
          {cameraList.map((cam, idx) => (
            <div key={cam.sector_id || `cam-${idx}`}
              className="card overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg"
              onClick={() => setSelected(cam.sector_id)}
            >
              {/* Video */}
              <div style={{ background: '#0a0a0a' }}>
                <img
                  src={`data:image/jpeg;base64,${cam.frame}`}
                  alt={cam.sector_name}
                  className="w-full block"
                  style={{ aspectRatio: '16/9', objectFit: 'cover' }}
                />
              </div>
              {/* Info bar di bawah */}
              <div className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{cam.sector_name}</p>
                </div>
                <div className="flex items-center gap-3">
                  {cam.violations > 0 && (
                    <span className="text-[11px] font-bold px-2 py-1 rounded-lg" style={{ background: '#fef0e8', color: 'var(--orange)' }}>
                      {cam.violations} alert
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: '#4ade80' }} />
                    <span className="text-[10px] font-semibold uppercase" style={{ color: '#4ade80' }}>Live</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Panel — full-screen on mobile, card overlay on desktop */}
      {selectedCam && (
        <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center p-0 md:p-8"
          style={{ background: 'rgba(26,26,46,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSelected(null)}
        >
          <div className="card w-full md:max-w-4xl h-full md:h-auto max-h-[100vh] md:max-h-[90vh] overflow-y-auto md:rounded-xl rounded-none animate-fade-in"
            onClick={e => e.stopPropagation()}
            style={{ boxShadow: '0 20px 60px rgba(26,26,46,0.3)' }}
          >
            {/* Header panel */}
            <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)' }}>
                  <Camera size={14} color="white" />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{selectedCam.sector_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: '#f0faf5' }}>
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: '#4ade80' }} />
                  <span className="text-[10px] font-bold uppercase" style={{ color: '#16a34a' }}>Live</span>
                </div>
                <button onClick={() => setSelected(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors"
                  style={{ minWidth: 44, minHeight: 44 }}>
                  <X size={18} style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
            </div>

            {/* Video besar */}
            <div style={{ background: '#0a0a0a' }}>
              <img
                src={`data:image/jpeg;base64,${selectedCam.frame}`}
                alt={selectedCam.sector_name}
                className="w-full block"
                style={{ aspectRatio: '16/9', objectFit: 'contain' }}
              />
            </div>

            {/* Bottom info */}
            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                  <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {selectedCam.timestamp ? new Date(selectedCam.timestamp).toLocaleTimeString('id-ID') : '--:--:--'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Shield size={12} style={{ color: selectedCam.violations > 0 ? 'var(--orange)' : 'var(--accent)' }} />
                  <span className="text-xs font-medium" style={{ color: selectedCam.violations > 0 ? 'var(--orange)' : 'var(--accent)' }}>
                    {selectedCam.violations > 0 ? `${selectedCam.violations} pelanggaran aktif` : 'Semua aman'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={12} style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Total sesi: {violationCounts[selectedCam.sector_id] || 0} pelanggaran
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}
