/**
 * Property 1: Migration round-trip + idempotency
 *
 * Validates: Requirements 1.5, 2.1, 2.3, 2.4, 2.5
 *
 * Statement (design.md §Correctness Properties — Property 1):
 *   For any combination of valid input JSON (db.json + violations.json +
 *   settings.json) and any number of executions N (1≤N≤5) of the migration
 *   routine, the final state of Node, Violation, and Setting tables SHALL be
 *   identical to the state after a single execution AND preserve all flat
 *   fields (id, sektorId, sektorName, picName, picPhone, cameraSource,
 *   enabled) AND nested objects (camera, esp32, detection).
 *
 * Implementation note:
 *   This test models the upsert pipeline of `scripts/migrate-json-to-db.ts`
 *   in pure memory (Map<id, NodeRow>, Map<id, ViolationRow>, Map<key, string>)
 *   so the property doesn't have to spawn Prisma engines or ephemeral SQLite
 *   files inside fast-check loops. The same `migrateNode()` from the
 *   node-detail-tree-view spec is reused — the only behaviour that the in-
 *   memory model approximates is the upsert-by-id semantics. This is the
 *   critical contract for idempotency, so the property covers it directly.
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { createHash } from "node:crypto";
import { migrateNode } from "@/lib/node-migration";

// --- In-memory upsert model --------------------------------------------

interface NodeRow {
  id: number;
  sektorId: string;
  sektorName: string;
  picName: string;
  picPhone: string;
  cameraSource: string;
  enabled: boolean;
  camera: string | null;     // JSON-serialized
  esp32: string | null;
  detection: string | null;
}

interface ViolationRow {
  id: string;
  timestamp: string;
  nodeId: number;
  sektorId: string;
  ppeMissing: string;        // JSON-serialized
  imageRef: string;
  acknowledged: boolean;
}

interface State {
  sectors: Map<string, { id: string; name: string }>;
  nodes: Map<number, NodeRow>;
  violations: Map<string, ViolationRow>;
  settings: Map<string, string>;
}

function createState(): State {
  return {
    sectors: new Map(),
    nodes: new Map(),
    violations: new Map(),
    settings: new Map(),
  };
}

function sha1Hex(s: string): string {
  return createHash("sha1").update(s, "utf8").digest("hex");
}

interface RawNodeInput {
  id: number;
  sektorId: string;
  sektorName?: string;
  picName?: string;
  picPhone?: string;
  cameraSource?: string;
  enabled?: boolean;
  camera?: unknown;
  esp32?: unknown;
  detection?: unknown;
}

interface RawViolationInput {
  id?: string | number;
  timestamp: string;
  nodeId: number;
  sektorId: string;
  ppeMissing?: string[];
  imageRef?: string;
  acknowledged?: boolean;
}

/**
 * Mirror the migration script upsert pass. Pure function, deterministic.
 */
function migrationPass(
  state: State,
  input: {
    nodes: RawNodeInput[];
    violations: RawViolationInput[];
    settings: Record<string, unknown>;
  },
): void {
  // Sectors
  const sectorMap = new Map<string, string>();
  for (const n of input.nodes) {
    if (n.sektorId) {
      const name = n.sektorName && n.sektorName.length > 0 ? n.sektorName : n.sektorId;
      sectorMap.set(n.sektorId, name);
    }
  }
  for (const [id, name] of sectorMap) {
    state.sectors.set(id, { id, name });
  }
  // Nodes
  for (const raw of input.nodes) {
    const migrated = migrateNode({ ...raw, id: raw.id });
    state.nodes.set(raw.id, {
      id: raw.id,
      sektorId: migrated.sektorId,
      sektorName: migrated.sektorName ?? "",
      picName: migrated.picName ?? "",
      picPhone: migrated.picPhone ?? "",
      cameraSource: migrated.cameraSource ?? "",
      enabled: migrated.enabled ?? true,
      camera: migrated.camera ? JSON.stringify(migrated.camera) : null,
      esp32: migrated.esp32 ? JSON.stringify(migrated.esp32) : null,
      detection: migrated.detection ? JSON.stringify(migrated.detection) : null,
    });
  }
  // Violations
  for (const v of input.violations) {
    const idStr =
      v.id !== undefined
        ? String(v.id)
        : sha1Hex(`${v.timestamp}|${v.nodeId}|${v.imageRef ?? ""}`).slice(0, 32);
    state.violations.set(idStr, {
      id: idStr,
      timestamp: v.timestamp,
      nodeId: v.nodeId,
      sektorId: v.sektorId,
      ppeMissing: JSON.stringify(v.ppeMissing ?? []),
      imageRef: v.imageRef ?? "",
      acknowledged: v.acknowledged ?? false,
    });
  }
  // Settings
  for (const [key, value] of Object.entries(input.settings)) {
    state.settings.set(key, JSON.stringify(value));
  }
}

