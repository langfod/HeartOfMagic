/**
 * C++ Callbacks - Game State & Panel Lifecycle Module
 * Save game loading, node availability recalculation,
 * player known spells, Prisma ready, and panel show/hide lifecycle.
 *
 * Depends on:
 * - modules/state.js (state, settings)
 * - modules/wheelRenderer.js (WheelRenderer)
 * - modules/cppCallbacksCore.js (getCanonicalFormId, findDuplicateSiblings, syncDuplicateState)
 * - modules/cppCallbacksTree.js (isSpellMastered, isSpellLearning, resolveCanonicalId)
 *
 * Exports (global):
 * - window.onSaveGameLoaded
 * - window.onPlayerKnownSpells
 * - window.onPrismaReady
 * - window.onPanelShowing
 * - window.onPanelHiding
 * - window._panelVisible
 * - recalculateNodeAvailability() (free function)
 */

// =============================================================================
// GAME STATE CALLBACKS
// =============================================================================

// Called when player loads into a save game (after kPostLoadGame)
// This refreshes progress and checks which spells the player knows
window.onSaveGameLoaded = function() {
    console.log('[SpellLearning] Save game loaded - refreshing player data');

    // First reset tree to clean state
    window.onResetTreeStates();

    // Then request fresh data from C++
    if (window.callCpp) {
        window.callCpp('GetProgress', '');
        window.callCpp('GetPlayerKnownSpells', '');
    }
};

// =============================================================================
// NODE AVAILABILITY
// =============================================================================

// Helper function to recalculate node availability based on prerequisites
// IMPORTANT: Only MASTERED/ALREADY-KNOWN spells count as unlocked for prereq purposes
// Early-learned (weakened) spells do NOT unlock children
function recalculateNodeAvailability() {
    if (!state.treeData || !state.treeData.nodes) return 0;

    // Build a map for quick lookup
    var nodeMap = {};
    state.treeData.nodes.forEach(function(node) {
        nodeMap[node.id] = node;
        // Also map by formId for lookups
        if (node.formId && node.formId !== node.id) {
            nodeMap[node.formId] = node;
        }
    });

    // Helper: check if a prereq is truly mastered/already-known (not just learning)
    function isPrereqMastered(prereqId) {
        var prereqNode = nodeMap[prereqId];
        if (!prereqNode) return false;

        // If node state is 'unlocked', it's either mastered or already-known
        // (we've already filtered out learning spells in onPlayerKnownSpells)
        if (prereqNode.state === 'unlocked') {
            return true;
        }

        // Double-check with progress data (use canonical formId for duplicates)
        var canonicalId = getCanonicalFormId(prereqNode);
        var progress = state.spellProgress[canonicalId] || state.spellProgress[prereqNode.formId || prereqId];
        if (progress && progress.unlocked) {
            return true;
        }

        // Check if any duplicate sibling is unlocked
        var siblings = findDuplicateSiblings(prereqNode);
        for (var i = 0; i < siblings.length; i++) {
            if (siblings[i].state === 'unlocked') return true;
        }

        return false;
    }

    // For each node, check if all prerequisites are MASTERED
    var changedCount = 0;
    state.treeData.nodes.forEach(function(node) {
        // Use canonical formId for duplicate-aware lookups
        var canonId = getCanonicalFormId(node);

        // Skip if already mastered (unlocked with 100% XP)
        if (node.state === 'unlocked' && isSpellMastered(canonId)) {
            return;
        }

        // If node is "unlocked" but NOT mastered AND player doesn't have the spell, fix it
        // Don't downgrade if player actually has the spell (progress data may just be stale)
        if (node.state === 'unlocked' && !isSpellMastered(canonId)) {
            var playerHas = state.playerKnownSpells &&
                           (state.playerKnownSpells.has(canonId) || state.playerKnownSpells.has(node.formId));
            if (!playerHas) {
                node.state = 'available';
                changedCount++;
                console.warn('[SpellLearning] Fixed node ' + (node.name || node.id) + ' - was unlocked but not mastered and player does not have spell');
            }
        }

        // Check prerequisites (filter out self-references)
        var prereqs = (node.prerequisites || []).filter(function(prereqId) {
            if (prereqId === node.id || prereqId === node.formId) {
                return false;
            }
            return true;
        });

        if (prereqs.length === 0) {
            // No prerequisites - should be available (but preserve 'learning' state)
            if (node.state !== 'available' && node.state !== 'unlocked' && node.state !== 'learning') {
                node.state = 'available';
                changedCount++;
            }
        } else {
            // Has prerequisites — use hard/soft system (matches detail panel logic).
            // Hard prereqs: ALL must be mastered.
            // Soft prereqs: at least softNeeded must be mastered.
            // This prevents the "hidden prerequisites" bug where the detail panel
            // shows "complete" but the node stays locked.

            var hardPrereqs = node.hardPrereqs || [];
            var softPrereqs = node.softPrereqs || [];
            var softNeeded = node.softNeeded || 0;

            // Fallback: derive hard/soft from raw prerequisites if not yet computed
            // (same logic as treeViewerUI.js C++ bridge)
            if (hardPrereqs.length === 0 && softPrereqs.length === 0 && prereqs.length > 0) {
                if (prereqs.length === 1) {
                    hardPrereqs = prereqs.slice();
                } else {
                    hardPrereqs = [prereqs[0]];
                    softPrereqs = prereqs.slice(1);
                    softNeeded = 1;
                }
            }

            // Check hard prereqs: ALL must be mastered
            var allHardMet = hardPrereqs.every(isPrereqMastered);

            // Check soft prereqs: at least softNeeded must be mastered
            var softMet = 0;
            for (var si = 0; si < softPrereqs.length; si++) {
                if (isPrereqMastered(softPrereqs[si])) softMet++;
            }
            var softSatisfied = softNeeded === 0 || softMet >= softNeeded;

            if (allHardMet && softSatisfied) {
                if (node.state === 'locked') {
                    node.state = 'available';
                    changedCount++;
                    console.log('[SpellLearning] Node ' + (node.name || node.id) + ' now available (hard/soft prereqs met)');
                }
            } else {
                // Prerequisites not met - should be locked (but preserve 'learning' and 'unlocked' states)
                if (node.state !== 'locked' && node.state !== 'unlocked' && node.state !== 'learning') {
                    node.state = 'locked';
                    changedCount++;
                    console.log('[SpellLearning] Node ' + (node.name || node.id) + ' locked (prereqs not met: hard=' +
                        (allHardMet ? 'ok' : 'FAIL') + ', soft=' + softMet + '/' + softNeeded + ')');
                }
            }
        }
    });

    return changedCount;
}

