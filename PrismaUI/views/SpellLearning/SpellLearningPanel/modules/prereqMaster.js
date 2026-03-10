/**
 * prereqMaster.js - Pre Req Master: Core Lock Building
 *
 * Lock assignment logic: pool filtering, lock building, NLP/JS scoring dispatch.
 *
 * Depends on:
 * - modules/prereqMasterScoring.js (_fisherYatesShuffle, getTierIndex, getTierName, TIER_NAMES,
 *     gridDistance, _cachedPosMap, _isDescendant, _isOnlyReachableThrough, _detectAndRemoveLockCycles,
 *     _removeLockEdges, _validateReachability, batchTfIdfScore, _getDescendants)
 * - modules/state.js (state, settings)
 */

// =========================================================================
// SETTINGS - Read from UI controls
// =========================================================================

function getSettings() {
    return {
        globalLockPercent: parseInt(document.getElementById('prmGlobalLockSlider')?.value || '30'),
        tierPercents: {
            novice:     parseInt(document.getElementById('prmTierNovice')?.value || '0'),
            apprentice: parseInt(document.getElementById('prmTierApprentice')?.value || '10'),
            adept:      parseInt(document.getElementById('prmTierAdept')?.value || '25'),
            expert:     parseInt(document.getElementById('prmTierExpert')?.value || '40'),
            master:     parseInt(document.getElementById('prmTierMaster')?.value || '50')
        },
        schoolDistribution: document.getElementById('prmSchoolDistribution')?.value || 'proportional',
        poolSource:     document.getElementById('prmPoolSource')?.value || 'same_school',
        distance:       parseInt(document.getElementById('prmDistanceSlider')?.value || '200'),
        proximityBias:  parseInt(document.getElementById('prmProximityBiasSlider')?.value || '50') / 100,
        sameTier:       document.getElementById('prmSameTier')?.checked !== false,
        prevTier:       document.getElementById('prmPrevTier')?.checked !== false,
        higherTier:     document.getElementById('prmHigherTier')?.checked === true,
        allowLockedLock: document.getElementById('prmAllowLockedLock')?.checked === true
    };
}

// =========================================================================
// POOL FILTERING
// =========================================================================

/**
 * Build the candidate pool for a given spell node.
 * @param {Object} spellNode - The spell to find a lock prereq for
 * @param {Map} allNodes - TreeParser.nodes
 * @param {Object} settings - From getSettings()
 * @returns {Array} Array of candidate nodes
 */
function buildCandidatePool(spellNode, allNodes, settings) {
    var candidates = [];
    var spellTier = getTierIndex(spellNode);
    var spellId = spellNode.id || spellNode.formId;

    // Pre-compute descendants of this spell (single BFS)
    var spellDescendants = _getDescendants(spellId, allNodes);

    // Pre-compute reachability WITHOUT this spell (single BFS replaces N per-candidate calls)
    var reachableWithoutSpell = {};
    var roots = [];
    allNodes.forEach(function(node, nid) {
        if (node.isRoot) roots.push(nid);
    });
    var bfsQueue = roots.slice();
    while (bfsQueue.length > 0) {
        var curId = bfsQueue.shift();
        if (curId === spellId) continue;
        if (reachableWithoutSpell[curId]) continue;
        reachableWithoutSpell[curId] = true;
        var curNode = allNodes.get(curId);
        if (curNode && curNode.children) {
            for (var ci = 0; ci < curNode.children.length; ci++) {
                bfsQueue.push(curNode.children[ci]);
            }
        }
    }

    allNodes.forEach(function(candidate, id) {
        // --- Cheap checks first ---
        if (id === spellId) return;
        if (candidate.isRoot) return;

        // Pool source filter (school/distance) — fast rejection
        if (settings.poolSource === 'same_school') {
            if (candidate.school !== spellNode.school) return;
        } else if (settings.poolSource === 'nearby') {
            var dist = gridDistance(spellNode, candidate);
            if (dist > settings.distance) return;
        }

        // Tier constraint filter
        var candTier = getTierIndex(candidate);
        if (candTier === spellTier && !settings.sameTier) return;
        if (candTier < spellTier && !settings.prevTier) return;
        if (candTier > spellTier && !settings.higherTier) return;

        // Don't let locked nodes lock each other (unless toggle is on)
        if (!settings.allowLockedLock) {
            if (candidate.locks && candidate.locks.length > 0) return;
        }

        // Can't pick a node that's already a regular prerequisite (redundant)
        if (spellNode.prerequisites && spellNode.prerequisites.indexOf(id) !== -1) return;
        if (spellNode.hardPrereqs && spellNode.hardPrereqs.indexOf(id) !== -1) return;

        // Can't pick a node that's already a lock
        if (spellNode.locks) {
            var alreadyLocked = false;
            for (var i = 0; i < spellNode.locks.length; i++) {
                if (spellNode.locks[i].nodeId === id) { alreadyLocked = true; break; }
            }
            if (alreadyLocked) return;
        }

        // --- Pre-computed graph checks (O(1) lookups) ---
        // Can't lock to a descendant (creates deadlock)
        if (spellDescendants[id]) return;
        // Can't lock to a node only reachable through spellId (deadlock)
        if (!reachableWithoutSpell[id]) return;

        candidates.push(candidate);
    });

    // Cap pool size to prevent massive payloads
    var MAX_CANDIDATES = 50;
    if (candidates.length > MAX_CANDIDATES) {
        if (settings.poolSource === 'nearby') {
            // Nearby: keep closest by distance
            candidates.sort(function(a, b) {
                return gridDistance(spellNode, a) - gridDistance(spellNode, b);
            });
            candidates = candidates.slice(0, MAX_CANDIDATES);
        } else {
            // Same school / any school: random sample
            _fisherYatesShuffle(candidates);
            candidates = candidates.slice(0, MAX_CANDIDATES);
        }
    }

    return candidates;
}

