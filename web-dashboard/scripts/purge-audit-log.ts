/**
 * scripts/purge-audit-log.ts
 *
 * Manual purge AuditLog rows older than N days (default 365). Sesuai Req 13.6.
 * Tulis entry baru `audit-log:purge` dengan metadata count.
 *
 * Usage:
 *   npm run purge:audit-log
 *   npm run purge:audit-log -- --older-than-days 365
 */
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { resolve, join } from "node:path";

const DB_FILE_PATH = join(resolve(process.cwd(), "data"), "safeguard.db");
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: `file:${DB_FILE_PATH}` }),
});

function argInt(name: string, defaultValue: number): number {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(name);
  if (idx === -1 || idx + 1 >= argv.length) return defaultValue;
  const n = parseInt(argv[idx + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
}

async function main(): Promise<void> {
  const days = argInt("--older-than-days", 365);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const deleted = await prisma.auditLog.deleteMany({
    where: { timestamp: { lt: cutoff } },
  });
  await prisma.auditLog.create({
    data: {
      userId: "system:cli",
      action: "audit-log:purge",
      resourceType: "audit-log",
      metadata: JSON.stringify({ olderThanDays: days, deletedCount: deleted.count }),
    },
  });
  console.log(
    `[purge-audit-log] Deleted ${deleted.count} entries older than ${days} days`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("[purge-audit-log] FAILED:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
