/**
 * Permission identifier union and role definitions.
 *
 * Mirrors the 34-permission catalog from `design.md §Permission Map Structure`
 * and Requirement 6.1. The `ALL_PERMISSIONS` array preserves the exact
 * declaration order of the union so that seed scripts and tests can iterate
 * deterministically.
 */

export type PermissionId =
  | "node:create" | "node:read" | "node:update" | "node:delete"
  | "node:toggle" | "node:test-connection"
  | "violation:read" | "violation:acknowledge" | "violation:export" | "violation:delete"
  | "report:read" | "report:generate" | "report:export"
  | "live:view"
  | "sector:create" | "sector:read" | "sector:update" | "sector:delete" | "sector:assign-pic"
  | "setting:read" | "setting:update:branding" | "setting:update:notification" | "setting:update:system"
  | "user:create" | "user:read" | "user:update" | "user:delete" | "user:reset-password"
  | "role:create" | "role:read" | "role:update" | "role:delete" | "role:assign-permission"
  | "audit-log:read";

/**
 * Master list of every PermissionId. Used by the seed script (Requirement 6.1)
 * and by property tests that exhaustively enumerate the permission space.
 */
export const ALL_PERMISSIONS: PermissionId[] = [
  "node:create", "node:read", "node:update", "node:delete",
  "node:toggle", "node:test-connection",
  "violation:read", "violation:acknowledge", "violation:export", "violation:delete",
  "report:read", "report:generate", "report:export",
  "live:view",
  "sector:create", "sector:read", "sector:update", "sector:delete", "sector:assign-pic",
  "setting:read", "setting:update:branding", "setting:update:notification", "setting:update:system",
  "user:create", "user:read", "user:update", "user:delete", "user:reset-password",
  "role:create", "role:read", "role:update", "role:delete", "role:assign-permission",
  "audit-log:read",
];

/**
 * Names of the five default roles seeded at boot. The seed script enforces
 * `Role.isDefault=true` for each of these so that they cannot be deleted or
 * renamed (Requirement 6.4).
 */
export type DefaultRoleName =
  | "Super_Admin"
  | "Admin_K3"
  | "Supervisor"
  | "PIC_Sektor"
  | "Auditor";

export const DEFAULT_ROLES: DefaultRoleName[] = [
  "Super_Admin",
  "Admin_K3",
  "Supervisor",
  "PIC_Sektor",
  "Auditor",
];
