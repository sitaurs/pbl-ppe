/**
 * POST /api/users/:id/unlock  (permission: user:update)
 *
 * Sesuai Req 10.6. Manual unlock account.
 */
import { NextResponse, type NextRequest } from "next/server";
import { manualUnlock } from "@/lib/rate-limit/lockout";
import { getRequestContext } from "@/lib/rbac/context";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  if (!ctx.user) return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  await manualUnlock(id, ctx.user.id, {
    ipAddress: ctx.clientIp,
    userAgent: req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true }, { status: 200 });
}
