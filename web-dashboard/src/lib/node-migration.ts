// lib/node-migration.ts
// Legacy node migration utility — converts flat-field-only nodes to extended schema
// Requirements: 9.3

import type { NodeData, CameraConfig, ESP32Config, DetectionConfig } from './node-types';

/**
 * Derives the camera protocol from a camera URL string.
 * - Starts with "rtsp://" → 'rtsp'
 * - Purely numeric (e.g. "0", "1") → 'local' (webcam index)
 * - Anything else → 'http'
 */
function deriveProtocol(url: string): CameraConfig['protocol'] {
  if (url.startsWith('rtsp://')) return 'rtsp';
  if (/^\d+$/.test(url)) return 'local';
  return 'http';
}

/**
 * Migrates a legacy node (flat fields only) to the extended NodeData schema.
 *
 * If the node already has camera/esp32/detection fields defined (i.e., already migrated),
 * it is returned as-is without modification.
 *
 * For legacy nodes, the migration:
 * - Creates a `camera` object from `cameraSource` with default resolution "640x480"
 * - Creates an `esp32` object with empty/disabled defaults
 * - Creates a `detection` object with mode "realtime" and confidence 0.5
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateNode(node: any): NodeData {
  // Already migrated: has at least one of the nested object fields defined
  if (
    node.camera !== undefined ||
    node.esp32 !== undefined ||
    node.detection !== undefined
  ) {
    return node as NodeData;
  }

  // Legacy node — only has flat fields
  const cameraSource: string = node.cameraSource || '0';

  const camera: CameraConfig = {
    url: cameraSource,
    resolution: '640x480',
    protocol: deriveProtocol(cameraSource),
  };

  const esp32: ESP32Config = {
    mqttTopic: '',
    mqttBroker: '',
    enabled: false,
  };

  const detection: DetectionConfig = {
    mode: 'realtime',
    confidenceThreshold: 0.5,
  };

  return {
    ...node,
    camera,
    esp32,
    detection,
  };
}
