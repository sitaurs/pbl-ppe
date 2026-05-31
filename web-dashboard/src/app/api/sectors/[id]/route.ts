/**
 * GET    /api/sectors/:id  (sector:read)
 * PUT    /api/sectors/:id  (sector:update)
 * DELETE /api/sectors/:id  (sector:delete)
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const UpdateBody = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const sector = await prisma.sector.findUnique({
    where: { id },
    include: {
      nodes: { select: { id: true, sektorName: true, picName: true, enabled: true } },
      users: {
        include: { user: { select: { id: true, username: true, fullName: true } } },
      },
    },
  });
  if (!sector) return NextResponse.json({ error: "sector_not_found" }, { status: 404 });
  return NextResponse.json({
    sector: {
      id: sector.id,
      name: sector.name,
      description: sector.description,
      nodes: sector.nodes,
      assignedUsers: sector.users.map((sa) => sa.user),
    },
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = UpdateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const sector = await prisma.sector.findUnique({ where: { id } });
  if (!sector) return NextResponse.json({ error: "sector_not_found" }, { status: 404 });
  await prisma.sector.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const sector = await prisma.sector.findUnique({
    where: { id },
    include: { _count: { select: { nodes: true } } },
  });
  if (!sector) return NextResponse.json({ error: "sector_not_found" }, { status: 404 });
  if (sector._count.nodes > 0) {
    return NextResponse.json(
      { error: "sector_has_nodes", nodeCount: sector._count.nodes },
      { status: 400 },
    );
  }
  await prisma.sector.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
