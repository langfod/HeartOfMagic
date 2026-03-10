# Foundation Modules

Core modules loaded first. All other modules depend on these globals.

## Module List

| File | Lines | Dependencies | Purpose |
|------|------:|-------------|---------|
| `constants.js` | 125 | None | Constants, default prompts, difficulty profiles, key codes |
| `state.js` | 407 | constants.js | Global `settings` object, `state` object, UI themes |
| `config.js` | 308 | None | `TREE_CONFIG` and `GRID_CONFIG` layout constants |
| `i18n.js` | 210 | None | Internationalization engine |

## constants.js

**No dependencies.** Must be loaded first.

Defines read-only configuration values used throughout the application:

| Global | Type | Description |
|--------|------|-------------|
| `DEFAULT_TREE_RULES` | string | Default LLM prompt for tree generation |
| `DEFAULT_COLOR_PALETTE` | object | Default school color assignments |
| `DIFFICULTY_PROFILES` | object | Difficulty presets (Novice through Master) |
| `KEY_CODES` | object | Keyboard key code mappings |

## state.js

**Depends on:** `constants.js` (uses `DEFAULT_TREE_RULES`)

Contains the two primary global state objects that nearly every module reads or writes:

### `settings` (persisted)

The `settings` object holds all user-configurable values. It is persisted to disk via the C++ bridge (`settingsConfig.js` handles save/load). Categories:

- **General**: hotkey, cheat mode, pause on focus
- **Heart animation**: pulse speed, delay, opacity
- **Tree generation**: seed, prompt, LLM model selection
- **XP and progression**: XP sources, multipliers, tier scaling
- **Scanner**: blacklist, whitelist, procedural options
- **Visual**: theme, colors, renderer selection

### `state` (runtime only)

The `state` object holds ephemeral runtime data:

- `state.treeData` -- current tree JSON
- `state.selectedSchool` -- currently selected school
- `state.selectedNode` -- currently selected spell node
- `state.editMode` -- edit mode active flag
- `state.growthMode` -- active growth visualization mode

### `UI_THEMES`

Dynamic object populated from `themes/*.json` files at startup. Each theme has `{id, name, description, cssFile}`.

## config.js

**No dependencies.** Can load in any position after constants.

### `TREE_CONFIG`

Layout configuration for tree rendering:

- `nodeSize`, `nodeSpacing` -- node dimensions and gaps
- `levelHeight`, `siblingSpacing` -- vertical/horizontal layout parameters
- `maxDepth`, `maxBranching` -- tree structure limits
- `animation` -- transition durations and easing

### `GRID_CONFIG`

Grid layout configuration for grid-based renderers:

- `cellSize`, `padding` -- grid cell dimensions
- `columns`, `rows` -- grid dimensions
- `spacing` -- inter-cell spacing

## i18n.js

**No dependencies** (but expects `lang/locale.js` and `lang/en.js` loaded before it).

Internationalization engine providing translation lookup and DOM localization.

### Exports

| Export | Type | Description |
|--------|------|-------------|
| `window.t(key, fallback)` | function | Translation lookup by key |
| `window.initI18n(locale)` | function | Initialize i18n with locale data |
| `window.applyI18nToDOM()` | function | Apply translations to `data-i18n` attributes |
| `window.getLocale()` | function | Get current locale code |
| `window.getLoadedKeys()` | function | Get all loaded translation keys |

### How Translation Works

1. `lang/locale.js` sets the active locale (e.g., `"en"`)
2. `lang/en.js` loads the English translation map
3. If locale is not `"en"`, a dynamic `<script>` tag loads `lang/{locale}.js`
4. `applyI18nToDOM()` scans for `data-i18n="key"` attributes and replaces text content
5. Runtime lookups use `t("key")` which falls back to English if key is missing
