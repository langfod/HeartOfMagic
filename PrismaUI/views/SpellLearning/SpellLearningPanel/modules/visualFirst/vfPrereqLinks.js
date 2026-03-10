/**
 * Visual-First Prerequisite Link System
 *
 * Rank-based prerequisite assignment and hard/soft requirement system.
 * Depends on: vfHelpers.js, vfThematic.js, layoutGenerator.js (GRID_CONFIG)
 */

// =============================================================================
// PREREQUISITE LINK SYSTEM
// =============================================================================

/**
 * Prerequisite count by spell rank
 * Higher rank spells require more prerequisites
 */
var PREREQ_COUNTS_BY_RANK = {
    0: { min: 0, max: 0 },   // Novice - no prerequisites (entry points)
    1: { min: 1, max: 2 },   // Apprentice - 1-2 prerequisites
    2: { min: 1, max: 3 },   // Adept - 1-3 prerequisites
    3: { min: 2, max: 4 },   // Expert - 2-4 prerequisites
    4: { min: 2, max: 5 }    // Master - 2-5 prerequisites
};

/**
 * Calculate similarity score between two nodes for prerequisite selection
 * Higher score = better prerequisite candidate
 *
 * @param {Object} candidate - Potential prerequisite node
 * @param {Object} target - Node that needs prerequisites
 * @param {Object} spellToGroup - Spell to fuzzy group mapping
 * @param {Object} treeGeneration - Tree generation settings (optional)
 * @returns {number} - Score (higher = better match)
 */
function calculatePrereqScore(candidate, target, spellToGroup, treeGeneration) {
    var score = 0;
    var treeGen = treeGeneration || {};

    // 0. ELEMENT ISOLATION CHECK (highest priority)
    // Must check this first - element conflicts cause massive penalties
    if (candidate.spell && target.spell) {
        var thematicSim = calculateThematicSimilarity(candidate.spell, target.spell);
        var hasElementConflict = thematicSim <= 0.1;  // 0.1 = element conflict

        if (hasElementConflict) {
            if (treeGen.elementIsolationStrict) {
                return -10000;  // Forbidden - cross-element links not allowed
            } else if (treeGen.elementIsolation) {
                score -= 500;   // Heavy penalty but not forbidden
            }
        } else if (thematicSim >= 0.8) {
            // Same element bonus
            score += 100;
        }
    }

    // 1. TIER FACTOR: Candidate must be lower tier (closer to root)
    // Strong preference for 1-3 tiers below
    var tierDiff = target.tier - candidate.tier;
    if (tierDiff <= 0) {
        return -1000; // Invalid: prerequisite must be lower tier
    }
    if (tierDiff === 1) score += 50;      // Immediate predecessor - best
    else if (tierDiff === 2) score += 40;
    else if (tierDiff <= 4) score += 30;
    else if (tierDiff <= 8) score += 15;
    else score += 5;                       // Very distant - still valid but not preferred

    // 2. FUZZY GROUP FACTOR: Same thematic group is preferred
    var candidateGroup = spellToGroup[candidate.formId];
    var targetGroup = spellToGroup[target.formId];

    if (candidateGroup && targetGroup) {
        if (candidateGroup.theme === targetGroup.theme) {
            score += 40; // Same theme - strong connection
        } else {
            score += 10; // Different theme - cross-school knowledge
        }
    }

    // 3. PROXIMITY FACTOR: Closer nodes preferred (but not too close)
    var dx = target.x - candidate.x;
    var dy = target.y - candidate.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var nodeSize = GRID_CONFIG.nodeSize;

    if (dist < nodeSize * 2) {
        score += 30; // Very close - strong spatial connection
    } else if (dist < nodeSize * 5) {
        score += 20; // Moderate distance
    } else if (dist < nodeSize * 10) {
        score += 10; // Far but reasonable
    }
    // Very far gets no bonus

    // 4. RANK FACTOR: Prerequisite should be lower or equal rank
    var candidateRank = getSpellRank(candidate.spell);
    var targetRank = getSpellRank(target.spell);

    if (candidateRank < targetRank) {
        score += 25; // Lower rank - appropriate prerequisite
    } else if (candidateRank === targetRank) {
        score += 10; // Same rank - peer knowledge
    } else {
        score -= 20; // Higher rank prereq is unusual
    }

    // 5. HUB BONUS: Hubs make good prerequisites (knowledge centers)
    if (candidate.isHub) {
        score += 15;
    }

    return score;
}

/**
 * Add prerequisite links to spells based on rank and similarity
 *
 * @param {Array} positions - All node positions
 * @param {Array} edges - Existing edges (will be modified)
 * @param {Object} spellToGroup - Spell to fuzzy group mapping
 * @param {Function} rng - Random number generator
 * @param {Object} treeGeneration - Tree generation settings (for element isolation)
 * @returns {Object} - { count: number of prereqs added }
 */
