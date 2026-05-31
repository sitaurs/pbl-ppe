'use client';

import { useRef, useState, useCallback, useEffect, KeyboardEvent } from 'react';
import TreeSection from './TreeSection';
import TreeItem from './TreeItem';
import QuickActionButton from './QuickActionButton';
import StatusIndicator from './StatusIndicator';
import {
  NodeTreeViewProps,
  NodeComposition,
  NodeData,
  NodeStatus,
} from '@/lib/node-types';

/**
 * NodeTreeView — Container component that renders the full tree view
 * for a node's composition (camera, ESP32, detection, sector).
 *
 * Features:
 * - Conditional section rendering based on node composition
 * - role="tree" container with aria-selected tracking
 * - Full keyboard navigation (Arrow Up/Down, Right/Left, Enter/Space)
 * - Quick action buttons for connection testing and live preview
 *
 * Requirements: 1.3, 1.4, 1.5, 8.3, 8.4
 */

/** Derive composition type from node data */
export function deriveComposition(node: NodeData): NodeComposition {
  const hasCamera = node.camera !== null;
  const hasEsp32 = node.esp32 !== null;

  if (hasCamera && hasEsp32) return 'camera-esp32';
  if (hasCamera && !hasEsp32) return 'camera-only';
  return 'esp32-only';
}

