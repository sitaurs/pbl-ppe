/**
 * POST /api/auth/2fa/setup
 *
 * Sesuai design.md §2FA Enrollment Flow + Recovery Codes dan Req 12.1, 12.7.
 *
 * - Generate base32 secret 160-bit + setupId ephemeral.
 * - Simpan (setupId → secret) di Map memori dengan TTL 10 menit.
 * - Return { setupId, otpauthUri, secretBase32 }.
 * - Return 503 jika encryptionAvailable() === false (Req 12.7).
 */
import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { encryptionAvailable } from "@/lib/auth/encrypt";
import { generateOtpauthUri, generateTotpSecret } from "@/lib/auth/totp";
import { getRequestContext } from "@/lib/rbac/context";

interface PendingSetup {
  userId: string;
  secret: string;
  expiresAt: number;
}

// Module-scoped Map. Single-laptop deploy → in-memory cukup.
// Cleanup: entries dibersihkan saat di-baca jika sudah expired.
export const PENDING_SETUPS = new Map<string, PendingSetup>();
const SETUP_TTL_MS = 10 * 60 * 1000;

function cleanup(): void {
  const now = Date.now();
  for (const [k, v] of PENDING_SETUPS) {
    if (v.expiresAt <= now) PENDING_SETUPS.delete(k);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  if (!ctx.user) {
    return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  }
  if (!encryptionAvailable()) {
    return NextResponse.json(
      { error: "encryption_unavailable" },
      { status: 503 },
    );
  }
  cleanup();
  const setupId = randomBytes(16).toString("hex");
  const secret = generateTotpSecret();
  const otpauthUri = generateOtpauthUri(secret, ctx.user.email, "SafeGuard APD");
  PENDING_SETUPS.set(setupId, {
    userId: ctx.user.id,
    secret,
    expiresAt: Date.now() + SETUP_TTL_MS,
  });
  return NextResponse.json(
    { setupId, otpauthUri, secretBase32: secret },
    { status: 200 },
  );
}