function addPrerequisiteLinks(positions, edges, spellToGroup, rng, treeGeneration) {
    var prereqsAdded = 0;

    // Build existing edge set to avoid duplicates
    var existingEdges = {};
    edges.forEach(function(e) {
        var key = e.from + '->' + e.to;
        existingEdges[key] = true;
        // Also mark reverse (bidirectional check)
        existingEdges[e.to + '->' + e.from] = true;
    });

    // Build node lookup by formId
    var nodeByFormId = {};
    positions.forEach(function(node) {
        nodeByFormId[node.formId] = node;
    });

    // Process each non-root node
    positions.forEach(function(targetNode) {
        if (targetNode.isRoot) return; // Root has no prerequisites

        var spell = targetNode.spell;
        if (!spell) return;

        var rank = getSpellRank(spell);
        var prereqConfig = PREREQ_COUNTS_BY_RANK[rank] || { min: 0, max: 1 };

        // Determine how many prerequisites this spell needs
        var range = prereqConfig.max - prereqConfig.min;
        var targetPrereqCount = prereqConfig.min + Math.floor(rng() * (range + 1));

        if (targetPrereqCount <= 0) return;

        // Count existing prerequisites (incoming edges where this node is 'to')
        var existingPrereqCount = 0;
        edges.forEach(function(e) {
            if (e.to === targetNode.formId) {
                existingPrereqCount++;
            }
        });

        // How many more do we need?
        var prereqsNeeded = Math.max(0, targetPrereqCount - existingPrereqCount);
        if (prereqsNeeded <= 0) return;

        // Find and score all candidate prerequisites
        var candidates = [];
        positions.forEach(function(candidateNode) {
            if (candidateNode.formId === targetNode.formId) return; // Skip self
            if (candidateNode.tier >= targetNode.tier) return; // Must be lower tier

            // Skip if edge already exists
            var edgeKey = candidateNode.formId + '->' + targetNode.formId;
            if (existingEdges[edgeKey]) return;

            var score = calculatePrereqScore(candidateNode, targetNode, spellToGroup, treeGeneration);
            if (score > 0) {
                candidates.push({ node: candidateNode, score: score });
            }
        });

        // Sort by score (best first)
        candidates.sort(function(a, b) { return b.score - a.score; });

        // Add some randomness: don't always pick the absolute best
        // Shuffle top candidates slightly
        var topN = Math.min(candidates.length, prereqsNeeded * 3);
        for (var i = 0; i < topN - 1; i++) {
            if (rng() < 0.3) {
                // Swap with a nearby candidate
                var swapIdx = i + 1 + Math.floor(rng() * Math.min(3, topN - i - 1));
                if (swapIdx < topN) {
                    var temp = candidates[i];
                    candidates[i] = candidates[swapIdx];
                    candidates[swapIdx] = temp;
                }
            }
        }

        // Select prerequisites
        var selectedCount = 0;
        for (var i = 0; i < candidates.length && selectedCount < prereqsNeeded; i++) {
            var candidate = candidates[i];

            // Create prerequisite edge
            var edgeKey = candidate.node.formId + '->' + targetNode.formId;
            if (!existingEdges[edgeKey]) {
                edges.push({
                    from: candidate.node.formId,
                    to: targetNode.formId,
                    type: 'prerequisite'
                });
                existingEdges[edgeKey] = true;
                prereqsAdded++;
                selectedCount++;

                // Track prerequisites on the node
                if (!targetNode.prerequisites) targetNode.prerequisites = [];
                targetNode.prerequisites.push(candidate.node.formId);
            }
        }
    });

    return { count: prereqsAdded };
}

// =============================================================================
// UNIFIED PREREQUISITE SYSTEM (Hard/Soft Needs)
// =============================================================================

/**
 * Configuration for prerequisite requirements by tier
 * Higher tiers = more prerequisites, more chance of hard requirements
 */
var PREREQ_TIER_CONFIG = {
    // tier: { maxHard, maxSoft, softNeededBase, hardChance }
    0: { maxHard: 0, maxSoft: 0, softNeededBase: 0, hardChance: 0 },      // Root - no prereqs
    1: { maxHard: 1, maxSoft: 0, softNeededBase: 0, hardChance: 0.1 },    // Novice - simple chain
    2: { maxHard: 1, maxSoft: 1, softNeededBase: 1, hardChance: 0.2 },    // Apprentice
    3: { maxHard: 1, maxSoft: 2, softNeededBase: 1, hardChance: 0.3 },    // Adept
    4: { maxHard: 2, maxSoft: 2, softNeededBase: 1, hardChance: 0.5 },    // Expert
    5: { maxHard: 2, maxSoft: 3, softNeededBase: 2, hardChance: 0.6 },    // Master
};

/**
 * Assign hard/soft prerequisite requirements to all nodes.
 *
 * Rules:
 * - If node has only 1 incoming edge -> always HARD
 * - Higher tier = more likely to have hard requirements + higher softNeeded
 * - Total needed never exceeds available prereqs
 *
 * @param {Array} positions - All node positions with spell data
 * @param {Array} edges - All edges (primary + any added prereqs)
 * @param {Function} rng - Seeded random number generator
 * @returns {Object} - Stats about prereq assignment
 */
