'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import NodeRow from './NodeRow';
import { calculateHealthScore } from '@/lib/health-score';
import { useApiFetch } from '@/hooks/use-csrf-token';
import type {
  NodeData,
  NodeStatus,
  HealthScore,
  ConnectionTestResponse,
} from '@/lib/node-types';

/**
 * Maximum number of nodes that can be expanded simultaneously.
 * Beyond this limit, new expand requests are rejected.
 * Requirement 1.1: max 20 expanded nodes
 */
const MAX_EXPANDED_NODES = 20;

/**
 * Status polling interval in milliseconds.
 * Only polls for expanded nodes to minimize API load.
 * Design doc: "polling via setInterval (10s)"
 */
const STATUS_POLL_INTERVAL_MS = 10_000;

/**
 * Timeout for fetching status of a single node (5s).
 * Requirement 1.8: 5s timeout per section
 */
const STATUS_FETCH_TIMEOUT_MS = 5_000;

export interface NodeTableProps {
  nodes: NodeData[];
  onEdit: (node: NodeData) => void;
  onDuplicate: (node: NodeData) => void;
  onToggleEnabled: (node: NodeData) => void;
  onDelete: (nodeId: number) => void;
  onViewLive: (nodeId: number) => void;
}

interface NodeStatusEntry {
  status: NodeStatus | null;
  loading: boolean;
  error: string | null;
}

/**
 * NodeTable — Manages the expandable node table with status polling and health scores.
 *
 * Features:
 * - Manages expanded node IDs as Set<number> (persists across sort/filter)
 * - Max 20 expanded nodes; rejects expansion beyond limit
 * - Polls GET /api/nodes/[id]/status every 10s for expanded nodes only
 * - Calculates health scores from status and updates within 5s of status change
 * - Handles loading/error states with 5s timeout and retry button
 *
 * Requirements: 1.7, 1.8, 3.9
 */
