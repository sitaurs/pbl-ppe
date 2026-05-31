/**
 * Property 2: Argon2id rehash invariant
 *
 * Validates: Requirements 9.1, 9.5
 *
 * Statement (design.md §Correctness Properties — Property 2):
 *   For any User dengan `passwordHash` lama yang parameter Argon2-nya lebih
 *   lemah dari `ARGON2_PARAMS` saat ini, setelah login berhasil, `passwordHash`
 *   baru SHALL diparsing kembali memenuhi
 *   `memoryCost ≥ 19456 ∧ timeCost ≥ 2 ∧ parallelism ≥ 1`
 *   dan tetap memverifikasi password plaintext yang sama.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as argon2 from '@node-rs/argon2';
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  ARGON2_PARAMS,
} from '@/lib/auth/argon2';

// --- Generators ---------------------------------------------------------

/**
 * Plaintext password generator. Constrained to printable ASCII + symbols so
 * that Argon2 (which hashes UTF-8 bytes) and the PHC parser behave
 * deterministically across platforms/locales. Length 8..32 keeps the test
 * cheap while exercising the realistic password space.
 */
const passwordArb = fc
  .array(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*-_'.split(''),
    ),
    { minLength: 8, maxLength: 32 },
  )
  .map((arr) => arr.join(''));

/**
 * Generator producing Argon2id parameter records that are STRICTLY weaker than
 * `ARGON2_PARAMS` on at least one axis (`memoryCost` or `timeCost`).
 *
 * Three branches:
 *   1. weak memoryCost only       — m ∈ [4096, 19455], t ∈ [2, 3]
 *   2. weak timeCost only          — m ∈ [19456, 22000], t = 1
 *   3. both weak                   — m ∈ [4096, 19455], t = 1
 *
 * `parallelism` is fixed at 1 (matches current ARGON2_PARAMS). We deliberately
 * keep `memoryCost` ≥ 4096 KiB so that hashing stays within @node-rs/argon2's
 * supported range while still being faster than the production 19 MiB tuning.
 */
const weakParamsArb = fc.oneof(
  fc.record({
    algorithm: fc.constant(2 as argon2.Algorithm),
    memoryCost: fc.integer({ min: 4096, max: 19_455 }),
    timeCost: fc.integer({ min: 2, max: 3 }),
    parallelism: fc.constant(1),
  }),
  fc.record({
    algorithm: fc.constant(2 as argon2.Algorithm),
    memoryCost: fc.integer({ min: 19_456, max: 22_000 }),
    timeCost: fc.constant(1),
    parallelism: fc.constant(1),
  }),
  fc.record({
    algorithm: fc.constant(2 as argon2.Algorithm),
    memoryCost: fc.integer({ min: 4096, max: 19_455 }),
    timeCost: fc.constant(1),
    parallelism: fc.constant(1),
  }),
);

// --- PHC string parsing helper -----------------------------------------

const PHC_RE = /\$argon2id?\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/;

function parsePhcParams(hash: string): { m: number; t: number; p: number } {
  const match = hash.match(PHC_RE);
  if (!match) {
    throw new Error(`Hash is not a valid Argon2id PHC string: ${hash}`);
  }
  return { m: Number(match[1]), t: Number(match[2]), p: Number(match[3]) };
}

// --- Properties ---------------------------------------------------------

describe('Property 2: Argon2id rehash invariant (Requirements 9.1, 9.5)', () => {
  it('needsRehash() returns true when stored hash uses params weaker than ARGON2_PARAMS', async () => {
    await fc.assert(
      fc.asyncProperty(passwordArb, weakParamsArb, async (plain, weakParams) => {
        const weakHash = await argon2.hash(plain, weakParams);
        // Sanity: confirm the constructed hash actually carries weak params
        const parsed = parsePhcParams(weakHash);
        const isWeak =
          parsed.m < ARGON2_PARAMS.memoryCost ||
          parsed.t < ARGON2_PARAMS.timeCost ||
          parsed.p < ARGON2_PARAMS.parallelism;
        expect(isWeak).toBe(true);

        // Property 2.a: needsRehash must flag this stored hash for rehashing
        expect(needsRehash(weakHash)).toBe(true);
      }),
      { numRuns: 8 },
    );
  }, 180_000);

  it('needsRehash() returns false for hashes produced with current ARGON2_PARAMS', async () => {
    await fc.assert(
      fc.asyncProperty(passwordArb, async (plain) => {
        const currentHash = await hashPassword(plain);
        const parsed = parsePhcParams(currentHash);

        // Sanity: current hash carries the configured tuning
        expect(parsed.m).toBe(ARGON2_PARAMS.memoryCost);
        expect(parsed.t).toBe(ARGON2_PARAMS.timeCost);
        expect(parsed.p).toBe(ARGON2_PARAMS.parallelism);

        // Property 2.b: no rehash needed when params already match
        expect(needsRehash(currentHash)).toBe(false);
      }),
      { numRuns: 5 },
    );
  }, 180_000);

  it('after rehashing a weak hash, the new hash meets m≥19456, t≥2, p≥1 AND verifyPassword(newHash, plain) === true', async () => {
    await fc.assert(
      fc.asyncProperty(passwordArb, weakParamsArb, async (plain, weakParams) => {
        // Step 1 — Simulate stored legacy hash with weaker params
        const weakHash = await argon2.hash(plain, weakParams);
        expect(needsRehash(weakHash)).toBe(true);

        // (Pre-condition: legacy hash still verifies the original plaintext —
        // Req 9.5 rehash flow only triggers on a successful login.)
        expect(await verifyPassword(weakHash, plain)).toBe(true);

        // Step 2 — Rehash with the current ARGON2_PARAMS (the production
        // login path performs `hashPassword(plain)` here).
        const newHash = await hashPassword(plain);

        // Step 3 — Parsed params on the new hash satisfy current thresholds
        const parsed = parsePhcParams(newHash);
        expect(parsed.m).toBeGreaterThanOrEqual(ARGON2_PARAMS.memoryCost);
        expect(parsed.t).toBeGreaterThanOrEqual(ARGON2_PARAMS.timeCost);
        expect(parsed.p).toBeGreaterThanOrEqual(ARGON2_PARAMS.parallelism);

        // Step 4 — Calling needsRehash on the freshly produced hash must NOT
        // request another rehash (otherwise the rehash loop would diverge).
        expect(needsRehash(newHash)).toBe(false);

        // Step 5 — Round-trip: the new hash still verifies the original
        // plaintext (rehash invariant: rotating params must not break the
        // user's ability to log in with the same password).
        expect(await verifyPassword(newHash, plain)).toBe(true);
      }),
      { numRuns: 6 },
    );
  }, 240_000);
});