export default function NodeTreeView({
  node,
  status,
  onTestConnection,
  onViewLive,
}: NodeTreeViewProps) {
  const treeRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const composition = deriveComposition(node);

  // Determine which sections to show
  const showCamera = composition === 'camera-only' || composition === 'camera-esp32';
  const showEsp32 = composition === 'esp32-only' || composition === 'camera-esp32';
  const showDetection = showCamera; // Detection shown when camera is present
  const showSector = true; // Sector always shown

  /**
   * Get all focusable treeitem elements within the tree container.
   */
  const getFocusableItems = useCallback((): HTMLElement[] => {
    if (!treeRef.current) return [];
    return Array.from(
      treeRef.current.querySelectorAll<HTMLElement>('[role="treeitem"]')
    );
  }, []);

  /**
   * Sync aria-selected attribute on tree items when selectedIndex changes.
   * Only the currently selected item has aria-selected="true".
   */
  useEffect(() => {
    const items = getFocusableItems();
    items.forEach((item, idx) => {
      item.setAttribute('aria-selected', String(idx === selectedIndex));
    });
  }, [selectedIndex, getFocusableItems]);

  /**
   * Keyboard navigation handler implementing WAI-ARIA TreeView pattern.
   * - Arrow Up/Down: Navigate between sibling tree items
   * - Arrow Right: Expand collapsed section or move to first child
   * - Arrow Left: Collapse expanded section or move to parent
   * - Enter/Space: Toggle expand/collapse on active item
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const items = getFocusableItems();
      if (items.length === 0) return;

      const currentElement = document.activeElement as HTMLElement;
      const currentIndex = items.indexOf(currentElement);

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : currentIndex;
          items[nextIndex]?.focus();
          setSelectedIndex(nextIndex);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : 0;
          items[prevIndex]?.focus();
          setSelectedIndex(prevIndex);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const isExpanded = currentElement?.getAttribute('aria-expanded');
          if (isExpanded === 'false') {
            // Expand: simulate click/Enter on the current item
            currentElement?.click();
          } else if (isExpanded === 'true') {
            // Move to first child
            const nextIndex = currentIndex + 1;
            if (nextIndex < items.length) {
              items[nextIndex]?.focus();
              setSelectedIndex(nextIndex);
            }
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const expanded = currentElement?.getAttribute('aria-expanded');
          if (expanded === 'true') {
            // Collapse: simulate click on the current item
            currentElement?.click();
          } else {
            // Move to parent: find the previous item with a lower aria-level
            const currentLevel = parseInt(
              currentElement?.getAttribute('aria-level') || '1',
              10
            );
            for (let i = currentIndex - 1; i >= 0; i--) {
              const itemLevel = parseInt(
                items[i]?.getAttribute('aria-level') || '1',
                10
              );
              if (itemLevel < currentLevel) {
                items[i]?.focus();
                setSelectedIndex(i);
                break;
              }
            }
          }
          break;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          const hasExpanded = currentElement?.getAttribute('aria-expanded');
          if (hasExpanded !== null) {
            currentElement?.click();
          }
          break;
        }
        case 'Home': {
          e.preventDefault();
          items[0]?.focus();
          setSelectedIndex(0);
          break;
        }
        case 'End': {
          e.preventDefault();
          const last = items.length - 1;
          items[last]?.focus();
          setSelectedIndex(last);
          break;
        }
      }
    },
    [getFocusableItems]
  );

  // Quick action handlers
  const handleTestCamera = useCallback(async () => {
    const result = await onTestConnection('camera');
    return {
      success: result.status === 'reachable',
      message:
        result.status === 'reachable'
          ? 'Kamera terjangkau'
          : result.error || 'Kamera tidak terjangkau',
      possibleCauses:
        result.status !== 'reachable'
          ? ['URL RTSP salah', 'Kamera mati atau tidak terhubung ke jaringan', 'Firewall memblokir koneksi']
          : undefined,
    };
  }, [onTestConnection]);

  const handleTestMqtt = useCallback(async () => {
    const result = await onTestConnection('mqtt');
    return {
      success: result.status === 'connected',
      message:
        result.status === 'connected'
          ? `MQTT terhubung (${result.latency}ms)`
          : result.error || 'MQTT gagal terhubung',
      possibleCauses:
        result.status !== 'connected'
          ? ['Broker address salah', 'Kredensial tidak valid', 'Broker tidak aktif']
          : undefined,
    };
  }, [onTestConnection]);

  const handleViewLive = useCallback(async () => {
    onViewLive(node.id);
    return { success: true, message: 'Membuka live preview' };
  }, [onViewLive, node.id]);

  // Determine quick action visibility
  const showTestCamera = showCamera && node.camera && node.camera.url.length > 0;
  const showLiveView = showCamera && status?.camera === 'online';
  const showTestMqtt =
    showEsp32 &&
    node.esp32 &&
    node.esp32.mqttBroker.length > 0 &&
    node.esp32.mqttTopic.length > 0;

  return (
    <>
      <style>{`
        .node-tree-view {
          padding: 8px 0;
          outline: none;
        }
        .node-tree-view:focus-visible {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
          border-radius: 4px;
        }
        .node-tree-quick-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 4px 0 4px 48px;
        }
        @media (max-width: 767px) {
          .node-tree-quick-actions {
            flex-direction: column;
            padding-left: 32px;
          }
        }
      `}</style>
      <div
        ref={treeRef}
        className="node-tree-view"
        role="tree"
        aria-label={`Detail node ${node.sektorName}`}
        onKeyDown={handleKeyDown}
      >
        {/* Camera Section */}
        {showCamera && node.camera && (
          <TreeSection
            label="Kamera"
            icon={<CameraIcon />}
            status={status?.camera ?? 'unconfigured'}
            lastUpdated={status?.lastUpdated}
            level={1}
            defaultExpanded={true}
          >
            <TreeItem
              label="URL"
              value={node.camera.url}
              level={2}
            />
            <TreeItem
              label="Resolution"
              value={node.camera.resolution}
              level={2}
            />
            <TreeItem
              label="Protocol"
              value={node.camera.protocol.toUpperCase()}
              level={2}
              isLast={!showTestCamera && !showLiveView}
            />
            {/* Quick Actions for Camera */}
            {(showTestCamera || showLiveView) && (
              <div className="node-tree-quick-actions" role="group" aria-label="Aksi kamera">
                {showTestCamera && (
                  <QuickActionButton
                    label="Test Koneksi"
                    onClick={handleTestCamera}
                  />
                )}
                {showLiveView && (
                  <QuickActionButton
                    label="Lihat Live"
                    onClick={handleViewLive}
                  />
                )}
              </div>
            )}
          </TreeSection>
        )}

        {/* ESP32 Section */}
        {showEsp32 && node.esp32 && (
          <TreeSection
            label="ESP32"
            icon={<ChipIcon />}
            status={status?.esp32 ?? 'unconfigured'}
            lastUpdated={status?.lastUpdated}
            level={1}
            defaultExpanded={true}
          >
            <TreeItem
              label="Broker"
              value={node.esp32.mqttBroker || '—'}
              level={2}
            />
            <TreeItem
              label="Topic"
              value={node.esp32.mqttTopic || '—'}
              level={2}
              isLast={!showTestMqtt}
            />
            {/* Quick Action for MQTT */}
            {showTestMqtt && (
              <div className="node-tree-quick-actions" role="group" aria-label="Aksi ESP32">
                <QuickActionButton
                  label="Test MQTT"
                  onClick={handleTestMqtt}
                />
              </div>
            )}
          </TreeSection>
        )}

        {/* Detection Section (shown when camera is present) */}
        {showDetection && node.detection && (
          <TreeSection
            label="Deteksi"
            icon={<DetectionIcon />}
            level={1}
            defaultExpanded={true}
          >
            <TreeItem
              label="Mode"
              value={node.detection.mode === 'realtime' ? 'Realtime' : node.detection.mode === 'scheduled' ? 'Scheduled' : 'Disabled'}
              level={2}
            />
            <TreeItem
              label="Confidence"
              value={node.detection.confidenceThreshold.toFixed(2)}
              level={2}
              isLast={true}
            />
          </TreeSection>
        )}

        {/* Sector Section (always shown) */}
        {showSector && (
          <TreeSection
            label="Sektor"
            icon={<SectorIcon />}
            level={1}
            defaultExpanded={true}
          >
            <TreeItem
              label="ID"
              value={node.sektorId}
              level={2}
            />
            <TreeItem
              label="PIC"
              value={node.picName}
              level={2}
            />
            <TreeItem
              label="WA"
              value={node.picPhone}
              level={2}
              isLast={true}
            />
          </TreeSection>
        )}
      </div>
    </>
  );
}

// --- Section Icons (inline SVG for simplicity) ---

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="4" width="9" height="8" rx="1" stroke="#6b7280" strokeWidth="1.5" />
      <path d="M11 6.5L14 5V11L11 9.5" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1" stroke="#6b7280" strokeWidth="1.5" />
      <line x1="6" y1="2" x2="6" y2="4" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10" y1="2" x2="10" y2="4" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="12" x2="6" y2="14" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10" y1="12" x2="10" y2="14" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="6" x2="4" y2="6" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="10" x2="4" y2="10" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="6" x2="14" y2="6" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="10" x2="14" y2="10" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DetectionIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3" stroke="#6b7280" strokeWidth="1.5" />
      <path d="M8 2V4" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 12V14" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2 8H4" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 8H14" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SectorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2L8 6" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="9" r="3" stroke="#6b7280" strokeWidth="1.5" />
      <path d="M5.5 12.5C3.5 13 2 14 2 14H14C14 14 12.5 13 10.5 12.5" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
