/**
 * POST /api/auth/2fa/disable
 *
 * Sesuai Req 12.6: butuh password + TOTP saat ini sebagai konfirmasi.
 *
 * Body: { password: string, totp: string }
 * - Verify Argon2 password
 * - Decrypt secret + verifyTotp
 * - Clear totp fields + delete RecoveryCode
 * - Audit `auth:2fa:disabled`
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth/argon2";
import { decryptSecret } from "@/lib/auth/encrypt";
import { verifyTotp } from "@/lib/auth/totp";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { getRequestContext } from "@/lib/rbac/context";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  password: z.string().min(1).max(256),
  totp: z.string().min(6).max(10),
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
  const user = await prisma.user.findUnique({ where: { id: ctx.user.id } });
  if (!user) {
    return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  }
  if (!user.totpEnabled || !user.totpSecretEnc) {
    return NextResponse.json({ error: "2fa_not_enabled" }, { status: 400 });
  }
  if (!(await verifyPassword(user.passwordHash, parsed.data.password))) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 400 });
  }
  let totpOk = false;
  try {
    const secret = decryptSecret(user.totpSecretEnc);
    totpOk = verifyTotp(secret, parsed.data.totp, 1);
  } catch {
    totpOk = false;
  }
  if (!totpOk) {
    return NextResponse.json({ error: "invalid_totp" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: false, totpSecretEnc: null },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
  ]);

  await appendAuditLog({
    userId: user.id,
    action: "auth:2fa:disabled",
    ipAddress: ctx.clientIp,
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
