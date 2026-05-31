'use client';

import { useState, useCallback } from 'react';

// --- Types ---

export interface StepCameraConfigValues {
  rtspUrl: string;
  resolution: string;
  confidenceThreshold: string; // stored as string for input control, parsed as number for validation
  detectionMode: string; // 'CPU' | 'GPU' | ''
  skipped: boolean;
}

export interface StepCameraConfigProps {
  values: StepCameraConfigValues;
  onChange: (values: StepCameraConfigValues) => void;
  onTestConnection?: (url: string) => Promise<{ status: string; error?: string }>;
}

// --- Constants ---

const RESOLUTION_OPTIONS = [
  { value: '', label: '— Pilih Resolusi —' },
  { value: '640x480', label: '640x480 (VGA)' },
  { value: '1280x720', label: '1280x720 (HD)' },
  { value: '1920x1080', label: '1920x1080 (Full HD)' },
  { value: '2560x1440', label: '2560x1440 (2K)' },
  { value: '3840x2160', label: '3840x2160 (4K)' },
];

const DETECTION_MODE_OPTIONS = [
  { value: '', label: '— Pilih Mode —' },
  { value: 'CPU', label: 'CPU' },
  { value: 'GPU', label: 'GPU' },
];

// --- Validation ---

export interface StepCameraConfigErrors {
  rtspUrl?: string;
  resolution?: string;
  confidenceThreshold?: string;
  detectionMode?: string;
}

export function validateStepCameraConfig(values: StepCameraConfigValues): StepCameraConfigErrors {
  // If skipped, no validation needed
  if (values.skipped) {
    return {};
  }

  const errors: StepCameraConfigErrors = {};

  // Camera source validation: terima rtsp://, http(s)://, atau index webcam (angka 0-9)
  const camSrc = values.rtspUrl.trim();
  if (!camSrc) {
    errors.rtspUrl = 'Sumber kamera wajib diisi';
  } else if (
    !camSrc.startsWith('rtsp://') &&
    !camSrc.startsWith('http://') &&
    !camSrc.startsWith('https://') &&
    !/^\d{1,3}$/.test(camSrc)
  ) {
    errors.rtspUrl = 'Isi dengan "rtsp://...", "http://...", atau index webcam (mis. 0)';
  } else if (camSrc.length > 512) {
    errors.rtspUrl = 'URL maksimal 512 karakter';
  }

  // Resolution validation
  if (!values.resolution) {
    errors.resolution = 'Resolusi wajib dipilih';
  }

  // Confidence threshold validation
  const threshold = parseFloat(values.confidenceThreshold);
  if (!values.confidenceThreshold.trim()) {
    errors.confidenceThreshold = 'Confidence threshold wajib diisi';
  } else if (isNaN(threshold)) {
    errors.confidenceThreshold = 'Harus berupa angka';
  } else if (threshold < 0.01 || threshold > 1.0) {
    errors.confidenceThreshold = 'Harus antara 0.01 hingga 1.00';
  }

  // Detection mode validation
  if (!values.detectionMode) {
    errors.detectionMode = 'Mode deteksi wajib dipilih';
  }

  return errors;
}

// --- Component ---

/**
 * StepCameraConfig — Wizard Step 2: Camera and detection configuration.
 *
 * Fields:
 * - RTSP URL: required, must start with "rtsp://", max 512 chars
 * - Resolution: required dropdown
 * - Confidence Threshold: required, 0.01-1.00
 * - Detection Mode: required, CPU or GPU
 *
 * Features:
 * - "Skip — node ini tidak menggunakan kamera" toggle
 * - "Test Koneksi" button (optional, non-blocking)
 * - Inline validation per field
 *
 * Requirements: 4.1, 4.3, 4.6, 10.6, 10.7
 */
