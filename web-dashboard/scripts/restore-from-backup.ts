/**
 * scripts/restore-from-backup.ts
 *
 * CLI rollback: restore 3 file JSON dari `data/backup/{ts}/` ke `data/`,
 * hapus marker `.migrated`, hapus `safeguard.db*`. Sesuai design.md §Rollback Plan.
 *
 * Usage:
 *   npm run restore:backup -- --backup-dir data/backup/20260315-093210
 */
import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const DATA_DIR = resolve(ROOT, "data");

function arg(name: string, defaultValue: string): string {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(name);
  if (idx === -1 || idx + 1 >= argv.length) return defaultValue;
  return argv[idx + 1];
}

function main(): void {
  const backupDir = arg("--backup-dir", "");
  if (!backupDir) {
    console.error("Required: --backup-dir <path>");
    process.exit(1);
  }
  const fullBackupDir = resolve(ROOT, backupDir);
  if (!existsSync(fullBackupDir)) {
    console.error(`Backup directory not found: ${fullBackupDir}`);
    process.exit(1);
  }

  const files = ["db.json", "violations.json", "settings.json"];
  for (const f of files) {
    const src = join(fullBackupDir, f);
    if (!existsSync(src)) {
      console.error(`Missing backup file: ${src}`);
      process.exit(1);
    }
  }
  for (const f of files) {
    const src = join(fullBackupDir, f);
    const dest = join(DATA_DIR, f);
    copyFileSync(src, dest);
    console.log(`[restore] ${f} restored`);
  }

  // Hapus marker + DB
  const marker = join(DATA_DIR, ".migrated");
  if (existsSync(marker)) {
    unlinkSync(marker);
    console.log("[restore] .migrated marker removed");
  }
  for (const dbf of ["safeguard.db", "safeguard.db-wal", "safeguard.db-shm"]) {
    const p = join(DATA_DIR, dbf);
    if (existsSync(p)) {
      unlinkSync(p);
      console.log(`[restore] ${dbf} removed`);
    }
  }
  console.log("[restore] Restore complete. Restart Next.js to use legacy JSON store.");
}

try {
  main();
} catch (err) {
  console.error("[restore-from-backup] FAILED:", err);
  process.exit(1);
}
