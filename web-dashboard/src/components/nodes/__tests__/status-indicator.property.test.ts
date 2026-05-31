// Feature: node-detail-tree-view, Property 2: Status indicator color and animation mapping
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { STATUS_CONFIG } from '../StatusIndicator';
import type { ComponentStatus } from '@/lib/node-types';

// --- Expected mapping (ground truth from requirements) ---

const EXPECTED_MAPPING: Record<
  ComponentStatus,
  { color: string; hasAnimation: boolean; animationDuration: string | null }
> = {
  online: { color: '#22c55e', hasAnimation: true, animationDuration: '1.5s' },
  offline: { color: '#ef4444', hasAnimation: false, animationDuration: null },
  degraded: { color: '#f59e0b', hasAnimation: true, animationDuration: '3s' },
  unconfigured: { color: '#9ca3af', hasAnimation: false, animationDuration: null },
};

// --- Arbitraries ---

const allStatusValues: ComponentStatus[] = ['online', 'offline', 'degraded', 'unconfigured'];

const componentStatusArb: fc.Arbitrary<ComponentStatus> = fc.constantFrom(...allStatusValues);

// --- Property Tests ---

describe('Property 2: Status indicator color and animation mapping', () => {
  it('every status value produces the correct hex color', () => {
    fc.assert(
      fc.property(componentStatusArb, (status) => {
        const config = STATUS_CONFIG[status];
        const expected = EXPECTED_MAPPING[status];

        expect(config.color).toBe(expected.color);
      }),
      { numRuns: 100 }
    );
  });

  it('online and degraded statuses have pulse animation, offline and unconfigured do not', () => {
    fc.assert(
      fc.property(componentStatusArb, (status) => {
        const config = STATUS_CONFIG[status];
        const expected = EXPECTED_MAPPING[status];

        if (expected.hasAnimation) {
          expect(config.animation).not.toBeNull();
          expect(config.animation).toContain('pulse');
        } else {
          expect(config.animation).toBeNull();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('online status has pulse animation with 1.5s duration', () => {
    fc.assert(
      fc.property(fc.constant('online' as ComponentStatus), (status) => {
        const config = STATUS_CONFIG[status];

        expect(config.animation).not.toBeNull();
        expect(config.animation).toContain('1.5s');
      }),
      { numRuns: 100 }
    );
  });

  it('degraded status has pulse animation with 3s duration', () => {
    fc.assert(
      fc.property(fc.constant('degraded' as ComponentStatus), (status) => {
        const config = STATUS_CONFIG[status];

        expect(config.animation).not.toBeNull();
        expect(config.animation).toContain('3s');
      }),
      { numRuns: 100 }
    );
  });

  it('all valid ComponentStatus values are covered in STATUS_CONFIG', () => {
    fc.assert(
      fc.property(componentStatusArb, (status) => {
        expect(STATUS_CONFIG[status]).toBeDefined();
        expect(STATUS_CONFIG[status].color).toBeDefined();
        expect(typeof STATUS_CONFIG[status].color).toBe('string');
        expect(STATUS_CONFIG[status].color).toMatch(/^#[0-9a-f]{6}$/);
      }),
      { numRuns: 100 }
    );
  });

  it('animation string contains the correct keyframe name for animated statuses', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('online' as ComponentStatus, 'degraded' as ComponentStatus),
        (status) => {
          const config = STATUS_CONFIG[status];

          expect(config.animation).not.toBeNull();
          // Animation should reference pulse keyframe name
          expect(config.animation).toMatch(/^pulse-\w+/);
          // Animation should have infinite iteration
          expect(config.animation).toContain('infinite');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('color mapping is a bijection - each status maps to a unique color', () => {
    fc.assert(
      fc.property(
        componentStatusArb,
        componentStatusArb,
        (status1, status2) => {
          if (status1 !== status2) {
            expect(STATUS_CONFIG[status1].color).not.toBe(STATUS_CONFIG[status2].color);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
