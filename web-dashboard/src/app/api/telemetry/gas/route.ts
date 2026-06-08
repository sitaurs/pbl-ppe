/**
 * POST /api/telemetry/gas — terima telemetri gas dari Python backend (service token only)
 * GET  /api/telemetry/gas — ambil last 100 entri (sector-scoped untuk Supervisor/PIC)
 *
 * POST hanya boleh dipanggil oleh Python backend via service token.
 * Jika caller adalah user session biasa, return 403 service_token_required.
 *
 * GET bisa dipanggil oleh user dashboard dengan permission node:read.
 * Untuk role Supervisor/PIC_Sektor, data di-filter berdasarkan sektor user.
 *
 * Requirements: 8.4, 8.5
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { applySectorScope } from "@/lib/rbac/sector-scope";
import { getRequestContext } from "@/lib/rbac/context";
import { prisma } from "@/lib/prisma";

const GasTelemetrySchema = z.object({
  nodeId: z.number().int(),
  sektorId: z.string(),
  raw: z.number().int().min(0).max(4095),
  alert: z.boolean(),
  timestamp: z.string().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = getRequestContext(req);

  // POST hanya diizinkan untuk service token (Python backend).
  // Jika caller adalah user session (bukan service token), tolak 403.
  if (!ctx.serviceToken) {
    return NextResponse.json(
      { error: "service_token_required" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = GasTelemetrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  await prisma.gasTelemetry.create({
    data: {
      nodeId: data.nodeId,
      sektorId: data.sektorId,
      raw: data.raw,
      alert: data.alert,
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = getRequestContext(req);

  // Terapkan sector scope — untuk Supervisor/PIC_Sektor, filter berdasarkan sektor user.
  // Untuk Admin/Operator (sectorIds === null), semua data dikembalikan.
  const where = applySectorScope({}, ctx);

  const entries = await prisma.gasTelemetry.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  return NextResponse.json(
    entries.map((e) => ({
      id: e.id,
      nodeId: e.nodeId,
      sektorId: e.sektorId,
      raw: e.raw,
      alert: e.alert,
      timestamp: e.timestamp.toISOString(),
    })),
  );
}
