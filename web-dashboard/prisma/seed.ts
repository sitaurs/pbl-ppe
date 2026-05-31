/**
 * prisma/seed.ts
 *
 * Idempotent seed script for SafeGuard APD Web Dashboard.
 *
 * Sequence (sesuai design.md §Authorization Model + §Authentication Flow):
 *   1. Upsert 34 Permission rows (id = `resource:action`).
 *   2. Upsert 5 default Role rows + RolePermission map dari `role-seed.ts`.
 *   3. Jika tidak ada User sama sekali, buat user `admin` Super_Admin dengan
 *      password acak 16 karakter yang lolos Password_Policy, mustChangePassword=true.
 *      Password ditampilkan satu kali ke stdout, TIDAK disimpan ke file lain.
 *   4. Seluruh operasi dibungkus satu Prisma `$transaction` agar atomic.
 *
 * Idempotency:
 *   - Permission upsert by id → run kedua tidak menambah baris baru.
 *   - Role upsert by name + isDefault flag → run kedua hanya update timestamp.
 *   - RolePermission delete-then-insert dalam transaksi sehingga matrix selalu
 *     match dengan `DEFAULT_ROLE_PERMISSIONS` saat ini (jika design diupdate,
 *     run ulang seed akan menyinkronkan matrix).
 *   - User admin hanya dibuat jika `count(User) === 0`.
 *
 * Validates: Requirements 1.4, 5.7, 6.1, 6.2.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { randomBytes } from "node:crypto";
import { resolve, join } from "node:path";
import { hashPassword } from "../src/lib/auth/argon2";
import { ALL_PERMISSIONS } from "../src/lib/rbac/permission-types";
import {
  DEFAULT_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_ROLE_DESCRIPTIONS,
} from "../src/lib/rbac/role-seed";
import { validatePassword } from "../src/lib/auth/password-policy";

const DB_FILE_PATH = join(resolve(process.cwd(), "data"), "safeguard.db");
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: `file:${DB_FILE_PATH}` }),
});

/**
 * Generate password acak 16 karakter yang LOLOS Password_Policy:
 *  - panjang ≥ 10
 *  - mengandung huruf besar, huruf kecil, digit, dan simbol
 *  - tidak ada di HIBP top-10k (kemungkinan sangat kecil dengan random bytes)
 *
 * Strategi: pastikan minimal satu karakter dari setiap kategori, lalu isi
 * sisanya dari alfabet luas. Loop sampai `validatePassword()` mengembalikan
 * empty array (worst-case 1-2 iterasi).
 */
function generateStrongPassword(length = 16): string {
  const UP = "ABCDEFGHIJKLMNPQRSTUVWXYZ"; // omit O for readability
  const LO = "abcdefghijkmnopqrstuvwxyz"; // omit l
  const DG = "23456789";                   // omit 0,1
  const SY = "!@#$%^&*-_=+";

  for (let attempt = 0; attempt < 8; attempt++) {
    const buf = randomBytes(length * 2);
    const chars: string[] = [];
    chars.push(UP[buf[0] % UP.length]);
    chars.push(LO[buf[1] % LO.length]);
    chars.push(DG[buf[2] % DG.length]);
    chars.push(SY[buf[3] % SY.length]);
    const all = UP + LO + DG + SY;
    for (let i = chars.length; i < length; i++) {
      chars.push(all[buf[i + 4] % all.length]);
    }
    // Shuffle dengan Fisher-Yates menggunakan random bytes
    for (let i = chars.length - 1; i > 0; i--) {
      const j = buf[i + length] % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const candidate = chars.join("");
    if (validatePassword(candidate).length === 0) return candidate;
  }
  throw new Error("Failed to generate compliant random password after 8 attempts");
}

async function main(): Promise<void> {
  console.log("[seed] Starting seed...");

  await prisma.$transaction(async (tx) => {
    // 1. Upsert 34 Permission ----------------------------------------------
    for (const id of ALL_PERMISSIONS) {
      const colonIdx = id.lastIndexOf(":");
      const resource = id.slice(0, colonIdx);
      const action = id.slice(colonIdx + 1);
      await tx.permission.upsert({
        where: { id },
        create: { id, resource, action },
        update: { resource, action },
      });
    }
    console.log(`[seed] Upserted ${ALL_PERMISSIONS.length} permissions`);

    // 2. Upsert 5 default Role + RolePermission ----------------------------
    for (const roleName of DEFAULT_ROLES) {
      const role = await tx.role.upsert({
        where: { name: roleName },
        create: {
          name: roleName,
          description: DEFAULT_ROLE_DESCRIPTIONS[roleName],
          isDefault: true,
        },
        update: {
          description: DEFAULT_ROLE_DESCRIPTIONS[roleName],
          isDefault: true,
        },
      });

      // Sinkronkan RolePermission dengan matrix saat ini.
      // Hapus baris lama yang TIDAK ada di matrix baru → idempotent + drift-fix.
      const desired = new Set(DEFAULT_ROLE_PERMISSIONS[roleName]);
      const existing = await tx.rolePermission.findMany({
        where: { roleId: role.id },
        select: { permissionId: true },
      });
      const existingSet = new Set(existing.map((r) => r.permissionId));

      // Insert yang belum ada
      for (const permissionId of desired) {
        if (!existingSet.has(permissionId)) {
          await tx.rolePermission.create({ data: { roleId: role.id, permissionId } });
        }
      }
      // Hapus yang sudah tidak ada di matrix
      for (const permissionId of existingSet) {
        if (!desired.has(permissionId as never)) {
          await tx.rolePermission.delete({
            where: { roleId_permissionId: { roleId: role.id, permissionId } },
          });
        }
      }
    }
    console.log(`[seed] Upserted ${DEFAULT_ROLES.length} default roles + permissions`);

    // 3. Default Super_Admin user (only if no users yet) -------------------
    const userCount = await tx.user.count();
    if (userCount === 0) {
      const superAdminRole = await tx.role.findUniqueOrThrow({
        where: { name: "Super_Admin" },
      });
      const tempPassword = generateStrongPassword(16);
      const passwordHash = await hashPassword(tempPassword);

      await tx.user.create({
        data: {
          username: "admin",
          email: "admin@safeguard.local",
          fullName: "Sistem Admin",
          passwordHash,
          mustChangePassword: true,
          status: "active",
          roleId: superAdminRole.id,
        },
      });

      console.log("");
      console.log("==================================================================");
      console.log("  SAFEGUARD APD — DEFAULT ADMIN PASSWORD (display once, not saved)");
      console.log("==================================================================");
      console.log(`  Username : admin`);
      console.log(`  Password : ${tempPassword}`);
      console.log("  → mustChangePassword=true: ganti saat login pertama");
      console.log("==================================================================");
      console.log("");
    } else {
      console.log(`[seed] Skipped admin creation: ${userCount} users already exist`);
    }
  });

  console.log("[seed] Done.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("[seed] FAILED:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
