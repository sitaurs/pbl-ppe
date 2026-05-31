/**
 * GET /api/settings  (setting:read; service-token allowed)
 * PUT /api/settings  (setting:update:branding) — back-compat path
 *
 * Mengembalikan map settings dari tabel `Setting` (key, JSON-serialized value).
 * Untuk back-compat, endpoint juga menerima `PUT` body berupa partial settings
 * yang di-deep-merge per-key.
 */
import { NextResponse, type NextRequest } from "next/server";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { getRequestContext } from "@/lib/rbac/context";
import { prisma } from "@/lib/prisma";

const DEFAULT_SETTINGS: Record<string, unknown> = {
  branding: {
    appName: "SafeGuard APD",
    companyName: "",
    logoUrl: "",
    primaryColor: "#e8720b",
  },
  whatsapp: {
    enabled: true,
    serverUrl: "http://157.245.206.36:3000",
    username: "admin",
    password: "",
    deviceId: "pbl-alarm",
    cooldownSeconds: 120,
  },
  mqtt: {
    enabled: true,
    brokerUrl: "",
    port: 8883,
    username: "",
    password: "",
    topicViolation: "APD_Violation",
  },
  system: {
    websocketPort: 8765,
    confidenceThreshold: 0.65,
    personConfidence: 0.6,
  },
};

async function loadSettings(): Promise<Record<string, unknown>> {
  const rows = await prisma.setting.findMany();
  const dbMap: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      dbMap[r.key] = JSON.parse(r.value);
    } catch {
      dbMap[r.key] = r.value;
    }
  }
  // Merge defaults dengan DB values (DB wins per key)
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(dbMap)) merged[k] = v;
  return merged;
}

export async function GET(): Promise<NextResponse> {
  const settings = await loadSettings();
  return NextResponse.json(settings);
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (sv && typeof sv === "object" && !Array.isArray(sv) && tv && typeof tv === "object" && !Array.isArray(tv)) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const current = await loadSettings();
  const merged = deepMerge(current, body as Record<string, unknown>);

  // Persist setiap top-level key sebagai row
  await prisma.$transaction(
    Object.entries(merged).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: {
          key,
          value: JSON.stringify(value),
          updatedById: ctx.user?.id ?? null,
        },
        update: {
          value: JSON.stringify(value),
          updatedById: ctx.user?.id ?? null,
        },
      }),
    ),
  );

  if (ctx.user) {
    await appendAuditLog({
      userId: ctx.user.id,
      action: "setting:update:branding",
      ipAddress: ctx.clientIp,
      userAgent: req.headers.get("user-agent"),
      metadata: { keys: Object.keys(body) },
    });
  }

  return NextResponse.json({ ok: true, data: merged });
}
