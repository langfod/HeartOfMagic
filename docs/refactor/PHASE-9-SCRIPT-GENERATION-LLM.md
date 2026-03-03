# Phase 9: script.js Dissolution + generationModeUI.js + llmIntegration.js

**Source files:**
- `script.js` (1,512 lines) -- legacy main file with mixed concerns
- `modules/generationModeUI.js` (1,164 lines)
- `modules/llmIntegration.js` (1,095 lines)

**Goal:** Dissolve `script.js` entirely into proper modules. Split remaining medium files.
**Prerequisite:** Phases 1-8 complete.

---

## Part A: script.js Dissolution

`script.js` is the original monolithic file that has been partially dismantled over time. Its remaining contents are a grab-bag of unrelated features. Dissolve it completely.

### 1. `modules/growthStyleGenerator.js` (~280 lines)
**Source:** `script.js` lines ~27-344

Extract "GROWTH STYLE GENERATOR UI":
- `initializeGrowthStyleGenerator()`
- `onGenerateGrowthStyles()`
- `displaySchoolStyleCards()`
- `regenerateSchoolStyle()`
- `onApplyGrowthStyles()`
- `generateGrowthRecipesViaLLM()`

**Header:**
```javascript
/**
 * Growth Style Generator UI
 * LLM-powered generation of growth style recipes for spell trees.
 *
 * Depends on: state.js (settings, state), llmIntegration.js (callOpenRouterAPI)
 */
```

---

### 2. `modules/llmColorSuggestion.js` (~130 lines)
**Source:** `script.js` lines ~409-539

Extract "LLM COLOR SUGGESTION":
- `suggestSchoolColorsWithLLM()`
- `handleColorSuggestionResponse()`
- `window._colorSuggestionCallback`

---

### 3. `modules/panelInit.js` (~165 lines)
**Source:** `script.js` lines ~540-704

Extract "INITIALIZATION":
- `initializePanel()` -- initial panel UI setup
- `initializeTextareaEnterKey()`
- Any DOMContentLoaded handler in this section

**Note:** Check for conflicts with `modules/main.js` DOMContentLoaded handler. If both exist, merge or have one call the other.

---

### 4. `modules/panelChrome.js` (~375 lines)
**Source:** `script.js` lines ~705-1079

Extract panel UI chrome:
- `toggleFullscreen()` / `applyFullscreenState()`
- `initializeKeyboardShortcuts()`
- `initializeTabs()` / `switchTab()`
- `initializePromptEditor()`
- `toggleSettings()`
- `applyWindowPositionAndSize()`
- `initializeDragging()` / `initializeResizing()`

---

### 5. `modules/passiveLearningSettings.js` (~110 lines)
**Source:** `script.js` lines ~1080-1189

Extract "PASSIVE LEARNING SETTINGS":
- `initializePassiveLearningSettings()`
- `updatePassiveLearningVisibility()`
- `updatePassiveLearningUI()`

---

### 6. `modules/earlyLearningSettings.js` (~295 lines)
**Source:** `script.js` lines ~1190-1483

Extract "EARLY SPELL LEARNING SETTINGS":
- `initializeEarlyLearningSettings()`
- `initializePowerStepsUI()`
- `renderPowerSteps()`
- `onPowerStepInputChange()`
- `resetPowerStepsToDefaults()`
- `setupEarlyLearningSlider()`
- `updateEarlyLearningSettingsVisibility()`
- `updateEarlyLearningUI()`

---

### 7. Small remainder (~30 lines)
**Source:** `script.js` lines ~1484-1512

The "UI HELPERS" tail section (`setStatusIcon`, `updateCharCount`).
- Merge into existing `modules/uiHelpers.js` (currently ~515 lines -- check if it stays under 600 after merge)
- If `uiHelpers.js` would exceed 600, keep as `modules/uiStatusHelpers.js`

### Delete original: `script.js`

---

## Part B: generationModeUI.js

### 1. `modules/generationModeCore.js` (~540 lines)
**Source:** lines 1-540

Mode UI core:
- `initGenerationModeUI()`
- Seed controls
- LLM prompt helpers
- Visual-first config UI
- `generateFinalPrompt()`
- `getGenerationOptions()`

---

### 2. `modules/generationModeSchools.js` (~625 lines)
**Source:** lines 540-1164

