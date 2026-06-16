// Feature: node-detail-tree-view, Property 5: Wizard state persistence across navigation
// **Validates: Requirements 4.8**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { wizardReducer, WizardState, WizardAction } from '@/components/wizard/NodeWizard';
import type { StepSectorInfoValues } from '@/components/wizard/StepSectorInfo';
import type { StepCameraConfigValues } from '@/components/wizard/StepCameraConfig';
import type { StepESP32ConfigValues } from '@/components/wizard/StepESP32Config';

// --- Arbitraries ---

const sectorInfoArb: fc.Arbitrary<StepSectorInfoValues> = fc.record({
  nodeName: fc.string({ minLength: 1, maxLength: 100 }),
  sektorId: fc.string({ minLength: 1, maxLength: 10 }),
  picName: fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0),
  picPhone: fc.constantFrom('', '6281234567890', '081234567890'),
});

const cameraConfigArb: fc.Arbitrary<StepCameraConfigValues> = fc.record({
  rtspUrl: fc.constantFrom(
    'rtsp://192.168.1.10/live/ch00_1',
    'rtsp://10.0.0.5/stream',
    'rtsp://camera.local/feed'
  ),
  resolution: fc.constantFrom('640x480', '1280x720', '1920x1080'),
  confidenceThreshold: fc.double({ min: 0.01, max: 1.0, noNaN: true }).map((v) => v.toFixed(2)),
  detectionMode: fc.constantFrom('CPU', 'GPU'),
  skipped: fc.constant(false),
});

const esp32ConfigArb: fc.Arbitrary<StepESP32ConfigValues> = fc.record({
  mqttBroker: fc.string({ minLength: 1, maxLength: 50 }),
  mqttTopic: fc.string({ minLength: 1, maxLength: 50 }),
  skipped: fc.constant(false),
  gasSensorEnabled: fc.boolean(),
  gasThreshold: fc.integer({ min: 0, max: 4095 }),
});

/** Generate a valid step index (0-3) */
const stepArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 3 });

/** Generate a sequence of SET_STEP navigation actions */
const navigationSequenceArb: fc.Arbitrary<number[]> = fc.array(stepArb, {
  minLength: 1,
  maxLength: 20,
});

// --- Helper to create initial state ---

function createInitialState(): WizardState {
  return {
    currentStep: 0,
    sectorInfo: { nodeName: '', sektorId: '', picName: '', picPhone: '' },
    cameraConfig: {
      rtspUrl: '',
      resolution: '',
      confidenceThreshold: '',
      detectionMode: '',
      skipped: false,
    },
    esp32Config: { mqttBroker: '', mqttTopic: '', skipped: false, gasSensorEnabled: false, gasThreshold: 2200 },
    completedSteps: new Set<number>(),
    skippedSteps: new Set<number>(),
    dirty: false,
  };
}

// --- Property Tests ---

