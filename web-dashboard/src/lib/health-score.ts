// lib/health-score.ts
// Health score calculation for node monitoring
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 3.8

import type { NodeData, NodeStatus, HealthScore } from './node-types';

/**
 * Maps a ComponentStatus to a binary score (1 or 0).
 * "online" or "connected" → 1 (contributing full weight)
 * "degraded" → 0.5
 * "offline", "unconfigured" → 0
 */
function getComponentScore(status: string | undefined | null): number {
  if (!status) return 0;
  if (status === 'online' || status === 'connected') return 1;
  if (status === 'degraded') return 0.5;
  return 0;
}

/**
 * Determines if the detection configuration is valid.
 * Valid when: detection is not null, mode is not 'disabled',
 * and confidenceThreshold is >= 0.1.
 */
function isDetectionValid(node: NodeData): boolean {
  return (
    node.detection !== null &&
    node.detection.mode !== 'disabled' &&
    node.detection.confidenceThreshold >= 0.1
  );
}

/**
 * Calculates the health score for a node based on its composition and component statuses.
 *
 * Scoring weights:
 * - Full node (camera + ESP32): camera 40%, ESP32 30%, detection 30%
 * - Camera-only (no ESP32): camera 60%, detection 40%
 * - ESP32-only (no camera): ESP32 60%, detection 40%
 *
 * Component scores:
 * - online/connected = 100% of weight
 * - degraded = 50% of weight
 * - offline/unconfigured = 0%
 *
 * Labels:
 * - score >= 80: "Sehat" (green)
 * - score 50-79: "Perlu Perhatian" (yellow)
 * - score < 50: "Kritis" (red)
 */
export function calculateHealthScore(
  node: NodeData,
  status: NodeStatus | null
): HealthScore {
  const hasCamera = node.camera !== null;
  const hasEsp32 = node.esp32 !== null && node.esp32.enabled;
  const detectionValid = isDetectionValid(node) ? 1 : 0;

  let score = 0;

  if (hasCamera && hasEsp32) {
    // Full node: camera 40%, esp32 30%, detection 30%
    const cameraScore = getComponentScore(status?.camera);
    const esp32Score = getComponentScore(status?.esp32);
    score = cameraScore * 40 + esp32Score * 30 + detectionValid * 30;
  } else if (hasCamera && !hasEsp32) {
    // Camera only: camera 60%, detection 40%
    const cameraScore = getComponentScore(status?.camera);
    score = cameraScore * 60 + detectionValid * 40;
  } else if (!hasCamera && hasEsp32) {
    // ESP32 only: esp32 60%, detection 40%
    const esp32Score = getComponentScore(status?.esp32);
    score = esp32Score * 60 + detectionValid * 40;
  }
  // If neither camera nor esp32 configured, score remains 0

  // Clamp score to 0-100 range
  score = Math.round(Math.max(0, Math.min(100, score)));

  if (score >= 80) {
    return { score, label: 'Sehat', color: 'green' };
  }
  if (score >= 50) {
    return { score, label: 'Perlu Perhatian', color: 'yellow' };
  }
  return { score, label: 'Kritis', color: 'red' };
}
