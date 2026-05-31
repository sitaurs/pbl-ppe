/**
 * GET    /api/roles/:id  (role:read)
 * PUT    /api/roles/:id  (role:assign-permission)
 * DELETE /api/roles/:id  (role:delete)
 *
 * Sesuai Req 6.4 (block default role delete), 6.5 (cache invalidation),
 * 6.6 (block delete jika ada user assigned).
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { getRequestContext } from "@/lib/rbac/context";
import { invalidateUsersByRoleName } from "@/lib/rbac/permission-cache";
import { prisma } from "@/lib/prisma";

const UpdateBody = z.object({
  name: z.string().min(1).max(64).optional(),
  description: z.string().max(500).optional(),
  permissionIds: z.array(z.string()).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
  });
  if (!role) return NextResponse.json({ error: "role_not_found" }, { status: 404 });
  return NextResponse.json({
    role: {
      ...role,
      permissions: role.permissions.map((rp) => rp.permission.id),
      userCount: role._count.users,
    },
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  if (!ctx.user) return NextResponse.json({ error: "session_invalid" }, { status: 401 });

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = UpdateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return NextResponse.json({ error: "role_not_found" }, { status: 404 });

  // Block rename of default roles (Req 6.4)
  if (role.isDefault && parsed.data.name && parsed.data.name !== role.name) {
    return NextResponse.json(
      { error: "cannot_rename_default_role" },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.role.update({
      where: { id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
      },
    });
    if (parsed.data.permissionIds !== undefined) {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (parsed.data.permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: parsed.data.permissionIds.map((permissionId) => ({
            roleId: id,
            permissionId,
          })),
        });
      }
    }
  });

  // Invalidate cache untuk semua user dengan role ini (Req 6.5)
  invalidateUsersByRoleName(role.name);

  await appendAuditLog({
    userId: ctx.user.id,
    action: "role:update",
    resourceType: "role",
    resourceId: id,
    ipAddress: ctx.clientIp,
    userAgent: req.headers.get("user-agent"),
    metadata: { changes: parsed.data },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  if (!ctx.user) return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  const { id } = await params;
  const role = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!role) return NextResponse.json({ error: "role_not_found" }, { status: 404 });
  // Block delete of default roles (Req 6.4)
  if (role.isDefault) {
    return NextResponse.json(
      {
        error: "cannot_delete_default_role",
        message: "Role default tidak dapat dihapus",
      },
      { status: 400 },
    );
  }
  // Block delete if users assigned (Req 6.6)
  if (role._count.users > 0) {
    return NextResponse.json(
      {
        error: "role_has_users",
        message: `Role masih dipakai oleh ${role._count.users} user`,
        userCount: role._count.users,
      },
      { status: 400 },
    );
  }
  await prisma.role.delete({ where: { id } });
  await appendAuditLog({
    userId: ctx.user.id,
    action: "role:delete",
    resourceType: "role",
    resourceId: id,
    ipAddress: ctx.clientIp,
    userAgent: req.headers.get("user-agent"),
    metadata: { name: role.name },
  });
  return NextResponse.json({ ok: true });
}
