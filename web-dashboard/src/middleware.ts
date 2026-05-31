/**
 * Next.js middleware untuk Auth + RBAC + Security.
 *
 * Sesuai design.md §Middleware Decision Flow dan Requirements
 * 4.7, 7.1, 7.2, 7.3, 7.4, 11.4, 14.1, 15.3.
 *
 * Decision flow (lihat design.md untuk diagram lengkap):
 *  1. Whitelist path (Next.js internals, public assets, login page, csrf).
 *  2. Resolve clientIp via Trusted_Proxy_IPs (loopback skip / cloudflare check).
 *  3. Service_Token flow: Authorization: Bearer → verify + whitelist endpoint.
 *  4. Session flow: read apd_session cookie, verifySession, sliding refresh.
 *  5. mustChangePassword guard (HTML redirect ke /change-password).
 *  6. CSRF check (POST/PUT/PATCH/DELETE).
 *  7. lookupPermission + 403 if missing.
 *  8. Sector scope injection ke header x-apd-context-*.
 *
 * Runtime: nodejs (butuh Prisma + crypto). Middleware ini tidak menjalankan
 * di edge runtime karena DB access. Konfigurasi `runtime: 'nodejs'` ada di
 * `export const config` di bawah.
 */
import { NextResponse, type NextRequest } from "next/server";

import { resolveClientIp } from "@/lib/proxy/cloudflare-ips";
import {
  isPublicPath,
  isSessionOnlyPath,
  lookupPermission,
} from "@/lib/rbac/permission-map";
import { isSafeRedirectTarget } from "@/lib/auth/redirect-safety";
import { getUserPerms } from "@/lib/rbac/permission-cache";
import { isSectorScopedRole } from "@/lib/rbac/sector-scope";
import {
  SESSION_COOKIE_NAME,
} from "@/lib/auth/cookie-attrs";
import { verifyCsrfToken } from "@/lib/auth/csrf";
import {
  shouldRefreshSession,
  computeRefreshedSession,
} from "@/lib/auth/session";
import { buildSecurityHeaders, isSensitivePath, SENSITIVE_CACHE_HEADERS } from "@/lib/security/headers";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { isMigrationPending } from "@/lib/migration-state";

export const config = {
  runtime: "nodejs",
  matcher: [
    // Run on /api/* and protected pages, skip Next.js internals + assets.
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};

const STATIC_ASSET_RE = /\.(?:png|jpg|jpeg|gif|svg|ico|css|js|woff2?|ttf|map)$/;

function jsonError(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status });
}

function isHtmlRequest(req: NextRequest): boolean {
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("text/html");
}