export default function StepCameraConfig({ values, onChange, onTestConnection }: StepCameraConfigProps) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const errors = validateStepCameraConfig(values);

  const handleBlur = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const handleSkipToggle = useCallback(() => {
    const newSkipped = !values.skipped;
    if (newSkipped) {
      // Clear all fields when skipping
      onChange({
        rtspUrl: '',
        resolution: '',
        confidenceThreshold: '',
        detectionMode: '',
        skipped: true,
      });
    } else {
      onChange({ ...values, skipped: false });
    }
    // Reset touched state when toggling skip
    setTouched({});
  }, [values, onChange]);

  const handleRtspUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...values, rtspUrl: e.target.value });
    },
    [values, onChange]
  );

  const handleResolutionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ ...values, resolution: e.target.value });
    },
    [values, onChange]
  );

  const handleThresholdChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...values, confidenceThreshold: e.target.value });
    },
    [values, onChange]
  );

  const handleDetectionModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ ...values, detectionMode: e.target.value });
    },
    [values, onChange]
  );

  const handleTestConnection = useCallback(async () => {
    if (!onTestConnection || !values.rtspUrl.trim()) return;

    setTestStatus('loading');
    setTestMessage('');

    try {
      const result = await onTestConnection(values.rtspUrl.trim());
      if (result.status === 'reachable') {
        setTestStatus('success');
        setTestMessage('Koneksi berhasil');
      } else {
        setTestStatus('error');
        setTestMessage(result.error || `Status: ${result.status}`);
      }
    } catch {
      setTestStatus('error');
      setTestMessage('Gagal melakukan test koneksi');
    }

    // Reset after 5 seconds
    setTimeout(() => {
      setTestStatus('idle');
      setTestMessage('');
    }, 5000);
  }, [onTestConnection, values.rtspUrl]);

  // Show errors only for touched fields
  const showRtspError = touched.rtspUrl && errors.rtspUrl;
  const showResolutionError = touched.resolution && errors.resolution;
  const showThresholdError = touched.confidenceThreshold && errors.confidenceThreshold;
  const showModeError = touched.detectionMode && errors.detectionMode;

  return (
    <div className="step-camera-config" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Skip Toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          borderRadius: 8,
          backgroundColor: values.skipped ? 'var(--bg-secondary, #f3f4f6)' : 'transparent',
          border: '1px solid var(--border, #e5e7eb)',
          cursor: 'pointer',
        }}
        onClick={handleSkipToggle}
        role="checkbox"
        aria-checked={values.skipped}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSkipToggle();
          }
        }}
      >
        <input
          type="checkbox"
          checked={values.skipped}
          onChange={handleSkipToggle}
          tabIndex={-1}
          aria-hidden="true"
          style={{ width: 18, height: 18, cursor: 'pointer' }}
        />
        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Skip — node ini tidak menggunakan kamera
        </span>
      </div>

      {/* Skipped State */}
      {values.skipped && (
        <div
          style={{
            padding: '16px',
            textAlign: 'center',
            color: 'var(--text-muted, #6b7280)',
            fontStyle: 'italic',
            fontSize: '0.9rem',
          }}
        >
          Tidak dikonfigurasi
        </div>
      )}

      {/* Form Fields — only shown when not skipped */}
      {!values.skipped && (
        <>
          {/* RTSP URL Field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              htmlFor="wizard-rtsp-url"
              className="block text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Sumber Kamera <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              id="wizard-rtsp-url"
              type="text"
              value={values.rtspUrl}
              onChange={handleRtspUrlChange}
              onBlur={() => handleBlur('rtspUrl')}
              placeholder="rtsp://192.168.1.10/live/ch00_1  atau  0 (webcam)"
              maxLength={512}
              className="w-full"
              style={{
                borderColor: showRtspError ? 'var(--danger)' : undefined,
              }}
              aria-invalid={!!showRtspError}
              aria-describedby={showRtspError ? 'wizard-rtsp-url-error' : undefined}
            />
            {showRtspError && (
              <p
                id="wizard-rtsp-url-error"
                role="alert"
                style={{
                  color: 'var(--danger)',
                  fontSize: '0.8rem',
                  margin: 0,
                }}
              >
                {errors.rtspUrl}
              </p>
            )}
          </div>

          {/* Resolution Dropdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              htmlFor="wizard-resolution"
              className="block text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Resolusi <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <select
              id="wizard-resolution"
              value={values.resolution}
              onChange={handleResolutionChange}
              onBlur={() => handleBlur('resolution')}
              className="w-full"
              style={{
                borderColor: showResolutionError ? 'var(--danger)' : undefined,
              }}
              aria-invalid={!!showResolutionError}
              aria-describedby={showResolutionError ? 'wizard-resolution-error' : undefined}
            >
              {RESOLUTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {showResolutionError && (
              <p
                id="wizard-resolution-error"
                role="alert"
                style={{
                  color: 'var(--danger)',
                  fontSize: '0.8rem',
                  margin: 0,
                }}
              >
                {errors.resolution}
              </p>
            )}
          </div>

          {/* Confidence Threshold */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              htmlFor="wizard-confidence"
              className="block text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Confidence Threshold <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              id="wizard-confidence"
              type="number"
              value={values.confidenceThreshold}
              onChange={handleThresholdChange}
              onBlur={() => handleBlur('confidenceThreshold')}
              placeholder="0.50"
              min={0.01}
              max={1.0}
              step={0.01}
              className="w-full"
              style={{
                borderColor: showThresholdError ? 'var(--danger)' : undefined,
              }}
              aria-invalid={!!showThresholdError}
              aria-describedby={showThresholdError ? 'wizard-confidence-error' : undefined}
            />
            {showThresholdError && (
              <p
                id="wizard-confidence-error"
                role="alert"
                style={{
                  color: 'var(--danger)',
                  fontSize: '0.8rem',
                  margin: 0,
                }}
              >
                {errors.confidenceThreshold}
              </p>
            )}
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
              }}
            >
              Nilai antara 0.01 (rendah) hingga 1.00 (tinggi)
            </span>
          </div>

          {/* Detection Mode */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              htmlFor="wizard-detection-mode"
              className="block text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Mode Deteksi <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <select
              id="wizard-detection-mode"
              value={values.detectionMode}
              onChange={handleDetectionModeChange}
              onBlur={() => handleBlur('detectionMode')}
              className="w-full"
              style={{
                borderColor: showModeError ? 'var(--danger)' : undefined,
              }}
              aria-invalid={!!showModeError}
              aria-describedby={showModeError ? 'wizard-detection-mode-error' : undefined}
            >
              {DETECTION_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {showModeError && (
              <p
                id="wizard-detection-mode-error"
                role="alert"
                style={{
                  color: 'var(--danger)',
                  fontSize: '0.8rem',
                  margin: 0,
                }}
              >
                {errors.detectionMode}
              </p>
            )}
          </div>

          {/* Test Koneksi Button — optional, non-blocking */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testStatus === 'loading' || !values.rtspUrl.trim().startsWith('rtsp://')}
              style={{
                alignSelf: 'flex-start',
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid var(--border, #e5e7eb)',
                backgroundColor: 'var(--bg-secondary, #f9fafb)',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                cursor:
                  testStatus === 'loading' || !values.rtspUrl.trim().startsWith('rtsp://')
                    ? 'not-allowed'
                    : 'pointer',
                opacity:
                  testStatus === 'loading' || !values.rtspUrl.trim().startsWith('rtsp://')
                    ? 0.6
                    : 1,
                minWidth: 44,
                minHeight: 44,
              }}
              aria-label="Test koneksi kamera RTSP"
            >
              {testStatus === 'loading' ? 'Menguji...' : 'Test Koneksi'}
            </button>

            {/* Test result inline */}
            {testStatus === 'success' && (
              <p
                role="status"
                style={{
                  color: 'var(--success, #22c55e)',
                  fontSize: '0.8rem',
                  margin: 0,
                }}
              >
                ✓ {testMessage}
              </p>
            )}
            {testStatus === 'error' && (
              <p
                role="alert"
                style={{
                  color: 'var(--danger, #ef4444)',
                  fontSize: '0.8rem',
                  margin: 0,
                }}
              >
                ✗ {testMessage}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
