/**
 * POST /api/nodes/bulk  (permission: node:update)
 *
 * Bulk action: delete | enable | disable.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { getRequestContext } from "@/lib/rbac/context";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  action: z.enum(["delete", "enable", "disable"]),
  ids: z.array(z.union([z.number(), z.string()])).min(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request. Requires action and ids[]" },
      { status: 400 },
    );
  }
  const { action, ids } = parsed.data;
  const numericIds = ids
    .map((v) => Math.trunc(Number(v)))
    .filter((n) => Number.isFinite(n));

  let count = 0;
  if (action === "delete") {
    const result = await prisma.node.deleteMany({
      where: { id: { in: numericIds } },
    });
    count = result.count;
  } else {
    const enabled = action === "enable";
    const result = await prisma.node.updateMany({
      where: { id: { in: numericIds } },
      data: { enabled },
    });
    count = result.count;
  }

  if (ctx.user) {
    const auditAction = action === "delete" ? "node:delete" : "node:toggle";
    await appendAuditLog({
      userId: ctx.user.id,
      action: auditAction,
      resourceType: "node",
      ipAddress: ctx.clientIp,
      userAgent: req.headers.get("user-agent"),
      metadata: { action, ids: numericIds, affected: count },
    });
  }

  return NextResponse.json({ success: true, affected: count });
}