// =========================================================================
// LOCK ASSIGNMENT
// =========================================================================

/**
 * Build the lock request: determine which spells get locks and their candidate pools.
 * @returns {Object} { eligible: [{node, candidates}...], settings }
 */
function _prmLog(msg) {
    var full = '[PreReqMaster] ' + msg;
    console.log(full);
    if (window.callCpp) {
        try { window.callCpp('LogMessage', JSON.stringify({ level: 'info', message: full })); } catch(e) {}
    }
}

/**
 * Build a Map of all nodes from the active tree growth mode's _treeData.
 * Returns a Map<formId, node> matching the interface PRM expects.
 * Falls back to TreeParser.nodes if available.
 */
function _getAllNodes() {
    // Primary: pull from active tree growth mode
    if (typeof TreeGrowth !== 'undefined' && TreeGrowth.modes && TreeGrowth.activeMode) {
        var modeModule = TreeGrowth.modes[TreeGrowth.activeMode];
        if (modeModule && modeModule._treeData && modeModule._treeData.schools) {
            var nodeMap = new Map();
            var schools = modeModule._treeData.schools;
            for (var schoolName in schools) {
                if (!schools.hasOwnProperty(schoolName)) continue;
                var src = schools[schoolName];
                var srcNodes = src.nodes || [];
                var rootId = src.root || (srcNodes.length > 0 ? srcNodes[0].formId : '');
                for (var i = 0; i < srcNodes.length; i++) {
                    var sn = srcNodes[i];
                    if (!sn.formId) continue;
                    // Ensure school is set on node
                    if (!sn.school) sn.school = schoolName;
                    // Mark root
                    if (sn.formId === rootId) sn.isRoot = true;
                    // Ensure id alias
                    if (!sn.id) sn.id = sn.formId;
                    nodeMap.set(sn.formId, sn);
                }
            }
            if (nodeMap.size > 0) {
                return nodeMap;
            }
        }
    }

    // Fallback: TreeParser (legacy / tree viewer path)
    if (typeof TreeParser !== 'undefined' && TreeParser.nodes && TreeParser.nodes.size > 0) {
        return TreeParser.nodes;
    }

    return null;
}

