'use client';

import { useState, useCallback } from 'react';

// --- Props Interface ---

export interface SectorOption {
  id: string;
  name: string;
}

export interface StepSectorInfoValues {
  nodeName: string;
  sektorId: string;
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

  return errors;
}

// --- Component ---

/**
 * StepSectorInfo — Wizard Step 1: Node name and sector assignment.
 *
 * Fields:
 * - Node name: required, 1-100 characters
 * - Sector assignment: required dropdown
 *
 * Shows inline validation error messages below invalid fields,
 * only after user has interacted with the field (touched state).
 *
 * Requirements: 4.1, 4.6
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

  const showNodeNameError = touched.nodeName && errors.nodeName;
  const showSektorError = touched.sektorId && errors.sektorId;

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
    </div>
  );
}
