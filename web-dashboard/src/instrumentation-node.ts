/**
 * instrumentation-node.ts
 *
 * Logic boot khusus Node.js runtime. Dipisah dari `instrumentation.ts`
 * supaya Turbopack/Webpack TIDAK menganalisis `node:fs`/`node:path` untuk
 * Edge Runtime (yang menyebabkan error "module not supported in Edge Runtime").
 *
 * File ini HANYA di-import secara dinamis dari instrumentation.ts ketika
 * NEXT_RUNTIME === "nodejs".
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { setMigrationPending } from "./lib/migration-state";
import { prisma } from "./lib/prisma";

export async function bootNode(): Promise<void> {
  const cwd = process.cwd();
  const dbJsonPath = resolve(cwd, "data/db.json");
  const markerPath = resolve(cwd, "data/.migrated");

  // 1. Migration-pending banner (Req 2.7)
  const migrationPending = existsSync(dbJsonPath) && !existsSync(markerPath);
  setMigrationPending(migrationPending);
  if (migrationPending) {
    console.warn(
      "[instrumentation] data/db.json detected without data/.migrated marker. " +
        "Run `npm run migrate:json-to-db` to migrate legacy JSON state to SQLite.",
    );
  }

  // 2. HIBP list eager load (Req 9.3)
  try {
    const { loadHibpList, hibpListSize } = await import("./lib/auth/hibp-list");
    loadHibpList();
    console.log(`[instrumentation] HIBP list loaded: ${hibpListSize()} entries`);
  } catch (err) {
    console.warn("[instrumentation] Failed to load HIBP list:", err);
  }

  // 3. Auto-purge gas telemetry > 7 hari (Req 8.5)
  // Interval mulai SETELAH 24 jam pertama (hari pertama: skip).
  // Setiap hari berikutnya, hapus record dengan timestamp < now - 7d.
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const result = await prisma.gasTelemetry.deleteMany({
        where: { timestamp: { lt: cutoff } },
      });
      if (result.count > 0) {
        console.log(
          `[instrumentation] Auto-purge: deleted ${result.count} gas telemetry records older than 7 days.`,
        );
      }
    } catch (err) {
      console.warn("[instrumentation] Auto-purge gas telemetry failed:", err);
    }
  }, 24 * 60 * 60 * 1000); // sekali per hari
}
