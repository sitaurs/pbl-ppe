/**
 * Permission map registry untuk SafeGuard APD Web Dashboard.
 *
 * Sesuai design.md §Permission Map Structure dan Requirements 7.1, 7.2, 7.5.
 *
 * Semua endpoint API baru WAJIB di-register di sini, kecuali endpoint
 * whitelist (login/csrf/health) yang ditangani middleware secara terpisah.
 * Endpoint yang TIDAK ter-register otomatis ditolak 403 `endpoint_not_registered`
 * (deny-by-default — Req 7.5). Property test P4 menjaga invariant ini.
 */
import type { PermissionId } from "./permission-types";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface PermissionMapEntry {
  method: HttpMethod;
  pathPattern: RegExp;
  permission: PermissionId;
  /** Inject `where.sektorId IN (ctx.sectorIds)` filter for Supervisor/PIC. */
  sectorScoped?: boolean;
  /** Whitelist endpoint untuk Service_Token (Python backend). */
  serviceTokenAllowed?: boolean;
}

/**
 * Endpoint paths yang dilewatkan middleware sebelum sampai ke permission map.
 * Tidak butuh Permission_Id; dimasukkan ke union biar centralized.
 */
export const PUBLIC_PATH_PATTERNS: RegExp[] = [
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/csrf$/,
  /^\/api\/health$/,
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PATTERNS.some((p) => p.test(pathname));
}

