/**
 * GET /api/sectors  (sector:read)
 * POST /api/sectors (sector:create)
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/rbac/context";
import { prisma } from "@/lib/prisma";

const SECTOR_ID_REGEX = /^S-\d{2,3}$/;
const CreateBody = z.object({
  id: z.string().regex(SECTOR_ID_REGEX),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export async function GET(): Promise<NextResponse> {
  const sectors = await prisma.sector.findMany({
    include: {
      _count: { select: { nodes: true, users: true } },
    },
    orderBy: { id: "asc" },
  });
  return NextResponse.json({
    sectors: sectors.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      nodeCount: s._count.nodes,
      assignedUserCount: s._count.users,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  if (!ctx.user) return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const sector = await prisma.sector.create({ data: parsed.data });
    return NextResponse.json({ sector }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "sector_id_exists" }, { status: 400 });
  }
}
