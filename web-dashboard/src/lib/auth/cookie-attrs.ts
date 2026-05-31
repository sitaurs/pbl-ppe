/**
 * Cookie attribute resolver untuk Session_Cookie SafeGuard APD.
 *
 * Sesuai design.md dan Requirements 11.1, 15.4.
 *
 * Logic:
 *  - HttpOnly=true selalu (mencegah akses dari JavaScript browser).
 *  - SameSite=Lax selalu (mengizinkan redirect dari email/login flow).
 *  - Path=/ (cookie tersedia di semua route).
 *  - Secure:
 *      - dev (NODE_ENV !== 'production') → false (mengizinkan http://localhost)
 *      - prod (NODE_ENV === 'production') → true
 *      - BEHIND_PROXY=cloudflare → true tanpa pengecualian
 */

export interface SessionCookieAttrs {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  /** Detik. 8 jam. */
  maxAge: number;
}

export const SESSION_COOKIE_NAME = "apd_session";

export function getSessionCookieAttrs(env?: NodeJS.ProcessEnv): SessionCookieAttrs {
  const e = env ?? process.env;
  const behindProxy = e.BEHIND_PROXY === "cloudflare";
  const isProduction = e.NODE_ENV === "production";
  const secure = isProduction || behindProxy;
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: 8 * 60 * 60, // 8 hours
  };
}

/** Build raw `Set-Cookie` header string. */
export function buildSetCookieHeader(
  value: string,
  attrs: SessionCookieAttrs,
): string {
  const parts: string[] = [`${SESSION_COOKIE_NAME}=${value}`];
  parts.push(`Path=${attrs.path}`);
  if (attrs.maxAge > 0) parts.push(`Max-Age=${attrs.maxAge}`);
  parts.push(`SameSite=${attrs.sameSite === "lax" ? "Lax" : attrs.sameSite}`);
  if (attrs.httpOnly) parts.push("HttpOnly");
  if (attrs.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Build clear-cookie header for logout. */
export function buildClearCookieHeader(env?: NodeJS.ProcessEnv): string {
  const attrs = getSessionCookieAttrs(env);
  const parts: string[] = [`${SESSION_COOKIE_NAME}=`];
  parts.push(`Path=${attrs.path}`);
  parts.push("Max-Age=0");
  parts.push(`SameSite=${attrs.sameSite === "lax" ? "Lax" : attrs.sameSite}`);
  if (attrs.httpOnly) parts.push("HttpOnly");
  if (attrs.secure) parts.push("Secure");
  return parts.join("; ");
}