// --- Generators --------------------------------------------------------

const sektorIdArb = fc.string({ minLength: 2, maxLength: 6 }).filter((s) => /^[A-Za-z0-9-]+$/.test(s));

const cameraConfigArb = fc.record({
  url: fc.string({ minLength: 1, maxLength: 32 }),
  resolution: fc.constantFrom("640x480", "1280x720", "1920x1080"),
  protocol: fc.constantFrom("rtsp", "http", "local"),
});

const esp32ConfigArb = fc.record({
  mqttTopic: fc.string({ minLength: 0, maxLength: 32 }),
  mqttBroker: fc.string({ minLength: 0, maxLength: 32 }),
  enabled: fc.boolean(),
});

const detectionConfigArb = fc.record({
  mode: fc.constantFrom("realtime", "scheduled", "disabled"),
  confidenceThreshold: fc.float({
    min: Math.fround(0.1),
    max: Math.fround(1.0),
    noNaN: true,
  }),
});

const flatNodeArb = fc.record({
  id: fc.integer({ min: 1, max: 1_000_000 }),
  sektorId: sektorIdArb,
  sektorName: fc.string({ minLength: 1, maxLength: 24 }),
  picName: fc.string({ minLength: 0, maxLength: 24 }),
  picPhone: fc.string({ minLength: 0, maxLength: 20 }),
  cameraSource: fc.string({ minLength: 0, maxLength: 32 }),
  enabled: fc.boolean(),
});

const extendedNodeArb = fc.record({
  id: fc.integer({ min: 1, max: 1_000_000 }),
  sektorId: sektorIdArb,
  sektorName: fc.string({ minLength: 1, maxLength: 24 }),
  picName: fc.string({ minLength: 0, maxLength: 24 }),
  picPhone: fc.string({ minLength: 0, maxLength: 20 }),
  cameraSource: fc.string({ minLength: 0, maxLength: 32 }),
  enabled: fc.boolean(),
  camera: cameraConfigArb,
  esp32: esp32ConfigArb,
  detection: detectionConfigArb,
});

const nodesArb = fc
  .array(fc.oneof(flatNodeArb, extendedNodeArb), { minLength: 0, maxLength: 12 })
  .map((arr) => {
    // Dedupe by id (last wins)
    const map = new Map<number, RawNodeInput>();
    for (const n of arr) map.set(n.id, n);
    return [...map.values()];
  });

const settingsArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 16 }).filter((s) => /^[a-zA-Z0-9_.-]+$/.test(s)),
  fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
  { minKeys: 0, maxKeys: 6 },
) as fc.Arbitrary<Record<string, unknown>>;

// --- Properties --------------------------------------------------------

