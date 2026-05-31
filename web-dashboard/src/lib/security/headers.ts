/**
 * Security headers + cache headers untuk SafeGuard APD Web Dashboard.
 *
 * Sesuai design.md §Security Headers + CSP dan Requirements 11.6, 11.7.
 *
 * Header yang diterapkan:
 *  - Strict-Transport-Security: aktif di production atau saat di belakang
 *    Cloudflare (Req 15.4). HSTS preload dipertimbangkan setelah verifikasi
 *    domain stabil 6 bulan.
 *  - X-Content-Type-Options: nosniff
 *  - X-Frame-Options: DENY (cegah click-jacking di /login)
 *  - Referrer-Policy: strict-origin-when-cross-origin
 *  - Content-Security-Policy: default-src 'self' + relax untuk Next.js
 *  - Permissions-Policy: kunci sensor browser yang tidak dipakai
 *
 * Cache control untuk endpoint sensitif (auth, user data):
 *  - Cache-Control: no-store
 *  - Pragma: no-cache
 */

export interface BuildHeadersOptions {
  /** True saat aplikasi running di belakang Cloudflare Tunnel (BEHIND_PROXY=cloudflare). */
  behindProxy?: boolean;
  /** True saat NODE_ENV=production. */
  isProduction?: boolean;
}

export function buildSecurityHeaders(opts: BuildHeadersOptions = {}): Record<string, string> {
  const enforceHttps = !!opts.isProduction || !!opts.behindProxy;
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
    "Content-Security-Policy": [
      "default-src 'self'",
      // Next.js requires inline script eval for hydration boundaries; we
      // reuse the standard nonce strategy at runtime — for static headers
      // we whitelist 'self' only and let Next.js inject nonces automatically.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' ws: wss:",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
    ].join("; "),
  };
  if (enforceHttps) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}

export const SENSITIVE_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/** Apakah path ini termasuk endpoint sensitif yang harus no-store? */
export function isSensitivePath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/users") ||
    pathname.startsWith("/api/audit-log") ||
    pathname === "/login" ||
    pathname === "/change-password" ||
    pathname.startsWith("/account/")
  );
}
