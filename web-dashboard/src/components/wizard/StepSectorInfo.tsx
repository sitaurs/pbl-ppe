'use client';

import { useState, useCallback } from 'react';
import { normalizePhone, isValidPhone } from '@/lib/phone';

// --- Props Interface ---

export interface SectorOption {
  id: string;
  name: string;
}

export interface StepSectorInfoValues {
  nodeName: string;
  sektorId: string;
  picName: string;
  picPhone: string;
}

export interface StepSectorInfoProps {
  values: StepSectorInfoValues;
  onChange: (values: StepSectorInfoValues) => void;
  sectors: SectorOption[];
}

// --- Validation ---

export interface StepSectorInfoErrors {
  nodeName?: string;
  sektorId?: string;
  picName?: string;
  picPhone?: string;
}

export function validateStepSectorInfo(values: StepSectorInfoValues): StepSectorInfoErrors {
  const errors: StepSectorInfoErrors = {};

  if (!values.nodeName.trim()) {
    errors.nodeName = 'Nama node wajib diisi';
  } else if (values.nodeName.trim().length > 100) {
    errors.nodeName = 'Nama node maksimal 100 karakter';
  }

  if (!values.sektorId) {
    errors.sektorId = 'Sektor wajib dipilih';
  }

  // picName: required, non-whitespace after trim, max 100 chars (Bug 2 — klausa 2.3)
  if (!values.picName.trim()) {
    errors.picName = 'Nama PIC wajib diisi';
  } else if (values.picName.trim().length > 100) {
    errors.picName = 'Nama PIC maksimal 100 karakter';
  }

  // picPhone: optional (klausa 2.4 — opt-out alert WA), but if non-empty must be a valid phone
  if (values.picPhone.trim() && !isValidPhone(values.picPhone)) {
    errors.picPhone = 'Format nomor WhatsApp tidak valid';
  }

  return errors;
}

// --- Component ---

/**
 * StepSectorInfo — Wizard Step 1: Node name, sector assignment, and PIC contact.
 *
 * Fields:
 * - Node name: required, 1-100 characters
 * - Sector assignment: required dropdown
 * - Nama PIC: required, 1-100 characters (Bug 2 — klausa 2.3)
 * - No WhatsApp PIC: optional; if non-empty harus valid (klausa 2.3, 2.4).
 *   On blur, value is normalized to "62…" via `normalizePhone` so user
 *   sees the canonical form. Empty value menampilkan banner peringatan
 *   bahwa alert WA tidak akan terkirim untuk node ini.
 *
 * Shows inline validation error messages below invalid fields,
 * only after user has interacted with the field (touched state).
 *
 * Requirements: 2.3, 2.4, 4.1, 4.6
 */
