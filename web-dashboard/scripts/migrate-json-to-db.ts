/**
 * scripts/migrate-json-to-db.ts
 *
 * One-shot, idempotent migration script that reads the legacy file-based store
 * (`data/db.json`, `data/violations.json`, `data/settings.json`) and upserts
 * the rows into the Prisma-managed SQLite database (`data/safeguard.db`).
 *
 * Sequence (mirrors `design.md §Migration Script Flow`):
 *   1. Load source files (tolerant: missing files treated as empty).
 *   2. Validate JSON shapes via zod.
 *   3. Backup all three files into `data/backup/{YYYYMMDD-HHmmss}/` BEFORE
 *      touching the DB. Skipped on rerun (when `data/.migrated` already exists)
 *      or when `--rerun` flag is passed.
 *   4. Discover unique sectors from nodes + violations.
 *   5. Wrap all upserts in a single `prisma.$transaction` (sectors → nodes →
 *      violations → settings). Nodes go through `migrateNode()` from the
 *      node-detail-tree-view spec so that nested `camera/esp32/detection`
 *      defaults are populated. Parity check runs INSIDE the transaction so
 *      a mismatch rolls back the entire write set.
 *   6. Write `data/.migrated` marker file
 *      `{ completedAt, counts:{nodes,violations,settings}, backupDir }`.
 *
 * Usage:
 *   npm run migrate:json-to-db
 *   npm run migrate:json-to-db -- --rerun     # force backup-skip
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  readFileSync,
  mkdirSync,
  existsSync,
  copyFileSync,
} from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { migrateNode } from "../src/lib/node-migration";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const DATA_DIR = resolve(ROOT, "data");
const DB_JSON_PATH = join(DATA_DIR, "db.json");
const VIOLATIONS_PATH = join(DATA_DIR, "violations.json");
const SETTINGS_PATH = join(DATA_DIR, "settings.json");
const MARKER_PATH = join(DATA_DIR, ".migrated");
const DB_FILE_PATH = join(DATA_DIR, "safeguard.db");

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: `file:${DB_FILE_PATH}` }),
});

/** Returns a UTC timestamp suitable for backup folder names: YYYYMMDD-HHmmss. */
function timestampUtc(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}` +
    `${pad(d.getUTCMonth() + 1)}` +
    `${pad(d.getUTCDate())}` +
    `-` +
    `${pad(d.getUTCHours())}` +
    `${pad(d.getUTCMinutes())}` +
    `${pad(d.getUTCSeconds())}`
  );
}

function sha1Hex(input: string): string {
  return createHash("sha1").update(input, "utf8").digest("hex");
}

function readJson<T = unknown>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  const raw = readFileSync(path, "utf8");
  if (raw.trim() === "") return fallback;
  return JSON.parse(raw) as T;
}

// ---------------------------------------------------------------------------
// Zod shapes (lenient on optional fields; legacy JSON has drift)
// ---------------------------------------------------------------------------

const NodeSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    sektorId: z.string(),
    sektorName: z.string().optional().default(""),
    picName: z.string().optional().default(""),
    picPhone: z.string().optional().default(""),
    cameraSource: z.string().optional().default(""),
    enabled: z.boolean().optional().default(true),
  })
  .passthrough(); // allow extended fields (camera/esp32/detection) to flow through

const DbJsonSchema = z.union([
  z.array(NodeSchema),
  z.object({ nodes: z.array(NodeSchema) }),
]);

const ViolationSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    timestamp: z.string(),
    nodeId: z.union([z.number(), z.string()]).optional(),
    sektorId: z.string().optional(),
    ppeMissing: z.array(z.string()).optional(),
    violations: z.array(z.string()).optional(), // legacy field name
    imageRef: z.string().optional(),
    acknowledged: z.boolean().optional(),
    cameraSource: z.string().optional(),
  })
  .passthrough();

const ViolationsJsonSchema = z.array(ViolationSchema);

const SettingsJsonSchema = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------------------
// Main migration
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const flags = process.argv.slice(2);
  const forceRerun = flags.includes("--rerun");

  console.log("[migrate] Starting JSON→DB migration");
  console.log(`[migrate] cwd=${ROOT}`);
  console.log(`[migrate] data dir=${DATA_DIR}`);

  // -- 1. Read sources ------------------------------------------------------
  const dbJsonRaw = readJson<unknown>(DB_JSON_PATH, []);
  const violationsRaw = readJson<unknown>(VIOLATIONS_PATH, []);
  const settingsRaw = readJson<unknown>(SETTINGS_PATH, {});

  // -- 2. Validate ----------------------------------------------------------
  const dbParsed = DbJsonSchema.parse(dbJsonRaw);
  const rawNodes = Array.isArray(dbParsed) ? dbParsed : dbParsed.nodes;
  const rawViolations = ViolationsJsonSchema.parse(violationsRaw);
  const rawSettings = SettingsJsonSchema.parse(settingsRaw);

  console.log(
    `[migrate] Parsed sources: ${rawNodes.length} nodes, ` +
      `${rawViolations.length} violations, ` +
      `${Object.keys(rawSettings).length} settings`,
  );

  // -- 3. Backup (skip on rerun) -------------------------------------------
  const markerExists = existsSync(MARKER_PATH);
  const skipBackup = markerExists || forceRerun;
  let backupDir: string | null = null;

  if (!skipBackup) {
    backupDir = join(DATA_DIR, "backup", timestampUtc());
    mkdirSync(backupDir, { recursive: true });
    if (existsSync(DB_JSON_PATH)) {
      copyFileSync(DB_JSON_PATH, join(backupDir, "db.json"));
    }
    if (existsSync(VIOLATIONS_PATH)) {
      copyFileSync(VIOLATIONS_PATH, join(backupDir, "violations.json"));
    }
    if (existsSync(SETTINGS_PATH)) {
      copyFileSync(SETTINGS_PATH, join(backupDir, "settings.json"));
    }
    console.log(`[migrate] Backup created at ${backupDir}`);
  } else {
    console.log(
      `[migrate] Skipping backup ` +
        `(${markerExists ? ".migrated marker present" : "--rerun flag"})`,
    );
  }

  // -- 4. Discover sectors --------------------------------------------------
  const sectorMap = new Map<string, string>(); // id -> name
  for (const n of rawNodes) {
    if (n.sektorId) {
      const name = n.sektorName && n.sektorName.length > 0 ? n.sektorName : n.sektorId;
      // Prefer a non-empty name if we already saw the sector with a real name.
      const existing = sectorMap.get(n.sektorId);
      if (!existing || existing === n.sektorId) {
        sectorMap.set(n.sektorId, name);
      }
    }
  }
  for (const v of rawViolations) {
    if (v.sektorId) {
      const sektorName = (v as { sektorName?: string }).sektorName;
      const name = sektorName && sektorName.length > 0 ? sektorName : v.sektorId;
      const existing = sectorMap.get(v.sektorId);
      if (!existing) {
        sectorMap.set(v.sektorId, name);
      } else if (existing === v.sektorId && name !== v.sektorId) {
        sectorMap.set(v.sektorId, name);
      }
    }
  }
  console.log(`[migrate] Discovered ${sectorMap.size} unique sectors`);

  // -- 5. Single transaction: sectors → nodes → violations → settings ------
  let skippedViolations = 0;

  await prisma.$transaction(async (tx) => {
    // 5a. Sectors
    for (const [id, name] of sectorMap) {
      await tx.sector.upsert({
        where: { id },
        create: { id, name },
        update: { name },
      });
    }
    console.log(`[migrate] Upserted ${sectorMap.size} sectors`);

    // 5b. Nodes (run each through migrateNode for nested defaults)
    for (const raw of rawNodes) {
      // migrateNode expects a "node-like" object; we normalize id to number.
      const numericId = Math.trunc(Number(raw.id));
      if (!Number.isFinite(numericId)) {
        throw new Error(`Invalid node id: ${String(raw.id)}`);
      }
      const migrated = migrateNode({ ...raw, id: numericId });

      const flat = {
        sektorId: migrated.sektorId,
        sektorName: migrated.sektorName ?? "",
        picName: migrated.picName ?? "",
        picPhone: migrated.picPhone ?? "",
        cameraSource: migrated.cameraSource ?? "",
        enabled: migrated.enabled ?? true,
        camera: migrated.camera ? JSON.stringify(migrated.camera) : null,
        esp32: migrated.esp32 ? JSON.stringify(migrated.esp32) : null,
        detection: migrated.detection ? JSON.stringify(migrated.detection) : null,
      };

      await tx.node.upsert({
        where: { id: numericId },
        create: { id: numericId, ...flat },
        update: flat,
      });
    }
    console.log(`[migrate] Upserted ${rawNodes.length} nodes`);

    // 5c. Violations (derive missing fields from nodes/legacy schema)
    for (const v of rawViolations) {
      // Resolve nodeId: prefer explicit field; otherwise match by sektorId +
      // cameraSource against the discovered nodes.
      let nodeId: number | null = null;
      if (v.nodeId !== undefined) {
        const n = Math.trunc(Number(v.nodeId));
        if (Number.isFinite(n)) nodeId = n;
      }
      if (nodeId === null) {
        const matched = rawNodes.find(
          (n) =>
            n.sektorId === v.sektorId &&
            (n.cameraSource ?? "") === (v.cameraSource ?? ""),
        );
        if (matched) nodeId = Math.trunc(Number(matched.id));
      }
      if (nodeId === null && v.sektorId) {
        // last-resort: any node in the same sector
        const matched = rawNodes.find((n) => n.sektorId === v.sektorId);
        if (matched) nodeId = Math.trunc(Number(matched.id));
      }

      const sektorId =
        v.sektorId ??
        (nodeId !== null
          ? rawNodes.find((n) => Math.trunc(Number(n.id)) === nodeId)?.sektorId
          : undefined);

      if (nodeId === null || !sektorId) {
        skippedViolations += 1;
        console.warn(
          `[migrate] Skipping violation id=${String(v.id ?? "<auto>")}: ` +
            `cannot resolve nodeId/sektorId`,
        );
        continue;
      }

      const imageRef = v.imageRef ?? "";
      const idStr =
        v.id !== undefined
          ? String(v.id)
          : sha1Hex(`${v.timestamp}|${nodeId}|${imageRef}`).slice(0, 32);

      const ppeMissingArr = v.ppeMissing ?? v.violations ?? [];
      const timestamp = new Date(v.timestamp);
      if (Number.isNaN(timestamp.getTime())) {
        skippedViolations += 1;
        console.warn(
          `[migrate] Skipping violation id=${idStr}: invalid timestamp ${v.timestamp}`,
        );
        continue;
      }

      await tx.violation.upsert({
        where: { id: idStr },
        create: {
          id: idStr,
          timestamp,
          nodeId,
          sektorId,
          ppeMissing: JSON.stringify(ppeMissingArr),
          imageRef,
          acknowledged: v.acknowledged ?? false,
        },
        update: {
          timestamp,
          nodeId,
          sektorId,
          ppeMissing: JSON.stringify(ppeMissingArr),
          imageRef,
          acknowledged: v.acknowledged ?? false,
        },
      });
    }
    console.log(
      `[migrate] Upserted ${rawViolations.length - skippedViolations} violations` +
        (skippedViolations > 0 ? ` (${skippedViolations} skipped)` : ""),
    );

    // 5d. Settings
    for (const [key, value] of Object.entries(rawSettings)) {
      const serialized = JSON.stringify(value);
      await tx.setting.upsert({
        where: { key },
        create: { key, value: serialized },
        update: { value: serialized },
      });
    }
    console.log(`[migrate] Upserted ${Object.keys(rawSettings).length} settings`);

    // 5e. Parity check INSIDE the transaction so a mismatch rolls back the
    //     entire write set (Req 2.6 + 2.7). Mirrors design.md §Verification.
    const expectedViolations = rawViolations.length - skippedViolations;
    const counts = {
      nodes: { json: rawNodes.length, db: await tx.node.count() },
      violations: { json: expectedViolations, db: await tx.violation.count() },
      settings: {
        json: Object.keys(rawSettings).length,
        db: await tx.setting.count(),
      },
    } as const;
    for (const [key, c] of Object.entries(counts)) {
      if (c.json !== c.db) {
        throw new Error(
          `Parity check failed: ${key} JSON=${c.json} DB=${c.db}`,
        );
      }
    }
    console.log(
      `[migrate] Parity check OK: ` +
        `nodes=${counts.nodes.db}, ` +
        `violations=${counts.violations.db}, ` +
        `settings=${counts.settings.db}`,
    );
  });

  // -- 6. Marker file (data/.migrated) -------------------------------------
  // Shape per design.md §Verification:
  //   { completedAt: ISO-8601, counts: {nodes, violations, settings}, backupDir }
  const markerCounts = {
    nodes: await prisma.node.count(),
    violations: await prisma.violation.count(),
    settings: await prisma.setting.count(),
  };
  const marker = {
    completedAt: new Date().toISOString(),
    counts: markerCounts,
    backupDir,
  };
  await writeFile(MARKER_PATH, JSON.stringify(marker, null, 2) + "\n", "utf8");
  console.log(`[migrate] ✓ Migration complete. Marker → ${MARKER_PATH}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err: unknown) => {
    console.error("[migrate] FAILED:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
