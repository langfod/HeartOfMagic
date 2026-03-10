# Performance Audit: Critical Phase Progress

**Started:** 2026-03-09
**Scope:** PERF-C1 through PERF-C4 (4 critical findings)

## Tasks

| ID | Description | Status | Files Changed |
|----|-------------|--------|---------------|
| PERF-C2 | Cache `detectSpellElement` results | DONE | `edgeScoring.js` |
| PERF-C4 | Extract shared `simulateUnlocks` (Kahn's O(V+E)) | DONE | `treeParser.js` |
| PERF-C3 | Spatial hashing for `resolveOverlaps` | DONE | `layoutEngineBehavior.js`, `layoutGenerator.js` |
| PERF-C1 | Eliminate per-frame WebGL buffer alloc | DONE | `webglRendererDraw.js`, `webglRendererBuffers.js`, `webglRenderer.js` |

## Verification

- JS tests: 111 passed, 4 failed (all 4 pre-existing, unrelated to changes)
- Build: All 3 DLLs compiled successfully (SpellLearning.dll, DontEatSpellTomes.dll, SL_BookXP.dll)

## Change Summary

### PERF-C2: Element Detection Cache
- Added `_elementCache` (plain object, keyed by formId) to `edgeScoring.js`
- All `detectSpellElement` return paths store results in cache
- Added `clearElementCache()` on `EdgeScoring` namespace for tree rebuilds
- Eliminates ~85% of redundant text processing during tree generation

### PERF-C4: Kahn's-Style Unlock Simulation
- Extracted module-scope `_simulateUnlocks(rootId, schoolNodeIds, nodes)` function
- Uses queue-based propagation (Kahn's pattern) instead of fixpoint iteration
- Replaced duplicate inner `simulateUnlocks` in both `detectAndFixCycles` and `getUnreachableNodesInfo`
- Complexity: O(V+E) instead of O(n^2) worst case

### PERF-C3: Spatial Hash for Overlap Resolution
- Both `layoutEngineBehavior.js:resolveOverlaps` and `layoutGenerator.js` overlap loop now use spatial hashing
- Grid cell size = `minSpacing`, 3x3 neighborhood query per node
- Hash rebuilt each iteration (positions shift after pushes)
- Complexity: O(n) amortized per iteration instead of O(n^2)

### PERF-C1: WebGL Buffer Caching
- `updateNodeBuffer` now builds `_perShapeInstances` (per-shape Float32Array + GL buffer)
- `renderNodes` uses pre-built per-shape buffers instead of creating/destroying temp buffers per frame
- Added `_nodeDataDirty` flag — only rebuilds when hover/select/data changes, not on pan/zoom
- Added `_colorCache` on `getNodeColor` (keyed by school:state:discoveryMode)
- GL buffers are reused across rebuilds, only deleted when shapes disappear
