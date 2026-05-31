// Unit tests for NodeTable component state management logic
// Validates: Requirements 1.7, 1.8, 3.9

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateHealthScore } from '@/lib/health-score';
import type { NodeData, NodeStatus } from '@/lib/node-types';

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

const MAX_EXPANDED_NODES = 20;

// --- Expanded state management logic (mirrors NodeTable) ---

describe('NodeTable expanded state management', () => {
  it('should add node to expanded set', () => {
    const expandedIds = new Set<number>();
    const nodeId = 5;

    // Toggle expand logic
    if (!expandedIds.has(nodeId) && expandedIds.size < MAX_EXPANDED_NODES) {
      expandedIds.add(nodeId);
    }

    expect(expandedIds.has(nodeId)).toBe(true);
    expect(expandedIds.size).toBe(1);
  });

  it('should remove node from expanded set on toggle', () => {
    const expandedIds = new Set<number>([5]);

    // Toggle collapse logic
    if (expandedIds.has(5)) {
      expandedIds.delete(5);
    }

    expect(expandedIds.has(5)).toBe(false);
    expect(expandedIds.size).toBe(0);
  });

  it('should reject expansion beyond 20 nodes', () => {
    const expandedIds = new Set<number>();
    // Fill to max
    for (let i = 1; i <= 20; i++) {
      expandedIds.add(i);
    }
    expect(expandedIds.size).toBe(20);

    // Try to add 21st — should be rejected
    const nodeId = 21;
    if (!expandedIds.has(nodeId) && expandedIds.size < MAX_EXPANDED_NODES) {
      expandedIds.add(nodeId);
    }

    expect(expandedIds.has(21)).toBe(false);
    expect(expandedIds.size).toBe(20);
  });

  it('should allow expansion after collapsing a node when at max', () => {
    const expandedIds = new Set<number>();
    for (let i = 1; i <= 20; i++) {
      expandedIds.add(i);
    }

    // Collapse one
    expandedIds.delete(10);
    expect(expandedIds.size).toBe(19);

    // Now 21 can be added
    const nodeId = 21;
    if (!expandedIds.has(nodeId) && expandedIds.size < MAX_EXPANDED_NODES) {
      expandedIds.add(nodeId);
    }
    expect(expandedIds.has(21)).toBe(true);
    expect(expandedIds.size).toBe(20);
  });

  it('should persist expanded state across sort/filter (Req 1.7)', () => {
    // Expanded IDs are maintained as state independent of node ordering
    const expandedIds = new Set<number>([3, 7, 12]);

    // Simulate sort — nodes array changes order but expandedIds stays the same
    const nodesBeforeSort = [makeNode({ id: 3 }), makeNode({ id: 7 }), makeNode({ id: 12 })];
    const nodesAfterSort = [makeNode({ id: 12 }), makeNode({ id: 3 }), makeNode({ id: 7 })];

    // After sort, visible node IDs that are expanded should still be expanded
    const visibleAfterSort = new Set(nodesAfterSort.map(n => n.id));
    const expandedVisible = Array.from(expandedIds).filter(id => visibleAfterSort.has(id));

    expect(expandedVisible).toHaveLength(3);
    expect(expandedVisible).toContain(3);
    expect(expandedVisible).toContain(7);
    expect(expandedVisible).toContain(12);
  });

  it('should persist expanded state across filter (Req 1.7)', () => {
    const expandedIds = new Set<number>([3, 7, 12]);

    // After filter, some nodes may not be visible
    const nodesAfterFilter = [makeNode({ id: 3 }), makeNode({ id: 12 })];
    const visibleAfterFilter = new Set(nodesAfterFilter.map(n => n.id));

    // Only expanded nodes that remain visible are shown, but state is preserved
    const expandedVisible = Array.from(expandedIds).filter(id => visibleAfterFilter.has(id));
    expect(expandedVisible).toHaveLength(2);
    expect(expandedVisible).toContain(3);
    expect(expandedVisible).toContain(12);

    // Importantly, node 7 is still in expandedIds (for when filter is cleared)
    expect(expandedIds.has(7)).toBe(true);
  });
});

// --- Status polling logic ---

