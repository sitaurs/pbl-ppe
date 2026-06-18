'use client';

/**
 * GasIndicatorPill — Pill kecil status gas sensor.
 *
 * Beda dengan `GasAlertBadge`: komponen ini tidak melakukan polling sendiri.
 * Caller harus pass `entry` (GasTelemetryEntry | undefined) yang sudah
 * di-resolve dari sumber data terpusat (mis. dashboard home `gasLatestByNode`).
 *
 * Tujuan: menghindari polling duplikat saat dipasang di banyak lokasi
 * dalam satu page yang sudah punya state telemetri sendiri.
 *
 * Pakai `<GasAlertBadge>` (auto-poll) untuk page yang TIDAK punya state
 * telemetri sendiri (mis. /monitor).
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
  /** Tampilkan dot saja (tanpa text). Default false. */
  compact?: boolean;
  /** Batas waktu data dianggap fresh, ms. Default 5 menit. */
  freshnessLimitMs?: number;
}

export default function GasIndicatorPill({
  entry,
  compact = false,
  freshnessLimitMs = 5 * 60 * 1000,
}: GasIndicatorPillProps) {
  // Resolve status dari entry
  let status: 'ok' | 'alert' | 'no-data' = 'no-data';
  if (entry) {
    const age = Date.now() - new Date(entry.timestamp).getTime();
    if (age <= freshnessLimitMs) {
      status = entry.alert ? 'alert' : 'ok';
    }
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
        {!compact && 'Gas: —'}
      </span>
    );
  }

  const isAlert = status === 'alert';
  const colors = isAlert
    ? { bg: '#fee2e2', fg: '#dc2626', border: '#fca5a5', dot: '#dc2626' }
    : { bg: '#dcfce7', fg: '#16a34a', border: '#86efac', dot: '#16a34a' };

  return (
    <span
      title={isAlert ? 'Sensor gas mendeteksi konsentrasi tinggi' : 'Sensor gas dalam kondisi normal'}
      aria-label={isAlert ? 'Gas: ALERT' : 'Gas: OK'}
      aria-live="polite"
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
        isAlert ? 'animate-pulse-dot' : ''
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
      {!compact && (isAlert ? 'Gas: ALERT' : 'Gas: OK')}
    </span>
  );
}
