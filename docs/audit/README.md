# JavaScript Codebase Audit

**Date:** 2026-03-03
**Last verified:** 2026-03-03 (all dedup phases complete and verified)
**Scope:** `PrismaUI/views/SpellLearning/SpellLearningPanel/` (~120 module files, ~72,600 lines)

## Audit Documents

| Document | Findings |
|----------|----------|
| [JS_AUDIT_CODE_DUPLICATION.md](JS_AUDIT_CODE_DUPLICATION.md) | ~4,000 lines of duplicated code across 40+ findings |
| [JS_AUDIT_PERFORMANCE.md](JS_AUDIT_PERFORMANCE.md) | 42 performance findings (4 critical, 10 high, 12 medium) |
| [JS_AUDIT_CPP_MIGRATION.md](JS_AUDIT_CPP_MIGRATION.md) | 10 C++ migration candidates, phased strategy |
| [JS_AUDIT_OVERSIZED_FILES.md](JS_AUDIT_OVERSIZED_FILES.md) | 39 files at or above the 600 LOC limit |

## Key Numbers

| Metric | Value |
|--------|-------|
| Total JS files (modules/) | ~120 |
| Total lines of code | ~72,600 |
| Duplicated code identified | ~4,000 lines |
| Estimated net reduction from dedup | ~2,600-3,100 lines |
| Files exceeding 600 LOC limit | 39 |
| Performance findings (critical+high) | 14 |
| Viable C++ migration candidates | 5 (phases 1-3) |

## Top Recommendations by Priority

### 1. Address Growth Mode Duplication First

The 5 growth modes (Classic, Tree, Graph, Oracle, Thematic) share ~1,600 lines of duplicated code. `applyTree()` alone is ~120 lines copy-pasted 4 times. Extracting `growthModeUtils.js` would:
- Remove ~1,200 lines of duplication
- Bring 5+ oversized files under the 600 LOC limit
- Eliminate the #1 source of divergence bugs (e.g., WebGL discovery visibility missing 'learning' state)

### 2. Create Shared Renderer Utilities

Color parsing, spatial indexing, pan/zoom, and shape definitions are duplicated across Wheel, Canvas, WebGL, and TrustedRenderer. Creating 4-5 shared utility modules would remove ~890 lines and make renderer behavior consistent.

### 3. Fix Critical Performance Issues

The WebGL buffer recreation per frame (PERF-C1) and missing element detection cache (PERF-C2) are the most impactful quick wins. Both are localized fixes that don't require architectural changes.

### 4. Enrich C++ Spell Data

Having C++ pre-compute element assignments, themes, and similarity scores during spell scanning would eliminate the most expensive JS text processing while requiring only JSON field additions to the existing bridge.

### 5. Split the Worst Oversized Files

`webglRenderer.js` (1,311 LOC) and `treeParser.js` (1,040 LOC) are the highest priority for splitting. Both have clear section boundaries.

## Possible Bug Discovered

**WebGL Discovery Visibility** (`webglRenderer.js:595-627`): Does not include `'learning'` state in the first pass of `_buildDiscoveryVisibleSet`, while Canvas (`canvasCore.js:598-633`) does include it. This means spells in the "learning" state would be invisible in discovery mode when using the WebGL renderer but visible when using the Canvas renderer. This is likely a copy-paste bug from when the code was duplicated.
