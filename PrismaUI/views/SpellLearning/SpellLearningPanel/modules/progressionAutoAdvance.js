/**
 * ProgressionUI Auto-Advance
 * Auto-advance learning target system.
 *
 * Loaded after: progressionUI.js
 *
 * Depends on:
 * - modules/state.js (state, settings)
 * - modules/progressionUI.js (setTreeStatus, getXPForTier)
 * - modules/uiHelpers.js (updateDetailsProgression)
 * - modules/wheelRenderer.js (WheelRenderer)
 *
 * Exports (global):
 * - autoAdvanceLearningTarget()
 * - _findRandomAvailableInSchool()
 * - window.onSpellReady
 * - window.onSpellUnlocked
 * - window.onLearningTargetSet
 * - window.onProgressData
 */

// =============================================================================
// AUTO-ADVANCE LEARNING TARGET
// =============================================================================

/**
 * When a spell is mastered, automatically select the next spell to learn.
 * Two modes:
 *   'branch' - Pick next available child in the same branch (random if multiple)
 *   'random' - Pick any available spell in the same school
 *
 * Works with both learningMode: 'perSchool' and 'single'.
 */
function autoAdvanceLearningTarget(masteredCanonId, school) {
    if (!settings.autoAdvanceLearning) return;
    if (!state.treeData || !state.treeData.nodes) return;

    console.log('[SpellLearning] Auto-advance: checking for next target after mastering ' + masteredCanonId + ' (' + school + ')');

    var candidate = null;

    if (settings.autoAdvanceMode === 'branch') {
        // Find the mastered node to get its children
        var masteredNode = state.treeData.nodes.find(function(n) {
            var nc = (typeof getCanonicalFormId === 'function') ? getCanonicalFormId(n) : n.formId;
            return nc === masteredCanonId;
        });

        if (masteredNode && masteredNode.children && masteredNode.children.length > 0) {
            // Get child nodes that are 'available' (prereqs met, not learning/unlocked)
            var availableChildren = [];
            masteredNode.children.forEach(function(childId) {
                var childNode = state.treeData.nodes.find(function(n) {
                    return n.formId === childId || n.id === childId;
                });
                if (childNode && childNode.state === 'available') {
                    availableChildren.push(childNode);
                }
            });

            if (availableChildren.length > 0) {
                // Pick randomly from available children
                candidate = availableChildren[Math.floor(Math.random() * availableChildren.length)];
                console.log('[SpellLearning] Auto-advance (branch): found ' + availableChildren.length + ' available children, picked ' + (candidate.name || candidate.formId));
            }
        }

        // Fallback: if no children available, search entire school
        if (!candidate) {
            candidate = _findRandomAvailableInSchool(school);
            if (candidate) {
                console.log('[SpellLearning] Auto-advance (branch fallback): picked ' + (candidate.name || candidate.formId) + ' from school');
            }
        }
    } else {
        // 'random' mode - any available spell in the school
        candidate = _findRandomAvailableInSchool(school);
        if (candidate) {
            console.log('[SpellLearning] Auto-advance (random): picked ' + (candidate.name || candidate.formId));
        }
    }

    if (!candidate) {
        console.log('[SpellLearning] Auto-advance: no available spells found in ' + school);
        return;
    }

    // Set the learning target using the same flow as onLearnClick()
    var candidateCanonId = (typeof getCanonicalFormId === 'function') ? getCanonicalFormId(candidate) : candidate.formId;

    // In 'single' mode, clear ALL other learning targets first
    if (settings.learningMode === 'single') {
        for (var s in state.learningTargets) {
            if (state.learningTargets[s]) {
                var oldTargetId = state.learningTargets[s];
                if (window.callCpp) {
                    window.callCpp('ClearLearningTarget', JSON.stringify({ school: s }));
                }
                state.playerKnownSpells.delete(oldTargetId);

                // Reset old target node state
                if (state.treeData && state.treeData.nodes) {
                    var oldNode = state.treeData.nodes.find(function(n) { return n.formId === oldTargetId; });
                    if (oldNode && oldNode.state === 'learning') {
                        oldNode.state = 'available';
                    }
                }
            }
        }
        state.learningTargets = {};
    } else {
        // perSchool mode: clear existing target in same school if any
        var existingTarget = state.learningTargets[candidate.school];
        if (existingTarget && existingTarget !== candidate.formId) {
            state.playerKnownSpells.delete(existingTarget);
            if (state.treeData && state.treeData.nodes) {
                var oldNode = state.treeData.nodes.find(function(n) { return n.formId === existingTarget; });
                if (oldNode && oldNode.state === 'learning') {
                    oldNode.state = 'available';
                }
            }
        }
    }

    // Set the new learning target
    var prereqs = candidate.prerequisites || [];
    var reqXP = candidate.requiredXP || getXPForTier(candidate.level) || 100;

    if (window.callCpp) {
        window.callCpp('SetLearningTarget', JSON.stringify({
            school: candidate.school,
            formId: candidate.formId,
            prerequisites: prereqs,
            requiredXP: reqXP
        }));
    }
    state.learningTargets[candidate.school] = candidate.formId;

    // Set node state to 'learning'
    if (candidate.state !== 'unlocked') {
        candidate.state = 'learning';
    }

    // Rebuild learning paths for CanvasRenderer
    if (typeof CanvasRenderer !== 'undefined' && CanvasRenderer._nodeMap) {
        CanvasRenderer._buildLearningPaths();
        CanvasRenderer.triggerLearningAnimation(candidate.id);
        CanvasRenderer._needsRender = true;
    }

    setTreeStatus('Now learning: ' + (candidate.name || candidate.formId));
    console.log('[SpellLearning] Auto-advanced to: ' + (candidate.name || candidate.formId) + ' (' + candidate.school + ')');

    // Update node visuals
    WheelRenderer.updateNodeStates();
    if (typeof SmartRenderer !== 'undefined' && SmartRenderer.refresh) {
        SmartRenderer.refresh();
    }
}

