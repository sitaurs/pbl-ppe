// Feature: node-detail-tree-view, Property 3: Health score calculation and labeling
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 3.8**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateHealthScore } from '../health-score';
import type { NodeData, NodeStatus, ComponentStatus } from '../node-types';

// --- Arbitraries (Generators) ---

const componentStatusArb: fc.Arbitrary<ComponentStatus> = fc.constantFrom(
  'online',
  'offline',
  'degraded',
  'unconfigured'
);

const cameraConfigArb = fc.record({
  url: fc.string({ minLength: 1, maxLength: 512 }),
  resolution: fc.constantFrom('640x480', '1280x720', '1920x1080'),
  protocol: fc.constantFrom('rtsp' as const, 'http' as const, 'local' as const),
});

const esp32ConfigArb = fc.record({
  mqttTopic: fc.string({ minLength: 0, maxLength: 128 }),
  mqttBroker: fc.string({ minLength: 0, maxLength: 256 }),
  enabled: fc.boolean(),
});

const detectionConfigArb = fc.oneof(
  // Valid detection: mode not disabled, confidence >= 0.1
  fc.record({
    mode: fc.constantFrom('realtime' as const, 'scheduled' as const),
    confidenceThreshold: fc.double({ min: 0.1, max: 1.0, noNaN: true }),
  }),
  // Invalid detection: disabled mode
  fc.record({
    mode: fc.constant('disabled' as const),
    confidenceThreshold: fc.double({ min: 0.1, max: 1.0, noNaN: true }),
  }),
  // Invalid detection: threshold too low
  fc.record({
    mode: fc.constantFrom('realtime' as const, 'scheduled' as const),
    confidenceThreshold: fc.double({ min: 0, max: 0.099, noNaN: true }),
  })
);

// Generate node with camera-only composition (esp32 null or disabled)
const cameraOnlyNodeArb: fc.Arbitrary<NodeData> = fc.record({
  id: fc.nat(),
  sektorId: fc.string({ minLength: 1, maxLength: 10 }),
  sektorName: fc.string({ minLength: 1, maxLength: 50 }),
  picName: fc.string({ minLength: 1, maxLength: 50 }),
  picPhone: fc.string({ minLength: 10, maxLength: 15 }),
  cameraSource: fc.string({ minLength: 1, maxLength: 512 }),
  enabled: fc.boolean(),
  camera: cameraConfigArb,
  esp32: fc.constant(null),
  detection: fc.oneof(detectionConfigArb, fc.constant(null)),
});

// Generate node with esp32-only composition (camera null)
const esp32OnlyNodeArb: fc.Arbitrary<NodeData> = fc.record({
  id: fc.nat(),
  sektorId: fc.string({ minLength: 1, maxLength: 10 }),
  sektorName: fc.string({ minLength: 1, maxLength: 50 }),
  picName: fc.string({ minLength: 1, maxLength: 50 }),
  picPhone: fc.string({ minLength: 10, maxLength: 15 }),
  cameraSource: fc.string({ minLength: 1, maxLength: 512 }),
  enabled: fc.boolean(),
  camera: fc.constant(null),
  esp32: esp32ConfigArb.filter((e) => e.enabled),
  detection: fc.oneof(detectionConfigArb, fc.constant(null)),
});

// Generate node with camera+esp32 composition
const fullNodeArb: fc.Arbitrary<NodeData> = fc.record({
  id: fc.nat(),
  sektorId: fc.string({ minLength: 1, maxLength: 10 }),
  sektorName: fc.string({ minLength: 1, maxLength: 50 }),
  picName: fc.string({ minLength: 1, maxLength: 50 }),
  picPhone: fc.string({ minLength: 10, maxLength: 15 }),
  cameraSource: fc.string({ minLength: 1, maxLength: 512 }),
  enabled: fc.boolean(),
  camera: cameraConfigArb,
  esp32: esp32ConfigArb.filter((e) => e.enabled),
  detection: fc.oneof(detectionConfigArb, fc.constant(null)),
});

const nodeStatusArb: fc.Arbitrary<NodeStatus> = fc.record({
  camera: componentStatusArb,
  esp32: componentStatusArb,
  lastUpdated: fc.integer({ min: 946684800000, max: 4102444799999 }).map((ts) => new Date(ts).toISOString()),
});

// Helper: compute expected component score
function expectedComponentScore(status: ComponentStatus): number {
  if (status === 'online') return 1;
  if (status === 'degraded') return 0.5;
  return 0; // offline, unconfigured
}

// Helper: determine if detection is valid
function isDetectionValid(node: NodeData): boolean {
  return (
    node.detection !== null &&
    node.detection.mode !== 'disabled' &&
    node.detection.confidenceThreshold >= 0.1
  );
}

