/**
 * scripts/setup-env.ts
 *
 * Generate APD_SERVICE_TOKEN (64 char hex) + APD_ENCRYPTION_KEY (32 byte
 * base64) di `.env.local`. Tidak overwrite jika file sudah ada — pakai merge.
 *
 * Sesuai Req 3.4, 12.7.
 *
 * Usage:
 *   npm run setup:env
 *   npm run setup:env -- --force
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

const ENV_PATH = resolve(process.cwd(), ".env.local");

function upsertEnvLine(content: string, key: string, value: string, force: boolean): string {
  const lines = content.split(/\r?\n/);
  let found = false;
  const out = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      const existingValue = line.slice(key.length + 1);
      // Don't overwrite unless --force or empty
      if (!force && existingValue.trim().length > 0) {
        return line;
      }
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) out.push(`${key}=${value}`);
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n") + "\n";
}

function main(): void {
  const force = process.argv.includes("--force");
  let content = "";
  if (existsSync(ENV_PATH)) {
    content = readFileSync(ENV_PATH, "utf8");
  }

  const serviceToken = randomBytes(32).toString("hex"); // 64 char hex
  const encryptionKey = randomBytes(32).toString("base64"); // 32-byte base64

  content = upsertEnvLine(content, "APD_SERVICE_TOKEN", serviceToken, force);
  content = upsertEnvLine(content, "APD_ENCRYPTION_KEY", encryptionKey, force);
  content = upsertEnvLine(content, "BEHIND_PROXY", "", force);

  writeFileSync(ENV_PATH, content, "utf8");
  console.log(`[setup-env] .env.local updated at ${ENV_PATH}`);
  console.log("[setup-env] Existing values preserved unless --force was passed.");
}

try {
  main();
} catch (err) {
  console.error("[setup-env] FAILED:", err);
  process.exit(1);
}