/**
 * Helper: find a random available (non-root) spell in the given school.
 */
function _findRandomAvailableInSchool(school) {
    if (!state.treeData || !state.treeData.nodes) return null;

    var available = state.treeData.nodes.filter(function(n) {
        return n.school === school &&
               n.state === 'available' &&
               !n.isRoot;
    });

    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
}

window.onSpellReady = function(dataStr) {
    console.log('[SpellLearning] Spell ready to unlock:', dataStr);
    try {
        var data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
        var canonId = (typeof resolveCanonicalId === 'function') ? resolveCanonicalId(data.formId) : data.formId;
        if (state.spellProgress[canonId]) {
            state.spellProgress[canonId].ready = true;
        }

        // Get spell name
        var node = state.treeData ? state.treeData.nodes.find(function(n) {
            return n.formId === data.formId || n.originalFormId === data.formId;
        }) : null;
        var name = node ? (node.name || node.formId) : data.formId;

        setTreeStatus(t('progression.readyToUnlock', {name: name}));

        // Update details panel if selected node matches canonical ID
        var selectedCanon = state.selectedNode ? ((typeof getCanonicalFormId === 'function') ? getCanonicalFormId(state.selectedNode) : state.selectedNode.formId) : null;
        if (state.selectedNode && selectedCanon === canonId) {
            updateDetailsProgression(state.selectedNode);
        }

    } catch (e) {
        console.error('[SpellLearning] Failed to parse spell ready:', e);
    }
};

window.onSpellUnlocked = function(dataStr) {
    console.log('[SpellLearning] Spell unlocked:', dataStr);
    try {
        var data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;

        if (data.success) {
            var canonId = (typeof resolveCanonicalId === 'function') ? resolveCanonicalId(data.formId) : data.formId;

            // Update progress to mark as mastered (canonical ID)
            if (!state.spellProgress[canonId]) {
                state.spellProgress[canonId] = { xp: 100, required: 100 };
            }
            state.spellProgress[canonId].unlocked = true;
            state.spellProgress[canonId].xp = state.spellProgress[canonId].required || 100;

            // Update ALL nodes matching canonical ID (including duplicates)
            if (state.treeData) {
                state.treeData.nodes.forEach(function(n) {
                    var nCanon = (typeof getCanonicalFormId === 'function') ? getCanonicalFormId(n) : n.formId;
                    if (nCanon === canonId && n.state !== 'unlocked') {
                        n.state = 'unlocked';
                        setTreeStatus(t('progression.mastered', {name: n.name || n.formId}));
                        if (typeof syncDuplicateState === 'function') syncDuplicateState(n);
                    }
                });

                // Recalculate availability - children of MASTERED nodes become available
                if (typeof recalculateNodeAvailability === 'function') {
                    var changed = recalculateNodeAvailability();
                    console.log('[SpellLearning] Spell mastered - ' + changed + ' children now available');
                }
            }

            // Clear learning target (check canonical ID)
            for (var school in state.learningTargets) {
                var targetCanon = (typeof resolveCanonicalId === 'function') ? resolveCanonicalId(state.learningTargets[school]) : state.learningTargets[school];
                if (targetCanon === canonId) {
                    delete state.learningTargets[school];
                    break;
                }
            }

            // Refresh display - full re-render needed in discovery mode to show new nodes
            if (settings.discoveryMode) {
                WheelRenderer.render();
            } else {
                WheelRenderer.updateNodeStates();
            }

            var selectedCanon = state.selectedNode ? ((typeof getCanonicalFormId === 'function') ? getCanonicalFormId(state.selectedNode) : state.selectedNode.formId) : null;
            if (state.selectedNode && selectedCanon === canonId) {
                state.selectedNode.state = 'unlocked';
                showSpellDetails(state.selectedNode);
            }

            // Update unlocked count - only count truly mastered spells
            var unlockedCount = state.treeData.nodes.filter(function(n) {
                return n.state === 'unlocked' &&
                       (typeof isSpellMastered === 'function' ? isSpellMastered(n.formId) : true);
            }).length;
            document.getElementById('unlocked-count').textContent = unlockedCount;
        } else {
            setTreeStatus(t('progression.failedUnlock'));
        }

    } catch (e) {
        console.error('[SpellLearning] Failed to parse unlock result:', e);
    }
};

