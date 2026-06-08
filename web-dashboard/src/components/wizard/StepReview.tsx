'use client';

import { StepSectorInfoValues } from './StepSectorInfo';
import { StepCameraConfigValues } from './StepCameraConfig';
import { StepESP32ConfigValues } from './StepESP32Config';

// --- Types ---

export interface StepReviewProps {
  sectorInfo: StepSectorInfoValues;
  cameraConfig: StepCameraConfigValues;
  esp32Config: StepESP32ConfigValues;
  onEditStep: (step: number) => void;
  onSave: () => void;
  saving: boolean;
  canSave?: boolean;
  saveDisabledReason?: string | null;
}

// --- Component ---

/**
 * StepReview — Wizard Step 4: Review & Confirm.
 *
 * Displays a read-only summary of all configured data, with:
 * - "Tidak dikonfigurasi" for skipped sections
 * - "Edit" button per section to go back to that step
 * - "Simpan" button to save node
 *
 * Requirements: 4.7, 4.10
 */
export default function StepReview({
  sectorInfo,
  cameraConfig,
  esp32Config,
  onEditStep,
  onSave,
  saving,
  canSave = true,
  saveDisabledReason,
}: StepReviewProps) {
  return (
    <div className="step-review" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Section 1: Sector Info */}
      <ReviewCard
        title="Info Sektor"
        onEdit={() => onEditStep(0)}
      >
        <ReviewItem label="Nama Node" value={sectorInfo.nodeName || '—'} />
        <ReviewItem label="Sektor ID" value={sectorInfo.sektorId || '—'} />
      </ReviewCard>

      {/* Section 2: Camera Config */}
      <ReviewCard
        title="Konfigurasi Kamera"
        onEdit={cameraConfig.skipped ? undefined : () => onEditStep(1)}
        skipped={cameraConfig.skipped}
      >
        {cameraConfig.skipped ? (
          <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
            Tidak dikonfigurasi
          </p>
        ) : (
          <>
            <ReviewItem label="URL RTSP" value={cameraConfig.rtspUrl || '—'} />
            <ReviewItem label="Resolusi" value={cameraConfig.resolution || '—'} />
            <ReviewItem label="Confidence" value={cameraConfig.confidenceThreshold || '—'} />
            <ReviewItem label="Mode Deteksi" value={cameraConfig.detectionMode || '—'} />
          </>
        )}
      </ReviewCard>

      {/* Section 3: ESP32 Config */}
      <ReviewCard
        title="Konfigurasi ESP32"
        onEdit={esp32Config.skipped ? undefined : () => onEditStep(2)}
        skipped={esp32Config.skipped}
      >
        {esp32Config.skipped ? (
          <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
            Tidak dikonfigurasi
          </p>
        ) : (
          <>
            <ReviewItem label="MQTT Broker" value={esp32Config.mqttBroker || '—'} />
            <ReviewItem label="MQTT Topic" value={esp32Config.mqttTopic || '—'} />
            <ReviewItem
              label="Sensor MQ-135"
              value={esp32Config.gasSensorEnabled ? 'Aktif' : 'Tidak aktif'}
            />
            {esp32Config.gasSensorEnabled && (
              <ReviewItem
                label="Threshold Gas (ADC)"
                value={String(esp32Config.gasThreshold ?? 2200)}
              />
            )}
          </>
        )}
      </ReviewCard>

      {/* Save Button */}
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !canSave}
        title={!canSave ? saveDisabledReason ?? undefined : undefined}
        className="btn-primary min-h-[44px]"
        style={{
          marginTop: 8,
          opacity: saving || !canSave ? 0.6 : 1,
          cursor: saving || !canSave ? 'not-allowed' : 'pointer',
        }}
      >
        {saving ? 'Menyimpan...' : 'Simpan'}
      </button>
      {!canSave && saveDisabledReason && (
        <p style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--danger, #c4442e)' }}>
          {saveDisabledReason}
        </p>
      )}
    </div>
  );
}

// --- Sub-components ---

function ReviewCard({
  title,
  children,
  onEdit,
  skipped,
}: {
  title: string;
  children: React.ReactNode;
  onEdit?: () => void;
  skipped?: boolean;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 8,
        padding: 16,
        backgroundColor: skipped ? 'var(--bg-muted, #f9fafb)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {title}
        </h4>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: '1px solid var(--border, #e5e7eb)',
              backgroundColor: 'transparent',
              color: 'var(--accent, #2563eb)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              minHeight: 32,
              minWidth: 44,
            }}
          >
            Edit
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBlock: 4 }}>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}
