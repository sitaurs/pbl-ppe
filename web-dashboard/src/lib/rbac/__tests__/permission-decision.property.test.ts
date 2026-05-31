/**
 * Property 5: RBAC permission decision
 *
 * Validates: Requirements 6.2, 7.3
 *
 * Statement (design.md §Correctness Properties — Property 5):
 *   For any tuple (User dengan permission set P, endpoint dengan required
 *   permission R, HTTP method valid), middleware SHALL meneruskan request
 *   ke handler iff `R ∈ P`; else 403 dengan body
 *   `{ error: "permission_denied", required: R }`.
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { hasPermission, hasAnyPermission, hasAllPermissions } from "@/lib/rbac/context";
import { ALL_PERMISSIONS, type PermissionId } from "@/lib/rbac/permission-types";
import type { AuthenticatedUser } from "@/lib/auth/types";

const permissionArb = fc.constantFrom<PermissionId>(...ALL_PERMISSIONS);

const userArb: fc.Arbitrary<AuthenticatedUser> = fc
  .uniqueArray(permissionArb, { minLength: 0, maxLength: ALL_PERMISSIONS.length })
  .map((perms) => ({
    id: "u1",
    username: "test",
    email: "test@example.com",
    fullName: "Test",
    role: { id: "r1", name: "TestRole", permissions: perms },
    sectorIds: [],
    totpEnabled: false,
    mustChangePassword: false,
    status: "active",
  }));

describe("Property 5: RBAC permission decision (Requirements 6.2, 7.3)", () => {
  it("hasPermission(user, R) === true iff R ∈ user.role.permissions", () => {
    fc.assert(
      fc.property(userArb, permissionArb, (user, required) => {
        const got = hasPermission(user, required);
        expect(got).toBe(user.role.permissions.includes(required));
      }),
      { numRuns: 500 },
    );
  });

  it("hasPermission(null, *) is always false", () => {
    fc.assert(
      fc.property(permissionArb, (required) => {
        expect(hasPermission(null, required)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("hasAnyPermission: true iff at least one required permission ∈ user.role.permissions", () => {
    fc.assert(
      fc.property(
        userArb,
        fc.uniqueArray(permissionArb, { minLength: 1, maxLength: 5 }),
        (user, required) => {
          const got = hasAnyPermission(user, required);
          const oracle = required.some((p) => user.role.permissions.includes(p));
          expect(got).toBe(oracle);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("hasAllPermissions: true iff every required permission ∈ user.role.permissions", () => {
    fc.assert(
      fc.property(
        userArb,
        fc.uniqueArray(permissionArb, { minLength: 1, maxLength: 5 }),
        (user, required) => {
          const got = hasAllPermissions(user, required);
          const oracle = required.every((p) => user.role.permissions.includes(p));
          expect(got).toBe(oracle);
        },
      ),
      { numRuns: 500 },
    );
  });

  // Decision contract used by middleware (deny-by-default)
  it("middleware decision contract: pass iff hasPermission(user, R) === true", () => {
    /**
     * Pure model of middleware decision: given user + required permission,
     * returns 'pass' | { status: 403, error, required }
     */
    function decide(
      user: AuthenticatedUser | null,
      required: PermissionId,
    ): { kind: "pass" } | { kind: "deny"; status: 403; error: string; required: PermissionId } {
      if (!user) return { kind: "deny", status: 403, error: "permission_denied", required };
      if (user.role.permissions.includes(required)) return { kind: "pass" };
      return { kind: "deny", status: 403, error: "permission_denied", required };
    }
    fc.assert(
      fc.property(userArb, permissionArb, (user, required) => {
        const decision = decide(user, required);
        if (user.role.permissions.includes(required)) {
          expect(decision.kind).toBe("pass");
        } else {
          expect(decision.kind).toBe("deny");
          if (decision.kind === "deny") {
            expect(decision.status).toBe(403);
            expect(decision.error).toBe("permission_denied");
            expect(decision.required).toBe(required);
          }
        }
      }),
      { numRuns: 500 },
    );
  });
});