window.onLearningTargetSet = function(dataStr) {
    console.log('[SpellLearning] Learning target set:', dataStr);
    try {
        var data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;

        // Update state.learningTargets immediately
        if (data.school && data.formId) {
            state.learningTargets[data.school] = data.formId;
            console.log('[SpellLearning] Updated learning target: ' + data.school + ' -> ' + data.formId + ' (' + data.spellName + ')');

            // Initialize progress entry if needed (use canonical ID)
            var lCanonId = (typeof resolveCanonicalId === 'function') ? resolveCanonicalId(data.formId) : data.formId;
            if (!state.spellProgress[lCanonId]) {
                state.spellProgress[lCanonId] = {
                    xp: 0,
                    required: 100,
                    unlocked: false,
                    ready: false
                };
            }

            // Update node state to 'learning' if it exists in tree (match duplicates too)
            if (state.treeData) {
                var node = state.treeData.nodes.find(function(n) { return n.formId === data.formId || n.originalFormId === data.formId; });
                if (node && node.state !== 'unlocked') {
                    // Mark as available (learning) not unlocked
                    if (node.state === 'locked') {
                        node.state = 'available';
                    }
                    console.log('[SpellLearning] Node ' + (node.name || data.formId) + ' set as learning target');
                    WheelRenderer.updateNodeStates();
                }
            }

            setTreeStatus(t('progression.nowLearning', {name: data.spellName || data.formId}));
        }
    } catch (e) {
        console.error('[SpellLearning] Failed to parse learning target:', e);
    }
};

window.onProgressData = function(dataStr) {
    console.log('[SpellLearning] Progress data received:', dataStr);
    try {
        var data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;

        // Load learning targets
        if (data.learningTargets) {
            state.learningTargets = data.learningTargets;
            console.log('[SpellLearning] Loaded learning targets:', JSON.stringify(state.learningTargets));

            // Apply learning states to tree nodes
            if (state.treeData && state.treeData.nodes) {
                // Build a Set of learning target formIds for fast lookup
                var learningFormIds = new Set();
                for (var school in state.learningTargets) {
                    var formId = state.learningTargets[school];
                    if (formId) {
                        learningFormIds.add(formId);
                        // Also try without 0x prefix
                        if (formId.startsWith('0x')) {
                            learningFormIds.add(formId.substring(2));
                        }
                    }
                }

                // Update node states to 'learning' for active learning targets
                state.treeData.nodes.forEach(function(node) {
                    if (!node.formId) return;

                    var nodeFormId = node.formId;
                    var isLearningTarget = learningFormIds.has(nodeFormId);

                    // Also check with 0x prefix if node doesn't have it
                    if (!isLearningTarget && !nodeFormId.startsWith('0x')) {
                        isLearningTarget = learningFormIds.has('0x' + nodeFormId);
                    }

                    if (isLearningTarget && node.state !== 'unlocked') {
                        console.log('[SpellLearning] Setting node ' + (node.name || node.formId) + ' to learning state');
                        node.state = 'learning';
                    }
                });

                // Rebuild CanvasRenderer learning paths if available
                if (typeof CanvasRenderer !== 'undefined' && CanvasRenderer._nodeMap) {
                    console.log('[SpellLearning] Rebuilding CanvasRenderer learning paths...');
                    CanvasRenderer._buildLearningPaths();
                    CanvasRenderer._needsRender = true;
                }
            }
        }

        // Load spell progress
        if (data.spellProgress) {
            state.spellProgress = data.spellProgress;
            var count = Object.keys(state.spellProgress).length;
            console.log('[SpellLearning] Loaded progress for ' + count + ' spells');

            // Log a few examples
            var keys = Object.keys(state.spellProgress).slice(0, 3);
            keys.forEach(function(k) {
                var p = state.spellProgress[k];
                console.log('[SpellLearning]   ' + k + ': ' + p.xp + '/' + p.required + ' XP');
            });
        }

        // Update display
        if (state.treeData) {
            WheelRenderer.updateNodeStates();
        }

        // Update details panel if a node is selected
        if (state.selectedNode) {
            updateDetailsProgression(state.selectedNode);
        }

    } catch (e) {
        console.error('[SpellLearning] Failed to parse progress data:', e);
    }

    // Note: GetPlayerKnownSpells is now called directly from the caller (onPanelShowing, etc.)
    // rather than using a deferred flag mechanism
};
