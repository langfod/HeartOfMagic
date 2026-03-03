# Phase 8: layoutEngine.js + classicLayout.js + cppCallbacks.js + settingsAwareTreeBuilder.js

**Source files:**
- `modules/layoutEngine.js` (1,950 lines)
- `modules/classic/classicLayout.js` (1,756 lines)
- `modules/cppCallbacks.js` (1,240 lines)
- `modules/settingsAwareTreeBuilder.js` (1,198 lines)

**Goal:** Split the remaining infrastructure files that exceed 600 LOC.
**Prerequisite:** Phases 1-7 complete.

---

## Part A: layoutEngine.js (method-extension pattern)

`LayoutEngine` is a single `var LayoutEngine = {...}` object. Split by concern.

### 1. `modules/layoutEngineCore.js` (~500 lines)

The `var LayoutEngine = {...}` declaration containing:
- State properties (grid dimensions, caches)
- Core positioning: coordinate transforms, tier calculations
- Utility methods used by other layout sub-files
- `getPosition()`, `getNodePosition()`

---

### 2. `modules/layoutEngineRadial.js` (~500 lines)

Radial layout algorithms:
- `layoutRadial()`, `calculateTierRadius()`, `calculateSliceAngle()`
- Sector allocation, tier spacing
- Radial collision detection

---

### 3. `modules/layoutEngineGrid.js` (~500 lines)

Grid-based layout:
- Grid position calculations
- Shape profile integration (reads `SHAPE_PROFILES`)
- `assignGridPosition()`, `getGridSlot()`
- Fill algorithms

---

### 4. `modules/layoutEngineUtils.js` (~450 lines)

Utility and format methods:
- Format converters
- Export methods
- Validation helpers
- `window.LayoutEngine = LayoutEngine;` (if needed)

### Delete original: `modules/layoutEngine.js`

---

## Part B: classicLayout.js (in modules/classic/, method-extension pattern)

`ClassicLayout` is a single `var ClassicLayout = {...}` object within the existing `modules/classic/` directory.

### 1. `modules/classic/classicLayoutCore.js` (~580 lines)

The `var ClassicLayout = {...}` declaration with:
- State properties
- Core computation methods
- School branch origin positioning

---

### 2. `modules/classic/classicLayoutGrid.js` (~580 lines)

Grid assignment methods:
- Grid-based tier layout
- Zone allocation
- Tier boundary calculations

---

### 3. `modules/classic/classicLayoutSpell.js` (~596 lines)

Spell placement methods:
- Individual spell position assignment
- Collision avoidance
- Overlap resolution
- Final position adjustments

### Delete original: `modules/classic/classicLayout.js`

---

## Part C: cppCallbacks.js

This file contains C++ bridge callbacks. Split by functional domain while preserving all `window.X` callback names.

### 1. `modules/cppCallbacksCore.js` (~450 lines)
**Source:** lines ~1-450

Core callbacks and helpers:
- Duplicate-node helpers: `getCanonicalFormId()`, `findDuplicateSiblings()`, `syncDuplicateState()`
- `window.onBuilderStatus`
- `window.updateSpellData` -- main spell scan results callback
- `window.updateStatus`, `window.updateTreeStatus`
- `window.updatePrompt`, `window.onPromptSaved`
- `window.onClipboardContent`, `window.onCopyComplete`
- `window.updateTreeData` -- tree loading callback

---

### 2. `modules/cppCallbacksTree.js` (~400 lines)
**Source:** lines ~450-850

Tree and spell state callbacks:
- `window.onClassicGrowthTreeData`
- `window.onTreeGrowthTreeData`
- `window.updateSpellInfo` / `window.updateSpellInfoBatch`
- `window.debugOutput`, `window.testLearning`
- `window.updateSpellState`
- `window.onResetTreeStates`
- Mastery check functions: `isSpellMastered()`, `isSpellLearning()`

---

### 3. `modules/cppCallbacksState.js` (~390 lines)
**Source:** lines ~850-1240

Game state and panel lifecycle:
- `recalculateNodeAvailability()` -- availability recalculation logic
- `window.onSaveGameLoaded`
- `window.onPlayerKnownSpells`
- `window.onPrismaReady` -- framework ready callback
- `window.onPanelShowing` / `window.onPanelHiding`

### Delete original: `modules/cppCallbacks.js`

---

## Part D: settingsAwareTreeBuilder.js

### 1. `modules/settingsAwareCore.js` (~600 lines)
**Source:** lines 1-600

Core building logic:
- Configuration reading from `settings`
- Edge scoring integration (delegates to `EdgeScoring`)
- Edge creation gate (filter/validate edges)
- Tree building core algorithm

---

### 2. `modules/settingsAwareBuilder.js` (~598 lines)
**Source:** lines 600-1198

Builder orchestration:
- `buildAllTreesSettingsAware()` -- synchronous entry
- `buildAllTreesSettingsAwareAsync()` -- async entry
- NLP fuzzy integration
- `window.SettingsAwareTreeBuilder` export
- `window.buildAllTreesSettingsAware`, `window.buildAllTreesSettingsAwareAsync`

### Delete original: `modules/settingsAwareTreeBuilder.js`

---

## Script Loading Order

### Replace layoutEngine.js (line ~1835):
```html
<script src="modules/layoutEngineCore.js"></script>
<script src="modules/layoutEngineRadial.js"></script>
<script src="modules/layoutEngineGrid.js"></script>
<script src="modules/layoutEngineUtils.js"></script>
```

### Replace classicLayout.js (line ~1884):
```html
<script src="modules/classic/classicLayoutCore.js"></script>
<script src="modules/classic/classicLayoutGrid.js"></script>
<script src="modules/classic/classicLayoutSpell.js"></script>
```

### Replace cppCallbacks.js (line ~1909):
```html
<script src="modules/cppCallbacksCore.js"></script>
<script src="modules/cppCallbacksTree.js"></script>
<script src="modules/cppCallbacksState.js"></script>
```

### Replace settingsAwareTreeBuilder.js (line ~1920):
```html
<script src="modules/settingsAwareCore.js"></script>
<script src="modules/settingsAwareBuilder.js"></script>
```

---

## run-tests.js Update

`run-tests.js` loads `settingsAwareTreeBuilder` via `require()`. Update to:
```javascript
require('./modules/settingsAwareCore.js');
require('./modules/settingsAwareBuilder.js');
```

Or adjust paths depending on how `require` resolves from the test runner's working directory.

---

## Verification Checklist

1. [ ] All new files created with correct content
2. [ ] Original files deleted
3. [ ] Method-extension pattern works for LayoutEngine and ClassicLayout
4. [ ] All `window.X` C++ callbacks preserved in cppCallbacks* files
5. [ ] `run-tests.js` updated and passes
6. [ ] `unificationTest.js` passes (tests LayoutEngine, SettingsAwareTreeBuilder)
7. [ ] Each file under 600 LOC
8. [ ] All HTML files updated
9. [ ] `.\BuildRelease.ps1` succeeds
10. [ ] Manual test: tree layout renders correctly in all modes
11. [ ] Manual test: classic mode layout correct
12. [ ] Manual test: C++ callbacks fire correctly (scan, tree load, spell state)
13. [ ] Commit with descriptive message
