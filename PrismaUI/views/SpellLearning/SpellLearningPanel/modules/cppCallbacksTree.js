/**
 * C++ Callbacks - Tree & Spell State Module
 * Tree growth data callbacks, spell info, spell state updates,
 * tree state reset, and mastery check functions.
 *
 * Depends on:
 * - modules/state.js (state, settings)
 * - modules/treeParser.js (TreeParser)
 * - modules/wheelRenderer.js (WheelRenderer)
 * - modules/spellCache.js (SpellCache)
 * - modules/cppCallbacksCore.js (getCanonicalFormId, findDuplicateSiblings, syncDuplicateState)
 *
 * Exports (global):
 * - window.onClassicGrowthTreeData
 * - window.onTreeGrowthTreeData
 * - window.updateSpellInfo
 * - window.updateSpellInfoBatch
 * - window.debugOutput
 * - window.testLearning
 * - window.updateSpellState
 * - window.onResetTreeStates
 * - isSpellMastered() (free function)
 * - isSpellLearning() (free function)
 * - resolveCanonicalId() (free function)
 */

// =============================================================================
// TREE AND SPELL DATA CALLBACKS
// =============================================================================

/**
 * Called by C++ when Classic Growth tree build completes
 * Receives NLP-built tree data for preview layout
 */
window.onClassicGrowthTreeData = function(json) {
    var data = typeof json === 'string' ? JSON.parse(json) : json;
    console.log('[SpellLearning] Classic Growth tree data received');
    if (typeof TreeGrowthClassic !== 'undefined' && TreeGrowthClassic.loadTreeData) {
        TreeGrowthClassic.loadTreeData(data);
        if (typeof TreeGrowth !== 'undefined') {
            TreeGrowth._markDirty();
        }
    }
};

/**
 * Called by C++ when Tree Growth tree build completes
 * Receives NLP-built tree data with trunk/branch/root structure
 */
window.onTreeGrowthTreeData = function(json) {
    var data = typeof json === 'string' ? JSON.parse(json) : json;
    console.log('[SpellLearning] Tree Growth tree data received');
    if (typeof TreeGrowthTree !== 'undefined' && TreeGrowthTree.loadTreeData) {
        TreeGrowthTree.loadTreeData(data);
        if (typeof TreeGrowth !== 'undefined') {
            TreeGrowth._markDirty();
        }
    }
};

window.updateSpellInfo = function(json) {
    var data = typeof json === 'string' ? JSON.parse(json) : json;
    if (data.formId) {
        SpellCache.set(data.formId, data);

        if (state.treeData) {
            var node = state.treeData.nodes.find(function(n) { return n.formId === data.formId; });
            if (node) {
                TreeParser.updateNodeFromCache(node);
                WheelRenderer.render();
            }
        }
    }
};

window.updateSpellInfoBatch = function(json) {
    console.log('[SpellLearning] Received spell info batch');
    var dataArray = typeof json === 'string' ? JSON.parse(json) : json;
    if (!Array.isArray(dataArray)) {
        console.warn('[SpellLearning] Batch response is not an array');
        return;
    }

    var foundCount = 0;
    var notFoundCount = 0;

    dataArray.forEach(function(data) {
        if (data.formId) {
            if (data.notFound) {
                notFoundCount++;
                console.warn('[SpellLearning] Spell not found: ' + data.formId);
            } else {
                foundCount++;
                SpellCache.set(data.formId, data);
            }
        }
    });

    console.log('[SpellLearning] Batch: ' + foundCount + ' found, ' + notFoundCount + ' not found');

    // Signal batch complete
    SpellCache.onBatchComplete();

    if (state.treeData) {
        state.treeData.nodes.forEach(function(node) {
            TreeParser.updateNodeFromCache(node);
        });
        WheelRenderer.render();

        var statusMsg = t('status.loadedSpells', {found: foundCount});
        if (notFoundCount > 0) {
            statusMsg = t('status.loadedSpellsNotFound', {found: foundCount, notFound: notFoundCount});
        }
        setTreeStatus(statusMsg);
    }
};

// Helper to log to output textarea (global so other modules can use it)
window.debugOutput = function(msg) {
    var output = document.getElementById('outputArea');
    if (output) {
        var timestamp = new Date().toLocaleTimeString();
        output.value = '[' + timestamp + '] ' + msg + '\n' + output.value;
    }
    console.log(msg);
};