// =============================================================================
// PLAYER KNOWN SPELLS
// =============================================================================

// Callback when we receive the list of player's known spells
window.onPlayerKnownSpells = function(dataStr) {
    console.log('[SpellLearning] Received player known spells');
    try {
        var data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
        var knownSpells = data.knownSpells || [];

        // Also get the weakened spells list (early-learned spells that aren't mastered)
        var weakenedSpells = data.weakenedSpells || [];

        console.log('[SpellLearning] Player knows ' + knownSpells.length + ' spells (' +
                    weakenedSpells.length + ' are weakened/early-learned)');

        // Store in state for reference
        state.playerKnownSpells = new Set(knownSpells);
        state.weakenedSpells = new Set(weakenedSpells);  // Track which are weakened

        // Update tree node states if tree is loaded
        if (state.treeData && state.treeData.nodes) {
            var masteredCount = 0;
            var learningCount = 0;
            var alreadyKnownCount = 0;
            var relockedCount = 0;

            // ZERO PASS: Check for spells marked as "unlocked" that player doesn't actually have
            // This can happen if spell was removed via console, mod conflict, or save corruption
            state.treeData.nodes.forEach(function(node) {
                // Only check nodes marked as unlocked
                if (node.state !== 'unlocked') return;

                // Use canonical formId for duplicates
                var canonId = getCanonicalFormId(node);
                // If player doesn't have this spell, relock it
                if (!state.playerKnownSpells.has(canonId) && !state.playerKnownSpells.has(node.formId)) {
                    // Root nodes go to "available" (always learnable), others go to "locked"
                    var newState = node.isRoot ? 'available' : 'locked';

                    console.warn('[SpellLearning] RELOCK: ' + (node.name || node.formId) +
                                 ' was marked unlocked but player does not have spell -> ' + newState);

                    // Reset state
                    node.state = newState;

                    // Clear progress data (use canonical ID so duplicates share state)
                    if (state.spellProgress[canonId]) {
                        state.spellProgress[canonId].unlocked = false;
                        state.spellProgress[canonId].xp = 0;
                    }

                    // Sync visual state to all duplicate siblings
                    syncDuplicateState(node);

                    relockedCount++;
                }
            });

            if (relockedCount > 0) {
                console.log('[SpellLearning] Relocked ' + relockedCount + ' spells that player no longer has');
            }

            // First pass: Determine correct state for each known spell
            state.treeData.nodes.forEach(function(node) {
                // Use canonical formId for duplicate nodes
                var canonId = getCanonicalFormId(node);

                // Skip if not in player's known spells (check both canonical and actual formId)
                if (!state.playerKnownSpells.has(canonId) && !state.playerKnownSpells.has(node.formId)) {
                    return;
                }

                // Check if this spell is currently being LEARNED (active target, early-learned)
                if (isSpellLearning(canonId) || isSpellLearning(node.formId)) {
                    // LEARNING (early-learned, not mastered) - keep available, NOT unlocked
                    // Player has the spell (weakened) but children stay locked
                    if (node.state === 'locked') {
                        node.state = 'available';
                    }
                    // Never set to 'unlocked' for learning spells
                    if (node.state === 'unlocked') {
                        node.state = 'available';  // Fix invalid state
                        console.warn('[SpellLearning] Fixed ' + (node.name || node.formId) + ' - was unlocked while still learning');
                    }
                    // Sync visual state to all duplicate siblings
                    syncDuplicateState(node);

                    learningCount++;
                    var progress = state.spellProgress[canonId];
                    var pct = progress ? ((progress.xp / progress.required) * 100).toFixed(0) : '?';
                    console.log('[SpellLearning] ' + (node.name || node.formId) + ' is LEARNING (' + pct + '%) - children stay locked');
                } else {
                    // Player HAS the spell and it's NOT actively being learned
                    // This means they either:
                    // 1. Mastered it through our system (100% XP)
                    // 2. Already had it from vanilla/console/other mods
                    // Either way, it should count as UNLOCKED

                    if (node.state !== 'unlocked') {
                        node.state = 'unlocked';

                        // Also ensure progress data marks it as unlocked (use canonical ID)
                        if (!state.spellProgress[canonId]) {
                            // No progress data - spell from other source, create entry
                            state.spellProgress[canonId] = {
                                xp: 100,
                                required: 100,
                                unlocked: true,
                                ready: true
                            };
                            alreadyKnownCount++;
                            console.log('[SpellLearning] ' + (node.name || node.formId) + ' - ALREADY KNOWN (vanilla/console/other)');
                        } else if (!state.spellProgress[canonId].unlocked) {
                            // Has partial progress but not marked unlocked - player got it another way
                            state.spellProgress[canonId].unlocked = true;
                            state.spellProgress[canonId].xp = state.spellProgress[canonId].required || 100;
                            alreadyKnownCount++;
                            console.log('[SpellLearning] ' + (node.name || node.formId) + ' - marked UNLOCKED (player already has)');
                        } else {
                            masteredCount++;
                            console.log('[SpellLearning] ' + (node.name || node.formId) + ' is MASTERED');
                        }

                        // Sync visual state to all duplicate siblings
                        syncDuplicateState(node);
                    } else {
                        masteredCount++;
                    }
                }
            });

            // Second pass: Recalculate availability for all nodes
            // Spells that are unlocked (mastered OR already-known) can unlock children
            var availableCount = recalculateNodeAvailability();

            console.log('[SpellLearning] Mastered: ' + masteredCount + ', Already Known: ' + alreadyKnownCount +
                        ', Learning: ' + learningCount + ', Relocked: ' + relockedCount +
                        ', Availability updated: ' + availableCount);

            // Re-render tree and update counts
            // Use SmartRenderer which delegates to active renderer (SVG, Canvas, or WebGL)
            if (typeof SmartRenderer !== 'undefined' && SmartRenderer.refresh) {
                SmartRenderer.refresh();
            } else {
                WheelRenderer.render();
            }
            WheelRenderer.updateNodeStates();

            // Count all unlocked spells (mastered via our system OR already known)
            var unlockedCount = state.treeData.nodes.filter(function(n) {
                return n.state === 'unlocked';
            }).length;
            var unlockedEl = document.getElementById('unlocked-count'); if (unlockedEl) unlockedEl.textContent = unlockedCount;
        }
    } catch (e) {
        console.error('[SpellLearning] Failed to parse player known spells:', e);
    }
};

