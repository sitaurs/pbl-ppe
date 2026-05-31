// Feature: node-detail-tree-view, Property 4: Wizard step validation rules
// **Validates: Requirements 4.5, 4.6**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateStep, validateAtLeastOneComponent, WizardState } from '../NodeWizard';
import { StepSectorInfoValues } from '../StepSectorInfo';
import { StepCameraConfigValues } from '../StepCameraConfig';
import { StepESP32ConfigValues } from '../StepESP32Config';

// --- Arbitraries (Generators) ---

// Valid sector info: node name 1-100 chars, sector selected
const validSectorInfoArb: fc.Arbitrary<StepSectorInfoValues> = fc.record({
  nodeName: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length >= 1),
  sektorId: fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.length > 0),
});

// Invalid sector info: empty node name or empty sector
const invalidSectorInfoArb: fc.Arbitrary<StepSectorInfoValues> = fc.oneof(
  // Empty node name
  fc.record({
    nodeName: fc.constantFrom('', '   ', '\t', '\n'),
    sektorId: fc.string({ minLength: 1, maxLength: 10 }),
  }),
  // Node name too long (> 100 chars when trimmed)
  fc.record({
    nodeName: fc.string({ minLength: 101, maxLength: 150 }).filter((s) => s.trim().length > 100),
    sektorId: fc.string({ minLength: 1, maxLength: 10 }),
  }),
  // Empty sector ID
  fc.record({
    nodeName: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length >= 1),
    sektorId: fc.constant(''),
  })
);

// Valid camera config (not skipped): rtsp URL starts with "rtsp://", resolution selected, confidence 0.01-1.00, mode CPU/GPU
const validCameraConfigArb: fc.Arbitrary<StepCameraConfigValues> = fc.record({
  rtspUrl: fc.string({ minLength: 1, maxLength: 400 }).map((s) => `rtsp://${s}`),
  resolution: fc.constantFrom('640x480', '1280x720', '1920x1080', '2560x1440', '3840x2160'),
  confidenceThreshold: fc.double({ min: 0.01, max: 1.0, noNaN: true }).map((n) => n.toFixed(2)),
  detectionMode: fc.constantFrom('CPU', 'GPU'),
  skipped: fc.constant(false),
});

// Skipped camera config
const skippedCameraConfigArb: fc.Arbitrary<StepCameraConfigValues> = fc.constant({
  rtspUrl: '',
  resolution: '',
  confidenceThreshold: '',
  detectionMode: '',
  skipped: true,
});

// Invalid camera config (not skipped): at least one field invalid
const invalidCameraConfigArb: fc.Arbitrary<StepCameraConfigValues> = fc.oneof(
  // Missing rtspUrl
  fc.record({
    rtspUrl: fc.constantFrom('', '  ', 'http://notrtsp.com', 'ftp://wrong'),
    resolution: fc.constantFrom('640x480', '1280x720'),
    confidenceThreshold: fc.double({ min: 0.01, max: 1.0, noNaN: true }).map((n) => n.toFixed(2)),
    detectionMode: fc.constantFrom('CPU', 'GPU'),
    skipped: fc.constant(false),
  }),
  // Missing resolution
  fc.record({
    rtspUrl: fc.string({ minLength: 1, maxLength: 400 }).map((s) => `rtsp://${s}`),
    resolution: fc.constant(''),
    confidenceThreshold: fc.double({ min: 0.01, max: 1.0, noNaN: true }).map((n) => n.toFixed(2)),
    detectionMode: fc.constantFrom('CPU', 'GPU'),
    skipped: fc.constant(false),
  }),
  // Invalid confidence threshold (out of range)
  fc.record({
    rtspUrl: fc.string({ minLength: 1, maxLength: 400 }).map((s) => `rtsp://${s}`),
    resolution: fc.constantFrom('640x480', '1280x720'),
    confidenceThreshold: fc.oneof(
      fc.constant(''),
      fc.constant('abc'),
      fc.double({ min: 1.01, max: 10, noNaN: true }).map((n) => n.toFixed(2)),
      fc.constant('0.00'),
      fc.constant('-0.5')
    ),
    detectionMode: fc.constantFrom('CPU', 'GPU'),
    skipped: fc.constant(false),
  }),
  // Missing detection mode
  fc.record({
    rtspUrl: fc.string({ minLength: 1, maxLength: 400 }).map((s) => `rtsp://${s}`),
    resolution: fc.constantFrom('640x480', '1280x720'),
    confidenceThreshold: fc.double({ min: 0.01, max: 1.0, noNaN: true }).map((n) => n.toFixed(2)),
    detectionMode: fc.constant(''),
    skipped: fc.constant(false),
  })
);

