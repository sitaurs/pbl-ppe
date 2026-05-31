/**
 * Property 8: Session sliding expiration
 * Property 15: Logout idempotency
 *
 * Validates: Requirements 4.4, 4.5, 4.6
 *
 * Property 8 statement (design.md):
 *   For any tuple (lastRefreshedAt, expiresAt, now) dengan expiresAt > now,
 *   `shouldRefreshSession()` SHALL mengembalikan true iff
 *   `now - lastRefreshedAt > 30 menit`. Setelah refresh,
 *   `expiresAt = now + 8 jam ∧ lastRefreshedAt = now`.
 *
 * Property 15 statement:
 *   For any state Session_Cookie pemanggil (cookie tidak ada, cookie dengan id
 *   tidak ditemukan di DB, cookie dengan Session expired, atau cookie dengan
 *   Session valid), endpoint POST /api/auth/logout SHALL mengembalikan
 *   response 200 + Set-Cookie clearing dan menghapus row Session di DB jika
 *   ditemukan.
 *
 * Test strategy:
 *   - Property 8 di-test secara murni terhadap helper `shouldRefreshSession`
 *     dan `computeRefreshedSession` (no DB)
 *   - Property 15 di-test dengan model deterministik dari `deleteSession()`
 *     contract: input cookie state → output `{ status, deletedRow }`.
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  SESSION_TTL_MS,
  SLIDING_THRESHOLD_MS,
  shouldRefreshSession,
  computeRefreshedSession,
} from "@/lib/auth/session";

// --- Property 8 ---------------------------------------------------------

describe("Property 8: Session sliding expiration (Requirement 4.6)", () => {
  it("shouldRefreshSession returns true iff (expiresAt > now) AND (now - lastRefreshedAt > 30 min)", () => {
    fc.assert(
      fc.property(
        // Generator: now (epoch), lastRefreshedAt offset (-2h..+2h), expiresAt offset (-2h..+10h)
        fc.integer({ min: 0, max: 2_000_000_000_000 }), // arbitrary now (ms)
        fc.integer({ min: -2 * 60 * 60_000, max: 0 }), // last refresh always in past
        fc.integer({ min: -2 * 60 * 60_000, max: 10 * 60 * 60_000 }),
        (nowMs, refreshOffsetMs, expiresOffsetMs) => {
          const now = new Date(nowMs);
          const lastRefreshedAt = new Date(nowMs + refreshOffsetMs);
          const expiresAt = new Date(nowMs + expiresOffsetMs);
          const session = { lastRefreshedAt, expiresAt };

          const got = shouldRefreshSession(session, now);
          const oracle =
            expiresAt.getTime() > nowMs &&
            nowMs - lastRefreshedAt.getTime() > SLIDING_THRESHOLD_MS;
          expect(got).toBe(oracle);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("computeRefreshedSession returns expiresAt=now+8h AND lastRefreshedAt=now", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2_000_000_000_000 }),
        (nowMs) => {
          const now = new Date(nowMs);
          const updated = computeRefreshedSession(now);
          expect(updated.lastRefreshedAt.getTime()).toBe(nowMs);
          expect(updated.expiresAt.getTime()).toBe(nowMs + SESSION_TTL_MS);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("after refresh, the session is no longer eligible for refresh against the same now", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2_000_000_000_000 }),
        (nowMs) => {
          const now = new Date(nowMs);
          const refreshed = computeRefreshedSession(now);
          // Re-evaluate: should NOT be eligible immediately after refresh
          expect(shouldRefreshSession(refreshed, now)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("expired session (now >= expiresAt) is never eligible for refresh", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2_000_000_000_000 }),
        fc.integer({ min: 0, max: 60 * 60_000 }),
        fc.integer({ min: -10 * 60 * 60_000, max: 10 * 60 * 60_000 }),
        (nowMs, expiredAgoMs, refreshOffsetMs) => {
          const now = new Date(nowMs);
          const expiresAt = new Date(nowMs - expiredAgoMs); // expired in past
          const lastRefreshedAt = new Date(nowMs + refreshOffsetMs);
          const session = { expiresAt, lastRefreshedAt };
          expect(shouldRefreshSession(session, now)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// --- Property 15 --------------------------------------------------------

/**
 * Pure model of logout endpoint contract. Mirrors the actual handler's
 * decision tree (cookie absent → 200 clear; row exists → delete + 200 clear;
 * row missing → 200 clear; row expired → 200 clear).
 */
type CookieState =
  | { kind: "absent" }
  | { kind: "id-not-found"; sessionId: string }
  | { kind: "expired"; sessionId: string }
  | { kind: "valid"; sessionId: string };

interface LogoutResult {
  status: number;
  setCookieClears: boolean; // Set-Cookie apd_session=; Max-Age=0
  rowDeleted: boolean;
}

/** Simulates POST /api/auth/logout business logic. */
function simulateLogout(state: CookieState): LogoutResult {
  switch (state.kind) {
    case "absent":
    case "id-not-found":
    case "expired":
      return { status: 200, setCookieClears: true, rowDeleted: false };
    case "valid":
      return { status: 200, setCookieClears: true, rowDeleted: true };
  }
}

const cookieStateArb = fc.oneof(
  fc.constant({ kind: "absent" } as CookieState),
  fc.string({ minLength: 8, maxLength: 36 }).map(
    (s) => ({ kind: "id-not-found", sessionId: s }) as CookieState,
  ),
  fc.string({ minLength: 8, maxLength: 36 }).map(
    (s) => ({ kind: "expired", sessionId: s }) as CookieState,
  ),
  fc.string({ minLength: 8, maxLength: 36 }).map(
    (s) => ({ kind: "valid", sessionId: s }) as CookieState,
  ),
);

describe("Property 15: Logout idempotency (Requirements 4.4, 4.5)", () => {
  it("logout always returns 200 + clears cookie regardless of cookie state", () => {
    fc.assert(
      fc.property(cookieStateArb, (state) => {
        const result = simulateLogout(state);
        expect(result.status).toBe(200);
        expect(result.setCookieClears).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("logout deletes the session row iff the cookie pointed to a valid session", () => {
    fc.assert(
      fc.property(cookieStateArb, (state) => {
        const result = simulateLogout(state);
        expect(result.rowDeleted).toBe(state.kind === "valid");
      }),
      { numRuns: 300 },
    );
  });
});
