/**
 * PUT /api/sectors/:id/users  (sector:assign-pic)
 *
 * Replaces full set of SectorAssignment for this sector. Invalidates
 * permission cache for all affected users (Req 8.5).
 *
 * Body: { userIds: string[] }
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { invalidateUserPerms } from "@/lib/rbac/permission-cache";
import { prisma } from "@/lib/prisma";

const Body = z.object({ userIds: z.array(z.string()) });

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: sektorId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const sector = await prisma.sector.findUnique({ where: { id: sektorId } });
  if (!sector) return NextResponse.json({ error: "sector_not_found" }, { status: 404 });

  // Identify affected users (existing + new) for cache invalidation.
  const existing = await prisma.sectorAssignment.findMany({
    where: { sektorId },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((a) => a.userId));
  const newIds = new Set(parsed.data.userIds);
  const allAffected = new Set<string>([...existingIds, ...newIds]);

  await prisma.$transaction(async (tx) => {
    await tx.sectorAssignment.deleteMany({ where: { sektorId } });
    if (parsed.data.userIds.length > 0) {
      await tx.sectorAssignment.createMany({
        data: parsed.data.userIds.map((userId) => ({ userId, sektorId })),
      });
    }
  });

  for (const userId of allAffected) invalidateUserPerms(userId);

  return NextResponse.json({ ok: true, affectedUsers: allAffected.size });
}