export default function StepSectorInfo({ values, onChange, sectors }: StepSectorInfoProps) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const errors = validateStepSectorInfo(values);

  const handleBlur = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const handleNodeNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...values, nodeName: e.target.value });
    },
    [values, onChange]
  );

  const handleSektorChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange({ ...values, sektorId: e.target.value });
    },
    [values, onChange]
  );

  const handlePicNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...values, picName: e.target.value });
    },
    [values, onChange]
  );

  const handlePicPhoneChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...values, picPhone: e.target.value });
    },
    [values, onChange]
  );

  const handlePicPhoneBlur = useCallback(() => {
    handleBlur('picPhone');
    // Auto-normalisasi ke format 62… (klausa 2.3). Hindari kerja sia-sia kalau
    // sudah persis sama dengan hasil normalisasi.
    const normalized = normalizePhone(values.picPhone);
    if (normalized !== values.picPhone) {
      onChange({ ...values, picPhone: normalized });
    }
  }, [values, onChange, handleBlur]);

  const showNodeNameError = touched.nodeName && errors.nodeName;
  const showSektorError = touched.sektorId && errors.sektorId;
  const showPicNameError = touched.picName && errors.picName;
  const showPicPhoneError = touched.picPhone && errors.picPhone;
  const showPicPhoneEmptyWarning =
    touched.picPhone && !values.picPhone.trim() && !errors.picPhone;

  return (
    <div className="step-sector-info" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Node Name Field */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label
          htmlFor="wizard-node-name"
          className="block text-sm font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          Nama Node <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        <input
          id="wizard-node-name"
          type="text"
          value={values.nodeName}
          onChange={handleNodeNameChange}
          onBlur={() => handleBlur('nodeName')}
          placeholder="Contoh: Node Pintu Utara"
          maxLength={100}
          className="w-full"
          style={{
            borderColor: showNodeNameError ? 'var(--danger)' : undefined,
          }}
          aria-invalid={!!showNodeNameError}
          aria-describedby={showNodeNameError ? 'wizard-node-name-error' : undefined}
        />
        {showNodeNameError && (
          <p
            id="wizard-node-name-error"
            role="alert"
            style={{
              color: 'var(--danger)',
              fontSize: '0.8rem',
              margin: 0,
            }}
          >
            {errors.nodeName}
          </p>
        )}
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            alignSelf: 'flex-end',
          }}
        >
          {values.nodeName.length}/100
        </span>
      </div>

      {/* Sector Assignment Field */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label
          htmlFor="wizard-sector"
          className="block text-sm font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          Sektor <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        <select
          id="wizard-sector"
          value={values.sektorId}
          onChange={handleSektorChange}
          onBlur={() => handleBlur('sektorId')}
          className="w-full"
          style={{
            borderColor: showSektorError ? 'var(--danger)' : undefined,
          }}
          aria-invalid={!!showSektorError}
          aria-describedby={showSektorError ? 'wizard-sector-error' : undefined}
        >
          <option value="">— Pilih Sektor —</option>
          {sectors.map((sector) => (
            <option key={sector.id} value={sector.id}>
              {sector.name}
            </option>
          ))}
        </select>
        {showSektorError && (
          <p
            id="wizard-sector-error"
            role="alert"
            style={{
              color: 'var(--danger)',
              fontSize: '0.8rem',
              margin: 0,
            }}
          >
            {errors.sektorId}
          </p>
        )}
      </div>

      {/* Nama PIC Field (Bug 2 — klausa 2.3) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label
          htmlFor="wizard-pic-name"
          className="block text-sm font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          Nama PIC <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        <input
          id="wizard-pic-name"
          type="text"
          value={values.picName}
          onChange={handlePicNameChange}
          onBlur={() => handleBlur('picName')}
          placeholder="Nama operator / penanggung jawab"
          maxLength={100}
          className="w-full"
          style={{
            borderColor: showPicNameError ? 'var(--danger)' : undefined,
          }}
          aria-invalid={!!showPicNameError}
          aria-describedby={showPicNameError ? 'wizard-pic-name-error' : undefined}
        />
        {showPicNameError && (
          <p
            id="wizard-pic-name-error"
            role="alert"
            style={{
              color: 'var(--danger)',
              fontSize: '0.8rem',
              margin: 0,
            }}
          >
            {errors.picName}
          </p>
        )}
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            alignSelf: 'flex-end',
          }}
        >
          {values.picName.length}/100
        </span>
      </div>

      {/* No WhatsApp PIC Field (Bug 2 — klausa 2.3, 2.4) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label
          htmlFor="wizard-pic-phone"
          className="block text-sm font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          No WhatsApp PIC
        </label>
        <input
          id="wizard-pic-phone"
          type="text"
          inputMode="tel"
          value={values.picPhone}
          onChange={handlePicPhoneChange}
          onBlur={handlePicPhoneBlur}
          placeholder="081234567890"
          className="w-full"
          style={{
            borderColor: showPicPhoneError ? 'var(--danger)' : undefined,
          }}
          aria-invalid={!!showPicPhoneError}
          aria-describedby={
            showPicPhoneError
              ? 'wizard-pic-phone-error'
              : 'wizard-pic-phone-help'
          }
        />
        {showPicPhoneError && (
          <p
            id="wizard-pic-phone-error"
            role="alert"
            style={{
              color: 'var(--danger)',
              fontSize: '0.8rem',
              margin: 0,
            }}
          >
            {errors.picPhone}
          </p>
        )}
        {!showPicPhoneError && (
          <p
            id="wizard-pic-phone-help"
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              margin: 0,
            }}
          >
            Otomatis dinormalisasi ke format 62…
          </p>
        )}
        {showPicPhoneEmptyWarning && (
          <p
            role="status"
            style={{
              color: 'var(--text-warning)',
              fontSize: '0.8rem',
              margin: 0,
            }}
          >
            Alert WhatsApp tidak akan dikirim untuk node ini
          </p>
        )}
      </div>
    </div>
  );
}
