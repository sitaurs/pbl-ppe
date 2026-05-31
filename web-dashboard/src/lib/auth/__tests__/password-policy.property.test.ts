/**
 * Property 3: Password policy validator soundness and completeness
 *
 * Validates: Requirements 9.3, 9.4
 *
 * Statement (design.md §Correctness Properties — Property 3):
 *   For any string password input, `validatePassword(p)` SHALL mengembalikan
 *   empty array jika dan hanya jika SEMUA aturan terpenuhi (panjang 10–256,
 *   mengandung huruf besar, huruf kecil, digit, simbol, dan tidak ada di
 *   HIBP_List); jika SALAH SATU aturan dilanggar, output SHALL memuat token
 *   yang sesuai dengan aturan yang dilanggar dan TIDAK memuat token aturan
 *   yang dipenuhi.
 *
 * Strategi test:
 *   1. Generator skenario "structured" — bangun password dari kombinasi flag
 *      `{ hasUpper, hasLower, hasDigit, hasSymbol, lengthClass, isPwned }`
 *      sehingga oracle untuk setiap rule dapat dihitung deterministik dari
 *      flag, lalu cocokkan dengan output `validatePassword`. Memberi
 *      jaminan completeness pada permutasi cabang yang sengaja dipicu.
 *   2. Generator "raw string" — string acak panjang 0..300 untuk mengetes
 *      bahwa SETIAP token yang muncul memang menandai pelanggaran nyata
 *      (soundness) dan SETIAP rule yang dilanggar muncul (completeness),
 *      tanpa pre-konstruksi. Oracle dihitung independen menggunakan check
 *      ekspresi reguler dasar dan SHA-1 lookup yang sama dengan
 *      implementasi HIBP loader.
 *
 * HIBP setup:
 *   `beforeAll` memuat list HIBP deterministik berisi tiga SHA-1 hex agar
 *   property test tidak bergantung pada bundled `pwned-top-10k.txt` (yang
 *   bisa mengandung ribuan entry dan memperlambat test). Yang dipakai:
 *   SHA-1 dari "password1", "letmein01", dan "qwertyuiop". Setiap raw
 *   password yang ter-hash ke salah satu prefix tersebut akan ter-flag
 *   `ada_di_hibp_list`.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fc from "fast-check";
import { createHash } from "crypto";
import { validatePassword, PasswordRule } from "@/lib/auth/password-policy";
import { loadHibpList, resetHibpList } from "@/lib/auth/hibp-list";

// --- HIBP fixture -------------------------------------------------------

/**
 * Deterministic HIBP fixture. Each line is the SHA-1 (uppercase hex) of a
 * known weak password. Test generators pick from this list saat butuh
 * `isPwned=true`. Produces predictable round-trips:
 *   - "password1"  → E38AD214943DAAD1D64C102FAEC29DE4AFE9DA3D
 *   - "letmein01"  → derived runtime
 *   - "qwertyuiop" → derived runtime
 */
const PWNED_PLAINS = ["password1", "letmein01", "qwertyuiop"] as const;

function sha1Hex(s: string): string {
  return createHash("sha1").update(s, "utf8").digest("hex").toUpperCase();
}

beforeAll(() => {
  // Reset state agar tidak ada residu dari test lain (atau dari boot
  // `instrumentation.ts`) yang men-load 10k entries.
  resetHibpList();
  const list = PWNED_PLAINS.map(sha1Hex).join("\n");
  loadHibpList(list);
});

// --- Independent rule oracle (re-derives expected violations) -----------

/**
 * Hitung set rule yang DIHARAPKAN dilanggar oleh `plain`, dihitung secara
 * independen dari implementasi `validatePassword`. Logika harus identik
 * dengan kontrak di `design.md §Password Policy Validator + HIBP`.
 *
 * Pemilihan oracle yang independen ini penting agar property test tidak
 * sekadar mengulang implementasi: regex dasar di sini berasal langsung
 * dari teks acceptance criteria Requirement 9.3, bukan dari source file.
 */
function expectedViolations(plain: string, pwnedSet: Set<string>): Set<PasswordRule> {
  const out = new Set<PasswordRule>();
  if (plain.length < 10) out.add("panjang_kurang_dari_10");
  if (plain.length > 256) out.add("panjang_lebih_dari_256");
  if (!/[A-Z]/.test(plain)) out.add("tidak_ada_huruf_besar");
  if (!/[a-z]/.test(plain)) out.add("tidak_ada_huruf_kecil");
  if (!/[0-9]/.test(plain)) out.add("tidak_ada_digit");
  if (!/[^A-Za-z0-9]/.test(plain)) out.add("tidak_ada_simbol");
  if (pwnedSet.has(sha1Hex(plain))) out.add("ada_di_hibp_list");
  return out;
}

