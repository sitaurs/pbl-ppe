'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * LivePreviewPanel — Inline WebSocket frame viewer for camera live preview.
 *
 * Displays the latest frame from a WebSocket stream as a base64 JPEG image.
 * Enforces singleton pattern: only one preview panel can be active at a time
 * (managed by parent via onClose/nodeId props).
 *
 * Close button disconnects WebSocket within 2 seconds (Requirement 5.8).
 * Shows "Koneksi terputus" overlay when WebSocket disconnects unexpectedly.
 *
 * Requirements: 5.4, 5.8
 */

export interface LivePreviewPanelProps {
  /** Node ID di DB (mis. 1) — untuk label */
  nodeId: number;
  /** cameraSource node (mis. "0" atau "rtsp://...") — untuk match frame dari Python */
  cameraSource?: string;
  /** Callback when panel is closed */
  onClose: () => void;
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Derives the WebSocket URL for frame streaming.
 * Python backend (ServiceAPDBackend.py) menyajikan SATU WebSocket di root
 * (ws://host:8765) dan broadcast SEMUA frame ke setiap client. Tidak ada
 * path per-node, jadi kita connect ke root lalu filter by camera_source.
 */
function getWebSocketUrl(): string {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = process.env.NEXT_PUBLIC_WS_PORT || '8765';
    return `${protocol}//${host}:${port}`;
  }
  return 'ws://localhost:8765';
}

export default function LivePreviewPanel({ nodeId, cameraSource, onClose }: LivePreviewPanelProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const url = getWebSocketUrl();
    setConnectionState('connecting');

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (mountedRef.current) {
          setConnectionState('connected');
        }
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        const raw = event.data;
        if (typeof raw !== 'string') return;
        // Python kirim JSON: { event:'video_frame', node_id, camera_source, frame:base64, ... }
        try {
          const msg = JSON.parse(raw) as {
            event?: string;
            node_id?: string | number;
            camera_source?: string | number;
            frame?: string;
          };
          if (msg.event !== 'video_frame' || !msg.frame) return;
          // Filter: hanya tampilkan frame milik node ini (match by camera_source).
          // Jika cameraSource tidak diberikan, terima semua (fallback).
          if (cameraSource != null && cameraSource !== '') {
            const src = String(msg.camera_source ?? msg.node_id ?? '');
            if (src !== String(cameraSource)) return;
          }
          setCurrentFrame(msg.frame);
        } catch {
          // Bukan JSON — abaikan.
        }
      };

      ws.onerror = () => {
        if (mountedRef.current) {
          setConnectionState('error');
        }
      };

      ws.onclose = () => {
        if (mountedRef.current) {
          setConnectionState('disconnected');
        }
        wsRef.current = null;
      };
    } catch {
      if (mountedRef.current) {
        setConnectionState('error');
      }
    }
  }, [cameraSource]);

  // Connect on mount
  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      // Clean up WebSocket on unmount
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, [connect]);

  /**
   * Handle close — disconnects WebSocket within 2 seconds (Requirement 5.8).
   */
  const handleClose = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Ensure onClose is called within 2 seconds max
    closeTimeoutRef.current = setTimeout(() => {
      // Fallback: force close even if WS didn't acknowledge
      if (mountedRef.current) {
        onClose();
      }
    }, 2000);

    // Call onClose immediately since we've initiated the disconnect
    onClose();
  }, [onClose]);

  /**
   * Handle reconnect after unexpected disconnect.
   */
  const handleReconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setCurrentFrame(null);
    connect();
  }, [connect]);

  return (
    <>
      <style>{`
        @keyframes live-preview-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .live-preview-panel button:focus-visible {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .live-preview-panel {
            animation: none !important;
          }
        }
      `}</style>
      <div
        className="live-preview-panel"
        role="region"
        aria-label={`Live preview untuk Node ${nodeId}`}
        style={{
          position: 'relative',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: '#000',
          animation: 'live-preview-fade-in 200ms ease-out forwards',
          maxWidth: '100%',
          marginTop: 8,
        }}
      >
        {/* Header bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            backgroundColor: '#1f2937',
            borderBottom: '1px solid #374151',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Live indicator dot */}
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor:
                  connectionState === 'connected' ? '#22c55e' : '#ef4444',
                flexShrink: 0,
              }}
              aria-hidden="true"
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: '#e5e7eb',
              }}
            >
              {connectionState === 'connecting'
                ? 'Menghubungkan...'
                : connectionState === 'connected'
                  ? `Live — Node ${nodeId}`
                  : connectionState === 'disconnected'
                    ? 'Terputus'
                    : 'Error'}
            </span>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Tutup preview"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              minWidth: 44,
              minHeight: 44,
              padding: 8,
              border: 'none',
              borderRadius: 4,
              backgroundColor: 'transparent',
              color: '#9ca3af',
              cursor: 'pointer',
              transition: 'color 150ms ease, background-color 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#374151';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#9ca3af';
            }}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 3L11 11M11 3L3 11"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Frame display area */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            minHeight: 240,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#111827',
          }}
        >
          {/* Current frame */}
          {currentFrame && connectionState === 'connected' && (
            <img
              src={`data:image/jpeg;base64,${currentFrame}`}
              alt={`Live frame dari Node ${nodeId}`}
              style={{
                width: '100%',
                height: 'auto',
                maxHeight: 360,
                objectFit: 'contain',
                display: 'block',
              }}
            />
          )}

          {/* Connecting state */}
          {connectionState === 'connecting' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                color: '#9ca3af',
                padding: 24,
              }}
            >
              <svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                style={{ animation: 'live-preview-fade-in 1s ease infinite alternate' }}
                aria-hidden="true"
              >
                <circle
                  cx={12}
                  cy={12}
                  r={10}
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeDasharray="31.4 31.4"
                  strokeLinecap="round"
                />
              </svg>
              <span style={{ fontSize: 13 }}>Menghubungkan ke stream...</span>
            </div>
          )}

          {/* Connected but no frame yet */}
          {connectionState === 'connected' && !currentFrame && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                color: '#9ca3af',
                padding: 24,
              }}
            >
              <span style={{ fontSize: 13 }}>Menunggu frame...</span>
            </div>
          )}

          {/* Disconnected overlay */}
          {(connectionState === 'disconnected' || connectionState === 'error') && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                color: '#e5e7eb',
                padding: 24,
              }}
              role="alert"
            >
              <svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Koneksi terputus</span>
              <button
                type="button"
                onClick={handleReconnect}
                style={{
                  padding: '6px 16px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 6,
                  border: '1px solid #4b5563',
                  backgroundColor: '#374151',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  minWidth: 44,
                  minHeight: 44,
                  transition: 'background-color 150ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#4b5563';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#374151';
                }}
              >
                Hubungkan Ulang
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
