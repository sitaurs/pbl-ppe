import { Secret, TOTP } from "otpauth";

/**
 * Membungkus library `otpauth` untuk fitur 2FA SafeGuard APD.
 * Mengikuti RFC 6238 dengan parameter:
 *  - period: 30 detik
 *  - digits: 6
 *  - algorithm: SHA-1 (compatible dengan Google Authenticator, Authy, dst.)
 *
 * Sesuai design.md §2FA Enrollment Flow + Recovery Codes dan Req 12.1.
 */

const PERIOD = 30;
const DIGITS = 6;
const ALGORITHM = "SHA1";

/**
 * Generate secret base32 acak 160-bit (sesuai Authy/Google Authenticator default).
 */
export function generateTotpSecret(): string {
  // Default Secret() di otpauth membuat 20 byte (160 bit) secret base32-encoded
  return new Secret({ size: 20 }).base32;
}

/**
 * Build otpauth:// URI yang dapat dibaca oleh authenticator app saat di-render
 * sebagai QR code. Format issuer dan label sesuai konvensi RFC 6238.
 */
export function generateOtpauthUri(
  secretBase32: string,
  accountLabel: string,
  issuer = "SafeGuard APD"
): string {
  const totp = new TOTP({
    issuer,
    label: accountLabel,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secretBase32),
  });
  return totp.toString();
}

/**
 * Verifikasi 6-digit code TOTP terhadap secret. `window` adalah jumlah
 * step ±30 detik yang ditoleransi (default 1 = ±30 detik).
 * Mengembalikan `true` jika code valid dalam window tersebut.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  window = 1
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    const totp = new TOTP({
      algorithm: ALGORITHM,
      digits: DIGITS,
      period: PERIOD,
      secret: Secret.fromBase32(secretBase32),
    });
    const delta = totp.validate({ token: code, window });
    return delta !== null;
  } catch {
    return false;
  }
}

/**
 * Generate code TOTP saat ini untuk testing / setup verification (jangan
 * gunakan di production untuk login flow karena code tidak boleh diketahui server).
 */
export function generateTotpCode(secretBase32: string): string {
  const totp = new TOTP({
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secretBase32),
  });
  return totp.generate();
}
