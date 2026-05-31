/**
 * Property 4: Permission map coverage (deny-by-default)
 *
 * Validates: Requirements 7.2, 7.5
 *
 * Statement (design.md §Correctness Properties — Property 4):
 *   For any berkas `src/app/api/**\/route.ts` yang mengekspor handler HTTP
 *   method M selain endpoint whitelist (`/api/auth/login`, `/api/auth/csrf`,
 *   `/api/health`), `lookupPermission(M, normalizedPathname)` SHALL
 *   mengembalikan entri non-null. Untuk endpoint yang tidak terdaftar,
 *   middleware menolak dengan 403 `endpoint_not_registered`.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import {
  lookupPermission,
  isPublicPath,
  isSessionOnlyPath,
  PERMISSION_MAP,
} from "@/lib/rbac/permission-map";

const API_DIR = resolve(process.cwd(), "src/app/api");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

interface RouteHandler {
  pathname: string;
  methods: string[];
  file: string;
}

function walkRouteFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkRouteFiles(full));
    else if (st.isFile() && /^route\.(ts|tsx|js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Convert route file path → API pathname.
 *   src/app/api/nodes/route.ts          → /api/nodes
 *   src/app/api/nodes/[id]/route.ts     → /api/nodes/:id  (sample id used for regex test)
 *   src/app/api/nodes/[id]/status/route.ts → /api/nodes/:id/status
 *
 * For regex-test purposes, we substitute `[xxx]` with concrete sample values:
 *   - numeric param (id) → "1"
 *   - string param       → "abc"
 *
 * Heuristic: if folder name matches `[id]`, use "1" (matches \d+ pattern);
 * else use a 36-char placeholder for UUID/string-id matches.
 */
function fileToPathname(file: string): string {
  const rel = file.slice(API_DIR.length).replace(/\\/g, "/");
  // Drop trailing /route.{ts,tsx,js,jsx}
  const noRoute = rel.replace(/\/route\.(ts|tsx|js|jsx)$/, "");
  const segments = noRoute.split("/").filter(Boolean);
  const concrete = segments.map((seg) => {
    const m = seg.match(/^\[(\.{3})?([^\]]+)\]$/);
    if (!m) return seg;
    const param = m[2];
    // Heuristic: parameter named "id" treated as numeric (Node id) when used
    // under /api/nodes/, else string. Walking segments back is easiest:
    if (param.toLowerCase() === "id") {
      return "1"; // matches both \d+ and [^/]+
    }
    return "test-id";
  });
  return "/api/" + concrete.join("/");
}

function extractExportedMethods(content: string): string[] {
  const found: string[] = [];
  for (const m of HTTP_METHODS) {
    // Match common Next.js route export forms:
    //   export async function GET(...)
    //   export function GET(...)
    //   export const GET = ...
    //   export { GET, POST }
    const patterns: RegExp[] = [
      new RegExp(`\\bexport\\s+async\\s+function\\s+${m}\\b`),
      new RegExp(`\\bexport\\s+function\\s+${m}\\b`),
      new RegExp(`\\bexport\\s+(?:const|let|var)\\s+${m}\\b`),
      new RegExp(`\\bexport\\s*\\{[^}]*\\b${m}\\b[^}]*\\}`),
    ];
    if (patterns.some((re) => re.test(content))) found.push(m);
  }
  return found;
}

function collectHandlers(): RouteHandler[] {
  const files = walkRouteFiles(API_DIR);
  return files
    .map<RouteHandler>((file) => {
      const content = readFileSync(file, "utf8");
      return {
        file,
        pathname: fileToPathname(file),
        methods: extractExportedMethods(content),
      };
    })
    .filter((h) => h.methods.length > 0);
}

describe("Property 4: Permission map coverage / deny-by-default (Requirements 7.2, 7.5)", () => {
  it("every (method, pathname) exported by src/app/api/**/route.ts is mapped or whitelisted", () => {
    const handlers = collectHandlers();
    expect(handlers.length).toBeGreaterThan(0); // sanity

    const unmapped: { method: string; pathname: string; file: string }[] = [];
    for (const h of handlers) {
      // Skip whitelisted public paths and session-only paths
      if (isPublicPath(h.pathname) || isSessionOnlyPath(h.pathname)) continue;
      for (const method of h.methods) {
        const entry = lookupPermission(method, h.pathname);
        if (!entry) {
          unmapped.push({
            method,
            pathname: h.pathname,
            file: h.file.slice(API_DIR.length).replace(/\\/g, "/"),
          });
        }
      }
    }
    expect(unmapped).toEqual([]);
  });

  it("every PERMISSION_MAP entry references an HTTP method in the standard set", () => {
    for (const e of PERMISSION_MAP) {
      expect(HTTP_METHODS).toContain(e.method);
    }
  });

  it("PERMISSION_MAP has no duplicate (method, pathPattern.source) pairs", () => {
    const seen = new Set<string>();
    for (const e of PERMISSION_MAP) {
      const k = `${e.method}|${e.pathPattern.source}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });
});
