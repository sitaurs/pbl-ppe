/**
 * Session management untuk SafeGuard APD Web Dashboard.
 *
 * Bertanggung jawab atas:
 *  - Membuat baris Session baru saat login (createSession)
 *  - Memverifikasi cookie session pada setiap request (verifySession)
 *  - Menerapkan sliding expiration: refresh `expiresAt = now + 8h` jika
 *    `now - lastRefreshedAt > 30 menit` (Req 4.6, Property 8)
 *  - Menjalankan job pembersihan terjadwal yang menghapus session expired
 *    (Req 4.8)
 *  - Mendukung logout idempotent: hapus baris jika ditemukan, return 200
 *    walau cookie absent (Req 4.4, 4.5, Property 15)
 *
 * Konstanta:
 *  - SESSION_TTL_MS = 8 jam
 *  - SLIDING_THRESHOLD_MS = 30 menit
 *  - CLEANUP_INITIAL_DELAY_MS = 5 menit (jitter ±30s)
 *  - CLEANUP_INTERVAL_MS = 60 menit
 *  - CLEANUP_RETENTION_MS = 24 jam (delete sessions expired > 24h ago)
 */
import { generateCsrfToken } from "./csrf";
import type { SessionRow } from "./types";

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
export const SLIDING_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INITIAL_DELAY_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes
const CLEANUP_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Decide whether a session row should have its `expiresAt` extended via
 * sliding-window logic.
 *
 * Returns `true` iff:
 *   1. The session has not yet expired (`now < session.expiresAt`)
 *   2. AND it has been more than `SLIDING_THRESHOLD_MS` (30 min) since the
 *      session was last refreshed.
 *
 * Returns `false` if the session is already expired (the caller should
 * delete it) or if the threshold has not been reached (idle case).
 *
 * Pure function — no DB access. Used directly by middleware and unit tests.
 */
export function shouldRefreshSession(
  session: Pick<SessionRow, "expiresAt" | "lastRefreshedAt">,
  now: Date,
): boolean {
  const nowMs = now.getTime();
  const expiresMs = session.expiresAt.getTime();
  if (nowMs >= expiresMs) return false;
  const refreshedMs = session.lastRefreshedAt.getTime();
  return nowMs - refreshedMs > SLIDING_THRESHOLD_MS;
}

/**
 * Compute the new `expiresAt` and `lastRefreshedAt` after a sliding refresh.
 * Pure function: returns updated values, caller persists.
 */
export function computeRefreshedSession(now: Date): {
  expiresAt: Date;
  lastRefreshedAt: Date;
} {
  return {
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    lastRefreshedAt: new Date(now),
  };
}

// ---------------------------------------------------------------------------
// DB-backed operations (Prisma). Lazy-imported so that pure helpers above
// can be unit-tested without bringing the Prisma client into scope.
// ---------------------------------------------------------------------------

interface CreateSessionInput {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Create a new Session row for a successful login. Returns full row including
 * generated `csrfToken` and `expiresAt = now + 8h`.
 */
export async function createSession(
  input: CreateSessionInput,
): Promise<SessionRow> {
  const { prisma } = await import("@/lib/prisma");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const csrfToken = generateCsrfToken();
  const row = await prisma.session.create({
    data: {
      userId: input.userId,
      csrfToken,
      expiresAt,
      lastRefreshedAt: now,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
  return {
    id: row.id,
    userId: row.userId,
    csrfToken: row.csrfToken,
    expiresAt: row.expiresAt,
    lastRefreshedAt: row.lastRefreshedAt,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
  };
}

/**
 * Lookup session row by id (cookie value), returning `null` if not found or
 * already expired. Caller should treat `null` as "redirect to /login".
 */
export async function verifySession(sessionId: string): Promise<SessionRow | null> {
  if (!sessionId || typeof sessionId !== "string") return null;
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return {
    id: row.id,
    userId: row.userId,
    csrfToken: row.csrfToken,
    expiresAt: row.expiresAt,
    lastRefreshedAt: row.lastRefreshedAt,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
  };
}

/**
 * Apply sliding refresh on the given session row if `shouldRefreshSession`
 * returns true. No-op otherwise. Returns the (possibly updated) row.
 */
export async function refreshSession(session: SessionRow): Promise<SessionRow> {
  const now = new Date();
  if (!shouldRefreshSession(session, now)) return session;
  const { prisma } = await import("@/lib/prisma");
  const { expiresAt, lastRefreshedAt } = computeRefreshedSession(now);
  await prisma.session.update({
    where: { id: session.id },
    data: { expiresAt, lastRefreshedAt },
  });
  return { ...session, expiresAt, lastRefreshedAt };
}

/**
 * Delete a session row by id. Returns `true` if a row was deleted, `false`
 * if no row matched (already gone). Used by `/api/auth/logout` for idempotent
 * delete (Req 4.4 / Property 15).
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  if (!sessionId || typeof sessionId !== "string") return false;
  const { prisma } = await import("@/lib/prisma");
  const result = await prisma.session.deleteMany({ where: { id: sessionId } });
  return result.count > 0;
}

/**
 * Delete all sessions whose `expiresAt < now - 24h`. Returns number of rows
 * removed. Used by the periodic cleanup job (Req 4.8).
 */
export async function purgeStaleSessions(): Promise<number> {
  const { prisma } = await import("@/lib/prisma");
  const cutoff = new Date(Date.now() - CLEANUP_RETENTION_MS);
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  return result.count;
}

let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic session cleanup job. Idempotent: subsequent calls are
 * no-ops while the interval is active.
 */
export function startCleanupJob(): void {
  if (cleanupTimer || cleanupInterval) return;
  // Initial delay 5 min ± 30s jitter
  const jitter = Math.floor((Math.random() * 60 - 30) * 1000);
  cleanupTimer = setTimeout(async () => {
    try {
      const removed = await purgeStaleSessions();
      console.log(`[session-cleanup] removed ${removed} stale sessions`);
    } catch (err) {
      console.warn("[session-cleanup] error:", err);
    }
    cleanupInterval = setInterval(async () => {
      try {
        const removed = await purgeStaleSessions();
        console.log(`[session-cleanup] removed ${removed} stale sessions`);
      } catch (err) {
        console.warn("[session-cleanup] error:", err);
      }
    }, CLEANUP_INTERVAL_MS);
  }, CLEANUP_INITIAL_DELAY_MS + jitter);
}

/**
 * Stop cleanup job. Used by tests to prevent timer leaks.
 */
export function stopCleanupJob(): void {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
