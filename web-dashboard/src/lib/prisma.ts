/**
 * Singleton Prisma Client untuk SafeGuard APD Web Dashboard.
 *
 * Tujuan:
 *  - Memastikan hanya satu instance `PrismaClient` yang aktif di seluruh proses
 *    aplikasi. Tanpa pola singleton ini, Next.js dev server (hot reload) akan
 *    membuat koneksi Prisma baru setiap kali modul di-recompile, sehingga
 *    memunculkan warning "Already 10 Prisma Clients are actively running" dan
 *    pada akhirnya menghabiskan koneksi/file handle SQLite.
 *  - Menerapkan PRAGMA SQLite (`journal_mode=WAL`, `busy_timeout=5000`,
 *    `synchronous=NORMAL`) sekali saat boot untuk memenuhi Requirement 1.1
 *    (50 operasi baca-tulis bersamaan tanpa "database is locked" di bawah
 *    5000 ms).
 *
 * Prisma 7.x sekarang memakai engine type "client" (bukan rust binary), yang
 * mengharuskan kita menyertakan driver adapter. Untuk SQLite, kita pakai
 * `@prisma/adapter-better-sqlite3`. URL database `file:./data/safeguard.db`
 * di-resolve relatif terhadap project root.
 *
 * Referensi: lihat `design.md §SQLite Configuration` pada spec
 * `.kiro/specs/auth-rbac-system/design.md` untuk detail keputusan.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { resolve } from "node:path";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function buildClient(): PrismaClient {
  // Resolve URL relative to project root agar konsisten antara dev (next dev),
  // production (next build), dan CLI scripts (tsx scripts/...).
  const dbPath = resolve(process.cwd(), "data/safeguard.db");
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? buildClient();

if (!globalForPrisma.prisma) {
  // One-time pragmas; WAL mode + 5s busy timeout meets Req 1.1 (50 concurrent r/w under 5s)
  prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL").catch(() => {});
  prisma.$executeRawUnsafe("PRAGMA busy_timeout=5000").catch(() => {});
  prisma.$executeRawUnsafe("PRAGMA synchronous=NORMAL").catch(() => {});
  globalForPrisma.prisma = prisma;
}
