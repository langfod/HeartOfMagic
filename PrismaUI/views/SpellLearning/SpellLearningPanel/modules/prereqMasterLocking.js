/**
 * PreReqMaster Locking - Lock management and UI helpers.
 * Loaded after: prereqMaster.js
 *
 * Depends on:
 * - modules/prereqMasterScoring.js (_fisherYatesShuffle, _isDescendant, _isOnlyReachableThrough,
 *     _detectAndRemoveLockCycles, _removeLockEdges, _validateReachability, _cachedPosMap)
 * - modules/prereqMaster.js (_prmLog, _getAllNodes, getSettings, buildLockRequest,
 *     applyLocksWithJSScorer)
 */

// =========================================================================
// NLP SCORING CALLBACK
// =========================================================================

/**
 * Callback from NLP scoring.
 * @param {string} resultStr - JSON string with scored results
 */
window.onPreReqMasterComplete = function(resultStr) {
    try {
        // Clear BFS caches for fresh lock evaluation
        _clearDescendantCache();
        _cachedPosMap = null;

        // Respect PRM toggle -- if user disabled PRM while C++ was scoring, bail out
        if (!isEnabled()) {
            _prmLog('PRM disabled during C++ scoring -- discarding results');
            updateStatus('Prerequisite locks disabled');
            if (typeof BuildProgress !== 'undefined' && BuildProgress.isActive()) {
                BuildProgress.setStage('finalize');
                setTimeout(function() { BuildProgress.complete('PRM disabled'); }, 300);
            }
            return;
        }

        var result = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;
        if (!result.success || !result.scores) {
            _prmLog('C++ scoring failed: ' + (result.error || 'unknown') + ' - falling back to JS TF-IDF');
            // Fall back to JS TF-IDF scorer
            var request = buildLockRequest();
            if (request) {
                var count = applyLocksWithJSScorer(request);
                updateStatus(count + ' locks applied (JS fallback)');
                onLocksChanged();
                if (typeof TreeAnimation !== 'undefined' && TreeAnimation.notifyLocksApplied) {
                    TreeAnimation.notifyLocksApplied();
                }
            } else {
                updateStatus('No eligible spells for locks');
            }
            return;
        }

        // Apply NLP results with cycle validation + weighted random + target cap
        var lockCount = 0;
        var skippedCount = 0;
        var nlpNodes = _getAllNodes();
        var nlpSettings = getSettings();
        var nlpTargetUsage = {};  // nodeId -> count
        var NLP_MAX_TARGET_USES = 2;

        // Shuffle to avoid order bias
        _fisherYatesShuffle(result.scores);

        result.scores.forEach(function(item) {
            var node = nlpNodes ? nlpNodes.get(item.spellId) : null;
            if (!node) return;

            var spellId = node.id || node.formId;

            // Use topCandidates if available (new format), fall back to bestMatch
            var topCandidates = item.topCandidates || [{ nodeId: item.bestMatch, score: item.score }];

            // Filter out candidates that would create deadlocks, hit the target cap, or violate chain lock setting
            var validCandidates = [];
            for (var vi = 0; vi < topCandidates.length; vi++) {
                var cId = topCandidates[vi].nodeId;
                if ((nlpTargetUsage[cId] || 0) >= NLP_MAX_TARGET_USES) continue;
                // Chain lock check: skip candidates that already have locks assigned this batch
                if (!nlpSettings.allowLockedLock) {
                    var candNode = nlpNodes ? nlpNodes.get(cId) : null;
                    if (candNode && candNode.locks && candNode.locks.length > 0) continue;
                }
                if (!_isDescendant(spellId, cId, nlpNodes) && !_isOnlyReachableThrough(spellId, cId, nlpNodes)) {
                    validCandidates.push(topCandidates[vi]);
                }
            }

            if (validCandidates.length === 0) {
                _prmLog('REJECTED all candidates for ' + (node.name || spellId) + ' (deadlock/cap)');
                skippedCount++;
                return;
            }

            // Weighted random selection from valid candidates
            var totalScore = 0;
            for (var ts = 0; ts < validCandidates.length; ts++) {
                totalScore += Math.max(validCandidates[ts].score, 0.01);
            }
            var roll = Math.random() * totalScore;
            var cumul = 0;
            var chosen = validCandidates[0];
            for (var wc = 0; wc < validCandidates.length; wc++) {
                cumul += Math.max(validCandidates[wc].score, 0.01);
                if (roll <= cumul) {
                    chosen = validCandidates[wc];
                    break;
                }
            }

            if (!node.locks) node.locks = [];

            node.locks.push({
                nodeId: chosen.nodeId,
                score: chosen.score,
                revealed: false
            });

            // Track target usage
            nlpTargetUsage[chosen.nodeId] = (nlpTargetUsage[chosen.nodeId] || 0) + 1;

            lockCount++;
        });

        if (skippedCount > 0) {
            _prmLog('Rejected ' + skippedCount + ' locks that would create descendant deadlocks');
        }

        // Post-assignment: detect and remove cycles in the combined tree+lock graph
        var cycleLocks = _detectAndRemoveLockCycles(nlpNodes);
        if (cycleLocks.length > 0) {
            _prmLog('CYCLE DETECTION: Found ' + cycleLocks.length + ' lock edges in cycles, removing...');
            var removedCount = _removeLockEdges(cycleLocks, nlpNodes);
            lockCount -= removedCount;
            if (lockCount < 0) lockCount = 0;
            skippedCount += removedCount;
            _prmLog('Removed ' + removedCount + ' deadlock-causing locks, ' + lockCount + ' locks remain');
        } else {
            _prmLog('Cycle detection passed - no deadlocks in combined tree+lock graph');
        }

        // Validate reachability
        var unreachable = _validateReachability(nlpNodes);
        if (unreachable.length > 0) {
            _prmLog('WARNING: ' + unreachable.length + ' nodes unreachable after locks: ' + unreachable.join(', '));
        } else {
            _prmLog('Reachability check passed - all nodes reachable from root');
        }

        _prmLog('Applied ' + lockCount + ' locks (NLP, ' + (result.count || lockCount) + ' scored, ' + skippedCount + ' rejected)');
        updateStatus(lockCount + ' locks applied (NLP)');
        onLocksChanged();

        // Notify animation to start chain phase
        if (typeof TreeAnimation !== 'undefined' && TreeAnimation.notifyLocksApplied) {
            TreeAnimation.notifyLocksApplied();
        }

        // Advance build progress: prereqs done -> finalize -> complete
        if (typeof BuildProgress !== 'undefined' && BuildProgress.isActive()) {
            BuildProgress.setDetail(lockCount + ' prerequisite locks applied');
            BuildProgress.setStage('finalize');
            setTimeout(function() {
                BuildProgress.complete(lockCount + ' locks applied');
            }, 400);
        }
    } catch (e) {
        _prmLog('ERROR processing C++ results: ' + e.message + ' - falling back to JS TF-IDF');
        // Fall back to JS scorer on parse error
        var fbRequest = buildLockRequest();
        if (fbRequest) {
            var fbCount = applyLocksWithJSScorer(fbRequest);
            updateStatus(fbCount + ' locks applied (JS fallback)');
            onLocksChanged();
            if (typeof TreeAnimation !== 'undefined' && TreeAnimation.notifyLocksApplied) {
                TreeAnimation.notifyLocksApplied();
            }

            // Advance build progress after JS fallback
            if (typeof BuildProgress !== 'undefined' && BuildProgress.isActive()) {
                BuildProgress.setDetail(fbCount + ' locks applied (JS fallback)');
                BuildProgress.setStage('finalize');
                setTimeout(function() { BuildProgress.complete(); }, 400);
            }
        }
    }
};

