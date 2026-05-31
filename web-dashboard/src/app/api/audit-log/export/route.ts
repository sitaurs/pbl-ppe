/**
 * GET /api/audit-log/export  (audit-log:read)
 *
 * Stream CSV (max 100,000 rows) untuk audit log; tambah audit entry
 * `audit-log:export`. Sesuai Req 13.5.
 */
import { type NextRequest } from "next/server";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { getRequestContext } from "@/lib/rbac/context";
import { prisma } from "@/lib/prisma";

const MAX_ROWS = 100_000;

function csvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest): Promise<Response> {
  const ctx = getRequestContext(req);
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const action = url.searchParams.get("action");
  const userId = url.searchParams.get("userId");
  const resourceType = url.searchParams.get("resourceType");

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (userId) where.userId = userId;
  if (resourceType) where.resourceType = resourceType;
  if (from || to) {
    const ts: { gte?: Date; lte?: Date } = {};
    if (from) ts.gte = new Date(from);
    if (to) ts.lte = new Date(to);
    where.timestamp = ts;
  }

  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: MAX_ROWS,
  });

  const header = [
    "id",
    "timestamp",
    "userId",
    "action",
    "resourceType",
    "resourceId",
    "ipAddress",
    "userAgent",
    "metadata",
  ];
  const rows = [
    header.join(","),
    ...entries.map((e) =>
      [
        csvField(e.id),
        csvField(e.timestamp.toISOString()),
        csvField(e.userId),
        csvField(e.action),
        csvField(e.resourceType),
        csvField(e.resourceId),
        csvField(e.ipAddress),
        csvField(e.userAgent),
        csvField(e.metadata),
      ].join(","),
    ),
  ];
  const body = rows.join("\n") + "\n";

  if (ctx.user) {
    await appendAuditLog({
      userId: ctx.user.id,
      action: "audit-log:export",
      ipAddress: ctx.clientIp,
      userAgent: req.headers.get("user-agent"),
      metadata: { rowCount: entries.length, filter: { from, to, action, userId, resourceType } },
    });
  }

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${Date.now()}.csv"`,
    },
  });
}
