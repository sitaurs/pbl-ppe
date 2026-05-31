import { randomBytes, timingSafeEqual } from "crypto";

/**
 * Generate token CSRF 32-byte (256-bit) random base64url-encoded.
 * Hasil string panjang 43 karakter (32 byte → 43 chars base64url tanpa padding).
 * Sesuai design.md §CSRF Double-Submit Token Pattern dan Req 11.2.
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Constant-time comparison untuk verifikasi CSRF token agar tidak rentan
 * timing attack. Mengembalikan `false` jika length berbeda atau bytes
 * tidak match. Sesuai Req 11.4.
 */
export function verifyCsrfToken(provided: string | null | undefined, stored: string): boolean {
  if (!provided || typeof provided !== "string") return false;
  if (provided.length !== stored.length) return false;
  try {
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(stored, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
