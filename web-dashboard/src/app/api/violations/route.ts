/**
 * GET  /api/violations — list (sector-scoped untuk Supervisor/PIC)
 * POST /api/violations — create (insert dari Python backend via service token)
 *
 * Migrasi dari file `data/violations.json` ke Prisma `Violation` table.
 * Untuk service-token (`POST` dari `ServiceAPDBackend.py`), audit log
 * dicatat dengan `userId="system:python-backend"`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { applySectorScope } from "@/lib/rbac/sector-scope";
import { getRequestContext } from "@/lib/rbac/context";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/prisma";

const ViolationCreateBody = z.object({
  timestamp: z.string().optional(),
  nodeId: z.union([z.number(), z.string()]),
  sektorId: z.string().optional(),
  ppeMissing: z.array(z.string()).optional(),
  imageRef: z.string().optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  const where = applySectorScope({}, ctx);
  const violations = await prisma.violation.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: 500,
  });
  return NextResponse.json(
    violations.map((v) => ({
      id: v.id,
      timestamp: v.timestamp.toISOString(),
      nodeId: v.nodeId,
      sektorId: v.sektorId,
      ppeMissing: JSON.parse(v.ppeMissing) as string[],
      imageRef: v.imageRef,
      acknowledged: v.acknowledged,
      acknowledgedById: v.acknowledgedById,
      acknowledgedAt: v.acknowledgedAt?.toISOString() ?? null,
    })),
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = ViolationCreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const data = parsed.data;
  const nodeId = Math.trunc(Number(data.nodeId));
  if (!Number.isFinite(nodeId)) {
    return NextResponse.json({ error: "invalid_node_id" }, { status: 400 });
  }
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) {
    return NextResponse.json({ error: "node_not_found" }, { status: 404 });
  }
  const sektorId = data.sektorId ?? node.sektorId;
  const violation = await prisma.violation.create({
    data: {
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      nodeId,
      sektorId,
      ppeMissing: JSON.stringify(data.ppeMissing ?? []),
      imageRef: data.imageRef ?? "",
    },
  });

  // Audit: untuk service-token caller, userId = system:python-backend
  const actor = ctx.serviceToken
    ? "system:python-backend"
    : ctx.user?.id ?? "system:auth";
  await appendAuditLog({
    userId: actor,
    action: "violation:acknowledge", // mark as new violation event
    resourceType: "violation",
    resourceId: violation.id,
    ipAddress: ctx.clientIp,
    userAgent: req.headers.get("user-agent"),
    metadata: { nodeId, sektorId, source: ctx.serviceToken ? "python-backend" : "user" },
  });

  return NextResponse.json({
    id: violation.id,
    timestamp: violation.timestamp.toISOString(),
    nodeId,
    sektorId,
    ppeMissing: data.ppeMissing ?? [],
    imageRef: violation.imageRef,
  });
}
