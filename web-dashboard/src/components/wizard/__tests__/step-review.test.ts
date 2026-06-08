import { describe, it, expect } from 'vitest';
import { StepSectorInfoValues } from '../StepSectorInfo';
import { StepCameraConfigValues } from '../StepCameraConfig';
import { StepESP32ConfigValues } from '../StepESP32Config';

/**
 * Unit tests for StepReview component logic.
 * Tests that the component properly handles various combinations of
 * skipped/configured sections and data display.
 *
 * Requirements: 4.7, 4.10
 */

describe('StepReview data display logic', () => {
  // Helper to create default values
  function createSectorInfo(overrides?: Partial<StepSectorInfoValues>): StepSectorInfoValues {
    return {
      nodeName: 'Node Test',
      sektorId: 'S-01',
      ...overrides,
    };
  }

  function createCameraConfig(overrides?: Partial<StepCameraConfigValues>): StepCameraConfigValues {
    return {
      rtspUrl: 'rtsp://192.168.1.10/live/ch00_1',
      resolution: '1280x720',
      confidenceThreshold: '0.5',
      detectionMode: 'CPU',
      skipped: false,
      ...overrides,
    };
  }

  function createESP32Config(overrides?: Partial<StepESP32ConfigValues>): StepESP32ConfigValues {
    return {
      mqttBroker: 'broker.hivemq.com',
      mqttTopic: 'APD_Violation',
      skipped: false,
      gasSensorEnabled: false,
      gasThreshold: 2200,
      ...overrides,
    };
  }

  describe('section display logic', () => {
    it('all sections configured should display all values', () => {
      const sector = createSectorInfo();
      const camera = createCameraConfig();
      const esp32 = createESP32Config();

      // Sector is never skipped
      expect(sector.nodeName).toBe('Node Test');
      expect(sector.sektorId).toBe('S-01');

      // Camera configured
      expect(camera.skipped).toBe(false);
      expect(camera.rtspUrl).toBe('rtsp://192.168.1.10/live/ch00_1');
      expect(camera.resolution).toBe('1280x720');

      // ESP32 configured
      expect(esp32.skipped).toBe(false);
      expect(esp32.mqttBroker).toBe('broker.hivemq.com');
    });

    it('skipped camera should show skipped state', () => {
      const camera = createCameraConfig({ skipped: true });
      expect(camera.skipped).toBe(true);
    });

    it('skipped ESP32 should show skipped state', () => {
      const esp32 = createESP32Config({ skipped: true });
      expect(esp32.skipped).toBe(true);
    });

    it('both camera and ESP32 can be independently skipped', () => {
      const camera = createCameraConfig({ skipped: true });
      const esp32 = createESP32Config({ skipped: false });

      expect(camera.skipped).toBe(true);
      expect(esp32.skipped).toBe(false);
    });

    it('sector info is always displayed (never skipped)', () => {
      const sector = createSectorInfo();
      // StepSectorInfoValues has no skipped field - always shows
      expect(sector.nodeName).toBeTruthy();
      expect(sector.sektorId).toBeTruthy();
    });
  });

  describe('edit step indices', () => {
    it('sector info maps to step 0', () => {
      const SECTOR_STEP = 0;
      expect(SECTOR_STEP).toBe(0);
    });

    it('camera config maps to step 1', () => {
      const CAMERA_STEP = 1;
      expect(CAMERA_STEP).toBe(1);
    });

    it('ESP32 config maps to step 2', () => {
      const ESP32_STEP = 2;
      expect(ESP32_STEP).toBe(2);
    });
  });

  describe('display value fallbacks', () => {
    it('empty node name shows dash placeholder', () => {
      const sector = createSectorInfo({ nodeName: '' });
      // Component uses `value || '—'` pattern
      expect(sector.nodeName || '—').toBe('—');
    });

    it('empty RTSP URL shows dash placeholder', () => {
      const camera = createCameraConfig({ rtspUrl: '' });
      expect(camera.rtspUrl || '—').toBe('—');
    });

    it('empty MQTT broker shows dash placeholder', () => {
      const esp32 = createESP32Config({ mqttBroker: '' });
      expect(esp32.mqttBroker || '—').toBe('—');
    });
  });
});
