'use client';

/**
 * GasAlertBadge — Badge komponen yang menampilkan status gas sensor per node.
 *
 * Menampilkan "Gas: OK" (hijau) atau "Gas: ALERT" (merah) berdasarkan
 * telemetri terbaru (dalam 5 menit terakhir) dari endpoint GET /api/telemetry/gas.
 *
 * Polling dilakukan setiap 30 detik menggunakan native fetch + setInterval.
 * Hanya dirender jika `node.esp32.gasSensorEnabled === true`.
 *
 * Requirements: 8.6
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
  /** ID node yang ingin ditampilkan statusnya */
  nodeId: number;
  /** Interval polling dalam milidetik (default: 30000 = 30s) */
  pollingIntervalMs?: number;
  /** Batas waktu telemetri dianggap fresh, dalam milidetik (default: 300000 = 5 menit) */
  freshnessLimitMs?: number;
}

type GasStatus = 'alert' | 'ok' | 'no-data' | 'loading' | 'error';

/**
 * Tentukan status gas dari daftar telemetri.
 * Ambil entry paling baru untuk nodeId tertentu, filter hanya yang <= 5 menit lalu.
 */
function resolveGasStatus(
  entries: GasTelemetryEntry[],
  nodeId: number,
  freshnessLimitMs: number,
): GasStatus {
  const now = Date.now();

  // Filter entri milik node ini, urutkan terbaru dulu
  const nodeEntries = entries
    .filter((e) => e.nodeId === nodeId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (nodeEntries.length === 0) return 'no-data';

  const latest = nodeEntries[0];
  const age = now - new Date(latest.timestamp).getTime();

  // Jika data lebih dari freshnessLimitMs menit, anggap tidak ada data segar
  if (age > freshnessLimitMs) return 'no-data';

  return latest.alert ? 'alert' : 'ok';
}

export default function GasAlertBadge({
  nodeId,
  pollingIntervalMs = 30_000,
  freshnessLimitMs = 5 * 60 * 1000,
}: GasAlertBadgeProps) {
  const [status, setStatus] = useState<GasStatus>('loading');
  const abortRef = useRef<AbortController | null>(null);

  const fetchTelemetry = async () => {
    // Batalkan request sebelumnya jika masih pending
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
      const resolved = resolveGasStatus(data, nodeId, freshnessLimitMs);
      setStatus(resolved);
    } catch (err) {
      // AbortError bukan error nyata — request sengaja dibatalkan
      if (err instanceof Error && err.name === 'AbortError') return;
      setStatus('error');
    }
  };

  useEffect(() => {
    // Fetch segera saat mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTelemetry();

    // Polling setiap pollingIntervalMs
    const intervalId = setInterval(fetchTelemetry, pollingIntervalMs);

    return () => {
      clearInterval(intervalId);
      // Batalkan fetch yang sedang berjalan saat unmount
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, pollingIntervalMs, freshnessLimitMs]);

  // Jangan render saat loading awal agar tidak ada flicker di row
  if (status === 'loading' || status === 'no-data' || status === 'error') {
    // Tampilkan placeholder kecil hanya untuk no-data agar UI konsisten
    if (status === 'no-data') {
      return (
        <span
          className="gas-badge gas-badge--no-data"
          title="Belum ada data telemetri gas (< 5 menit)"
          aria-label="Gas: tidak ada data"
        >
          Gas: —
        </span>
      );
    }
    return null;
  }

  const isAlert = status === 'alert';

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
        .gas-badge--alert {
          background: #fee2e2;
          color: #dc2626;
          border: 1px solid #fca5a5;
          animation: gas-pulse 2s ease-in-out infinite;
        }
        .gas-badge--ok {
          background: #dcfce7;
          color: #16a34a;
          border: 1px solid #86efac;
        }
        .gas-badge--no-data {
          background: #f3f4f6;
          color: #9ca3af;
          border: 1px solid #e5e7eb;
          font-weight: 400;
        }
        @keyframes gas-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.65; }
        }
      `}</style>
      <span
        className={`gas-badge ${isAlert ? 'gas-badge--alert' : 'gas-badge--ok'}`}
        title={
          isAlert
            ? 'Sensor gas mendeteksi konsentrasi tinggi'
            : 'Sensor gas dalam kondisi normal'
        }
        aria-label={isAlert ? 'Gas: ALERT' : 'Gas: OK'}
        aria-live="polite"
      >
        {/* Dot indicator */}
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isAlert ? '#dc2626' : '#16a34a',
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        {isAlert ? 'Gas: ALERT' : 'Gas: OK'}
      </span>
    </>
  );
}
