/**
 * Placeholder script untuk memperbarui asset `src/lib/data/pwned-top-10k.txt`
 * dari sumber kanonik HIBP top-10k.
 *
 * Sumber yang direkomendasikan:
 *   - https://api.pwnedpasswords.com/range/{prefix}  (range API, k-anonymity)
 *   - https://github.com/SeanWright/HIBP-list-top-10000  (curated dump)
 *
 * Saat ini implementasi belum tersedia. Asset yang di-bundle berisi sample
 * minimal SHA-1 dari password umum (rockyou + leaked datasets) sebagai
 * baseline; ganti dengan dump 10.000 baris penuh untuk produksi.
 *
 * TODO: implementasi fetch + validasi format SHA-1 (40 char hex per baris)
 * + atomic write ke `src/lib/data/pwned-top-10k.txt`.
 */

console.warn(
  "[update-hibp-list] TODO: implement update from https://api.pwnedpasswords.com or https://github.com/SeanWright/HIBP-list-top-10000",
);
console.warn(
  "[update-hibp-list] For now, list of common leaked passwords is bundled at src/lib/data/pwned-top-10k.txt",
);
