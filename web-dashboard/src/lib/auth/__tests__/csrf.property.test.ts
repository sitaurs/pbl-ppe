// Feature: auth-rbac-system, Property 10: CSRF token uniqueness
// **Validates: Requirements 11.2**

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { generateCsrfToken, verifyCsrfToken } from "../csrf";

/**
 * Token CSRF di-generate dari `crypto.randomBytes(32)` lalu di-encode base64url
 * tanpa padding. Panjang yang diharapkan = ceil(32 * 4 / 3) = 43 karakter.
 */
const EXPECTED_TOKEN_LENGTH = 43;
const BASE64URL_ALPHABET = /^[A-Za-z0-9_-]+$/;

describe("CSRF token property tests (Property 10)", () => {
  /**
   * Property 10.1: Uniqueness — N token yang dibangkitkan oleh
   * `generateCsrfToken()` haruslah seluruhnya berbeda (collision negligible
   * untuk 256-bit entropy). Diuji dengan N ∈ [100, 10000] sampel.
   */
  it("Property 10.1: N tokens yang dibangkitkan semuanya unik (|set|===N)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 10000 }), (n) => {
        const samples: string[] = new Array(n);
        for (let i = 0; i < n; i++) {
          samples[i] = generateCsrfToken();
        }
        const unique = new Set(samples);
        expect(unique.size).toBe(n);
      }),
      { numRuns: 5 }
    );
  });

  /**
   * Property 10.2: Setiap token memiliki panjang tepat 43 karakter
   * (base64url tanpa padding dari 32-byte random).
   */
  it("Property 10.2: setiap token panjang 43 karakter (base64url 32-byte)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), (n) => {
        for (let i = 0; i < n; i++) {
          const token = generateCsrfToken();
          expect(token.length).toBe(EXPECTED_TOKEN_LENGTH);
        }
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property 10.3: Setiap karakter token berasal dari alphabet base64url
   * (`A-Z`, `a-z`, `0-9`, `-`, `_`) — tidak boleh muncul `+`, `/`, atau `=`.
   */
  it("Property 10.3: setiap token hanya berisi karakter base64url [A-Za-z0-9_-]", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), (n) => {
        for (let i = 0; i < n; i++) {
          const token = generateCsrfToken();
          expect(token).toMatch(BASE64URL_ALPHABET);
        }
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property 10.4: `verifyCsrfToken` bersifat fungsional benar:
   *   - dua nilai identik selalu return `true`
   *   - dua nilai berbeda selalu return `false`
   *   - input null/undefined/non-string selalu return `false`
   * (constant-time tidak diuji secara timing — hanya sifat fungsional.)
   */
  it("Property 10.4: verifyCsrfToken — same returns true, different returns false", () => {
    // 4a: token yang sama selalu cocok dengan dirinya sendiri
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (n) => {
        for (let i = 0; i < n; i++) {
          const t = generateCsrfToken();
          expect(verifyCsrfToken(t, t)).toBe(true);
        }
      }),
      { numRuns: 5 }
    );

    // 4b: dua token yang berbeda hampir pasti tidak cocok
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), (n) => {
        for (let i = 0; i < n; i++) {
          const a = generateCsrfToken();
          const b = generateCsrfToken();
          // a !== b dengan probabilitas 1 - 2^-256
          expect(a).not.toBe(b);
          expect(verifyCsrfToken(a, b)).toBe(false);
        }
      }),
      { numRuns: 5 }
    );

    // 4c: input invalid (null/undefined/non-string) selalu false
    const stored = generateCsrfToken();
    expect(verifyCsrfToken(null, stored)).toBe(false);
    expect(verifyCsrfToken(undefined, stored)).toBe(false);
    // panjang berbeda → false (early return)
    expect(verifyCsrfToken("short", stored)).toBe(false);
    // panjang sama tapi isi berbeda → false
    const tampered = stored.slice(0, -1) + (stored.endsWith("A") ? "B" : "A");
    expect(tampered.length).toBe(stored.length);
    expect(verifyCsrfToken(tampered, stored)).toBe(false);
  });
});
