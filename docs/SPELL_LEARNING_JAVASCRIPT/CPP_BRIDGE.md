# C++ Bridge Callback Interface

All `window.*` functions called by the C++ SKSE plugin via the Ultralight/CEF JavaScript bridge. These are the primary communication mechanism between the C++ backend and the JavaScript UI.

## Callback Files

| File | Lines | Purpose |
|------|------:|---------|
| `cppCallbacksCore.js` | 499 | Core callbacks: builder status, spell data, status, tree data |
| `cppCallbacksTree.js` | 367 | Tree & spell state callbacks: growth data, spell info, mastery |
| `cppCallbacksState.js` | 447 | Game state & lifecycle callbacks: save load, panel show/hide |

Also contains shared helpers:
- `getCanonicalFormId(node)` -- Get original formId for duplicate nodes
- `findDuplicateSiblings(node, tree)` -- Find all duplicates of a node
- `syncDuplicateState(node, tree, newState)` -- Sync state across duplicates

## Complete Callback Reference

### Core Callbacks (`cppCallbacksCore.js`)

| Callback | Signature | Triggered When |
|----------|-----------|----------------|
| `window.onBuilderStatus` | `(statusObj)` | Tree builder reports progress/completion |
| `window.updateSpellData` | `(spellArray)` | Spell data batch received from C++ |
| `window.updateStatus` | `(message)` | General status message from C++ |
| `window.updateTreeStatus` | `(statusObj)` | Tree-specific status update |
| `window.updatePrompt` | `(promptText)` | Prompt text loaded from C++ |
| `window.onPromptSaved` | `(success)` | Prompt save operation completed |
| `window.onClipboardContent` | `(text)` | Clipboard read result |
| `window.onCopyComplete` | `(success)` | Clipboard write completed |
| `window.updateTreeData` | `(treeJson)` | Complete tree JSON data from C++ |

### Tree & Spell State Callbacks (`cppCallbacksTree.js`)

| Callback | Signature | Triggered When |
|----------|-----------|----------------|
| `window.onClassicGrowthTreeData` | `(treeData)` | Classic growth tree data received |
| `window.onTreeGrowthTreeData` | `(treeData)` | Tree growth mode data received |
| `window.updateSpellInfo` | `(spellInfo)` | Single spell info update |
| `window.updateSpellInfoBatch` | `(spellArray)` | Batch spell info update |
| `window.debugOutput` | `(message)` | Debug message from C++ |
| `window.testLearning` | `(spellId, xp)` | Test learning progress update |
| `window.updateSpellState` | `(stateObj)` | Spell learning state changed |
| `window.onResetTreeStates` | `()` | All tree states reset (new game/load) |

### Game State & Lifecycle Callbacks (`cppCallbacksState.js`)

| Callback | Signature | Triggered When |
|----------|-----------|----------------|
| `window.onSaveGameLoaded` | `(saveData)` | Save game loaded, progress data available |
| `window.onPlayerKnownSpells` | `(spellArray)` | Player's known spells list received |
| `window.onPrismaReady` | `()` | PrismaUI framework ready |
| `window.onPanelShowing` | `()` | Panel becoming visible |
| `window.onPanelHiding` | `()` | Panel becoming hidden |
| `window._panelVisible` | (boolean) | Current panel visibility state |

### Callbacks in Other Modules

These `window.*` callbacks are defined outside the cppCallbacks files:

| Callback | Module | Triggered When |
|----------|--------|----------------|
| `window.onPresetsLoaded` | uiHelpers.js | Presets loaded from disk |
| `window.onLLMStatus` | llmGenerateCore.js | LLM generation status update |
| `window.onLLMQueued` | llmGenerateProcess.js | LLM job queued |
| `window.onLLMPollResult` | llmGenerateProcess.js | LLM poll result received |
| `window.onISLDetectionUpdate` | llmGenerateProcess.js | ISL mod detection status |
| `window.onDESTDetectionUpdate` | llmGenerateProcess.js | DEST mod detection status |
| `window.onLLMConfigLoaded` | settingsConfigLoad.js | LLM configuration loaded |
| `window.onLLMConfigSaved` | llmApiSettings.js | LLM configuration saved |
| `window.onUnifiedConfigLoaded` | settingsConfigLoad.js | Unified config loaded |
| `window.onSettingsLoaded` | settingsConfigLoad.js | Legacy settings loaded |
| `window.onModdedXPSourceRegistered` | settingsModdedXP.js | External mod registers XP source |
| `window.onPreReqMasterComplete` | prereqMaster.js | PreReqMaster NLP analysis done |
| `window.onProceduralTreeComplete` | proceduralTreeGenerate.js | Procedural tree build done |
| `window.onProgressUpdate` | progressionUI.js | XP progress update |
| `window.onSpellReady` | progressionUI.js | Spell ready to learn |
| `window.onSpellUnlocked` | progressionUI.js | Spell unlocked |
| `window.onLearningTargetSet` | progressionUI.js | Learning target changed |
| `window.onProgressData` | progressionUI.js | Batch progress data |
| `window.onAllSpellsReceived` | editModeOps.js | Complete spell list received |
| `window.onTestConfigLoaded` | autoTest.js | Test config file loaded |
| `window._colorSuggestionCallback` | llmColorSuggestion.js | Color suggestion result |

## Communication Flow

### C++ → JavaScript

The C++ plugin calls JavaScript functions via the Ultralight/CEF bridge:

```cpp
// C++ side (SpellLearning.dll)
ultralight::JSEval("window.updateSpellData(" + jsonData + ")");
```

### JavaScript → C++

JavaScript calls C++ through the `window.cpp` bridge object:

```javascript
// JS side
window.cpp.saveUnifiedConfig(JSON.stringify(settings));
window.cpp.generateTrees(optionsJson);
window.cpp.requestSpellData();
```

### Lifecycle Sequence

```
Game start:
  C++ → window.onPrismaReady()
  C++ → window.onUnifiedConfigLoaded(config)
  C++ → window.onPresetsLoaded(presets)

Panel open:
  C++ → window.onPanelShowing()
  C++ → window.updateSpellData(spells)
  C++ → window.onPlayerKnownSpells(spells)

Save game load:
  C++ → window.onSaveGameLoaded(saveData)
  C++ → window.onProgressData(progress)

Tree generation:
  JS → window.cpp.generateTrees(options)
  C++ → window.onLLMQueued(jobId)
  C++ → window.onLLMPollResult(result)  [repeated]
  C++ → window.onLLMStatus(status)      [repeated]
  C++ → window.onBuilderStatus(status)
  C++ → window.updateTreeData(tree)

Panel close:
  C++ → window.onPanelHiding()
```

## Duplicate Node Helpers

Shared utilities in `cppCallbacksCore.js` for handling duplicate spell nodes (created in edit mode):

| Function | Description |
|----------|-------------|
| `getCanonicalFormId(node)` | Returns the original formId for a node (handles `_dup_` suffix and `originalFormId`) |
| `findDuplicateSiblings(node, tree)` | Finds all nodes sharing the same canonical formId |
| `syncDuplicateState(node, tree, state)` | Syncs learning state across all duplicates of a node |
