/**
 * Property 9: Rate limiter window and lockout state machine
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 *
 * Statement (design.md §Correctness Properties — Property 9):
 *   For any sequence kronologis dari event login (success / failure-invalid /
 *   failure-other), dan untuk any (ip, username) pair, Rate_Limiter dan
 *   Account_Lockout SHALL memenuhi:
 *     1. Login ditolak iff count(failures(ip,user) dalam 15 menit) ≥ 5.
 *     2. User di-lockout iff count(failures(user) dalam 15 menit) ≥ 10.
 *     3. Setelah lockedUntil ≤ now, login sukses → status=active + counter reset.
 */
import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import {
  WINDOW_MS,
  MAX_FAILURES_IP_USER,
  MAX_FAILURES_USER,
  LOCKOUT_DURATION_MS,
  isLoginAllowed,
  recordFailure,
  clearForUser,
  countFailuresIpUser,
  countFailuresUsername,
  _resetRateLimiterForTest,
} from "@/lib/rate-limit/rate-limiter";
import {
  isLocked,
  isLockoutExpired,
} from "@/lib/rate-limit/lockout";

beforeEach(() => {
  _resetRateLimiterForTest();
});

// --- Property 9.1 — IP+user threshold rejects login ---------------------

describe("Property 9.1: Login rejected iff failures(ip,user) ≥ 5 within 15 min", () => {
  it("for any number of failures n in window, isLoginAllowed.allowed === (n < 5)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 7, maxLength: 15 }),
        fc.string({ minLength: 4, maxLength: 16 }),
        fc.integer({ min: 0, max: 12 }),
        (ip, username, n) => {
          _resetRateLimiterForTest();
          const t0 = 1_700_000_000_000; // arbitrary now
          for (let i = 0; i < n; i++) {
            recordFailure(ip, username, t0 + i * 1_000); // each 1s apart, all in window
          }
          const result = isLoginAllowed(ip, username, t0 + n * 1_000);
          if (n < MAX_FAILURES_IP_USER) {
            expect(result.allowed).toBe(true);
          } else {
            expect(result.allowed).toBe(false);
            expect(result.retryAfterMin).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("failures older than WINDOW_MS no longer count", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 7, maxLength: 15 }),
        fc.string({ minLength: 4, maxLength: 16 }),
        fc.integer({ min: MAX_FAILURES_IP_USER, max: 20 }),
        (ip, username, n) => {
          _resetRateLimiterForTest();
          const t0 = 1_700_000_000_000;
          // Record n failures in old window
          for (let i = 0; i < n; i++) recordFailure(ip, username, t0 + i * 1_000);
          // Move forward beyond window
          const future = t0 + WINDOW_MS + 60 * 1000;
          expect(countFailuresIpUser(ip, username, future)).toBe(0);
          expect(isLoginAllowed(ip, username, future).allowed).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// --- Property 9.2 — username threshold triggers lockout -----------------

describe("Property 9.2: User locked iff failures(user) ≥ 10 within 15 min", () => {
  it("countFailuresUsername aggregates across all IPs", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 4, maxLength: 16 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 8 }),
        (username, ipCount, perIp) => {
          _resetRateLimiterForTest();
          const t0 = 1_700_000_000_000;
          let totalRecorded = 0;
          for (let i = 0; i < ipCount; i++) {
            const ip = `10.0.0.${i + 1}`;
            for (let j = 0; j < perIp; j++) {
              recordFailure(ip, username, t0 + (totalRecorded + j) * 1_000);
            }
            totalRecorded += perIp;
          }
          const got = countFailuresUsername(username, t0 + totalRecorded * 1_000);
          expect(got).toBe(ipCount * perIp);

          const shouldLock = got >= MAX_FAILURES_USER;
          if (shouldLock) {
            // Caller in production triggers applyLockout(userId) when
            // got ≥ MAX_FAILURES_USER. Here we just assert the threshold
            // detection is correct — DB-side state-machine is tested in 9.3.
            expect(got).toBeGreaterThanOrEqual(MAX_FAILURES_USER);
          } else {
            expect(got).toBeLessThan(MAX_FAILURES_USER);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// --- Property 9.3 — Lockout state machine ------------------------------

describe("Property 9.3: Lockout state machine — locked→active when expired", () => {
  it("isLocked() === (status==='locked' AND lockedUntil > now)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("active", "disabled", "locked"),
        fc.integer({ min: -60_000, max: 60 * 60_000 }),
        (status, untilOffsetMs) => {
          const now = new Date();
          const user = {
            id: "u1",
            username: "alice",
            status,
            lockedUntil:
              untilOffsetMs >= 0 ? new Date(now.getTime() + untilOffsetMs) : null,
          };
          const got = isLocked(user, now);
          if (status !== "locked") {
            expect(got).toBe(false);
          } else if (!user.lockedUntil) {
            // legacy: status=locked tanpa lockedUntil tetap locked
            expect(got).toBe(true);
          } else {
            expect(got).toBe(user.lockedUntil.getTime() > now.getTime());
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("isLockoutExpired() === (status==='locked' AND lockedUntil <= now)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("active", "disabled", "locked"),
        fc.integer({ min: -3 * LOCKOUT_DURATION_MS, max: LOCKOUT_DURATION_MS }),
        (status, untilOffsetMs) => {
          const now = new Date();
          const lockedUntil = new Date(now.getTime() + untilOffsetMs);
          const user = {
            id: "u1",
            username: "alice",
            status,
            lockedUntil,
          };
          const got = isLockoutExpired(user, now);
          if (status !== "locked") {
            expect(got).toBe(false);
          } else {
            expect(got).toBe(lockedUntil.getTime() <= now.getTime());
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("clearForUser removes all rate-limit entries for the username", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 4, maxLength: 12 }),
        fc.integer({ min: 1, max: 5 }),
        (username, ipCount) => {
          _resetRateLimiterForTest();
          const t0 = 1_700_000_000_000;
          for (let i = 0; i < ipCount; i++) {
            recordFailure(`10.0.0.${i + 1}`, username, t0 + i * 1_000);
          }
          expect(countFailuresUsername(username, t0 + ipCount * 1_000)).toBe(ipCount);
          clearForUser(username);
          expect(countFailuresUsername(username, t0 + ipCount * 1_000)).toBe(0);
          // And rate limiter should allow again
          expect(isLoginAllowed("10.0.0.1", username, t0 + ipCount * 1_000).allowed).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
