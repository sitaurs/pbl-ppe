'use client';

/**
 * GasIndicatorPill — Pill kecil status gas sensor.
 *
 * Caller harus pass `entry` yang sudah di-resolve dari sumber data terpusat.
 * Komponen ini sekarang menampilkan nilai gas terakhir agar user bisa langsung
 * melihat angka raw di card, bukan hanya status OK/ALERT.
 */

interface GasTelemetryEntry {
  id: string;
  nodeId: number;
  sektorId: string;
  raw: number;
  alert: boolean;
  timestamp: string;
}

interface GasIndicatorPillProps {
  entry: GasTelemetryEntry | undefined;
  compact?: boolean;
  freshnessLimitMs?: number;
}

export default function GasIndicatorPill({
  entry,
  compact = false,
  freshnessLimitMs = 5 * 60 * 1000,
}: GasIndicatorPillProps) {
  let status: 'ok' | 'alert' | 'stale' | 'no-data' = 'no-data';
  if (entry) {
    const age = Date.now() - new Date(entry.timestamp).getTime();
    status = age <= freshnessLimitMs
      ? (entry.alert ? 'alert' : 'ok')
      : 'stale';
  }

  if (status === 'no-data') {
    if (compact) return null;
    return (
      <span
        title="Belum ada data telemetri gas (< 5 menit)"
        aria-label="Gas: tidak ada data"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium"
        style={{ background: '#f3f4f6', color: '#9ca3af', border: '1px solid #e5e7eb' }}
      >
        <span
          aria-hidden="true"
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: '#9ca3af' }}
        />
        Gas: —
      </span>
    );
  }

  const colors =
    status === 'alert'
      ? { bg: '#fee2e2', fg: '#dc2626', border: '#fca5a5', dot: '#dc2626', pulse: true }
      : status === 'ok'
      ? { bg: '#dcfce7', fg: '#16a34a', border: '#86efac', dot: '#16a34a', pulse: false }
      : { bg: '#f3f4f6', fg: '#9ca3af', border: '#e5e7eb', dot: '#9ca3af', pulse: false };

  const label = entry ? `Gas: ${entry.raw}` : 'Gas: —';

  return (
    <span
      title={
        status === 'stale'
          ? `Data gas terakhir: ${entry?.raw ?? '—'} (lebih dari 5 menit lalu)`
          : status === 'alert'
          ? `Gas alert aktif. Nilai terakhir: ${entry?.raw ?? '—'}`
          : `Sensor gas normal. Nilai terakhir: ${entry?.raw ?? '—'}`
      }
      aria-label={label}
      aria-live="polite"
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
        colors.pulse ? 'animate-pulse-dot' : ''
      }`}
      style={{
        background: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.border}`,
      }}
    >
      <span
        aria-hidden="true"
        className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
        style={{ background: colors.dot }}
      />
      {!compact && label}
    </span>
  );
}
