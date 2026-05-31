/**
 * Migration state — accessor untuk flag global `__APD_MIGRATION_PENDING__`
 * yang di-set oleh `instrumentation.ts` saat boot Node.js runtime.
 *
 * Aman dipanggil dari edge runtime (middleware) atau server component;
 * fungsi ini tidak menyentuh `fs` atau `path`.
 *
 * Sesuai Req 2.7.
 */

declare global {
  // eslint-disable-next-line no-var
  var __APD_MIGRATION_PENDING__: boolean | undefined;
}

export function isMigrationPending(): boolean {
  return Boolean(globalThis.__APD_MIGRATION_PENDING__);
}

export function setMigrationPending(value: boolean): void {
  globalThis.__APD_MIGRATION_PENDING__ = value;
}
