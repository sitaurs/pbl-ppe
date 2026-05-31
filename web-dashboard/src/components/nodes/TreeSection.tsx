'use client';

import { useState, useRef, useCallback, ReactNode } from 'react';
import StatusIndicator from './StatusIndicator';
import { ComponentStatus } from '@/lib/node-types';

/**
 * TreeSection — Collapsible section in the node tree view.
 *
 * Used for Camera, ESP32, Detection, and Sector sections.
 * Features:
 * - Expand/collapse with aria-expanded
 * - Status indicator dot next to section label
 * - 16px indentation per level via CSS
 * - role="treeitem", aria-level, aria-expanded for accessibility
 * - Connector line (│) for visual hierarchy
 *
 * Requirements: 1.3, 1.6, 8.4
 */

export interface TreeSectionProps {
  label: string;                   // Section label (e.g., "Kamera", "ESP32")
  icon?: ReactNode;                // Section icon element
  status?: ComponentStatus;        // Optional status for the status indicator
  lastUpdated?: string;            // ISO timestamp for status tooltip
  level: number;                   // Hierarchy depth (1-based)
  defaultExpanded?: boolean;       // Whether section starts expanded
  isSelected?: boolean;            // Whether this section is currently selected/focused
  children: ReactNode;             // TreeItem children
  className?: string;
}

export default function TreeSection({
  label,
  icon,
  status,
  lastUpdated,
  level,
  defaultExpanded = true,
  isSelected = false,
  children,
  className = '',
}: TreeSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [collapsing, setCollapsing] = useState(false);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indentation = level * 16;

  const handleToggle = useCallback(() => {
    if (expanded) {
      // Start collapse animation: first animate items out, then hide
      setCollapsing(true);
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = setTimeout(() => {
        setExpanded(false);
        setCollapsing(false);
      }, 250); // match exit animation duration
    } else {
      setExpanded(true);
      setCollapsing(false);
    }
  }, [expanded]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    } else if (e.key === 'ArrowRight' && !expanded) {
      e.preventDefault();
      setExpanded(true);
      setCollapsing(false);
    } else if (e.key === 'ArrowLeft' && expanded) {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <>
      <style>{`
        .tree-section {
          position: relative;
        }
        .tree-section-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
          cursor: pointer;
          user-select: none;
          border-radius: 4px;
          transition: background-color 150ms ease;
        }
        .tree-section-header:hover {
          background-color: rgba(0, 0, 0, 0.04);
        }
        .tree-section-header:focus-visible {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
        }
        .tree-section-chevron {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          font-size: 10px;
          color: #6b7280;
          transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
          flex-shrink: 0;
        }
        .tree-section-chevron--expanded {
          transform: rotate(90deg);
        }
        .tree-section-icon {
          display: inline-flex;
          align-items: center;
          flex-shrink: 0;
        }
        .tree-section-label {
          font-size: 13px;
          font-weight: 600;
          color: #374151;
          flex-shrink: 0;
        }
        .tree-section-status {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
        }
        .tree-section-children {
          overflow: hidden;
          transition: max-height 300ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 250ms ease-out;
        }
        .tree-section-children--collapsed {
          max-height: 0;
          opacity: 0;
          pointer-events: none;
        }
        .tree-section-children--expanded {
          max-height: 600px;
          opacity: 1;
        }
        .tree-section-children--collapsing {
          max-height: 600px;
          opacity: 1;
          transition: max-height 250ms cubic-bezier(0.55, 0, 0.68, 0.5) 100ms, opacity 200ms ease-in 80ms;
        }
        /* When parent is collapsing, apply exit animation to children */
        .tree-section-items-exit > .tree-item-stagger {
          animation: tree-item-slide-out 180ms cubic-bezier(0.55, 0, 1, 0.45) forwards;
        }
        .tree-section-items-exit > .tree-item-stagger:nth-child(1) { animation-delay: 0ms; }
        .tree-section-items-exit > .tree-item-stagger:nth-child(2) { animation-delay: 30ms; }
        .tree-section-items-exit > .tree-item-stagger:nth-child(3) { animation-delay: 60ms; }
        .tree-section-items-exit > .tree-item-stagger:nth-child(4) { animation-delay: 90ms; }
        .tree-section-items-exit > .tree-item-stagger:nth-child(5) { animation-delay: 120ms; }
        .tree-section-items-exit > .node-tree-quick-actions {
          animation: tree-item-slide-out 150ms ease-in forwards;
          animation-delay: 60ms;
        }
        .tree-section-connector {
          position: relative;
        }
        .tree-section-connector::before {
          content: '';
          position: absolute;
          left: calc(var(--indent) + 7px);
          top: 0;
          bottom: 0;
          width: 1px;
          background-color: #d1d5db;
        }
        @media (prefers-color-scheme: dark) {
          .tree-section-label {
            color: #e5e7eb;
          }
          .tree-section-header:hover {
            background-color: rgba(255, 255, 255, 0.04);
          }
          .tree-section-connector::before {
            background-color: #4b5563;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .tree-section-chevron {
            transition: none !important;
          }
          .tree-section-children {
            transition: none !important;
          }
        }
      `}</style>
      <div
        className={`tree-section ${className}`}
        style={{ paddingLeft: indentation }}
      >
        {/* Section header (clickable to expand/collapse) */}
        <div
          className="tree-section-header"
          role="treeitem"
          aria-level={level}
          aria-expanded={expanded}
          aria-selected={isSelected}
          tabIndex={0}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
        >
          <span
            className={`tree-section-chevron ${expanded ? 'tree-section-chevron--expanded' : ''}`}
            aria-hidden="true"
          >
            ▶
          </span>
          {icon && <span className="tree-section-icon">{icon}</span>}
          <span className="tree-section-label">{label}</span>
          {status && (
            <span className="tree-section-status">
              <StatusIndicator status={status} lastUpdated={lastUpdated} />
            </span>
          )}
        </div>

        {/* Collapsible children with connector line */}
        <div
          className={`tree-section-children ${
            expanded
              ? 'tree-section-children--expanded'
              : 'tree-section-children--collapsed'
          } ${collapsing ? 'tree-section-children--collapsing' : ''}`}
          role="group"
        >
          <div
            className={`tree-section-connector ${collapsing ? 'tree-section-items-exit' : ''}`}
            style={{ '--indent': `${indentation}px` } as React.CSSProperties}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
