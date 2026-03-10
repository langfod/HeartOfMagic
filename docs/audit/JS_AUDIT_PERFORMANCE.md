# JavaScript Audit: Performance Opportunities

**Date:** 2026-03-03
**Last verified:** 2026-03-09 (all critical + high + medium-priority findings fixed)
**Scope:** `PrismaUI/views/SpellLearning/SpellLearningPanel/modules/` (~120 files, ~72k lines)

## Executive Summary

42 performance findings were identified across 10 anti-pattern categories. **All 4 critical, all 10 high-priority, and all 9 medium-priority findings have been fixed** (2026-03-09). See `PERF_HIGH_PROGRESS.md` and `PERF_MEDIUM_PROGRESS.md` for detailed change notes.

1. ~~WebGL buffer recreation every frame~~ — **FIXED**
2. ~~Missing element/theme caching in edge scoring~~ — **FIXED**
3. ~~O(n^2) overlap resolution without spatial indexing~~ — **FIXED**
4. ~~setInterval instead of requestAnimationFrame~~ — **FIXED**
5. ~~Uncached spell theme extraction in inner loops~~ — **FIXED**

---

## Critical Findings

### PERF-C1: WebGL Buffer Creation/Destruction Every Frame — FIXED

**File:** `webglRendererDraw.js` (split from original `webglRenderer.js`)

~~Inside `renderNodes()`, which runs **every frame**:~~
~~Creates new `Float32Array` per shape group per frame~~
~~Calls `gl.createBuffer()` per shape group per frame~~
~~Calls `gl.deleteBuffer()` immediately after drawing~~

**Fixed:** `updateNodeBuffer` now pre-builds `_perShapeInstances` (per-shape Float32Array + GL buffer). `renderNodes` uses cached buffers and only rebuilds when `_nodeDataDirty` is set (hover/select/data changes, not pan/zoom). `getNodeColor` results cached per school:state:discoveryMode combination.

### PERF-C2: detectSpellElement Has NO Caching — FIXED

**File:** `edgeScoring.js`

~~`detectSpellElement()` iterates ALL `ELEMENT_KEYWORDS` entries (25+ categories, ~200 keywords) with string `indexOf` per keyword. 4 calls per `scoreEdge`, ~1,700 calls redundant.~~

**Fixed:** Added `_elementCache` (plain object keyed by formId). All return paths cache results. Added `clearElementCache()` on `EdgeScoring` namespace for tree rebuilds. Eliminates ~85% of redundant text processing.

### PERF-C3: resolveOverlaps is O(n^2) with No Spatial Index — FIXED

**Files:** `layoutEngineBehavior.js` (was `layoutEngineCore.js` before split), `layoutGenerator.js`

~~O(n^2) nested for loops with no spatial indexing.~~

**Fixed:** Both overlap resolvers now use spatial hashing (grid cell size = minSpacing, 3x3 neighborhood query). Hash rebuilt per iteration. Complexity: O(n) amortized per iteration instead of O(n^2).

### PERF-C4: simulateUnlocks is O(n^2) and Duplicated — FIXED

**File:** `treeParser.js`

~~Fixpoint iteration (O(n^2) worst case), copy-pasted between two methods.~~

**Fixed:** Extracted shared `_simulateUnlocks(rootId, schoolNodeIds, nodes)` at module scope. Uses Kahn's-style queue-based propagation: O(V+E) guaranteed. Both `detectAndFixCycles` and `getUnreachableNodesInfo` call the shared function.

---

## High-Priority Findings

### PERF-H1: setInterval Instead of requestAnimationFrame — FIXED

**File:** `treeAnimation.js`

~~Both Phase 1 and Phase 2 animations use `setInterval`.~~

**Fixed:** Both phases use `requestAnimationFrame` with timestamp-based accumulator. Animation timing is decoupled from frame rate, syncs with vsync, and auto-pauses when tab is backgrounded.

### PERF-H2: getSpellThemes/calculateThematicSimilarity Called Uncached — FIXED

**File:** `vfThematic.js`, `vfEdgeBuilding.js`

~~`getSpellThemes` re-runs keyword matching against 15+ categories each call.~~

**Fixed:** Added `_spellThemeCache` keyed by formId in vfThematic.js with `clearSpellThemeCache()`. Hoisted `getSpellThemes(pos.spell)` and element extraction outside the candidate scoring loop in vfEdgeBuilding.js. Eliminates ~90% of redundant text processing.

### PERF-H3: calculateThemeScore Creates New RegExp Per Call — FIXED

**File:** `proceduralTreeCore.js`, `proceduralTreeConfig.js`

~~Creates a new RegExp object per (spell, theme) pair.~~

**Fixed:** Pre-compiled `_wordRegex` at module scope. Added `_spellTextCache` keyed by formId for `extractSpellText` results. Added `STOP_WORDS_SET` (object lookup, O(1)) alongside the array.

