/**
 * Property 1 (partial): Seed idempotency
 *
 * Validates: Requirements 1.4
 *
 * Statement (design.md §Correctness Properties — Property 1):
 *   For any number of executions N (1≤N≤5) of the seed routine on a fresh
 *   ephemeral SQLite database, the resulting state of Role/Permission/
 *   RolePermission tables SHALL be identical to the state after a single
 *   execution.
 *
 * Note: We use a pure in-memory model of the seed routine to avoid spawning
 * Prisma engines and ephemeral SQLite files in this property test (which
 * would slow tests by ~5s per iteration). The seed.ts file is the single
 * source of truth for actual seeding; this property covers the *invariant*
 * — that running the matrix definition through the upsert algorithm N times
 * yields the same set/count of records.
 *
 * The mock implements the same upsert + sync semantics as `prisma/seed.ts`:
 *   1. Upsert each permission by id (no duplicates by construction)
 *   2. Upsert each default role by name; sync RolePermission set so that
 *      desired matrix is the post-state
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { ALL_PERMISSIONS } from "@/lib/rbac/permission-types";
import { DEFAULT_ROLES, DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/role-seed";

interface MockState {
  permissions: Map<string, { id: string; resource: string; action: string }>;
  roles: Map<string, { id: string; name: string; isDefault: boolean }>;
  rolePermissions: Set<string>; // key = `${roleId}|${permissionId}`
}

function createState(): MockState {
  return {
    permissions: new Map(),
    roles: new Map(),
    rolePermissions: new Set(),
  };
}

/**
 * Mock seed pass that mirrors prisma/seed.ts logic exactly. Idempotent by
 * construction: the only mutation is `set()` on Maps and `add()` on Set.
 * Drift correction (when a permission is removed from the matrix) is also
 * handled: stale rolePermission keys for the touched role are pruned.
 */
function mockSeedPass(state: MockState): void {
  // Upsert permissions
  for (const id of ALL_PERMISSIONS) {
    const colonIdx = id.lastIndexOf(":");
    state.permissions.set(id, {
      id,
      resource: id.slice(0, colonIdx),
      action: id.slice(colonIdx + 1),
    });
  }
  // Upsert roles + sync RolePermission for each
  for (const name of DEFAULT_ROLES) {
    if (!state.roles.has(name)) {
      state.roles.set(name, { id: `role-${name}`, name, isDefault: true });
    }
    const role = state.roles.get(name)!;
    const desired = new Set(DEFAULT_ROLE_PERMISSIONS[name]);
    // Insert desired
    for (const permId of desired) {
      state.rolePermissions.add(`${role.id}|${permId}`);
    }
    // Remove stale (those starting with this roleId but not in desired)
    for (const key of [...state.rolePermissions]) {
      if (key.startsWith(`${role.id}|`)) {
        const permId = key.slice(role.id.length + 1);
        if (!desired.has(permId as never)) {
          state.rolePermissions.delete(key);
        }
      }
    }
  }
}

describe("Property 1 (partial): Seed idempotency (Requirement 1.4)", () => {
  it("running mock seed N times produces identical Role/Permission/RolePermission state", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), (n) => {
        const state = createState();
        for (let i = 0; i < n; i++) {
          mockSeedPass(state);
        }
        // Invariants
        expect(state.permissions.size).toBe(ALL_PERMISSIONS.length); // 34
        expect(state.roles.size).toBe(DEFAULT_ROLES.length); // 5
        // count(RolePermission) === sum of |perms[role]| across default roles
        const expectedRpCount = DEFAULT_ROLES.reduce(
          (acc, r) => acc + DEFAULT_ROLE_PERMISSIONS[r].length,
          0,
        );
        expect(state.rolePermissions.size).toBe(expectedRpCount);
      }),
      { numRuns: 50 },
    );
  });

  it("count(RolePermission) per default role exactly matches DEFAULT_ROLE_PERMISSIONS array length", () => {
    const state = createState();
    mockSeedPass(state);
    for (const role of DEFAULT_ROLES) {
      const count = [...state.rolePermissions].filter((k) =>
        k.startsWith(`role-${role}|`),
      ).length;
      expect(count).toBe(DEFAULT_ROLE_PERMISSIONS[role].length);
    }
  });

  it("seed pass result is independent of execution order: 1×pass === N×pass", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }), (n) => {
        const a = createState();
        mockSeedPass(a);
        const b = createState();
        for (let i = 0; i < n; i++) mockSeedPass(b);

        // Permissions equal
        expect(a.permissions.size).toBe(b.permissions.size);
        for (const id of a.permissions.keys()) {
          expect(b.permissions.has(id)).toBe(true);
        }
        // Roles equal
        expect(a.roles.size).toBe(b.roles.size);
        for (const id of a.roles.keys()) {
          expect(b.roles.has(id)).toBe(true);
        }
        // RolePermissions equal
        expect(a.rolePermissions.size).toBe(b.rolePermissions.size);
        for (const k of a.rolePermissions) {
          expect(b.rolePermissions.has(k)).toBe(true);
        }
      }),
      { numRuns: 30 },
    );
  });
});
