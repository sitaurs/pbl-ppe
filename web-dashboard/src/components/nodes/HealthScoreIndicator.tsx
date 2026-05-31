'use client';

import { HealthScoreIndicatorProps } from '@/lib/node-types';

/**
 * HealthScoreIndicator — SVG circular progress indicator showing node health score.
 *
 * - Displays score (0-100) as a circular ring with stroke-dasharray/offset.
 * - Color badge based on score:
 *   - green (#22c55e): score ≥ 80 → "Sehat"
 *   - yellow (#f59e0b): score 50–79 → "Perlu Perhatian"
 *   - red (#ef4444): score < 50 → "Kritis"
 * - Smooth transition (0.6s ease) on score changes via stroke-dashoffset transition.
 * - Default size: 36x36px (configurable via `size` prop).
 *
 * Requirements: 3.2, 3.3, 3.4, 3.5
 */

function getScoreConfig(score: number): { color: string; label: string } {
  if (score >= 80) return { color: '#22c55e', label: 'Sehat' };
  if (score >= 50) return { color: '#f59e0b', label: 'Perlu Perhatian' };
  return { color: '#ef4444', label: 'Kritis' };
}

export default function HealthScoreIndicator({ score, size = 36 }: HealthScoreIndicatorProps) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const { color, label } = getScoreConfig(clampedScore);

  // SVG circle geometry
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedScore / 100) * circumference;

  return (
    <>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .health-score-circle {
            transition: none !important;
          }
        }
      `}</style>
      <span
        className="health-score-indicator"
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
        }}
        role="img"
        aria-label={`Health Score: ${clampedScore}, ${label}`}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Background circle (track) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <circle
            className="health-score-circle"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 0.6s ease, stroke 0.6s ease',
            }}
          />
        </svg>
        {/* Score number in center */}
        <span
          style={{
            position: 'absolute',
            fontSize: size * 0.3,
            fontWeight: 600,
            lineHeight: 1,
            color: color,
            transition: 'color 0.6s ease',
            userSelect: 'none',
          }}
        >
          {clampedScore}
        </span>
      </span>
    </>
  );
}
