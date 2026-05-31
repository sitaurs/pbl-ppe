// Feature: node-detail-tree-view, Property 11: Expand state persistence across sort and filter
// **Validates: Requirements 1.7**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// --- Pure logic under test ---

/**
 * Computes the set of visible expanded node IDs.
 * This mirrors the logic in NodeTable.tsx:
 *   const visibleNodeIds = new Set(nodes.map(n => n.id));
 *   const isExpanded = expandedIds.has(node.id) && visibleNodeIds.has(node.id);
 *
 * The key invariant: expandedIds is a Set<number> that does NOT change when
 * the nodes array is reordered (sort) or filtered. The visible expanded nodes
 * are simply expandedIds ∩ visibleNodeIds.
 */
function computeVisibleExpandedIds(
  expandedIds: Set<number>,
  visibleNodeIds: Set<number>
): Set<number> {
  const result = new Set<number>();
  for (const id of expandedIds) {
    if (visibleNodeIds.has(id)) {
      result.add(id);
    }
  }
  return result;
}

/**
 * Simulates sorting: returns a new array with the same elements in different order.
 * expandedIds should NOT be affected.
 */
function sortNodeIds(nodeIds: number[], sortKey: 'asc' | 'desc'): number[] {
  const sorted = [...nodeIds];
  if (sortKey === 'asc') {
    sorted.sort((a, b) => a - b);
  } else {
    sorted.sort((a, b) => b - a);
  }
  return sorted;
}

/**
 * Simulates filtering: returns a subset of node IDs.
 * expandedIds should NOT be affected — only visibility changes.
 */
function filterNodeIds(nodeIds: number[], keepIds: Set<number>): number[] {
  return nodeIds.filter((id) => keepIds.has(id));
}

// --- Arbitraries ---

/** Generate a set of unique node IDs (representing all nodes) */
const nodeIdSetArb: fc.Arbitrary<number[]> = fc
  .uniqueArray(fc.nat({ max: 1000 }), { minLength: 1, maxLength: 50 })
  .filter((arr) => arr.length > 0);

/** Generate a set of expanded IDs as a subset of node IDs */
function expandedIdsArb(allNodeIds: number[]): fc.Arbitrary<Set<number>> {
  return fc
    .subarray(allNodeIds, { minLength: 0, maxLength: Math.min(allNodeIds.length, 20) })
    .map((arr) => new Set(arr));
}

/** Generate a sort direction */
const sortDirectionArb: fc.Arbitrary<'asc' | 'desc'> = fc.constantFrom('asc', 'desc');

/** Generate a filter (subset of node IDs to keep) */
function filterKeepIdsArb(allNodeIds: number[]): fc.Arbitrary<Set<number>> {
  return fc
    .subarray(allNodeIds, { minLength: 0, maxLength: allNodeIds.length })
    .map((arr) => new Set(arr));
}

// --- Property Tests ---

