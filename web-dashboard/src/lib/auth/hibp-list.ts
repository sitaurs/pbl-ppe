import { createHash } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * In-memory set of SHA-1 hex (uppercase, 40 chars) untuk password yang
 * tercantum di HIBP top-10k bundled asset.
 *
 * Ukuran target ±10.000 entri (±400 KB) sesuai design.md §Password Policy
 * Validator + HIBP. Lookup O(1) lewat `Set.has`.
 */
const HIBP_PREFIXES = new Set<string>();
let loaded = false;

/**
 * Resolve path ke asset bundled `pwned-top-10k.txt`. Asset disimpan di
 * `src/lib/data/pwned-top-10k.txt` agar ikut ter-bundle saat `next build`
 * (Next.js menyalin file di bawah `src/` yang direferensikan secara statis).
 */
function getDefaultAssetPath(): string {
  return resolve(process.cwd(), "src/lib/data/pwned-top-10k.txt");
}

/**
 * Populate set HIBP dari konten teks (atau dari asset default jika `text`
 * tidak diberikan). Idempotent: panggilan berikutnya tanpa argumen tidak
 * mereload kecuali `resetHibpList()` dipanggil terlebih dahulu.
 *
 * Format file: SHA-1 hex (uppercase) 40 karakter per baris. Baris kosong
 * dan baris dengan panjang ≠ 40 di-skip. Whitespace di-trim.
 *
 * Sesuai Req 9.3 (HIBP_List offline, tidak ada panggilan jaringan).
 */
export function loadHibpList(text?: string): void {
  if (loaded && text === undefined) return;
  HIBP_PREFIXES.clear();
  const content = text ?? readFileSync(getDefaultAssetPath(), "utf8");
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim().toUpperCase();
    if (t.length === 40) HIBP_PREFIXES.add(t);
  }
  loaded = true;
}

/**
 * Apakah password plaintext muncul di HIBP_List? Hash plaintext dengan
 * SHA-1 (uppercase hex), kemudian cek keanggotaan di set.
 *
 * Catatan: SHA-1 di sini hanya dipakai sebagai key lookup HIBP, BUKAN
 * sebagai algoritma hash penyimpanan password (gunakan Argon2id untuk itu).
 */
export function isPasswordPwned(plain: string): boolean {
  if (!loaded) loadHibpList();
  const sha1 = createHash("sha1").update(plain, "utf8").digest("hex").toUpperCase();
  return HIBP_PREFIXES.has(sha1);
}

/**
 * Jumlah entri yang ter-load saat ini. Berguna untuk diagnostik (boot log)
 * dan property test.
 */
export function hibpListSize(): number {
  if (!loaded) loadHibpList();
  return HIBP_PREFIXES.size;
}

/**
 * Reset state global. Dipakai oleh test untuk memuat ulang list dengan
 * konten arbitrer lewat `loadHibpList(text)`.
 */
export function resetHibpList(): void {
  HIBP_PREFIXES.clear();
  loaded = false;
}