// Valid ESP32 config (not skipped): broker non-empty, topic non-empty
const validEsp32ConfigArb: fc.Arbitrary<StepESP32ConfigValues> = fc.record({
  mqttBroker: fc.string({ minLength: 1, maxLength: 256 }).filter((s) => s.trim().length > 0),
  mqttTopic: fc.string({ minLength: 1, maxLength: 128 }).filter((s) => s.trim().length > 0),
  skipped: fc.constant(false),
});

// Skipped ESP32 config
const skippedEsp32ConfigArb: fc.Arbitrary<StepESP32ConfigValues> = fc.constant({
  mqttBroker: '',
  mqttTopic: '',
  skipped: true,
});

// Invalid ESP32 config (not skipped): broker or topic empty
const invalidEsp32ConfigArb: fc.Arbitrary<StepESP32ConfigValues> = fc.oneof(
  // Empty broker
  fc.record({
    mqttBroker: fc.constantFrom('', '   ', '\t'),
    mqttTopic: fc.string({ minLength: 1, maxLength: 128 }).filter((s) => s.trim().length > 0),
    skipped: fc.constant(false),
  }),
  // Empty topic
  fc.record({
    mqttBroker: fc.string({ minLength: 1, maxLength: 256 }).filter((s) => s.trim().length > 0),
    mqttTopic: fc.constantFrom('', '   ', '\t'),
    skipped: fc.constant(false),
  })
);

// Helper to build a WizardState
function buildWizardState(
  sectorInfo: StepSectorInfoValues,
  cameraConfig: StepCameraConfigValues,
  esp32Config: StepESP32ConfigValues
): WizardState {
  const skippedSteps = new Set<number>();
  if (cameraConfig.skipped) skippedSteps.add(1);
  if (esp32Config.skipped) skippedSteps.add(2);

  return {
    currentStep: 0,
    sectorInfo,
    cameraConfig,
    esp32Config,
    completedSteps: new Set<number>(),
    skippedSteps,
    dirty: false,
  };
}

// --- Tests ---