describe('Property 5: Wizard state persistence across navigation', () => {
  it('sectorInfo data is preserved after any sequence of step navigations', () => {
    fc.assert(
      fc.property(sectorInfoArb, navigationSequenceArb, (sectorInfo, steps) => {
        // Start with initial state
        let state = createInitialState();

        // Set sector info data
        state = wizardReducer(state, { type: 'UPDATE_SECTOR_INFO', values: sectorInfo });

        // Apply a sequence of navigation actions
        for (const step of steps) {
          state = wizardReducer(state, { type: 'SET_STEP', step });
        }

        // Verify sectorInfo is preserved exactly
        expect(state.sectorInfo).toEqual(sectorInfo);
      }),
      { numRuns: 100 }
    );
  });

  it('cameraConfig data is preserved after any sequence of step navigations', () => {
    fc.assert(
      fc.property(cameraConfigArb, navigationSequenceArb, (cameraConfig, steps) => {
        let state = createInitialState();

        // Set camera config data
        state = wizardReducer(state, { type: 'UPDATE_CAMERA_CONFIG', values: cameraConfig });

        // Apply a sequence of navigation actions
        for (const step of steps) {
          state = wizardReducer(state, { type: 'SET_STEP', step });
        }

        // Verify cameraConfig is preserved exactly
        expect(state.cameraConfig).toEqual(cameraConfig);
      }),
      { numRuns: 100 }
    );
  });

  it('esp32Config data is preserved after any sequence of step navigations', () => {
    fc.assert(
      fc.property(esp32ConfigArb, navigationSequenceArb, (esp32Config, steps) => {
        let state = createInitialState();

        // Set esp32 config data
        state = wizardReducer(state, { type: 'UPDATE_ESP32_CONFIG', values: esp32Config });

        // Apply a sequence of navigation actions
        for (const step of steps) {
          state = wizardReducer(state, { type: 'SET_STEP', step });
        }

        // Verify esp32Config is preserved exactly
        expect(state.esp32Config).toEqual(esp32Config);
      }),
      { numRuns: 100 }
    );
  });

  it('all form data is preserved simultaneously after interleaved updates and navigations', () => {
    fc.assert(
      fc.property(
        sectorInfoArb,
        cameraConfigArb,
        esp32ConfigArb,
        navigationSequenceArb,
        (sectorInfo, cameraConfig, esp32Config, steps) => {
          let state = createInitialState();

          // Fill in data for all steps
          state = wizardReducer(state, { type: 'UPDATE_SECTOR_INFO', values: sectorInfo });
          state = wizardReducer(state, { type: 'UPDATE_CAMERA_CONFIG', values: cameraConfig });
          state = wizardReducer(state, { type: 'UPDATE_ESP32_CONFIG', values: esp32Config });

          // Navigate through random sequence of steps
          for (const step of steps) {
            state = wizardReducer(state, { type: 'SET_STEP', step });
          }

          // All data must be preserved
          expect(state.sectorInfo).toEqual(sectorInfo);
          expect(state.cameraConfig).toEqual(cameraConfig);
          expect(state.esp32Config).toEqual(esp32Config);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('data updates on one step do not affect data on other steps', () => {
    fc.assert(
      fc.property(
        sectorInfoArb,
        cameraConfigArb,
        esp32ConfigArb,
        sectorInfoArb,
        (initialSector, cameraConfig, esp32Config, updatedSector) => {
          let state = createInitialState();

          // Fill all steps
          state = wizardReducer(state, { type: 'UPDATE_SECTOR_INFO', values: initialSector });
          state = wizardReducer(state, { type: 'UPDATE_CAMERA_CONFIG', values: cameraConfig });
          state = wizardReducer(state, { type: 'UPDATE_ESP32_CONFIG', values: esp32Config });

          // Navigate to step 0 and update sector info
          state = wizardReducer(state, { type: 'SET_STEP', step: 0 });
          state = wizardReducer(state, { type: 'UPDATE_SECTOR_INFO', values: updatedSector });

          // Verify sectorInfo was updated
          expect(state.sectorInfo).toEqual(updatedSector);

          // Verify other step data is untouched
          expect(state.cameraConfig).toEqual(cameraConfig);
          expect(state.esp32Config).toEqual(esp32Config);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('navigating backward and forward preserves data entered on intermediate steps', () => {
    fc.assert(
      fc.property(
        sectorInfoArb,
        cameraConfigArb,
        esp32ConfigArb,
        (sectorInfo, cameraConfig, esp32Config) => {
          let state = createInitialState();

          // Fill step 0, navigate forward
          state = wizardReducer(state, { type: 'UPDATE_SECTOR_INFO', values: sectorInfo });
          state = wizardReducer(state, { type: 'SET_STEP', step: 1 });

          // Fill step 1, navigate forward
          state = wizardReducer(state, { type: 'UPDATE_CAMERA_CONFIG', values: cameraConfig });
          state = wizardReducer(state, { type: 'SET_STEP', step: 2 });

          // Fill step 2, navigate forward
          state = wizardReducer(state, { type: 'UPDATE_ESP32_CONFIG', values: esp32Config });
          state = wizardReducer(state, { type: 'SET_STEP', step: 3 });

          // Navigate all the way back to step 0
          state = wizardReducer(state, { type: 'SET_STEP', step: 2 });
          state = wizardReducer(state, { type: 'SET_STEP', step: 1 });
          state = wizardReducer(state, { type: 'SET_STEP', step: 0 });

          // Navigate all the way forward again
          state = wizardReducer(state, { type: 'SET_STEP', step: 1 });
          state = wizardReducer(state, { type: 'SET_STEP', step: 2 });
          state = wizardReducer(state, { type: 'SET_STEP', step: 3 });

          // All data is preserved
          expect(state.sectorInfo).toEqual(sectorInfo);
          expect(state.cameraConfig).toEqual(cameraConfig);
          expect(state.esp32Config).toEqual(esp32Config);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('COMPLETE_STEP and SKIP_STEP actions do not mutate form data', () => {
    fc.assert(
      fc.property(
        sectorInfoArb,
        cameraConfigArb,
        esp32ConfigArb,
        fc.array(
          fc.oneof(
            fc.integer({ min: 0, max: 3 }).map((step) => ({ type: 'COMPLETE_STEP' as const, step })),
            fc.integer({ min: 0, max: 3 }).map((step) => ({ type: 'SKIP_STEP' as const, step })),
            fc.integer({ min: 0, max: 3 }).map((step) => ({ type: 'UNSKIP_STEP' as const, step })),
            fc.integer({ min: 0, max: 3 }).map((step) => ({ type: 'SET_STEP' as const, step }))
          ),
          { minLength: 1, maxLength: 15 }
        ),
        (sectorInfo, cameraConfig, esp32Config, actions) => {
          let state = createInitialState();

          // Fill form data
          state = wizardReducer(state, { type: 'UPDATE_SECTOR_INFO', values: sectorInfo });
          state = wizardReducer(state, { type: 'UPDATE_CAMERA_CONFIG', values: cameraConfig });
          state = wizardReducer(state, { type: 'UPDATE_ESP32_CONFIG', values: esp32Config });

          // Apply sequence of navigation/completion/skip actions
          for (const action of actions) {
            state = wizardReducer(state, action as WizardAction);
          }

          // Form data must remain preserved
          expect(state.sectorInfo).toEqual(sectorInfo);
          expect(state.cameraConfig).toEqual(cameraConfig);
          expect(state.esp32Config).toEqual(esp32Config);
        }
      ),
      { numRuns: 100 }
    );
  });
});
