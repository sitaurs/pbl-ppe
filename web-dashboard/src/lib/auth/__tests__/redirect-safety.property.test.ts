// Feature: auth-rbac-system, Property 14: Redirect param safety
// **Validates: Requirements 14.3**
//
// Helper diuji: `src/lib/auth/redirect-safety.ts`
// Aturan (sesuai design.md §Property 14): target SHALL `startsWith('/')`
// AND NOT `startsWith('//')` AND NOT match `/^https?:\/\//i`
// AND NOT contain control char (\u0000-\u001f atau \u007f).

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  isSafeRedirectTarget,
  safeRedirectOrDefault,
} from "../redirect-safety";

// ---------------------------------------------------------------------------
// Oracle: Definisi "safe" yang ditulis ulang independen, dipakai sebagai
// reference untuk membandingkan keputusan helper terhadap input arbitrary.
// ---------------------------------------------------------------------------
const CONTROL_CHAR_REGEX = /[\u0000-\u001f\u007f]/;
function oracleIsSafe(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.length === 0) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (/^https?:\/\//i.test(value)) return false;
  if (CONTROL_CHAR_REGEX.test(value)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Karakter aman untuk path: huruf/angka/`-`/`_`/`.`/`~`/`/` (tanpa control). */
const safePathCharArb = fc.constantFrom(
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~/".split(
    "",
  ),
);

/** Path yang valid: leading `/`, tidak diawali `//`, tanpa control char. */
const safePathArb = fc
  .tuple(
    fc.constantFrom(...("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~".split(""))),
    fc.array(safePathCharArb, { minLength: 0, maxLength: 80 }),
  )
  .map(([head, rest]) => "/" + head + rest.join(""));

/** Skenario unsafe terkonstruksi yang harus selalu ditolak. */
const constructedUnsafeArb = fc.constantFrom(
  "",                                  // empty
  "foo/bar",                           // relative tanpa leading slash
  "foo",                               // no slash sama sekali
  "//evil.com",                        // protocol-relative
  "//evil.com/path",
  "///triple-slash",
  "http://evil.com",                   // absolute http
  "https://evil.com/path",             // absolute https
  "HTTP://EVIL.COM",                   // case-insensitive
  "HtTpS://evil.com",
  "/path\rinjection",                  // CR injection
  "/path\ninjection",                  // LF injection
  "/path\r\nSet-Cookie: x=y",          // CRLF header injection
  "/null\u0000byte",                   // NUL byte
  "/tab\tafter",                       // tab (control \u0009)
  "/del\u007fchar",                    // DEL
  "\u0000",                            // bare NUL
  "\r\n",                              // bare CRLF
  "\\evil",                            // backslash root (bukan '/')
  "javascript:alert(1)",               // skema lain
  "data:text/html,foo",
);

/** Random raw string (apapun) untuk fuzz consistency dengan oracle. */
const randomStringArb = fc.string({ minLength: 0, maxLength: 120 });

/** Non-string nilai untuk membuktikan helper tahan terhadap input non-string. */
const nonStringArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.boolean(),
  fc.object(),
  fc.array(fc.anything(), { maxLength: 3 }),
);

describe("redirect-safety property tests (Property 14)", () => {
  /**
   * Property 14.1 — rejects unsafe.
   * Untuk setiap skenario unsafe terkonstruksi (`//evil`, `http://`,
   * `https://`, mengandung CR/LF/NUL, kosong, tanpa leading `/`, dst.),
   * `isSafeRedirectTarget` HARUS mengembalikan `false`.
   */
  it("Property 14.1: input unsafe terkonstruksi selalu ditolak", () => {
    fc.assert(
      fc.property(constructedUnsafeArb, (value) => {
        expect(isSafeRedirectTarget(value)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * Property 14.2 — accepts safe.
   * Untuk path apa pun yang dibangun dengan leading single `/`, karakter
   * non-control, dan tidak diawali `//`/`http://`/`https://`,
   * `isSafeRedirectTarget` HARUS mengembalikan `true`.
   */
  it("Property 14.2: path lokal yang valid selalu diterima", () => {
    fc.assert(
      fc.property(safePathArb, (value) => {
        // Pre-kondisi generator: pastikan path benar-benar safe oleh oracle.
        fc.pre(oracleIsSafe(value));
        expect(isSafeRedirectTarget(value)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  /**
   * Property 14.3 — rejects relative tanpa leading slash.
   * Sembarang string tanpa awalan `/` HARUS ditolak.
   */
  it("Property 14.3: string tanpa leading slash selalu ditolak", () => {
    const noLeadingSlashArb = fc
      .string({ minLength: 1, maxLength: 60 })
      .filter((s) => !s.startsWith("/"));
    fc.assert(
      fc.property(noLeadingSlashArb, (value) => {
        expect(isSafeRedirectTarget(value)).toBe(false);
      }),
      { numRuns: 300 },
    );
  });

  /**
   * Property 14.4 — rejects empty / non-string / null-like.
   * Empty string dan tipe non-string apa pun HARUS ditolak.
   */
  it("Property 14.4: empty string dan non-string selalu ditolak", () => {
    expect(isSafeRedirectTarget("")).toBe(false);
    fc.assert(
      fc.property(nonStringArb, (value) => {
        expect(isSafeRedirectTarget(value)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * Property 14.5 — `safeRedirectOrDefault` consistency.
   * Untuk semua nilai `value` dan `defaultPath`:
   *   - Jika `isSafeRedirectTarget(value)` → output === `value`.
   *   - Selain itu → output === `defaultPath`.
   */
  it("Property 14.5: safeRedirectOrDefault konsisten dengan isSafeRedirectTarget", () => {
    const valueArb = fc.oneof(
      safePathArb,
      constructedUnsafeArb,
      randomStringArb,
      nonStringArb,
    );
    const defaultArb = fc.constantFrom(
      "/",
      "/dashboard",
      "/admin",
      "/login",
      "/sektor/lt-1",
    );
    fc.assert(
      fc.property(valueArb, defaultArb, (value, defaultPath) => {
        const result = safeRedirectOrDefault(value, defaultPath);
        if (isSafeRedirectTarget(value)) {
          expect(result).toBe(value);
        } else {
          expect(result).toBe(defaultPath);
        }
      }),
      { numRuns: 500 },
    );
  });

  /**
   * Property 14.6 — equivalence with oracle for fuzz inputs.
   * Untuk string acak apa pun, keputusan helper HARUS identik dengan oracle
   * yang ditulis ulang independen di file ini.
   */
  it("Property 14.6: helper konsisten dengan oracle untuk input acak", () => {
    const fuzzArb = fc.oneof(
      randomStringArb,
      // Sengaja cantumkan sequence yang mengandung control char untuk memperkuat coverage.
      fc
        .tuple(
          fc.constantFrom("/", "//", "", "http://", "https://", "/safe"),
          fc.string({ minLength: 0, maxLength: 30 }),
        )
        .map(([prefix, rest]) => prefix + rest),
      constructedUnsafeArb,
    );
    fc.assert(
      fc.property(fuzzArb, (value) => {
        expect(isSafeRedirectTarget(value)).toBe(oracleIsSafe(value));
      }),
      { numRuns: 1000 },
    );
  });
});
