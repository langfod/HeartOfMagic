/**
 * Growth Behavior System
 *
 * Behavior engine that processes growth behavior profiles.
 * Calculates positions, branching, hubs, terminal clusters, and cross-connections.
 *
 * Depends on: growthBehaviorProfiles.js (GROWTH_BEHAVIORS, SCHOOL_DEFAULT_BEHAVIORS)
 */

// ============================================================
// BEHAVIOR ENGINE
// ============================================================

/**
 * Get the active behavior parameters at a given progress point
 * @param {GrowthBehavior} behavior - The base behavior profile
 * @param {number} progress - Current progress (0-1)
 * @returns {Object} - Merged parameters with phase overrides
 */
function getActiveParameters(behavior, progress) {
    // Start with base parameters
    var params = {};
    for (var key in behavior) {
        if (key !== 'phases' && key !== 'name' && key !== 'description') {
            params[key] = behavior[key];
        }
    }

    // Apply phase overrides
    if (behavior.phases && behavior.phases.length > 0) {
        // Find the active phase (last one where progress >= at)
        var activePhase = null;
        for (var i = 0; i < behavior.phases.length; i++) {
            if (progress >= behavior.phases[i].at) {
                activePhase = behavior.phases[i];
            }
        }

        // Merge phase changes
        if (activePhase && activePhase.changes) {
            for (var changeKey in activePhase.changes) {
                params[changeKey] = activePhase.changes[changeKey];
            }
        }
    }

    return params;
}

/**
 * Calculate the preferred position for a new node based on behavior
 * @param {Object} parent - Parent node
 * @param {Object} params - Active behavior parameters
 * @param {number} tierNodesPlaced - How many nodes in current tier
 * @param {number} tierCapacity - Estimated capacity of current tier
 * @param {Object} sliceInfo - Sector angle info
 * @param {Function} rng - Random number generator
 * @returns {Object} - Preferred {angle, radiusStep} with ADDITIVE radius step
 */
function calculatePreferredDirection(parent, params, tierNodesPlaced, tierCapacity, sliceInfo, rng) {
    var baseAngle = parent.angle;
    var nodeSize = 75; // Standard node size

    // Vertical bias affects whether we go up (further out) or stay in current tier
    var tierFillRatio = tierCapacity > 0 ? tierNodesPlaced / tierCapacity : 0;
    var shouldAdvanceTier = tierFillRatio >= params.layerFillThreshold || params.verticalBias > 0.5;

    // Use ADDITIVE radius step (not multiplicative) to prevent explosion
    var radiusStep;
    if (shouldAdvanceTier) {
        // Advance outward - step size based on vertical bias
        // verticalBias -1 to +1 maps to 0.6 to 1.2 node sizes
        radiusStep = nodeSize * (0.8 + params.verticalBias * 0.4);
    } else {
        // Stay roughly same distance, tiny variation
        radiusStep = nodeSize * (0.1 + rng() * 0.25);
    }

    // Angular wander
    var wander = (rng() - 0.5) * 2 * params.angularWander;

    // Wave effect
    if (params.waveAmplitude > 0) {
        var wavePhase = (parent.tier || 0) * params.waveFrequency;
        wander += Math.sin(wavePhase) * params.waveAmplitude;
    }

    // Spread factor affects how far from parent's angle we can go
    var spreadRange = sliceInfo.sectorAngle * 0.4 * params.spreadFactor;
    wander = Math.max(-spreadRange, Math.min(spreadRange, wander));

    var newAngle = baseAngle + wander;

    // Clamp to sector
    newAngle = Math.max(sliceInfo.startAngle + 3, Math.min(sliceInfo.endAngle - 3, newAngle));

    return {
        angle: newAngle,
        radiusStep: radiusStep  // ADDITIVE step, not multiplier
    };
}

/**
 * Determine how many children a node should have based on behavior
 * @param {Object} node - The node
 * @param {Object} params - Active behavior parameters
 * @param {Function} rng - Random number generator
 * @returns {number} - Number of children
 */
function calculateBranchCount(node, params, rng) {
    if (node.isHub) {
        return params.hubBranchCount;
    }

    var base = params.branchingFactor;
    var variance = params.branchingVariance;

    // Add randomness
    var result = base + (rng() - 0.5) * 2 * base * variance;

    // Branch style affects count
    switch (params.branchStyle) {
        case 'linear':
            result = Math.min(result, 1.5);
            break;
        case 'binary':
            result = Math.round(result / 2) * 2; // Even numbers
            result = Math.max(2, Math.min(4, result));
            break;
        case 'clustered':
            // Clustered creates groups, so varies more
            result = rng() < 0.3 ? 1 : Math.ceil(result);
            break;
        case 'radial':
            // Radial tends to have more
            result = Math.ceil(result * 1.2);
            break;
    }

    return Math.max(1, Math.round(result));
}

