# Renderer Modules

All rendering subsystems that display spell trees visually. The panel supports multiple concurrent renderers: SVG wheel, Canvas 2D, WebGL, and a trusted (pre-baked) canvas path.

## Module List

### Wheel Renderer (6 files in `wheel/`)

| File | Lines | Purpose |
|------|------:|---------|
| `wheelCore.js` | 532 | Core state, initialization, school ring management |
| `wheelLayout.js` | 649 | Node positioning, arc calculations, tier spacing |
| `wheelRender.js` | 645 | Canvas drawing: nodes, edges, labels, arcs |
| `wheelChrome.js` | 261 | Legend, tooltips, zoom controls |
| `wheelInteraction.js` | 588 | Mouse events: click, drag, hover, zoom |
| `wheelGrowthDSL.js` | 461 | Growth recipe rendering on wheel |

### Canvas Renderer (6 files in `canvas/`)

| File | Lines | Purpose |
|------|------:|---------|
| `canvasCore.js` | 554 | Core state, initialization, pan/zoom, resize |
| `canvasRender.js` | 326 | Render loop, main render pipeline (background, hub, nodes, labels) |
| `canvasRenderEdges.js` | 418 | School dividers, edge rendering (multi-pass), chain edges, color utilities |
| `canvasNodes.js` | 693 | Tooltips, selection, detail display |
| `canvasInteraction.js` | 210 | Mouse/touch events: drag, zoom |
| `canvasSearch.js` | 525 | Find-spell overlay integration |

### WebGL Renderer (5 files)

| File | Lines | Purpose |
|------|------:|---------|
| `webglRenderer.js` | 447 | Core object, init, events, coordinate transforms, data management |
| `webglRendererBuffers.js` | 259 | GPU buffer updates (node, edge, divider buffers) |
| `webglRendererDraw.js` | 516 | Render pipeline, rotation, public API |
| `webglShaders.js` | 244 | Vertex and fragment shader programs |
| `webglShapes.js` | 233 | Geometry generation (circles, quads) |

### Other Renderers

| File | Lines | Purpose |
|------|------:|---------|
| `trustedRenderer.js` | 374 | Minimal canvas renderer for pre-baked positions |
| `starfield.js` | 300 | Animated starfield background effect |
| `globe3D.js` | 391 | 3D globe core: init, projection, lifecycle, render, configure, heartbeat |
| `globe3DParticles.js` | 351 | Orbiting stars, detached particle path animation |

## Architecture

### Renderer Selection

The `SmartRenderer` adapter (in `treeViewer/treeViewerCore.js`) selects the appropriate renderer based on settings and tree size:

- **Small trees** (<200 nodes) -- Wheel or Canvas
- **Medium trees** (200-2000 nodes) -- Canvas
- **Large trees** (2000+ nodes) -- WebGL (if available, falls back to Canvas)
- **Pre-baked data** -- Trusted renderer (bypasses layout engine entirely)

### Wheel Renderer (`WheelRenderer`)

SVG-based radial renderer. Built across 6 files using prototype extension on a single global:

```
wheelCore.js     → Creates WheelRenderer, init, state
wheelLayout.js   → Extends with layout algorithms
wheelRender.js   → Extends with rendering
wheelChrome.js   → Extends with UI chrome
wheelInteraction.js → Extends with interaction
wheelGrowthDSL.js   → Extends with growth recipe rendering
```

**Key features:**
- Concentric ring layout by spell tier
- School-colored arc sections
- Interactive zoom/pan with mouse wheel
- Growth DSL visualization overlays

### Canvas Renderer (`CanvasRenderer`)

2D Canvas-based renderer. Built across 6 files using prototype extension:

```
canvasCore.js        → Creates CanvasRenderer, init, viewport
canvasRender.js      → Extends with render loop and main pipeline
canvasRenderEdges.js → Extends with school dividers and edge rendering
canvasNodes.js       → Extends with node interaction
canvasInteraction.js → Extends with input handling
canvasSearch.js      → Extends with search. Final window.CanvasRenderer export
```

**Key features:**
- Efficient 2D canvas rendering with viewport culling
- Smooth pan/zoom with momentum
- Node hover tooltips and click selection
- Integrated search overlay with highlight

### WebGL Renderer (`WebGLRenderer`)

GPU-accelerated renderer using WebGL 2.0 instanced rendering for trees with thousands of nodes.

- `webglShaders.js` -- GLSL vertex/fragment shaders for nodes and edges
- `webglShapes.js` -- Procedural geometry (circle, quad, diamond)
- `webglRenderer.js` -- Core object, init, events, coordinate transforms, data management
- `webglRendererBuffers.js` -- GPU buffer updates (node, edge, divider buffers)
- `webglRendererDraw.js` -- Render pipeline, rotation, public API

**Key features:**
- Instanced rendering for 10,000+ nodes at 60fps
- Shader-based node coloring and edge drawing
- Shared zoom/pan with canvas renderer
- Fallback to Canvas if WebGL unavailable

### Trusted Renderer (`TrustedRenderer`)

Minimal canvas renderer that draws pre-baked node positions without running any layout algorithm. Used for "trusted" trees loaded from C++ that already have positions assigned.

### Starfield (`Starfield`)

Animated particle-based starfield background effect. Renders behind the main tree view using a separate canvas layer.

### Globe3D (`Globe3D`)

3D globe visualization mode. Renders spell nodes on a rotating sphere using projected 3D coordinates on a 2D canvas. Split across two files:

- `globe3D.js` -- Core object, particle init, 3D projection, lifecycle management, render, configure, heartbeat
- `globe3DParticles.js` -- Orbiting star trails, detached particle path-following animation system

## Shared Renderer Infrastructure

These modules were extracted during deduplication (Phases 3-6) to eliminate code duplication across renderers:

| Module | Purpose | Used by |
|--------|---------|---------|
| `viewTransform.js` | screenToWorld/worldToScreen, rotation animation, path interpolation | Canvas, WebGL, Wheel, Globe3D |
| `spatialIndex.js` | Grid-based spatial hash for fast node hit-testing | Canvas, WebGL |
| `panZoomController.js` | Factory for mouse-driven pan/zoom handlers | TreeGrowth, TreePreview |
| `discoveryVisibility.js` | Discovery mode visibility set builder | Canvas, WebGL |
| `tooltipManager.js` | Unified tooltip show/hide with progressive reveal | Canvas, Wheel |
| `shapeDefinitions.js` | Canonical shape vertices for node rendering | Canvas, WebGL, Wheel |
| `colorUtils.js` | Color parsing, dimming, brightening | All renderers |

