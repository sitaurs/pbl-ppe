import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Kunci AES-256 turunan dari environment variable `APD_ENCRYPTION_KEY`.
 *
 * Strategi resolusi (sesuai design.md §2FA: TOTP Secret Encryption):
 * - Baca `process.env.APD_ENCRYPTION_KEY` (default empty string).
 * - Jika panjang byte < 32, set `KEY = null` untuk men-disable fitur enkripsi
 *   tanpa membuat aplikasi crash (Req 12.7).
 * - Jika panjang byte ≥ 32, ambil 32 byte pertama sebagai kunci AES-256.
 *
 * Variabel ini di-resolve sekali saat modul di-load (IIFE) sehingga tidak ada
 * cost re-baca env per panggilan.
 */
const KEY = (() => {
  const k = process.env.APD_ENCRYPTION_KEY ?? "";
  if (Buffer.byteLength(k, "utf8") < 32) return null;
  return Buffer.from(k, "utf8").subarray(0, 32);
})();

/**
 * Mengindikasikan apakah enkripsi TOTP secret tersedia pada runtime saat ini.
 *
 * Konsumen (mis. UI `/account/security`, route `/api/auth/2fa/setup`) memakai
 * fungsi ini untuk mendeteksi apakah fitur 2FA dapat diaktifkan. Jika `false`,
 * UI menampilkan banner "Fitur 2FA tidak tersedia: kunci enkripsi belum
 * dikonfigurasi" dan endpoint setup mengembalikan 503 (sesuai Req 12.7).
 *
 * @returns `true` jika `APD_ENCRYPTION_KEY` valid (≥ 32 byte UTF-8); `false`
 * jika fitur enkripsi disabled.
 */
export const encryptionAvailable = (): boolean => KEY !== null;

/**
 * Mengenkripsi plaintext (TOTP secret base32) menggunakan AES-256-GCM dengan
 * IV acak 12 byte per panggilan. Output berisi paket `iv || authTag || ciphertext`
 * yang di-encode base64 standar.
 *
 * Properti keamanan:
 * - **Authenticated encryption** (AES-GCM) → tamper-evidence; auth tag 16 byte
 *   di-verify saat decrypt.
 * - **IV unik per call** (12 byte random) → dua enkripsi atas plaintext sama
 *   menghasilkan ciphertext berbeda (lihat Property 11 di design.md).
 *
 * @param plain Plaintext UTF-8 (mis. TOTP secret base32). Tidak ada pembatasan
 * panjang dari fungsi ini.
 * @returns Ciphertext base64-encoded dengan layout `[12-byte IV][16-byte tag][N-byte CT]`.
 * @throws {Error} `"APD_ENCRYPTION_KEY tidak tersedia"` jika kunci tidak valid
 * (panggil `encryptionAvailable()` lebih dulu untuk menghindari error ini).
 *
 * @see Req 12.2 — TOTP secret disimpan terenkripsi di `User.totpSecretEnc`.
 */
export function encryptSecret(plain: string): string {
  if (!KEY) throw new Error("APD_ENCRYPTION_KEY tidak tersedia");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/**
 * Men-decrypt ciphertext yang dihasilkan oleh `encryptSecret()`. Verifikasi
 * auth tag dilakukan oleh AES-GCM; ciphertext yang ditamper akan menyebabkan
 * `decipher.final()` melempar error.
 *
 * Layout input WAJIB sesuai dengan output `encryptSecret`:
 * `[12-byte IV][16-byte tag][N-byte CT]` di-encode base64.
 *
 * @param b64 Ciphertext base64-encoded.
 * @returns Plaintext UTF-8 asli.
 * @throws {Error} `"APD_ENCRYPTION_KEY tidak tersedia"` jika kunci tidak valid.
 * @throws {Error} Error dari Node.js crypto bila auth tag gagal verifikasi
 * (mis. ciphertext ter-tampered atau IV/tag tidak konsisten).
 *
 * @see Req 12.7 — handler 2FA login memanggil `decryptSecret` untuk verifikasi TOTP.
 */
export function decryptSecret(b64: string): string {
  if (!KEY) throw new Error("APD_ENCRYPTION_KEY tidak tersedia");
  const buf = Buffer.from(b64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