// Debug function to test learning state - call from console: testLearning('Flames')
window.testLearning = function(spellName) {
    if (!state.treeData || !state.treeData.nodes) {
        debugOutput('[TEST] No tree data!');
        return;
    }
    var node = state.treeData.nodes.find(function(n) {
        return n.name && n.name.toLowerCase().includes(spellName.toLowerCase());
    });
    if (node) {
        debugOutput('[TEST] Setting ' + node.name + ' to learning state...');
        window.updateSpellState(node.id, 'learning');
    } else {
        debugOutput('[TEST] Node not found: ' + spellName);
        debugOutput('[TEST] Available: ' + state.treeData.nodes.slice(0, 10).map(function(n) { return n.name; }).join(', '));
    }
};

window.updateSpellState = function(jsonOrFormId, newState) {
    // Handle both JSON string from C++ and direct params from JS
    var formId, stateValue;

    if (typeof jsonOrFormId === 'string' && jsonOrFormId.indexOf('{') === 0) {
        // It's a JSON string from C++
        try {
            var data = JSON.parse(jsonOrFormId);
            formId = data.formId;
            stateValue = data.state;
        } catch (e) {
            debugOutput('[LEARN] ERROR: Failed to parse JSON: ' + e);
            return;
        }
    } else {
        // Direct parameters from JS
        formId = jsonOrFormId;
        stateValue = newState;
    }

    debugOutput('[LEARN] updateSpellState: formId=' + formId + ', state=' + stateValue);

    if (!state.treeData) {
        debugOutput('[LEARN] ERROR: No treeData!');
        return;
    }

    if (!state.treeData.nodes) {
        debugOutput('[LEARN] ERROR: No nodes in treeData!');
        return;
    }

    debugOutput('[LEARN] Searching ' + state.treeData.nodes.length + ' nodes...');

    // Find node by formId, id, or originalFormId (for duplicates)
    var node = state.treeData.nodes.find(function(n) {
        return n.formId === formId || n.id === formId || n.originalFormId === formId;
    });

    if (!node) {
        debugOutput('[LEARN] ERROR: Node NOT FOUND! formId=' + formId);
        var sample = state.treeData.nodes.slice(0, 3).map(function(n) {
            return n.name + '(id:' + n.id + ')';
        }).join(', ');
        debugOutput('[LEARN] Sample nodes: ' + sample);
        return;
    }

    var oldState = node.state;
    node.state = stateValue;
    syncDuplicateState(node);
    debugOutput('[LEARN] ' + node.name + ': ' + oldState + ' -> ' + stateValue);

    var wasLearning = oldState === 'learning' || oldState === 'Learning';
    var isNowLearning = stateValue === 'learning' || stateValue === 'Learning';

    // Trigger learning animation and rebuild paths if spell enters "learning" state
    if (isNowLearning && !wasLearning) {
        debugOutput('[LEARN] >>> STARTED LEARNING: ' + node.name);

        // Rebuild learning paths and trigger animation on Canvas renderer
        if (typeof CanvasRenderer !== 'undefined') {
            debugOutput('[LEARN] CanvasRenderer exists, _nodeMap=' + !!CanvasRenderer._nodeMap);
            if (CanvasRenderer._nodeMap) {
                debugOutput('[LEARN] Calling _buildLearningPaths...');
                CanvasRenderer._buildLearningPaths();
                debugOutput('[LEARN] Calling triggerLearningAnimation(' + node.id + ')...');
                CanvasRenderer.triggerLearningAnimation(node.id);
                CanvasRenderer._needsRender = true;
                debugOutput('[LEARN] Done! _learningNodeIds.size=' + (CanvasRenderer._learningNodeIds ? CanvasRenderer._learningNodeIds.size : 'null'));
            }
        } else {
            debugOutput('[LEARN] ERROR: CanvasRenderer NOT defined!');
        }

        // Also refresh SmartRenderer
        if (typeof SmartRenderer !== 'undefined') {
            SmartRenderer.refresh();
        }
    }

    // Rebuild paths when spell STOPS being in learning state (cancelled, unlocked, etc.)
    if (wasLearning && !isNowLearning) {
        debugOutput('[LEARN] >>> STOPPED LEARNING: ' + node.name + ' -> ' + stateValue);

        if (typeof CanvasRenderer !== 'undefined' && CanvasRenderer._nodeMap) {
            CanvasRenderer._buildLearningPaths();
            CanvasRenderer._needsRender = true;
        }

        if (typeof SmartRenderer !== 'undefined') {
            SmartRenderer.refresh();
        }
    }

    // Also refresh discovery visibility when spell is unlocked
    if (stateValue === 'unlocked' && oldState !== 'unlocked') {
        debugOutput('[LEARN] Spell unlocked: ' + node.name);
        if (typeof SmartRenderer !== 'undefined') {
            SmartRenderer.refresh();
        }
    }

    WheelRenderer.render();

    var unlockedEl = document.getElementById('unlocked-count'); if (unlockedEl) unlockedEl.textContent =
        state.treeData.nodes.filter(function(n) { return n.state === 'unlocked'; }).length;
};

