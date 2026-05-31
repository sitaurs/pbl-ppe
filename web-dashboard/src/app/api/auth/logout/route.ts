/**
 * POST /api/auth/logout
 *
 * Idempotent logout (Req 4.4, 4.5, Property 15):
 *  - Hapus row Session jika cookie ada DAN row ditemukan.
 *  - Tetap return 200 + Set-Cookie clearing meskipun cookie absent atau row
 *    sudah expired/missing.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  buildClearCookieHeader,
} from "@/lib/auth/cookie-attrs";
import { deleteSession } from "@/lib/auth/session";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { getRequestContext } from "@/lib/rbac/context";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME);
  let deleted = false;
  if (cookie?.value) {
    deleted = await deleteSession(cookie.value);
  }
  if (deleted) {
    const ctx = getRequestContext(req);
    if (ctx.user) {
      await appendAuditLog({
        userId: ctx.user.id,
        action: "auth:logout",
        ipAddress: ctx.clientIp,
        userAgent: req.headers.get("user-agent"),
      });
    }
  }
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.headers.set("Set-Cookie", buildClearCookieHeader(process.env));
  return res;
}
