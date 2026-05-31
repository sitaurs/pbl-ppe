/**
 * GET /api/auth/me
 *
 * Mengembalikan AuthenticatedUser dari context yang sudah disiapkan
 * middleware. Dipakai client untuk hydrate `useCurrentUser` (Req 14.7).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "@/lib/rbac/context";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  if (!ctx.user) {
    return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  }
  return NextResponse.json({ user: ctx.user, csrfToken: ctx.csrfToken }, { status: 200 });
}
