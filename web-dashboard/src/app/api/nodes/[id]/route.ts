/**
 * GET    /api/nodes/:id  (sector-scoped: 404 jika luar scope, Req 8.3)
 * PUT    /api/nodes/:id  (sector-scoped, audit node:update)
 * DELETE /api/nodes/:id  (sector-scoped, audit node:delete)
 */
import { NextResponse, type NextRequest } from "next/server";
import { migrateNode } from "@/lib/node-migration";
import { syncFlatFields } from "@/lib/sync-flat-fields";
import { assertSectorAccess } from "@/lib/rbac/sector-scope";
import { getRequestContext } from "@/lib/rbac/context";
import { appendAuditLog } from "@/lib/audit/audit-log";
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "node_not_found" }, { status: 404 });
  }
  const row = await prisma.node.findUnique({ where: { id: numericId } });
  if (!row) return NextResponse.json({ error: "node_not_found" }, { status: 404 });
  // Sector-scope: 404 (bukan 403) untuk mencegah enumerasi
  if (!assertSectorAccess(row.sektorId, ctx)) {
    return NextResponse.json({ error: "node_not_found" }, { status: 404 });
  }
  return NextResponse.json(rowToNode(row as DbNodeRow));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "node_not_found" }, { status: 404 });
  }
  const existing = await prisma.node.findUnique({ where: { id: numericId } });
  if (!existing) return NextResponse.json({ error: "node_not_found" }, { status: 404 });
  if (!assertSectorAccess(existing.sektorId, ctx)) {
    return NextResponse.json({ error: "node_not_found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const incoming = {
    ...rowToNode(existing as DbNodeRow),
    ...body,
  } as Record<string, unknown>;
  const synced = syncFlatFields(incoming);
  // Pastikan tipe field flat tetap konsisten (Python compat)
  const flat = {
    sektorId: (synced.sektorId as string) || existing.sektorId,
    sektorName: (synced.sektorName as string) ?? existing.sektorName,
    picName: (synced.picName as string) ?? existing.picName,
    picPhone: (synced.picPhone as string) ?? existing.picPhone,
    cameraSource: (synced.cameraSource as string) ?? existing.cameraSource,
    enabled: (synced.enabled as boolean) ?? existing.enabled,
    camera: synced.camera ? JSON.stringify(synced.camera) : null,
    esp32: synced.esp32 ? JSON.stringify(synced.esp32) : null,
    detection: synced.detection ? JSON.stringify(synced.detection) : null,
  };
  await prisma.sector.upsert({
    where: { id: flat.sektorId },
    create: { id: flat.sektorId, name: flat.sektorName || flat.sektorId },
    update: {},
  });
  const updated = await prisma.node.update({ where: { id: numericId }, data: flat });

  if (ctx.user) {
    await appendAuditLog({
      userId: ctx.user.id,
      action: "node:update",
      resourceType: "node",
      resourceId: String(numericId),
      ipAddress: ctx.clientIp,
      userAgent: req.headers.get("user-agent"),
    });
  }
  return NextResponse.json(rowToNode(updated as DbNodeRow));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "node_not_found" }, { status: 404 });
  }
  const existing = await prisma.node.findUnique({ where: { id: numericId } });
  if (!existing) return NextResponse.json({ error: "node_not_found" }, { status: 404 });
  if (!assertSectorAccess(existing.sektorId, ctx)) {
    return NextResponse.json({ error: "node_not_found" }, { status: 404 });
  }
  await prisma.node.delete({ where: { id: numericId } });
  if (ctx.user) {
    await appendAuditLog({
      userId: ctx.user.id,
      action: "node:delete",
      resourceType: "node",
      resourceId: String(numericId),
      ipAddress: ctx.clientIp,
      userAgent: req.headers.get("user-agent"),
    });
  }
  return NextResponse.json({ success: true });
}
