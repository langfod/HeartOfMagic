# SpellLearning JavaScript Reference

Modular JavaScript architecture for the SpellLearning PrismaUI panel. The original monolithic codebase (~35k lines in 17 large files) was split across 9 refactoring phases into ~120 focused module files totaling ~65k lines (including new growth modes added during/after refactoring).

**Base path:** `PrismaUI/views/SpellLearning/SpellLearningPanel/modules/`

## Architecture Constraints

- **600 LOC limit** per file (with minor tolerance)
- **`var` only** -- Ultralight compatibility (no `let`/`const`)
- **No bundler** -- raw `<script>` tags loaded in dependency order
- **No ES6 modules** -- globals and IIFEs, attached to `window` or declared at file scope
- **All `window.X` exports preserved** -- C++ bridge callbacks must not break

## Domain Reference Files

| Document | Covers |
|----------|--------|
| [FOUNDATION.md](FOUNDATION.md) | Core modules: constants, state, config, i18n |
| [TREE_BUILDING.md](TREE_BUILDING.md) | Tree building algorithms, layout engine, visual-first, prereqMaster |
| [RENDERERS.md](RENDERERS.md) | Wheel, canvas, WebGL, trusted renderer, starfield, globe3D |
| [GROWTH_MODES.md](GROWTH_MODES.md) | Classic, tree, graph, oracle, thematic growth modes |
| [SETTINGS.md](SETTINGS.md) | Settings panel, presets, config load/save |
| [LLM_INTEGRATION.md](LLM_INTEGRATION.md) | LLM generation pipeline, color suggestion, growth style |
| [UI_COMPONENTS.md](UI_COMPONENTS.md) | Panel chrome, button handlers, edit mode, progression, tree preview |
| [CPP_BRIDGE.md](CPP_BRIDGE.md) | C++ SKSE callback interface (`window.on*` exports) |

## Directory Structure

```
modules/
├── canvas/          # Canvas 2D renderer (5 files)
├── classic/         # Classic growth mode (7 files)
├── graph/           # Graph growth mode (4 files)
├── oracle/          # Oracle growth mode (4 files)
├── settings/        # Settings panel subsystems (13 files)
├── thematic/        # Thematic growth mode (4 files)
├── tree/            # Tree growth mode (7 files)
├── treeViewer/      # Tree viewer + spell details (4 files)
├── visualFirst/     # Visual-first tree builder (10 files)
├── wheel/           # SVG wheel renderer (6 files)
└── *.js             # Top-level modules (~55 files)
```

## Key Global Objects

| Object | Source Module | Description |
|--------|-------------|-------------|
| `settings` | state.js | All user-configurable settings (persisted via C++ bridge) |
| `state` | state.js | Runtime state (tree data, selection, UI flags) |
| `TREE_CONFIG` | config.js | Tree layout configuration constants |
| `GRID_CONFIG` | config.js | Grid layout configuration constants |
| `SpellCache` | spellCache.js | Async spell data cache singleton |
| `TreeParser` | treeParser.js | Tree JSON parsing, validation, cycle detection |
| `WheelRenderer` | wheel/wheelCore.js | SVG wheel rendering engine |
| `CanvasRenderer` | canvas/canvasCore.js | Canvas 2D rendering engine |
| `WebGLRenderer` | webglRenderer.js + webglRendererBuffers.js + webglRendererDraw.js | GPU-accelerated WebGL 2.0 renderer |
| `LayoutEngine` | layoutEngineCore.js | Layout position engine singleton |
| `GROWTH_DSL` | growthDSL.js | Procedural tree visual DSL |
| `GROWTH_BEHAVIORS` | growthBehaviors.js | Per-school growth behavior definitions |
| `SHAPE_PROFILES` | shapeProfiles.js | Shape profile data for tree silhouettes |
| `EditMode` | editModeCore.js | Edit mode state and toolbar |
| `TreeGrowth` | treeGrowth.js | Growth mode orchestrator |
| `BuildProgress` | buildProgress.js | Build progress modal |
| `ViewTransform` | viewTransform.js | Coordinate transform utilities (screen↔world, rotation, path interpolation) |
| `SpatialIndex` | spatialIndex.js | Grid-based spatial hash for node hit testing |
| `PanZoomController` | panZoomController.js | Factory for reusable mouse-driven pan/zoom handlers |
| `GrowthRenderShared` | growthRenderShared.js | Shared growth renderer constants and shape primitives |
| `DiscoveryVisibility` | discoveryVisibility.js | Discovery mode visibility set builder |
| `TooltipManager` | tooltipManager.js | Unified tooltip show/hide with progressive reveal |
| `ShapeDefinitions` | shapeDefinitions.js | Canonical shape vertices (diamond, hexagon, pentagon, etc.) |
| `GrowthModeUtils` | growthModeUtils.js | Shared growth mode lifecycle (applyTree, buildTree, zoomToFit) |

## Script Load Order

