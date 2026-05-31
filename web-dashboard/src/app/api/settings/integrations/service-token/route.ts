/**
 * POST /api/settings/integrations/service-token  (setting:update:system)
 *
 * Sesuai Req 3.6. Generate service token 64-char hex, atomic-write ke
 * `.env.local`, return one-time display.
 */
import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { appendAuditLog } from "@/lib/audit/audit-log";
import { getRequestContext } from "@/lib/rbac/context";

const ENV_PATH = resolve(process.cwd(), ".env.local");
const TMP_PATH = resolve(process.cwd(), ".env.local.tmp");

function upsertEnvLine(content: string, key: string, value: string): string {
  const lines = content.split(/\r?\n/);
  let found = false;
  const out = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) out.push(`${key}=${value}`);
  // Drop trailing empty duplicates
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n") + "\n";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = getRequestContext(req);
  if (!ctx.user) return NextResponse.json({ error: "session_invalid" }, { status: 401 });

  const token = randomBytes(32).toString("hex"); // 64 char hex
  let existing = "";
  if (existsSync(ENV_PATH)) {
    try {
      existing = readFileSync(ENV_PATH, "utf8");
    } catch {
      // ignore
    }
  }
  const newContent = upsertEnvLine(existing, "APD_SERVICE_TOKEN", token);
  // Atomic write (write to temp + rename)
  writeFileSync(TMP_PATH, newContent, { encoding: "utf8" });
  renameSync(TMP_PATH, ENV_PATH);

  // Update process.env so current Next.js instance picks it up immediately
  process.env.APD_SERVICE_TOKEN = token;

  await appendAuditLog({
    userId: ctx.user.id,
    action: "service-token:rotate",
    resourceType: "setting",
    resourceId: "APD_SERVICE_TOKEN",
    ipAddress: ctx.clientIp,
    userAgent: req.headers.get("user-agent"),
    metadata: { tokenPrefix: token.slice(0, 8) + "..." },
  });

  return NextResponse.json({ token }, { status: 200 });
}
