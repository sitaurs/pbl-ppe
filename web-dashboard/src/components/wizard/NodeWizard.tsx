'use client';

import { useReducer, useCallback, useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { NodeWizardProps, NodeData } from '@/lib/node-types';
import WizardStepper from '@/components/wizard/WizardStepper';
import StepSectorInfo, {
  StepSectorInfoValues,
  validateStepSectorInfo,
  SectorOption,
} from '@/components/wizard/StepSectorInfo';
import StepCameraConfig, {
  StepCameraConfigValues,
  validateStepCameraConfig,
} from '@/components/wizard/StepCameraConfig';
import StepESP32Config, {
  StepESP32ConfigValues,
  validateStepESP32Config,
} from '@/components/wizard/StepESP32Config';
import StepReview from '@/components/wizard/StepReview';

// --- State Types ---

export interface WizardState {
  currentStep: number;
  sectorInfo: StepSectorInfoValues;
  cameraConfig: StepCameraConfigValues;
  esp32Config: StepESP32ConfigValues;
  completedSteps: Set<number>;
  skippedSteps: Set<number>;
  dirty: boolean; // has any field been modified
}

export type WizardAction =
  | { type: 'SET_STEP'; step: number }
  | { type: 'UPDATE_SECTOR_INFO'; values: StepSectorInfoValues }
  | { type: 'UPDATE_CAMERA_CONFIG'; values: StepCameraConfigValues }
  | { type: 'UPDATE_ESP32_CONFIG'; values: StepESP32ConfigValues }
  | { type: 'COMPLETE_STEP'; step: number }
  | { type: 'SKIP_STEP'; step: number }
  | { type: 'UNSKIP_STEP'; step: number }
  | { type: 'RESET' };

// --- Reducer ---

function createInitialState(initialData?: Partial<NodeData>): WizardState {
  const sectorInfo: StepSectorInfoValues = {
    nodeName: initialData?.sektorName || '',
    sektorId: initialData?.sektorId || '',
  };

  const cameraConfig: StepCameraConfigValues = {
    rtspUrl: initialData?.camera?.url || initialData?.cameraSource || '',
    resolution: initialData?.camera?.resolution || '',
    confidenceThreshold: initialData?.detection?.confidenceThreshold != null
      ? String(initialData.detection.confidenceThreshold)
      : '',
    detectionMode: initialData?.detection?.mode === 'realtime' ? 'CPU' : initialData?.detection?.mode === 'scheduled' ? 'GPU' : '',
    skipped: initialData?.camera === null && initialData !== undefined && 'camera' in initialData,
  };

  const esp32Config: StepESP32ConfigValues = {
    mqttBroker: initialData?.esp32?.mqttBroker || '',
    mqttTopic: initialData?.esp32?.mqttTopic || '',
    skipped: initialData?.esp32 === null && initialData !== undefined && 'esp32' in initialData,
  };

  return {
    currentStep: 0,
    sectorInfo,
    cameraConfig,
    esp32Config,
    completedSteps: new Set<number>(),
    skippedSteps: new Set<number>(),
    dirty: false,
  };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, currentStep: action.step };

    case 'UPDATE_SECTOR_INFO':
      return { ...state, sectorInfo: action.values, dirty: true };

    case 'UPDATE_CAMERA_CONFIG': {
      const newSkippedSteps = new Set(state.skippedSteps);
      if (action.values.skipped) {
        newSkippedSteps.add(1);
      } else {
        newSkippedSteps.delete(1);
      }
      return {
        ...state,
        cameraConfig: action.values,
        skippedSteps: newSkippedSteps,
        dirty: true,
      };
    }

    case 'UPDATE_ESP32_CONFIG': {
      const newSkippedSteps = new Set(state.skippedSteps);
      if (action.values.skipped) {
        newSkippedSteps.add(2);
      } else {
        newSkippedSteps.delete(2);
      }
      return {
        ...state,
        esp32Config: action.values,
        skippedSteps: newSkippedSteps,
        dirty: true,
      };
    }

    case 'COMPLETE_STEP': {
      const newCompleted = new Set(state.completedSteps);
      newCompleted.add(action.step);
      return { ...state, completedSteps: newCompleted };
    }

    case 'SKIP_STEP': {
      const newSkipped = new Set(state.skippedSteps);
      newSkipped.add(action.step);
      return { ...state, skippedSteps: newSkipped };
    }

    case 'UNSKIP_STEP': {
      const newSkipped = new Set(state.skippedSteps);
      newSkipped.delete(action.step);
      return { ...state, skippedSteps: newSkipped };
    }

    case 'RESET':
      return createInitialState();

    default:
      return state;
  }
}

