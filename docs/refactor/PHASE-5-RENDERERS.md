# Phase 5: wheelRenderer.js + canvasRendererV2.js -- Split into Subdirectories

**Source files:**
- `modules/wheelRenderer.js` (3,252 lines)
- `modules/canvasRendererV2.js` (2,980 lines)

**Goal:** Split both renderers into `modules/wheel/` and `modules/canvas/` subdirectories using the method-extension pattern.
**Prerequisite:** Phases 1-4 complete.

## Method Extension Pattern

Both files define a single large `var Foo = {...}` object literal. The split strategy:
1. Define the base object with core state and essential methods in a "Core" file
2. Add methods in subsequent files loaded after Core

```javascript
// canvasCore.js
var CanvasRenderer = {
    canvas: null,
    ctx: null,
    init: function() { ... },
    // ... core methods
};

// canvasRender.js (loaded after canvasCore.js)
CanvasRenderer.render = function() { ... };
CanvasRenderer._drawNodes = function() { ... };
```

**Key constraint:** The object's property declarations (initial state) MUST stay in Core since they define the object. Methods can be added freely in any subsequent file.

---

## Part A: wheelRenderer.js -> modules/wheel/

Create `modules/wheel/` directory.

### 1. `modules/wheel/wheelCore.js` (~500 lines)

The `var WheelRenderer = {...}` declaration containing:
- All state properties (svg, layers, caches, thresholds, flags)
- `init()` -- SVG setup, layer creation
- `setData()` -- receive tree data
- `setupEvents()` -- pan/zoom/click event wiring
- `setSchoolConfigs()`, `setLLMGroups()`
- `getSchoolVisualModifier()`, `getNodeGroup()`, `getNodeGroupColor()`
- LOD helpers: `getLOD()`, `getViewportBounds()`, `isNodeInViewport()`
- `toggleDebugGrid()`, `renderDebugGrid()`

---

### 2. `modules/wheel/wheelLayout.js` (~450 lines)

Layout computation methods added to `WheelRenderer`:
- `layout()` -- main layout entry
- `layoutRadial()` -- radial position calculations
- `layoutSectorsOnly()`
- `layoutSchoolNodes()`
- `fillGaps()`
- `resolveCollisions()`
- `calculateOverlapShrink()`
- Any layout utility methods

---

### 3. `modules/wheel/wheelRender.js` (~550 lines)

Rendering methods:
- `render()` -- main render entry
- `createEdgeElement()`, `calculateEdgePath()`, `isNodeVisible()`
- Node creation variants: `createNodeElement()`, `createUltraLightNode()`, `createMysteryNode()`, `createMinimalNode()`, `createSimpleNode()`, `createFullNode()`
- Color helpers: `dimColor()`, `brightenColor()`, `getInnerAccentColor()`
- `getNodeDisplayName()`
- `debugDiscoveryMode()`, `getTreeUnlockPercent()`, `isPreviewNode()`, `getNodeXPProgress()`

---

### 4. `modules/wheel/wheelChrome.js` (~400 lines)

UI chrome/decoration methods:
- `renderOriginLines()`
- `renderCenterHub()`
- `renderSpokes()`
- `updateSchoolLabelScale()`
- `getTierFromLevel()`
- School label rendering

---

### 5. `modules/wheel/wheelInteraction.js` (~550 lines)

User interaction methods:
- `onNodeClick()`
- `selectNode()`
- `rotateToNode()`
- `rotateSchoolToTop()`
- `animateRotation()`
- Learning path tracing: `highlightLearningPath()`, `tracePathToCenter()`
- Discovery mode highlight methods

---

## Part B: canvasRendererV2.js -> modules/canvas/

Create `modules/canvas/` directory.

### 1. `modules/canvas/canvasCore.js` (~500 lines)

The `var CanvasRenderer = {...}` declaration containing:
- All state properties (transform, spatial index, LOD, performance flags)
- `init()` -- canvas element setup, context acquisition
- `setData()`
- `_buildSpatialIndex()`
- Coordinate transform methods (screen <-> world)
- Pan/zoom setup and handlers

---

### 2. `modules/canvas/canvasRender.js` (~550 lines)

Drawing methods:
- `render()` -- request animation frame entry
- `_renderFrame()` -- the actual draw loop
- `_drawNodes()` -- LOD-aware node drawing
- `_drawEdges()` -- edge drawing with LOD
- `_drawSchoolDividers()`
- `_drawTooltip()`
- LOD threshold logic

---

### 3. `modules/canvas/canvasInteraction.js` (~530 lines)

Event handling:
- Mouse/touch event handlers
- Hit detection (`_hitTest()`, spatial index queries)
- Node hover, highlight, click handlers
- Selection state management
- Context menu (if any)

---

### 4. `modules/canvas/canvasSearch.js` (~400 lines)

Search/utility methods:
- Search highlight
- Animated pan-to-node
- Export utilities
- Debug helpers
- `window.CanvasRenderer = CanvasRenderer;` (final export, if not already global from `var`)

---

## Delete Original Files

After all content moved:
- **Delete `modules/wheelRenderer.js`**
- **Delete `modules/canvasRendererV2.js`**

---

## Script Loading Order

### Replace wheelRenderer.js in all HTML files:
```html
<script src="modules/wheel/wheelCore.js"></script>
<script src="modules/wheel/wheelLayout.js"></script>
<script src="modules/wheel/wheelRender.js"></script>
<script src="modules/wheel/wheelChrome.js"></script>
<script src="modules/wheel/wheelInteraction.js"></script>
```

### Replace canvasRendererV2.js in all HTML files:
```html
<script src="modules/canvas/canvasCore.js"></script>
<script src="modules/canvas/canvasRender.js"></script>
<script src="modules/canvas/canvasInteraction.js"></script>
<script src="modules/canvas/canvasSearch.js"></script>
```

### HTML files to update
- **index.html** -- `wheelRenderer.js` at line 1847, `canvasRendererV2.js` at line 1850
- **dev-harness.html** -- references `wheelRenderer.js` and `canvasRenderer.js` (stale name -- update to canvas/ paths)
- **browser-test.html** -- references `wheelRenderer.js` and `canvasRenderer.js` (stale name)
- **wheel-test.html** -- line 417 references `wheelRenderer.js`

### run-tests.js

`run-tests.js` mocks `WheelRenderer` (lines 60-92) but does not load the actual file. Verify it still works -- no changes expected.

---

## Verification Checklist

1. [ ] `modules/wheel/` and `modules/canvas/` directories created
2. [ ] All new files created with correct content
3. [ ] Original files deleted
4. [ ] Method-extension pattern works (no missing methods at runtime)
5. [ ] Each file under 600 LOC
6. [ ] All 4 HTML files updated (including stale canvasRenderer.js references)
7. [ ] `node run-tests.js` passes
8. [ ] `.\BuildRelease.ps1` succeeds
9. [ ] Manual test: load tree in wheel/SVG mode -- renders, pan/zoom/click work
10. [ ] Manual test: load tree in canvas mode -- renders, pan/zoom/click work
11. [ ] Manual test: node selection fires `nodeSelected` CustomEvent
12. [ ] Commit with descriptive message
