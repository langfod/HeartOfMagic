# LLM Integration Modules

Modules handling LLM (Large Language Model) integration for tree generation, spell classification, color suggestion, and growth style generation via OpenRouter API.

## Module List

| File | Lines | Purpose |
|------|------:|---------|
| `llmApiSettings.js` | 245 | OpenRouter API configuration UI (key, model selection) |
| `llmGenerateCore.js` | 472 | LLM generation core: status handling, school retry, attention tracking |
| `llmGenerateProcess.js` | 622 | LLM processing pipeline: queue/poll, ISL/DEST detection |
| `llmTreeFeatures.js` | 750 | LLM-powered spell classification, theme discovery, keyword expansion |
| `llmColorSuggestion.js` | 133 | School color suggestion via C++ bridge LLM |
| `generationModeCore.js` | 538 | Generation mode UI: seed controls, prompts, visual-first config |
| `generationModeSchools.js` | 630 | Per-school control panels, shape/density settings, merge ops |
| `growthStyleGenerator.js` | 385 | Growth style recipe generation via OpenRouter API |

## Architecture

### Generation Pipeline

```
User clicks "Generate"
    │
    ├── generationModeCore.js
    │   ├── getCurrentSeed() / generateNewSeed()
    │   ├── generateFinalPrompt()
    │   └── getGenerationOptions()
    │
    ├── generationModeSchools.js
    │   ├── getSchoolConfig() (per-school shape/density)
    │   └── rerunSchool() / regenerateSelectedSchools()
    │
    ├── llmGenerateCore.js
    │   ├── Handles status updates from C++
    │   ├── retrySpecificSchool()
    │   └── getSchoolsNeedingAttention()
    │
    └── llmGenerateProcess.js
        ├── Queue management
        ├── Poll result processing
        └── ISL/DEST detection updates
```

### Key Exports

#### llmApiSettings.js
| Export | Description |
|--------|-------------|
| `window.onLLMConfigLoaded` | Callback when LLM config is loaded from C++ |
| `window.onLLMConfigSaved` | Callback when LLM config save completes |

#### llmGenerateCore.js
| Export | Description |
|--------|-------------|
| `window.onLLMStatus` | Status callback from C++ during LLM generation |
| `window.retrySpecificSchool` | Retry generation for a single school |
| `window.getSchoolsNeedingAttention` | Get list of schools with generation issues |

#### llmGenerateProcess.js
| Export | Description |
|--------|-------------|
| `window.onLLMQueued` | Callback when generation job is queued |
| `window.onLLMPollResult` | Callback with poll results during generation |
| `window.onISLDetectionUpdate` | ISL (Immersive Spell Learning) detection status |
| `window.onDESTDetectionUpdate` | DEST (Don't Eat Spell Tomes) detection status |

#### llmTreeFeatures.js
| Export | Description |
|--------|-------------|
| `window.classifySpellElementsWithLLM` | Classify spell elements using LLM |
| `window.discoverSpellThemesWithLLM` | Discover thematic groupings |
| `window.resolveParentEdgeCaseWithLLM` | Resolve ambiguous parent assignment |
| `window.expandElementKeywordsWithLLM` | Expand element keyword lists |
| `window.classifySpellKeywordsWithLLM` | Classify spell keywords |
| `window.startKeywordClassification` | Start batch keyword classification |
| `window.preprocessSpellsWithLLM` | Pre-process spells with LLM analysis |
| `window.llmClassificationCache` | Cache for LLM classification results |

#### generationModeCore.js
| Export | Description |
|--------|-------------|
| `window.getCurrentSeed` | Get current generation seed |
| `window.generateNewSeed` | Generate a new random seed |
| `window.getDefaultVisualFirstConfig` | Default config for visual-first generation |
| `window.getVisualFirstConfig` | Current visual-first config from UI |
| `window.generateFinalPrompt` | Assemble final LLM prompt |
| `window.initGenerationModeUI` | Initialize generation mode UI |
| `window.getGenerationOptions` | Get all generation options from UI |

#### generationModeSchools.js
| Export | Description |
|--------|-------------|
| `window.showSchoolControlPanels` | Show per-school config panels |
| `window.hideSchoolControlPanels` | Hide per-school config panels |
| `window.toggleSchoolPanel` | Toggle individual school panel |
| `window.rerunSchool` | Regenerate a single school's tree |
| `window.getSchoolConfig` | Get config for a specific school |
| `window.regenerateSelectedSchools` | Regenerate selected schools |

#### llmColorSuggestion.js
| Export | Description |
|--------|-------------|
| `window._colorSuggestionCallback` | Internal callback for C++ color suggestions |

#### growthStyleGenerator.js

Generates growth style recipes (DSL parameters) for spell trees using the OpenRouter API. Translates LLM responses into `GROWTH_DSL` recipe objects.

## LLM Communication Path

Two distinct LLM communication paths exist:

### 1. C++ Bridge LLM (Primary)
Used for tree generation and color suggestion. Communication goes through SKSE:

```
JS → window.cpp.generateTrees(options) → C++ → OpenRouter API → C++ → window.onLLMPollResult()
```

### 2. Direct OpenRouter API (Growth Style)
`growthStyleGenerator.js` calls OpenRouter directly via `fetch()`:

```
JS → fetch('https://openrouter.ai/api/v1/...') → OpenRouter API → JS callback
```

## ISL/DEST Detection

`llmGenerateProcess.js` monitors for two compatibility mods:

- **ISL** (Immersive Spell Learning) -- detected during generation, updates UI via `window.onISLDetectionUpdate`
- **DEST** (Don't Eat Spell Tomes) -- detected during generation, updates UI via `window.onDESTDetectionUpdate`
