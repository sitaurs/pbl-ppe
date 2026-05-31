/**
 * RequestContext getter dan permission helpers.
 *
 * Middleware menulis konteks ke request headers sebagai JSON:
 *   `x-apd-context-user`        → AuthenticatedUser (JSON-serialized) atau ""
 *   `x-apd-context-sector-ids`  → JSON array atau "null"
 *   `x-apd-context-csrf-token`  → string atau ""
 *   `x-apd-context-client-ip`   → string
 *   `x-apd-context-service`     → "1" jika Service_Token
 *
 * Route handler memanggil `getRequestContext(req)` di awal untuk membaca
 * konteks tersebut. Ini memungkinkan handler tetap pure function-based tanpa
 * dependency injection container.
 *
 * Catatan: `Headers` di runtime middleware Next.js immutable di response,
 * jadi kita pakai `NextResponse.next({ request: { headers: ... } })` untuk
 * meneruskan modified headers ke handler downstream.
 */
import type { NextRequest } from "next/server";

import type { AuthenticatedUser, RequestContext } from "@/lib/auth/types";
import type { PermissionId } from "@/lib/rbac/permission-types";

/**
 * Read context yang sudah disiapkan oleh middleware. Jika header tidak ada
 * (mis. handler dipanggil di unit test tanpa middleware), kembalikan default
 * unauthenticated context.
 */
export function getRequestContext(req: Request | NextRequest): RequestContext {
  const headers = req.headers;
  const userJson = headers.get("x-apd-context-user");
  const sectorJson = headers.get("x-apd-context-sector-ids");
  const csrfToken = headers.get("x-apd-context-csrf-token");
  const clientIp = headers.get("x-apd-context-client-ip") ?? "";
  const isServiceToken = headers.get("x-apd-context-service") === "1";

  let user: AuthenticatedUser | null = null;
  if (userJson && userJson.length > 0) {
    try {
      user = JSON.parse(userJson) as AuthenticatedUser;
    } catch {
      user = null;
    }
  }

  let sectorIds: string[] | null = null;
  if (sectorJson) {
    try {
      const parsed = JSON.parse(sectorJson);
      sectorIds = Array.isArray(parsed) ? parsed : null;
    } catch {
      sectorIds = null;
    }
  }

  return {
    user,
    serviceToken: isServiceToken,
    sectorIds,
    csrfToken: csrfToken && csrfToken.length > 0 ? csrfToken : null,
    clientIp,
  };
}

/**
 * Apakah user memiliki Permission tertentu?
 * Untuk service-token caller (`user === null`), kembalikan false — pemeriksaan
 * Service_Token whitelist sudah dilakukan middleware sebelum sampai ke handler.
 */
export function hasPermission(
  user: AuthenticatedUser | null,
  permission: PermissionId,
): boolean {
  if (!user) return false;
  return user.role.permissions.includes(permission);
}

export function hasAnyPermission(
  user: AuthenticatedUser | null,
  permissions: PermissionId[],
): boolean {
  if (!user) return false;
  return permissions.some((p) => user.role.permissions.includes(p));
}

export function hasAllPermissions(
  user: AuthenticatedUser | null,
  permissions: PermissionId[],
): boolean {
  if (!user) return false;
  return permissions.every((p) => user.role.permissions.includes(p));
}
