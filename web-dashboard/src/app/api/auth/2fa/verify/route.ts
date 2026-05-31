/**
 * POST /api/auth/2fa/verify
 *
 * Sesuai Req 12.2.
 *
 * Body: { setupId: string, code: string }
 * - Verify TOTP code (window ±1)
 * - Encrypt secret + persist ke User.totpSecretEnc + totpEnabled=true
 * - Generate 8 recovery codes, persist hash, return plaintext sekali
 * - Audit `auth:2fa:enabled`
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { encryptSecret, encryptionAvailable } from "@/lib/auth/encrypt";
import { verifyTotp } from "@/lib/auth/totp";
import { generateRecoveryCodes } from "@/lib/auth/recovery-codes";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { getRequestContext } from "@/lib/rbac/context";
import { prisma } from "@/lib/prisma";
import { PENDING_SETUPS } from "../setup/route";

const Body = z.object({ setupId: z.string().min(1).max(64), code: z.string().min(6).max(10) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  if (!ctx.user) {
    return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  }
  if (!encryptionAvailable()) {
    return NextResponse.json({ error: "encryption_unavailable" }, { status: 503 });
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
  const pending = PENDING_SETUPS.get(parsed.data.setupId);
  if (!pending || pending.expiresAt <= Date.now() || pending.userId !== ctx.user.id) {
    return NextResponse.json({ error: "setup_expired" }, { status: 400 });
  }
  if (!verifyTotp(pending.secret, parsed.data.code, 1)) {
    return NextResponse.json({ error: "invalid_totp" }, { status: 400 });
  }

  const ciphertext = encryptSecret(pending.secret);
  const codes = generateRecoveryCodes(8);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: ctx.user.id },
      data: { totpEnabled: true, totpSecretEnc: ciphertext },
    }),
    // Wipe any stale recovery codes from prior runs first
    prisma.recoveryCode.deleteMany({ where: { userId: ctx.user.id } }),
    prisma.recoveryCode.createMany({
      data: codes.hashes.map((codeHash) => ({
        userId: ctx.user!.id,
        codeHash,
      })),
    }),
  ]);

  PENDING_SETUPS.delete(parsed.data.setupId);

  await appendAuditLog({
    userId: ctx.user.id,
    action: "auth:2fa:enabled",
    ipAddress: ctx.clientIp,
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ recoveryCodes: codes.plaintext }, { status: 200 });
}