describe("Property 1: Migration round-trip + idempotency (Reqs 1.5, 2.1, 2.3, 2.4, 2.5)", () => {
  it("After N runs (1..5), Node table state matches single-run state and preserves flat+nested fields", () => {
    fc.assert(
      fc.property(
        nodesArb,
        fc.integer({ min: 1, max: 5 }),
        (rawNodes, n) => {
          // Build violations bound to existing nodes/sektors so foreign-key
          // constraints would be satisfiable by Prisma.
          const violations: RawViolationInput[] = rawNodes.length === 0
            ? []
            : rawNodes.slice(0, Math.min(rawNodes.length, 4)).map((node, i) => ({
                id: `v-${node.id}-${i}`,
                timestamp: new Date(2026, 0, 1 + i).toISOString(),
                nodeId: node.id,
                sektorId: node.sektorId,
                ppeMissing: ["helmet"],
                imageRef: `img-${i}.png`,
                acknowledged: false,
              }));

          const state = createState();
          for (let i = 0; i < n; i++) {
            migrationPass(state, { nodes: rawNodes, violations, settings: {} });
          }

          // Idempotency: counts match input
          expect(state.nodes.size).toBe(rawNodes.length);
          expect(state.violations.size).toBe(violations.length);

          // Flat fields preserved
          for (const raw of rawNodes) {
            const stored = state.nodes.get(raw.id);
            expect(stored).toBeDefined();
            expect(stored!.id).toBe(raw.id);
            expect(stored!.sektorId).toBe(raw.sektorId);
            expect(stored!.sektorName).toBe(raw.sektorName ?? "");
            expect(stored!.picName).toBe(raw.picName ?? "");
            expect(stored!.picPhone).toBe(raw.picPhone ?? "");
            expect(stored!.cameraSource).toBe(raw.cameraSource ?? "");
            expect(stored!.enabled).toBe(raw.enabled ?? true);

            // Nested fields preserved (or defaulted via migrateNode)
            // Note: legacy flat-only nodes get defaults created by migrateNode
            const migrated = migrateNode({ ...raw });
            if (migrated.camera) {
              expect(stored!.camera).not.toBeNull();
              expect(JSON.parse(stored!.camera as string)).toEqual(migrated.camera);
            }
            if (migrated.esp32) {
              expect(stored!.esp32).not.toBeNull();
              expect(JSON.parse(stored!.esp32 as string)).toEqual(migrated.esp32);
            }
            if (migrated.detection) {
              expect(stored!.detection).not.toBeNull();
              expect(JSON.parse(stored!.detection as string)).toEqual(migrated.detection);
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it("After N runs, Setting table state matches single-run state (preserves last-wins semantics)", () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.integer({ min: 1, max: 5 }),
        (settings, n) => {
          const state = createState();
          for (let i = 0; i < n; i++) {
            migrationPass(state, { nodes: [], violations: [], settings });
          }
          expect(state.settings.size).toBe(Object.keys(settings).length);
          for (const [k, v] of Object.entries(settings)) {
            expect(state.settings.get(k)).toBe(JSON.stringify(v));
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it("Idempotency: state after N runs equals state after 1 run", () => {
    fc.assert(
      fc.property(
        nodesArb,
        settingsArb,
        fc.integer({ min: 2, max: 5 }),
        (rawNodes, settings, n) => {
          const violations: RawViolationInput[] = rawNodes.slice(0, 3).map((node, i) => ({
            id: `v-${node.id}-${i}`,
            timestamp: new Date(2026, 0, 1 + i).toISOString(),
            nodeId: node.id,
            sektorId: node.sektorId,
            ppeMissing: ["helmet"],
            imageRef: `img-${i}.png`,
            acknowledged: false,
          }));

          const a = createState();
          migrationPass(a, { nodes: rawNodes, violations, settings });
          const b = createState();
          for (let i = 0; i < n; i++) {
            migrationPass(b, { nodes: rawNodes, violations, settings });
          }
          expect(a.nodes.size).toBe(b.nodes.size);
          expect(a.violations.size).toBe(b.violations.size);
          expect(a.settings.size).toBe(b.settings.size);
          for (const [k, v] of a.nodes) {
            expect(b.nodes.get(k)).toEqual(v);
          }
          for (const [k, v] of a.violations) {
            expect(b.violations.get(k)).toEqual(v);
          }
          for (const [k, v] of a.settings) {
            expect(b.settings.get(k)).toBe(v);
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
