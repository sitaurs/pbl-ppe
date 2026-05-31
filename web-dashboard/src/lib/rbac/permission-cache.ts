/**
 * Permission cache LRU 60s untuk SafeGuard APD Web Dashboard.
 *
 * Sesuai design.md §Permission Cache Strategy dan Requirements 6.5, 8.5.
 *
 * - Per-User cache: kombinasi (permissions Set + sectorIds list)
 * - TTL 60 detik agar perubahan RolePermission/SectorAssignment efektif
 *   pada request berikutnya tanpa logout (Property 7)
 * - Cleanup interval 5 menit menghapus entry stale dari Map
 * - Manual `invalidateUserPerms(userId)` dipanggil oleh handler yang
 *   memodifikasi role/sector assignment
 */
import type { PermissionId } from "./permission-types";

interface CachedUserPerms {
  permissions: Set<PermissionId>;
  sectorIds: string[];
  /** Role name agar middleware dapat menentukan apakah `sectorScoped` apply */
  roleName: string;
  fetchedAt: number;
}

const CACHE = new Map<string, CachedUserPerms>();
export const PERMISSION_CACHE_TTL_MS = 60_000; // 60s — Req 6.5 / 8.5
const CLEANUP_INTERVAL_MS = 5 * 60_000;

/**
 * Lookup permissions + sectorIds untuk userId. Hit cache jika fetchedAt masih
 * dalam TTL window; miss → query DB lewat Prisma. Pure async function — tidak
 * mutating state lain.
 */
export async function getUserPerms(userId: string): Promise<CachedUserPerms> {
  const cached = CACHE.get(userId);
  if (cached && Date.now() - cached.fetchedAt < PERMISSION_CACHE_TTL_MS) {
    return cached;
  }
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
      sectors: true,
    },
  });
  const entry: CachedUserPerms = {
    permissions: new Set(
      user.role.permissions.map((rp) => rp.permission.id as PermissionId),
    ),
    sectorIds: user.sectors.map((s) => s.sektorId),
    roleName: user.role.name,
    fetchedAt: Date.now(),
  };
  CACHE.set(userId, entry);
  return entry;
}

/** Hapus entry user dari cache (dipakai setelah role/sector mutation). */
export function invalidateUserPerms(userId: string): void {
  CACHE.delete(userId);
}

/** Hapus seluruh user yang punya role tertentu (dipakai PUT /api/roles/:id). */
export function invalidateUsersByRoleName(roleName: string): void {
  for (const [k, v] of CACHE) {
    if (v.roleName === roleName) CACHE.delete(k);
  }
}

/** Reset cache global. Dipakai test only. */
export function _resetCacheForTest(): void {
  CACHE.clear();
}

let cleanupHandle: ReturnType<typeof setInterval> | null = null;

/** Mulai job pembersihan stale entry. Idempotent. */
export function startCacheCleanup(): void {
  if (cleanupHandle) return;
  cleanupHandle = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of CACHE) {
      if (now - v.fetchedAt > PERMISSION_CACHE_TTL_MS) CACHE.delete(k);
    }
  }, CLEANUP_INTERVAL_MS);
}

export function stopCacheCleanup(): void {
  if (cleanupHandle) {
    clearInterval(cleanupHandle);
    cleanupHandle = null;
  }
}
