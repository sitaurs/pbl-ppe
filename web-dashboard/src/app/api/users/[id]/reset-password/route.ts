/**
 * POST /api/users/:id/reset-password  (permission: user:reset-password)
 *
 * Sesuai Req 5.4. Generate password sementara 12 char yang lolos
 * `validatePassword`, set `mustChangePassword=true`, return one-time display.
 */
import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { hashPassword } from "@/lib/auth/argon2";
import { validatePassword } from "@/lib/auth/password-policy";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { getRequestContext } from "@/lib/rbac/context";
import { prisma } from "@/lib/prisma";

const ALPHABET_UP = "ABCDEFGHJKMNPQRSTUVWXYZ";
const ALPHABET_LO = "abcdefghjkmnpqrstuvwxyz";
const ALPHABET_DG = "23456789";
const ALPHABET_SY = "!@#$%^&*-_=+";

function generateTempPassword(length = 12): string {
  const all = ALPHABET_UP + ALPHABET_LO + ALPHABET_DG + ALPHABET_SY;
  for (let attempt = 0; attempt < 8; attempt++) {
    const buf = randomBytes(length * 2);
    const chars: string[] = [
      ALPHABET_UP[buf[0] % ALPHABET_UP.length],
      ALPHABET_LO[buf[1] % ALPHABET_LO.length],
      ALPHABET_DG[buf[2] % ALPHABET_DG.length],
      ALPHABET_SY[buf[3] % ALPHABET_SY.length],
    ];
    for (let i = chars.length; i < length; i++) {
      chars.push(all[buf[i + 4] % all.length]);
    }
    for (let i = chars.length - 1; i > 0; i--) {
      const j = buf[i + length] % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const candidate = chars.join("");
    if (validatePassword(candidate).length === 0) return candidate;
  }
  throw new Error("Failed to generate compliant temporary password");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  if (!ctx.user) return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await prisma.user.update({
    where: { id },
    data: {
      passwordHash,
      mustChangePassword: true,
      passwordChangedAt: new Date(),
    },
  });

  await appendAuditLog({
    userId: ctx.user.id,
    action: "user:password-reset",
    resourceType: "user",
    resourceId: id,
    ipAddress: ctx.clientIp,
    userAgent: req.headers.get("user-agent"),
    metadata: { username: target.username },
  });

  return NextResponse.json({ temporaryPassword: tempPassword }, { status: 200 });
}
