/**
 * Account Lockout state machine.
 *
 * Sesuai design.md §Account Lockout State Machine dan Requirements
 * 10.3, 10.4, 10.5, 10.6.
 *
 * State:
 *   - active   → locked: ≥10 failures per username dalam 15 menit
 *   - locked   → active: lockedUntil ≤ now (auto unlock saat login berikutnya
 *                       yang lolos password)
 *   - locked   → active: admin manual unlock
 *
 * Field DB:
 *   - User.status: 'active' | 'disabled' | 'locked'
 *   - User.lockedUntil: DateTime? — populated saat masuk state locked
 *
 * Helper di sini bersifat pure terhadap input row; persistensi via Prisma.
 */
import { LOCKOUT_DURATION_MS, clearForUser } from "./rate-limiter";

interface UserLockoutFields {
  id: string;
  username: string;
  status: string;
  lockedUntil: Date | null;
}

/**
 * Apakah user saat ini ter-lockout (status=locked DAN lockedUntil > now)?
 * Pure: tidak menyentuh DB.
 */
export function isLocked(user: UserLockoutFields, now: Date = new Date()): boolean {
  if (user.status !== "locked") return false;
  if (!user.lockedUntil) return true; // legacy: locked tanpa expiry → tetap locked
  return user.lockedUntil.getTime() > now.getTime();
}

/**
 * Apakah lockout sudah expired (status=locked DAN lockedUntil ≤ now)?
 * Caller pakai untuk men-trigger transisi locked → active otomatis.
 */
export function isLockoutExpired(
  user: UserLockoutFields,
  now: Date = new Date(),
): boolean {
  return (
    user.status === "locked" &&
    user.lockedUntil !== null &&
    user.lockedUntil.getTime() <= now.getTime()
  );
}

/**
 * Apply lockout: set status=locked, lockedUntil = now + 30 menit, audit
 * `auth:account-lockout`. Sesuai Req 10.3.
 *
 * Caller bertanggung jawab memastikan user belum dalam state `disabled`.
 */
export async function applyLockout(
  userId: string,
  options: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
  await prisma.user.update({
    where: { id: userId },
    data: { status: "locked", lockedUntil },
  });
  // Audit log written best-effort (lazy import to avoid cycles)
  try {
    const { appendAuditLog } = await import("@/lib/audit/audit-log");
    await appendAuditLog({
      userId,
      action: "auth:account-lockout",
      resourceType: "user",
      resourceId: userId,
      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,
      metadata: { lockedUntil: lockedUntil.toISOString() },
    });
  } catch {
    // ignore — audit failures must not block business logic (Req 13.7)
  }
}

/**
 * Jika lockout sudah expired, kembalikan status user ke active dan reset
 * lockedUntil. Dipakai middleware login: setelah password verify sukses,
 * panggil ini; jika user kembali active, login dilanjutkan.
 */
export async function releaseLockoutIfExpired(
  user: UserLockoutFields,
  now: Date = new Date(),
): Promise<UserLockoutFields> {
  if (!isLockoutExpired(user, now)) return user;
  const { prisma } = await import("@/lib/prisma");
  await prisma.user.update({
    where: { id: user.id },
    data: { status: "active", lockedUntil: null },
  });
  clearForUser(user.username);
  return { ...user, status: "active", lockedUntil: null };
}

/**
 * Manual unlock oleh admin (Req 10.6). Tidak memeriksa expiry — admin punya
 * kewenangan unlock kapan saja. Audit `user:unlock`.
 */
export async function manualUnlock(
  targetUserId: string,
  byUserId: string,
  options: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const target = await prisma.user.findUniqueOrThrow({
    where: { id: targetUserId },
    select: { username: true },
  });
  await prisma.user.update({
    where: { id: targetUserId },
    data: { status: "active", lockedUntil: null },
  });
  clearForUser(target.username);
  try {
    const { appendAuditLog } = await import("@/lib/audit/audit-log");
    await appendAuditLog({
      userId: byUserId,
      action: "user:unlock",
      resourceType: "user",
      resourceId: targetUserId,
      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,
      metadata: { targetUsername: target.username },
    });
  } catch {
    // ignore
  }
}