async function loadAuthenticatedUser(userId: string): Promise<AuthenticatedUser | null> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        status: true,
        totpEnabled: true,
        mustChangePassword: true,
        roleId: true,
        role: { select: { id: true, name: true } },
      },
    });
    if (!user) return null;
    const perms = await getUserPerms(userId);
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: {
        id: user.role.id,
        name: user.role.name,
        permissions: [...perms.permissions] as AuthenticatedUser["role"]["permissions"],
      },
      sectorIds: perms.sectorIds,
      totpEnabled: user.totpEnabled,
      mustChangePassword: user.mustChangePassword,
      status: user.status as AuthenticatedUser["status"],
    };
  } catch (err) {
    console.warn("[middleware] loadAuthenticatedUser error:", err);
    return null;
  }
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();
  const isHtml = isHtmlRequest(req);
  const isApi = pathname.startsWith("/api/");
  const isProduction = process.env.NODE_ENV === "production";
  const behindProxy = process.env.BEHIND_PROXY === "cloudflare";

  // 1. Skip Next.js internals and static assets (defensive — matcher should
  //    have filtered already).
  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    STATIC_ASSET_RE.test(pathname)
  ) {
    return NextResponse.next();
  }

  // 2. Migration-pending banner (Req 2.7)
  if (isMigrationPending()) {
    if (isApi && pathname !== "/api/health") {
      return jsonError(503, { error: "DB_MIGRATION_PENDING" });
    }
    if (pathname !== "/login" && pathname !== "/health") {
      const url = new URL("/login", req.url);
      url.searchParams.set("migration", "pending");
      return NextResponse.redirect(url);
    }
    // Allow /login to render and show banner
  }

  // 3. Resolve client IP via trusted proxy rules (Req 15.3, 10.7)
  // Note: NextRequest in newer Next.js no longer exposes `req.ip`. Fall back
  // to forwarded headers (only trusted when running under our middleware
  // resolveClientIp gate).
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const xRealIp = req.headers.get("x-real-ip");
  const remoteAddress = xff ?? xRealIp ?? "127.0.0.1";
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  const ipResult = resolveClientIp({
    remoteAddress,
    cfConnectingIp,
    behindProxy: process.env.BEHIND_PROXY,
  });
  if (!ipResult.ok) {
    return jsonError(400, { error: ipResult.error });
  }
  const clientIp = ipResult.clientIp;

  // 4. Pass-through whitelist (login, csrf, health, /_next/*, /public/*)
  if (isPublicPath(pathname) || pathname === "/login" || pathname === "/403") {
    const res = NextResponse.next();
    applySecurityResponseHeaders(res, { isProduction, behindProxy, pathname });
    return res;
  }

  // 5. Service_Token flow (Authorization: Bearer)
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const expected = process.env.APD_SERVICE_TOKEN;
    if (!expected || expected.length < 32) {
      return jsonError(503, { error: "service_token_not_configured" });
    }
    if (token !== expected) {
      return jsonError(401, { error: "invalid_service_token" });
    }
    // Token valid → check endpoint whitelist
    const entry = lookupPermission(method, pathname);
    if (!entry || !entry.serviceTokenAllowed) {
      return jsonError(403, { error: "service_token_scope_denied" });
    }
    // Allow request through; attach context.
    return passThrough(req, {
      user: null,
      serviceToken: true,
      sectorIds: null,
      csrfToken: null,
      clientIp,
      isProduction,
      behindProxy,
      pathname,
    });
  }

  // 6. Session flow
  const cookie = req.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) {
    return denyAuth(req, isApi, isHtml, pathname);
  }

  // Validate session via Prisma
  let session: {
    id: string;
    userId: string;
    csrfToken: string;
    expiresAt: Date;
    lastRefreshedAt: Date;
  } | null = null;
  try {
    const { prisma } = await import("@/lib/prisma");
    session = await prisma.session.findUnique({ where: { id: cookie.value } });
    if (session && session.expiresAt.getTime() <= Date.now()) {
      session = null;
    }
  } catch (err) {
    console.warn("[middleware] session lookup error:", err);
    return jsonError(503, { error: "DB_UNAVAILABLE" });
  }
  if (!session) {
    return denyAuth(req, isApi, isHtml, pathname);
  }

  // Sliding refresh (Req 4.6)
  if (shouldRefreshSession(session, new Date())) {
    try {
      const { prisma } = await import("@/lib/prisma");
      const refreshed = computeRefreshedSession(new Date());
      await prisma.session.update({
        where: { id: session.id },
        data: refreshed,
      });
    } catch (err) {
      console.warn("[middleware] session refresh failed:", err);
    }
  }

  // Load authenticated user with permissions + sectorIds
  const user = await loadAuthenticatedUser(session.userId);
  if (!user) {
    return denyAuth(req, isApi, isHtml, pathname);
  }
  if (user.status === "disabled" || user.status === "locked") {
    return denyAuth(req, isApi, isHtml, pathname);
  }

  // mustChangePassword guard (Req 9.6)
  if (
    user.mustChangePassword &&
    pathname !== "/change-password" &&
    pathname !== "/api/auth/change-password" &&
    pathname !== "/api/auth/logout" &&
    pathname !== "/api/auth/me"
  ) {
    if (isHtml) {
      return NextResponse.redirect(new URL("/change-password", req.url));
    }
    return jsonError(403, { error: "must_change_password" });
  }

  // CSRF check (Req 11.4) — POST/PUT/PATCH/DELETE
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const headerToken = req.headers.get("x-csrf-token");
    if (!headerToken || !verifyCsrfToken(headerToken, session.csrfToken)) {
      return jsonError(403, { error: "csrf_token_invalid" });
    }
  }

  // Session-only paths bypass permission lookup
  if (isSessionOnlyPath(pathname)) {
    return passThrough(req, {
      user,
      serviceToken: false,
      sectorIds: isSectorScopedRole(user.role.name) ? user.sectorIds : null,
      csrfToken: session.csrfToken,
      clientIp,
      isProduction,
      behindProxy,
      pathname,
    });
  }

  // Permission lookup (Req 7.5 — deny-by-default)
  if (isApi) {
    const entry = lookupPermission(method, pathname);
    if (!entry) {
      return jsonError(403, { error: "endpoint_not_registered" });
    }
    if (!user.role.permissions.includes(entry.permission)) {
      // Best-effort audit log
      try {
        const { appendAuditLog } = await import("@/lib/audit/audit-log");
        await appendAuditLog({
          userId: user.id,
          action: "auth:permission-denied",
          resourceType: "endpoint",
          resourceId: `${method} ${pathname}`,
          ipAddress: clientIp,
          userAgent: req.headers.get("user-agent"),
          metadata: { required: entry.permission },
        });
      } catch {
        // ignore
      }
      return jsonError(403, {
        error: "permission_denied",
        required: entry.permission,
      });
    }
    // Sector scope decision
    const scoped = entry.sectorScoped && isSectorScopedRole(user.role.name);
    const sectorIds = scoped ? user.sectorIds : null;
    return passThrough(req, {
      user,
      serviceToken: false,
      sectorIds,
      csrfToken: session.csrfToken,
      clientIp,
      isProduction,
      behindProxy,
      pathname,
    });
  }

  // HTML pages (non-API): just pass through with context.
  return passThrough(req, {
    user,
    serviceToken: false,
    sectorIds: isSectorScopedRole(user.role.name) ? user.sectorIds : null,
    csrfToken: session.csrfToken,
    clientIp,
    isProduction,
    behindProxy,
    pathname,
  });
}