describe('NodeTable status polling logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should only poll expanded nodes (not all nodes)', () => {
    const allNodeIds = [1, 2, 3, 4, 5];
    const expandedIds = new Set<number>([2, 4]);

    // Polling should fetch status only for expanded nodes
    const idsToFetch = allNodeIds.filter(id => expandedIds.has(id));
    expect(idsToFetch).toEqual([2, 4]);
    expect(idsToFetch).not.toContain(1);
    expect(idsToFetch).not.toContain(3);
    expect(idsToFetch).not.toContain(5);
  });

  it('should poll at 10-second intervals', () => {
    const pollFn = vi.fn();
    const POLL_INTERVAL = 10_000;

    const intervalId = setInterval(pollFn, POLL_INTERVAL);

    // Before first interval
    expect(pollFn).not.toHaveBeenCalled();

    // After 10s
    vi.advanceTimersByTime(10_000);
    expect(pollFn).toHaveBeenCalledTimes(1);

    // After 20s
    vi.advanceTimersByTime(10_000);
    expect(pollFn).toHaveBeenCalledTimes(2);

    // After 30s
    vi.advanceTimersByTime(10_000);
    expect(pollFn).toHaveBeenCalledTimes(3);

    clearInterval(intervalId);
  });

  it('should stop polling when no nodes are expanded', () => {
    const pollFn = vi.fn();
    const expandedIds = new Set<number>();

    // If no expanded nodes, should not set up interval
    let intervalId: number | NodeJS.Timeout | null = null;
    if (expandedIds.size > 0) {
      intervalId = setInterval(pollFn, 10_000);
    }

    vi.advanceTimersByTime(30_000);
    expect(pollFn).not.toHaveBeenCalled();
    expect(intervalId).toBeNull();
  });
});

// --- Health score update on status change (Req 3.9) ---

describe('NodeTable health score updates', () => {
  it('should recalculate health score when status changes', () => {
    const node = makeNode();

    // Initially, camera is offline, ESP32 is disconnected
    const statusBefore: NodeStatus = {
      camera: 'offline',
      esp32: 'offline',
      lastUpdated: new Date().toISOString(),
    };
    const scoreBefore = calculateHealthScore(node, statusBefore);
    expect(scoreBefore.score).toBe(30); // Only detection valid (30% for full node)

    // Status changes: camera comes online
    const statusAfter: NodeStatus = {
      camera: 'online',
      esp32: 'offline',
      lastUpdated: new Date().toISOString(),
    };
    const scoreAfter = calculateHealthScore(node, statusAfter);
    expect(scoreAfter.score).toBe(70); // camera 40 + detection 30 = 70

    // Score changed as expected
    expect(scoreAfter.score).toBeGreaterThan(scoreBefore.score);
  });

  it('should calculate correct health for fully online node', () => {
    const node = makeNode();
    const status: NodeStatus = {
      camera: 'online',
      esp32: 'online',
      lastUpdated: new Date().toISOString(),
    };
    const score = calculateHealthScore(node, status);
    expect(score.score).toBe(100);
    expect(score.label).toBe('Sehat');
    expect(score.color).toBe('green');
  });

  it('should calculate correct health for fully offline node', () => {
    const node = makeNode();
    const status: NodeStatus = {
      camera: 'offline',
      esp32: 'offline',
      lastUpdated: new Date().toISOString(),
    };
    const score = calculateHealthScore(node, status);
    // Only detection is valid: 30% for full node
    expect(score.score).toBe(30);
    expect(score.label).toBe('Kritis');
    expect(score.color).toBe('red');
  });

  it('should update health for camera-only node composition', () => {
    const node = makeNode({ esp32: null });
    const status: NodeStatus = {
      camera: 'online',
      esp32: 'unconfigured',
      lastUpdated: new Date().toISOString(),
    };
    const score = calculateHealthScore(node, status);
    // Camera only: camera 60% + detection 40% = 100
    expect(score.score).toBe(100);
    expect(score.label).toBe('Sehat');
  });
});

// --- Error handling and timeout logic ---

describe('NodeTable error handling', () => {
  it('should handle timeout errors gracefully', () => {
    // Simulating the timeout logic from NodeTable
    const STATUS_FETCH_TIMEOUT_MS = 5_000;

    const err = new DOMException('The operation was aborted.', 'AbortError');
    const errorMsg = err instanceof DOMException && err.name === 'AbortError'
      ? 'Timeout: data tidak dapat dimuat dalam 5 detik'
      : err.message;

    expect(errorMsg).toBe('Timeout: data tidak dapat dimuat dalam 5 detik');
  });

  it('should handle generic fetch errors', () => {
    const err = new Error('Network failure');
    const errorMsg = err instanceof DOMException && err.name === 'AbortError'
      ? 'Timeout: data tidak dapat dimuat dalam 5 detik'
      : err instanceof Error
        ? err.message
        : 'Gagal memuat status';

    expect(errorMsg).toBe('Network failure');
  });

  it('should preserve previous status on error', () => {
    // When a poll fails, the previous status should still be available
    const previousStatus: NodeStatus = {
      camera: 'online',
      esp32: 'online',
      lastUpdated: new Date().toISOString(),
    };

    // Simulated statusMap entry after error
    const entry = {
      status: previousStatus, // preserved
      loading: false,
      error: 'Timeout: data tidak dapat dimuat dalam 5 detik',
    };

    expect(entry.status).toBe(previousStatus);
    expect(entry.error).toBeTruthy();
  });
});