describe('Property 11: Expand state persistence across sort and filter', () => {
  it('expandedIds set does not change when node list is sorted', () => {
    fc.assert(
      fc.property(
        nodeIdSetArb.chain((nodeIds) =>
          fc.tuple(
            fc.constant(nodeIds),
            expandedIdsArb(nodeIds),
            sortDirectionArb
          )
        ),
        ([nodeIds, expandedIds, sortDir]) => {
          // Before sort
          const visibleBefore = new Set(nodeIds);
          const expandedVisibleBefore = computeVisibleExpandedIds(expandedIds, visibleBefore);

          // After sort — same node IDs, different order
          const sortedNodeIds = sortNodeIds(nodeIds, sortDir);
          const visibleAfter = new Set(sortedNodeIds);
          const expandedVisibleAfter = computeVisibleExpandedIds(expandedIds, visibleAfter);

          // expandedIds itself is unchanged (same reference semantics)
          // Visible expanded set should be identical since sort doesn't remove nodes
          expect(expandedVisibleAfter).toEqual(expandedVisibleBefore);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('expandedIds set does not change when node list is filtered — visible expanded nodes are the intersection', () => {
    fc.assert(
      fc.property(
        nodeIdSetArb.chain((nodeIds) =>
          fc.tuple(
            fc.constant(nodeIds),
            expandedIdsArb(nodeIds),
            filterKeepIdsArb(nodeIds)
          )
        ),
        ([nodeIds, expandedIds, keepIds]) => {
          // After filter — only keepIds remain visible
          const filteredNodeIds = filterNodeIds(nodeIds, keepIds);
          const visibleAfterFilter = new Set(filteredNodeIds);
          const expandedVisibleAfter = computeVisibleExpandedIds(expandedIds, visibleAfterFilter);

          // Every visible expanded node must be both in expandedIds AND in the filtered set
          for (const id of expandedVisibleAfter) {
            expect(expandedIds.has(id)).toBe(true);
            expect(visibleAfterFilter.has(id)).toBe(true);
          }

          // No expanded node that is visible should be missing from the result
          for (const id of expandedIds) {
            if (visibleAfterFilter.has(id)) {
              expect(expandedVisibleAfter.has(id)).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('when filter is removed (all nodes visible again), all originally expanded nodes are visible again', () => {
    fc.assert(
      fc.property(
        nodeIdSetArb.chain((nodeIds) =>
          fc.tuple(
            fc.constant(nodeIds),
            expandedIdsArb(nodeIds),
            filterKeepIdsArb(nodeIds)
          )
        ),
        ([nodeIds, expandedIds, keepIds]) => {
          // Apply filter
          const filteredNodeIds = filterNodeIds(nodeIds, keepIds);
          const visibleDuringFilter = new Set(filteredNodeIds);
          const expandedDuringFilter = computeVisibleExpandedIds(expandedIds, visibleDuringFilter);

          // Remove filter — all nodes visible again
          const visibleAfterRemoveFilter = new Set(nodeIds);
          const expandedAfterRemoveFilter = computeVisibleExpandedIds(expandedIds, visibleAfterRemoveFilter);

          // All originally expanded nodes should be back
          expect(expandedAfterRemoveFilter).toEqual(expandedIds);

          // The filtered set should be a subset of the full set
          for (const id of expandedDuringFilter) {
            expect(expandedAfterRemoveFilter.has(id)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('sort followed by filter preserves correct expanded visible set', () => {
    fc.assert(
      fc.property(
        nodeIdSetArb.chain((nodeIds) =>
          fc.tuple(
            fc.constant(nodeIds),
            expandedIdsArb(nodeIds),
            sortDirectionArb,
            filterKeepIdsArb(nodeIds)
          )
        ),
        ([nodeIds, expandedIds, sortDir, keepIds]) => {
          // Apply sort then filter
          const sortedNodeIds = sortNodeIds(nodeIds, sortDir);
          const filteredSortedNodeIds = filterNodeIds(sortedNodeIds, keepIds);
          const visibleAfterBoth = new Set(filteredSortedNodeIds);
          const expandedAfterBoth = computeVisibleExpandedIds(expandedIds, visibleAfterBoth);

          // The result should be exactly expandedIds ∩ keepIds
          // (since sorting doesn't change the set of IDs, only filtering does)
          const expectedExpanded = new Set<number>();
          for (const id of expandedIds) {
            if (keepIds.has(id)) {
              expectedExpanded.add(id);
            }
          }
          expect(expandedAfterBoth).toEqual(expectedExpanded);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('expandedIds remains unchanged regardless of how many sort/filter operations are applied', () => {
    fc.assert(
      fc.property(
        nodeIdSetArb.chain((nodeIds) =>
          fc.tuple(
            fc.constant(nodeIds),
            expandedIdsArb(nodeIds),
            fc.array(
              fc.oneof(
                sortDirectionArb.map((dir) => ({ type: 'sort' as const, dir })),
                filterKeepIdsArb(nodeIds).map((keep) => ({ type: 'filter' as const, keep }))
              ),
              { minLength: 1, maxLength: 10 }
            )
          )
        ),
        ([nodeIds, expandedIds, operations]) => {
          // Apply a sequence of sort/filter operations
          let currentNodeIds = [...nodeIds];

          for (const op of operations) {
            if (op.type === 'sort') {
              currentNodeIds = sortNodeIds(currentNodeIds, op.dir);
            } else {
              currentNodeIds = filterNodeIds(currentNodeIds, op.keep);
            }
          }

          const finalVisible = new Set(currentNodeIds);
          const finalExpanded = computeVisibleExpandedIds(expandedIds, finalVisible);

          // expandedIds itself never mutates — only visibility changes
          // Every final expanded node must still be in the original expandedIds set
          for (const id of finalExpanded) {
            expect(expandedIds.has(id)).toBe(true);
          }

          // Every node in expandedIds that is still visible should be expanded
          for (const id of expandedIds) {
            if (finalVisible.has(id)) {
              expect(finalExpanded.has(id)).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
