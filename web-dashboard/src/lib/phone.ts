// Bug 2 (PIC) — pure helper untuk normalisasi & validasi nomor WhatsApp PIC.
//
// Validates: Requirements 2.3 (Expected Behavior — auto-normalization +62 / 0 / 62 / digit langsung).
//
// Property (Property 4 di design.md):
//   FOR ALL raw WHERE raw is digits-only-after-strip AND len(digits) >= 9:
//     normalizePhone(raw) matches /^62[0-9]{8,14}$/
//     normalizePhone(normalizePhone(raw)) === normalizePhone(raw)   // idempoten
//
// Pure function — no side effects, no I/O, no module-level mutation.

/**
 * Regex format akhir nomor WhatsApp PIC (62 + 8–14 digit).
 * Diekspos sebagai konstanta agar konsumen lain bisa share regex yang sama.
 */
export const PHONE_VALID_RE = /^62[0-9]{8,14}$/;

/**
 * Normalisasi nomor telepon Indonesia ke format `62XXXXXXXXX`.
 *
 * Aturan (sesuai bugfix.md klausa 2.3):
 *   - Strip semua karakter non-digit (termasuk spasi, "-", ".", tab, "+").
 *   - Setelah strip, jika digits diawali "62" → tetap (juga menutup kasus "+62…").
 *   - Prefix "0" → diganti "62".
 *   - Selain itu (langsung digit 8/9/...) → diberi prefix "62".
 *   - Return "" jika input kosong / hanya non-digit.
 *
 * Idempoten: `normalizePhone(normalizePhone(x)) === normalizePhone(x)` karena
 * setiap output yang non-empty selalu diawali "62" sehingga normalisasi
 * berikutnya jatuh ke cabang "tetap".
 *
 * Helper murni: tidak mengakses I/O, tidak mengakses state global, tidak
 * memutasi argumen.
 *
 * @param input string mentah dari input user (mis. "+62 813-5895-9349").
 * @returns string ternormalisasi atau "" untuk input kosong / non-digit.
 */
export function normalizePhone(input: string): string {
  if (typeof input !== 'string' || input.length === 0) {
    return '';
  }

  // Strip semua karakter non-digit. "+62" → "62", "0813-1234" → "08131234".
  const digits = input.replace(/\D/g, '');
  if (digits.length === 0) {
    return '';
  }

  // Prefix "62" sudah benar (juga menutup kasus input awal "+62…").
  if (digits.startsWith('62')) {
    return digits;
  }

  // Prefix "0" lokal Indonesia → ganti dengan "62".
  if (digits.startsWith('0')) {
    return '62' + digits.slice(1);
  }

  // Langsung digit (mis. "81358959349") → tambah prefix "62".
  return '62' + digits;
}

/**
 * Validasi: hasil normalisasi match `/^62[0-9]{8,14}$/`.
 *
 * Helper murni: hanya memanggil `normalizePhone` lalu menguji regex.
 *
 * @param input string mentah.
 * @returns `true` jika hasil normalisasi memenuhi format `62` + 8–14 digit.
 */
export function isValidPhone(input: string): boolean {
  return PHONE_VALID_RE.test(normalizePhone(input));
}
