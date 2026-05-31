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
}