export const PERMISSION_MAP: PermissionMapEntry[] = [
  // --- Auth (post-login, session-protected) -------------------------
  // /api/auth/logout, /api/auth/me, /api/auth/change-password handled
  // by session check only — no permission required beyond authentication.
  // We register them with a sentinel-style "session" check using a permission
  // that every signed-in user implicitly has by virtue of being logged in.
  // To keep deny-by-default, we instead let middleware short-circuit these
  // session-only routes via PUBLIC_AFTER_AUTH_PATHS.

  // --- Nodes -----------------------------------------------------------
  { method: "GET",    pathPattern: /^\/api\/nodes$/,                              permission: "node:read",            sectorScoped: true,  serviceTokenAllowed: true },
  { method: "POST",   pathPattern: /^\/api\/nodes$/,                              permission: "node:create" },
  { method: "GET",    pathPattern: /^\/api\/nodes\/\d+$/,                         permission: "node:read",            sectorScoped: true,  serviceTokenAllowed: true },
  { method: "PUT",    pathPattern: /^\/api\/nodes\/\d+$/,                         permission: "node:update",          sectorScoped: true },
  { method: "DELETE", pathPattern: /^\/api\/nodes\/\d+$/,                         permission: "node:delete",          sectorScoped: true },
  { method: "GET",    pathPattern: /^\/api\/nodes\/\d+\/status$/,                 permission: "node:read",            sectorScoped: true,  serviceTokenAllowed: true },
  { method: "POST",   pathPattern: /^\/api\/nodes\/\d+\/heartbeat$/,              permission: "node:update",          sectorScoped: true,  serviceTokenAllowed: true },
  { method: "POST",   pathPattern: /^\/api\/nodes\/test-connection$/,             permission: "node:test-connection" },
  { method: "POST",   pathPattern: /^\/api\/nodes\/bulk$/,                        permission: "node:update" },

  // --- Violations -------------------------------------------------------
  { method: "GET",    pathPattern: /^\/api\/violations$/,                         permission: "violation:read",       sectorScoped: true },
  { method: "POST",   pathPattern: /^\/api\/violations$/,                         permission: "violation:acknowledge", serviceTokenAllowed: true },
  { method: "DELETE", pathPattern: /^\/api\/violations\/[^/]+$/,                  permission: "violation:delete",     sectorScoped: true },
  { method: "POST",   pathPattern: /^\/api\/violations\/[^/]+\/acknowledge$/,     permission: "violation:acknowledge", sectorScoped: true },
  { method: "GET",    pathPattern: /^\/api\/violations\/export$/,                 permission: "violation:export",     sectorScoped: true },

  // --- Settings ---------------------------------------------------------
  { method: "GET",    pathPattern: /^\/api\/settings$/,                           permission: "setting:read",         serviceTokenAllowed: true },
  { method: "PUT",    pathPattern: /^\/api\/settings$/,                           permission: "setting:update:branding" },
  { method: "PATCH",  pathPattern: /^\/api\/settings\/branding$/,                 permission: "setting:update:branding" },
  { method: "PATCH",  pathPattern: /^\/api\/settings\/notification$/,             permission: "setting:update:notification" },
  { method: "PATCH",  pathPattern: /^\/api\/settings\/system$/,                   permission: "setting:update:system" },
  { method: "POST",   pathPattern: /^\/api\/settings\/test-wa$/,                  permission: "setting:update:notification" },
  { method: "POST",   pathPattern: /^\/api\/settings\/integrations\/service-token$/, permission: "setting:update:system" },

  // --- Users ------------------------------------------------------------
  { method: "GET",    pathPattern: /^\/api\/users$/,                              permission: "user:read" },
  { method: "POST",   pathPattern: /^\/api\/users$/,                              permission: "user:create" },
  { method: "GET",    pathPattern: /^\/api\/users\/[^/]+$/,                       permission: "user:read" },
  { method: "PUT",    pathPattern: /^\/api\/users\/[^/]+$/,                       permission: "user:update" },
  { method: "DELETE", pathPattern: /^\/api\/users\/[^/]+$/,                       permission: "user:delete" },
  { method: "POST",   pathPattern: /^\/api\/users\/[^/]+\/reset-password$/,       permission: "user:reset-password" },
  { method: "POST",   pathPattern: /^\/api\/users\/[^/]+\/unlock$/,               permission: "user:update" },

  // --- Roles ------------------------------------------------------------
  { method: "GET",    pathPattern: /^\/api\/roles$/,                              permission: "role:read" },
  { method: "POST",   pathPattern: /^\/api\/roles$/,                              permission: "role:create" },
  { method: "GET",    pathPattern: /^\/api\/roles\/[^/]+$/,                       permission: "role:read" },
  { method: "PUT",    pathPattern: /^\/api\/roles\/[^/]+$/,                       permission: "role:assign-permission" },
  { method: "DELETE", pathPattern: /^\/api\/roles\/[^/]+$/,                       permission: "role:delete" },

  // --- Sectors ----------------------------------------------------------
  { method: "GET",    pathPattern: /^\/api\/sectors$/,                            permission: "sector:read" },
  { method: "POST",   pathPattern: /^\/api\/sectors$/,                            permission: "sector:create" },
  { method: "GET",    pathPattern: /^\/api\/sectors\/[^/]+$/,                     permission: "sector:read" },
  { method: "PUT",    pathPattern: /^\/api\/sectors\/[^/]+$/,                     permission: "sector:update" },
  { method: "DELETE", pathPattern: /^\/api\/sectors\/[^/]+$/,                     permission: "sector:delete" },
  { method: "PUT",    pathPattern: /^\/api\/sectors\/[^/]+\/users$/,              permission: "sector:assign-pic" },

  // --- Audit Log --------------------------------------------------------
  { method: "GET",    pathPattern: /^\/api\/audit-log$/,                          permission: "audit-log:read" },
  { method: "GET",    pathPattern: /^\/api\/audit-log\/export$/,                  permission: "audit-log:read" },

  // --- Telemetry --------------------------------------------------------
  { method: "GET",    pathPattern: /^\/api\/telemetry\/gas$/,                     permission: "node:read",            sectorScoped: true },
  { method: "POST",   pathPattern: /^\/api\/telemetry\/gas$/,                     permission: "node:update",          serviceTokenAllowed: true },
];

/**
 * Endpoint yang hanya butuh authenticated session (tanpa permission_id).
 * Disebut "session-only" route — mencakup logout, me, change-password,
 * 2FA flow, csrf refresh.
 */
export const SESSION_ONLY_PATHS: RegExp[] = [
  /^\/api\/auth\/logout$/,
  /^\/api\/auth\/me$/,
  /^\/api\/auth\/change-password$/,
  /^\/api\/auth\/2fa\/setup$/,
  /^\/api\/auth\/2fa\/verify$/,
  /^\/api\/auth\/2fa\/disable$/,
];

export function isSessionOnlyPath(pathname: string): boolean {
  return SESSION_ONLY_PATHS.some((p) => p.test(pathname));
}

/**
 * Lookup permission entry untuk (method, pathname). Mengembalikan null jika
 * tidak ada match — caller bertanggung jawab menolak dengan
 * `403 endpoint_not_registered` (deny-by-default).
 */
export function lookupPermission(
  method: string,
  pathname: string,
): PermissionMapEntry | null {
  const m = method as HttpMethod;
  for (const entry of PERMISSION_MAP) {
    if (entry.method === m && entry.pathPattern.test(pathname)) return entry;
  }
  return null;
}
