/**
 * Property 6: Sector data isolation invariant
 *
 * Validates: Requirements 7.4, 8.1, 8.2, 8.3
 *
 * Statement (design.md §Correctness Properties — Property 6):
 *   For any User dengan role ∈ {Supervisor, PIC_Sektor} dan Sector_Assignment
 *   S = {s1, ..., sn}, dan untuk any state Database_Layer berisi Node/Violation
 *   dengan sektorId arbitrer:
 *     1. Query list mengembalikan hanya record dengan `sektorId ∈ S`.
 *     2. Single resource luar scope → 404 (bukan 403, mencegah enumerasi).
 *     3. PUT/DELETE luar scope → 404 sebelum business logic.
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  applySectorScope,
  assertSectorAccess,
  isSectorScopedRole,
} from "@/lib/rbac/sector-scope";

const sektorIdArb = fc
  .string({ minLength: 2, maxLength: 6 })
  .filter((s) => /^[A-Za-z0-9-]+$/.test(s));

describe("Property 6: Sector data isolation invariant (Requirements 7.4, 8.1-8.3)", () => {
  // 6.1 — applySectorScope adds `sektorId IN (ctx.sectorIds)` for scoped roles
  it("applySectorScope adds sektorId IN filter when ctx.sectorIds is array", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(sektorIdArb, { minLength: 0, maxLength: 5 }),
        (sectorIds) => {
          const where = { enabled: true };
          const got = applySectorScope(where, { sectorIds });
          expect(got).toEqual({ enabled: true, sektorId: { in: sectorIds } });
        },
      ),
      { numRuns: 200 },
    );
  });

  it("applySectorScope is no-op when ctx.sectorIds is null", () => {
    const where = { enabled: true, foo: "bar" };
    expect(applySectorScope(where, { sectorIds: null })).toEqual(where);
  });

  // 6.2 — Single-resource access decision matches assertSectorAccess
  it("assertSectorAccess returns true iff ctx.sectorIds is null OR contains the resource sektorId", () => {
    fc.assert(
      fc.property(
        sektorIdArb,
        fc.uniqueArray(sektorIdArb, { minLength: 0, maxLength: 5 }),
        fc.boolean(),
        (resourceSektorId, sectorIds, useNull) => {
          const ctx = useNull ? { sectorIds: null } : { sectorIds };
          const got = assertSectorAccess(resourceSektorId, ctx);
          if (useNull) expect(got).toBe(true);
          else expect(got).toBe(sectorIds.includes(resourceSektorId));
        },
      ),
      { numRuns: 300 },
    );
  });

  // 6.3 — list filter contract: filtered nodes only contain sektorId ∈ ctx.sectorIds
  it("filtered list (post applySectorScope) contains only records with sektorId ∈ ctx.sectorIds", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(sektorIdArb, { minLength: 1, maxLength: 5 }),
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 1000 }),
            sektorId: sektorIdArb,
          }),
          { maxLength: 30 },
        ),
        (sectorIds, nodes) => {
          // Simulasi: applySectorScope menyiapkan WHERE; engine SQL melakukan
          // WHERE sektorId IN (...). Kita simulasi filtering di JS:
          const where = applySectorScope({}, { sectorIds });
          const filtered = nodes.filter((n) => {
            // Replikasi `sektorId: { in: sectorIds }` dari Prisma `WhereInput`
            const whereSektor = (where as { sektorId?: { in: string[] } }).sektorId;
            if (!whereSektor) return true; // unscoped
            return whereSektor.in.includes(n.sektorId);
          });
          expect(filtered.every((n) => sectorIds.includes(n.sektorId))).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("isSectorScopedRole: true for Supervisor & PIC_Sektor, false for others", () => {
    expect(isSectorScopedRole("Supervisor")).toBe(true);
    expect(isSectorScopedRole("PIC_Sektor")).toBe(true);
    expect(isSectorScopedRole("Super_Admin")).toBe(false);
    expect(isSectorScopedRole("Admin_K3")).toBe(false);
    expect(isSectorScopedRole("Auditor")).toBe(false);
    expect(isSectorScopedRole("CustomRole")).toBe(false);
  });
});
