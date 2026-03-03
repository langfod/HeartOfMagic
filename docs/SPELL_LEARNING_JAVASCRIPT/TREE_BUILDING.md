# Tree Building Modules

Algorithms and engines that construct spell prerequisite trees from raw spell data. This is the computational heart of the SpellLearning panel.

## Module List

### Layout Engine (4 files)

| File | Lines | Purpose |
|------|------:|---------|
| `layoutEngineCore.js` | 619 | Core layout engine: config, positioning, grid utilities |
| `layoutEngineGrid.js` | 595 | Grid extensions: shape conformity, density stretch |
| `layoutEngineUtils.js` | 354 | Utility extensions: barycenter reordering, orphan handling, export |
| `layoutEngineRadial.js` | 597 | Radial extension: BFS growth, root positioning |

### Edge Scoring and Shape Profiles

| File | Lines | Purpose |
|------|------:|---------|
| `edgeScoring.js` | 479 | Spell element detection, tier classification, parent selection |
| `shapeProfiles.js` | 586 | Shape profiles/masks for tree silhouettes |

### Procedural Tree Builder (4 files)

| File | Lines | Purpose |
|------|------:|---------|
| `proceduralTreeConfig.js` | 134 | Blacklist/whitelist filtering helpers |
| `proceduralTreeCore.js` | 775 | Theme discovery, school tree construction, batch building |
| `proceduralTreeGenerate.js` | 837 | Simple generation, C++ callbacks, UI button handlers |
| `proceduralTreeVisualFirst.js` | 551 | Visual-first procedural tree integration |

### Settings-Aware Builder (2 files)

| File | Lines | Purpose |
|------|------:|---------|
| `settingsAwareCore.js` | 637 | Scoring, edge creation, tree context setup |
| `settingsAwareBuilder.js` | 623 | Async tree building, NLP data, public API |

### PreReqMaster (3 files)

| File | Lines | Purpose |
|------|------:|---------|
| `prereqMasterScoring.js` | 555 | NLP scoring algorithms |
| `prereqMaster.js` | 864 | NLP prerequisite discovery, C++ callback handling |
| `prereqMasterUI.js` | 864 | Panel controls, settings, progress display |

### Visual-First Builder (10 files in `visualFirst/`)

| File | Lines | Purpose |
|------|------:|---------|
| `vfConstants.js` | 17 | Constants for visual-first algorithm |
| `vfThematic.js` | 369 | Spell theme analysis, thematic similarity |
| `vfHelpers.js` | 554 | Helper utilities |
| `vfEdgeBuilding.js` | 404 | Edge construction between positioned nodes |
| `vfFuzzyGrouping.js` | 393 | Fuzzy-match clustering of spells |
| `vfPrereqLinks.js` | 396 | Prerequisite link creation and validation |
| `vfAlternatePaths.js` | 354 | Alternate path generation for redundancy |
| `vfOrganicHelpers.js` | 230 | Organic growth utility functions |
| `vfOrganicGrowth.js` | 608 | Natural-looking tree expansion algorithm |
| `vfBuilder.js` | 455 | Visual-first builder orchestrator |

### Support Modules

| File | Lines | Purpose |
|------|------:|---------|
| `treeParser.js` | 1040 | Tree JSON parsing, validation, cycle detection |
| `growthDSL.js` | 488 | Growth recipe DSL for parameterized tree styles |
| `growthBehaviors.js` | 914 | Per-school branching parameters, direction, hub detection |
| `layoutGenerator.js` | 805 | High-level layout orchestration: slice angles, school placement |

## Architecture

### Tree Building Pipeline

```
Spell Data (from C++)
    │
    ├─► Procedural Path
    │   ├── proceduralTreeConfig.js (filter spells)
    │   ├── proceduralTreeCore.js (discover themes, build school trees)
    │   └── proceduralTreeGenerate.js (UI integration, C++ callbacks)
    │
    ├─► Settings-Aware Path
    │   ├── settingsAwareCore.js (scoring, edge creation)
    │   └── settingsAwareBuilder.js (async building, NLP data)
    │
    ├─► Visual-First Path
    │   ├── vfBuilder.js (orchestrator)
    │   ├── vfFuzzyGrouping.js → vfEdgeBuilding.js → vfPrereqLinks.js
    │   └── vfOrganicGrowth.js (organic expansion)
    │
    └─► PreReqMaster Path (NLP prerequisite discovery)
        ├── prereqMasterScoring.js (NLP scoring)
        ├── prereqMaster.js (discovery engine)
        └── prereqMasterUI.js (user interface)
    │
    ▼
Layout Engine
    ├── layoutEngineCore.js (position calculation)
    ├── layoutEngineGrid.js (grid conformity)
    ├── layoutEngineRadial.js (radial/BFS layout)
    └── layoutEngineUtils.js (reordering, export)
    │
    ▼
Tree JSON → Renderer (see RENDERERS.md)
```

### Layout Engine

The `LayoutEngine` is a single global object built across 4 files using prototype extension:

1. **Core** (`layoutEngineCore.js`) -- Creates `LayoutEngine`, defines config, basic positioning, grid helpers
2. **Grid** (`layoutEngineGrid.js`) -- Adds shape-specific helpers, conformity checking, density stretch
3. **Utils** (`layoutEngineUtils.js`) -- Adds barycenter reordering, orphan nudging, export. Sets `window.LayoutEngine`
4. **Radial** (`layoutEngineRadial.js`) -- Adds `applyPositionsToTree` (BFS growth, root positioning)

### Edge Scoring

`edgeScoring.js` provides the fundamental spell relationship scoring:

| Export | Description |
|--------|-------------|
| `window.EdgeScoring` | Namespace object |
| `window.detectSpellElement` | Classify spell element from name/keywords |
| `window.getSpellTier` | Get spell difficulty tier |
| `window.scoreEdge` | Score edge quality between two spells |
| `window.isEdgeValid` | Validate edge constraints |
| `window.getBestParent` | Select optimal parent from candidates |

### Visual-First Builder

The visual-first approach inverts the traditional tree-building order: it positions nodes visually first (using grid/shape placement), then creates edges to match the visual layout. This produces more aesthetically pleasing trees.

Key exports from `vfBuilder.js`:

| Export | Description |
|--------|-------------|
| `window.VisualFirstBuilder` | Builder object |
| `window.generateVisualFirstTree` | Generate tree for one school |
| `window.generateAllVisualFirstTrees` | Generate trees for all schools |

### PreReqMaster

NLP-powered prerequisite discovery system. Uses TF-IDF scoring, fuzzy matching, and keyword analysis to suggest spell prerequisites.

- **Scoring** (`prereqMasterScoring.js`) -- Pure NLP algorithms
- **Engine** (`prereqMaster.js`) -- Discovery pipeline, C++ callback: `window.onPreReqMasterComplete`
- **UI** (`prereqMasterUI.js`) -- Panel controls, progress display: `window.PreReqMaster`

### Tree Parser

`treeParser.js` (1040 lines) is the largest single module. It provides:

- JSON schema validation for tree data
- Cycle detection and resolution
- Orphan node reattachment
- Node deduplication
- Tree structure normalization
