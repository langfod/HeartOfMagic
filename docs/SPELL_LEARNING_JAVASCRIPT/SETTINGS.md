# Settings Modules

Settings panel subsystems handling user configuration, preset management, and config persistence via the C++ bridge.

## Module List

### Settings Panel (13 files in `settings/`)

| File | Lines | Purpose |
|------|------:|---------|
| `settingsUIHelpers.js` | 182 | Developer mode visibility, shared UI helpers |
| `settingsTheme.js` | 282 | Theme selection and application |
| `settingsModdedXP.js` | 146 | Modded XP source registration callbacks |
| `settingsHeartUI.js` | 196 | Heart settings UI construction and layout |
| `settingsHeart.js` | 600 | Heart of Magic core gameplay settings |
| `settingsTreeGen.js` | 366 | Tree generation presets and settings UI |
| `settingsTreeGenInit.js` | 544 | Tree generation settings initialization |
| `settingsInitXP.js` | 267 | XP-related control initialization |
| `settingsInitTreeProc.js` | 250 | Tree processing control initialization |
| `settingsConfig.js` | 345 | Save/load settings to C++ backend (UnifiedConfig) |
| `settingsConfigLoadUI.js` | 447 | Apply loaded config values to UI controls |
| `settingsConfigLoad.js` | 345 | C++ callback for unified config loading |
| `settingsInit.js` | 495 | Settings initialization orchestrator |
| `settingsBlacklist.js` | 259 | Spell blacklist modal |
| `settingsWhitelist.js` | 372 | Plugin whitelist modal |

### Preset Management (2 files, top-level)

| File | Lines | Purpose |
|------|------:|---------|
| `settingsPresets.js` | 835 | User configuration presets (progression, early spell, tome) |
| `scannerPresets.js` | 732 | Scanner configuration presets |

## Architecture

### Settings Initialization Flow

```
main.js: DOMContentLoaded
    │
    ├── initializeSettings()           ← settingsInit.js
    │   ├── initializeHeartSettings()  ← settingsHeart.js
    │   ├── initializeTreeGenSettings()← settingsTreeGenInit.js
    │   ├── initializeXPSettings()     ← settingsInitXP.js
    │   ├── initializeTreeProcSettings()← settingsInitTreeProc.js
    │   └── initializeThemeSettings()  ← settingsTheme.js
    │
    └── (C++ triggers config load)
        └── window.onUnifiedConfigLoaded() ← settingsConfigLoad.js
            └── applyLoadedConfig()        ← settingsConfigLoadUI.js
```

### Config Persistence

`settingsConfig.js` manages the save/load cycle through the C++ bridge:

1. **Save**: Collects all setting values from the `settings` global → serializes to JSON → calls C++ `saveUnifiedConfig(json)`
2. **Load**: C++ calls `window.onUnifiedConfigLoaded(json)` → `settingsConfigLoad.js` parses → `settingsConfigLoadUI.js` applies to UI controls

### Key Exports

| Export | Module | Description |
|--------|--------|-------------|
| `window.updateDeveloperModeVisibility` | settingsUIHelpers.js | Show/hide dev-only controls |
| `window.onModdedXPSourceRegistered` | settingsModdedXP.js | Callback when external mod registers XP source |
| `window.applyTreeGenerationPreset` | settingsTreeGen.js | Apply a tree generation preset by name |
| `window.updateTreeSettingsUI` | settingsTreeGen.js | Refresh tree settings UI from current values |
| `window.TREE_GENERATION_PRESETS` | settingsTreeGen.js | Named preset definitions |
| `window.onUnifiedConfigLoaded` | settingsConfigLoad.js | C++ callback for config load |
| `window.onSettingsLoaded` | settingsConfigLoad.js | Legacy callback |
| `window.onLLMConfigLoaded` | settingsConfigLoad.js | LLM config load callback |
| `window.showBlacklistModal` | settingsBlacklist.js | Open spell blacklist editor |
| `window.showWhitelistModal` | settingsWhitelist.js | Open plugin whitelist editor |
| `window.extractPluginFromSpell` | settingsWhitelist.js | Extract plugin name from spell formId |

### Heart Settings

The "Heart of Magic" section (`settingsHeart.js` + `settingsHeartUI.js`) covers core gameplay settings:

- XP multipliers and scaling
- Learning difficulty presets
- Tome study settings
- Spell effectiveness scaling
- Heart animation visual settings

### Theme Management

`settingsTheme.js` handles theme loading and application:

1. Reads `themes/manifest.json` to get available themes
2. Loads theme JSON files from `themes/`
3. Applies theme CSS by swapping stylesheet link
4. Theme changes are persisted in `settings.theme`

### Preset System

Two independent preset systems for different config domains:

**Settings Presets** (`settingsPresets.js`):
- Save/load/delete/rename user configuration presets
- Covers: progression settings, early spell learning, tome settings
- Chip-based UI for quick preset selection

**Scanner Presets** (`scannerPresets.js`):
- Save/load/delete/rename scanner configuration presets
- Covers: scan options, blacklist, whitelist, procedural settings
- Independent from settings presets