// =========================================================================
// LOCK MANAGEMENT
// =========================================================================

/**
 * Clear all locks from every node in the tree.
 */
function clearLocks() {
    var clrNodes = _getAllNodes();
    if (!clrNodes) return;

    var cleared = 0;
    clrNodes.forEach(function(node) {
        if (node.locks && node.locks.length > 0) {
            cleared += node.locks.length;
            node.locks = [];
        }
    });

    // Invalidate position cache
    _cachedPosMap = null;

    _prmLog('Cleared ' + cleared + ' locks');
    updateStatus('Locks cleared');
    onLocksChanged();
    return cleared;
}

/**
 * Reveal locks for a given node (called when user clicks a node).
 * Also reveals locks on OTHER nodes where this node is the lock prereq.
 * @param {string} nodeId - The clicked node's ID
 */
function revealLocksForNode(nodeId) {
    var revNodes = _getAllNodes();
    if (!revNodes) return;

    var revealed = 0;

    // Reveal locks ON this node
    var node = revNodes.get(nodeId);
    if (node && node.locks) {
        node.locks.forEach(function(lock) {
            if (!lock.revealed) {
                lock.revealed = true;
                revealed++;
            }
        });
    }

    // Reveal locks on OTHER nodes where THIS node is the lock prereq
    revNodes.forEach(function(otherNode) {
        if (otherNode.locks) {
            otherNode.locks.forEach(function(lock) {
                if (lock.nodeId === nodeId && !lock.revealed) {
                    lock.revealed = true;
                    revealed++;
                }
            });
        }
    });

    if (revealed > 0) {
        _prmLog('Revealed ' + revealed + ' locks for node ' + nodeId);
    }

    return revealed;
}

