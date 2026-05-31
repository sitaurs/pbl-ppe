// Feature: node-detail-tree-view, Property 8: Node save round-trip preserves both flat and nested fields
// **Validates: Requirements 9.2**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { syncFlatFields } from '../sync-flat-fields';
import type { NodeData, CameraConfig } from '../node-types';

/**
 * Arbitrary generator for a valid CameraConfig object.
 */
const cameraConfigArbitrary = fc.record({
  url: fc.oneof(
    // RTSP URLs
    fc.string({ minLength: 1, maxLength: 100 }).map((s) => `rtsp://${s}`),
    // HTTP URLs
    fc.string({ minLength: 1, maxLength: 100 }).map((s) => `http://${s}`),
    // Local webcam index
    fc.integer({ min: 0, max: 9 }).map(String)
  ),
  resolution: fc.constantFrom('640x480', '1280x720', '1920x1080'),
  protocol: fc.constantFrom('rtsp' as const, 'http' as const, 'local' as const),
});

/**
 * Arbitrary generator for a valid ESP32Config object.
 */
const esp32ConfigArbitrary = fc.record({
  mqttTopic: fc.string({ minLength: 1, maxLength: 128 }),
  mqttBroker: fc.string({ minLength: 1, maxLength: 256 }),
  enabled: fc.boolean(),
});

/**
 * Arbitrary generator for a valid DetectionConfig object.
 */
const detectionConfigArbitrary = fc.record({
  mode: fc.constantFrom('realtime' as const, 'scheduled' as const, 'disabled' as const),
  confidenceThreshold: fc.double({ min: 0.1, max: 1.0, noNaN: true }),
});

/**
 * Arbitrary generator for valid NodeData objects with both flat and nested fields.
 * Camera can be null or a valid CameraConfig object.
 */
const nodeDataArbitrary: fc.Arbitrary<NodeData> = fc.record({
  id: fc.integer({ min: 1, max: 999999 }),
  sektorId: fc.string({ minLength: 1, maxLength: 10 }),
  sektorName: fc.string({ minLength: 1, maxLength: 100 }),
  picName: fc.string({ minLength: 1, maxLength: 50 }),
  picPhone: fc.string({ minLength: 10, maxLength: 15 }),
  cameraSource: fc.string({ minLength: 1, maxLength: 512 }),
  enabled: fc.boolean(),
  camera: fc.oneof(cameraConfigArbitrary, fc.constant(null)),
  esp32: fc.oneof(esp32ConfigArbitrary, fc.constant(null)),
  detection: fc.oneof(detectionConfigArbitrary, fc.constant(null)),
});

describe('Property 8: Node save round-trip preserves both flat and nested fields', () => {
  it('after syncFlatFields, cameraSource === camera.url when camera is not null and camera.url is non-empty', () => {
    fc.assert(
      fc.property(nodeDataArbitrary, (node) => {
        const synced = syncFlatFields(node);

        if (node.camera !== null && node.camera.url) {
          // When camera exists with a non-empty URL, cameraSource must be synced
          expect(synced.cameraSource).toBe(node.camera.url);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('after syncFlatFields, cameraSource === "0" when camera is null', () => {
    fc.assert(
      fc.property(nodeDataArbitrary, (node) => {
        const synced = syncFlatFields(node);

        if (node.camera === null) {
          // When camera is null, cameraSource must be "0"
          expect(synced.cameraSource).toBe('0');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('syncFlatFields preserves all nested objects unchanged', () => {
    fc.assert(
      fc.property(nodeDataArbitrary, (node) => {
        const synced = syncFlatFields(node);

        // Nested objects should remain identical
        expect(synced.camera).toEqual(node.camera);
        expect(synced.esp32).toEqual(node.esp32);
        expect(synced.detection).toEqual(node.detection);
      }),
      { numRuns: 100 }
    );
  });

  it('syncFlatFields preserves flat identity fields (id, sektorId, sektorName, picName, picPhone, enabled)', () => {
    fc.assert(
      fc.property(nodeDataArbitrary, (node) => {
        const synced = syncFlatFields(node);

        expect(synced.id).toBe(node.id);
        expect(synced.sektorId).toBe(node.sektorId);
        expect(synced.sektorName).toBe(node.sektorName);
        expect(synced.picName).toBe(node.picName);
        expect(synced.picPhone).toBe(node.picPhone);
        expect(synced.enabled).toBe(node.enabled);
      }),
      { numRuns: 100 }
    );
  });

  it('syncFlatFields is idempotent: applying it twice yields the same result as once', () => {
    fc.assert(
      fc.property(nodeDataArbitrary, (node) => {
        const first = syncFlatFields(node);
        const second = syncFlatFields(first);

        expect(second).toEqual(first);
      }),
      { numRuns: 100 }
    );
  });
});
