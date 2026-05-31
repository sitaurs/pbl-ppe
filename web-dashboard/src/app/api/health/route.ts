/**
 * GET /api/health
 *
 * Public health check endpoint. Tidak butuh session atau permission.
 * Mengembalikan status 200 + OK untuk integration test dan smoke test.
 */
import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
