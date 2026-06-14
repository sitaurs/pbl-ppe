import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestContext } from "@/lib/rbac/context";
import { applySectorScope } from "@/lib/rbac/sector-scope";

const MJPEG_ORIGIN = "http://127.0.0.1:8766";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const nodeId = Math.trunc(Number(id));
  if (!Number.isFinite(nodeId)) {
    return NextResponse.json({ error: "invalid_node_id" }, { status: 400 });
  }

  const ctx = getRequestContext(req);
  const node = await prisma.node.findFirst({
    where: applySectorScope({ id: nodeId }, ctx),
    select: { id: true, enabled: true },
  });
  if (!node || node.enabled === false) {
    return NextResponse.json({ error: "node_not_found" }, { status: 404 });
  }

  try {
    const upstream = await fetch(`${MJPEG_ORIGIN}/stream/${nodeId}`, {
      cache: "no-store",
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "stream_unavailable" }, { status: 502 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "multipart/x-mixed-replace; boundary=frame",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return NextResponse.json({ error: "stream_offline" }, { status: 503 });
  }
}
