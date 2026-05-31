/**
 * GET /api/audit-log  (audit-log:read)
 *
 * Pagination + filter (Req 13.4). Default 50/page.
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const action = url.searchParams.get("action");
  const userId = url.searchParams.get("userId");
  const resourceType = url.searchParams.get("resourceType");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50),
  );

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

  const [total, entries] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    entries,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}