### PERF-H4: findBestPosition Triple-Nested Loop — FIXED

**File:** `vfHelpers.js`

~~O(groupNodes * 20 * placedNodes) distance checks.~~

**Fixed:** Added `buildSpatialHash`/`hasNearby` helpers. Both `findBestPosition` and `findFallbackPosition` use spatial hash for O(1) amortized collision checks. Squared distance comparison eliminates `Math.sqrt`.

### PERF-H5: Sitter Nudge is O(nodes x edges) — FIXED

**File:** `layoutEngineUtils.js`

~~For each node, checks every edge for proximity.~~

**Fixed:** Spatial hash of edge bounding boxes (cell size = threshold). Per-node lookup checks 3x3 cell neighborhood instead of all edges. Deduplicates via checked-index set.

### PERF-H6: connectOrphans Iterates All Nodes Per Orphan — FIXED

**File:** `proceduralTreeCore.js`

~~O(orphans * nodes) iteration.~~

**Fixed:** Pre-compute `availableByDepth` map of connected nodes with room for children. Search from target depth downward. Newly connected orphans added to the map for subsequent orphans.

### PERF-H7: addSimpleAlternatePaths O(n^2) Within Tiers — FIXED

**File:** `proceduralTreeLayout.js`

~~All same-tier nodes checked against each other with `Math.sqrt`.~~

**Fixed:** `hasOverlap` and `addSimpleAlternatePaths` use squared distance comparison (no `Math.sqrt`). Pre-computed `maxDistSq` constant.

### PERF-H8: Full BFS Per Candidate in PrereqMaster Lock Building — FIXED

**File:** `prereqMasterScoring.js`, `prereqMasterLocking.js`

~~`_isDescendant` and `_isOnlyReachableThrough` each run full BFS per candidate.~~

**Fixed:** `_isDescendant` caches full descendant set per spell via `_descendantCache` (single BFS, then O(1) lookup per candidate). `_isOnlyReachableThrough` caches reachable-without set per spell via `_reachableWithoutCache`. BFS uses index pointer instead of `queue.shift()`. Caches cleared via `_clearDescendantCache()` at start of lock evaluation.

### PERF-H9: RGBA String Concatenation Per Particle Per Frame — FIXED

**Files:** `globe3D.js`, `globe3DParticles.js`, `starfield.js`

~~200+ particles generate rgba() strings via concatenation every frame.~~

**Fixed:** Pre-compute `rgbPrefix = 'rgba(' + r + ',' + g + ',' + b + ','` once before particle loops. Starfield caches RNG closures per tile seed with `.reset()` method; prunes cache beyond 500 entries.

### PERF-H10: buildEdges Scores ALL Previous Connected Nodes — FIXED

**File:** `vfEdgeBuilding.js`

~~Late tiers invoke `getSpellThemes` 3x per candidate.~~

**Fixed:** Theme results cached per formId (PERF-H2). Current node's themes and elements hoisted outside the candidate loop. Combined with H2, eliminates most redundant computation.

---

## Medium-Priority Findings

### PERF-M1: WebGL Hover Detection Without Throttle — FIXED

**File:** `webglRenderer.js:274-297`

~~`onMouseMove` calls `getBoundingClientRect()` (can trigger layout reflow) and `findNodeAt()` on every mousemove event (60-120+ per second).~~

**Fixed:** Hover detection gated behind `requestAnimationFrame`. `getBoundingClientRect()` result cached in `_cachedRect` (invalidated on `updateCanvasSize`). Only one hover check per frame. `onWheel` and `onClick` also use cached rect.

### PERF-M2: Depth Sorting Particle Array Every Frame — FIXED

**File:** `globe3D.js:~173`

~~`Array.sort` is O(n log n) and allocates internally. 200 particles at 60fps = 12,000 sorts per second.~~

**Fixed:** Replaced with insertion sort. O(n) for nearly-sorted data — particle z-values change by at most a few positions per frame.

### PERF-M3: indexOf for Membership Checks — FIXED

**File:** `treeParser.js:179, 191, 199, 366, 369`

~~Linear search in arrays for prerequisite/children membership. Compounds to O(n*k) in loops.~~

**Fixed:** Edge existence checks use `edgeSet` object with `from>to` keys (O(1)). Orphan-fixing uses object-set membership. `updateNodeConnections` in `proceduralTreeLayout.js` uses `childSets`/`prereqSets` objects.

### PERF-M4: STOP_WORDS.indexOf in Hot Path — FIXED (High-Priority H3)

**File:** `proceduralTreeCore.js:49`

~~Linear scan per word during theme discovery. 300 spells * 10 words * 50 stop words = 150,000 comparisons.~~

**Fixed:** `STOP_WORDS_SET` object lookup (O(1)) added in high-priority H3 pass.

