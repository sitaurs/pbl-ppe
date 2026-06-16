// Feature: node-detail-tree-view, Property 7: Composition change preserves invariant (unused fields become null)
// **Validates: Requirements 7.4, 7.7**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildNodeDataFromWizardState, WizardState } from '../NodeWizard';
import type { StepCameraConfigValues } from '../StepCameraConfig';
import type { StepESP32ConfigValues } from '../StepESP32Config';
import type { StepSectorInfoValues } from '../StepSectorInfo';

// --- Arbitraries (Generators) ---

const sectorInfoArb: fc.Arbitrary<StepSectorInfoValues> = fc.record({
  nodeName: fc.string({ minLength: 1, maxLength: 100 }),
  sektorId: fc.string({ minLength: 1, maxLength: 10 }),
  picName: fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0),
  picPhone: fc.constantFrom('', '6281234567890', '081234567890'),
});

// Camera config that is NOT skipped (fully populated)
const activeCameraConfigArb: fc.Arbitrary<StepCameraConfigValues> = fc.record({
  rtspUrl: fc.string({ minLength: 7, maxLength: 100 }).map((s) => `rtsp://${s}`),
  resolution: fc.constantFrom('640x480', '1280x720', '1920x1080'),
  confidenceThreshold: fc.double({ min: 0.01, max: 1.0, noNaN: true }).map((n) => n.toFixed(2)),
  detectionMode: fc.constantFrom('CPU', 'GPU'),
  skipped: fc.constant(false),
});

// Camera config that IS skipped
const skippedCameraConfigArb: fc.Arbitrary<StepCameraConfigValues> = fc.record({
  rtspUrl: fc.string({ minLength: 0, maxLength: 100 }),
  resolution: fc.string({ minLength: 0, maxLength: 20 }),
  confidenceThreshold: fc.string({ minLength: 0, maxLength: 5 }),
  detectionMode: fc.string({ minLength: 0, maxLength: 5 }),
  skipped: fc.constant(true),
});

// ESP32 config that is NOT skipped (fully populated)
const activeEsp32ConfigArb: fc.Arbitrary<StepESP32ConfigValues> = fc.record({
  mqttBroker: fc.string({ minLength: 1, maxLength: 256 }),
  mqttTopic: fc.string({ minLength: 1, maxLength: 128 }),
  skipped: fc.constant(false),
  gasSensorEnabled: fc.boolean(),
  gasThreshold: fc.integer({ min: 0, max: 4095 }),
});

// ESP32 config that IS skipped
const skippedEsp32ConfigArb: fc.Arbitrary<StepESP32ConfigValues> = fc.record({
  mqttBroker: fc.string({ minLength: 0, maxLength: 256 }),
  mqttTopic: fc.string({ minLength: 0, maxLength: 128 }),
  skipped: fc.constant(true),
  gasSensorEnabled: fc.constant(false),
  gasThreshold: fc.constant(2200),
});

// Helper to build a WizardState from components
function makeWizardState(
  sectorInfo: StepSectorInfoValues,
  cameraConfig: StepCameraConfigValues,
  esp32Config: StepESP32ConfigValues
): WizardState {
  const skippedSteps = new Set<number>();
  if (cameraConfig.skipped) skippedSteps.add(1);
  if (esp32Config.skipped) skippedSteps.add(2);

  return {
    currentStep: 3, // Review step (ready to save)
    sectorInfo,
    cameraConfig,
    esp32Config,
    completedSteps: new Set<number>([0, 1, 2]),
    skippedSteps,
    dirty: true,
  };
}