function buildLockRequest() {
    var allNodes = _getAllNodes();
    if (!allNodes || allNodes.size === 0) {
        _prmLog('No tree data available (allNodes=' + (allNodes ? allNodes.size : 'null') + ')');
        return null;
    }

    var settings = getSettings();

    _prmLog('buildLockRequest: nodes=' + allNodes.size + ', globalLock%=' + settings.globalLockPercent +
            ', pool=' + settings.poolSource + ', dist=' + settings.distance);

    // Sample first 3 nodes to check tier values
    var sampleCount = 0;
    allNodes.forEach(function(node) {
        if (sampleCount < 3) {
            _prmLog('  sample node: id=' + (node.id || node.formId) + ', tier=' + node.tier +
                    ', school=' + node.school + ', isRoot=' + node.isRoot);
            sampleCount++;
        }
    });

    // Group nodes by school and tier
    var schoolTierGroups = {}; // { school: { tier: [nodes] } }
    allNodes.forEach(function(node) {
        if (node.isRoot) return; // Skip root nodes
        var school = node.school || 'Unknown';
        var tierName = getTierName(node);
        if (!schoolTierGroups[school]) schoolTierGroups[school] = {};
        if (!schoolTierGroups[school][tierName]) schoolTierGroups[school][tierName] = [];
        schoolTierGroups[school][tierName].push(node);
    });

    // Calculate total spells per school
    var schoolCounts = {};
    var totalSpells = 0;
    for (var school in schoolTierGroups) {
        schoolCounts[school] = 0;
        for (var tier in schoolTierGroups[school]) {
            schoolCounts[school] += schoolTierGroups[school][tier].length;
        }
        totalSpells += schoolCounts[school];
    }

    // How many total locks to assign
    var totalLocks = Math.round(totalSpells * settings.globalLockPercent / 100);

    // Log tier distribution
    var tierDist = {};
    for (var ds in schoolTierGroups) {
        for (var dt in schoolTierGroups[ds]) {
            tierDist[dt] = (tierDist[dt] || 0) + schoolTierGroups[ds][dt].length;
        }
    }
    _prmLog('tierDist=' + JSON.stringify(tierDist) + ', totalSpells=' + totalSpells + ', totalLocks=' + totalLocks);
    _prmLog('tierPercents=' + JSON.stringify(settings.tierPercents));

    // Distribute locks across schools
    var schoolLockBudgets = {};
    var schoolNames = Object.keys(schoolCounts);

    if (settings.schoolDistribution === 'even') {
        var perSchool = Math.floor(totalLocks / schoolNames.length);
        schoolNames.forEach(function(s) { schoolLockBudgets[s] = perSchool; });
    } else if (settings.schoolDistribution === 'proportional') {
        schoolNames.forEach(function(s) {
            schoolLockBudgets[s] = Math.round(totalLocks * schoolCounts[s] / totalSpells);
        });
    } else { // random
        schoolNames.forEach(function(s) { schoolLockBudgets[s] = 0; });
        for (var i = 0; i < totalLocks; i++) {
            var randomSchool = schoolNames[Math.floor(Math.random() * schoolNames.length)];
            schoolLockBudgets[randomSchool]++;
        }
    }

    // For each school, pick eligible spells per tier
    var eligible = [];

    _prmLog('schoolBudgets=' + JSON.stringify(schoolLockBudgets));

    for (var sch in schoolTierGroups) {
        var budget = schoolLockBudgets[sch] || 0;
        if (budget <= 0) continue;

        // Distribute budget across tiers based on tier %
        var tierNodes = schoolTierGroups[sch];
        var tierBudgets = {};
        var allocatedSoFar = 0;

        TIER_NAMES.forEach(function(tierName) {
            var nodesInTier = (tierNodes[tierName] || []).length;
            var tierPct = settings.tierPercents[tierName] || 0;
            var tierCount = Math.min(
                Math.round(nodesInTier * tierPct / 100),
                budget - allocatedSoFar
            );
            tierBudgets[tierName] = tierCount;
            allocatedSoFar += tierCount;
        });

        _prmLog('school=' + sch + ' budget=' + budget + ' tierBudgets=' + JSON.stringify(tierBudgets) + ' allocated=' + allocatedSoFar);

        // Fallback: if tier-based allocation gave 0, distribute budget randomly across all non-root nodes
        if (allocatedSoFar === 0 && budget > 0) {
            _prmLog('FALLBACK: tier allocation=0 for ' + sch + ', distributing ' + budget + ' randomly');
            var allSchoolNodes = [];
            for (var ft in tierNodes) {
                allSchoolNodes = allSchoolNodes.concat(tierNodes[ft]);
            }
            _fisherYatesShuffle(allSchoolNodes);
            var fbPicked = allSchoolNodes.slice(0, Math.min(budget, allSchoolNodes.length));
            fbPicked.forEach(function(node) {
                var candidates = buildCandidatePool(node, allNodes, settings);
                if (candidates.length > 0) {
                    eligible.push({ node: node, candidates: candidates });
                }
            });
            continue; // skip the normal tier-based loop below
        }

        // Pick random spells from each tier to receive locks
        var tierPickedIds = {};  // track which nodes got picked
        TIER_NAMES.forEach(function(tierName) {
            var count = tierBudgets[tierName] || 0;
            var pool = tierNodes[tierName] || [];
            if (count <= 0 || pool.length === 0) return;

            // Shuffle and pick (Fisher-Yates for uniform distribution)
            var shuffled = pool.slice();
            _fisherYatesShuffle(shuffled);
            var picked = shuffled.slice(0, count);

            picked.forEach(function(node) {
                tierPickedIds[node.id || node.formId] = true;
                var candidates = buildCandidatePool(node, allNodes, settings);
                if (candidates.length > 0) {
                    eligible.push({ node: node, candidates: candidates });
                }
            });
        });

        // Safety net: if tier allocation didn't fill the budget, distribute remaining randomly
        var remaining = budget - allocatedSoFar;
        if (remaining > 0) {
            _prmLog('REMAINDER: ' + remaining + ' unallocated locks for ' + sch + ', distributing randomly');
            var allSchoolNodesR = [];
            for (var rt in tierNodes) {
                tierNodes[rt].forEach(function(n) {
                    if (!tierPickedIds[n.id || n.formId]) allSchoolNodesR.push(n);
                });
            }
            _fisherYatesShuffle(allSchoolNodesR);
            var remPicked = allSchoolNodesR.slice(0, Math.min(remaining, allSchoolNodesR.length));
            remPicked.forEach(function(node) {
                var candidates = buildCandidatePool(node, allNodes, settings);
                if (candidates.length > 0) {
                    eligible.push({ node: node, candidates: candidates });
                }
            });
        }
    }

    _prmLog('Result: eligible=' + eligible.length + '/' + totalLocks + ' target locks');
    return { eligible: eligible, settings: settings };
}

