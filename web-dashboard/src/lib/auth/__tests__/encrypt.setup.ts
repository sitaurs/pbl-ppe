/**
 * Setup file untuk encrypt.property.test.ts.
 *
 * `encrypt.ts` membaca `APD_ENCRYPTION_KEY` saat module di-load (IIFE),
 * sehingga env var WAJIB di-set sebelum module diimport. Vitest setupFiles
 * dijalankan sebelum module test di-resolve, jadi ini tempat aman.
 */
process.env.APD_ENCRYPTION_KEY ??= "0123456789abcdef0123456789abcdef"; // 32 byte
