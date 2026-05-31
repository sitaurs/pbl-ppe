/**
 * POST /api/auth/login
 *
 * Sesuai design.md §Login Sequence dan Requirements 4.1, 4.2, 4.3,
 * 9.5, 10.2, 11.1, 11.2.
 *
 * Step:
 *   1. Validate input shape (zod).
 *   2. Rate-limit check (Req 10.2): jika failures(ip,user) ≥ 5 → 429.
 *   3. Load user dari DB. Status check (active vs disabled/locked).
 *   4. Verify Argon2 password.
 *   5. 2FA branch jika user.totpEnabled (Req 12.x):
 *        - Tanpa totp: return 200 { needs2fa: true }
 *        - Dengan totp: verify TOTP atau redeem RecoveryCode.
 *   6. Rehash if needed (Req 9.5).
 *   7. Create Session + set cookie + return { csrfToken, redirect }.
 *   8. Audit `auth:login:success`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { verifyPassword, hashPassword, needsRehash } from "@/lib/auth/argon2";
import { createSession } from "@/lib/auth/session";
import { isLoginAllowed, recordFailure, clearForUser, countFailuresUsername } from "@/lib/rate-limit/rate-limiter";
import { applyLockout, isLocked, releaseLockoutIfExpired } from "@/lib/rate-limit/lockout";
import {
  SESSION_COOKIE_NAME,
  buildSetCookieHeader,
  getSessionCookieAttrs,
} from "@/lib/auth/cookie-attrs";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { isSafeRedirectTarget } from "@/lib/auth/redirect-safety";
import { decryptSecret } from "@/lib/auth/encrypt";
import { verifyTotp } from "@/lib/auth/totp";
import { redeemRecoveryCode } from "@/lib/auth/recovery-codes";
import { prisma } from "@/lib/prisma";

const LoginRequestSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
  totp: z.string().min(1).max(20).optional().nullable(),
  redirect: z.string().optional().nullable(),
});

const ROLE_DEFAULT_LANDING: Record<string, string> = {
  Super_Admin: "/",
  Admin_K3: "/",
  Supervisor: "/monitor",
  PIC_Sektor: "/",
  Auditor: "/reports",
};

/**
 * Generic error response — tidak membedakan invalid_credentials, user_disabled,
 * user_locked, dst. agar tidak bocorkan keberadaan user (Req 4.3).
 */
