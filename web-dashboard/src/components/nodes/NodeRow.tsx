'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Pencil, Copy, Power, Trash2, ChevronRight } from 'lucide-react';
import HealthScoreIndicator from './HealthScoreIndicator';
import CompositionIcon from './CompositionIcon';
import NodeTreeView, { deriveComposition } from './NodeTreeView';
import { PermissionGate } from '@/components/access/PermissionGate';
import {
  NodeData,
  NodeStatus,
  NodeComposition,
  ConnectionTestResponse,
} from '@/lib/node-types';

export interface NodeRowProps {
  node: NodeData;
  status: NodeStatus | null;
  healthScore: number;
  isExpanded: boolean;
  onToggleExpand: (nodeId: number) => void;
  onEdit: (node: NodeData) => void;
  onDuplicate: (node: NodeData) => void;
  onToggleEnabled: (node: NodeData) => void;
  onDelete: (nodeId: number) => void;
  onTestConnection: (type: 'camera' | 'mqtt') => Promise<ConnectionTestResponse>;
  onViewLive: (nodeId: number) => void;
}

/**
 * NodeRow — Renders a single table row for a node with expand/collapse capability.
 *
 * Features:
 * - Displays HealthScoreIndicator, CompositionIcon, sector name, PIC, and action buttons
 * - Click on row to expand/collapse the NodeTreeView below
 * - Supports multiple expanded nodes (non-accordion, max 20 enforced by parent)
 * - 200ms animation transition guard to prevent double-click issues
 * - CSS expand/collapse animation with slide-down + fade-in
 *
 * Requirements: 1.1, 1.2, 6.4
 */
export default function NodeRow({
  node,
  status,
  healthScore,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDuplicate,
  onToggleEnabled,
  onDelete,
  onTestConnection,
  onViewLive,
}: NodeRowProps) {
  const [animationLocked, setAnimationLocked] = useState(false);
  const lockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRowRef = useRef<HTMLTableRowElement>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const prevExpandedRef = useRef(isExpanded);
  const composition: NodeComposition = deriveComposition(node);

  /**
   * Focus management (Req 8.7):
   * - On expand: move focus to first treeitem within the tree container
   * - On collapse: return focus to trigger row
   * Applies on mobile viewports (<768px) with a small delay after animation.
   */
  useEffect(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    if (isExpanded && !prevExpandedRef.current) {
      // Tree just opened — move focus to first treeitem
      const timer = setTimeout(() => {
        if (treeContainerRef.current) {
          const firstTreeItem = treeContainerRef.current.querySelector<HTMLElement>('[role="treeitem"]');
          if (firstTreeItem) {
            firstTreeItem.focus();
          }
        }
      }, isMobile ? 100 : 220); // 100ms on mobile per req 8.7, 220ms on desktop (after animation)
      prevExpandedRef.current = isExpanded;
      return () => clearTimeout(timer);
    } else if (!isExpanded && prevExpandedRef.current) {
      // Tree just closed — return focus to trigger row
      const timer = setTimeout(() => {
        if (triggerRowRef.current) {
          triggerRowRef.current.focus();
        }
      }, isMobile ? 100 : 220);
      prevExpandedRef.current = isExpanded;
      return () => clearTimeout(timer);
    }

    prevExpandedRef.current = isExpanded;
  }, [isExpanded]);

  /**
   * Handle row click to toggle expand/collapse with animation lock.
   * The 200ms guard prevents double-click during transition (Req 6.4).
   * If the animation doesn't complete within 500ms, force-unlock.
   */
  const handleToggleExpand = useCallback(() => {
    if (animationLocked) return;

    setAnimationLocked(true);
    onToggleExpand(node.id);

    // Clear any previous timeout
    if (lockTimeoutRef.current) {
      clearTimeout(lockTimeoutRef.current);
    }

    // Unlock after 200ms transition guard
    lockTimeoutRef.current = setTimeout(() => {
      setAnimationLocked(false);
      lockTimeoutRef.current = null;
    }, 200);
  }, [animationLocked, node.id, onToggleExpand]);

  /**
   * Stop click propagation on action buttons so they don't trigger row expand.
   */
  const stopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <>
      {/* Animations defined in src/styles/node-tree-animations.css */}

      {/* Main row */}
      <tr
        ref={triggerRowRef}
        className={`node-row ${isExpanded ? 'node-row--expanded' : ''}`}
        onClick={handleToggleExpand}
        role="button"
        aria-expanded={isExpanded}
        aria-label={`Node ${node.sektorName}, klik untuk ${isExpanded ? 'tutup' : 'buka'} detail`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggleExpand();
          }
        }}
      >
        {/* Expand chevron */}
        <td className="px-3 py-3 text-center w-10">
          <span
            className={`node-row__chevron ${isExpanded ? 'node-row__chevron--expanded' : ''}`}
            aria-hidden="true"
          >
            <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
          </span>
        </td>

        {/* Health Score */}
        <td className="px-3 py-3">
          <HealthScoreIndicator score={healthScore} size={36} />
        </td>

        {/* Composition Icon */}
        <td className="px-3 py-3">
          <CompositionIcon composition={composition} size={18} />
        </td>

        {/* Sector Name */}
        <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
          <div>
            <span className="text-xs font-bold px-2 py-0.5 rounded mr-2" style={{ background: 'var(--accent)', color: 'white' }}>
              {node.sektorId}
            </span>
            {node.sektorName}
          </div>
        </td>

        {/* PIC */}
        <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
          {node.picName}
        </td>

        {/* Actions */}
        <td className="px-4 py-3" onClick={stopPropagation}>
          <div className="flex items-center justify-center gap-1">
            <PermissionGate permission="node:update">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(node); }}
                className="p-2 rounded-lg hover:bg-blue-50 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Edit"
                style={{ color: 'var(--accent)' }}
                aria-label={`Edit node ${node.sektorName}`}
              >
                <Pencil size={14} />
              </button>
            </PermissionGate>
            <PermissionGate permission="node:create">
              <button
                onClick={(e) => { e.stopPropagation(); onDuplicate(node); }}
                className="p-2 rounded-lg hover:bg-blue-50 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Duplikat"
                style={{ color: 'var(--text-secondary)' }}
                aria-label={`Duplikat node ${node.sektorName}`}
              >
                <Copy size={14} />
              </button>
            </PermissionGate>
            <PermissionGate permission="node:toggle">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleEnabled(node); }}
                className="p-2 rounded-lg hover:bg-blue-50 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                title={node.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                style={{ color: node.enabled ? 'var(--orange)' : 'var(--text-muted)' }}
                aria-label={`${node.enabled ? 'Nonaktifkan' : 'Aktifkan'} node ${node.sektorName}`}
              >
                <Power size={14} />
              </button>
            </PermissionGate>
            <PermissionGate permission="node:delete">
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
                className="btn-danger p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Hapus"
                aria-label={`Hapus node ${node.sektorName}`}
              >
                <Trash2 size={14} />
              </button>
            </PermissionGate>
          </div>
        </td>
      </tr>

      {/* Expanded tree view row */}
      {isExpanded && (
        <tr>
          <td colSpan={6} style={{ padding: 0, border: 'none' }}>
            <div className="node-row__tree-container" ref={treeContainerRef}>
              <div
                style={{
                  padding: '8px 16px 16px 48px',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--bg-secondary, #f9fafb)',
                }}
                className="node-row__tree-content"
              >
                <NodeTreeView
                  node={node}
                  status={status}
                  onTestConnection={onTestConnection}
                  onViewLive={onViewLive}
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