interface PassThroughOptions {
  user: AuthenticatedUser | null;
  serviceToken: boolean;
  sectorIds: string[] | null;
  csrfToken: string | null;
  clientIp: string;
  isProduction: boolean;
  behindProxy: boolean;
  pathname: string;
}

function passThrough(req: NextRequest, opts: PassThroughOptions): NextResponse {
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-apd-context-user", opts.user ? JSON.stringify(opts.user) : "");
  reqHeaders.set("x-apd-context-sector-ids", JSON.stringify(opts.sectorIds));
  reqHeaders.set("x-apd-context-csrf-token", opts.csrfToken ?? "");
  reqHeaders.set("x-apd-context-client-ip", opts.clientIp);
  reqHeaders.set("x-apd-context-service", opts.serviceToken ? "1" : "0");

  const res = NextResponse.next({ request: { headers: reqHeaders } });
  applySecurityResponseHeaders(res, {
    isProduction: opts.isProduction,
    behindProxy: opts.behindProxy,
    pathname: opts.pathname,
  });
  return res;
}

function applySecurityResponseHeaders(
  res: NextResponse,
  opts: { isProduction: boolean; behindProxy: boolean; pathname: string },
): void {
  const security = buildSecurityHeaders({
    isProduction: opts.isProduction,
    behindProxy: opts.behindProxy,
  });
  for (const [k, v] of Object.entries(security)) res.headers.set(k, v);
  if (isSensitivePath(opts.pathname)) {
    for (const [k, v] of Object.entries(SENSITIVE_CACHE_HEADERS)) {
      res.headers.set(k, v);
    }
  }
}

function denyAuth(
  req: NextRequest,
  isApi: boolean,
  isHtml: boolean,
  pathname: string,
): NextResponse {
  if (isHtml && !isApi) {
    const url = new URL("/login", req.url);
    if (pathname !== "/" && isSafeRedirectTarget(pathname)) {
      url.searchParams.set("redirect", pathname);
    }
    return NextResponse.redirect(url);
  }
  return jsonError(401, { error: "session_invalid" });
}
