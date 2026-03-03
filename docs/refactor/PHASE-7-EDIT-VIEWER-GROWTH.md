# Phase 7: editMode.js + treeViewerUI.js + treeGrowthTree.js -- Split

**Source files:**
- `modules/editMode.js` (2,085 lines)
- `modules/treeViewerUI.js` (2,037 lines)
- `modules/treeGrowthTree.js` (2,169 lines)

**Goal:** Split the editing, viewing, and tree growth mode into focused files.
**Prerequisite:** Phases 1-6 complete.

---

## Part A: editMode.js (method-extension pattern)

`EditMode` is a single `var EditMode = {...}` object. Split using the same method-extension approach as the renderers (Phase 5).

### 1. `modules/editModeCore.js` (~600 lines)

The `var EditMode = {...}` declaration containing:
- All state properties (active tool, undo stack, selection state, etc.)
- `init()` -- toolbar creation, global event binding
- Toolbar management: `setupToolbar()`, `setActiveTool()`, `updateToolbarState()`
- Mode switching: `enable()`, `disable()`, `isActive()`
- Core mouse event dispatch: `onMouseDown()`, `onMouseMove()`, `onMouseUp()` (dispatching to active tool)
- Undo system: `pushUndo()`, `undo()`, `getUndoStack()`

---

### 2. `modules/editModeTools.js` (~500 lines)

Tool-specific handlers added to `EditMode`:
- Move tool: `handleMoveMouseDown()`, `handleMoveMouseMove()`, `handleMoveMouseUp()`, snap-to-grid logic
- Pen tool: `handlePenMouseDown()`, `handlePenMouseMove()`, `handlePenMouseUp()`, edge drawing preview
- Eraser tool: `handleEraserMouseDown()`, `handleEraserMouseMove()`, `handleEraserMouseUp()`, edge/node deletion

---

### 3. `modules/editModeOps.js` (~575 lines)

Operations and advanced editing:
- Rendering overlay: `renderOverlay()`, `updateOverlay()`
- Save/sync: `saveTree()`, `syncToRenderer()`
- Prerequisite editing: hard/soft prereq toggle, prereq edge management
- Node operations: duplicate node, delete node
- Spell spawn menu: search, spawn new spell nodes
- `window.onAllSpellsReceived` -- C++ callback for available spells

**Window exports:**
```javascript
window.onAllSpellsReceived = function(jsonStr) { ... };
```

### Delete original: `modules/editMode.js`

---

## Part B: treeViewerUI.js -> modules/treeViewer/

Create `modules/treeViewer/` directory.

### 1. `modules/treeViewer/treeViewerCore.js` (~550 lines)

Core tree viewer functionality:
- `var SmartRenderer = {...}` -- adapter that delegates to WheelRenderer or CanvasRenderer
- `initializeTreeViewer()` -- main initialization
- Import/export: `showImportModal()`, `hideImportModal()`, `importTreeFromModal()`, `mergeTreeData()`
- Tree loading: `_loadTrustedTree()`, `loadTreeData()` (~280 lines), `mirrorBidirectionalSoftPrereqs()`

**Important:** `SmartRenderer` must remain accessible as a global since other files reference it.

---

### 2. `modules/treeViewer/treeViewerDetails.js` (~575 lines)

Spell details panel:
- `showSpellDetails(spellId)` -- the ~400 line spell detail panel renderer
- `updateDetailsProgression()` -- progression display within details
- `selectNodeById()` -- select + show details
- Detail panel helpers (formatting, XP display, requirement display)

---

### 3. `modules/treeViewer/treeViewerFind.js` (~280 lines)

Find-spell feature:
- `initializeFindSpell()`
- `openFindSpell()` / `closeFindSpell()`
- `renderFindSpellList(query)`
- `highlightMatch(text, query)` -- search result highlighting
- `navigateFindSpell(direction)` -- keyboard navigation
- `confirmFindSpell(spellId)` -- select and pan to spell
- `smoothPanToNode(nodeId)` -- animated camera pan

### Delete original: `modules/treeViewerUI.js`

---

## Part C: treeGrowthTree.js -> modules/tree/

Move into the existing `modules/tree/` directory (already contains `treeRenderer.js`, `treeTrunk.js`, `treeSettings.js`).

### 1. `modules/tree/treeGrowthTree.js` (~600 lines)

The `var TreeGrowthTree = {...}` declaration containing:
- All state properties
- Mode interface methods: `buildSettingsHTML()`, `bindEvents()`, `buildTree()`, `loadTreeData()`, `applyTree()`, `getPositionMap()`, `clearTree()`

---

### 2. `modules/tree/treeGrowthTreeRender.js` (~550 lines)

Rendering methods:
- `render()` -- main render entry (Canvas 2D drawing)
- `_computeBuiltLayout()` -- layout computation with caching
- Cache system: `_buildCacheKey()`, `_getOrCompute()`
- Node drawing: trunk, branches, leaves

---

### 3. `modules/tree/treeGrowthTreeLayout.js` (~550 lines)

Internal layout methods:
- Branch positioning algorithms
- Natural angle computation
- Node placement within branches
- Depth-based spacing

---

### 4. `modules/tree/treeGrowthTreeAnim.js` (~470 lines)

Animation and state methods:
- Animation loop, transition interpolation
- Dirty tracking: `markDirty()`, `isDirty()`
- Settings getter methods
- `TreeGrowth.registerMode('tree', TreeGrowthTree)` call at end

### Delete original: `modules/treeGrowthTree.js`

---

## Script Loading Order

### Replace editMode.js:
```html
<script src="modules/editModeCore.js"></script>
<script src="modules/editModeTools.js"></script>
<script src="modules/editModeOps.js"></script>
```

### Replace treeViewerUI.js:
```html
<script src="modules/treeViewer/treeViewerCore.js"></script>
<script src="modules/treeViewer/treeViewerDetails.js"></script>
<script src="modules/treeViewer/treeViewerFind.js"></script>
```

### Replace treeGrowthTree.js:
```html
<script src="modules/tree/treeGrowthTree.js"></script>
<script src="modules/tree/treeGrowthTreeRender.js"></script>
<script src="modules/tree/treeGrowthTreeLayout.js"></script>
<script src="modules/tree/treeGrowthTreeAnim.js"></script>
```

**Note:** The tree/ files must load after `modules/tree/treeRenderer.js`, `treeTrunk.js`, `treeSettings.js` (existing files). `treeGrowthTreeAnim.js` must load before `treeGrowth.js` since it registers the mode.

---

## HTML Files to Update
- `index.html` -- lines 1852 (editMode), 1860 (treeViewerUI), 1890 (treeGrowthTree)
- `dev-harness.html` -- same references
- `browser-test.html` -- check for references

---

## Verification Checklist

1. [ ] `modules/treeViewer/` directory created
2. [ ] All new files created with correct content
3. [ ] Original files deleted
4. [ ] Method-extension pattern works for EditMode and TreeGrowthTree
5. [ ] `SmartRenderer` remains accessible as global
6. [ ] `window.onAllSpellsReceived` callback preserved
7. [ ] `TreeGrowth.registerMode('tree', TreeGrowthTree)` still executes
8. [ ] Each file under 600 LOC
9. [ ] All HTML files updated
10. [ ] `node run-tests.js` passes
11. [ ] `.\BuildRelease.ps1` succeeds
12. [ ] Manual test: edit mode tools (move, pen, eraser)
13. [ ] Manual test: spell details panel shows correctly
14. [ ] Manual test: find-spell works
15. [ ] Manual test: tree growth mode renders
16. [ ] Commit with descriptive message