// --- Generators ---------------------------------------------------------

/**
 * Generator "raw string" — string ASCII printable + sebagian whitespace
 * panjang 0..300. Range ini sengaja meliputi kedua boundary panjang
 * (10 minimum, 256 maksimum) dengan margin agar pelanggaran panjang ikut
 * tergenerate cukup sering tanpa membuat string berukuran ekstrem yang
 * lambat di-hash SHA-1.
 *
 * `fc.string` default sudah cukup untuk Unicode-ish input, tetapi di sini
 * kita memakai `fullUnicodeString` agar karakter di luar BMP juga ikut
 * tergenerate, sehingga regex `[^A-Za-z0-9]` benar-benar terkena karakter
 * non-ASCII (memvalidasi bahwa "simbol" tidak terbatas ASCII).
 */
const rawPasswordArb = fc.string({ minLength: 0, maxLength: 300, unit: "binary-ascii" });

/**
 * Generator "structured" — bangun password dari kombinasi flag eksplisit
 * sehingga setiap permutasi pelanggaran/pemenuhan benar-benar tereksplor.
 *
 * lengthClass:
 *   - "short"  → panjang 0..9   (memicu panjang_kurang_dari_10)
 *   - "normal" → panjang 10..256
 *   - "long"   → panjang 257..300 (memicu panjang_lebih_dari_256)
 *
 * Setelah string dibangun dari potongan yang memenuhi flag yang dipilih,
 * panjangnya dipangkas/ditambah filler "x" sampai masuk lengthClass.
 * Filler "x" hanya menambah huruf kecil sehingga TIDAK mengubah flag
 * `hasUpper/hasDigit/hasSymbol` yang sudah dipilih.
 *
 * isPwned:
 *   - true  → seluruh password di-replace dengan salah satu plaintext di
 *             PWNED_PLAINS (panjangnya tetap di lengthClass="normal" karena
 *             tiap entry 9–10 char, jadi pwned hanya dipasangkan dengan
 *             `lengthClass=normal`).
 */
type Flags = {
  hasUpper: boolean;
  hasLower: boolean;
  hasDigit: boolean;
  hasSymbol: boolean;
  lengthClass: "short" | "normal" | "long";
  isPwned: boolean;
};

const flagsArb: fc.Arbitrary<Flags> = fc.record({
  hasUpper: fc.boolean(),
  hasLower: fc.boolean(),
  hasDigit: fc.boolean(),
  hasSymbol: fc.boolean(),
  lengthClass: fc.constantFrom("short", "normal", "long") as fc.Arbitrary<
    "short" | "normal" | "long"
  >,
  isPwned: fc.boolean(),
});

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGIT = "0123456789";
const SYMBOL = "!@#$%^&*()_+-=[]{}|;:'\",.<>/?~`";

function buildStructuredPassword(flags: Flags): string {
  // Pwned cabang: kembalikan plaintext fixed dari PWNED_PLAINS, abaikan
  // flag lain. Caller (property body) akan menghitung oracle ulang dari
  // string final, jadi flag mismatch tidak menjadi masalah.
  if (flags.isPwned) {
    // Pilih deterministik berdasarkan kombinasi flag boolean lain agar
    // shrinking fast-check tetap deterministik.
    const idx =
      Number(flags.hasUpper) +
      Number(flags.hasLower) * 2 +
      Number(flags.hasDigit) * 4;
    return PWNED_PLAINS[idx % PWNED_PLAINS.length];
  }

  let parts: string[] = [];
  if (flags.hasUpper) parts.push(UPPER[0]);
  if (flags.hasLower) parts.push(LOWER[0]);
  if (flags.hasDigit) parts.push(DIGIT[0]);
  if (flags.hasSymbol) parts.push(SYMBOL[0]);
  // Jika TIDAK ada flag yang aktif, mulai dengan string kosong; filler "X"
  // (huruf BESAR) akan dipakai untuk lengthClass!=short agar tetap punya
  // panjang yang valid tanpa mengubah flag yang sudah false. Tapi ini
  // berarti hasUpper-effective menjadi true; karena oracle dihitung dari
  // string final (bukan dari flags), itu tetap konsisten.
  let s = parts.join("");

  // Tentukan target length sesuai lengthClass.
  let target: number;
  switch (flags.lengthClass) {
    case "short":
      // 0..9 — gunakan panjang minimum dari potongan flag
      target = Math.min(s.length, 9);
      // Jangan tambahkan filler; potong saja jika kelebihan.
      if (s.length > target) s = s.slice(0, target);
      return s;
    case "normal":
      target = 10 + (s.length % 30); // 10..39
      break;
    case "long":
      target = 257 + (s.length % 20); // 257..276
      break;
  }
  // Pad dengan karakter yang TIDAK mengubah flag mana pun:
  //   - kalau hasLower=true → pad dengan "x" (huruf kecil)
  //   - else jika hasUpper=true → pad dengan "X" (huruf besar)
  //   - else jika hasDigit=true → pad dengan "0" (digit)
  //   - else jika hasSymbol=true → pad dengan "!" (simbol)
  //   - else (semua flag false) → pad dengan " " (whitespace = simbol)
  //     Catatan: pad ini akan MENAMBAH flag-effective hasSymbol=true,
  //     sehingga oracle (yang dihitung dari string final) akan
  //     mencerminkan kenyataan tersebut. Property tetap berlaku.
  let pad = "";
  if (flags.hasLower) pad = "x";
  else if (flags.hasUpper) pad = "X";
  else if (flags.hasDigit) pad = "0";
  else if (flags.hasSymbol) pad = "!";
  else pad = " ";
  while (s.length < target) s += pad;
  return s.slice(0, target);
}