// =============================================================================
// PANEL LIFECYCLE
// =============================================================================

window.onPrismaReady = function() {
    console.log('[SpellLearning] Prisma connection established');
    updateStatus('Ready to scan spells...');
    setStatusIcon('*');

    if (window.callCpp) {
        // Load unified config (all settings, API key, field settings in one file)
        console.log('[SpellLearning] Loading unified config...');
        window.callCpp('LoadUnifiedConfig', '');

        // Load tree rules prompt
        window.callCpp('LoadPrompt', '');

        // Check API availability (uses settings from unified config)
        checkLLMAvailability();

        // Auto-load saved spell tree (if exists)
        // loadTreeData() in treeViewerUI.js calls GetProgress and GetPlayerKnownSpells after loading
        // Do NOT call those here - let loadTreeData handle it to avoid race conditions
        console.log('[SpellLearning] Auto-loading saved spell tree...');
        window.callCpp('LoadSpellTree', '');
    }
};

// Track panel visibility state
window._panelVisible = true;

// Called when panel becomes visible (from C++)
window.onPanelShowing = function() {
    console.log('[SpellLearning] Panel showing - resuming rendering');
    window._panelVisible = true;

    // Resume render loop and force re-render
    if (typeof CanvasRenderer !== 'undefined') {
        if (CanvasRenderer.startRenderLoop) {
            CanvasRenderer.startRenderLoop();
        }
        CanvasRenderer._needsRender = true;
    }
    // Resume TreeGrowth if it was visible before hiding
    if (typeof TreeGrowth !== 'undefined' && TreeGrowth._visible) {
        TreeGrowth._startRenderLoop();
        TreeGrowth._markDirty();
    }
    // Resume TreePreview if it was visible before hiding
    if (typeof TreePreview !== 'undefined' && TreePreview._visible) {
        TreePreview._startRenderLoop();
        TreePreview._markDirty(true);
    }

    // Re-fetch progress and known spells from C++ to catch any XP gained while panel was hidden
    if (window.callCpp && state.treeData) {
        console.log('[SpellLearning] Panel showing - syncing progress from C++');
        window.callCpp('GetProgress', '');
        window.callCpp('GetPlayerKnownSpells', '');
    }

    // Refresh renderers
    if (typeof SmartRenderer !== 'undefined' && SmartRenderer.refresh) {
        SmartRenderer.refresh();
    }
    if (typeof WheelRenderer !== 'undefined') {
        WheelRenderer.updateNodeStates();
    }

    // Refresh selected node details panel if a node is selected
    if (state.selectedNode && typeof showSpellDetails === 'function') {
        showSpellDetails(state.selectedNode);
    }
};

// Called before panel hides (from C++)
window.onPanelHiding = function() {
    console.log('[SpellLearning] Panel hiding - stopping rendering');
    window._panelVisible = false;

    // Stop ALL render loops to free CPU
    // CanvasRenderer (main tree view - canvasRendererV2)
    if (typeof CanvasRenderer !== 'undefined' && CanvasRenderer.stopRenderLoop) {
        CanvasRenderer.stopRenderLoop();
    }
    // TreeGrowth preview canvas
    if (typeof TreeGrowth !== 'undefined' && TreeGrowth._stopRenderLoop) {
        TreeGrowth._stopRenderLoop();
    }
    // TreePreview canvas
    if (typeof TreePreview !== 'undefined' && TreePreview._stopRenderLoop) {
        TreePreview._stopRenderLoop();
    }

    // Stop ALL polling intervals
    if (state.llmPollInterval) {
        clearInterval(state.llmPollInterval);
        state.llmPollInterval = null;
    }
    if (typeof stopFeaturePolling === 'function') {
        stopFeaturePolling();
    }

    // Auto-save settings when panel closes
    if (typeof saveSettings === 'function') {
        saveSettings();
    }
};