/**
 * Get all lock edges for rendering (only revealed ones).
 * @returns {Array} [{from: nodeId, to: lockNodeId, score: number}]
 */
function getRevealedLockEdges() {
    var edges = [];
    var revEdgeNodes = _getAllNodes();
    if (!revEdgeNodes) return edges;

    revEdgeNodes.forEach(function(node) {
        if (node.locks) {
            node.locks.forEach(function(lock) {
                if (lock.revealed) {
                    edges.push({
                        from: lock.nodeId,
                        to: node.id || node.formId,
                        score: lock.score
                    });
                }
            });
        }
    });

    return edges;
}

/**
 * Get locks for a specific node (for detail panel display).
 * @param {string} nodeId
 * @returns {Array} [{nodeId, score, revealed, name}]
 */
function getLocksForNode(nodeId) {
    var lockNodes = _getAllNodes();
    var node = lockNodes ? lockNodes.get(nodeId) : null;
    if (!node || !node.locks) return [];

    return node.locks.map(function(lock) {
        var lockNode = lockNodes.get(lock.nodeId);
        return {
            nodeId: lock.nodeId,
            score: lock.score,
            revealed: lock.revealed,
            name: lockNode ? lockNode.name : null
        };
    });
}

// =========================================================================
// UI HELPERS
// =========================================================================

function updateStatus(msg) {
    var el = document.getElementById('prmStatus');
    if (el) el.textContent = msg;
}

function setButtonsEnabled(enabled) {
    var applyBtn = document.getElementById('prmApplyBtn');
    var clearBtn = document.getElementById('prmClearBtn');
    if (applyBtn) applyBtn.disabled = !enabled;
    if (clearBtn) clearBtn.disabled = !enabled;
}

function isEnabled() {
    var toggle = document.getElementById('prmEnabled');
    return toggle ? toggle.checked : false;
}

function onLocksChanged() {
    // Trigger re-render of the main tree viewer
    if (typeof window.requestTreeRender === 'function') {
        window.requestTreeRender();
    } else if (typeof CanvasRendererV2 !== 'undefined' && CanvasRendererV2.requestRender) {
        CanvasRendererV2.requestRender();
    }

    // Update the PRM preview canvas
    renderPreview();
}
