/**
 * Rate limiter in-memory untuk login flow SafeGuard APD.
 *
 * Sesuai design.md §Rate Limiter Implementation dan Requirements 10.1, 10.2.
 *
 * - Window: 15 menit
 * - Per (ip, username): max 5 failures dalam window → reject 429
 * - Per username (across all IPs): max 10 failures dalam window → trigger
 *   Account_Lockout (status=locked + lockedUntil = now + 30 min)
 *
 * Counter per (ip, username) disimpan di Map memori; counter per username
 * di-derive dari `Audit_Log` agar survive restart. Map dibersihkan setiap
 * 5 menit dari entry stale.
 *
 * Untuk menjaga API helper murni dan testable, fungsi-fungsi terpisah
 * antara state-mutator (recordFailure, clearForUser) dan policy-decision
 * (countRecentFailures, isWithinIpUserThreshold).
 */

interface RateLimitEntry {
  ip: string;
  username: string;
  failures: number[]; // timestamps (ms) of failures within window
}

export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_IP_USER = 5;
export const MAX_FAILURES_USER = 10;
export const LOCKOUT_DURATION_MS = 30 * 60 * 1000;

const cache = new Map<string, RateLimitEntry>(); // key = `${ip}|${username.toLowerCase()}`

function cacheKey(ip: string, username: string): string {
  return `${ip}|${username.toLowerCase()}`;
}

/**
 * Hitung jumlah failure dalam window untuk pasangan (ip, username).
 * Jika di atas atau sama dengan threshold, login akan ditolak.
 *
 * Pure: tidak memutasi cache; hanya membaca + membersihkan timestamp lama.
 */
export function countFailuresIpUser(
  ip: string,
  username: string,
  now: number = Date.now(),
): number {
  const entry = cache.get(cacheKey(ip, username));
  if (!entry) return 0;
  const cutoff = now - WINDOW_MS;
  entry.failures = entry.failures.filter((t) => t > cutoff);
  return entry.failures.length;
}

/**
 * Apakah login dari (ip, username) saat ini diijinkan oleh rate limiter?
 *
 * Returns:
 *   - { allowed: true } jika count < MAX_FAILURES_IP_USER
 *   - { allowed: false, retryAfterMin } jika sudah threshold
 *
 * Caller juga harus memeriksa `Account_Lockout` (status=locked) terpisah —
 * fungsi ini hanya menangani per-(ip, username) counter.
 */
export function isLoginAllowed(
  ip: string,
  username: string,
  now: number = Date.now(),
): { allowed: boolean; retryAfterMin?: number } {
  const entry = cache.get(cacheKey(ip, username));
  if (!entry) return { allowed: true };
  const cutoff = now - WINDOW_MS;
  entry.failures = entry.failures.filter((t) => t > cutoff);
  if (entry.failures.length < MAX_FAILURES_IP_USER) return { allowed: true };
  const oldestMs = Math.min(...entry.failures);
  const retryAfterMin = Math.max(
    1,
    Math.ceil((oldestMs + WINDOW_MS - now) / 60_000),
  );
  return { allowed: false, retryAfterMin };
}

/**
 * Catat satu kegagalan login untuk pasangan (ip, username). Idempotent
 * terhadap state-mutator: setiap pemanggilan menambah satu timestamp.
 */
export function recordFailure(
  ip: string,
  username: string,
  now: number = Date.now(),
): void {
  const key = cacheKey(ip, username);
  const entry = cache.get(key) ?? { ip, username, failures: [] };
  entry.failures.push(now);
  cache.set(key, entry);
}

/**
 * Bersihkan seluruh entry untuk username tertentu (dipakai saat manual
 * unlock atau saat user login sukses setelah lockout expire). Sesuai Req 10.6.
 */
export function clearForUser(username: string): void {
  const target = `|${username.toLowerCase()}`;
  for (const k of [...cache.keys()]) {
    if (k.endsWith(target)) cache.delete(k);
  }
}

/**
 * Hitung total failure untuk username (across all IPs) dalam window. Dipakai
 * lockout state machine (Req 10.3). Counter ini di-derive dari kombinasi
 * in-memory cache + AuditLog untuk survive restart — di sini kita hanya
 * menghitung dari cache memori; backend Audit_Log integrasi menambahkan
 * dengan async query saat dipanggil dari handler login.
 */
export function countFailuresUsername(
  username: string,
  now: number = Date.now(),
): number {
  const target = `|${username.toLowerCase()}`;
  const cutoff = now - WINDOW_MS;
  let total = 0;
  for (const [k, entry] of cache) {
    if (k.endsWith(target)) {
      entry.failures = entry.failures.filter((t) => t > cutoff);
      total += entry.failures.length;
    }
  }
  return total;
}

/**
 * Reset state global cache. Dipakai unit test antara skenario.
 */
export function _resetRateLimiterForTest(): void {
  cache.clear();
}

let cleanupHandle: ReturnType<typeof setInterval> | null = null;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** Mulai job pembersihan stale entry (5 menit interval). Idempotent. */
export function startRateLimiterCleanup(): void {
  if (cleanupHandle) return;
  cleanupHandle = setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [k, v] of cache) {
      v.failures = v.failures.filter((t) => t > cutoff);
      if (v.failures.length === 0) cache.delete(k);
    }
  }, CLEANUP_INTERVAL_MS);
}

/** Stop cleanup job. Dipakai test. */
export function stopRateLimiterCleanup(): void {
  if (cleanupHandle) {
    clearInterval(cleanupHandle);
    cleanupHandle = null;
  }
}
