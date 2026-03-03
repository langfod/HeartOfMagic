# Phase 2: settingsPanel.js -- Extract Heart Settings + Tree Generation Settings

**Source file:** `modules/settingsPanel.js` (~3,350 lines after Phase 1)
**Goal:** Extract 2 more large subsections (~1,490 lines).
**Prerequisite:** Phase 1 complete.

## New Files

### 1. `modules/settings/settingsHeart.js` (~530 lines)
**Source:** `settingsPanel.js` lines 2679-3401 (original numbering)

Extract the entire "HEART ANIMATION SETTINGS" section plus the UI update helpers that immediately precede it:
- `applyLearningColor(styleId, color)` and related learning color helpers
- `applyFontSizeMultiplier(multiplier)`
- `updateEarlyLearningUI()`
- `updateSpellTomeLearningUI()`
- `updateNotificationsUI()`
- `initializeHeartSettings()` -- the heart animation popup initializer (~500 lines)
- Internal flag: `window._heartSettingsInitialized`

**Header comment:**
```javascript
/**
 * Heart Settings & UI Update Helpers
 * Heart animation popup configuration and learning display helpers.
 *
 * Depends on: state.js (settings), settings/settingsUIHelpers.js (segmented toggles)
 */
```

---

### 2. `modules/settings/settingsTreeGen.js` (~960 lines)
**Source:** `settingsPanel.js` lines 3402-4363 (original numbering)

Extract the entire "DYNAMIC TREE BUILDING SETTINGS" section:
- `TREE_GENERATION_PRESETS` object
- `applyTreeGenerationPreset(presetKey)`
- `updateTreeSettingsUI()`
- `initializeDynamicTreeBuildingSettings()` (~400 lines)
- `initializeLLMFeaturesSection()`
- Globe settings helpers (`updateGlobeSettingsVisibility`, etc.)
- Scoring factor helpers

**Window exports (must be at end of file):**
```javascript
window.applyTreeGenerationPreset = applyTreeGenerationPreset;
window.updateTreeSettingsUI = updateTreeSettingsUI;
window.TREE_GENERATION_PRESETS = TREE_GENERATION_PRESETS;
```

**Header comment:**
```javascript
/**
 * Dynamic Tree Building Settings
 * Tree generation presets, scoring factors, LLM features, and globe settings.
 *
 * Depends on: state.js (settings), config.js, settings/settingsUIHelpers.js,
 *             i18n.js (t()), uiHelpers.js
 */
```

### Sub-split: settingsTreeGenLLM.js

If `settingsTreeGen.js` exceeds 600 LOC, extract the LLM Features subsection (~220 lines at original lines ~4144-4363) into `modules/settings/settingsTreeGenLLM.js`:
- `initializeLLMFeaturesSection()`
- LLM-specific UI toggle handlers

This keeps both files under the 600 LOC limit.

---

## Changes to Remaining settingsPanel.js

After extracting, delete the source line ranges. The remaining file should be ~1,860 lines containing:
- Segmented toggle helpers (lines 1-79)
- `updateRetrySchoolUI()`, `updateDeveloperModeVisibility()` (lines 80-189)
- `initializeSettings()` (lines 190-1152)
- Settings persistence: `loadSettings`, `saveSettings`, `autoSaveSettings`, `saveUnifiedConfig`, `resetSettings` (lines 1153-1477)
- Config loading callbacks: `onUnifiedConfigLoaded`, `onSettingsLoaded`, `onLLMConfigLoaded` (lines 1478-2264)

---

## HTML Updates

### index.html

Insert before the settingsPanel.js tag (after settingsModdedXP.js):
```html
<script src="modules/settings/settingsHeart.js"></script>
<script src="modules/settings/settingsTreeGen.js"></script>
```

If LLM sub-split was done:
```html
<script src="modules/settings/settingsHeart.js"></script>
<script src="modules/settings/settingsTreeGen.js"></script>
<script src="modules/settings/settingsTreeGenLLM.js"></script>
```

### dev-harness.html, browser-test.html

Same insertion pattern.

---

## Verification Checklist

1. [ ] New files created with correct content
2. [ ] Lines removed from `settingsPanel.js`
3. [ ] Each new file is under 600 LOC (or sub-split performed)
4. [ ] HTML files updated with correct loading order
5. [ ] `node run-tests.js` passes
6. [ ] `.\BuildRelease.ps1` succeeds
7. [ ] Manual test: tree generation presets apply correctly
8. [ ] Manual test: heart settings popup opens/configures correctly
9. [ ] Commit with descriptive message
