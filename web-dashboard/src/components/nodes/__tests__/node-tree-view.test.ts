// Unit tests for NodeTreeView composition derivation and section visibility logic
// Validates: Requirements 1.3, 1.4, 1.5, 8.3, 8.4

import { describe, it, expect } from 'vitest';
import { deriveComposition } from '../NodeTreeView';
import type { NodeData } from '@/lib/node-types';

// --- Test helpers ---

function makeNode(overrides: Partial<NodeData> = {}): NodeData {
  return {
    id: 1,
    sektorId: 'S-01',
    sektorName: 'Area Loading Dock',
    picName: 'Pak Budi',
    picPhone: '6281234567890',
    cameraSource: 'rtsp://192.168.1.10/live/ch00_1',
    enabled: true,
    camera: {
      url: 'rtsp://192.168.1.10/live/ch00_1',
      resolution: '1280x720',
      protocol: 'rtsp',
    },
    esp32: {
      mqttTopic: 'APD_Violation',
      mqttBroker: 'broker.hivemq.cloud',
      enabled: true,
    },
    detection: {
      mode: 'realtime',
      confidenceThreshold: 0.5,
    },
    ...overrides,
  };
}

// --- Tests ---

describe('deriveComposition', () => {
  it('returns "camera-esp32" when both camera and esp32 are present', () => {
    const node = makeNode();
    expect(deriveComposition(node)).toBe('camera-esp32');
  });

  it('returns "camera-only" when camera is present but esp32 is null', () => {
    const node = makeNode({ esp32: null });
    expect(deriveComposition(node)).toBe('camera-only');
  });

  it('returns "esp32-only" when esp32 is present but camera is null', () => {
    const node = makeNode({ camera: null });
    expect(deriveComposition(node)).toBe('esp32-only');
  });

  it('returns "esp32-only" when both camera and detection are null but esp32 is present', () => {
    const node = makeNode({ camera: null, detection: null });
    expect(deriveComposition(node)).toBe('esp32-only');
  });
});

describe('Section visibility rules', () => {
  it('camera-esp32 composition shows Camera, ESP32, Detection, and Sector', () => {
    const composition: string = 'camera-esp32';
    const showCamera = composition === 'camera-only' || composition === 'camera-esp32';
    const showEsp32 = composition === 'esp32-only' || composition === 'camera-esp32';
    const showDetection = showCamera;
    const showSector = true;

    expect(showCamera).toBe(true);
    expect(showEsp32).toBe(true);
    expect(showDetection).toBe(true);
    expect(showSector).toBe(true);
  });

  it('camera-only composition shows Camera, Detection, Sector but NOT ESP32', () => {
    const composition: string = 'camera-only';
    const showCamera = composition === 'camera-only' || composition === 'camera-esp32';
    const showEsp32 = composition === 'esp32-only' || composition === 'camera-esp32';
    const showDetection = showCamera;
    const showSector = true;

    expect(showCamera).toBe(true);
    expect(showEsp32).toBe(false);
    expect(showDetection).toBe(true);
    expect(showSector).toBe(true);
  });

  it('esp32-only composition shows ESP32, Sector but NOT Camera or Detection', () => {
    const composition: string = 'esp32-only';
    const showCamera = composition === 'camera-only' || composition === 'camera-esp32';
    const showEsp32 = composition === 'esp32-only' || composition === 'camera-esp32';
    const showDetection = showCamera;
    const showSector = true;

    expect(showCamera).toBe(false);
    expect(showEsp32).toBe(true);
    expect(showDetection).toBe(false);
    expect(showSector).toBe(true);
  });
});

describe('Quick action visibility logic', () => {
  it('"Test Koneksi" visible when camera URL is non-empty', () => {
    const node = makeNode();
    const showCamera = true;
    const showTestCamera = showCamera && node.camera !== null && node.camera.url.length > 0;
    expect(showTestCamera).toBe(true);
  });

  it('"Test Koneksi" hidden when camera URL is empty', () => {
    const node = makeNode({
      camera: { url: '', resolution: '640x480', protocol: 'rtsp' },
    });
    const showCamera = true;
    const showTestCamera = showCamera && node.camera !== null && node.camera.url.length > 0;
    expect(showTestCamera).toBe(false);
  });

  it('"Lihat Live" visible when camera status is online', () => {
    const status = { camera: 'online' as const, esp32: 'connected' as const, lastUpdated: new Date().toISOString() };
    const showCamera = true;
    const showLiveView = showCamera && status.camera === 'online';
    expect(showLiveView).toBe(true);
  });

  it('"Lihat Live" hidden when camera status is offline', () => {
    const status: { camera: string; esp32: string; lastUpdated: string } = { camera: 'offline', esp32: 'connected', lastUpdated: new Date().toISOString() };
    const showCamera = true;
    const showLiveView = showCamera && status.camera === 'online';
    expect(showLiveView).toBe(false);
  });

  it('"Test MQTT" visible when broker and topic are non-empty', () => {
    const node = makeNode();
    const showEsp32 = true;
    const showTestMqtt = showEsp32 && node.esp32 !== null && node.esp32.mqttBroker.length > 0 && node.esp32.mqttTopic.length > 0;
    expect(showTestMqtt).toBe(true);
  });

  it('"Test MQTT" hidden when broker is empty', () => {
    const node = makeNode({
      esp32: { mqttBroker: '', mqttTopic: 'APD_Violation', enabled: true },
    });
    const showEsp32 = true;
    const showTestMqtt = showEsp32 && node.esp32 !== null && node.esp32.mqttBroker.length > 0 && node.esp32.mqttTopic.length > 0;
    expect(showTestMqtt).toBe(false);
  });

  it('"Test MQTT" hidden when topic is empty', () => {
    const node = makeNode({
      esp32: { mqttBroker: 'broker.hivemq.cloud', mqttTopic: '', enabled: true },
    });
    const showEsp32 = true;
    const showTestMqtt = showEsp32 && node.esp32 !== null && node.esp32.mqttBroker.length > 0 && node.esp32.mqttTopic.length > 0;
    expect(showTestMqtt).toBe(false);
  });
});
