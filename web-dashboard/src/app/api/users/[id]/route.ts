/**
 * GET    /api/users/:id  (permission: user:read)
 * PUT    /api/users/:id  (permission: user:update)
 * DELETE /api/users/:id  (permission: user:delete)
 *
 * Sesuai Requirements 5.5, 5.6, 6.5.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { getRequestContext } from "@/lib/rbac/context";
import { invalidateUserPerms } from "@/lib/rbac/permission-cache";
import { prisma } from "@/lib/prisma";

const SECTOR_SCOPED_ROLES = new Set(["Supervisor", "PIC_Sektor"]);

const UpdateBody = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(1).max(100).optional(),
  roleId: z.string().min(1).optional(),
  status: z.enum(["active", "disabled", "locked"]).optional(),
  sectorIds: z.array(z.string()).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      email: true,
      fullName: true,
      status: true,
      mustChangePassword: true,
      totpEnabled: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      role: { select: { id: true, name: true } },
      sectors: { select: { sektorId: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  return NextResponse.json({
    user: {
      ...user,
      sectorIds: user.sectors.map((s) => s.sektorId),
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
  const data = parsed.data;
  const existing = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  // Validate role + sector
  let targetRoleName = existing.role.name;
  if (data.roleId && data.roleId !== existing.roleId) {
    const role = await prisma.role.findUnique({ where: { id: data.roleId } });
    if (!role) {
      return NextResponse.json({ error: "role_not_found" }, { status: 400 });
    }
    targetRoleName = role.name;
  }
  if (SECTOR_SCOPED_ROLES.has(targetRoleName)) {
    const newSectorIds = data.sectorIds;
    if (newSectorIds !== undefined && newSectorIds.length === 0) {
      return NextResponse.json({ error: "sector_assignment_required" }, { status: 400 });
    }
  }

  const willDisable = data.status === "disabled" && existing.status !== "disabled";

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        email: data.email,
        fullName: data.fullName,
        roleId: data.roleId,
        status: data.status,
      },
    });
    if (data.sectorIds !== undefined) {
      await tx.sectorAssignment.deleteMany({ where: { userId: id } });
      if (data.sectorIds.length > 0) {
        await tx.sectorAssignment.createMany({
          data: data.sectorIds.map((sektorId) => ({ userId: id, sektorId })),
        });
      }
    }
    if (willDisable) {
      await tx.session.deleteMany({ where: { userId: id } });
    }
  });

  invalidateUserPerms(id);
  await appendAuditLog({
    userId: ctx.user.id,
    action: "user:update",
    resourceType: "user",
    resourceId: id,
    ipAddress: ctx.clientIp,
    userAgent: req.headers.get("user-agent"),
    metadata: { changes: data },
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

  // Block deleting self (Req 5.6)
  if (id === ctx.user.id) {
    return NextResponse.json(
      { error: "cannot_delete_self", message: "Tidak dapat menghapus akun sendiri" },
      { status: 400 },
    );
  }
  const target = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  // Block deleting last active Super_Admin (Req 5.6)
  if (target.role.name === "Super_Admin") {
    const activeSuperAdminCount = await prisma.user.count({
      where: { role: { name: "Super_Admin" }, status: "active" },
    });
    if (activeSuperAdminCount <= 1) {
      return NextResponse.json(
        {
          error: "cannot_delete_last_super_admin",
          message: "Tidak dapat menghapus akun Super_Admin terakhir",
        },
        { status: 400 },
      );
    }
  }
  await prisma.user.delete({ where: { id } });
  invalidateUserPerms(id);
  await appendAuditLog({
    userId: ctx.user.id,
    action: "user:delete",
    resourceType: "user",
    resourceId: id,
    ipAddress: ctx.clientIp,
    userAgent: req.headers.get("user-agent"),
    metadata: { username: target.username },
  });
  return NextResponse.json({ ok: true });
}