export default function NodeTable({
  nodes,
  onEdit,
  onDuplicate,
  onToggleEnabled,
  onDelete,
  onViewLive,
}: NodeTableProps) {
  // CSRF-aware fetch wrapper for mutating requests (Bug 1 fix).
  // GET requests in this file (e.g. /api/nodes/{id}/status) intentionally
  // continue to use raw `fetch` because middleware exempts GET from CSRF.
  const apiFetch = useApiFetch();

  // Expanded node IDs — persists across sort/filter (Req 1.7)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Status map: nodeId -> { status, loading, error }
  const [statusMap, setStatusMap] = useState<Map<number, NodeStatusEntry>>(new Map());

  // Health score cache: nodeId -> HealthScore
  const [healthScores, setHealthScores] = useState<Map<number, HealthScore>>(new Map());

  // Ref to track the polling interval
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref to track mounted state
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  /**
   * Toggle expand/collapse for a node.
   * Enforces max 20 expanded nodes limit.
   */
  const handleToggleExpand = useCallback((nodeId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        // Reject if at max limit
        if (next.size >= MAX_EXPANDED_NODES) {
          return prev;
        }
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  /**
   * Fetch status for a single node with timeout.
   * Returns NodeStatus or throws on timeout/error.
   */
  const fetchNodeStatus = useCallback(async (nodeId: number): Promise<NodeStatus> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STATUS_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(`/api/nodes/${nodeId}/status`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Status ${res.status}: ${res.statusText}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  /**
   * Fetch status for a specific expanded node and update state.
   * Used for initial fetch on expand and retry.
   */
  const fetchStatusForNode = useCallback(async (nodeId: number) => {
    // Set loading state
    setStatusMap((prev) => {
      const next = new Map(prev);
      next.set(nodeId, { status: prev.get(nodeId)?.status ?? null, loading: true, error: null });
      return next;
    });

    try {
      const status = await fetchNodeStatus(nodeId);
      if (!isMountedRef.current) return;

      setStatusMap((prev) => {
        const next = new Map(prev);
        next.set(nodeId, { status, loading: false, error: null });
        return next;
      });
    } catch (err: unknown) {
      if (!isMountedRef.current) return;

      const errorMsg = err instanceof DOMException && err.name === 'AbortError'
        ? 'Timeout: data tidak dapat dimuat dalam 5 detik'
        : err instanceof Error
          ? err.message
          : 'Gagal memuat status';

      setStatusMap((prev) => {
        const next = new Map(prev);
        next.set(nodeId, { status: prev.get(nodeId)?.status ?? null, loading: false, error: errorMsg });
        return next;
      });
    }
  }, [fetchNodeStatus]);

  /**
   * Poll all expanded nodes for status updates.
   * Called on interval and initially when expanded set changes.
   */
  const pollExpandedStatuses = useCallback(async () => {
    const idsToFetch = Array.from(expandedIds);
    if (idsToFetch.length === 0) return;

    const results = await Promise.allSettled(
      idsToFetch.map(async (nodeId) => {
        try {
          const status = await fetchNodeStatus(nodeId);
          return { nodeId, status, error: null };
        } catch (err: unknown) {
          const errorMsg = err instanceof DOMException && err.name === 'AbortError'
            ? 'Timeout: data tidak dapat dimuat dalam 5 detik'
            : err instanceof Error
              ? err.message
              : 'Gagal memuat status';
          return { nodeId, status: null, error: errorMsg };
        }
      })
    );

    if (!isMountedRef.current) return;

    setStatusMap((prev) => {
      const next = new Map(prev);
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { nodeId, status, error } = result.value;
          if (status) {
            next.set(nodeId, { status, loading: false, error: null });
          } else if (error) {
            // Keep previous status if available, just mark error
            const existing = next.get(nodeId);
            next.set(nodeId, { status: existing?.status ?? null, loading: false, error });
          }
        }
      }
      return next;
    });
  }, [expandedIds, fetchNodeStatus]);

  /**
   * When expanded nodes change:
   * - Fetch status for newly expanded nodes
   * - Clean up status for collapsed nodes
   * - Set up/reset polling interval
   */
  useEffect(() => {
    // Fetch status for any expanded nodes that don't have data yet
    for (const nodeId of expandedIds) {
      const existing = statusMap.get(nodeId);
      if (!existing || (!existing.status && !existing.loading)) {
        fetchStatusForNode(nodeId);
      }
    }

    // Set up polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    if (expandedIds.size > 0) {
      pollingIntervalRef.current = setInterval(pollExpandedStatuses, STATUS_POLL_INTERVAL_MS);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedIds]);

  /**
   * Recalculate health scores when status changes (Req 3.9: within 5s).
   * Since polling runs every 10s and status updates trigger re-render,
   * health scores are recalculated immediately on status map change.
   */
  useEffect(() => {
    const newScores = new Map<number, HealthScore>();
    for (const node of nodes) {
      const entry = statusMap.get(node.id);
      const nodeStatus = entry?.status ?? null;
      newScores.set(node.id, calculateHealthScore(node, nodeStatus));
    }
    setHealthScores(newScores);
  }, [nodes, statusMap]);

  /**
   * Handle retry for a node that failed to load status.
   */
  const handleRetryStatus = useCallback((nodeId: number) => {
    fetchStatusForNode(nodeId);
  }, [fetchStatusForNode]);

  /**
   * Handle connection test for a node.
   */
  const handleTestConnection = useCallback(
    (nodeId: number) =>
      async (type: 'camera' | 'mqtt'): Promise<ConnectionTestResponse> => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) {
          return { status: 'failed', error: 'Node tidak ditemukan' };
        }

        const body: Record<string, unknown> = { type };
        if (type === 'camera' && node.camera) {
          body.url = node.camera.url;
        } else if (type === 'mqtt' && node.esp32) {
          body.broker = node.esp32.mqttBroker;
          body.port = 8883;
          body.username = '';
          body.password = '';
        }

        try {
          const res = await apiFetch('/api/nodes/test-connection', {
            method: 'POST',
            body: JSON.stringify(body),
          });
          return await res.json();
        } catch {
          return { status: 'failed', error: 'Gagal menghubungi server' };
        }
      },
    [nodes, apiFetch]
  );

  /**
   * Visible node IDs for determining which expanded nodes to show.
   * Expanded state persists across sort/filter (Req 1.7).
   */
  const visibleNodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="px-3 py-3 w-10"></th>
            <th className="px-3 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Health
            </th>
            <th className="px-3 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Tipe
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Sektor
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              PIC
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Aksi
            </th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => {
            const entry = statusMap.get(node.id);
            const nodeStatus = entry?.status ?? null;
            const healthScore = healthScores.get(node.id)?.score ?? 0;
            const isExpanded = expandedIds.has(node.id) && visibleNodeIds.has(node.id);

            return (
              <NodeRow
                key={node.id}
                node={node}
                status={nodeStatus}
                healthScore={healthScore}
                isExpanded={isExpanded}
                onToggleExpand={handleToggleExpand}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onToggleEnabled={onToggleEnabled}
                onDelete={onDelete}
                onTestConnection={handleTestConnection(node.id)}
                onViewLive={onViewLive}
              />
            );
          })}
        </tbody>
      </table>

      {/* Error overlay for nodes with status fetch errors */}
      {Array.from(expandedIds).map((nodeId) => {
        const entry = statusMap.get(nodeId);
        if (!entry?.error || !visibleNodeIds.has(nodeId)) return null;
        return (
          <div
            key={`error-${nodeId}`}
            className="mx-4 mb-2 p-3 rounded-lg flex items-center justify-between text-sm"
            style={{
              background: 'var(--bg-warning, #fef3cd)',
              border: '1px solid var(--border-warning, #ffc107)',
              color: 'var(--text-warning, #856404)',
            }}
          >
            <span>
              Node #{nodeId}: {entry.error}
            </span>
            <button
              onClick={() => handleRetryStatus(nodeId)}
              className="px-3 py-1 rounded text-xs font-semibold min-h-[32px]"
              style={{
                background: 'var(--accent)',
                color: 'white',
              }}
            >
              Retry
            </button>
          </div>
        );
      })}
    </div>
  );
}
