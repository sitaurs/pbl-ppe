/**
 * Property 12: Audit log append-only
 *
 * Validates: Requirements 13.1, 13.3
 *
 * Statement (design.md §Correctness Properties — Property 12):
 *   For any berkas `src/app/api/**\/route.ts`, NO exported HTTP method handler
 *   SHALL contain calls to `prisma.auditLog.update`, `prisma.auditLog.delete`,
 *   `prisma.auditLog.deleteMany`, or equivalent raw SQL targeting `AuditLog`.
 *
 * Implementation:
 *   - Walk `src/app/api/**\/route.ts` via fs.
 *   - Regex search for forbidden patterns.
 *   - Whitelist: scripts/purge-audit-log.ts (CLI, not an API route, allowed
 *     via the manual-purge path Req 13.6).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const API_DIR = resolve(process.cwd(), "src/app/api");

function walkRouteFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkRouteFiles(full));
    } else if (st.isFile() && /route\.(ts|tsx|js|jsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const FORBIDDEN_PATTERNS = [
  /prisma\.auditLog\.update\b/,
  /prisma\.auditLog\.updateMany\b/,
  /prisma\.auditLog\.delete\b/,
  /prisma\.auditLog\.deleteMany\b/,
  /prisma\.auditLog\.upsert\b/,
  // Raw SQL targeting AuditLog table — case-insensitive table name match
  /\$execute(Raw|RawUnsafe)?\s*[\(`].*?(UPDATE|DELETE)\s+["`]?AuditLog["`]?/i,
  /\$queryRaw(Unsafe)?\s*[\(`].*?(UPDATE|DELETE)\s+["`]?AuditLog["`]?/i,
];

describe("Property 12: Audit log append-only (Requirements 13.1, 13.3)", () => {
  it("no API route handler calls prisma.auditLog.update/delete/upsert or raw UPDATE/DELETE on AuditLog", () => {
    const files = walkRouteFiles(API_DIR);
    expect(files.length).toBeGreaterThan(0); // sanity: API dir not empty
    const offences: { file: string; pattern: string; lineHint: string }[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const re of FORBIDDEN_PATTERNS) {
        const m = content.match(re);
        if (m) {
          // Record relative path + matched substring
          offences.push({
            file: file.slice(API_DIR.length).replace(/\\/g, "/"),
            pattern: re.source,
            lineHint: m[0],
          });
        }
      }
    }
    expect(offences).toEqual([]);
  });
});
