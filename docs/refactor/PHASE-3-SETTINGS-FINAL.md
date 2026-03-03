# Phase 3: settingsPanel.js -- Final Split (Config + Init + UI Helpers)

**Source file:** `modules/settingsPanel.js` (~1,860 lines after Phase 2)
**Goal:** Split the remaining settingsPanel.js into focused files and delete the original.
**Prerequisite:** Phases 1-2 complete.

## New Files

### 1. `modules/settings/settingsUIHelpers.js` (~190 lines)
**Source:** `settingsPanel.js` lines 1-79 + lines 80-189

Extract:
- `initSegmentedToggle(container, callback)` -- generic segmented toggle UI component
- `setSegmentedToggleValue(container, value)` -- programmatic value setter
- `setSegmentedToggleEnabled(container, enabled)` -- enable/disable toggle
- `updateRetrySchoolUI()` -- retry school dropdown helper
- `updateDeveloperModeVisibility()` -- dev mode toggle

**Header comment:**
```javascript
/**
 * Settings UI Helpers
 * Generic UI components used by the settings panel (segmented toggles, etc.)
 *
 * Depends on: state.js (settings)
 */
```

---

### 2. `modules/settings/settingsConfig.js` (~800 lines)
**Source:** `settingsPanel.js` lines ~1153-2264

Extract the settings persistence and config-loading callbacks:
- `loadSettings()` -- load from localStorage
- `saveSettings()` -- save to localStorage
- `autoSaveSettings()` -- debounced auto-save
- `saveUnifiedConfig()` -- save to C++ via callCpp
- `resetSettings()` -- reset to defaults
- `window.onUnifiedConfigLoaded(jsonStr)` -- C++ callback (~700 lines, the largest single callback)
- `window.onSettingsLoaded(jsonStr)` -- alias callback
- `window.onLLMConfigLoaded(jsonStr)` -- LLM config callback

**Window exports:**
```javascript
window.onUnifiedConfigLoaded = function(jsonStr) { ... };
window.onSettingsLoaded = window.onUnifiedConfigLoaded;
window.onLLMConfigLoaded = function(jsonStr) { ... };
```

**Important:** `onUnifiedConfigLoaded` calls functions from other settings/* files (theme application, modded XP rebuild, tree settings UI update). Those files must be loaded before this one.

If this file exceeds 600 LOC, split `window.onUnifiedConfigLoaded` into `modules/settings/settingsConfigLoad.js` (~700 lines for the callback) and keep save/reset in `settingsConfig.js` (~300 lines).

**Header comment:**
```javascript
/**
 * Settings Config Persistence
 * Save/load settings to localStorage and C++ backend.
 * Handles window.onUnifiedConfigLoaded callback from C++.
 *
 * Depends on: state.js, settings/settingsUIHelpers.js, settings/settingsTheme.js,
 *             settings/settingsModdedXP.js, settings/settingsHeart.js,
 *             settings/settingsTreeGen.js, i18n.js
 */
```

---

### 3. `modules/settings/settingsInit.js` (~960 lines)
**Source:** `settingsPanel.js` lines ~190-1152

Extract the main initialization function:
- `initializeSettings()` -- the single ~960-line function that wires up every settings slider, toggle, and control

**Header comment:**
```javascript
/**
 * Settings Panel Initialization
 * The main initializeSettings() function that wires up all settings UI controls.
 *
 * Depends on: state.js, config.js, constants.js, settings/settingsUIHelpers.js,
 *             settings/settingsTheme.js, settings/settingsHeart.js,
 *             settings/settingsTreeGen.js, settings/settingsConfig.js,
 *             uiHelpers.js, i18n.js, colorPicker.js
 */
```

### Sub-splitting initializeSettings()

At 960 lines, `initializeSettings()` exceeds the 600 LOC limit. To split it, extract subsection initializers as independent functions. Look for natural break points in the function body -- typically groups of DOM getElementById + addEventListener blocks for related settings:

Possible extraction targets:
- `_initXPSettings()` -- XP multiplier sliders, school XP, level scaling
- `_initSchoolColorUI()` -- school color pickers, color scheme dropdown
- `_initNotificationSettings()` -- notification toggles, duration sliders
- `_initMiscSettings()` -- developer mode, logging, debug options

Each extracted function becomes a file-scope global called from the remaining `initializeSettings()` body. If subsections are placed in separate files (e.g., `settingsInitXP.js`), load them before `settingsInit.js`.

---

## Delete Original File

After all content has been moved to `modules/settings/` files, **delete `modules/settingsPanel.js`**.

---

## Final Loading Order for All Settings Files

```html
<!-- Settings sub-modules -->
<script src="modules/settings/settingsUIHelpers.js"></script>
<script src="modules/settings/settingsTheme.js"></script>
<script src="modules/settings/settingsModdedXP.js"></script>
<script src="modules/settings/settingsHeart.js"></script>
<script src="modules/settings/settingsTreeGen.js"></script>
<!-- Settings persistence & init -->
<script src="modules/settings/settingsConfig.js"></script>
<script src="modules/settings/settingsInit.js"></script>
<!-- Settings modals (standalone) -->
<script src="modules/settings/settingsBlacklist.js"></script>
<script src="modules/settings/settingsWhitelist.js"></script>
```

---

## HTML Updates

### index.html

Replace the Phase 1/2 script tags with the final loading order above. Remove any remaining reference to `settingsPanel.js`.

### dev-harness.html, browser-test.html

Same replacement.

### run-tests.js

If it `require()`s settingsPanel, update to require the new files instead.

---

## Verification Checklist

1. [ ] All 3 new files created
2. [ ] `settingsPanel.js` deleted entirely
3. [ ] No duplicate code between settings/* files
4. [ ] Each file under 600 LOC (or sub-split notes followed)
5. [ ] All HTML files updated with final loading order
6. [ ] No remaining references to `settingsPanel.js` in any HTML file
7. [ ] `node run-tests.js` passes
8. [ ] `.\BuildRelease.ps1` succeeds
9. [ ] Manual test: open settings panel, change sliders/toggles
10. [ ] Manual test: save/load settings round-trip
11. [ ] Manual test: C++ config callback works (if testable in dev-harness)
12. [ ] Commit with descriptive message