describe('Property 7: Composition change preserves invariant (unused fields become null)', () => {
  it('when camera is skipped, camera and detection fields in NodeData are null', () => {
    fc.assert(
      fc.property(
        sectorInfoArb,
        skippedCameraConfigArb,
        activeEsp32ConfigArb,
        (sectorInfo, cameraConfig, esp32Config) => {
          const state = makeWizardState(sectorInfo, cameraConfig, esp32Config);
          const result = buildNodeDataFromWizardState(state);

          // Camera and detection MUST be null when camera is skipped
          expect(result.camera).toBeNull();
          expect(result.detection).toBeNull();

          // ESP32 MUST be populated (non-null) since it's not skipped
          expect(result.esp32).not.toBeNull();
          expect(result.esp32!.mqttBroker).toBe(esp32Config.mqttBroker);
          expect(result.esp32!.mqttTopic).toBe(esp32Config.mqttTopic);
          expect(result.esp32!.enabled).toBe(true);

          // cameraSource falls back to "0" when camera is skipped
          expect(result.cameraSource).toBe('0');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('when ESP32 is skipped, esp32 field in NodeData is null', () => {
    fc.assert(
      fc.property(
        sectorInfoArb,
        activeCameraConfigArb,
        skippedEsp32ConfigArb,
        (sectorInfo, cameraConfig, esp32Config) => {
          const state = makeWizardState(sectorInfo, cameraConfig, esp32Config);
          const result = buildNodeDataFromWizardState(state);

          // ESP32 MUST be null when esp32 is skipped
          expect(result.esp32).toBeNull();

          // Camera and detection MUST be populated (non-null) since camera is not skipped
          expect(result.camera).not.toBeNull();
          expect(result.camera!.url).toBe(cameraConfig.rtspUrl);
          expect(result.camera!.resolution).toBe(cameraConfig.resolution);
          expect(result.camera!.protocol).toBe('rtsp'); // rtspUrl starts with "rtsp://"

          expect(result.detection).not.toBeNull();
          expect(result.detection!.confidenceThreshold).toBeCloseTo(
            parseFloat(cameraConfig.confidenceThreshold) || 0.5,
            2
          );

          // cameraSource should be the rtspUrl
          expect(result.cameraSource).toBe(cameraConfig.rtspUrl);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('when neither is skipped, all fields (camera, esp32, detection) are populated', () => {
    fc.assert(
      fc.property(
        sectorInfoArb,
        activeCameraConfigArb,
        activeEsp32ConfigArb,
        (sectorInfo, cameraConfig, esp32Config) => {
          const state = makeWizardState(sectorInfo, cameraConfig, esp32Config);
          const result = buildNodeDataFromWizardState(state);

          // All fields MUST be non-null
          expect(result.camera).not.toBeNull();
          expect(result.esp32).not.toBeNull();
          expect(result.detection).not.toBeNull();

          // Camera fields preserved
          expect(result.camera!.url).toBe(cameraConfig.rtspUrl);
          expect(result.camera!.resolution).toBe(cameraConfig.resolution);

          // ESP32 fields preserved
          expect(result.esp32!.mqttBroker).toBe(esp32Config.mqttBroker);
          expect(result.esp32!.mqttTopic).toBe(esp32Config.mqttTopic);

          // Detection derived from camera config
          expect(result.detection!.mode).toBe(
            cameraConfig.detectionMode === 'GPU' ? 'scheduled' : 'realtime'
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('composition transitions: changing from camera+esp32 to camera-only nullifies esp32', () => {
    fc.assert(
      fc.property(
        sectorInfoArb,
        activeCameraConfigArb,
        activeEsp32ConfigArb,
        (sectorInfo, cameraConfig, esp32Config) => {
          // First: build with both active (camera+esp32)
          const fullState = makeWizardState(sectorInfo, cameraConfig, esp32Config);
          const fullResult = buildNodeDataFromWizardState(fullState);

          // Confirm all fields are populated
          expect(fullResult.camera).not.toBeNull();
          expect(fullResult.esp32).not.toBeNull();
          expect(fullResult.detection).not.toBeNull();

          // Now: transition to camera-only by skipping ESP32
          const cameraOnlyState = makeWizardState(
            sectorInfo,
            cameraConfig,
            { ...esp32Config, skipped: true }
          );
          const cameraOnlyResult = buildNodeDataFromWizardState(cameraOnlyState);

          // ESP32 field MUST become null
          expect(cameraOnlyResult.esp32).toBeNull();

          // Camera and detection MUST remain populated and unchanged
          expect(cameraOnlyResult.camera).not.toBeNull();
          expect(cameraOnlyResult.camera!.url).toBe(fullResult.camera!.url);
          expect(cameraOnlyResult.camera!.resolution).toBe(fullResult.camera!.resolution);
          expect(cameraOnlyResult.detection).not.toBeNull();
          expect(cameraOnlyResult.detection!.mode).toBe(fullResult.detection!.mode);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('composition transitions: changing from camera+esp32 to esp32-only nullifies camera and detection', () => {
    fc.assert(
      fc.property(
        sectorInfoArb,
        activeCameraConfigArb,
        activeEsp32ConfigArb,
        (sectorInfo, cameraConfig, esp32Config) => {
          // First: build with both active (camera+esp32)
          const fullState = makeWizardState(sectorInfo, cameraConfig, esp32Config);
          const fullResult = buildNodeDataFromWizardState(fullState);

          // Confirm all fields are populated
          expect(fullResult.camera).not.toBeNull();
          expect(fullResult.esp32).not.toBeNull();
          expect(fullResult.detection).not.toBeNull();

          // Now: transition to esp32-only by skipping Camera
          const esp32OnlyState = makeWizardState(
            sectorInfo,
            { ...cameraConfig, skipped: true },
            esp32Config
          );
          const esp32OnlyResult = buildNodeDataFromWizardState(esp32OnlyState);

          // Camera and detection fields MUST become null
          expect(esp32OnlyResult.camera).toBeNull();
          expect(esp32OnlyResult.detection).toBeNull();

          // ESP32 MUST remain populated and unchanged
          expect(esp32OnlyResult.esp32).not.toBeNull();
          expect(esp32OnlyResult.esp32!.mqttBroker).toBe(fullResult.esp32!.mqttBroker);
          expect(esp32OnlyResult.esp32!.mqttTopic).toBe(fullResult.esp32!.mqttTopic);

          // cameraSource should fall back to "0"
          expect(esp32OnlyResult.cameraSource).toBe('0');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Bug 2 (PIC) — exploration property test (task 1b) ─────────────────────
//
// **Validates: Requirements 1.3, 1.4** (Current Behavior bug condition PIC).
//
// Property (Property 3 di design.md):
//   FOR ALL X WHERE isBugConditionPic(X) DO
//     result ← buildNodeDataFromWizardState'(X)
//     ASSERT result.picName ≠ ''
//     ASSERT result.picPhone matches /^62[0-9]{8,14}$/
//
// **EXPECTED OUTCOME pada UNFIXED code**: Test FAILS — `buildNodeDataFromWizardState`
// hardcode `picName: initialData?.picName || ''` dan `picPhone: initialData?.picPhone || ''`,
// dan `StepSectorInfoValues` belum punya field `picName` / `picPhone` untuk dibaca.
// Counterexample: state dengan user mengisi PIC tetap menghasilkan
// `result.picName === ''` dan `result.picPhone === ''`.

describe('Bug 2 (PIC) exploration — buildNodeDataFromWizardState memuat picName & picPhone', () => {
  // Generator picName non-empty, max 100 char.
  const picNameArb: fc.Arbitrary<string> = fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0);

  // Generator picPhone valid format: hasil normalisasi adalah `62` + 8..14 digit.
  // Untuk exploration test, kita pakai generator yang menghasilkan input sudah
  // dalam format `62…` agar bug condition (input ada → output kosong) jelas.
  const picPhoneArb: fc.Arbitrary<string> = fc
    .stringMatching(/^62[0-9]{8,14}$/);

  // Type augmentation: kami berasumsi setelah fix, StepSectorInfoValues
  // memiliki field picName dan picPhone. Test ini sengaja menempatkan keduanya
  // di sectorInfo agar kontrak baru terdokumentasi.
  type SectorInfoWithPic = StepSectorInfoValues & {
    picName: string;
    picPhone: string;
  };

  const sectorInfoWithPicArb: fc.Arbitrary<SectorInfoWithPic> = fc.record({
    nodeName: fc.string({ minLength: 1, maxLength: 100 }),
    sektorId: fc.string({ minLength: 1, maxLength: 10 }),
    picName: picNameArb,
    picPhone: picPhoneArb,
  });

  it('result.picName tidak boleh kosong saat user mengisi picName', () => {
    fc.assert(
      fc.property(
        sectorInfoWithPicArb,
        activeCameraConfigArb,
        activeEsp32ConfigArb,
        (sectorInfo, cameraConfig, esp32Config) => {
          // Bangun state dengan sectorInfo memuat picName/picPhone.
          // Cast ke StepSectorInfoValues karena tipe lama belum mengenal
          // dua field tersebut — fix akan menambahkan keduanya.
          const state = makeWizardState(
            sectorInfo as unknown as StepSectorInfoValues,
            cameraConfig,
            esp32Config,
          );
          const result = buildNodeDataFromWizardState(state);

          // PROPERTY: Pada FIXED code, builder membaca dari state.sectorInfo.picName.
          // Pada UNFIXED code, builder hardcode `''` → assertion gagal.
          expect(
            result.picName,
            `Builder mengembalikan picName='${result.picName}' meski user mengisi '${sectorInfo.picName}'`,
          ).not.toBe('');
        },
      ),
      { numRuns: 50 },
    );
  });

  it('result.picPhone match /^62[0-9]{8,14}$/ saat user mengisi picPhone', () => {
    fc.assert(
      fc.property(
        sectorInfoWithPicArb,
        activeCameraConfigArb,
        activeEsp32ConfigArb,
        (sectorInfo, cameraConfig, esp32Config) => {
          const state = makeWizardState(
            sectorInfo as unknown as StepSectorInfoValues,
            cameraConfig,
            esp32Config,
          );
          const result = buildNodeDataFromWizardState(state);

          // PROPERTY: Pada FIXED code, builder memanggil normalizePhone(state.sectorInfo.picPhone).
          // Pada UNFIXED code, builder mengembalikan `''` → assertion gagal.
          expect(
            result.picPhone,
            `Builder mengembalikan picPhone='${result.picPhone}' meski user mengisi '${sectorInfo.picPhone}'`,
          ).toMatch(/^62[0-9]{8,14}$/);
        },
      ),
      { numRuns: 50 },
    );
  });
});


// ─── Bug 2 (PIC) — Preservation property tests (task 2b) ──────────────────────
//
// **Validates: Requirements 3.4** (Unchanged Behavior — `picPhone` `62…` di
// `initialData` tetap dikembalikan apa adanya, idempoten).
//
// Property 5 (Preservation) di design.md:
//
//   FOR ALL X (NodeMutation) WHERE X.initialData.picPhone matches /^62[0-9]{8,14}$/:
//     buildNodeDataFromWizardState(state, X.initialData).picPhone
//       === X.initialData.picPhone   (idempotent re-normalisasi)
//
// **EXPECTED OUTCOME pada UNFIXED code**: Tests PASS.
// Pada UNFIXED code, builder hardcode `picPhone: initialData?.picPhone || ''`,
// jadi bila `initialData.picPhone === '6281…'`, hasilnya juga `'6281…'`.
// Pada FIXED code, builder akan memanggil `normalizePhone(state.sectorInfo.picPhone)`,
// dan karena `normalizePhone` idempoten (Property 4), hasil tetap `'6281…'`.
//
// Test ini mengunci kontrak: nilai `picPhone` `62…` di `initialData` SHALL
// tetap dipreservasi setelah fix.

describe('Bug 2 (PIC) preservation — picPhone 62… di initialData tetap idempoten', () => {
  // Generator picPhone valid format 62 + 8..14 digit (sudah ternormalisasi).
  const alreadyNormalizedPhoneArb: fc.Arbitrary<string> = fc.stringMatching(
    /^62[0-9]{8,14}$/,
  );

  // Generator picName non-empty (untuk initialData).
  const initialPicNameArb: fc.Arbitrary<string> = fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0);

  it('jika initialData.picPhone sudah dalam format 62…, builder mengembalikan nilai persis sama', () => {
    fc.assert(
      fc.property(
        sectorInfoArb,
        activeCameraConfigArb,
        activeEsp32ConfigArb,
        alreadyNormalizedPhoneArb,
        initialPicNameArb,
        (sectorInfo, cameraConfig, esp32Config, initialPicPhone, initialPicName) => {
          // Wizard `createInitialState` prefill `state.sectorInfo.picName/picPhone`
          // dari `initialData` saat edit flow. Test ini meniru hasil prefill
          // tersebut secara eksplisit agar builder membaca nilai `62…`
          // langsung dari state (bukan dari initialData yang lama di-hardcode).
          const sectorInfoPrefilled: StepSectorInfoValues = {
            ...sectorInfo,
            picName: initialPicName,
            picPhone: initialPicPhone,
          };
          const state = makeWizardState(sectorInfoPrefilled, cameraConfig, esp32Config);

          // Bangun initialData dengan picPhone sudah ternormalisasi.
          // Cast longgar karena tipe lama belum mengenal field PIC penuh —
          // tetapi properti `picPhone` & `picName` ada di NodeData schema.
          const initialData = {
            picName: initialPicName,
            picPhone: initialPicPhone,
          } as Parameters<typeof buildNodeDataFromWizardState>[1];

          const result = buildNodeDataFromWizardState(state, initialData);

          // PROPERTY 5 (preservation idempotence):
          // `normalizePhone` idempoten untuk input yang sudah `62…`,
          // jadi `state.sectorInfo.picPhone === '62…'` → builder mengembalikan
          // nilai persis sama, mengunci kontrak edit-flow round-trip.
          expect(result.picPhone).toBe(initialPicPhone);
        },
      ),
      { numRuns: 50 },
    );
  });

});