function assignPrerequisiteRequirements(positions, edges, rng) {
    var stats = { nodesProcessed: 0, hardAssigned: 0, softAssigned: 0, filteredOut: 0 };

    // Build position lookup by formId for tier/rank checking
    var positionByFormId = {};
    positions.forEach(function(p) {
        if (p.spell) positionByFormId[p.spell.formId] = p;
    });

    // Build incoming edges map: formId -> [incoming edge objects]
    var incomingEdges = {};
    positions.forEach(function(p) {
        if (p.spell) incomingEdges[p.spell.formId] = [];
    });

    edges.forEach(function(e) {
        if (incomingEdges[e.to]) {
            incomingEdges[e.to].push(e);
        }
    });

    // Process each node
    positions.forEach(function(node) {
        if (!node.spell || node.isRoot) return;

        var formId = node.spell.formId;
        var targetRank = getSpellRank(node.spell);
        var allIncoming = incomingEdges[formId] || [];

        // CRITICAL: Filter prerequisites - only allow same tier or weaker spells
        // A Novice spell can only have Novice prereqs, Apprentice can have Novice/Apprentice, etc.
        var incoming = allIncoming.filter(function(edge) {
            if (!edge || !edge.from) return false;
            var sourceNode = positionByFormId[edge.from];
            if (!sourceNode || !sourceNode.spell) return false;
            var sourceRank = getSpellRank(sourceNode.spell);
            // Source must be same rank or weaker (lower number = weaker)
            return sourceRank <= targetRank;
        });

        var filtered = allIncoming.length - incoming.length;
        if (filtered > 0) {
            stats.filteredOut += filtered;
        }

        if (incoming.length === 0) {
            // No valid prerequisites - root-level spell or all prereqs were stronger
            node.prereqRequirements = { hardPrereqs: [], softPrereqs: [], softNeeded: 0 };
            return;
        }

        stats.nodesProcessed++;

        // RULE: Single incoming edge = always HARD
        if (incoming.length === 1) {
            node.prereqRequirements = {
                hardPrereqs: [incoming[0].from],
                softPrereqs: [],
                softNeeded: 0
            };
            stats.hardAssigned++;
            return;
        }

        // Multiple incoming edges - decide hard vs soft
        var tier = Math.min(node.tier, 5);  // Cap at tier 5 config
        var config = PREREQ_TIER_CONFIG[tier] || PREREQ_TIER_CONFIG[5];

        var hardPrereqs = [];
        var softPrereqs = [];

        // Shuffle incoming edges for randomness
        var shuffled = incoming.slice();
        for (var i = shuffled.length - 1; i > 0; i--) {
            var j = Math.floor(rng() * (i + 1));
            var temp = shuffled[i];
            shuffled[i] = shuffled[j];
            shuffled[j] = temp;
        }

        // Assign hard prereqs first (based on hardChance and maxHard)
        var hardCount = 0;
        shuffled.forEach(function(edge) {
            // Skip undefined/malformed edges
            if (!edge || !edge.from) return;

            if (hardCount < config.maxHard && rng() < config.hardChance) {
                hardPrereqs.push(edge.from);
                hardCount++;
                stats.hardAssigned++;
            } else {
                softPrereqs.push(edge.from);
                stats.softAssigned++;
            }
        });

        // Calculate softNeeded - never more than available soft prereqs
        var softNeeded = Math.min(config.softNeededBase, softPrereqs.length);

        // Add some variance to softNeeded
        if (softPrereqs.length > 1 && rng() < 0.3) {
            softNeeded = Math.min(softNeeded + 1, softPrereqs.length);
        }

        // IMPORTANT: Total needed (hard + softNeeded) never exceeds total available
        var totalAvailable = hardPrereqs.length + softPrereqs.length;
        var totalNeeded = hardPrereqs.length + softNeeded;
        if (totalNeeded > totalAvailable) {
            softNeeded = Math.max(0, totalAvailable - hardPrereqs.length);
        }

        // CONSOLIDATION: If softNeeded equals softPrereqs.length, they're effectively ALL required
        // Convert them to hard prereqs for clarity
        if (softNeeded > 0 && softNeeded >= softPrereqs.length) {
            // All soft prereqs are effectively hard - merge them
            hardPrereqs = hardPrereqs.concat(softPrereqs);
            softPrereqs = [];
            softNeeded = 0;
            console.log('[PrereqSystem] Consolidated ' + node.spell.name + ': all prereqs now HARD (' + hardPrereqs.length + ')');
        }

        node.prereqRequirements = {
            hardPrereqs: hardPrereqs,
            softPrereqs: softPrereqs,
            softNeeded: softNeeded
        };
    });

    console.log('[PrereqSystem] Assigned requirements: ' + stats.nodesProcessed + ' nodes, ' +
                stats.hardAssigned + ' hard, ' + stats.softAssigned + ' soft' +
                (stats.filteredOut > 0 ? ', ' + stats.filteredOut + ' stronger prereqs filtered out' : ''));

    return stats;
}
