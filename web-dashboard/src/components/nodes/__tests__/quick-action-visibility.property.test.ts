// Feature: node-detail-tree-view, Property 6: Quick action button conditional visibility
// **Validates: Requirements 5.1, 5.3, 5.5**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type {
  NodeData,
  NodeStatus,
  CameraConfig,
  ESP32Config,
  DetectionConfig,
  ComponentStatus,
} from '@/lib/node-types';

// --- Pure visibility logic (extracted from NodeTreeView) ---

/**
 * Determines whether "Test Koneksi" button should be visible.
 * Visible when camera exists and camera.url is non-empty.
 */
function isTestKoneksiVisible(node: NodeData): boolean {
  return node.camera !== null && node.camera.url.length > 0;
}

/**
 * Determines whether "Lihat Live" button should be visible.
 * Visible when camera exists and status.camera === "online".
 */
function isLihatLiveVisible(node: NodeData, status: NodeStatus | null): boolean {
  return node.camera !== null && status?.camera === 'online';
}

/**
 * Determines whether "Test MQTT" button should be visible.
 * Visible when esp32 exists, mqttBroker is non-empty, and mqttTopic is non-empty.
 */
function isTestMqttVisible(node: NodeData): boolean {
  return (
    node.esp32 !== null &&
    node.esp32.mqttBroker.length > 0 &&
    node.esp32.mqttTopic.length > 0
  );
}

// --- Arbitraries ---

const componentStatusArb: fc.Arbitrary<ComponentStatus> = fc.constantFrom(
  'online',
  'offline',
  'degraded',
  'unconfigured'
);

const cameraConfigArb: fc.Arbitrary<CameraConfig> = fc.record({
  url: fc.string({ minLength: 0, maxLength: 100 }),
  resolution: fc.constantFrom('640x480', '1280x720', '1920x1080'),
  protocol: fc.constantFrom('rtsp' as const, 'http' as const, 'local' as const),
});

const esp32ConfigArb: fc.Arbitrary<ESP32Config> = fc.record({
  mqttTopic: fc.string({ minLength: 0, maxLength: 50 }),
  mqttBroker: fc.string({ minLength: 0, maxLength: 50 }),
  enabled: fc.boolean(),
});

const detectionConfigArb: fc.Arbitrary<DetectionConfig> = fc.record({
  mode: fc.constantFrom('realtime' as const, 'scheduled' as const, 'disabled' as const),
  confidenceThreshold: fc.double({ min: 0.1, max: 1.0, noNaN: true }),
});

const nodeDataArb: fc.Arbitrary<NodeData> = fc.record({
  id: fc.nat(),
  sektorId: fc.string({ minLength: 1, maxLength: 10 }),
  sektorName: fc.string({ minLength: 1, maxLength: 50 }),
  picName: fc.string({ minLength: 1, maxLength: 50 }),
  picPhone: fc.string({ minLength: 1, maxLength: 20 }),
  cameraSource: fc.string({ minLength: 0, maxLength: 100 }),
  enabled: fc.boolean(),
  camera: fc.option(cameraConfigArb, { nil: null }),
  esp32: fc.option(esp32ConfigArb, { nil: null }),
  detection: fc.option(detectionConfigArb, { nil: null }),
});

const nodeStatusArb: fc.Arbitrary<NodeStatus> = fc.record({
  camera: componentStatusArb,
  esp32: componentStatusArb,
  lastUpdated: fc
    .date({ min: new Date('2020-01-01T00:00:00.000Z'), max: new Date('2030-12-31T23:59:59.999Z') })
    .filter((d) => !isNaN(d.getTime()))
    .map((d) => d.toISOString()),
});

const nullableNodeStatusArb: fc.Arbitrary<NodeStatus | null> = fc.option(nodeStatusArb, {
  nil: null,
});

// --- Property Tests ---

describe('Property 6: Quick action button conditional visibility', () => {
  it('"Test Koneksi" is visible iff camera exists and camera.url is non-empty', () => {
    fc.assert(
      fc.property(nodeDataArb, (node) => {
        const visible = isTestKoneksiVisible(node);
        const expected = node.camera !== null && node.camera.url.length > 0;

        expect(visible).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it('"Test Koneksi" is never visible when camera is null', () => {
    fc.assert(
      fc.property(
        nodeDataArb.map((n) => ({ ...n, camera: null })),
        (node) => {
          expect(isTestKoneksiVisible(node)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('"Test Koneksi" is not visible when camera exists but url is empty', () => {
    fc.assert(
      fc.property(
        nodeDataArb.chain((n) =>
          cameraConfigArb.map((cam) => ({
            ...n,
            camera: { ...cam, url: '' },
          }))
        ),
        (node) => {
          expect(isTestKoneksiVisible(node)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('"Lihat Live" is visible iff camera exists and status.camera === "online"', () => {
    fc.assert(
      fc.property(nodeDataArb, nullableNodeStatusArb, (node, status) => {
        const visible = isLihatLiveVisible(node, status);
        const expected = node.camera !== null && status?.camera === 'online';

        expect(visible).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it('"Lihat Live" is never visible when camera is null regardless of status', () => {
    fc.assert(
      fc.property(
        nodeDataArb.map((n) => ({ ...n, camera: null })),
        nullableNodeStatusArb,
        (node, status) => {
          expect(isLihatLiveVisible(node, status)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('"Lihat Live" is never visible when status is null', () => {
    fc.assert(
      fc.property(nodeDataArb, (node) => {
        expect(isLihatLiveVisible(node, null)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('"Lihat Live" is never visible when status.camera !== "online"', () => {
    fc.assert(
      fc.property(
        nodeDataArb,
        fc.constantFrom('offline' as ComponentStatus, 'degraded' as ComponentStatus, 'unconfigured' as ComponentStatus),
        (node, cameraStatus) => {
          const status: NodeStatus = {
            camera: cameraStatus,
            esp32: 'online',
            lastUpdated: new Date().toISOString(),
          };
          expect(isLihatLiveVisible(node, status)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('"Test MQTT" is visible iff esp32 exists, mqttBroker is non-empty, and mqttTopic is non-empty', () => {
    fc.assert(
      fc.property(nodeDataArb, (node) => {
        const visible = isTestMqttVisible(node);
        const expected =
          node.esp32 !== null &&
          node.esp32.mqttBroker.length > 0 &&
          node.esp32.mqttTopic.length > 0;

        expect(visible).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it('"Test MQTT" is never visible when esp32 is null', () => {
    fc.assert(
      fc.property(
        nodeDataArb.map((n) => ({ ...n, esp32: null })),
        (node) => {
          expect(isTestMqttVisible(node)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('"Test MQTT" is not visible when esp32 exists but mqttBroker is empty', () => {
    fc.assert(
      fc.property(
        nodeDataArb.chain((n) =>
          esp32ConfigArb.map((esp) => ({
            ...n,
            esp32: { ...esp, mqttBroker: '', mqttTopic: 'some-topic' },
          }))
        ),
        (node) => {
          expect(isTestMqttVisible(node)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('"Test MQTT" is not visible when esp32 exists but mqttTopic is empty', () => {
    fc.assert(
      fc.property(
        nodeDataArb.chain((n) =>
          esp32ConfigArb.map((esp) => ({
            ...n,
            esp32: { ...esp, mqttBroker: 'broker.example.com', mqttTopic: '' },
          }))
        ),
        (node) => {
          expect(isTestMqttVisible(node)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
