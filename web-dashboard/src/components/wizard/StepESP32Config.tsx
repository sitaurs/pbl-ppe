'use client';

import { useState, useCallback } from 'react';

// --- Props Interface ---

export interface StepESP32ConfigValues {
  mqttBroker: string;
  mqttTopic: string;
  skipped: boolean;
}

export interface StepESP32ConfigProps {
  values: StepESP32ConfigValues;
  onChange: (values: StepESP32ConfigValues) => void;
  onTestMqtt?: (broker: string, topic: string) => Promise<{ success: boolean; message: string }>;
}

// --- Validation ---

export interface StepESP32ConfigErrors {
  mqttBroker?: string;
  mqttTopic?: string;
}

/**
 * Validates StepESP32Config fields.
 * Returns empty object if skipped or all fields valid.
 * Requirements: 4.6
 */
export function validateStepESP32Config(values: StepESP32ConfigValues): StepESP32ConfigErrors {
  if (values.skipped) {
    return {};
  }

  const errors: StepESP32ConfigErrors = {};

  if (!values.mqttBroker.trim()) {
    errors.mqttBroker = 'MQTT broker host wajib diisi';
  } else if (values.mqttBroker.trim().length > 256) {
    errors.mqttBroker = 'MQTT broker host maksimal 256 karakter';
  }

  if (!values.mqttTopic.trim()) {
    errors.mqttTopic = 'MQTT topic wajib diisi';
  } else if (values.mqttTopic.trim().length > 128) {
    errors.mqttTopic = 'MQTT topic maksimal 128 karakter';
  }

  return errors;
}

// --- Component ---

/**
 * StepESP32Config — Wizard Step 3: ESP32 MQTT Configuration.
 *
 * Fields:
 * - MQTT broker host: required, max 256 characters
 * - MQTT topic: required, max 128 characters
 *
 * Features:
 * - "Skip — node ini tidak menggunakan ESP32" toggle
 * - "Test MQTT" button (optional, non-blocking)
 * - Inline validation error messages below invalid fields
 *
 * Requirements: 4.1, 4.4, 4.6, 10.6, 10.7
 */
export default function StepESP32Config({ values, onChange, onTestMqtt }: StepESP32ConfigProps) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const errors = validateStepESP32Config(values);

  const handleBlur = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const handleBrokerChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...values, mqttBroker: e.target.value });
      setTestResult(null);
    },
    [values, onChange]
  );

  const handleTopicChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...values, mqttTopic: e.target.value });
      setTestResult(null);
    },
    [values, onChange]
  );

  const handleSkipToggle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const skipped = e.target.checked;
      if (skipped) {
        onChange({ mqttBroker: '', mqttTopic: '', skipped: true });
      } else {
        onChange({ ...values, skipped: false });
      }
      setTouched({});
      setTestResult(null);
    },
    [values, onChange]
  );

  const handleTestMqtt = useCallback(async () => {
    if (!onTestMqtt || testing) return;

    setTesting(true);
    setTestResult(null);

    try {
      const result = await onTestMqtt(values.mqttBroker.trim(), values.mqttTopic.trim());
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: 'Test gagal: terjadi kesalahan koneksi' });
    } finally {
      setTesting(false);
    }
  }, [onTestMqtt, testing, values.mqttBroker, values.mqttTopic]);

  const showBrokerError = touched.mqttBroker && errors.mqttBroker;
  const showTopicError = touched.mqttTopic && errors.mqttTopic;

  const canTest = !values.skipped && values.mqttBroker.trim() && values.mqttTopic.trim() && onTestMqtt;

  return (
    <div className="step-esp32-config" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Skip Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          id="wizard-esp32-skip"
          type="checkbox"
          checked={values.skipped}
          onChange={handleSkipToggle}
          style={{ width: 18, height: 18, cursor: 'pointer' }}
        />
        <label
          htmlFor="wizard-esp32-skip"
          style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          Skip — node ini tidak menggunakan ESP32
        </label>
      </div>

      {values.skipped ? (
        /* Skipped State */
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            backgroundColor: 'var(--bg-muted, #f3f4f6)',
            color: 'var(--text-muted)',
            textAlign: 'center',
            fontSize: '0.9rem',
          }}
        >
          Tidak dikonfigurasi
        </div>
      ) : (
        <>
          {/* MQTT Broker Host Field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              htmlFor="wizard-mqtt-broker"
              className="block text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              MQTT Broker Host <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              id="wizard-mqtt-broker"
              type="text"
              value={values.mqttBroker}
              onChange={handleBrokerChange}
              onBlur={() => handleBlur('mqttBroker')}
              placeholder="Contoh: broker.hivemq.com"
              maxLength={256}
              className="w-full"
              style={{
                borderColor: showBrokerError ? 'var(--danger)' : undefined,
              }}
              aria-invalid={!!showBrokerError}
              aria-describedby={showBrokerError ? 'wizard-mqtt-broker-error' : undefined}
            />
            {showBrokerError && (
              <p
                id="wizard-mqtt-broker-error"
                role="alert"
                style={{
                  color: 'var(--danger)',
                  fontSize: '0.8rem',
                  margin: 0,
                }}
              >
                {errors.mqttBroker}
              </p>
            )}
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                alignSelf: 'flex-end',
              }}
            >
              {values.mqttBroker.length}/256
            </span>
          </div>

          {/* MQTT Topic Field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              htmlFor="wizard-mqtt-topic"
              className="block text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              MQTT Topic <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              id="wizard-mqtt-topic"
              type="text"
              value={values.mqttTopic}
              onChange={handleTopicChange}
              onBlur={() => handleBlur('mqttTopic')}
              placeholder="Contoh: APD_Violation"
              maxLength={128}
              className="w-full"
              style={{
                borderColor: showTopicError ? 'var(--danger)' : undefined,
              }}
              aria-invalid={!!showTopicError}
              aria-describedby={showTopicError ? 'wizard-mqtt-topic-error' : undefined}
            />
            {showTopicError && (
              <p
                id="wizard-mqtt-topic-error"
                role="alert"
                style={{
                  color: 'var(--danger)',
                  fontSize: '0.8rem',
                  margin: 0,
                }}
              >
                {errors.mqttTopic}
              </p>
            )}
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                alignSelf: 'flex-end',
              }}
            >
              {values.mqttTopic.length}/128
            </span>
          </div>

          {/* Test MQTT Button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              onClick={handleTestMqtt}
              disabled={!canTest || testing}
              style={{
                alignSelf: 'flex-start',
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid var(--border-color, #d1d5db)',
                backgroundColor: canTest && !testing ? 'var(--bg-primary, #fff)' : 'var(--bg-muted, #f3f4f6)',
                color: canTest && !testing ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: canTest && !testing ? 'pointer' : 'not-allowed',
                fontSize: '0.85rem',
                minHeight: 44,
                minWidth: 44,
              }}
              aria-label="Test MQTT connection"
            >
              {testing ? 'Testing...' : 'Test MQTT'}
            </button>

            {/* Test Result */}
            {testResult && (
              <p
                role="status"
                style={{
                  fontSize: '0.8rem',
                  margin: 0,
                  color: testResult.success ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)',
                }}
              >
                {testResult.message}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