describe('Property 4: Wizard step validation rules', () => {
  describe('Step 0 (Sector Info) validation', () => {
    it('accepts valid sector info: node name 1-100 chars and sector selected', () => {
      fc.assert(
        fc.property(
          validSectorInfoArb,
          validCameraConfigArb,
          validEsp32ConfigArb,
          (sectorInfo, cameraConfig, esp32Config) => {
            const state = buildWizardState(sectorInfo, cameraConfig, esp32Config);
            const error = validateStep(0, state);
            expect(error).toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    });

    it('rejects invalid sector info: empty/too-long node name or empty sector', () => {
      fc.assert(
        fc.property(
          invalidSectorInfoArb,
          validCameraConfigArb,
          validEsp32ConfigArb,
          (sectorInfo, cameraConfig, esp32Config) => {
            const state = buildWizardState(sectorInfo, cameraConfig, esp32Config);
            const error = validateStep(0, state);
            expect(error).not.toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('Step 1 (Camera Config) validation', () => {
    it('accepts valid camera config when not skipped', () => {
      fc.assert(
        fc.property(
          validSectorInfoArb,
          validCameraConfigArb,
          validEsp32ConfigArb,
          (sectorInfo, cameraConfig, esp32Config) => {
            const state = buildWizardState(sectorInfo, cameraConfig, esp32Config);
            const error = validateStep(1, state);
            expect(error).toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    });

    it('rejects invalid camera config when not skipped', () => {
      fc.assert(
        fc.property(
          validSectorInfoArb,
          invalidCameraConfigArb,
          validEsp32ConfigArb,
          (sectorInfo, cameraConfig, esp32Config) => {
            const state = buildWizardState(sectorInfo, cameraConfig, esp32Config);
            const error = validateStep(1, state);
            expect(error).not.toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    });

    it('always accepts step 1 when camera is skipped regardless of field values', () => {
      fc.assert(
        fc.property(
          validSectorInfoArb,
          skippedCameraConfigArb,
          validEsp32ConfigArb,
          (sectorInfo, cameraConfig, esp32Config) => {
            const state = buildWizardState(sectorInfo, cameraConfig, esp32Config);
            const error = validateStep(1, state);
            expect(error).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Step 2 (ESP32 Config) validation', () => {
    it('accepts valid ESP32 config when not skipped', () => {
      fc.assert(
        fc.property(
          validSectorInfoArb,
          validCameraConfigArb,
          validEsp32ConfigArb,
          (sectorInfo, cameraConfig, esp32Config) => {
            const state = buildWizardState(sectorInfo, cameraConfig, esp32Config);
            const error = validateStep(2, state);
            expect(error).toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    });

    it('rejects invalid ESP32 config when not skipped', () => {
      fc.assert(
        fc.property(
          validSectorInfoArb,
          validCameraConfigArb,
          invalidEsp32ConfigArb,
          (sectorInfo, cameraConfig, esp32Config) => {
            const state = buildWizardState(sectorInfo, cameraConfig, esp32Config);
            const error = validateStep(2, state);
            expect(error).not.toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    });

    it('always accepts step 2 when ESP32 is skipped regardless of field values', () => {
      fc.assert(
        fc.property(
          validSectorInfoArb,
          validCameraConfigArb,
          skippedEsp32ConfigArb,
          (sectorInfo, cameraConfig, esp32Config) => {
            const state = buildWizardState(sectorInfo, cameraConfig, esp32Config);
            const error = validateStep(2, state);
            expect(error).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Step 3 (Review) validation', () => {
    it('review step always passes validation (no own fields)', () => {
      fc.assert(
        fc.property(
          validSectorInfoArb,
          fc.oneof(validCameraConfigArb, skippedCameraConfigArb),
          fc.oneof(validEsp32ConfigArb, skippedEsp32ConfigArb),
          (sectorInfo, cameraConfig, esp32Config) => {
            const state = buildWizardState(sectorInfo, cameraConfig, esp32Config);
            const error = validateStep(3, state);
            expect(error).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('At least one component rule', () => {
    it('rejects when both camera and ESP32 are skipped', () => {
      fc.assert(
        fc.property(validSectorInfoArb, (sectorInfo) => {
          const state = buildWizardState(
            sectorInfo,
            { rtspUrl: '', resolution: '', confidenceThreshold: '', detectionMode: '', skipped: true },
            { mqttBroker: '', mqttTopic: '', skipped: true }
          );
          const error = validateAtLeastOneComponent(state);
          expect(error).not.toBeNull();
          expect(error).toContain('komponen');
        }),
        { numRuns: 100 }
      );
    });

    it('accepts when camera is configured (ESP32 may or may not be skipped)', () => {
      fc.assert(
        fc.property(
          validSectorInfoArb,
          validCameraConfigArb,
          fc.oneof(validEsp32ConfigArb, skippedEsp32ConfigArb),
          (sectorInfo, cameraConfig, esp32Config) => {
            const state = buildWizardState(sectorInfo, cameraConfig, esp32Config);
            const error = validateAtLeastOneComponent(state);
            expect(error).toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    });

    it('accepts when ESP32 is configured (camera may or may not be skipped)', () => {
      fc.assert(
        fc.property(
          validSectorInfoArb,
          fc.oneof(validCameraConfigArb, skippedCameraConfigArb),
          validEsp32ConfigArb,
          (sectorInfo, cameraConfig, esp32Config) => {
            const state = buildWizardState(sectorInfo, cameraConfig, esp32Config);
            const error = validateAtLeastOneComponent(state);
            expect(error).toBeNull();
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});