Per-school UI:
- School control panel creation
- Per-school configuration toggles
- `rerunSchool()`, `buildSchoolTreeOnly()`
- `mergeSchoolTree()`
- All `window.X` exports from the original file

### Delete original: `modules/generationModeUI.js`

---

## Part C: llmIntegration.js

### 1. `modules/llmGenerateCore.js` (~500 lines)
**Source:** lines 1-500

LLM generation core:
- Output helpers
- Availability check
- Correction/refinement requests
- `startFullAutoGenerate()` -- main LLM auto-generation entry
- `resetFullAutoButton()`
- `retryFailedSchools()`

---

### 2. `modules/llmGenerateProcess.js` (~595 lines)
**Source:** lines 500-1095

LLM processing and callbacks:
- `startLLMAutoGenerate()` -- per-school LLM generation
- `processNextLLMSchool()` -- queue processing
- `window.onLLMStatus` callback
- `window.onLLMQueued` / `window.onLLMPollResult` callbacks
- `finishLLMGeneration()`
- `saveTreeToFile()`
- ISL/DEST detection settings: `window.onISLDetectionUpdate`, `window.onDESTDetectionUpdate`

**Window exports:** All LLM callbacks.

### Delete original: `modules/llmIntegration.js`

---

## Script Loading Order

### Replace script.js (line ~1931):
```html
<!-- Panel initialization and chrome (was script.js) -->
<script src="modules/growthStyleGenerator.js"></script>
<script src="modules/llmColorSuggestion.js"></script>
<script src="modules/panelInit.js"></script>
<script src="modules/panelChrome.js"></script>
<script src="modules/passiveLearningSettings.js"></script>
<script src="modules/earlyLearningSettings.js"></script>
```

### Replace generationModeUI.js (line ~1922):
```html
<script src="modules/generationModeCore.js"></script>
<script src="modules/generationModeSchools.js"></script>
```

### Replace llmIntegration.js (line ~1911):
```html
<script src="modules/llmGenerateCore.js"></script>
<script src="modules/llmGenerateProcess.js"></script>
```

---

## modules/main.js Update

`main.js` is the DOMContentLoaded entry point that calls init functions from many modules. After script.js is dissolved, verify that:
- `initializePanel()` is still called (now from `panelInit.js`)
- `initializeTabs()` is still called (now from `panelChrome.js`)
- `initializeKeyboardShortcuts()` is still called
- `initializePassiveLearningSettings()` is still called
- `initializeEarlyLearningSettings()` is still called
- All other init calls from the dissolved script.js still work

---

## Verification Checklist

1. [ ] All new files created with correct content
2. [ ] `script.js` deleted entirely
3. [ ] `generationModeUI.js` and `llmIntegration.js` deleted
4. [ ] No leftover references to deleted files in any HTML
5. [ ] `modules/main.js` still initializes everything correctly
6. [ ] Each file under 600 LOC
7. [ ] All HTML files updated
8. [ ] `node run-tests.js` passes
9. [ ] `.\BuildRelease.ps1` succeeds
10. [ ] Manual test: tabs work, panel dragging/resizing works
11. [ ] Manual test: fullscreen toggle, keyboard shortcuts
12. [ ] Manual test: growth style generator
13. [ ] Manual test: LLM generation flow
14. [ ] Manual test: passive/early learning settings
15. [ ] Commit with descriptive message

---

## Post-All-Phases Cleanup

After completing all 9 phases:

1. **Update `modules/README.md`** -- rewrite entire file with new module table, directory structure, and load order
2. **Update `docs/DESIGN.md`** -- if it documents UI module architecture
3. **Update `CLAUDE.md`** Key Locations table -- PrismaUI module paths changed (new subdirectories: `settings/`, `visualFirst/`, `wheel/`, `canvas/`, `treeViewer/`)
4. **Verify all 6 HTML files** have consistent script loading orders:
   - `index.html`
   - `dev-harness.html`
   - `browser-test.html`
   - `wheel-test.html`
   - `test-runner.html`
   - `real-data-sim.html` / `config-demo.html` / `tree-preview.html` (check if they load any split modules)
5. **Run full test suite**: `node run-tests.js`
6. **Run C++ build**: `.\BuildRelease.ps1`
7. **Final commit** with documentation updates