### PERF-M5: String Key Generation in Layout Hot Paths — FIXED

**File:** `layoutEngineRadial.js:139-151`

~~String concatenation (`tier + '_' + slotIndex`) for hash keys in BFS. 300+ nodes = 1000+ string allocations.~~

**Fixed:** `_posKey(tier, slotIndex)` helper returns `tier * 100000 + slotIndex` (numeric). All ~20 occurrences replaced.

### PERF-M6: WebGL renderNodes Recalculates ALL Node Data on View-Only Changes — FIXED (Critical C1)

**File:** `webglRendererDraw.js`

~~When only pan/zoom/rotation changes (most frames), the node instance data hasn't changed. But `renderNodes` re-groups by shape, rebuilds all Float32Arrays, and re-uploads.~~

**Fixed:** `_nodeDataDirty` flag added in critical C1 pass. Pan/zoom only sets `_needsRender`.

### PERF-M7: Stale _cachedPosMap in prereqMasterScoring — FIXED

**File:** `prereqMasterScoring.js:84-95`

~~Module-level cache never cleared. After tree regeneration, stale positions used for distance calculations.~~

**Fixed:** `_cachedPosMap` cleared inside `_clearDescendantCache()`, which runs at the start of every lock evaluation pass.

### PERF-M8: Redundant Triple-Dirty Cascade — FIXED

**File:** `treePreview.js:389-394`

~~`_markDirty()` cascades to both TreeCore AND TreeGrowth, potentially causing redundant redraws from a single interaction.~~

**Fixed:** `_markDirty(cascade)` parameter added. Pan/zoom/resize calls pass no argument (no cascade). Data/mode/settings changes pass `true` (cascades to TreeCore + TreeGrowth). Updated all 8+ external callers.

### PERF-M9: hasOverlap Linear Scan Per Placement — FIXED

**File:** `proceduralTreeLayout.js:356-369`

~~O(n) per call with up to 10 retries per node placement.~~

**Fixed:** `PlacementGrid` spatial hash class (`add`/`hasNearby`) with 3×3 cell neighborhood queries. `hasOverlap` uses grid when provided. Both `assignGridPositions` and `generateSimpleSchoolTree` create and use `PlacementGrid`. Reduces O(10n²) to O(10n).

---

## Low-Priority Findings

### PERF-L1: Dead Spreading Loop

**File:** `layoutGenerator.js:264-322`

~50 lines of O(n^2) code with `spreadIterations = 0` -- never executes. Remove dead code.

### PERF-L2: Duplicate seededRandom Implementations

3 identical copies of the same LCG PRNG. No performance impact but maintenance risk.

### PERF-L3: treePreview _hitTestRootNode Linear Scan

Linear scan of all root nodes (typically 5-8) on mousemove. Negligible impact.

---

## Summary by Category

| Anti-Pattern | Critical | High | Medium | Low |
|---|---|---|---|---|
| Object allocation in render loops | ~~1~~ **0 (fixed)** | ~~2~~ **0 (fixed)** | ~~2~~ **0 (fixed)** | 0 |
| Missing requestAnimationFrame | 0 | ~~1~~ **0 (fixed)** | 0 | 0 |
| O(n^2)+ traversals | ~~2~~ **0 (fixed)** | ~~5~~ **0 (fixed)** | ~~2~~ **0 (fixed)** | 0 |
| Missing caching/memoization | ~~1~~ **0 (fixed)** | ~~2~~ **0 (fixed)** | ~~2~~ **0 (fixed)** | 0 |
| Inefficient event handlers | 0 | 0 | ~~1~~ **0 (fixed)** | 1 |
| Expensive string operations | 0 | 0 | ~~2~~ **0 (fixed)** | 0 |
| Redundant computation/redraws | 0 | 0 | ~~3~~ **0 (fixed)** | 0 |
| Dead code | 0 | 0 | 0 | 1 |
| **Total** | **0 (all fixed)** | **0 (all fixed)** | **0 (all fixed)** | **2** |

---

## Top 5 Optimizations by User-Visible Impact

1. **PERF-C1** -- ~~WebGL buffer recreation every frame.~~ **FIXED.** Pre-built per-shape buffers, dirty flag separates data changes from view changes.

2. **PERF-C2 + PERF-H2** -- ~~Element detection and theme caching.~~ **FIXED.** Per-formId cache for element detection (C2) and spell themes (H2).

3. **PERF-C3** -- ~~O(n^2) overlap resolution.~~ **FIXED.** Spatial hashing reduces to near-linear.

4. **PERF-H1** -- ~~setInterval for animation.~~ **FIXED.** requestAnimationFrame with timestamp accumulator.

5. **PERF-H4 + PERF-H10** -- ~~Visual-first builder inner loop.~~ **FIXED.** Spatial hash for findBestPosition, spell theme caching and hoisting for buildEdges.
