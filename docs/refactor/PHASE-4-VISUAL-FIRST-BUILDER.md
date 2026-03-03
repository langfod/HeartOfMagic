# Phase 4: visualFirstBuilder.js -- Split into modules/visualFirst/

**Source file:** `modules/visualFirstBuilder.js` (3,686 lines)
**Goal:** Split into a `modules/visualFirst/` subdirectory following the growth-mode directory pattern.
**Prerequisite:** Phases 1-3 complete.

## New Directory

Create `modules/visualFirst/`.

## New Files

### 1. `modules/visualFirst/vfConstants.js` (~25 lines)
**Source:** `visualFirstBuilder.js` lines 1-25

Extract:
- `VANILLA_ROOTS` object (spell form IDs for vanilla root spells)

---

### 2. `modules/visualFirst/vfHelpers.js` (~445 lines)
**Source:** `visualFirstBuilder.js` lines ~2769-3211

Extract shared helper functions used by other vf files:
- `getDefaultBehavior()`
- `findBestPosition()`
- `findBestParent()`
- `addCrossGroupConnections()`
- `getShapeMask()`
- `discoverFuzzyGroupsFromSpells()`
- Utility functions (seeded random, shuffle, etc.)

**Load early** -- other vf files call these helpers.

---

### 3. `modules/visualFirst/vfEdgeBuilding.js` (~425 lines)
**Source:** `visualFirstBuilder.js` lines ~26-451

Extract:
- `assignSpellsToPositions()` -- tier-based grid placement
- `buildEdges()` -- proximity-based edge construction with NLP scoring
- Related helper functions (distance calculations, connectivity checks)

---

### 4. `modules/visualFirst/vfFuzzyGrouping.js` (~370 lines)
**Source:** `visualFirstBuilder.js` lines ~452-822

Extract:
- `buildEdgesFuzzyGroups()` -- fuzzy-group-aware edge building
- `discoverFuzzyGroups()` -- group discovery algorithm
- Cycle detection functions
- Related helpers

---

### 5. `modules/visualFirst/vfOrganicGrowth.js` (~600 lines max)
**Source:** `visualFirstBuilder.js` lines ~823-1642

Extract the organic tree growth system:
- `growOrganicTree()` -- core organic growth algorithm
- `findBehaviorParent()`
- `findBehaviorPosition()`

**Note:** At ~820 lines this exceeds the 600 LOC limit. Split `placeTerminalCluster()` and related terminal-cluster helpers into `vfOrganicHelpers.js` (~220 lines) during implementation.

---

### 6. `modules/visualFirst/vfPrereqLinks.js` (~420 lines)
**Source:** `visualFirstBuilder.js` lines ~1643-2062

Extract the prerequisite link system:
- `PREREQ_COUNTS_BY_RANK`
- `PREREQ_TIER_CONFIG`
- `addPrerequisiteLinks()`
- `calculatePrereqScore()`
- `assignPrerequisiteRequirements()`
- Tier assignment logic

---

### 7. `modules/visualFirst/vfThematic.js` (~355 lines)
**Source:** `visualFirstBuilder.js` lines ~2063-2416

Extract thematic keyword matching:
- `THEMATIC_KEYWORDS` object
- `getSpellThemes()`
- `calculateThematicSimilarity()`
- `areThematicallyCompatible()`
- `fixThematicInconsistencies()`

**Window exports (must be preserved):**
```javascript
window.getSpellThemes = getSpellThemes;
window.calculateThematicSimilarity = calculateThematicSimilarity;
window.areThematicallyCompatible = areThematicallyCompatible;
window.fixThematicInconsistencies = fixThematicInconsistencies;
```

---

### 8. `modules/visualFirst/vfAlternatePaths.js` (~350 lines)
**Source:** `visualFirstBuilder.js` lines ~2418-2768

Extract alternate paths system:
- `DEFAULT_ALTERNATE_PATH_CONFIG`
- `addAlternatePaths()`
- `calculateAlternatePathScore()`
- `buildAdjacencyList()`

**Window exports:**
```javascript
window.DEFAULT_ALTERNATE_PATH_CONFIG = DEFAULT_ALTERNATE_PATH_CONFIG;
```

---

### 9. `modules/visualFirst/vfBuilder.js` (~475 lines)
**Source:** `visualFirstBuilder.js` lines ~3212-3686

Extract main entry points:
- `generateVisualFirstTree()` -- single school tree generation
- `generateAllVisualFirstTrees()` -- all schools
- `formatTreeOutput()` -- output formatting

**Window exports (all remaining):**
```javascript
window.generateVisualFirstTree = generateVisualFirstTree;
window.generateAllVisualFirstTrees = generateAllVisualFirstTrees;
// ... plus any remaining window.X from the original file's export block
```

---

## Delete Original File

After all content moved, **delete `modules/visualFirstBuilder.js`**.

---

## Script Loading Order

Replace in all HTML files:
```html
<script src="modules/visualFirstBuilder.js"></script>
```

With:
```html
<script src="modules/visualFirst/vfConstants.js"></script>
<script src="modules/visualFirst/vfHelpers.js"></script>
<script src="modules/visualFirst/vfEdgeBuilding.js"></script>
<script src="modules/visualFirst/vfFuzzyGrouping.js"></script>
<script src="modules/visualFirst/vfOrganicGrowth.js"></script>
<script src="modules/visualFirst/vfPrereqLinks.js"></script>
<script src="modules/visualFirst/vfThematic.js"></script>
<script src="modules/visualFirst/vfAlternatePaths.js"></script>
<script src="modules/visualFirst/vfBuilder.js"></script>
```

---

## Verification Checklist

1. [ ] `modules/visualFirst/` directory created
2. [ ] All 9 new files created with correct content
3. [ ] `visualFirstBuilder.js` deleted
4. [ ] All `window.X` exports preserved in correct files
5. [ ] Each file under 600 LOC
6. [ ] All HTML files updated
7. [ ] `node run-tests.js` passes
8. [ ] `.\BuildRelease.ps1` succeeds
9. [ ] Manual test: generate a visual-first tree, verify output structure matches pre-split
10. [ ] Commit with descriptive message
