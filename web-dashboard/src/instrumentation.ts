/**
 * Next.js instrumentation hook.
 *
 * Dipanggil oleh Next.js sekali saat server boot. Logic boot yang
 * butuh `node:fs`/`node:path` dipindah ke `instrumentation-node.ts`
 * dan hanya di-import dinamis pada Node.js runtime, agar Turbopack tidak
 * mencoba membundle modul Node untuk Edge Runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootNode } = await import("./instrumentation-node");
  await bootNode();
}
