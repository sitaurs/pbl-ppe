// Feature: node-detail-tree-view, Property 9: Legacy node migration produces valid extended schema
// **Validates: Requirements 9.3**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { migrateNode } from '../node-migration';
import type { NodeData, CameraConfig, ESP32Config, DetectionConfig } from '../node-types';

/**
 * Arbitrary generator for legacy node objects (flat fields only, no nested objects).
 */
const legacyNodeArbitrary = fc.record({
  id: fc.integer({ min: 1 }),
  sektorId: fc.string({ minLength: 1, maxLength: 10 }),
  sektorName: fc.string({ minLength: 1, maxLength: 100 }),
  picName: fc.string({ minLength: 1, maxLength: 50 }),
  picPhone: fc.string({ minLength: 10, maxLength: 15 }),
  cameraSource: fc.oneof(
    // RTSP URLs
    fc.string({ minLength: 1, maxLength: 100 }).map((s) => `rtsp://${s}`),
    // Numeric (local webcam index)
    fc.integer({ min: 0, max: 9 }).map(String),
    // HTTP or other strings
    fc.string({ minLength: 1, maxLength: 100 }).filter(
      (s) => !s.startsWith('rtsp://') && !/^\d+$/.test(s)
    )
  ),
  enabled: fc.boolean(),
});

/**
 * Arbitrary generator for already-migrated node objects (with nested fields defined).
 */
const migratedNodeArbitrary = fc.record({
  id: fc.integer({ min: 1 }),
  sektorId: fc.string({ minLength: 1, maxLength: 10 }),
  sektorName: fc.string({ minLength: 1, maxLength: 100 }),
  picName: fc.string({ minLength: 1, maxLength: 50 }),
  picPhone: fc.string({ minLength: 10, maxLength: 15 }),
  cameraSource: fc.string({ minLength: 1, maxLength: 100 }),
  enabled: fc.boolean(),
  camera: fc.record({
    url: fc.string({ minLength: 1, maxLength: 512 }),
    resolution: fc.constantFrom('640x480', '1280x720', '1920x1080'),
    protocol: fc.constantFrom('rtsp' as const, 'http' as const, 'local' as const),
  }),
  esp32: fc.record({
    mqttTopic: fc.string({ maxLength: 128 }),
    mqttBroker: fc.string({ maxLength: 256 }),
    enabled: fc.boolean(),
  }),
  detection: fc.record({
    mode: fc.constantFrom('realtime' as const, 'scheduled' as const, 'disabled' as const),
    confidenceThreshold: fc.double({ min: 0.1, max: 1.0, noNaN: true }),
  }),
});

describe('Property 9: Legacy node migration produces valid extended schema', () => {
  it('output always has camera, esp32, detection fields defined', () => {
    fc.assert(
      fc.property(legacyNodeArbitrary, (legacyNode) => {
        const result = migrateNode(legacyNode);

        // camera, esp32, detection must be defined (not undefined or null)
        expect(result.camera).toBeDefined();
        expect(result.camera).not.toBeNull();
        expect(result.esp32).toBeDefined();
        expect(result.esp32).not.toBeNull();
        expect(result.detection).toBeDefined();
        expect(result.detection).not.toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('protocol derivation is correct: rtsp:// → rtsp, numeric → local, else → http', () => {
    fc.assert(
      fc.property(legacyNodeArbitrary, (legacyNode) => {
        const result = migrateNode(legacyNode);
        const camera = result.camera as CameraConfig;
        const source = legacyNode.cameraSource;

        if (source.startsWith('rtsp://')) {
          expect(camera.protocol).toBe('rtsp');
        } else if (/^\d+$/.test(source)) {
          expect(camera.protocol).toBe('local');
        } else {
          expect(camera.protocol).toBe('http');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('camera.url equals the original cameraSource', () => {
    fc.assert(
      fc.property(legacyNodeArbitrary, (legacyNode) => {
        const result = migrateNode(legacyNode);
        const camera = result.camera as CameraConfig;

        expect(camera.url).toBe(legacyNode.cameraSource);
      }),
      { numRuns: 100 }
    );
  });

  it('default values are set correctly (resolution "640x480", esp32 disabled, detection realtime with 0.5 confidence)', () => {
    fc.assert(
      fc.property(legacyNodeArbitrary, (legacyNode) => {
        const result = migrateNode(legacyNode);
        const camera = result.camera as CameraConfig;
        const esp32 = result.esp32 as ESP32Config;
        const detection = result.detection as DetectionConfig;

        // Camera resolution defaults to "640x480"
        expect(camera.resolution).toBe('640x480');

        // ESP32 defaults: empty strings and disabled
        expect(esp32.mqttTopic).toBe('');
        expect(esp32.mqttBroker).toBe('');
        expect(esp32.enabled).toBe(false);

        // Detection defaults: mode "realtime" and confidence 0.5
        expect(detection.mode).toBe('realtime');
        expect(detection.confidenceThreshold).toBe(0.5);
      }),
      { numRuns: 100 }
    );
  });

  it('already-migrated nodes are returned unchanged', () => {
    fc.assert(
      fc.property(migratedNodeArbitrary, (migratedNode) => {
        const result = migrateNode(migratedNode);

        // Should return the same object reference (or at least identical values)
        expect(result.camera).toEqual(migratedNode.camera);
        expect(result.esp32).toEqual(migratedNode.esp32);
        expect(result.detection).toEqual(migratedNode.detection);
        expect(result.id).toBe(migratedNode.id);
        expect(result.sektorId).toBe(migratedNode.sektorId);
        expect(result.sektorName).toBe(migratedNode.sektorName);
        expect(result.cameraSource).toBe(migratedNode.cameraSource);
      }),
      { numRuns: 100 }
    );
  });
});
