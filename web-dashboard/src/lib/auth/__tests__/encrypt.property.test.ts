/**
 * Property 11: AES-GCM TOTP secret round-trip
 *
 * Validates: Requirements 12.2, 12.7
 *
 * Statement (design.md §Correctness Properties — Property 11):
 *   For any string secret S (UTF-8, panjang 1–256 karakter) dan
 *   `APD_ENCRYPTION_KEY` valid (≥ 32 byte), `decryptSecret(encryptSecret(S))
 *   === S`, DAN dua panggilan `encryptSecret(S)` berturut-turut SHALL
 *   menghasilkan ciphertext berbeda (akibat IV acak 12 byte per call).
 *
 * Implementation note:
 *   `encrypt.ts` membaca `APD_ENCRYPTION_KEY` saat module di-load (IIFE).
 *   Test ini menggunakan `vi.resetModules()` + dynamic `await import()` di
 *   `beforeAll` agar env var dapat di-set sebelum module di-load. Tanpa ini,
 *   ESM static import akan di-hoist dan KEY akan resolve ke null.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fc from "fast-check";

type EncryptMod = typeof import("@/lib/auth/encrypt");
let encryptMod: EncryptMod;

describe("Property 11: AES-GCM TOTP secret round-trip (Requirements 12.2, 12.7)", () => {
  beforeAll(async () => {
    process.env.APD_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"; // 32 byte
    encryptMod = await import("@/lib/auth/encrypt");
    expect(encryptMod.encryptionAvailable()).toBe(true);
  });

  it("decrypt(encrypt(S)) === S for any UTF-8 secret of length 1-256", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 256, unit: "grapheme" }),
        (secret) => {
          const ct = encryptMod.encryptSecret(secret);
          const pt = encryptMod.decryptSecret(ct);
          expect(pt).toBe(secret);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("Two encryptSecret(S) calls return different ciphertexts (random IV)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64, unit: "binary-ascii" }),
        (secret) => {
          const a = encryptMod.encryptSecret(secret);
          const b = encryptMod.encryptSecret(secret);
          // Probabilitas tabrakan IV 96-bit ≈ 2^-96
          expect(a).not.toBe(b);
          // Tapi keduanya tetap mendekripsi ke plaintext yang sama
          expect(encryptMod.decryptSecret(a)).toBe(secret);
          expect(encryptMod.decryptSecret(b)).toBe(secret);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("ciphertext layout: minimum 28 bytes (12 IV + 16 tag) + N bytes of CT", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64, unit: "binary-ascii" }),
        (secret) => {
          const b64 = encryptMod.encryptSecret(secret);
          const buf = Buffer.from(b64, "base64");
          // IV(12) + Tag(16) + ciphertext(>=1 because plaintext non-empty)
          expect(buf.length).toBeGreaterThanOrEqual(12 + 16 + 1);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("decrypt with tampered ciphertext throws (auth tag mismatch)", () => {
    const ct = encryptMod.encryptSecret("hello-totp-secret");
    // flip 1 byte di payload (skip IV + tag → modify ciphertext bytes)
    const buf = Buffer.from(ct, "base64");
    expect(buf.length).toBeGreaterThan(28);
    const tampered = Buffer.from(buf);
    tampered[28] = tampered[28] ^ 0xff;
    expect(() =>
      encryptMod.decryptSecret(tampered.toString("base64")),
    ).toThrow();
  });
});
