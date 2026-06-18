'use client';

/**
 * GasAlertBadge — Badge komponen yang menampilkan status gas sensor per node.
 *
 * Menampilkan nilai gas terbaru per node. Jika data masih segar (< 5 menit),
 * badge memakai warna hijau/merah sesuai status alert. Jika data sudah lama,
 * angka terakhir tetap ditampilkan dengan gaya abu-abu agar operator tetap
 * melihat pembacaan terakhir, bukan hanya "—".
 */

import { useState, useEffect, useRef } from 'react';

interface GasTelemetryEntry {
  id: string;
  nodeId: number;
  sektorId: string;
  raw: number;
  alert: boolean;
  timestamp: string;
}

interface GasAlertBadgeProps {
  nodeId: number;
  pollingIntervalMs?: number;
  freshnessLimitMs?: number;
}

type GasStatus = 'alert' | 'ok' | 'stale' | 'no-data' | 'loading' | 'error';

interface ResolvedGasState {
  status: GasStatus;
  latest?: GasTelemetryEntry;
}

function resolveGasState(
  entries: GasTelemetryEntry[],
  nodeId: number,
  freshnessLimitMs: number,
): ResolvedGasState {
  const nodeEntries = entries
    .filter((e) => e.nodeId === nodeId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (nodeEntries.length === 0) return { status: 'no-data' };

  const latest = nodeEntries[0];
  const age = Date.now() - new Date(latest.timestamp).getTime();
  if (age > freshnessLimitMs) return { status: 'stale', latest };

  return { status: latest.alert ? 'alert' : 'ok', latest };
}

export default function GasAlertBadge({
  nodeId,
  pollingIntervalMs = 30_000,
  freshnessLimitMs = 5 * 60 * 1000,
}: GasAlertBadgeProps) {
  const [status, setStatus] = useState<GasStatus>('loading');
  const [latestEntry, setLatestEntry] = useState<GasTelemetryEntry | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const fetchTelemetry = async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/telemetry/gas', {
        signal: abortRef.current.signal,
        credentials: 'same-origin',
      });

      if (!res.ok) {
        setStatus('error');
        return;
      }

      const data: GasTelemetryEntry[] = await res.json();
      const resolved = resolveGasState(data, nodeId, freshnessLimitMs);
      setStatus(resolved.status);
      setLatestEntry(resolved.latest);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setStatus('error');
    }
  };

  useEffect(() => {
    fetchTelemetry();
    const intervalId = setInterval(fetchTelemetry, pollingIntervalMs);

    return () => {
      clearInterval(intervalId);
      abortRef.current?.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, pollingIntervalMs, freshnessLimitMs]);

  if (status === 'loading' || status === 'error') {
    return null;
  }

  const palette =
    status === 'alert'
      ? { bg: '#fee2e2', fg: '#dc2626', border: '#fca5a5', dot: '#dc2626', pulse: true }
      : status === 'ok'
      ? { bg: '#dcfce7', fg: '#16a34a', border: '#86efac', dot: '#16a34a', pulse: false }
      : { bg: '#f3f4f6', fg: '#9ca3af', border: '#e5e7eb', dot: '#9ca3af', pulse: false };

  const label =
    latestEntry
      ? `Gas: ${latestEntry.raw}`
      : 'Gas: —';

  const title =
    status === 'alert'
      ? `Gas alert aktif. Nilai terakhir: ${latestEntry?.raw ?? '—'}`
      : status === 'ok'
      ? `Sensor gas normal. Nilai terakhir: ${latestEntry?.raw ?? '—'}`
      : latestEntry
      ? `Data gas terakhir: ${latestEntry.raw} (lebih dari 5 menit lalu)`
      : 'Belum ada data telemetri gas';

  return (
    <>
      <style>{`
        .gas-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.65rem;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 9999px;
          letter-spacing: 0.02em;
          white-space: nowrap;
          vertical-align: middle;
          margin-left: 6px;
          cursor: default;
          user-select: none;
        }
        .gas-badge--pulse {
          animation: gas-pulse 2s ease-in-out infinite;
        }
        @keyframes gas-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.65; }
        }
      `}</style>
      <span
        className={`gas-badge ${palette.pulse ? 'gas-badge--pulse' : ''}`}
        title={title}
        aria-label={label}
        aria-live="polite"
        style={{
          background: palette.bg,
          color: palette.fg,
          border: `1px solid ${palette.border}`,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: palette.dot,
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        {label}
      </span>
    </>
  );
}