// Reset all tree nodes to their default state (locked/available based on prerequisites)
// Called on game launch to main menu - BEFORE any save is loaded
window.onResetTreeStates = function() {
    console.log('[SpellLearning] Resetting all tree states (main menu load)');

    // Clear all progress data
    state.spellProgress = {};
    state.learningTargets = {};
    state.playerKnownSpells = new Set();

    if (state.treeData && state.treeData.nodes) {
        // Reset all nodes to locked first
        state.treeData.nodes.forEach(function(node) {
            node.state = 'locked';
        });

        // Then mark tier 1 nodes (no prerequisites) as available
        state.treeData.nodes.forEach(function(node) {
            if (!node.prerequisites || node.prerequisites.length === 0) {
                node.state = 'available';
            }
        });

        console.log('[SpellLearning] Reset complete - all nodes locked/available');

        // Re-render tree
        WheelRenderer.render();

        var unlockedEl = document.getElementById('unlocked-count'); if (unlockedEl) unlockedEl.textContent = '0';
    }
};

// =============================================================================
// UNIFIED MASTERY CHECK
// =============================================================================
// This is THE ONLY function that should be used to determine if a spell counts
// as "mastered" (unlocked) for purposes of unlocking children.
//
// A spell is MASTERED if:
//   1. progress.unlocked === true, AND
//   2. XP progress >= 99.9%
//
// A spell is LEARNING (even if player has it) if:
//   - XP progress < 100% (early-learned/weakened)
//   - Player may have the spell but it doesn't count as mastered
//   - Children remain LOCKED
//
// With C++ fix: When player clears/switches learning targets, the early-learned
// spell is REMOVED from their inventory. So we don't have to worry about
// "player has spell but not learning it" edge cases for weakened spells.
// =============================================================================

function isSpellMastered(formId) {
    // Resolve canonical formId (strips _dup_ suffix for duplicate nodes)
    var canonId = resolveCanonicalId(formId);
    var progress = state.spellProgress[canonId] || state.spellProgress[formId];
    if (!progress) return false;

    // Must be marked as unlocked AND have 100% progress (or close enough)
    var progressPercent = progress.required > 0 ? (progress.xp / progress.required) * 100 : 0;
    var mastered = progress.unlocked === true && progressPercent >= 99.9;

    return mastered;
}

// Check if spell is currently being learned (has early access but not mastered)
// This now also checks state.weakenedSpells which comes from C++
function isSpellLearning(formId) {
    // Resolve canonical formId for duplicate nodes
    var canonId = resolveCanonicalId(formId);

    // First check: Is this spell in the weakened spells list from C++?
    // This is the authoritative source - C++ tracks all early-learned spells
    if (state.weakenedSpells && (state.weakenedSpells.has(canonId) || state.weakenedSpells.has(formId))) {
        return true;
    }

    // Fallback: Check if this spell is a current learning target with partial progress
    var isLearningTarget = false;
    for (var school in state.learningTargets) {
        if (state.learningTargets[school] === canonId || state.learningTargets[school] === formId) {
            isLearningTarget = true;
            break;
        }
    }

    if (!isLearningTarget) return false;

    // Check if player has it (from early grant) but not mastered
    var progress = state.spellProgress[canonId] || state.spellProgress[formId];
    if (!progress) return false;

    var progressPercent = progress.required > 0 ? (progress.xp / progress.required) * 100 : 0;

    // Learning = has progress but not at 100%
    return progressPercent >= (settings.earlySpellLearning.unlockThreshold || 20) &&
           progressPercent < 99.9;
}

/**
 * Resolve a formId to its canonical (original) form.
 * Strips _dup_ suffixes so all copies of a spell share the same progress key.
 * Also checks node's originalFormId if available.
 */
function resolveCanonicalId(formId) {
    if (!formId) return formId;
    // Strip _dup_XXXXX suffix
    var dupIdx = formId.indexOf('_dup_');
    if (dupIdx !== -1) {
        return formId.substring(0, dupIdx);
    }
    return formId;
}
