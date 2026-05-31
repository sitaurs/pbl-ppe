/**
 * GET  /api/nodes — list nodes (sector-scoped jika role Supervisor/PIC)
 * POST /api/nodes — create node (permission node:create)
 *
 * Migrasi dari file-based store (`data/db.json`) ke SQLite via Prisma.
 * Mempertahankan kontrak lama: response tetap berbentuk flat array NodeData
 * dengan field flat (id, sektorId, sektorName, ...) dan nested (camera,
 * esp32, detection) — sehingga ServiceAPDBackend.py + spec node-detail-tree-view
 * tetap bekerja.
 */
import { NextResponse, type NextRequest } from "next/server";
import { applySectorScope } from "@/lib/rbac/sector-scope";
import { getRequestContext } from "@/lib/rbac/context";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { migrateNode } from "@/lib/node-migration";
import { prisma } from "@/lib/prisma";

interface DbNodeRow {
  id: number;
  sektorId: string;
  sektorName: string;
  picName: string;
  picPhone: string;
  cameraSource: string;
  enabled: boolean;
  camera: string | null;
  esp32: string | null;
  detection: string | null;
}

function parseJsonNullable<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function rowToNode(row: DbNodeRow): Record<string, unknown> {
  return migrateNode({
    id: row.id,
    sektorId: row.sektorId,
    sektorName: row.sektorName,
    picName: row.picName,
    picPhone: row.picPhone,
    cameraSource: row.cameraSource,
    enabled: row.enabled,
    camera: parseJsonNullable(row.camera),
    esp32: parseJsonNullable(row.esp32),
    detection: parseJsonNullable(row.detection),
  }) as unknown as Record<string, unknown>;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  const where = applySectorScope({}, ctx);
  const rows = await prisma.node.findMany({
    where,
    orderBy: { id: "asc" },
  });
  return NextResponse.json(rows.map((r) => rowToNode(r as DbNodeRow)));
}

interface CreateNodeBody {
  sektorId: string;
  sektorName?: string;
  picName?: string;
  picPhone?: string;
  cameraSource?: string;
  enabled?: boolean;
  camera?: unknown;
  esp32?: unknown;
  detection?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  let body: CreateNodeBody;
  try {
    body = (await req.json()) as CreateNodeBody;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!body.sektorId || typeof body.sektorId !== "string") {
    return NextResponse.json({ error: "sektorId_required" }, { status: 400 });
  }

  // Auto-create Sector jika belum ada (compat path; admin biasanya buat dulu)
  await prisma.sector.upsert({
    where: { id: body.sektorId },
    create: { id: body.sektorId, name: body.sektorName ?? body.sektorId },
    update: {},
  });

  const created = await prisma.node.create({
    data: {
      // Generate id since schema uses AUTOINCREMENT (Int @id) — Prisma 7 forbids
      // omitting required PK fields. Node IDs follow legacy pattern: timestamp-ish
      // millis as fallback.
      id: Date.now() + Math.floor(Math.random() * 1000),
      sektorId: body.sektorId,
      sektorName: body.sektorName ?? "",
      picName: body.picName ?? "",
      picPhone: body.picPhone ?? "",
      cameraSource: body.cameraSource ?? "0",
      enabled: body.enabled ?? true,
      camera: body.camera ? JSON.stringify(body.camera) : null,
      esp32: body.esp32 ? JSON.stringify(body.esp32) : null,
      detection: body.detection ? JSON.stringify(body.detection) : null,
    },
  });

  if (ctx.user) {
    await appendAuditLog({
      userId: ctx.user.id,
      action: "node:create",
      resourceType: "node",
      resourceId: String(created.id),
      ipAddress: ctx.clientIp,
      userAgent: req.headers.get("user-agent"),
      metadata: { sektorId: created.sektorId },
    });
  }

  return NextResponse.json(rowToNode(created as DbNodeRow), { status: 201 });
}