/**
 * Determine if a node should become a hub
 * @param {Object} node - The node
 * @param {Object} params - Active behavior parameters
 * @param {number} nodesSinceLastHub - Nodes placed since last hub
 * @param {Function} rng - Random number generator
 * @returns {boolean}
 */
function shouldBeHub(node, params, nodesSinceLastHub, rng) {
    if (node.tier < 2) return false; // No hubs too close to root
    if (nodesSinceLastHub < params.hubMinSpacing) return false;

    return rng() < params.hubProbability;
}

/**
 * Determine if this node should create a new branch (fork in the tree).
 * Uses energy accumulation - energy builds when NOT branching, forcing eventual branch.
 *
 * @param {Object} params - Active behavior parameters
 * @param {number} currentEnergy - Current accumulated branch energy
 * @param {Function} rng - Random number generator
 * @returns {Object} - { shouldBranch: boolean, newEnergy: number, branchCount: number }
 */
function shouldBranch(params, currentEnergy, rng) {
    var branchChance = params.branchChance || 0.25;
    var energyGain = params.branchEnergyGain || 0.12;
    var energyThreshold = params.branchEnergyThreshold || 1.5;

    // Add energy bonus to chance
    var effectiveChance = branchChance + (currentEnergy * 0.3);

    // Force branch if energy threshold reached
    var forceBranch = currentEnergy >= energyThreshold;
    var shouldBranch = forceBranch || (rng() < effectiveChance);

    if (shouldBranch) {
        // Calculate how many branches based on branchingFactor
        var baseBranches = params.branchingFactor || 2;
        var variance = params.branchingVariance || 0.3;
        var branchCount = Math.max(2, Math.round(baseBranches + (rng() - 0.5) * baseBranches * variance));

        // Adjust based on branch style
        if (params.branchStyle === 'linear') branchCount = Math.min(2, branchCount);
        if (params.branchStyle === 'binary') branchCount = 2;

        return {
            shouldBranch: true,
            newEnergy: 0, // Reset energy after branching
            branchCount: branchCount,
            forced: forceBranch
        };
    }

    // No branch - accumulate energy
    return {
        shouldBranch: false,
        newEnergy: currentEnergy + energyGain,
        branchCount: 0,
        forced: false
    };
}

/**
 * Subdivide a spell pool into fuzzy sub-groups for branch assignment.
 * Each branch gets spells that are thematically similar.
 *
 * @param {Array} spellPool - Pool of spells to subdivide
 * @param {number} branchCount - Number of branches to create
 * @param {Function} rng - Random number generator
 * @returns {Array<Array>} - Array of spell arrays, one per branch
 */
function subdivideSpellPool(spellPool, branchCount, rng) {
    if (spellPool.length === 0) return [];
    if (branchCount <= 1) return [spellPool];

    // Simple keyword-based grouping
    var keywords = {};
    var spellKeywords = [];

    // Extract keywords from spell names
    spellPool.forEach(function(spell, idx) {
        var name = (spell.name || '').toLowerCase();
        var words = name.split(/[\s\-_]+/).filter(function(w) { return w.length > 2; });
        spellKeywords[idx] = words;

        words.forEach(function(word) {
            if (!keywords[word]) keywords[word] = [];
            keywords[word].push(idx);
        });
    });

    // Find most distinctive keywords (appear in some but not all spells)
    var keywordScores = [];
    var totalSpells = spellPool.length;
    Object.keys(keywords).forEach(function(word) {
        var count = keywords[word].length;
        // Score: high when keyword appears in moderate % of spells
        var ratio = count / totalSpells;
        var score = ratio * (1 - ratio) * 4; // Max at 50%
        if (score > 0.1) {
            keywordScores.push({ word: word, score: score, indices: keywords[word] });
        }
    });

    keywordScores.sort(function(a, b) { return b.score - a.score; });

    // Use top keywords to create initial groups
    var branches = [];
    for (var b = 0; b < branchCount; b++) {
        branches.push([]);
    }

    var assigned = {};

    // Assign spells based on keyword matching
    keywordScores.slice(0, branchCount * 2).forEach(function(kw, kwIdx) {
        var targetBranch = kwIdx % branchCount;
        kw.indices.forEach(function(spellIdx) {
            if (!assigned[spellIdx]) {
                assigned[spellIdx] = true;
                branches[targetBranch].push(spellPool[spellIdx]);
            }
        });
    });

    // Distribute unassigned spells randomly
    spellPool.forEach(function(spell, idx) {
        if (!assigned[idx]) {
            var targetBranch = Math.floor(rng() * branchCount);
            branches[targetBranch].push(spell);
        }
    });

    // Ensure no empty branches - redistribute if needed
    var nonEmpty = branches.filter(function(b) { return b.length > 0; });
    if (nonEmpty.length < branchCount && nonEmpty.length > 0) {
        // Some branches are empty, redistribute
        var allSpells = [];
        branches.forEach(function(b) { allSpells = allSpells.concat(b); });

        var perBranch = Math.ceil(allSpells.length / branchCount);
        branches = [];
        for (var i = 0; i < branchCount; i++) {
            branches.push(allSpells.slice(i * perBranch, (i + 1) * perBranch));
        }
    }

    return branches.filter(function(b) { return b.length > 0; });
}

