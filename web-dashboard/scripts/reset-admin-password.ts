/**
 * scripts/reset-admin-password.ts
 *
 * CLI recovery: reset password user (default: 'admin') ke password acak baru.
 * Set `mustChangePassword=true` agar dipaksa ganti saat login pertama.
 * Password ditampilkan satu kali ke stdout.
 *
 * Sesuai design.md §Risk R3 mitigasi.
 *
 * Usage:
 *   npm run reset:admin
 *   npm run reset:admin -- --username admin
 */
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { randomBytes } from "node:crypto";
import { resolve, join } from "node:path";
import { hashPassword } from "../src/lib/auth/argon2";
import { validatePassword } from "../src/lib/auth/password-policy";

const DB_FILE_PATH = join(resolve(process.cwd(), "data"), "safeguard.db");
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: `file:${DB_FILE_PATH}` }),
});

function arg(name: string, defaultValue: string): string {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(name);
  if (idx === -1 || idx + 1 >= argv.length) return defaultValue;
  return argv[idx + 1];
}

function generatePassword(length = 16): string {
  const UP = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const LO = "abcdefghjkmnpqrstuvwxyz";
  const DG = "23456789";
  const SY = "!@#$%^&*-_=+";
  for (let attempt = 0; attempt < 8; attempt++) {
    const buf = randomBytes(length * 2);
    const chars: string[] = [
      UP[buf[0] % UP.length],
      LO[buf[1] % LO.length],
      DG[buf[2] % DG.length],
      SY[buf[3] % SY.length],
    ];
    const all = UP + LO + DG + SY;
    for (let i = chars.length; i < length; i++) chars.push(all[buf[i + 4] % all.length]);
    for (let i = chars.length - 1; i > 0; i--) {
      const j = buf[i + length] % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const candidate = chars.join("");
    if (validatePassword(candidate).length === 0) return candidate;
  }
  throw new Error("Failed to generate compliant password");
}

async function main(): Promise<void> {
  const username = arg("--username", "admin");
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`User '${username}' tidak ditemukan`);
    process.exit(1);
  }
  const newPassword = generatePassword(16);
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: true,
      passwordChangedAt: new Date(),
      status: "active",
      lockedUntil: null,
    },
  });
  console.log("");
  console.log("==================================================================");
  console.log("  PASSWORD RESET — display once, NOT saved");
  console.log("==================================================================");
  console.log(`  Username : ${username}`);
  console.log(`  Password : ${newPassword}`);
  console.log("  → mustChangePassword=true: ganti saat login pertama");
  console.log("==================================================================");
  console.log("");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("[reset-admin-password] FAILED:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
