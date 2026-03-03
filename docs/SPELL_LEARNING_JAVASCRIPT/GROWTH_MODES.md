# Growth Mode Modules

Five visual growth modes that control how spell trees are built and rendered in the Tree Growth section of the panel. Each mode self-registers with the `TreeGrowth` orchestrator at load time.

## Module List

### TreeGrowth Orchestrator

| File | Lines | Purpose |
|------|------:|---------|
| `treeGrowth.js` | 621 | Mode registry, active mode switching, shared growth section management |

### Classic Mode (7 files in `classic/`)

| File | Lines | Purpose |
|------|------:|---------|
| `classicRenderer.js` | 302 | Canvas rendering: nodes, edges, corridors, labels |
| `classicThemeEngine.js` | 477 | JS-side dynamic theme discovery for spell matching |
| `classicLayoutCore.js` | 598 | Grid-aware BFS positioning on grid dots from Root Base preview |
| `classicLayoutSpell.js` | 623 | Placement search, tree sanitization, force-placement |
| `classicLayoutGrid.js` | 586 | BFS wave-based fair grid layout algorithm (4 phases) |
| `classicSettings.js` | 426 | Classic mode settings panel UI |
| `classicMain.js` | 725 | Mode orchestrator. Registers as `'CLASSIC'` with TreeGrowth |

### Tree Mode (7 files in `tree/`)

| File | Lines | Purpose |
|------|------:|---------|
| `treeRenderer.js` | 298 | Canvas rendering: trunk, branches, ghost nodes |
| `treeTrunk.js` | 270 | Trunk corridor computation, grid point filtering |
| `treeSettings.js` | 170 | Tree mode settings panel UI + allocation bar |
| `treeGrowthTree.js` | 596 | Core: trunk-first tree building, 3-section allocation |
| `treeGrowthTreeRender.js` | 572 | Rendering, cache management, layout orchestration |
| `treeGrowthTreeLayout.js` | 594 | Grid building, node prep, root/trunk placement |
| `treeGrowthTreeAnim.js` | 605 | Branch/root growth, catch-all placement. Registers `'TREE'` |

### Graph Mode (4 files in `graph/`)

| File | Lines | Purpose |
|------|------:|---------|
| `graphRenderer.js` | 310 | Canvas rendering for graph layout |
| `graphLayout.js` | 338 | Edmonds' minimum spanning arborescence positioning |
| `graphSettings.js` | 162 | Graph mode settings panel UI |
| `graphMain.js` | 617 | Mode orchestrator. Deterministic. Registers `'GRAPH'` |

### Oracle Mode (4 files in `oracle/`)

| File | Lines | Purpose |
|------|------:|---------|
| `oracleRenderer.js` | 424 | Canvas rendering for oracle layout |
| `oracleLayout.js` | 525 | Parallel lane placement (thematic chains as railroad tracks) |
| `oracleSettings.js` | 504 | Oracle mode settings panel UI |
| `oracleMain.js` | 654 | Mode orchestrator. Registers `'ORACLE'` |

### Thematic Mode (4 files in `thematic/`)

| File | Lines | Purpose |
|------|------:|---------|
| `thematicRenderer.js` | 495 | Canvas rendering for thematic layout |
| `thematicLayout.js` | 679 | Thematic layout positioning algorithm |
| `thematicSettings.js` | 232 | Thematic mode settings panel UI |
| `thematicMain.js` | 692 | Mode orchestrator. Registers `'THEMATIC'` |

## Architecture

### TreeGrowth Orchestrator

`treeGrowth.js` manages the growth mode lifecycle:

```javascript
// Mode registration (done by each mode at load time)
TreeGrowth.registerMode('CLASSIC', TreeGrowthClassic);
TreeGrowth.registerMode('TREE', TreeGrowthTree);
TreeGrowth.registerMode('GRAPH', TreeGrowthGraph);
TreeGrowth.registerMode('ORACLE', TreeGrowthOracle);
TreeGrowth.registerMode('THEMATIC', TreeGrowthThematic);

// Mode switching (triggered by UI tab selection)
TreeGrowth.activateMode('CLASSIC');
```

Each registered mode implements a standard interface:
- `init()` -- Initialize mode UI and state
- `activate()` -- Called when mode becomes active
- `deactivate()` -- Called when switching away
- `buildTree(schoolData)` -- Build tree for given school data
- `render()` -- Render the current tree state

### Multi-File Module Pattern

Each growth mode uses prototype extension across multiple files:

```
*Renderer.js   → Canvas drawing primitives
*Layout.js     → Position calculations
*Settings.js   → UI control panel
*Main.js       → Orchestrator, mode registration (loaded LAST)
```

The `*Main.js` file must be loaded last because it calls `TreeGrowth.registerMode()`.

### Classic Mode

Grid-based layout with BFS wave positioning. Uses the Root Base preview grid dots as placement targets.

- **Theme Engine** (`classicThemeEngine.js`) -- JS-side spell name/keyword analysis for smart grouping
- **Layout** operates in 4 phases: initial placement, gap filling, compaction, finalization
- Supports corridor rendering between connected groups

### Tree Mode

Trunk-first vertical tree with 3-section allocation (roots, trunk, branches).

- **Trunk** (`treeTrunk.js`) -- Computes the central trunk corridor
- **Layout** allocates spells into root/trunk/branch sections based on tier
- **Animation** (`treeGrowthTreeAnim.js`) -- Animated branch/root growth sequence

### Graph Mode

Deterministic layout using Edmonds' minimum spanning arborescence algorithm. Produces consistent tree structures regardless of rendering.

### Oracle Mode

Parallel lane layout inspired by Factorio's belt systems. Organizes spell chains as horizontal lanes (railroad tracks) with vertical connections.

### Thematic Mode

Groups spells by thematic similarity and positions clusters in organic arrangements. Uses the thematic analysis from `visualFirst/vfThematic.js`.
