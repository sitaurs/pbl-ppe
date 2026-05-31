import { describe, it, expect } from 'vitest';
import { validateStepESP32Config, StepESP32ConfigValues } from '../StepESP32Config';

describe('StepESP32Config validation', () => {
  it('returns no errors when all fields are valid', () => {
    const values: StepESP32ConfigValues = {
      mqttBroker: 'broker.hivemq.com',
      mqttTopic: 'APD_Violation',
      skipped: false,
    };
    const errors = validateStepESP32Config(values);
    expect(errors).toEqual({});
  });

  it('returns no errors when skipped', () => {
    const values: StepESP32ConfigValues = {
      mqttBroker: '',
      mqttTopic: '',
      skipped: true,
    };
    const errors = validateStepESP32Config(values);
    expect(errors).toEqual({});
  });

  it('returns error when mqttBroker is empty', () => {
    const values: StepESP32ConfigValues = {
      mqttBroker: '',
      mqttTopic: 'APD_Violation',
      skipped: false,
    };
    const errors = validateStepESP32Config(values);
    expect(errors.mqttBroker).toBe('MQTT broker host wajib diisi');
  });

  it('returns error when mqttBroker is only whitespace', () => {
    const values: StepESP32ConfigValues = {
      mqttBroker: '   ',
      mqttTopic: 'APD_Violation',
      skipped: false,
    };
    const errors = validateStepESP32Config(values);
    expect(errors.mqttBroker).toBe('MQTT broker host wajib diisi');
  });

  it('returns error when mqttBroker exceeds 256 characters', () => {
    const values: StepESP32ConfigValues = {
      mqttBroker: 'a'.repeat(257),
      mqttTopic: 'APD_Violation',
      skipped: false,
    };
    const errors = validateStepESP32Config(values);
    expect(errors.mqttBroker).toBe('MQTT broker host maksimal 256 karakter');
  });

  it('accepts mqttBroker with exactly 256 characters', () => {
    const values: StepESP32ConfigValues = {
      mqttBroker: 'a'.repeat(256),
      mqttTopic: 'topic',
      skipped: false,
    };
    const errors = validateStepESP32Config(values);
    expect(errors.mqttBroker).toBeUndefined();
  });

  it('returns error when mqttTopic is empty', () => {
    const values: StepESP32ConfigValues = {
      mqttBroker: 'broker.hivemq.com',
      mqttTopic: '',
      skipped: false,
    };
    const errors = validateStepESP32Config(values);
    expect(errors.mqttTopic).toBe('MQTT topic wajib diisi');
  });

  it('returns error when mqttTopic is only whitespace', () => {
    const values: StepESP32ConfigValues = {
      mqttBroker: 'broker.hivemq.com',
      mqttTopic: '   ',
      skipped: false,
    };
    const errors = validateStepESP32Config(values);
    expect(errors.mqttTopic).toBe('MQTT topic wajib diisi');
  });

  it('returns error when mqttTopic exceeds 128 characters', () => {
    const values: StepESP32ConfigValues = {
      mqttBroker: 'broker.hivemq.com',
      mqttTopic: 'a'.repeat(129),
      skipped: false,
    };
    const errors = validateStepESP32Config(values);
    expect(errors.mqttTopic).toBe('MQTT topic maksimal 128 karakter');
  });

  it('accepts mqttTopic with exactly 128 characters', () => {
    const values: StepESP32ConfigValues = {
      mqttBroker: 'broker.hivemq.com',
      mqttTopic: 'a'.repeat(128),
      skipped: false,
    };
    const errors = validateStepESP32Config(values);
    expect(errors.mqttTopic).toBeUndefined();
  });

  it('returns both errors when both fields are invalid', () => {
    const values: StepESP32ConfigValues = {
      mqttBroker: '',
      mqttTopic: '',
      skipped: false,
    };
    const errors = validateStepESP32Config(values);
    expect(errors.mqttBroker).toBe('MQTT broker host wajib diisi');
    expect(errors.mqttTopic).toBe('MQTT topic wajib diisi');
  });

  it('skipped state ignores invalid field values', () => {
    const values: StepESP32ConfigValues = {
      mqttBroker: 'a'.repeat(300),
      mqttTopic: '',
      skipped: true,
    };
    const errors = validateStepESP32Config(values);
    expect(errors).toEqual({});
  });
});
