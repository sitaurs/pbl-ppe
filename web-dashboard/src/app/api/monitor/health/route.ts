import { NextResponse } from "next/server";

const MJPEG_HEALTH_URL = "http://127.0.0.1:8766/health";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const upstream = await fetch(MJPEG_HEALTH_URL, {
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json({ status: "downstream_error" }, { status: 502 });
    }

    const body = await upstream.text();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ status: "offline" }, { status: 503 });
  }
}