/**
 * Score candidates and apply locks using JS TF-IDF scorer (fallback).
 * @param {Object} request - From buildLockRequest()
 */
function applyLocksWithJSScorer(request) {
    if (!request || !request.eligible) return 0;

    var lockCount = 0;

    // Track how many times each node has been used as a lock target.
    // Cap at 2 to prevent one popular node from being everyone's prerequisite.
    var targetUsage = {};  // nodeId -> count
    var MAX_TARGET_USES = 2;

    // Shuffle the eligible list so no school/tier order bias in who gets first pick
    _fisherYatesShuffle(request.eligible);

    request.eligible.forEach(function(item) {
        var spellNode = item.node;
        var candidates = item.candidates;
        var settings = request.settings;

        // Filter out candidates that have already been used as a target too many times
        // Also filter out candidates that gained locks during this batch (chain lock prevention)
        var availableCandidates = candidates.filter(function(c) {
            var cId = c.id || c.formId;
            if ((targetUsage[cId] || 0) >= MAX_TARGET_USES) return false;
            if (!settings.allowLockedLock && c.locks && c.locks.length > 0) return false;
            return true;
        });

        if (availableCandidates.length === 0) {
            _prmLog('SKIP lock for ' + (spellNode.name || spellNode.formId) +
                     ': all ' + candidates.length + ' candidates hit target cap (' + MAX_TARGET_USES + ')');
            return;
        }

        // Batch TF-IDF scoring (builds corpus per spell for proper IDF weighting)
        var scored = batchTfIdfScore(spellNode, availableCandidates);

        // Blend with proximity if nearby mode
        if (settings.poolSource === 'nearby' && settings.proximityBias > 0) {
            var maxDist = settings.distance || 5;
            scored = scored.map(function(s) {
                var dist = gridDistance(spellNode, s.node);
                var proxScore = maxDist > 0 ? Math.max(0, 1 - (dist / maxDist)) : 0;
                return {
                    node: s.node,
                    score: (1 - settings.proximityBias) * s.score + settings.proximityBias * proxScore
                };
            });
            scored.sort(function(a, b) { return b.score - a.score; });
        }

        // Pick from top candidates (weighted random to avoid always picking #1)
        // Take top 5 candidates, then weighted-random select one (higher score = more likely)
        if (scored.length > 0) {
            var topN = scored.slice(0, Math.min(5, scored.length));

            // Weighted random: score-proportional probability
            var totalScore = 0;
            for (var si = 0; si < topN.length; si++) {
                totalScore += Math.max(topN[si].score, 0.01); // floor at 0.01 so 0-scored items have a small chance
            }
            var roll = Math.random() * totalScore;
            var cumulative = 0;
            var chosen = topN[0]; // fallback
            for (var ci = 0; ci < topN.length; ci++) {
                cumulative += Math.max(topN[ci].score, 0.01);
                if (roll <= cumulative) {
                    chosen = topN[ci];
                    break;
                }
            }

            var chosenId = chosen.node.id || chosen.node.formId;

            if (!spellNode.locks) spellNode.locks = [];

            spellNode.locks.push({
                nodeId: chosenId,
                score: Math.round(chosen.score * 1000) / 1000,
                revealed: false
            });

            // Track target usage
            targetUsage[chosenId] = (targetUsage[chosenId] || 0) + 1;

            lockCount++;
        }
    });

    _prmLog('Applied ' + lockCount + ' locks (JS TF-IDF scorer)');

    // Post-assignment: detect and remove cycles in the combined tree+lock graph
    var allNodesAfter = _getAllNodes();
    var cycleLocks = _detectAndRemoveLockCycles(allNodesAfter);
    if (cycleLocks.length > 0) {
        _prmLog('CYCLE DETECTION: Found ' + cycleLocks.length + ' lock edges in cycles, removing...');
        var removedCount = _removeLockEdges(cycleLocks, allNodesAfter);
        lockCount -= removedCount;
        if (lockCount < 0) lockCount = 0;
        _prmLog('Removed ' + removedCount + ' deadlock-causing locks, ' + lockCount + ' locks remain');
    } else {
        _prmLog('Cycle detection passed - no deadlocks in combined tree+lock graph');
    }

    // Validate reachability
    var unreachable = _validateReachability(allNodesAfter);
    if (unreachable.length > 0) {
        _prmLog('WARNING: ' + unreachable.length + ' nodes unreachable after locks: ' + unreachable.join(', '));
    } else {
        _prmLog('Reachability check passed - all nodes reachable from root');
    }

    return lockCount;
}

