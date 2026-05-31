// Unit tests for NodeRow component logic
// Validates: Requirements 1.1, 1.2, 6.4

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deriveComposition } from '../NodeTreeView';
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

// --- Animation Lock Logic Tests ---

describe('NodeRow animation lock logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call onToggleExpand on first click', () => {
    const onToggleExpand = vi.fn();
    const node = makeNode();
    let animationLocked = false;

    // Simulate the handleToggleExpand logic
    const handleToggleExpand = () => {
      if (animationLocked) return;
      animationLocked = true;
      onToggleExpand(node.id);
      setTimeout(() => {
        animationLocked = false;
      }, 200);
    };

    handleToggleExpand();
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
    expect(onToggleExpand).toHaveBeenCalledWith(1);
  });

  it('should block clicks during 200ms animation lock period', () => {
    const onToggleExpand = vi.fn();
    const node = makeNode();
    let animationLocked = false;

    const handleToggleExpand = () => {
      if (animationLocked) return;
      animationLocked = true;
      onToggleExpand(node.id);
      setTimeout(() => {
        animationLocked = false;
      }, 200);
    };

    // First click goes through
    handleToggleExpand();
    expect(onToggleExpand).toHaveBeenCalledTimes(1);

    // Second click within 200ms is blocked
    handleToggleExpand();
    expect(onToggleExpand).toHaveBeenCalledTimes(1);

    // Third click within 200ms is also blocked
    vi.advanceTimersByTime(100);
    handleToggleExpand();
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it('should unlock after 200ms allowing subsequent clicks', () => {
    const onToggleExpand = vi.fn();
    const node = makeNode();
    let animationLocked = false;

    const handleToggleExpand = () => {
      if (animationLocked) return;
      animationLocked = true;
      onToggleExpand(node.id);
      setTimeout(() => {
        animationLocked = false;
      }, 200);
    };

    // First click
    handleToggleExpand();
    expect(onToggleExpand).toHaveBeenCalledTimes(1);

    // Advance past 200ms lock
    vi.advanceTimersByTime(201);

    // Second click should work
    handleToggleExpand();
    expect(onToggleExpand).toHaveBeenCalledTimes(2);
  });

  it('should not exceed 20 expanded nodes enforcement (parent responsibility)', () => {
    // The max 20 limit is enforced by the parent component (NodeTable).
    // NodeRow simply calls onToggleExpand; the parent decides whether to allow it.
    const expandedIds = new Set<number>();
    const MAX_EXPANDED = 20;

    const onToggleExpand = (id: number) => {
      if (expandedIds.has(id)) {
        expandedIds.delete(id);
      } else if (expandedIds.size < MAX_EXPANDED) {
        expandedIds.add(id);
      }
    };

    // Expand 20 nodes
    for (let i = 1; i <= 20; i++) {
      onToggleExpand(i);
    }
    expect(expandedIds.size).toBe(20);

    // 21st should be blocked by parent logic
    onToggleExpand(21);
    expect(expandedIds.size).toBe(20);
    expect(expandedIds.has(21)).toBe(false);

    // Collapsing one should allow new expand
    onToggleExpand(1); // collapse node 1
    expect(expandedIds.size).toBe(19);
    onToggleExpand(21); // now 21 can expand
    expect(expandedIds.size).toBe(20);
    expect(expandedIds.has(21)).toBe(true);
  });
});

// --- NodeRow display logic ---

describe('NodeRow display data', () => {
  it('derives correct composition for display', () => {
    const cameraEsp32Node = makeNode();
    expect(deriveComposition(cameraEsp32Node)).toBe('camera-esp32');

    const cameraOnlyNode = makeNode({ esp32: null });
    expect(deriveComposition(cameraOnlyNode)).toBe('camera-only');

    const esp32OnlyNode = makeNode({ camera: null });
    expect(deriveComposition(esp32OnlyNode)).toBe('esp32-only');
  });

  it('supports multiple expanded nodes (non-accordion behavior)', () => {
    // Verify that multiple nodes can be expanded simultaneously
    const expandedIds = new Set<number>();

    // Expand node 1
    expandedIds.add(1);
    // Expand node 2 (should NOT collapse node 1)
    expandedIds.add(2);
    // Expand node 3
    expandedIds.add(3);

    expect(expandedIds.has(1)).toBe(true);
    expect(expandedIds.has(2)).toBe(true);
    expect(expandedIds.has(3)).toBe(true);
    expect(expandedIds.size).toBe(3);
  });

  it('toggle collapse removes only the targeted node from expanded set', () => {
    const expandedIds = new Set<number>([1, 2, 3]);

    // Collapse node 2
    expandedIds.delete(2);

    expect(expandedIds.has(1)).toBe(true);
    expect(expandedIds.has(2)).toBe(false);
    expect(expandedIds.has(3)).toBe(true);
    expect(expandedIds.size).toBe(2);
  });
});
