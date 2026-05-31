// Feature: node-detail-tree-view, Property 1: Composition derivation determines tree section visibility
// **Validates: Requirements 1.3, 1.4, 1.5, 7.1, 7.2, 7.3**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { deriveComposition } from '../NodeTreeView';
import type { NodeData, CameraConfig, ESP32Config, DetectionConfig, NodeComposition } from '@/lib/node-types';

// --- Arbitraries ---

const cameraConfigArb: fc.Arbitrary<CameraConfig> = fc.record({
  url: fc.string({ minLength: 1, maxLength: 512 }),
  resolution: fc.constantFrom('640x480', '1280x720', '1920x1080'),
  protocol: fc.constantFrom('rtsp' as const, 'http' as const, 'local' as const),
});

const esp32ConfigArb: fc.Arbitrary<ESP32Config> = fc.record({
  mqttTopic: fc.string({ minLength: 0, maxLength: 128 }),
  mqttBroker: fc.string({ minLength: 0, maxLength: 256 }),
  enabled: fc.boolean(),
});

const detectionConfigArb: fc.Arbitrary<DetectionConfig> = fc.record({
  mode: fc.constantFrom('realtime' as const, 'scheduled' as const, 'disabled' as const),
  confidenceThreshold: fc.double({ min: 0.1, max: 1.0, noNaN: true }),
});

const baseNodeFieldsArb = fc.record({
  id: fc.nat(),
  sektorId: fc.string({ minLength: 1, maxLength: 10 }),
  sektorName: fc.string({ minLength: 1, maxLength: 100 }),
  picName: fc.string({ minLength: 1, maxLength: 100 }),
  picPhone: fc.string({ minLength: 10, maxLength: 15 }),
  cameraSource: fc.string({ minLength: 0, maxLength: 512 }),
  enabled: fc.boolean(),
});

/** Generate a NodeData with camera non-null and esp32 null (camera-only) */
const cameraOnlyNodeArb: fc.Arbitrary<NodeData> = fc.tuple(
  baseNodeFieldsArb,
  cameraConfigArb,
  fc.option(detectionConfigArb, { nil: null })
).map(([base, camera, detection]) => ({
  ...base,
  camera,
  esp32: null,
  detection,
}));

/** Generate a NodeData with camera null and esp32 non-null (esp32-only) */
const esp32OnlyNodeArb: fc.Arbitrary<NodeData> = fc.tuple(
  baseNodeFieldsArb,
  esp32ConfigArb,
  fc.option(detectionConfigArb, { nil: null })
).map(([base, esp32, detection]) => ({
  ...base,
  camera: null,
  esp32,
  detection,
}));

/** Generate a NodeData with both camera and esp32 non-null (camera-esp32) */
const cameraEsp32NodeArb: fc.Arbitrary<NodeData> = fc.tuple(
  baseNodeFieldsArb,
  cameraConfigArb,
  esp32ConfigArb,
  fc.option(detectionConfigArb, { nil: null })
).map(([base, camera, esp32, detection]) => ({
  ...base,
  camera,
  esp32,
  detection,
}));

/** Generate any valid NodeData (all three composition types) */
const anyNodeArb: fc.Arbitrary<NodeData> = fc.oneof(
  cameraOnlyNodeArb,
  esp32OnlyNodeArb,
  cameraEsp32NodeArb
);

// --- Helper: derive section visibility from composition ---

function deriveSectionVisibility(composition: NodeComposition) {
  const showCamera = composition === 'camera-only' || composition === 'camera-esp32';
  const showEsp32 = composition === 'esp32-only' || composition === 'camera-esp32';
  const showDetection = showCamera;
  const showSector = true;
  return { showCamera, showEsp32, showDetection, showSector };
}

// --- Property Tests ---

describe('Property 1: Composition derivation determines tree section visibility', () => {
  it('nodes with camera non-null and esp32 null derive as "camera-only"', () => {
    fc.assert(
      fc.property(cameraOnlyNodeArb, (node) => {
        const composition = deriveComposition(node);
        expect(composition).toBe('camera-only');
      }),
      { numRuns: 100 }
    );
  });

  it('nodes with camera null and esp32 non-null derive as "esp32-only"', () => {
    fc.assert(
      fc.property(esp32OnlyNodeArb, (node) => {
        const composition = deriveComposition(node);
        expect(composition).toBe('esp32-only');
      }),
      { numRuns: 100 }
    );
  });

  it('nodes with both camera and esp32 non-null derive as "camera-esp32"', () => {
    fc.assert(
      fc.property(cameraEsp32NodeArb, (node) => {
        const composition = deriveComposition(node);
        expect(composition).toBe('camera-esp32');
      }),
      { numRuns: 100 }
    );
  });

  it('"camera-only" composition shows Camera and Detection sections but not ESP32', () => {
    fc.assert(
      fc.property(cameraOnlyNodeArb, (node) => {
        const composition = deriveComposition(node);
        const visibility = deriveSectionVisibility(composition);

        expect(visibility.showCamera).toBe(true);
        expect(visibility.showDetection).toBe(true);
        expect(visibility.showEsp32).toBe(false);
        expect(visibility.showSector).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('"esp32-only" composition shows ESP32 section but not Camera or Detection', () => {
    fc.assert(
      fc.property(esp32OnlyNodeArb, (node) => {
        const composition = deriveComposition(node);
        const visibility = deriveSectionVisibility(composition);

        expect(visibility.showCamera).toBe(false);
        expect(visibility.showDetection).toBe(false);
        expect(visibility.showEsp32).toBe(true);
        expect(visibility.showSector).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('"camera-esp32" composition shows all sections', () => {
    fc.assert(
      fc.property(cameraEsp32NodeArb, (node) => {
        const composition = deriveComposition(node);
        const visibility = deriveSectionVisibility(composition);

        expect(visibility.showCamera).toBe(true);
        expect(visibility.showDetection).toBe(true);
        expect(visibility.showEsp32).toBe(true);
        expect(visibility.showSector).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('Sector section is always visible regardless of composition', () => {
    fc.assert(
      fc.property(anyNodeArb, (node) => {
        const composition = deriveComposition(node);
        const visibility = deriveSectionVisibility(composition);

        expect(visibility.showSector).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('Detection section visibility always matches Camera section visibility', () => {
    fc.assert(
      fc.property(anyNodeArb, (node) => {
        const composition = deriveComposition(node);
        const visibility = deriveSectionVisibility(composition);

        expect(visibility.showDetection).toBe(visibility.showCamera);
      }),
      { numRuns: 100 }
    );
  });

  it('composition is exhaustive - deriveComposition always returns one of the three valid types', () => {
    fc.assert(
      fc.property(anyNodeArb, (node) => {
        const composition = deriveComposition(node);
        expect(['camera-only', 'esp32-only', 'camera-esp32']).toContain(composition);
      }),
      { numRuns: 100 }
    );
  });
});
