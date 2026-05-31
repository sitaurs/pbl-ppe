'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * QuickActionButton — Inline action button for tree view quick actions.
 *
 * States:
 * - idle: default button appearance, clickable
 * - loading: spinner/indicator while action executes, not clickable
 * - success: green checkmark + message, visible for 5s then resets to idle
 * - failure: red X + error message with possible causes, visible for 5s then resets to idle
 * - disabled: greyed out, not clickable
 *
 * Requirements: 5.2, 5.6, 5.7
 */

export type QuickActionState = 'idle' | 'loading' | 'success' | 'failure';

export interface QuickActionResult {
  success: boolean;
  message?: string;
  possibleCauses?: string[];
}

export interface QuickActionButtonProps {
  label: string;
  onClick: () => Promise<QuickActionResult>;
  disabled?: boolean;
  /** Duration in ms to show result before resetting to idle. Default: 5000 */
  resultDisplayDuration?: number;
}

export default function QuickActionButton({
  label,
  onClick,
  disabled = false,
  resultDisplayDuration = 5000,
}: QuickActionButtonProps) {
  const [state, setState] = useState<QuickActionState>('idle');
  const [result, setResult] = useState<QuickActionResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const resetState = useCallback(() => {
    if (mountedRef.current) {
      setState('idle');
      setResult(null);
    }
  }, []);

  const handleClick = useCallback(async () => {
    if (state === 'loading' || disabled) return;

    // Clear any existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setState('loading');
    setResult(null);

    try {
      const actionResult = await onClick();

      if (!mountedRef.current) return;

      setResult(actionResult);
      setState(actionResult.success ? 'success' : 'failure');

      // Reset after display duration
      timerRef.current = setTimeout(resetState, resultDisplayDuration);
    } catch (error) {
      if (!mountedRef.current) return;

      const errorResult: QuickActionResult = {
        success: false,
        message:
          error instanceof Error ? error.message : 'Terjadi kesalahan tidak terduga',
        possibleCauses: ['Koneksi jaringan terputus', 'Server tidak merespon'],
      };
      setResult(errorResult);
      setState('failure');

      timerRef.current = setTimeout(resetState, resultDisplayDuration);
    }
  }, [state, disabled, onClick, resultDisplayDuration, resetState]);

  const isDisabled = disabled || state === 'loading';

  return (
    <>
      <style>{`
        @keyframes quick-action-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .quick-action-button-wrapper button:focus-visible {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .quick-action-spinner {
            animation: none !important;
          }
        }
      `}</style>
      <span
        className="quick-action-button-wrapper"
        style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}
      >
        <button
          type="button"
          onClick={handleClick}
          disabled={isDisabled}
          aria-busy={state === 'loading'}
          aria-disabled={isDisabled}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 500,
            lineHeight: '16px',
            borderRadius: 6,
            border: '1px solid',
            borderColor:
              state === 'success'
                ? '#22c55e'
                : state === 'failure'
                  ? '#ef4444'
                  : '#d1d5db',
            backgroundColor:
              state === 'success'
                ? '#f0fdf4'
                : state === 'failure'
                  ? '#fef2f2'
                  : isDisabled
                    ? '#f3f4f6'
                    : '#ffffff',
            color:
              state === 'success'
                ? '#166534'
                : state === 'failure'
                  ? '#991b1b'
                  : isDisabled
                    ? '#9ca3af'
                    : '#374151',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            transition:
              'background-color 200ms ease, border-color 200ms ease, color 200ms ease',
            minHeight: 32,
            minWidth: 44,
            outline: 'none',
          }}
        >
          {/* Loading spinner */}
          {state === 'loading' && (
            <span
              className="quick-action-spinner"
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                border: '2px solid #d1d5db',
                borderTopColor: '#3b82f6',
                borderRadius: '50%',
                animation: 'quick-action-spin 0.6s linear infinite',
                flexShrink: 0,
              }}
              aria-hidden="true"
            />
          )}

          {/* Success icon */}
          {state === 'success' && (
            <svg
              width={12}
              height={12}
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
              style={{ flexShrink: 0 }}
            >
              <path
                d="M2.5 6L5 8.5L9.5 3.5"
                stroke="#22c55e"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}

          {/* Failure icon */}
          {state === 'failure' && (
            <svg
              width={12}
              height={12}
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
              style={{ flexShrink: 0 }}
            >
              <path
                d="M3 3L9 9M9 3L3 9"
                stroke="#ef4444"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}

          {/* Button label */}
          <span>
            {state === 'loading'
              ? 'Memproses...'
              : state === 'success'
                ? result?.message || 'Berhasil'
                : state === 'failure'
                  ? result?.message || 'Gagal'
                  : label}
          </span>
        </button>

        {/* Error details with possible causes */}
        {state === 'failure' && result?.possibleCauses && result.possibleCauses.length > 0 && (
          <span
            role="alert"
            style={{
              display: 'block',
              fontSize: 11,
              lineHeight: '14px',
              color: '#991b1b',
              padding: '4px 8px',
              backgroundColor: '#fef2f2',
              borderRadius: 4,
              border: '1px solid #fecaca',
              maxWidth: 240,
            }}
          >
            <span style={{ fontWeight: 600 }}>Kemungkinan penyebab:</span>
            <ul
              style={{
                margin: '2px 0 0 0',
                padding: '0 0 0 14px',
                listStyleType: 'disc',
              }}
            >
              {result.possibleCauses.map((cause, idx) => (
                <li key={idx} style={{ marginTop: 1 }}>
                  {cause}
                </li>
              ))}
            </ul>
          </span>
        )}
      </span>
    </>
  );
}