describe('Property 3: Health score calculation and labeling', () => {
  it('score is always in range 0-100 for any composition and status', () => {
    fc.assert(
      fc.property(
        fc.oneof(cameraOnlyNodeArb, esp32OnlyNodeArb, fullNodeArb),
        fc.oneof(nodeStatusArb, fc.constant(null)),
        (node, status) => {
          const result = calculateHealthScore(node, status);
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('score >= 80 always maps to label "Sehat" and color "green"', () => {
    fc.assert(
      fc.property(
        fc.oneof(cameraOnlyNodeArb, esp32OnlyNodeArb, fullNodeArb),
        fc.oneof(nodeStatusArb, fc.constant(null)),
        (node, status) => {
          const result = calculateHealthScore(node, status);
          if (result.score >= 80) {
            expect(result.label).toBe('Sehat');
            expect(result.color).toBe('green');
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('score 50-79 always maps to label "Perlu Perhatian" and color "yellow"', () => {
    fc.assert(
      fc.property(
        fc.oneof(cameraOnlyNodeArb, esp32OnlyNodeArb, fullNodeArb),
        fc.oneof(nodeStatusArb, fc.constant(null)),
        (node, status) => {
          const result = calculateHealthScore(node, status);
          if (result.score >= 50 && result.score <= 79) {
            expect(result.label).toBe('Perlu Perhatian');
            expect(result.color).toBe('yellow');
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('score < 50 always maps to label "Kritis" and color "red"', () => {
    fc.assert(
      fc.property(
        fc.oneof(cameraOnlyNodeArb, esp32OnlyNodeArb, fullNodeArb),
        fc.oneof(nodeStatusArb, fc.constant(null)),
        (node, status) => {
          const result = calculateHealthScore(node, status);
          if (result.score < 50) {
            expect(result.label).toBe('Kritis');
            expect(result.color).toBe('red');
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('full node (camera+esp32) uses weighted formula: camera*40 + esp32*30 + detection*30', () => {
    fc.assert(
      fc.property(fullNodeArb, nodeStatusArb, (node, status) => {
        const result = calculateHealthScore(node, status);

        const cameraScore = expectedComponentScore(status.camera);
        const esp32Score = expectedComponentScore(status.esp32);
        const detectionValid = isDetectionValid(node) ? 1 : 0;

        const expectedScore = Math.round(
          cameraScore * 40 + esp32Score * 30 + detectionValid * 30
        );

        expect(result.score).toBe(expectedScore);
      }),
      { numRuns: 200 }
    );
  });

  it('camera-only node uses weighted formula: camera*60 + detection*40', () => {
    fc.assert(
      fc.property(cameraOnlyNodeArb, nodeStatusArb, (node, status) => {
        const result = calculateHealthScore(node, status);

        const cameraScore = expectedComponentScore(status.camera);
        const detectionValid = isDetectionValid(node) ? 1 : 0;

        const expectedScore = Math.round(cameraScore * 60 + detectionValid * 40);

        expect(result.score).toBe(expectedScore);
      }),
      { numRuns: 200 }
    );
  });

  it('esp32-only node uses weighted formula: esp32*60 + detection*40', () => {
    fc.assert(
      fc.property(esp32OnlyNodeArb, nodeStatusArb, (node, status) => {
        const result = calculateHealthScore(node, status);

        const esp32Score = expectedComponentScore(status.esp32);
        const detectionValid = isDetectionValid(node) ? 1 : 0;

        const expectedScore = Math.round(esp32Score * 60 + detectionValid * 40);

        expect(result.score).toBe(expectedScore);
      }),
      { numRuns: 200 }
    );
  });

  it('component score mapping: online=100%, degraded=50%, offline=0%, unconfigured=0%', () => {
    fc.assert(
      fc.property(
        cameraOnlyNodeArb.map((n) => ({
          ...n,
          detection: { mode: 'realtime' as const, confidenceThreshold: 0.5 },
        })),
        componentStatusArb,
        (node, cameraStatus) => {
          const status: NodeStatus = {
            camera: cameraStatus,
            esp32: 'unconfigured',
            lastUpdated: new Date().toISOString(),
          };

          const result = calculateHealthScore(node, status);

          // With valid detection (40 pts) + camera contribution (60 * componentScore)
          const cameraScore = expectedComponentScore(cameraStatus);
          const expectedScore = Math.round(cameraScore * 60 + 1 * 40);

          expect(result.score).toBe(expectedScore);
        }
      ),
      { numRuns: 100 }
    );
  });
});
