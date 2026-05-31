'use client';

import { WizardStepperProps } from '@/lib/node-types';

/**
 * WizardStepper — Horizontal progress stepper showing 4 wizard steps.
 *
 * States per step:
 * - active:    Current step (blue circle + bold label)
 * - completed: Previously finished step (green circle + checkmark)
 * - skipped:   Intentionally skipped step (orange circle + dash)
 * - pending:   Not yet reached (gray circle + number)
 *
 * Horizontal layout on desktop, compact (smaller labels) on mobile (<768px).
 *
 * Requirements: 4.2
 */

const STEPS = [
  { label: 'Info Sektor', shortLabel: 'Sektor' },
  { label: 'Konfigurasi Kamera', shortLabel: 'Kamera' },
  { label: 'Konfigurasi ESP32', shortLabel: 'ESP32' },
  { label: 'Review & Simpan', shortLabel: 'Review' },
];

type StepState = 'active' | 'completed' | 'skipped' | 'pending';

function getStepState(
  index: number,
  currentStep: number,
  completedSteps: Set<number>,
  skippedSteps: Set<number>
): StepState {
  if (index === currentStep) return 'active';
  if (completedSteps.has(index)) return 'completed';
  if (skippedSteps.has(index)) return 'skipped';
  return 'pending';
}

const STATE_STYLES: Record<StepState, { bg: string; border: string; text: string }> = {
  active: { bg: '#2563eb', border: '#2563eb', text: '#ffffff' },
  completed: { bg: '#22c55e', border: '#22c55e', text: '#ffffff' },
  skipped: { bg: '#f59e0b', border: '#f59e0b', text: '#ffffff' },
  pending: { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280' },
};

const CONNECTOR_COLORS: Record<StepState, string> = {
  active: '#2563eb',
  completed: '#22c55e',
  skipped: '#f59e0b',
  pending: '#d1d5db',
};

export default function WizardStepper({
  currentStep,
  completedSteps,
  skippedSteps,
}: WizardStepperProps) {
  return (
    <>
      <style>{`
        .wizard-stepper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          padding: 16px 0;
        }
        .wizard-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          flex: 1;
          min-width: 0;
        }
        .wizard-step-circle {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
          border: 2px solid;
          transition: background-color 300ms ease, border-color 300ms ease;
          flex-shrink: 0;
        }
        .wizard-step-label {
          margin-top: 8px;
          font-size: 13px;
          text-align: center;
          line-height: 1.3;
          max-width: 120px;
          transition: color 300ms ease;
        }
        .wizard-step-label-active {
          font-weight: 600;
          color: #2563eb;
        }
        .wizard-step-label-completed {
          color: #22c55e;
        }
        .wizard-step-label-skipped {
          color: #f59e0b;
        }
        .wizard-step-label-pending {
          color: #6b7280;
        }
        .wizard-connector {
          flex: 1;
          height: 2px;
          margin: 0 4px;
          margin-bottom: 28px;
          transition: background-color 300ms ease;
          min-width: 16px;
        }
        /* Mobile compact: smaller circles, shorter labels */
        @media (max-width: 767px) {
          .wizard-step-circle {
            width: 28px;
            height: 28px;
            font-size: 12px;
          }
          .wizard-step-label {
            font-size: 11px;
            max-width: 72px;
          }
          .wizard-connector {
            min-width: 8px;
            margin-bottom: 24px;
          }
          .wizard-stepper {
            padding: 12px 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .wizard-step-circle,
          .wizard-step-label,
          .wizard-connector {
            transition: none !important;
          }
        }
      `}</style>

      <nav
        className="wizard-stepper"
        aria-label="Wizard progress"
        role="navigation"
      >
        {STEPS.map((step, index) => {
          const state = getStepState(index, currentStep, completedSteps, skippedSteps);
          const styles = STATE_STYLES[state];
          const isLast = index === STEPS.length - 1;

          return (
            <div key={index} style={{ display: 'contents' }}>
              <div className="wizard-step" aria-current={state === 'active' ? 'step' : undefined}>
                <div
                  className="wizard-step-circle"
                  style={{
                    backgroundColor: styles.bg,
                    borderColor: styles.border,
                    color: styles.text,
                  }}
                  aria-hidden="true"
                >
                  {state === 'completed' ? (
                    <CheckIcon />
                  ) : state === 'skipped' ? (
                    <DashIcon />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`wizard-step-label wizard-step-label-${state}`}
                  aria-label={`Step ${index + 1}: ${step.label}${state === 'active' ? ' (aktif)' : state === 'completed' ? ' (selesai)' : state === 'skipped' ? ' (dilewati)' : ''}`}
                >
                  <span className="wizard-step-label-full">{step.label}</span>
                  <span className="wizard-step-label-short">{step.shortLabel}</span>
                </span>
              </div>

              {!isLast && (
                <div
                  className="wizard-connector"
                  style={{
                    backgroundColor:
                      getStepState(index, currentStep, completedSteps, skippedSteps) === 'completed' ||
                      getStepState(index, currentStep, completedSteps, skippedSteps) === 'skipped'
                        ? CONNECTOR_COLORS[getStepState(index, currentStep, completedSteps, skippedSteps)]
                        : CONNECTOR_COLORS.pending,
                  }}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </nav>

      {/* Responsive label switching */}
      <style>{`
        @media (min-width: 768px) {
          .wizard-step-label-short { display: none; }
          .wizard-step-label-full { display: inline; }
        }
        @media (max-width: 767px) {
          .wizard-step-label-short { display: inline; }
          .wizard-step-label-full { display: none; }
        }
      `}</style>
    </>
  );
}

/** Small checkmark SVG icon for completed state */
function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 7.5L5.5 10L11 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Small dash/minus icon for skipped state */
function DashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 7H10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
