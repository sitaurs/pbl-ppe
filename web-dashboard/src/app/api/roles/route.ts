/**
 * GET /api/roles  (permission: role:read)
 * POST /api/roles (permission: role:create)
 *
 * Sesuai Req 6.3.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { getRequestContext } from "@/lib/rbac/context";
import { prisma } from "@/lib/prisma";

const CreateBody = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(500).optional(),
  permissionIds: z.array(z.string()).default([]),
});

export async function GET(): Promise<NextResponse> {
  const roles = await prisma.role.findMany({
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isDefault: r.isDefault,
      userCount: r._count.users,
      permissions: r.permissions.map((rp) => rp.permission.id),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  if (!ctx.user) return NextResponse.json({ error: "session_invalid" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const data = parsed.data;
  // Case-insensitive uniqueness (Req 6.3)
  const existing = await prisma.role.findFirst({
    where: { name: { equals: data.name } },
  });
  if (existing && existing.name.toLowerCase() === data.name.toLowerCase()) {
    return NextResponse.json(
      { error: "role_name_exists" },
      { status: 400 },
    );
  }

  const role = await prisma.$transaction(async (tx) => {
    const created = await tx.role.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        isDefault: false,
      },
    });
    if (data.permissionIds.length > 0) {
      await tx.rolePermission.createMany({
        data: data.permissionIds.map((permissionId) => ({
          roleId: created.id,
          permissionId,
        })),
      });
    }
    return created;
  });

  await appendAuditLog({
    userId: ctx.user.id,
    action: "role:create",
    resourceType: "role",
    resourceId: role.id,
    ipAddress: ctx.clientIp,
    userAgent: req.headers.get("user-agent"),
    metadata: { name: role.name },
  });

  return NextResponse.json({ role }, { status: 201 });
}
