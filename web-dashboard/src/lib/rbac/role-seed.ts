/**
 * Default role → permissions matrix used by the seed script.
 *
 * Mirrors `design.md §Permission Matrix (Default)` exactly. Counts per role
 * are validated by `prisma/__tests__/seed.property.test.ts` (Property 1) so
 * any drift between this file and the design doc surfaces immediately.
 *
 * Counts (cross-checked against design.md table):
 *   Super_Admin: 34 (all permissions)
 *   Admin_K3:    23 (all except user:*, role:*, setting:update:system)
 *   Supervisor:   9
 *   PIC_Sektor:   4
 *   Auditor:      8
 *
 * Validates: Requirements 6.1, 6.2.
 */

import type { DefaultRoleName, PermissionId } from "@/lib/rbac/permission-types";
import { DEFAULT_ROLES } from "@/lib/rbac/permission-types";

export { DEFAULT_ROLES };

export const DEFAULT_ROLE_PERMISSIONS: Record<DefaultRoleName, PermissionId[]> = {
  Super_Admin: [
    "node:create", "node:read", "node:update", "node:delete", "node:toggle", "node:test-connection",
    "violation:read", "violation:acknowledge", "violation:export", "violation:delete",
    "report:read", "report:generate", "report:export",
    "live:view",
    "sector:create", "sector:read", "sector:update", "sector:delete", "sector:assign-pic",
    "setting:read", "setting:update:branding", "setting:update:notification", "setting:update:system",
    "user:create", "user:read", "user:update", "user:delete", "user:reset-password",
    "role:create", "role:read", "role:update", "role:delete", "role:assign-permission",
    "audit-log:read",
  ],
  Admin_K3: [
    "node:create", "node:read", "node:update", "node:delete", "node:toggle", "node:test-connection",
    "violation:read", "violation:acknowledge", "violation:export", "violation:delete",
    "report:read", "report:generate", "report:export",
    "live:view",
    "sector:create", "sector:read", "sector:update", "sector:delete", "sector:assign-pic",
    "setting:read", "setting:update:branding", "setting:update:notification",
    "audit-log:read",
  ],
  Supervisor: [
    "node:read", "node:toggle", "node:test-connection",
    "violation:read", "violation:acknowledge",
    "report:read", "report:generate",
    "live:view",
    "sector:read",
  ],
  PIC_Sektor: [
    "node:read",
    "violation:read",
    "report:read",
    "sector:read",
  ],
  Auditor: [
    "node:read",
    "violation:read", "violation:export",
    "report:read", "report:export",
    "sector:read",
    "setting:read",
    "audit-log:read",
  ],
};

/** Helper: get default role description for seeding */
export const DEFAULT_ROLE_DESCRIPTIONS: Record<DefaultRoleName, string> = {
  Super_Admin: "Pemilik sistem / IT — akses penuh termasuk manajemen User dan Role",
  Admin_K3: "Manajer K3 / Kepala Lab / Kepala Bengkel — kelola Node, Sektor, Setting notifikasi, dan laporan",
  Supervisor: "Foreman / Asisten Lab / Mekanik Senior — live monitor, acknowledge pelanggaran, baca laporan pada Sektor yang ditugaskan",
  PIC_Sektor: "PIC Area / Shift Lead — read-only data Sektor yang ditugaskan + terima notifikasi WhatsApp",
  Auditor: "Inspektur K3 eksternal / QA/QC — read-only seluruh data + ekspor laporan, tanpa hak mutasi",
};