function genericLoginError(): NextResponse {
  return NextResponse.json(
    { error: "invalid_credentials", message: "Username atau password salah" },
    { status: 401 },
  );
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "127.0.0.1"
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");

  // 1. Validate input
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = LoginRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { username, password, totp, redirect } = parsed.data;

  // 2. Rate-limit check
  const allowed = isLoginAllowed(ip, username);
  if (!allowed.allowed) {
    await appendAuditLog({
      userId: "system:rate-limiter",
      action: "auth:login:failure",
      ipAddress: ip,
      userAgent,
      metadata: { username, reason: "rate_limited", retryAfterMin: allowed.retryAfterMin },
    });
    return NextResponse.json(
      {
        error: "rate_limited",
        message: `Terlalu banyak percobaan, coba lagi setelah ${allowed.retryAfterMin} menit`,
      },
      { status: 429 },
    );
  }

  // 3. Load user
  const user = await prisma.user.findUnique({
    where: { username },
    include: { role: { select: { id: true, name: true } } },
  });

  if (!user) {
    recordFailure(ip, username);
    await appendAuditLog({
      userId: "system:auth",
      action: "auth:login:failure",
      ipAddress: ip,
      userAgent,
      metadata: { username, reason: "invalid_credentials" },
    });
    return genericLoginError();
  }

  // Auto-release expired lockout sebelum check status
  const lockoutChecked = await releaseLockoutIfExpired(user);
  // Tetap pakai object lengkap (`user` masih memiliki seluruh field), tapi
  // override status/lockedUntil dengan hasil release.
  const currentUser = {
    ...user,
    status: lockoutChecked.status,
    lockedUntil: lockoutChecked.lockedUntil,
  };

  if (currentUser.status === "disabled") {
    recordFailure(ip, username);
    await appendAuditLog({
      userId: user.id,
      action: "auth:login:failure",
      ipAddress: ip,
      userAgent,
      metadata: { username, reason: "user_disabled" },
    });
    return genericLoginError();
  }
  if (isLocked(currentUser)) {
    recordFailure(ip, username);
    await appendAuditLog({
      userId: user.id,
      action: "auth:login:failure",
      ipAddress: ip,
      userAgent,
      metadata: { username, reason: "user_locked" },
    });
    return genericLoginError();
  }

  // 4. Verify Argon2 password
  const passwordOk = await verifyPassword(user.passwordHash, password);
  if (!passwordOk) {
    recordFailure(ip, username);
    await appendAuditLog({
      userId: user.id,
      action: "auth:login:failure",
      ipAddress: ip,
      userAgent,
      metadata: { username, reason: "invalid_credentials" },
    });
    // Trigger lockout jika sudah ≥10 failures
    const total = countFailuresUsername(username);
    if (total >= 10) {
      await applyLockout(user.id, { ipAddress: ip, userAgent });
    }
    return genericLoginError();
  }

  // 5. 2FA branch
  if (user.totpEnabled) {
    if (!totp) {
      // Step 1 of 2FA: ask client to send code
      return NextResponse.json({ needs2fa: true }, { status: 200 });
    }
    let totpOk = false;
    if (user.totpSecretEnc) {
      try {
        const secret = decryptSecret(user.totpSecretEnc);
        totpOk = verifyTotp(secret, totp);
      } catch {
        totpOk = false;
      }
    }
    if (!totpOk) {
      // Try recovery code (Req 12.4)
      const redeemed = await redeemRecoveryCode(user.id, totp);
      if (redeemed) {
        totpOk = true;
        await appendAuditLog({
          userId: user.id,
          action: "auth:2fa:recovery-used",
          ipAddress: ip,
          userAgent,
          metadata: { username },
        });
      }
    }
    if (!totpOk) {
      recordFailure(ip, username);
      await appendAuditLog({
        userId: user.id,
        action: "auth:login:failure",
        ipAddress: ip,
        userAgent,
        metadata: { username, reason: "invalid_totp" },
      });
      return genericLoginError();
    }
  }

  // 6. Rehash if needed (Req 9.5)
  if (needsRehash(user.passwordHash)) {
    try {
      const newHash = await hashPassword(password);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      });
    } catch (err) {
      console.warn("[login] rehash failed:", err);
    }
  }

  // Auto-mark mustChangePassword=true bila password >90 hari untuk admin (Req 9.7)
  let mustChangePassword = currentUser.mustChangePassword;
  if (
    !mustChangePassword &&
    (currentUser.role.name === "Super_Admin" || currentUser.role.name === "Admin_K3")
  ) {
    const ageMs = Date.now() - currentUser.passwordChangedAt.getTime();
    if (ageMs > 90 * 24 * 60 * 60 * 1000) {
      await prisma.user.update({
        where: { id: user.id },
        data: { mustChangePassword: true },
      });
      mustChangePassword = true;
    }
  }

  // 7. Create Session
  const session = await createSession({
    userId: user.id,
    ipAddress: ip,
    userAgent,
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  clearForUser(username);

  // 8. Audit success
  await appendAuditLog({
    userId: user.id,
    action: "auth:login:success",
    ipAddress: ip,
    userAgent,
    metadata: { username },
  });

  const roleName = currentUser.role.name;
  const defaultLanding = ROLE_DEFAULT_LANDING[roleName] ?? "/";
  const target = mustChangePassword
    ? "/change-password"
    : redirect && isSafeRedirectTarget(redirect)
      ? redirect
      : defaultLanding;

  const res = NextResponse.json(
    {
      csrfToken: session.csrfToken,
      redirect: target,
    },
    { status: 200 },
  );
  const cookieAttrs = getSessionCookieAttrs(process.env);
  res.headers.set(
    "Set-Cookie",
    buildSetCookieHeader(session.id, cookieAttrs),
  );
  return res;
}

// Tidak perlu CSRF check di handler ini (login adalah pre-auth).
// Suppress unused import lint
void SESSION_COOKIE_NAME;
