# PrismaUI JavaScript Refactoring Plan

**Branch:** `js_refactor`
**Status:** Phase 4 complete

## Problem

17 JavaScript files in `PrismaUI/views/SpellLearning/SpellLearningPanel/` exceed the project's 600 LOC limit. The worst offender, `settingsPanel.js`, is 4,981 lines with 7+ unrelated subsystems.

## Approach

Split into 9 phases, each independently commitable and testable. Each phase document specifies exactly which lines move where, what `window.X` exports must be preserved, and which HTML files need updating.

## Phase Documents

| Phase | Document | Files Split | ~Lines | Status |
|-------|----------|-------------|-------:|--------|
| 1 | [PHASE-1-SETTINGS-MODALS-THEME.md](PHASE-1-SETTINGS-MODALS-THEME.md) | settingsPanel.js (partial) | 1,030 | **Done** |
| 2 | [PHASE-2-SETTINGS-HEART-TREEGEN.md](PHASE-2-SETTINGS-HEART-TREEGEN.md) | settingsPanel.js (partial) | 1,490 | **Done** |
| 3 | [PHASE-3-SETTINGS-FINAL.md](PHASE-3-SETTINGS-FINAL.md) | settingsPanel.js (final) | 1,860 | **Done** |
| 4 | [PHASE-4-VISUAL-FIRST-BUILDER.md](PHASE-4-VISUAL-FIRST-BUILDER.md) | visualFirstBuilder.js | 3,686 | **Done** |
| 5 | [PHASE-5-RENDERERS.md](PHASE-5-RENDERERS.md) | wheelRenderer + canvasRendererV2 | 6,232 | |
| 6 | [PHASE-6-PROCEDURAL-PREREQ.md](PHASE-6-PROCEDURAL-PREREQ.md) | proceduralTreeBuilder + prereqMaster | 4,543 | |
| 7 | [PHASE-7-EDIT-VIEWER-GROWTH.md](PHASE-7-EDIT-VIEWER-GROWTH.md) | editMode + treeViewerUI + treeGrowthTree | 6,291 | |
| 8 | [PHASE-8-LAYOUT-CALLBACKS.md](PHASE-8-LAYOUT-CALLBACKS.md) | layoutEngine + classicLayout + cppCallbacks + settingsAwareTreeBuilder | 6,144 | |
| 9 | [PHASE-9-SCRIPT-GENERATION-LLM.md](PHASE-9-SCRIPT-GENERATION-LLM.md) | script.js + generationModeUI + llmIntegration | 3,771 | |

**Total:** ~35,047 lines reorganized into ~65 new files

## New Directories Created

| Directory | Phase | Contents |
|-----------|-------|----------|
| `modules/settings/` | 1-3 | Settings panel subsystems |
| `modules/visualFirst/` | 4 | Visual-first tree builder |
| `modules/wheel/` | 5 | SVG wheel renderer |
| `modules/canvas/` | 5 | Canvas 2D renderer |
| `modules/treeViewer/` | 7 | Tree viewer + spell details |

## Verification (Every Phase)

1. `node run-tests.js` passes
2. `.\BuildRelease.ps1` succeeds
3. Manual smoke test in dev-harness

## Key Constraints

- **`var` only** (Ultralight compatibility)
- **No bundler** -- raw `<script>` tags in dependency order
- **All `window.X` exports preserved** -- C++ bridge callbacks must not break
- **6 HTML files** must be updated: `index.html`, `dev-harness.html`, `browser-test.html`, `wheel-test.html`, `test-runner.html`, `run-tests.js` (Node)
