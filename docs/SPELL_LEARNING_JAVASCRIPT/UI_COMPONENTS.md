# UI Component Modules

Panel chrome, button handlers, edit mode, progression display, tree preview, and other user interface modules.

## Module List

### Panel Chrome

| File | Lines | Purpose |
|------|------:|---------|
| `panelInit.js` | 153 | Button wiring, textarea enter key handling |
| `panelChrome.js` | 383 | Fullscreen toggle, keyboard shortcuts, tab navigation, dragging, resizing |

### Button Handlers

| File | Lines | Purpose |
|------|------:|---------|
| `buttonHandlers.js` | 299 | Scan, learn, import/export button click handlers |

### Edit Mode (3 files)

| File | Lines | Purpose |
|------|------:|---------|
| `editModeCore.js` | 603 | State, toolbar, mode switching, undo stack, mouse dispatch |
| `editModeTools.js` | 623 | Move, pen, eraser mouse handlers, node deletion |
| `editModeOps.js` | 632 | Render overlay, save/sync, prereq editing, spell spawn |

### Progression

| File | Lines | Purpose |
|------|------:|---------|
| `progressionUI.js` | 968 | How-To-Learn panel, Learning Status Badge, XP progression |

### Tree Viewer (4 files in `treeViewer/`)

| File | Lines | Purpose |
|------|------:|---------|
| `treeViewerCore.js` | 544 | SmartRenderer adapter, tree init, import/export, merge |
| `treeViewerLoader.js` | 652 | Trusted fast-path loading, standard TreeParser path |
| `treeViewerDetails.js` | 608 | Spell details panel: info, prereqs, progression, learn/unlock |
| `treeViewerFind.js` | 291 | Find-spell search, highlight, keyboard nav, pan-to-node |

### Tree Preview (7 files)

| File | Lines | Purpose |
|------|------:|---------|
| `treePreviewUtils.js` | 180 | Shared drag input helpers |
| `sunGridLinear.js` | 111 | Sun grid plugin: linear equal-spaced radial grid |
| `sunGridEqualArea.js` | 135 | Sun grid plugin: equal-area cell radial grid |
| `sunGridFibonacci.js` | 84 | Sun grid plugin: Fibonacci spiral radial grid |
| `sunGridSquare.js` | 118 | Sun grid plugin: square grid overlay |
| `treePreviewSun.js` | 880 | SUN (radial/wheel) preview mode |
| `treePreviewFlat.js` | 604 | FLAT (linear) preview mode |
| `treePreview.js` | 885 | Preview orchestrator: mode switching, shared canvas |

### Other UI

| File | Lines | Purpose |
|------|------:|---------|
| `colorUtils.js` | 329 | School color management, dynamic CSS, color conversions |
| `colorPicker.js` | 373 | Color picker component |
| `uiHelpers.js` | 434 | Status updates, spell filtering, minimize/close, formID helpers |
| `spellCache.js` | 127 | Async spell data caching |
| `easyMode.js` | 314 | Simplified scanner UI with big preset chips |
| `treeAnimation.js` | 570 | Two-phase build replay animation |
| `buildProgress.js` | 309 | Build progress modal during generation |
| `treeCore.js` | 188 | Globe position/size state management |
| `passiveLearningSettings.js` | 112 | Passive learning settings UI |
| `earlyLearningSettings.js` | 296 | Early spell learning settings UI |

## Architecture

### Edit Mode

Built across 3 files using prototype extension on the `EditMode` global:

```
editModeCore.js  → Creates EditMode, toolbar, undo stack, mouse dispatch
editModeTools.js → Extends with tool implementations (move, pen, eraser)
editModeOps.js   → Extends with operations (render, save, prereq edit, spawn)
```

**Tools available in edit mode:**
- **Move** -- Drag nodes to new positions
- **Pen** -- Draw new edges between nodes
- **Eraser** -- Remove edges or nodes
- **Spawn** -- Create duplicate spell nodes

**Key exports:**
| Export | Module | Description |
|--------|--------|-------------|
| `EditMode` (global) | editModeCore.js | Edit mode singleton |
| `window.onAllSpellsReceived` | editModeOps.js | Callback when spell list loaded |
| `window.updateSpellData` | editModeOps.js | Hook for edit mode spell data updates |

### Progression UI

`progressionUI.js` manages the "How To Learn" panel and Learning Status Badge:

| Export | Description |
|--------|-------------|
| `window.onProgressUpdate` | XP progress update from C++ |
| `window.onSpellReady` | Spell ready to learn notification |
| `window.onSpellUnlocked` | Spell unlocked notification |
| `window.onLearningTargetSet` | Learning target changed |
| `window.onProgressData` | Batch progress data load |

### Tree Viewer

The tree viewer is the main display area where spell trees are rendered:

1. **Core** (`treeViewerCore.js`) -- `SmartRenderer` adapter auto-selects renderer by tree size
2. **Loader** (`treeViewerLoader.js`) -- Two loading paths:
   - **Trusted** -- Pre-baked positions from C++, bypasses layout engine
   - **Standard** -- Raw tree JSON through `TreeParser` + `LayoutEngine`
3. **Details** (`treeViewerDetails.js`) -- Spell info panel on node selection
4. **Find** (`treeViewerFind.js`) -- Ctrl+F search with highlight and keyboard navigation

### Tree Preview

Two preview modes for visualizing tree layout before committing:

- **SUN** (`treePreviewSun.js`) -- Radial/wheel preview with pluggable grid types
- **FLAT** (`treePreviewFlat.js`) -- Linear square-grid preview

Grid plugins (`sunGrid*.js`) register with `TreePreviewSun` at load time. The `treePreview.js` orchestrator manages tab switching between modes.

### Easy Mode

`easyMode.js` provides a simplified scanner interface for users who don't need full control. Shows large preset chips that map to predefined scanner configurations, with relay buttons to the Complex page for advanced users.
