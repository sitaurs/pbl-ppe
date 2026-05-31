/**
 * GET /api/users          (permission: user:read)
 * POST /api/users         (permission: user:create)
 *
 * Sesuai Requirements 5.1, 5.2, 5.3, 1.5.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/argon2";
import { validatePassword } from "@/lib/auth/password-policy";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { getRequestContext } from "@/lib/rbac/context";
import { prisma } from "@/lib/prisma";

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SECTOR_SCOPED_ROLES = new Set(["Supervisor", "PIC_Sektor"]);

const CreateBody = z.object({
  username: z.string().min(3).max(32).regex(USERNAME_REGEX),
  email: z.string().regex(EMAIL_REGEX),
  fullName: z.string().min(1).max(100),
  password: z.string().min(10).max(256),
  roleId: z.string().min(1),
  sectorIds: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const role = url.searchParams.get("role");
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (role) where.role = { name: role };
  if (search) {
    where.OR = [
      { username: { contains: search } },
      { fullName: { contains: search } },
      { email: { contains: search } },
    ];
  }
  const users = await prisma.user.findMany({
    where,
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
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      sectorIds: u.sectors.map((s) => s.sektorId),
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
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const violations = validatePassword(data.password);
  if (violations.length > 0) {
    return NextResponse.json(
      { error: "password_policy_violation", rules: violations },
      { status: 400 },
    );
  }
  const role = await prisma.role.findUnique({ where: { id: data.roleId } });
  if (!role) {
    return NextResponse.json({ error: "role_not_found" }, { status: 400 });
  }
  if (SECTOR_SCOPED_ROLES.has(role.name) && (!data.sectorIds || data.sectorIds.length === 0)) {
    return NextResponse.json(
      { error: "sector_assignment_required" },
      { status: 400 },
    );
  }
  const passwordHash = await hashPassword(data.password);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: data.username,
        email: data.email,
        fullName: data.fullName,
        passwordHash,
        roleId: data.roleId,
        mustChangePassword: true,
        status: "active",
      },
    });
    if (data.sectorIds && data.sectorIds.length > 0) {
      await tx.sectorAssignment.createMany({
        data: data.sectorIds.map((sektorId) => ({
          userId: user.id,
          sektorId,
        })),
      });
    }
    return user;
  });

  await appendAuditLog({
    userId: ctx.user.id,
    action: "user:create",
    resourceType: "user",
    resourceId: created.id,
    ipAddress: ctx.clientIp,
    userAgent: req.headers.get("user-agent"),
    metadata: { username: created.username, roleId: data.roleId },
  });

  return NextResponse.json(
    {
      user: {
        id: created.id,
        username: created.username,
        email: created.email,
        fullName: created.fullName,
        status: created.status,
        mustChangePassword: created.mustChangePassword,
      },
    },
    { status: 201 },
  );
}
