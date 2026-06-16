// Bug 2 (PIC) — exploration PBT untuk helper `normalizePhone` (task 1b).
//
// Validates: Requirements 1.3, 1.4 (Current Behavior — bug condition PIC).
//
// Property (Property 4 di design.md):
//   FOR ALL raw WHERE raw is digits-only-after-strip AND len(digits) >= 9:
//     normalizePhone(raw) matches /^62[0-9]{8,14}$/
//     normalizePhone(normalizePhone(raw)) === normalizePhone(raw)   // idempoten
//
// **EXPECTED OUTCOME pada UNFIXED code**: Test FAILS — file `@/lib/phone.ts`
// belum ada, sehingga import gagal saat module-resolution. Kegagalan ini
// mengkonfirmasi sisi helper Bug 2 (lihat bugfix.md klausa 1.3/1.4).
//
// Setelah fix (task 4.1) membuat helper, test ini akan PASS.

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// IMPORT YANG DIHARAPKAN GAGAL pada UNFIXED code (file belum dibuat).
// Pada CFixed code, file `web-dashboard/src/lib/phone.ts` akan berisi
// fungsi `normalizePhone(input: string): string` dan `isValidPhone(input: string): boolean`.
import { normalizePhone, isValidPhone } from '@/lib/phone';

const VALID_OUTPUT_RE = /^62[0-9]{8,14}$/;

/**
 * Generator nomor "raw" yang setelah strip non-digit menghasilkan ≥ 9 digit
 * dengan beberapa kemungkinan prefix:
 *   - prefix "+62" → 62
 *   - prefix "0"   → 62
 *   - prefix "62"  → tetap
 *   - langsung digit (mis. "81358959349") → 62 + digit
 *
 * Tujuan generator: menggambarkan ruang input "user mengetik nomor WA Indonesia".
 */
const validRawPhoneArb: fc.Arbitrary<string> = fc.oneof(
  // Prefix +62, 8-13 digit setelah +62 → total 10-15 digit setelah normalisasi
  fc.tuple(
    fc.constant('+62'),
    fc.stringMatching(/^[0-9]{8,13}$/),
  ).map(([p, d]) => p + d),
  // Prefix 62
  fc.tuple(
    fc.constant('62'),
    fc.stringMatching(/^[0-9]{8,13}$/),
  ).map(([p, d]) => p + d),
  // Prefix 0
  fc.tuple(
    fc.constant('0'),
    fc.stringMatching(/^[0-9]{9,13}$/),
  ).map(([p, d]) => p + d),
  // Langsung digit (mis. 8…)
  fc.stringMatching(/^[89][0-9]{8,13}$/),
);

/**
 * Generator yang menyisipkan karakter non-digit (spasi, '-', '.') secara acak
 * di antara digit untuk mensimulasikan input yang "kotor".
 */
const messyPhoneArb: fc.Arbitrary<string> = validRawPhoneArb.chain((clean) =>
  fc.array(fc.constantFrom(' ', '-', '.', '\t'), { minLength: 0, maxLength: 5 }).map(
    (seps) => {
      // Sisipkan separator setiap beberapa digit.
      let result = '';
      for (let i = 0; i < clean.length; i++) {
        result += clean[i];
        if (seps.length > 0 && i % 3 === 2) {
          result += seps[i % seps.length];
        }
      }
      return result;
    },
  ),
);

describe('Property 4: normalizePhone regex + idempotence (Bug 2 exploration)', () => {
  it('untuk semua input valid setelah strip non-digit, output match /^62[0-9]{8,14}$/', () => {
    fc.assert(
      fc.property(validRawPhoneArb, (raw) => {
        const out = normalizePhone(raw);
        expect(out).toMatch(VALID_OUTPUT_RE);
      }),
      { numRuns: 200 },
    );
  });

  it('idempoten: normalizePhone(normalizePhone(x)) === normalizePhone(x)', () => {
    fc.assert(
      fc.property(validRawPhoneArb, (raw) => {
        const once = normalizePhone(raw);
        const twice = normalizePhone(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 200 },
    );
  });

  it('input kotor (dengan spasi/dash/dot) ternormalisasi ke format 62…', () => {
    fc.assert(
      fc.property(messyPhoneArb, (messy) => {
        const out = normalizePhone(messy);
        expect(out).toMatch(VALID_OUTPUT_RE);
      }),
      { numRuns: 100 },
    );
  });

  it('isValidPhone(s) === true untuk input valid', () => {
    fc.assert(
      fc.property(validRawPhoneArb, (raw) => {
        expect(isValidPhone(raw)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('input kosong / hanya non-digit menghasilkan string kosong', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone('   ')).toBe('');
    expect(normalizePhone('abcdef')).toBe('');
  });
});
