/**
 * Sector scope helper untuk SafeGuard APD Web Dashboard.
 *
 * Sesuai design.md §Sector Data Isolation dan Requirements 8.1, 8.2, 8.3.
 *
 * Untuk endpoint dengan `sectorScoped: true` dan role User ∈ {Supervisor,
 * PIC_Sektor}, middleware menyiapkan `RequestContext.sectorIds` dan handler
 * memanggil `applySectorScope(where, ctx)` untuk menambahkan filter
 * `sektorId IN (ctx.sectorIds)` ke query Prisma.
 */
import type { RequestContext } from "@/lib/auth/types";

/**
 * Mengembalikan apakah role tertentu termasuk role yang harus terskop sektor.
 * Saat ini hanya Supervisor dan PIC_Sektor (sesuai design.md).
 */
export function isSectorScopedRole(roleName: string): boolean {
  return roleName === "Supervisor" || roleName === "PIC_Sektor";
}

/**
 * Mutasi/extends `where` dengan filter `sektorId IN (ctx.sectorIds)` jika
 * konteks request menunjukkan user terskop sektor. Idempotent: jika
 * `ctx.sectorIds === null`, return where unchanged.
 *
 * Returned object adalah salinan agar caller boleh memutasi secara aman.
 */
export function applySectorScope<T extends Record<string, unknown>>(
  where: T,
  ctx: Pick<RequestContext, "sectorIds">,
): T {
  if (ctx.sectorIds === null) return where;
  return { ...where, sektorId: { in: ctx.sectorIds } };
}

/**
 * Apakah resource dengan `sektorId` tertentu boleh diakses dari konteks ini?
 *
 * - `ctx.sectorIds === null`            → true (non-scoped role)
 * - `ctx.sectorIds.includes(sektorId)`  → true
 * - else                                → false (handler kembalikan 404 untuk
 *                                          mencegah enumerasi — Req 8.3)
 */
export function assertSectorAccess(
  resourceSektorId: string,
  ctx: Pick<RequestContext, "sectorIds">,
): boolean {
  if (ctx.sectorIds === null) return true;
  return ctx.sectorIds.includes(resourceSektorId);
}