// --- Validation Helpers ---

/**
 * Validates the current step. Returns error message string or null if valid.
 */
export function validateStep(
  step: number,
  state: WizardState
): string | null {
  switch (step) {
    case 0: {
      const errors = validateStepSectorInfo(state.sectorInfo);
      if (Object.keys(errors).length > 0) {
        return Object.values(errors).join(', ');
      }
      return null;
    }
    case 1: {
      if (state.cameraConfig.skipped) return null;
      const errors = validateStepCameraConfig(state.cameraConfig);
      if (Object.keys(errors).length > 0) {
        return Object.values(errors).join(', ');
      }
      return null;
    }
    case 2: {
      if (state.esp32Config.skipped) return null;
      const errors = validateStepESP32Config(state.esp32Config);
      if (Object.keys(errors).length > 0) {
        return Object.values(errors).join(', ');
      }
      return null;
    }
    case 3:
      return null; // Review step has no validation of its own
    default:
      return null;
  }
}

/**
 * Checks the "at least one component configured" rule.
 * Returns error string if both camera and ESP32 are skipped.
 */
export function validateAtLeastOneComponent(state: WizardState): string | null {
  if (state.cameraConfig.skipped && state.esp32Config.skipped) {
    return 'Minimal satu komponen (Kamera atau ESP32) harus dikonfigurasi';
  }
  return null;
}

// --- Build NodeData from wizard state (exported for testability) ---

/**
 * Builds a NodeData object (minus id) from the wizard state.
 * Implements composition nullification:
 * - When camera is skipped: camera and detection are null
 * - When ESP32 is skipped: esp32 is null
 * - When neither is skipped: all fields are populated
 *
 * Requirements: 7.4, 7.7
 */
export function buildNodeDataFromWizardState(
  state: WizardState,
  initialData?: Partial<NodeData>
): Omit<NodeData, 'id'> {
  return {
    sektorId: state.sectorInfo.sektorId,
    sektorName: state.sectorInfo.nodeName,
    picName: initialData?.picName || '',
    picPhone: initialData?.picPhone || '',
    cameraSource: state.cameraConfig.skipped ? '0' : state.cameraConfig.rtspUrl,
    enabled: initialData?.enabled ?? true,
    camera: state.cameraConfig.skipped
      ? null
      : {
          url: state.cameraConfig.rtspUrl,
          resolution: state.cameraConfig.resolution,
          protocol: state.cameraConfig.rtspUrl.startsWith('rtsp://') ? 'rtsp' : 'local',
        },
    esp32: state.esp32Config.skipped
      ? null
      : {
          mqttBroker: state.esp32Config.mqttBroker,
          mqttTopic: state.esp32Config.mqttTopic,
          enabled: true,
        },
    detection: state.cameraConfig.skipped
      ? null
      : {
          mode: state.cameraConfig.detectionMode === 'GPU' ? 'scheduled' : 'realtime',
          confidenceThreshold: parseFloat(state.cameraConfig.confidenceThreshold) || 0.5,
        },
  };
}

// --- Available sectors (would normally come from API) ---
const DEFAULT_SECTORS: SectorOption[] = [
  { id: 'S-01', name: 'Area Loading Dock' },
  { id: 'S-02', name: 'Area Gudang Utama' },
  { id: 'S-03', name: 'Area Produksi' },
  { id: 'S-04', name: 'Area Parkir' },
  { id: 'S-05', name: 'Area Workshop' },
];

