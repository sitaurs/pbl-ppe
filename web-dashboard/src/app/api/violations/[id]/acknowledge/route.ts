/**
 * POST /api/violations/{id}/acknowledge — tandai pelanggaran sudah diakui
 * (permission: violation:acknowledge).
 *
 * Sector-scoped untuk Supervisor/PIC: violation di luar sektor → 404 (Req 8.3).
 * Audit `violation:acknowledge`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "@/lib/rbac/context";
import { assertSectorAccess } from "@/lib/rbac/sector-scope";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  const { id } = await params;

  const violation = await prisma.violation.findUnique({ where: { id } });
  if (!violation) {
    return NextResponse.json({ error: "violation_not_found" }, { status: 404 });
  }
  if (!assertSectorAccess(violation.sektorId, ctx)) {
    return NextResponse.json({ error: "violation_not_found" }, { status: 404 });
  }

  const updated = await prisma.violation.update({
    where: { id },
    data: {
      acknowledged: true,
      acknowledgedById: ctx.user?.id ?? null,
      acknowledgedAt: new Date(),
    },
  });

  await appendAuditLog({
    userId: ctx.user?.id ?? "system:auth",
    action: "violation:acknowledge",
    resourceType: "violation",
    resourceId: id,
    ipAddress: ctx.clientIp,
    userAgent: req.headers.get("user-agent"),
    metadata: { nodeId: violation.nodeId, sektorId: violation.sektorId },
  });

  return NextResponse.json(
    {
      id: updated.id,
      acknowledged: updated.acknowledged,
      acknowledgedById: updated.acknowledgedById,
      acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
    },
    { status: 200 },
  );
}
