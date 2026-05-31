'use client';

import { useState, useEffect, useMemo } from 'react';
import { StatusIndicatorProps, ComponentStatus } from '@/lib/node-types';

/**
 * StatusIndicator — Color-coded dot with optional pulse animation
 * indicating component connection status.
 *
 * - online:       #22c55e + pulse 1.5s
 * - offline:      #ef4444, no animation
 * - degraded:     #f59e0b + pulse 3s
 * - unconfigured: #9ca3af, no animation
 *
 * Includes tooltip with relative time since last status update on hover.
 * CSS transition (400ms) for status color changes.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */

export const STATUS_CONFIG: Record<
  ComponentStatus,
  { color: string; animation: string | null }
> = {
  online: { color: '#22c55e', animation: 'pulse-online 1.5s ease-in-out infinite' },
  offline: { color: '#ef4444', animation: null },
  degraded: { color: '#f59e0b', animation: 'pulse-degraded 3s ease-in-out infinite' },
  unconfigured: { color: '#9ca3af', animation: null },
};

function getRelativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;

  if (Number.isNaN(diffMs) || diffMs < 0) return 'baru saja';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return 'baru saja';
  if (seconds < 60) return `${seconds} detik lalu`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;

  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

export default function StatusIndicator({ status, lastUpdated }: StatusIndicatorProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [relativeTime, setRelativeTime] = useState('');

  const config = STATUS_CONFIG[status];

  // Update relative time when tooltip is shown or periodically
  useEffect(() => {
    if (!lastUpdated) return;
    setRelativeTime(getRelativeTime(lastUpdated));

    if (tooltipVisible) {
      const interval = setInterval(() => {
        setRelativeTime(getRelativeTime(lastUpdated));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [lastUpdated, tooltipVisible]);

  const tooltipText = useMemo(() => {
    if (!lastUpdated) return 'Status tidak tersedia';
    return relativeTime || getRelativeTime(lastUpdated);
  }, [lastUpdated, relativeTime]);

  const statusLabel =
    status === 'online'
      ? 'Online'
      : status === 'offline'
        ? 'Offline'
        : status === 'degraded'
          ? 'Degraded'
          : 'Belum dikonfigurasi';

  return (
    <>
      {/* Keyframes defined in src/styles/node-tree-animations.css */}
      <span
        className="status-indicator-wrapper"
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
        onMouseEnter={() => setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
        onFocus={() => setTooltipVisible(true)}
        onBlur={() => setTooltipVisible(false)}
        tabIndex={0}
        role="status"
        aria-label={`Status: ${statusLabel}${lastUpdated ? `, ${tooltipText}` : ''}`}
      >
        <span
          className="status-indicator-dot"
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: config.color,
            animation: config.animation ?? 'none',
            transition: 'background-color 400ms ease',
          }}
        />

        {/* Tooltip */}
        {tooltipVisible && (
          <span
            role="tooltip"
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: 6,
              padding: '4px 8px',
              fontSize: 12,
              lineHeight: '16px',
              whiteSpace: 'nowrap',
              backgroundColor: '#1f2937',
              color: '#f9fafb',
              borderRadius: 4,
              pointerEvents: 'none',
              zIndex: 50,
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            }}
          >
            {tooltipText}
          </span>
        )}
      </span>
    </>
  );
}
