/**
 * DELETE /api/violations/{id} — hapus pelanggaran (permission: violation:delete)
 *
 * Sector-scoped untuk Supervisor/PIC: jika violation berada di sektor di luar
 * Sector_Assignment, kembalikan 404 (mencegah enumerasi, Req 8.3).
 * Audit `violation:delete`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "@/lib/rbac/context";
import { assertSectorAccess } from "@/lib/rbac/sector-scope";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  const { id } = await params;

  const violation = await prisma.violation.findUnique({ where: { id } });
  if (!violation) {
    return NextResponse.json({ error: "violation_not_found" }, { status: 404 });
  }

  // Sector isolation: Supervisor/PIC tidak boleh hapus violation di luar sektornya.
  if (!assertSectorAccess(violation.sektorId, ctx)) {
    return NextResponse.json({ error: "violation_not_found" }, { status: 404 });
  }

  await prisma.violation.delete({ where: { id } });

  await appendAuditLog({
    userId: ctx.user?.id ?? "system:auth",
    action: "violation:delete",
    resourceType: "violation",
    resourceId: id,
    ipAddress: ctx.clientIp,
    userAgent: req.headers.get("user-agent"),
    metadata: { nodeId: violation.nodeId, sektorId: violation.sektorId },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
