/**
 * Validasi nilai parameter `redirect` pada query `/login?redirect={value}`
 * untuk mencegah open-redirect attack. Sesuai Req 14.3 dan
 * `design.md §Property 14: Redirect param safety`.
 *
 * Aturan: target SHALL `startsWith('/')` AND NOT `startsWith('//')` AND
 * NOT match `/^https?:\/\//` AND NOT contain control char (\r/\n/etc.).
 */

const CONTROL_CHAR_REGEX = /[\u0000-\u001f\u007f]/;

export function isSafeRedirectTarget(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;          // protocol-relative URL
  if (/^https?:\/\//i.test(value)) return false;     // absolute URL
  if (CONTROL_CHAR_REGEX.test(value)) return false;  // CR/LF/control
  return true;
}

/**
 * Mengembalikan `value` jika aman, atau `defaultPath` (path role-default)
 * sebagai fallback. Berguna langsung di handler `/api/auth/login`.
 */
export function safeRedirectOrDefault(value: unknown, defaultPath: string): string {
  return isSafeRedirectTarget(value) ? value : defaultPath;
}
