// Feature: node-detail-tree-view, Property 10: Connection test API input validation
// **Validates: Requirements 10.5**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateConnectionTestRequest } from '../connection-test-validation';

/**
 * Arbitrary generator for invalid "type" values (not "camera" or "mqtt").
 */
const invalidTypeArbitrary = fc.oneof(
  fc.string().filter((s) => s !== 'camera' && s !== 'mqtt'),
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.boolean(),
  fc.constant([]),
  fc.constant({})
);

/**
 * Arbitrary generator for a valid camera request (type "camera" with non-empty url).
 */
const validCameraRequestArbitrary = fc.record({
  type: fc.constant('camera' as const),
  url: fc.string({ minLength: 1, maxLength: 512 }).filter((s) => s.trim().length > 0),
});

/**
 * Arbitrary generator for a valid MQTT request (type "mqtt" with all required fields).
 */
const validMqttRequestArbitrary = fc.record({
  type: fc.constant('mqtt' as const),
  broker: fc.string({ minLength: 1, maxLength: 256 }).filter((s) => s.trim().length > 0),
  port: fc.integer({ min: 1, max: 65535 }),
  username: fc.string({ minLength: 1, maxLength: 100 }),
  password: fc.string({ minLength: 1, maxLength: 100 }),
});

/**
 * Arbitrary generator for camera request without "url" field (or invalid url).
 */
const cameraWithoutUrlArbitrary = fc.oneof(
  // Missing url entirely
  fc.constant({ type: 'camera' }),
  // url is empty string
  fc.constant({ type: 'camera', url: '' }),
  // url is whitespace only
  fc.constant({ type: 'camera', url: '   ' }),
  // url is not a string
  fc.record({
    type: fc.constant('camera'),
    url: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
  })
);

/**
 * Arbitrary generator for MQTT request with at least one required field missing.
 * We test each missing field scenario individually.
 */
const mqttMissingBrokerArbitrary = fc.record({
  type: fc.constant('mqtt'),
  port: fc.integer({ min: 1, max: 65535 }),
  username: fc.string({ minLength: 1, maxLength: 100 }),
  password: fc.string({ minLength: 1, maxLength: 100 }),
  // broker is missing or invalid
  broker: fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.constant(''),
    fc.constant('   '),
    fc.integer()
  ),
});

const mqttMissingPortArbitrary = fc.record({
  type: fc.constant('mqtt'),
  broker: fc.string({ minLength: 1, maxLength: 256 }).filter((s) => s.trim().length > 0),
  username: fc.string({ minLength: 1, maxLength: 100 }),
  password: fc.string({ minLength: 1, maxLength: 100 }),
  // port is missing or invalid
  port: fc.oneof(fc.constant(undefined), fc.constant(null), fc.string()),
});

const mqttMissingUsernameArbitrary = fc.record({
  type: fc.constant('mqtt'),
  broker: fc.string({ minLength: 1, maxLength: 256 }).filter((s) => s.trim().length > 0),
  port: fc.integer({ min: 1, max: 65535 }),
  password: fc.string({ minLength: 1, maxLength: 100 }),
  // username is missing or invalid
  username: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant(''), fc.integer()),
});

const mqttMissingPasswordArbitrary = fc.record({
  type: fc.constant('mqtt'),
  broker: fc.string({ minLength: 1, maxLength: 256 }).filter((s) => s.trim().length > 0),
  port: fc.integer({ min: 1, max: 65535 }),
  username: fc.string({ minLength: 1, maxLength: 100 }),
  // password is missing or invalid
  password: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant(''), fc.integer()),
});

describe('Property 10: Connection test API input validation', () => {
  it('invalid "type" values (not "camera" or "mqtt") produce validation errors with field="type"', () => {
    fc.assert(
      fc.property(invalidTypeArbitrary, (invalidType) => {
        const body = { type: invalidType };
        const result = validateConnectionTestRequest(body);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.field).toBe('type');
      }),
      { numRuns: 100 }
    );
  });

  it('camera type without valid "url" produces validation error with field="url"', () => {
    fc.assert(
      fc.property(cameraWithoutUrlArbitrary, (body) => {
        const result = validateConnectionTestRequest(body);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.field).toBe('url');
      }),
      { numRuns: 100 }
    );
  });

  it('MQTT type without "broker" produces validation error with field="broker"', () => {
    fc.assert(
      fc.property(mqttMissingBrokerArbitrary, (body) => {
        const result = validateConnectionTestRequest(body);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.field).toBe('broker');
      }),
      { numRuns: 100 }
    );
  });

  it('MQTT type without "port" produces validation error with field="port"', () => {
    fc.assert(
      fc.property(mqttMissingPortArbitrary, (body) => {
        const result = validateConnectionTestRequest(body);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.field).toBe('port');
      }),
      { numRuns: 100 }
    );
  });

  it('MQTT type without "username" produces validation error with field="username"', () => {
    fc.assert(
      fc.property(mqttMissingUsernameArbitrary, (body) => {
        const result = validateConnectionTestRequest(body);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.field).toBe('username');
      }),
      { numRuns: 100 }
    );
  });

  it('MQTT type without "password" produces validation error with field="password"', () => {
    fc.assert(
      fc.property(mqttMissingPasswordArbitrary, (body) => {
        const result = validateConnectionTestRequest(body);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.field).toBe('password');
      }),
      { numRuns: 100 }
    );
  });

  it('valid camera requests pass validation', () => {
    fc.assert(
      fc.property(validCameraRequestArbitrary, (body) => {
        const result = validateConnectionTestRequest(body);

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it('valid MQTT requests pass validation', () => {
    fc.assert(
      fc.property(validMqttRequestArbitrary, (body) => {
        const result = validateConnectionTestRequest(body);

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });
});