/**
 * Determine if we should create a terminal cluster
 * @param {Object} node - The node
 * @param {Object} params - Active behavior parameters
 * @param {number} remainingSpells - How many spells left to place
 * @param {Function} rng - Random number generator
 * @returns {Object|null} - Cluster info or null
 */
function shouldCreateTerminalCluster(node, params, remainingSpells, rng) {
    if (!params.createTerminalClusters) return null;
    if (remainingSpells < params.terminalClusterSize) return null;
    if (rng() > params.terminalClusterChance) return null;

    var size = Math.min(params.terminalClusterSize, remainingSpells);

    return {
        size: size,
        pattern: 'circular' // Could be 'linear', 'arc', 'circular'
    };
}

/**
 * Get cross-connection candidates based on behavior
 * @param {Array} nodes - All placed nodes
 * @param {Object} params - Active behavior parameters
 * @param {Function} rng - Random number generator
 * @returns {Array} - Array of {from, to} pairs
 */
function getCrossConnections(nodes, params, rng) {
    var connections = [];
    if (params.crossConnectionDensity <= 0) return connections;

    var maxConnections = Math.floor(nodes.length * params.crossConnectionDensity);
    var nodeSize = 75; // Could be passed in
    var maxDist = nodeSize * params.crossConnectionMaxDist;

    // For web pattern, create concentric ring connections
    if (params.webPattern) {
        // Group nodes by tier
        var byTier = {};
        nodes.forEach(function(n) {
            var t = n.tier || 0;
            if (!byTier[t]) byTier[t] = [];
            byTier[t].push(n);
        });

        // Connect adjacent nodes within same tier
        for (var tier in byTier) {
            var tierNodes = byTier[tier];
            tierNodes.sort(function(a, b) { return a.angle - b.angle; });

            for (var i = 0; i < tierNodes.length - 1 && connections.length < maxConnections; i++) {
                var dist = Math.sqrt(
                    Math.pow(tierNodes[i].x - tierNodes[i+1].x, 2) +
                    Math.pow(tierNodes[i].y - tierNodes[i+1].y, 2)
                );
                if (dist < maxDist * 1.5) {
                    connections.push({ from: tierNodes[i], to: tierNodes[i+1], type: 'web' });
                }
            }
        }
    } else {
        // Random cross-connections between nearby nodes
        for (var i = 0; i < nodes.length && connections.length < maxConnections; i++) {
            for (var j = i + 2; j < nodes.length && connections.length < maxConnections; j++) {
                var dx = nodes[i].x - nodes[j].x;
                var dy = nodes[i].y - nodes[j].y;
                var dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < maxDist && rng() < params.crossConnectionDensity * 0.5) {
                    // Skip if already connected through tree
                    connections.push({ from: nodes[i], to: nodes[j], type: 'cross' });
                }
            }
        }
    }

    return connections;
}

// ============================================================
// EXPORTS
// ============================================================

if (typeof window !== 'undefined') {
    window.GROWTH_BEHAVIORS = GROWTH_BEHAVIORS;
    window.SCHOOL_DEFAULT_BEHAVIORS = SCHOOL_DEFAULT_BEHAVIORS;
    window.getActiveParameters = getActiveParameters;
    window.calculatePreferredDirection = calculatePreferredDirection;
    window.calculateBranchCount = calculateBranchCount;
    window.shouldBeHub = shouldBeHub;
    window.shouldBranch = shouldBranch;
    window.subdivideSpellPool = subdivideSpellPool;
    window.shouldCreateTerminalCluster = shouldCreateTerminalCluster;
    window.getCrossConnections = getCrossConnections;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        GROWTH_BEHAVIORS: GROWTH_BEHAVIORS,
        SCHOOL_DEFAULT_BEHAVIORS: SCHOOL_DEFAULT_BEHAVIORS,
        getActiveParameters: getActiveParameters,
        calculatePreferredDirection: calculatePreferredDirection,
        calculateBranchCount: calculateBranchCount,
        shouldBeHub: shouldBeHub,
        shouldBranch: shouldBranch,
        subdivideSpellPool: subdivideSpellPool,
        shouldCreateTerminalCluster: shouldCreateTerminalCluster,
        getCrossConnections: getCrossConnections
    };
}