// --- Component ---

/**
 * NodeWizard — Multi-step wizard container for adding/editing nodes.
 *
 * Features:
 * - useReducer for multi-step form state
 * - Per-step validation before navigation
 * - Enforces at least one component configured (not both skipped)
 * - Preserves form data across forward/backward navigation
 * - Confirmation dialog on close with unsaved changes
 * - Mobile: full-screen modal with swipe/buttons navigation
 * - Calls PUT/POST API on save, closes wizard, updates node list within 2s
 *
 * Requirements: 4.5, 4.6, 4.8, 4.9, 4.10, 7.4, 7.6, 8.5
 */
export default function NodeWizard({ mode, initialData, onSave, onClose }: NodeWizardProps) {
  const [state, dispatch] = useReducer(wizardReducer, initialData, createInitialState);
  const [stepError, setStepError] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const wizardRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  // Focus trap: focus the wizard when it mounts
  useEffect(() => {
    wizardRef.current?.focus();
  }, []);

  // --- Navigation ---

  const goToStep = useCallback(
    (targetStep: number) => {
      setStepError(null);

      // If navigating forward, validate current step
      if (targetStep > state.currentStep) {
        const error = validateStep(state.currentStep, state);
        if (error) {
          setStepError(error);
          return;
        }

        // Check "at least one component" rule when trying to go to step 3 (Review)
        if (targetStep === 3) {
          const componentError = validateAtLeastOneComponent(state);
          if (componentError) {
            setStepError(componentError);
            return;
          }
        }

        // Mark current step as completed (or skipped)
        if (state.currentStep === 1 && state.cameraConfig.skipped) {
          dispatch({ type: 'SKIP_STEP', step: 1 });
        } else if (state.currentStep === 2 && state.esp32Config.skipped) {
          dispatch({ type: 'SKIP_STEP', step: 2 });
        } else {
          dispatch({ type: 'COMPLETE_STEP', step: state.currentStep });
        }
      }

      dispatch({ type: 'SET_STEP', step: targetStep });
    },
    [state]
  );

  const handleNext = useCallback(() => {
    goToStep(state.currentStep + 1);
  }, [state.currentStep, goToStep]);

  const handleBack = useCallback(() => {
    setStepError(null);
    if (state.currentStep > 0) {
      dispatch({ type: 'SET_STEP', step: state.currentStep - 1 });
    }
  }, [state.currentStep]);

  // --- Close Handling ---

  const handleCloseAttempt = useCallback(() => {
    if (state.dirty) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  }, [state.dirty, onClose]);

  const handleConfirmClose = useCallback(() => {
    setShowCloseConfirm(false);
    onClose();
  }, [onClose]);

  const handleCancelClose = useCallback(() => {
    setShowCloseConfirm(false);
  }, []);

  // --- Save ---

  const handleSave = useCallback(async () => {
    // Validate all steps before saving
    for (let i = 0; i < 3; i++) {
      const error = validateStep(i, state);
      if (error && !(i === 1 && state.cameraConfig.skipped) && !(i === 2 && state.esp32Config.skipped)) {
        setStepError(`Step ${i + 1}: ${error}`);
        dispatch({ type: 'SET_STEP', step: i });
        return;
      }
    }

    const componentError = validateAtLeastOneComponent(state);
    if (componentError) {
      setStepError(componentError);
      return;
    }

    setSaving(true);
    setStepError(null);

    try {
      // Build NodeData from wizard state using extracted pure function
      const nodeData = buildNodeDataFromWizardState(state, initialData);

      await onSave(nodeData);
      // onSave will close the wizard via parent
    } catch {
      setStepError('Gagal menyimpan node. Silakan coba lagi.');
    } finally {
      setSaving(false);
    }
  }, [state, initialData, onSave]);

  // --- Connection Test Handlers ---

  const handleTestCameraConnection = useCallback(async (url: string) => {
    const res = await fetch('/api/nodes/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'camera', url }),
    });
    return res.json();
  }, []);

  const handleTestMqtt = useCallback(async (broker: string, topic: string) => {
    try {
      const res = await fetch('/api/nodes/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'mqtt', broker, port: 8883, username: '', password: '' }),
      });
      const data = await res.json();
      return {
        success: data.status === 'connected',
        message: data.status === 'connected' ? 'Koneksi MQTT berhasil' : (data.error || 'Koneksi gagal'),
      };
    } catch {
      return { success: false, message: 'Gagal menghubungi server' };
    }
  }, []);

  // --- Mobile Swipe Gesture ---

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const threshold = 80; // minimum swipe distance

      if (deltaX > threshold && state.currentStep > 0) {
        // Swipe right → go back
        handleBack();
      } else if (deltaX < -threshold && state.currentStep < 3) {
        // Swipe left → go next
        handleNext();
      }
      touchStartX.current = null;
    },
    [state.currentStep, handleBack, handleNext]
  );

  // --- Step Content ---

  const renderStepContent = () => {
    switch (state.currentStep) {
      case 0:
        return (
          <StepSectorInfo
            values={state.sectorInfo}
            onChange={(values) => dispatch({ type: 'UPDATE_SECTOR_INFO', values })}
            sectors={DEFAULT_SECTORS}
          />
        );
      case 1:
        return (
          <StepCameraConfig
            values={state.cameraConfig}
            onChange={(values) => dispatch({ type: 'UPDATE_CAMERA_CONFIG', values })}
            onTestConnection={handleTestCameraConnection}
          />
        );
      case 2:
        return (
          <StepESP32Config
            values={state.esp32Config}
            onChange={(values) => dispatch({ type: 'UPDATE_ESP32_CONFIG', values })}
            onTestMqtt={handleTestMqtt}
          />
        );
      case 3:
        return (
          <StepReview
            sectorInfo={state.sectorInfo}
            cameraConfig={state.cameraConfig}
            esp32Config={state.esp32Config}
            onEditStep={goToStep}
            onSave={handleSave}
            saving={saving}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="node-wizard-overlay"
        onClick={handleCloseAttempt}
        aria-hidden="true"
      />

      {/* Wizard Modal */}
      <div
        ref={wizardRef}
        className="node-wizard-modal"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'add' ? 'Tambah Node Baru' : 'Edit Node'}
        tabIndex={-1}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div className="node-wizard-header">
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {mode === 'add' ? 'Tambah Node Baru' : 'Edit Node'}
          </h2>
          <button
            type="button"
            onClick={handleCloseAttempt}
            className="node-wizard-close-btn"
            aria-label="Tutup wizard"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stepper */}
        <WizardStepper
          currentStep={state.currentStep}
          completedSteps={state.completedSteps}
          skippedSteps={state.skippedSteps}
        />

        {/* Error Message */}
        {stepError && (
          <div
            className="node-wizard-error"
            role="alert"
          >
            {stepError}
          </div>
        )}

        {/* Step Content */}
        <div className="node-wizard-content">
          {renderStepContent()}
        </div>

        {/* Footer Navigation (not shown on Review step since it has its own Save button) */}
        {state.currentStep < 3 && (
          <div className="node-wizard-footer">
            <button
              type="button"
              onClick={handleBack}
              disabled={state.currentStep === 0}
              className="node-wizard-btn-secondary"
              style={{
                opacity: state.currentStep === 0 ? 0.4 : 1,
                cursor: state.currentStep === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Kembali
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="node-wizard-btn-primary"
            >
              Lanjut
            </button>
          </div>
        )}
      </div>

      {/* Close Confirmation Dialog */}
      {showCloseConfirm && (
        <div className="node-wizard-confirm-overlay">
          <div
            className="node-wizard-confirm-dialog"
            role="alertdialog"
            aria-labelledby="wizard-close-confirm-title"
            aria-describedby="wizard-close-confirm-desc"
          >
            <h3
              id="wizard-close-confirm-title"
              style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}
            >
              Perubahan Belum Disimpan
            </h3>
            <p
              id="wizard-close-confirm-desc"
              style={{ margin: '0 0 20px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}
            >
              Data yang sudah diisi akan hilang jika Anda keluar sekarang.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleCancelClose}
                className="node-wizard-btn-secondary"
              >
                Tetap di sini
              </button>
              <button
                type="button"
                onClick={handleConfirmClose}
                className="node-wizard-btn-danger"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Styles */}
      <style>{`
        .node-wizard-overlay {
          position: fixed;
          inset: 0;
          z-index: 99;
          background: rgba(26, 26, 46, 0.5);
          animation: wizard-overlay-in 200ms ease-out;
        }

        .node-wizard-modal {
          position: fixed;
          z-index: 100;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 90%;
          max-width: 560px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary, #ffffff);
          border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
          animation: wizard-modal-in 200ms ease-out;
          overflow: hidden;
        }

        .node-wizard-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border, #e5e7eb);
          flex-shrink: 0;
        }

        .node-wizard-close-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: background-color 150ms;
        }
        .node-wizard-close-btn:hover {
          background: var(--bg-secondary, #f3f4f6);
        }

        .node-wizard-error {
          margin: 0 20px;
          margin-top: 12px;
          padding: 10px 14px;
          border-radius: 8px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: var(--danger, #ef4444);
          font-size: 0.85rem;
          flex-shrink: 0;
        }

        .node-wizard-content {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }

        .node-wizard-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-top: 1px solid var(--border, #e5e7eb);
          flex-shrink: 0;
        }

        .node-wizard-btn-primary {
          padding: 10px 24px;
          border: none;
          border-radius: 8px;
          background: var(--accent, #2563eb);
          color: white;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          min-height: 44px;
          min-width: 44px;
          transition: opacity 150ms;
        }
        .node-wizard-btn-primary:hover {
          opacity: 0.9;
        }

        .node-wizard-btn-secondary {
          padding: 10px 20px;
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 8px;
          background: transparent;
          color: var(--text-secondary);
          font-weight: 500;
          font-size: 0.9rem;
          cursor: pointer;
          min-height: 44px;
          min-width: 44px;
          transition: background-color 150ms;
        }
        .node-wizard-btn-secondary:hover {
          background: var(--bg-secondary, #f3f4f6);
        }

        .node-wizard-btn-danger {
          padding: 10px 20px;
          border: 1px solid #fecaca;
          border-radius: 8px;
          background: #fef2f2;
          color: var(--danger, #ef4444);
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          min-height: 44px;
          min-width: 44px;
          transition: background-color 150ms;
        }
        .node-wizard-btn-danger:hover {
          background: #fee2e2;
        }

        /* Confirm Dialog */
        .node-wizard-confirm-overlay {
          position: fixed;
          inset: 0;
          z-index: 110;
          background: rgba(26, 26, 46, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: wizard-overlay-in 150ms ease-out;
        }

        .node-wizard-confirm-dialog {
          background: var(--bg-primary, #ffffff);
          border-radius: 12px;
          padding: 24px;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
          animation: wizard-modal-in 150ms ease-out;
        }

        /* Mobile: full-screen modal */
        @media (max-width: 767px) {
          .node-wizard-modal {
            top: 0;
            left: 0;
            transform: none;
            width: 100%;
            max-width: 100%;
            height: 100%;
            max-height: 100%;
            border-radius: 0;
            padding-top: env(safe-area-inset-top, 0px);
            padding-bottom: env(safe-area-inset-bottom, 0px);
          }

          .node-wizard-footer {
            padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
          }
        }

        /* Animations */
        @keyframes wizard-overlay-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes wizard-modal-in {
          from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        @media (max-width: 767px) {
          @keyframes wizard-modal-in {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .node-wizard-overlay,
          .node-wizard-modal,
          .node-wizard-confirm-overlay,
          .node-wizard-confirm-dialog {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </>
  );
}
