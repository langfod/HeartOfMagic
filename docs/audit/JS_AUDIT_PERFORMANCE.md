# JavaScript Audit: Performance Opportunities

**Date:** 2026-03-03
**Last verified:** 2026-03-09 (critical findings fixed, line numbers updated)
**Scope:** `PrismaUI/views/SpellLearning/SpellLearningPanel/modules/` (~120 files, ~72k lines)

## Executive Summary

42 performance findings were identified across 10 anti-pattern categories. **All 4 critical findings have been fixed** (2026-03-09). The remaining high-priority optimizations for user-visible impact:

1. ~~WebGL buffer recreation every frame~~ — **FIXED**
2. ~~Missing element/theme caching in edge scoring~~ — **FIXED**
3. ~~O(n^2) overlap resolution without spatial indexing~~ — **FIXED**
4. setInterval instead of requestAnimationFrame (treeAnimation.js)
5. Uncached spell theme extraction in inner loops (vfEdgeBuilding.js)

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

### PERF-H1: setInterval Instead of requestAnimationFrame

**File:** `treeAnimation.js:373, 428`

Both Phase 1 and Phase 2 animations use `setInterval`. This:
- Does not sync with vsync, causing visual jank
- Continues running when tab is backgrounded (wasting CPU)
- Cannot be throttled by the browser's performance manager

**Fix:** Replace with `requestAnimationFrame` + timestamp-based progression.

### PERF-H2: getSpellThemes/calculateThematicSimilarity Called Uncached

**File:** `vfEdgeBuilding.js:217-219`

Inside the inner loop of `buildEdges()`, for every current-tier node against every connected previous node:
```javascript
var thematicSim = calculateThematicSimilarity(pos.spell, c.spell);
var themes1 = getSpellThemes(pos.spell);
var themes2 = getSpellThemes(c.spell);
```

`getSpellThemes` re-runs keyword matching against 15+ categories each call. For 100 spells across 20 tiers, later tiers score against 200+ candidates.

**Fix:** Cache `getSpellThemes(spell)` results in a Map keyed by formId before the tier loop.

### PERF-H3: calculateThemeScore Creates New RegExp Per Call

**File:** `proceduralTreeCore.js:97-112`

```javascript
var regex = new RegExp(theme, 'gi');
var matches = spellText.match(regex);
```

Creates a new RegExp object per (spell, theme) pair. With 300 spells and 10 themes = 3,000 RegExp constructions.

**Fix:** Pre-compile RegExp objects per theme string.

### PERF-H4: findBestPosition Triple-Nested Loop

**File:** `vfHelpers.js:295-367`

```javascript
sameGroupNodes.forEach(function(node) {
    for (var angleOffset = -30; angleOffset <= 30; angleOffset += 15) {  // 5 angles
        for (var radiusMult = 1.0; radiusMult <= 2.0; radiusMult += 0.3) { // 4 radii
            for (var i = 0; i < placedNodes.length; i++) { // linear overlap check
            }
        }
    }
});
```

O(groupNodes * 20 * placedNodes). With 50 group nodes and 200 placed nodes = 200,000 distance checks.

**Fix:** Use spatial hash for placed nodes. Overlap check becomes O(1) amortized.

### PERF-H5: Sitter Nudge is O(nodes x edges)

**File:** `layoutEngineUtils.js:191-218`

For each node, checks every edge for proximity. 200 nodes * 300 edges = 60,000 distance calculations.

**Fix:** Build spatial index of edge bounding boxes.

### PERF-H6: connectOrphans Iterates All Nodes Per Orphan

**File:** `proceduralTreeCore.js:354-359`

O(orphans * nodes). If 10% of 300 nodes are orphans = 9,000 iterations with distance calculations.

### PERF-H7: addSimpleAlternatePaths O(n^2) Within Tiers

**File:** `proceduralTreeCore.js:696-729`

All same-tier nodes checked against each other. Large tiers (50+ nodes) = 2,500+ comparisons.

### PERF-H8: Full BFS Per Candidate in PrereqMaster Lock Building

**File:** `prereqMasterScoring.js:153-176, 267-293`

`_isDescendant` and `_isOnlyReachableThrough` each run full BFS traversals. Called per candidate during lock building. With 300 nodes and 10 candidates per spell = 3,000+ BFS traversals.

**Fix:** Pre-compute descendant sets once before the lock-building loop.

### PERF-H9: RGBA String Concatenation Per Particle Per Frame

**Files:** `globe3D.js:~478-489`, `starfield.js:138, 187`

Each particle (200+ in globe, 100+ in starfield) generates rgba() strings via concatenation every frame. Starfield also creates new RNG closures per tile per frame.

**Fix:** Pre-compute color strings by quantized alpha. Cache RNG functions per tile key.

