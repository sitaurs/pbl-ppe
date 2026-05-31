/**
 * POST /api/auth/change-password
 *
 * Sesuai Requirements 9.3, 9.4, 9.6.
 *
 * Step:
 *  1. Read context (must be logged in).
 *  2. Validate body { oldPassword, newPassword }.
 *  3. verifyPassword(user.passwordHash, oldPassword).
 *  4. validatePassword(newPassword) — return 400 jika ada violation.
 *  5. Hash + update User (mustChangePassword=false, passwordChangedAt=now).
 *  6. Delete all OTHER session rows of this user (rotate).
 *  7. Audit `user:update`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { hashPassword, verifyPassword } from "@/lib/auth/argon2";
import { validatePassword } from "@/lib/auth/password-policy";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { getRequestContext } from "@/lib/rbac/context";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie-attrs";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  oldPassword: z.string().min(1).max(256),
  newPassword: z.string().min(1).max(256),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  if (!ctx.user) {
    return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { oldPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: ctx.user.id } });
  if (!user) {
    return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  }
  const oldOk = await verifyPassword(user.passwordHash, oldPassword);
  if (!oldOk) {
    return NextResponse.json({ error: "invalid_old_password" }, { status: 400 });
  }
  const violations = validatePassword(newPassword);
  if (violations.length > 0) {
    return NextResponse.json(
      { error: "password_policy_violation", rules: violations },
      { status: 400 },
    );
  }
  const newHash = await hashPassword(newPassword);

  // Update + rotate sessions in single transaction
  const currentSessionId = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    }),
    prisma.session.deleteMany({
      where: {
        userId: user.id,
        ...(currentSessionId ? { NOT: { id: currentSessionId } } : {}),
      },
    }),
  ]);

  await appendAuditLog({
    userId: user.id,
    action: "user:update",
    resourceType: "user",
    resourceId: user.id,
    ipAddress: ctx.clientIp,
    userAgent: req.headers.get("user-agent"),
    metadata: { reason: "self_password_change" },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
