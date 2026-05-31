'use client';

/**
 * TreeItem — Leaf item in the node tree view displaying a label + value pair.
 *
 * Features:
 * - Connector lines (├─, └─, │) via CSS pseudo-elements
 * - 16px indentation per level
 * - role="treeitem", aria-level, aria-selected for accessibility
 * - tabIndex for keyboard focus, focus-visible indicator (2px outline)
 *
 * Requirements: 1.3, 1.6, 8.3, 8.4, 8.6
 */

export interface TreeItemProps {
  label: string;
  value: string;
  level: number;          // hierarchy depth (1-based)
  isLast?: boolean;       // whether this is the last sibling
  isSelected?: boolean;   // whether this item is currently selected/focused in the tree
  className?: string;
}

export default function TreeItem({
  label,
  value,
  level,
  isLast = false,
  isSelected = false,
  className = '',
}: TreeItemProps) {
  const indentation = level * 16;
  const connector = isLast ? '└─' : '├─';

  return (
    <>
      <style>{`
        .tree-item {
          position: relative;
          display: flex;
          align-items: baseline;
          padding: 2px 0;
          font-size: 13px;
          line-height: 1.5;
          border-radius: 4px;
          outline: none;
        }
        .tree-item:focus-visible {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
        }
        .tree-item-connector {
          color: #6b7280;
          font-family: monospace;
          white-space: pre;
          user-select: none;
          flex-shrink: 0;
        }
        .tree-item-label {
          color: #6b7280;
          margin-right: 4px;
          flex-shrink: 0;
        }
        .tree-item-value {
          color: #111827;
          word-break: break-all;
        }
        @media (prefers-color-scheme: dark) {
          .tree-item-label {
            color: #9ca3af;
          }
          .tree-item-value {
            color: #f3f4f6;
          }
          .tree-item-connector {
            color: #9ca3af;
          }
        }
      `}</style>
      <div
        className={`tree-item tree-item-stagger ${className}`}
        role="treeitem"
        aria-level={level}
        aria-selected={isSelected}
        tabIndex={-1}
        style={{ paddingLeft: indentation }}
      >
        <span className="tree-item-connector" aria-hidden="true">
          {connector}{' '}
        </span>
        <span className="tree-item-label">{label}:</span>
        <span className="tree-item-value">{value}</span>
      </div>
    </>
  );
}
