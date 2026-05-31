/**
 * GET /api/auth/csrf
 *
 * Mengembalikan CSRF token aktif untuk client (Req 11.5). Token sudah
 * tersedia di Session row; hanya perlu return ke client.
 *
 * Endpoint ini ada di whitelist publik karena dipakai sebelum first-mutation
 * (untuk hydration). Saat tidak ada session, kembalikan token kosong + 200
 * (client harus login dulu untuk mendapat token sejati).
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie-attrs";
import { verifySession } from "@/lib/auth/session";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) {
    return NextResponse.json({ csrfToken: null }, { status: 200 });
  }
  const session = await verifySession(cookie.value);
  if (!session) {
    return NextResponse.json({ csrfToken: null }, { status: 200 });
  }
  return NextResponse.json({ csrfToken: session.csrfToken }, { status: 200 });
}
