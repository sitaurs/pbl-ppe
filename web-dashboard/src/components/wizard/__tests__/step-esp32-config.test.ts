import { describe, it, expect } from 'vitest';
import { validateStepESP32Config, StepESP32ConfigValues } from '../StepESP32Config';

/** Helper to build a minimal valid StepESP32ConfigValues with defaults for new fields */
function makeValues(overrides: Partial<StepESP32ConfigValues>): StepESP32ConfigValues {
  return {
    mqttBroker: 'broker.hivemq.com',
    mqttTopic: 'APD_Violation',
    skipped: false,
    gasSensorEnabled: false,
    gasThreshold: 2200,
    ...overrides,
  };
}

describe('StepESP32Config validation', () => {
  it('returns no errors when all fields are valid', () => {
    const values = makeValues({});
    const errors = validateStepESP32Config(values);
    expect(errors).toEqual({});
  });

  it('returns no errors when skipped', () => {
    const values = makeValues({ mqttBroker: '', mqttTopic: '', skipped: true });
    const errors = validateStepESP32Config(values);
    expect(errors).toEqual({});
  });

  it('returns error when mqttBroker is empty', () => {
    const values = makeValues({ mqttBroker: '' });
    const errors = validateStepESP32Config(values);
    expect(errors.mqttBroker).toBe('MQTT broker host wajib diisi');
  });

  it('returns error when mqttBroker is only whitespace', () => {
    const values = makeValues({ mqttBroker: '   ' });
    const errors = validateStepESP32Config(values);
    expect(errors.mqttBroker).toBe('MQTT broker host wajib diisi');
  });

  it('returns error when mqttBroker exceeds 256 characters', () => {
    const values = makeValues({ mqttBroker: 'a'.repeat(257) });
    const errors = validateStepESP32Config(values);
    expect(errors.mqttBroker).toBe('MQTT broker host maksimal 256 karakter');
  });

  it('accepts mqttBroker with exactly 256 characters', () => {
    const values = makeValues({ mqttBroker: 'a'.repeat(256), mqttTopic: 'topic' });
    const errors = validateStepESP32Config(values);
    expect(errors.mqttBroker).toBeUndefined();
  });

  it('returns error when mqttTopic is empty', () => {
    const values = makeValues({ mqttTopic: '' });
    const errors = validateStepESP32Config(values);
    expect(errors.mqttTopic).toBe('MQTT topic wajib diisi');
  });

  it('returns error when mqttTopic is only whitespace', () => {
    const values = makeValues({ mqttTopic: '   ' });
    const errors = validateStepESP32Config(values);
    expect(errors.mqttTopic).toBe('MQTT topic wajib diisi');
  });

  it('returns error when mqttTopic exceeds 128 characters', () => {
    const values = makeValues({ mqttTopic: 'a'.repeat(129) });
    const errors = validateStepESP32Config(values);
    expect(errors.mqttTopic).toBe('MQTT topic maksimal 128 karakter');
  });

  it('accepts mqttTopic with exactly 128 characters', () => {
    const values = makeValues({ mqttTopic: 'a'.repeat(128) });
    const errors = validateStepESP32Config(values);
    expect(errors.mqttTopic).toBeUndefined();
  });

  it('returns both errors when both fields are invalid', () => {
    const values = makeValues({ mqttBroker: '', mqttTopic: '' });
    const errors = validateStepESP32Config(values);
    expect(errors.mqttBroker).toBe('MQTT broker host wajib diisi');
    expect(errors.mqttTopic).toBe('MQTT topic wajib diisi');
  });

  it('skipped state ignores invalid field values', () => {
    const values = makeValues({ mqttBroker: 'a'.repeat(300), mqttTopic: '', skipped: true });
    const errors = validateStepESP32Config(values);
    expect(errors).toEqual({});
  });

  it('gas sensor fields do not affect MQTT validation', () => {
    const values = makeValues({ gasSensorEnabled: true, gasThreshold: 3000 });
    const errors = validateStepESP32Config(values);
    expect(errors).toEqual({});
  });
});