Scripts are loaded via `<script>` tags in dependency order. The canonical order is defined in `index.html` (lines ~1816-2005). `dev-harness.html` loads the same set with an additional `dev-harness-bridge.js` (mock C++ bridge) before and `dev-harness-toolbar.js` after.

**Load order groups** (each group depends on prior groups):

1. **Locale** -- `lang/locale.js`, `lang/en.js`, dynamic locale script, `modules/i18n.js`
2. **Foundation** -- `constants.js`, `state.js`, `config.js`
3. **Layout Engine** -- `edgeScoring.js`, `shapeProfiles.js`, `layoutEngineCore.js`, `layoutEngineGrid.js`, `layoutEngineUtils.js`, `layoutEngineRadial.js`
4. **Core Utilities** -- `spellCache.js`, `colorUtils.js`, `discoveryVisibility.js`, `tooltipManager.js`, `uiHelpers.js`, `growthDSL.js`, `treeParser.js`
5. **Shared Infrastructure** -- `shapeDefinitions.js`, `viewTransform.js`, `spatialIndex.js`, `panZoomController.js`
6. **Renderers** -- `wheel/*`, `starfield.js`, `globe3D.js`, `globe3DParticles.js`, `canvas/*`, `trustedRenderer.js`
7. **Edit Mode** -- `editModeCore.js`, `editModeTools.js`, `editModeOps.js`, `colorPicker.js`
8. **Settings** -- `settings/*` (13 files in dependency order)
9. **Tree Viewer** -- `treeViewer/*` (4 files)
10. **UI Components** -- `progressionUI.js`, `settingsPresets.js`, `scannerPresets.js`, `easyMode.js`, `llmApiSettings.js`, `buttonHandlers.js`
11. **Tree Preview** -- `treePreviewUtils.js`, `sunGrid*.js` (4 files), `treePreviewSun.js`, `treePreviewFlat.js`, `treePreview.js`, `treeCore.js`
12. **Growth Modes** -- `growthModeUtils.js`, `growthRenderShared.js`, `classic/*`, `tree/*`, `graph/*`, `oracle/*`, `thematic/*`, `treeGrowth.js`
13. **C++ Callbacks** -- `cppCallbacksCore.js`, `cppCallbacksTree.js`, `cppCallbacksState.js`, `buildProgress.js`
14. **Tree Building** -- `llmGenerateCore.js`, `llmGenerateProcess.js`, `proceduralTree*.js`, `layoutGenerator.js`, `growthBehaviors.js`, `visualFirst/*`, `llmTreeFeatures.js`, `settingsAware*.js`
15. **Generation Mode** -- `generationModeCore.js`, `generationModeSchools.js`, `prereqMaster*.js`
16. **Panel Chrome** -- `treeAnimation.js`, `growthStyleGenerator.js`, `llmColorSuggestion.js`, `panelInit.js`, `panelChrome.js`, `passiveLearningSettings.js`, `earlyLearningSettings.js`
17. **WebGL** -- `webglShaders.js`, `webglShapes.js`, `webglRenderer.js`, `webglRendererBuffers.js`, `webglRendererDraw.js`
18. **Testing** -- `autoTest.js`, `unificationTest.js`
19. **Entry Point** -- `main.js` (must be LAST)

## Module Patterns

### Global Attachment
```javascript
// Simple function export
function updateStatus(msg) { ... }
window.updateStatus = updateStatus;

// Object-based module
var TreeParser = { ... };
window.TreeParser = TreeParser;
```

### Prototype Extension (Multi-File Modules)
```javascript
// wheelCore.js -- creates the object
var WheelRenderer = { init: function() { ... } };

// wheelLayout.js -- extends it
WheelRenderer.calculateLayout = function() { ... };

// wheelRender.js -- extends further
WheelRenderer.render = function() { ... };
```

### Self-Registering Growth Modes
```javascript
// classicMain.js
var TreeGrowthClassic = { ... };
TreeGrowth.registerMode('CLASSIC', TreeGrowthClassic);
```

## HTML Files That Load Modules

| File | Purpose | Notes |
|------|---------|-------|
| `index.html` | Production panel (loaded by C++ Ultralight) | Full module set + i18n |
| `dev-harness.html` | Development testing with mock C++ bridge | Adds dev toolbar; omits some production-only modules |
| `browser-test.html` | Browser-based testing | Subset of modules |
| `test-runner.html` | Unit test runner in browser | Test modules only |
| `run-tests.js` | Node.js test runner | Mocks browser globals, runs `unificationTest.js` |

## Notes for LLMs

- **Read one module at a time** -- each is self-contained for its domain
- **`var` only** -- no `let`/`const` (Ultralight compatibility)
- **All modules use globals** -- no import/export
- **Settings persistence** -- handled by `settings/settingsConfig.js` via C++ bridge
- **C++ callbacks** -- all `window.on*` functions documented in [CPP_BRIDGE.md](CPP_BRIDGE.md)
- **Load order matters** -- modules depend on globals from earlier-loaded files
- **Growth modes self-register** -- each mode calls `TreeGrowth.registerMode()` at load time
