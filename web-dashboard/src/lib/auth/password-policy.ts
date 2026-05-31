/**
 * Password Policy Validator
 *
 * Implements the Password_Policy contract for SafeGuard APD Web Dashboard
 * (Auth + RBAC spec, Requirements 9.3 and 9.4):
 *
 *   - panjang minimum 10 karakter
 *   - panjang maksimum 256 karakter
 *   - mengandung minimal satu huruf besar (A-Z)
 *   - mengandung minimal satu huruf kecil (a-z)
 *   - mengandung minimal satu digit (0-9)
 *   - mengandung minimal satu simbol non-alfanumerik
 *   - tidak ada di HIBP_List (offline top-10k SHA-1 list)
 *
 * Lihat `design.md §Password Policy Validator + HIBP` untuk kontrak lengkap.
 *
 * Hubungan dengan modul lain:
 *   - HIBP lookup didelegasikan ke `src/lib/auth/hibp-list.ts` (loader +
 *     `isPasswordPwned`). Loader di-load saat boot via `instrumentation.ts`.
 */
import { isPasswordPwned } from "./hibp-list";

/**
 * Token rule yang dapat dilanggar oleh sebuah password. Token-token ini
 * dipakai langsung sebagai entri dalam respons API
 * `400 { error: "password_policy_violation", rules: [...] }` (Req 9.4).
 *
 * Definisi token:
 *   - panjang_kurang_dari_10 — `plain.length < 10`
 *   - panjang_lebih_dari_256 — `plain.length > 256`
 *   - tidak_ada_huruf_besar  — tidak match `/[A-Z]/`
 *   - tidak_ada_huruf_kecil  — tidak match `/[a-z]/`
 *   - tidak_ada_digit        — tidak match `/[0-9]/`
 *   - tidak_ada_simbol       — tidak match `/[^A-Za-z0-9]/`
 *   - ada_di_hibp_list       — SHA-1 hex ada di HIBP_PREFIXES set
 */
export type PasswordRule =
  | "panjang_kurang_dari_10"
  | "panjang_lebih_dari_256"
  | "tidak_ada_huruf_besar"
  | "tidak_ada_huruf_kecil"
  | "tidak_ada_digit"
  | "tidak_ada_simbol"
  | "ada_di_hibp_list";

/**
 * Validasi `plain` terhadap seluruh aturan Password_Policy.
 *
 * Mengembalikan array kosong `[]` jika dan hanya jika SEMUA aturan
 * terpenuhi. Jika ada aturan yang dilanggar, token aturan tersebut akan
 * muncul tepat sekali dalam array (tanpa duplikat). Aturan yang dipenuhi
 * TIDAK PERNAH muncul dalam output (soundness + completeness — Property 3).
 *
 * Catatan implementasi:
 *   - Urutan token dalam array deterministik (mengikuti urutan check di
 *     dalam fungsi) sehingga UI dapat menampilkannya secara konsisten.
 *   - Tidak melakukan trimming pada `plain`; whitespace diperlakukan
 *     sebagai karakter biasa (whitespace bisa berkontribusi ke panjang
 *     dan ke kategori "simbol" karena tidak termasuk `[A-Za-z0-9]`).
 */
export function validatePassword(plain: string): PasswordRule[] {
  const violations: PasswordRule[] = [];

  if (plain.length < 10) violations.push("panjang_kurang_dari_10");
  if (plain.length > 256) violations.push("panjang_lebih_dari_256");
  if (!/[A-Z]/.test(plain)) violations.push("tidak_ada_huruf_besar");
  if (!/[a-z]/.test(plain)) violations.push("tidak_ada_huruf_kecil");
  if (!/[0-9]/.test(plain)) violations.push("tidak_ada_digit");
  if (!/[^A-Za-z0-9]/.test(plain)) violations.push("tidak_ada_simbol");
  if (isPasswordPwned(plain)) violations.push("ada_di_hibp_list");

  return violations;
}