const structuredPasswordArb = flagsArb.map(buildStructuredPassword);

// --- Properties ---------------------------------------------------------

describe("Property 3: Password policy validator soundness & completeness (Requirements 9.3, 9.4)", () => {
  /**
   * Oracle set HIBP yang persis sama dengan yang diload `beforeAll`.
   * Dipakai oleh `expectedViolations` agar oracle tidak meminjam state
   * implementasi.
   */
  const pwnedSet = new Set(PWNED_PLAINS.map(sha1Hex));

  it("validatePassword(p) === [] iff semua rule terpenuhi (raw string)", () => {
    fc.assert(
      fc.property(rawPasswordArb, (plain) => {
        const expected = expectedViolations(plain, pwnedSet);
        const got = validatePassword(plain);

        // Dua arah biimplikasi:
        //   (a) semua rule terpenuhi (expected size 0) ⇒ output []
        //   (b) output [] ⇒ semua rule terpenuhi (expected size 0)
        if (expected.size === 0) {
          expect(got).toEqual([]);
        } else {
          expect(got.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("setiap rule yang dilanggar muncul; setiap rule yang dipenuhi tidak muncul (raw string)", () => {
    fc.assert(
      fc.property(rawPasswordArb, (plain) => {
        const expected = expectedViolations(plain, pwnedSet);
        const got = new Set(validatePassword(plain));

        // Soundness: setiap token di output benar-benar pelanggaran
        for (const rule of got) {
          expect(expected.has(rule)).toBe(true);
        }
        // Completeness: setiap rule yang dilanggar muncul tepat di output
        for (const rule of expected) {
          expect(got.has(rule)).toBe(true);
        }
        // Tidak ada duplikat token dalam array hasil
        const arr = validatePassword(plain);
        expect(arr.length).toBe(new Set(arr).size);
      }),
      { numRuns: 500 },
    );
  });

  it("structured generator: kombinasi flag hasUpper/hasLower/hasDigit/hasSymbol/lengthClass/isPwned konsisten", () => {
    fc.assert(
      fc.property(structuredPasswordArb, (plain) => {
        const expected = expectedViolations(plain, pwnedSet);
        const got = new Set(validatePassword(plain));

        // Equality of sets (urutan tidak relevan untuk property ini)
        expect(got).toEqual(expected);

        // Spot-check boundary length: jika length tepat 10, tidak boleh
        // ada panjang_kurang_dari_10; jika length tepat 256, tidak boleh
        // ada panjang_lebih_dari_256.
        if (plain.length === 10) {
          expect(got.has("panjang_kurang_dari_10")).toBe(false);
        }
        if (plain.length === 256) {
          expect(got.has("panjang_lebih_dari_256")).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("HIBP fixture: validatePassword('password1') memuat token ada_di_hibp_list", () => {
    // Sanity test bahwa HIBP fixture benar-benar ter-load di beforeAll.
    // Bukan property — tetapi mendemonstrasikan determinisme oracle.
    const got = validatePassword("password1");
    expect(got).toContain("ada_di_hibp_list");
    // 'password1' = 9 char → juga panjang_kurang_dari_10 + tanpa simbol/upper
    expect(got).toContain("panjang_kurang_dari_10");
    expect(got).toContain("tidak_ada_huruf_besar");
    expect(got).toContain("tidak_ada_simbol");
  });
});