/**
 * Build the payload for NLP scoring (same format as prereq_master_scorer.py expects).
 */
function _buildTreePayload(request) {
    return {
        pairs: request.eligible.map(function(item) {
            return {
                spellId: item.node.id || item.node.formId,
                spell: {
                    name: item.node.name || '',
                    desc: item.node.desc || '',
                    effects: (item.node.effects || []).map(function(e) {
                        return typeof e === 'string' ? e : (e.name || '');
                    })
                },
                candidates: item.candidates.map(function(c) {
                    return {
                        nodeId: c.id || c.formId,
                        name: c.name || '',
                        desc: c.desc || '',
                        effects: (c.effects || []).map(function(e) {
                            return typeof e === 'string' ? e : (e.name || '');
                        }),
                        distance: gridDistance(item.node, c)
                    };
                })
            };
        }),
        settings: {
            proximityBias: request.settings.proximityBias,
            poolSource: request.settings.poolSource,
            distance: request.settings.distance
        }
    };
}

/**
 * Apply locks using the best available scorer.
 * Tries NLP via C++ bridge first, falls back to JS TF-IDF.
 * @returns {number} Lock count (sync), or -1 if async (C++)
 */
function applyLocksWithScorer(request) {
    if (!request || !request.eligible || request.eligible.length === 0) return 0;

    // Try NLP via C++ bridge
    if (window.callCpp) {
        try {
            var payload = _buildTreePayload(request);
            _prmLog('Sending ' + payload.pairs.length + ' pairs to NLP scorer...');
            window.callCpp('PreReqMasterScore', JSON.stringify(payload));
            return -1; // Async - result comes via onPreReqMasterComplete callback
        } catch (e) {
            _prmLog('C++ bridge failed, using JS TF-IDF fallback: ' + e.message);
        }
    }

    // Fallback: JS TF-IDF scorer (synchronous)
    return applyLocksWithJSScorer(request);
}
