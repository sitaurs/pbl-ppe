/**
 * Recovery codes generator + redeemer untuk fitur 2FA SafeGuard APD.
 *
 * Sesuai design.md §Components and Interfaces (auth flow) dan
 * Requirements 12.2 (8 kode 10-char alfanumerik) & 12.4 (atomic mark used).
 *
 * - Plaintext code hanya ditampilkan satu kali ke user; database hanya menyimpan
 *   SHA-256 hash. Tidak menggunakan argon2 karena code di-generate dengan high
 *   entropy (50 bit) sehingga rainbow-table attack tidak praktis dan kita
 *   butuh lookup O(1) saat redeem.
 * - Alfabet meng-omit O, I, 0, 1 untuk readability saat user mencatat manual.
 * - `redeemRecoveryCode` menggunakan `updateMany` dengan filter `used=false`
 *   sehingga atomic: hanya satu sesi yang berhasil redeem code yang sama bila
 *   ada race (sesuai Req 12.4 "menandai kode tersebut sebagai terpakai
 *   sehingga tidak dapat digunakan kembali").
 */
import { createHash, randomBytes } from "crypto";

import { prisma } from "@/lib/prisma";

const ALPHABET = "ABCDEFGHIJKLMNPQRSTUVWXYZ23456789"; // omit O,I,0,1 for readability
const CODE_LENGTH = 10;

/**
 * Hash recovery code menggunakan SHA-256 hex. Deterministik agar lookup
 * `where: { codeHash }` cocok saat redeem.
 */
export function hashCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

/**
 * Generate `n` recovery code (default 8 sesuai Req 12.2). Mengembalikan
 * plaintext array (untuk ditampilkan ke user satu kali) dan hashes array
 * (untuk disimpan ke DB). Kedua array ber-index sama: plaintext[i] hash =
 * hashes[i].
 */
export function generateRecoveryCodes(
  n = 8
): { plaintext: string[]; hashes: string[] } {
  const plaintext: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < n; i++) {
    const bytes = randomBytes(CODE_LENGTH);
    let code = "";
    for (let j = 0; j < CODE_LENGTH; j++) {
      code += ALPHABET[bytes[j] % ALPHABET.length];
    }
    plaintext.push(code);
    hashes.push(hashCode(code));
  }
  return { plaintext, hashes };
}

/**
 * Redeem a recovery code: cari record berdasarkan hash + userId, tandai used.
 * Atomic via `updateMany` dengan filter `used=false`; jika dua request
 * concurrent mencoba redeem code yang sama, hanya satu yang akan mendapat
 * `count === 1`.
 *
 * Returns true jika redemption berhasil; false jika code tidak ditemukan,
 * sudah terpakai, atau milik user lain.
 */
export async function redeemRecoveryCode(
  userId: string,
  code: string
): Promise<boolean> {
  const codeHash = hashCode(code);
  const result = await prisma.recoveryCode.updateMany({
    where: { userId, codeHash, used: false },
    data: { used: true, usedAt: new Date() },
  });
  return result.count === 1;
}
