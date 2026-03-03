# Phase 1: settingsPanel.js -- Extract Modals + Theme + Modded XP

**Source file:** `modules/settingsPanel.js` (4,981 lines)
**Goal:** Extract 4 self-contained tail sections (~1,600 lines) into a new `modules/settings/` subdirectory.

## Prerequisites
- No other phases required before this one
- Ensure `modules/settings/` directory exists

## New Files

### 1. `modules/settings/settingsBlacklist.js` (~252 lines)
**Source:** `settingsPanel.js` lines 4364-4615

Extract the entire "SPELL BLACKLIST PANEL" section:
- `showBlacklistModal()`
- `hideBlacklistModal()`
- `renderBlacklistEntries()`
- `setupBlacklistListeners()`
- All helper functions within the section (search, filter, add/remove entries)

**Window exports (must be at end of file):**
```javascript
window.showBlacklistModal = showBlacklistModal;
window.hideBlacklistModal = hideBlacklistModal;
```

**Header comment:**
```javascript
/**
 * Spell Blacklist Modal
 * UI for managing spell blacklist (exclude spells from tree building)
 *
 * Depends on: state.js (settings)
 */
```

---

### 2. `modules/settings/settingsWhitelist.js` (~365 lines)
**Source:** `settingsPanel.js` lines 4617-4981

Extract the entire "WHITELIST MODAL" section:
- `BASE_GAME_PLUGINS` array
- `extractPluginFromSpell()`
- `showWhitelistModal()`
- `hideWhitelistModal()`
- `renderWhitelistEntries()`
- `filterWhitelistEntries()`
- `setAllWhitelist()`
- `setBaseOnlyWhitelist()`
- `setupWhitelistListeners()`
- All helper functions within the section

**Window exports (must be at end of file):**
```javascript
window.showWhitelistModal = showWhitelistModal;
window.hideWhitelistModal = hideWhitelistModal;
window.extractPluginFromSpell = extractPluginFromSpell;
```

**Header comment:**
```javascript
/**
 * Plugin Whitelist Modal
 * UI for managing plugin whitelist (filter which mods' spells appear in trees)
 *
 * Depends on: state.js (settings), cppCallbacks.js (spell data)
 */
```

---

### 3. `modules/settings/settingsTheme.js` (~275 lines)
**Source:** `settingsPanel.js` lines 2404-2678

Extract the entire "UI THEME SYSTEM" section:
- `loadThemesFromFolder()` (returns a Promise)
- `initializeThemeSelector()`
- `populateThemeSelector()`
- `applyTheme(themeKey)`
- `refreshThemes()`
- `getCurrentTheme()`

**No window exports currently** -- these functions are called by `initializeSettings()` and `onUnifiedConfigLoaded()` in the remaining settingsPanel.js. They are file-scope globals, which means they are accessible across script tags.

**Header comment:**
```javascript
/**
 * UI Theme System
 * Auto-discovery and application of themes from themes/ folder.
 * Themes are JSON manifests pointing to CSS files (e.g., styles.css, styles-skyrim.css).
 *
 * Depends on: state.js (settings, UI_THEMES, themesLoaded)
 */
```

---

### 4. `modules/settings/settingsModdedXP.js` (~139 lines)
**Source:** `settingsPanel.js` lines 2265-2403

Extract the entire "MODDED XP SOURCES" section:
- `addModdedXPSourceUI(sourceId, displayName, multiplier, cap, enabled)`
- `rebuildModdedXPSourcesUI()`
- `window.onModdedXPSourceRegistered` callback

**Window exports (must be at end of file):**
```javascript
window.onModdedXPSourceRegistered = function(jsonStr) { ... };
```
(This is a C++ bridge callback -- must remain at `window.onModdedXPSourceRegistered`.)

**Header comment:**
```javascript
/**
 * Modded XP Sources UI
 * Dynamic UI for external mod XP sources registered via the public API.
 * C++ calls window.onModdedXPSourceRegistered when a new source is registered.
 *
 * Depends on: state.js (settings)
 */
```

---

## Changes to Remaining settingsPanel.js

After extracting the 4 sections above, **delete** those line ranges from `settingsPanel.js`. The remaining file should be ~3,350 lines. Update its header comment to note the extracted modules:

```javascript
/**
 * Settings Panel Module (Core)
 * Handles settings UI initialization and config management.
 *
 * Split modules (loaded separately):
 *   settings/settingsTheme.js      - Theme system
 *   settings/settingsModdedXP.js   - Modded XP source UI
 *   settings/settingsBlacklist.js  - Spell blacklist modal
 *   settings/settingsWhitelist.js  - Plugin whitelist modal
 *
 * Depends on: state.js, config.js, constants.js, uiHelpers.js, i18n.js,
 *             settings/settingsTheme.js, settings/settingsModdedXP.js
 */
```

---

## HTML Updates

### index.html (line ~1859)

Replace:
```html
<script src="modules/settingsPanel.js"></script>
```

With:
```html
<!-- Settings sub-modules (loaded before core settingsPanel) -->
<script src="modules/settings/settingsTheme.js"></script>
<script src="modules/settings/settingsModdedXP.js"></script>
<!-- Settings core -->
<script src="modules/settingsPanel.js"></script>
<!-- Settings modals (standalone, loaded after) -->
<script src="modules/settings/settingsBlacklist.js"></script>
<script src="modules/settings/settingsWhitelist.js"></script>
```

### dev-harness.html (line ~869)

Same replacement pattern as index.html.

### browser-test.html (line ~151)

Same replacement pattern as index.html.

### test-runner.html

Check if it loads settingsPanel.js. If so, apply same pattern. If not, no changes needed.

### run-tests.js (Node)

Check if it `require()`s settingsPanel.js. If not, no changes needed. (It likely does not -- it only loads core computation modules.)

---

## Verification Checklist

1. [x] `modules/settings/` directory created
2. [x] All 4 new files created with correct content
3. [x] Lines removed from `settingsPanel.js` (no duplicate code)
4. [x] `settingsPanel.js` header comment updated
5. [x] `index.html` script tags updated in correct order
6. [x] `dev-harness.html` script tags updated
7. [x] `browser-test.html` script tags updated
8. [x] `node run-tests.js` passes
9. [x] `.\BuildRelease.ps1` succeeds
10. [ ] Manual test: open dev-harness, verify blacklist modal opens/closes
11. [ ] Manual test: verify whitelist modal opens/closes
12. [ ] Manual test: verify theme switching works
13. [ ] Commit with descriptive message