### PERF-H10: buildEdges Scores ALL Previous Connected Nodes

**File:** `vfEdgeBuilding.js:210-274`

For each current-tier node, ALL connected previous-tier nodes are scored. Late tiers score against 200+ candidates, each invoking `calculateThematicSimilarity` + `getSpellThemes`.

**Fix:** Limit candidate pool to K-nearest by spatial distance. Cache theme results (see PERF-H2).

---

## Medium-Priority Findings

### PERF-M1: WebGL Hover Detection Without Throttle

**File:** `webglRenderer.js:274-297`

`onMouseMove` calls `getBoundingClientRect()` (can trigger layout reflow) and `findNodeAt()` on every mousemove event (60-120+ per second).

**Fix:** Cache bounding rect, gate hover behind RAF flag.

### PERF-M2: Depth Sorting Particle Array Every Frame

**File:** `globe3D.js:~173`

`Array.sort` is O(n log n) and allocates internally. 200 particles at 60fps = 12,000 sorts per second.

**Fix:** Use insertion sort (efficient for nearly-sorted data) or Z-bucketing.

### PERF-M3: indexOf for Membership Checks

**File:** `treeParser.js:179, 191, 199, 366, 369`

Linear search in arrays for prerequisite/children membership. Compounds to O(n*k) in loops.

**Fix:** Use Set for bulk membership operations.

### PERF-M4: STOP_WORDS.indexOf in Hot Path

**File:** `proceduralTreeCore.js:49`

Linear scan per word during theme discovery. 300 spells * 10 words * 50 stop words = 150,000 comparisons.

**Fix:** Convert `STOP_WORDS` to a Set.

### PERF-M5: String Key Generation in Layout Hot Paths

**File:** `layoutEngineRadial.js:139-151`

String concatenation (`tier + '_' + slotIndex`) for hash keys in BFS. 300+ nodes = 1000+ string allocations.

**Fix:** Use numeric key: `tier * 10000 + slotIndex`.

### PERF-M6: WebGL renderNodes Recalculates ALL Node Data on View-Only Changes

**File:** `webglRenderer.js:876-975` (shifted from original 966-1065 after dedup refactoring)

When only pan/zoom/rotation changes (most frames), the node instance data hasn't changed. But `renderNodes` re-groups by shape, rebuilds all Float32Arrays, and re-uploads.

**Fix:** Separate "data dirty" from "view dirty". Only update view matrix when transform changes.

### PERF-M7: Stale _cachedPosMap in prereqMasterScoring

**File:** `prereqMasterScoring.js:84-95`

Module-level cache never cleared. After tree regeneration, stale positions used for distance calculations.

**Fix:** Add invalidation mechanism or generation counter.

### PERF-M8: Redundant Triple-Dirty Cascade

**File:** `treePreview.js:389-394`

`_markDirty()` cascades to both TreeCore AND TreeGrowth, potentially causing redundant redraws from a single interaction.

### PERF-M9: hasOverlap Linear Scan Per Placement

**File:** `proceduralTreeCore.js:762-771`

O(n) per call with up to 10 retries per node placement.

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
| Object allocation in render loops | ~~1~~ **0 (fixed)** | 2 | 2 | 0 |
| Missing requestAnimationFrame | 0 | 1 | 0 | 0 |
| O(n^2)+ traversals | ~~2~~ **0 (fixed)** | 5 | 2 | 0 |
| Missing caching/memoization | ~~1~~ **0 (fixed)** | 2 | 2 | 0 |
| Inefficient event handlers | 0 | 0 | 1 | 1 |
| Expensive string operations | 0 | 0 | 2 | 0 |
| Redundant computation/redraws | 0 | 0 | 3 | 0 |
| Dead code | 0 | 0 | 0 | 1 |
| **Total** | **~~4~~ 0 (all fixed)** | **10** | **12** | **2** |

---

## Top 5 Optimizations by User-Visible Impact

1. **PERF-C1** -- ~~WebGL buffer recreation every frame.~~ **FIXED.** Pre-built per-shape buffers, dirty flag separates data changes from view changes.

2. **PERF-C2 + PERF-H2** -- ~~Element detection and theme caching.~~ **C2 FIXED** (per-formId cache). PERF-H2 (spell theme caching) still open.

3. **PERF-C3** -- ~~O(n^2) overlap resolution.~~ **FIXED.** Spatial hashing reduces to near-linear.

4. **PERF-H1** -- setInterval for animation. Causes visible jank in the tree growth animation and wastes CPU when the tab is backgrounded.

5. **PERF-H4 + PERF-H10** -- Visual-first builder inner loop. Large schools spend most of their build time in findBestPosition and buildEdges due to linear scans. Spatial indexing provides order-of-magnitude improvement for 200+ spell schools.
