# Phase 6: proceduralTreeBuilder.js + prereqMaster.js -- Split

**Source files:**
- `modules/proceduralTreeBuilder.js` (2,268 lines)
- `modules/prereqMaster.js` (2,275 lines)

**Goal:** Split both tree-building subsystems into focused files.
**Prerequisite:** Phases 1-5 complete.

---

## Part A: proceduralTreeBuilder.js

### 1. `modules/proceduralTreeConfig.js` (~145 lines)
**Source:** lines 1-143

Extract configuration and filter functions:
- `PROCEDURAL_CONFIG` object
- `VANILLA_ROOTS` (note: also exists in visualFirst/vfConstants.js -- deduplicate by having one reference the other, or keep both if they differ)
- `filterBlacklistedSpells(spells)`
- `filterWhitelistedSpells(spells)`

**Window exports:**
```javascript
window.filterBlacklistedSpells = filterBlacklistedSpells;
window.filterWhitelistedSpells = filterWhitelistedSpells;
```

---

### 2. `modules/proceduralTreeCore.js` (~500 lines)
**Source:** lines ~144-906

Extract core algorithmic functions:
- `discoverThemes()` -- keyword extraction, TF-IDF-like scoring
- `groupSpells()` -- spell grouping by theme/school
- `TreeNode` constructor
- `buildSchoolTree()` / `buildProceduralSchoolTree()`
- `buildProceduralTrees()` -- multi-school tree building
- `assignGridPositions()` -- grid-based position assignment

**Window exports:**
```javascript
window.discoverThemes = discoverThemes;
window.buildProceduralSchoolTree = buildProceduralSchoolTree;
window.buildProceduralTrees = buildProceduralTrees;
```

---

### 3. `modules/proceduralTreeGenerate.js` (~600 lines)
**Source:** lines ~907-1718

Extract UI handlers and generation entry points:
- `generateSimpleSchoolTree()` -- single school generation
- JS version UI handlers: `startProceduralGenerate()`, `onProceduralClick()`, `resetProceduralButton()`
- C++ version UI handlers: `startProceduralTreeGenerate()`, `onProceduralPlusClick()`, `resetProceduralPlusButton()`
- `window.onProceduralTreeComplete` -- C++ callback
- `applySchoolConfigsToUI()`

**Window exports:** All `window.X` from this section of the original file.

---

### 4. `modules/proceduralTreeVisualFirst.js` (~550 lines)
**Source:** lines ~1719-2268

Extract visual-first generation integration:
- `startVisualFirstGenerate()`
- `startVisualFirstTreeConfig()`
- `doVisualFirstGenerate()`
- `resetVisualFirstButton()`
- All visual-first generation flow functions

**Window exports:**
```javascript
window.startVisualFirstGenerate = startVisualFirstGenerate;
window.startVisualFirstTreeConfig = startVisualFirstTreeConfig;
window.doVisualFirstGenerate = doVisualFirstGenerate;
window.resetVisualFirstButton = resetVisualFirstButton;
```

### Delete original: `modules/proceduralTreeBuilder.js`

---

## Part B: prereqMaster.js

The entire file is wrapped in a single IIFE `(function() { ... })()`. To split it, **dissolve the IIFE** -- the private functions become file-scope globals (which is fine since all other modules use the same pattern).

### 1. `modules/prereqMasterScoring.js` (~500 lines)

Extract NLP/scoring subsystem:
- `_computeTFIDF()` -- TF-IDF computation
- `_cosineSimilarity()` -- vector similarity
- `_jsFuzzyScore()` -- fuzzy string matching
- Token extraction, normalization helpers
- Any scoring-related helper functions

These are currently "private" inside the IIFE. After extraction, they become file-scope globals. Since they have `_` prefixes, name collisions are unlikely.

**Header comment:**
```javascript
/**
 * PreReq Master - NLP Scoring
 * JS-side TF-IDF and fuzzy scoring for prerequisite lock assignment.
 * Provides scoring functions used by prereqMaster.js lock builder.
 *
 * Depends on: (none - pure computation)
 */
```

---

### 2. `modules/prereqMaster.js` (reduced, ~600 lines)

Keep the core lock-building logic:
- `getSettings()` -- read slider values from DOM
- Tier helper functions
- `buildLockRequest()` -- prepare lock data for C++
- `applyLocksWithJSScorer()` -- apply locks using JS scoring
- `autoApplyLocks()` -- auto-apply on tree load
- `clearLocks()` -- remove all locks
- `revealLocksForNode()` -- show locks for a specific node

---

### 3. `modules/prereqMasterUI.js` (~500 lines)

Extract UI and initialization:
- `renderPreview()` -- preview canvas rendering
- `_updatePreviewSize()`
- `initPreReqMaster()` -- DOM binding, button handlers
- Status reporting functions

**The `window.PreReqMaster` facade export stays here:**
```javascript
window.PreReqMaster = {
    init: initPreReqMaster,
    isEnabled: function() { ... },
    applyLocks: applyLocksWithJSScorer,
    clearLocks: clearLocks,
    renderPreview: renderPreview,
    // ... same interface as before
};
```

---

## Script Loading Order

### Replace proceduralTreeBuilder.js:
```html
<script src="modules/proceduralTreeConfig.js"></script>
<script src="modules/proceduralTreeCore.js"></script>
<script src="modules/proceduralTreeGenerate.js"></script>
<script src="modules/proceduralTreeVisualFirst.js"></script>
```

### Replace prereqMaster.js:
```html
<script src="modules/prereqMasterScoring.js"></script>
<script src="modules/prereqMaster.js"></script>
<script src="modules/prereqMasterUI.js"></script>
```

---

## HTML Files to Update
- `index.html` -- lines 1912 (proceduralTreeBuilder) and 1925 (prereqMaster)
- `dev-harness.html` -- same references
- `browser-test.html` -- check for references

---

## Verification Checklist

1. [ ] All new files created with correct content
2. [ ] Original files deleted
3. [ ] IIFE dissolved cleanly for prereqMaster (no name collisions)
4. [ ] `window.PreReqMaster` interface unchanged
5. [ ] All `window.X` exports preserved
6. [ ] Each file under 600 LOC
7. [ ] All HTML files updated
8. [ ] `node run-tests.js` passes
9. [ ] `.\BuildRelease.ps1` succeeds
10. [ ] Manual test: run procedural tree generation (JS mode)
11. [ ] Manual test: prereq master lock apply/clear cycle
12. [ ] Manual test: prereq preview renders
13. [ ] Commit with descriptive message
