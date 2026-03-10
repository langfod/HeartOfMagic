/**
 * Visual-First Alternate Paths System
 *
 * Shortcut connections between nearby same-tier nodes with long existing paths.
 * Depends on: vfHelpers.js, vfThematic.js, layoutGenerator.js (GRID_CONFIG)
 */

// =============================================================================
// ALTERNATE PATHS SYSTEM
// =============================================================================

/**
 * Default configuration for alternate path generation
 * These can be overridden via school config or LLM
 */
var DEFAULT_ALTERNATE_PATH_CONFIG = {
    // Minimum path distance (in edges) to warrant an alternate path
    minPathDistance: 4,

    // Maximum spatial distance for alternate path candidates (in node sizes)
    maxSpatialDistance: 4,

    // Base probability of creating an alternate path
    baseProbability: 0.3,

    // Fuzzy match bonus - how much same-group increases probability
    fuzzyBonus: 0.2,

    // Maximum alternate paths per node
    maxAlternatesPerNode: 2,

    // Tier tolerance - only connect nodes within this tier difference
    tierTolerance: 1
};

// Expose for UI access
window.DEFAULT_ALTERNATE_PATH_CONFIG = DEFAULT_ALTERNATE_PATH_CONFIG;

/**
 * Calculate shortest path distance between two nodes using BFS
 * Returns -1 if no path exists
 *
 * @param {string} fromId - Source node formId
 * @param {string} toId - Target node formId
 * @param {Object} adjacencyList - Node adjacency list
 * @param {number} maxDepth - Maximum search depth
 * @returns {number} - Path length or -1 if not found
 */
function calculatePathDistance(fromId, toId, adjacencyList, maxDepth) {
    if (fromId === toId) return 0;

    var visited = {};
    var queue = [{ id: fromId, depth: 0 }];
    visited[fromId] = true;

    while (queue.length > 0) {
        var current = queue.shift();

        if (current.depth >= maxDepth) continue;

        var neighbors = adjacencyList[current.id] || [];
        for (var i = 0; i < neighbors.length; i++) {
            var neighborId = neighbors[i];

            if (neighborId === toId) {
                return current.depth + 1;
            }

            if (!visited[neighborId]) {
                visited[neighborId] = true;
                queue.push({ id: neighborId, depth: current.depth + 1 });
            }
        }
    }

    return -1; // No path found within maxDepth
}

/**
 * Build adjacency list from edges (bidirectional)
 *
 * @param {Array} edges - Array of edge objects
 * @returns {Object} - Adjacency list { formId: [neighbor formIds] }
 */
function buildAdjacencyList(edges) {
    var adj = {};

    edges.forEach(function(e) {
        var from = e.from;
        var to = e.to;

        // Handle edge objects that might have node references
        if (typeof from === 'object' && from.formId) from = from.formId;
        if (typeof to === 'object' && to.formId) to = to.formId;

        if (!adj[from]) adj[from] = [];
        if (!adj[to]) adj[to] = [];

        // Bidirectional for pathfinding
        if (adj[from].indexOf(to) === -1) adj[from].push(to);
        if (adj[to].indexOf(from) === -1) adj[to].push(from);
    });

    return adj;
}

/**
 * Calculate alternate path score between two nodes
 * Higher score = better candidate for alternate path
 *
 * @param {Object} nodeA - First node
 * @param {Object} nodeB - Second node
 * @param {number} pathDistance - Current path distance between them
 * @param {Object} spellToGroup - Spell to fuzzy group mapping
 * @param {Object} treeGeneration - Tree generation settings (for element isolation)
 * @returns {number} - Score (higher = better)
 */
function calculateAlternatePathScore(nodeA, nodeB, pathDistance, spellToGroup, treeGeneration) {
    var score = 0;
    var nodeSize = GRID_CONFIG.nodeSize;
    var treeGen = treeGeneration || {};

    // 0. ELEMENT ISOLATION CHECK (highest priority)
    if (nodeA.spell && nodeB.spell) {
        var thematicSim = calculateThematicSimilarity(nodeA.spell, nodeB.spell);
        var hasElementConflict = thematicSim <= 0.1;

        if (hasElementConflict) {
            if (treeGen.elementIsolationStrict) {
                return -10000;  // Forbidden
            } else if (treeGen.elementIsolation) {
                score -= 300;   // Heavy penalty
            }
        } else if (thematicSim >= 0.8) {
            score += 50;  // Same element bonus
        }
    }

    // 1. PATH DISTANCE FACTOR: Longer paths benefit more from alternates
    if (pathDistance >= 6) score += 40;
    else if (pathDistance >= 5) score += 30;
    else if (pathDistance >= 4) score += 20;
    else if (pathDistance >= 3) score += 10;
    else return -100; // Too short, don't create alternate

    // 2. SPATIAL PROXIMITY: Nodes should be spatially close
    var dx = nodeA.x - nodeB.x;
    var dy = nodeA.y - nodeB.y;
    var spatialDist = Math.sqrt(dx * dx + dy * dy);

    if (spatialDist < nodeSize * 2) score += 35;
    else if (spatialDist < nodeSize * 3) score += 25;
    else if (spatialDist < nodeSize * 4) score += 15;
    else return -100; // Too far spatially

    // 3. FUZZY GROUP: Same theme = more logical alternate path
    var groupA = spellToGroup[nodeA.formId];
    var groupB = spellToGroup[nodeB.formId];

    if (groupA && groupB && groupA.theme === groupB.theme) {
        score += 30; // Same theme - thematic connection
    } else if (groupA && groupB) {
        score += 5; // Different themes - cross-knowledge
    }

    // 4. TIER SIMILARITY: Prefer same tier
    var tierDiff = Math.abs(nodeA.tier - nodeB.tier);
    if (tierDiff === 0) score += 20;
    else if (tierDiff === 1) score += 10;
    else return -100; // Too different in tier

    // 5. HUB PENALTY: Hubs already have many connections
    if (nodeA.isHub) score -= 10;
    if (nodeB.isHub) score -= 10;

    return score;
}

/**
 * Add alternate path connections between nearby same-tier nodes
 * Only when existing path is long, provides shortcuts for navigation
 *
 * @param {Array} positions - All node positions
 * @param {Array} edges - Existing edges (will be modified)
 * @param {Object} spellToGroup - Spell to fuzzy group mapping
 * @param {Function} rng - Random number generator
 * @param {Object} configOverrides - Optional config overrides from school/LLM
 * @returns {Object} - { count: number of alternate paths added }
 */
function addAlternatePaths(positions, edges, spellToGroup, rng, configOverrides) {
    var alternatesAdded = 0;
    var nodeSize = 75;

    // Merge default config with overrides
    var config = {};
    Object.keys(DEFAULT_ALTERNATE_PATH_CONFIG).forEach(function(key) {
        config[key] = DEFAULT_ALTERNATE_PATH_CONFIG[key];
    });
    if (configOverrides) {
        Object.keys(configOverrides).forEach(function(key) {
            if (configOverrides[key] !== undefined && configOverrides[key] !== null) {
                config[key] = configOverrides[key];
            }
        });
    }

    console.log('[AlternatePaths] Config:', JSON.stringify(config));

    // Build adjacency list for pathfinding
    var adjacencyList = buildAdjacencyList(edges);

    // Build existing edge set to avoid duplicates
    var existingEdges = {};
    edges.forEach(function(e) {
        var from = typeof e.from === 'object' ? e.from.formId : e.from;
        var to = typeof e.to === 'object' ? e.to.formId : e.to;
        existingEdges[from + '->' + to] = true;
        existingEdges[to + '->' + from] = true;
    });

    // Track alternates per node to limit
    var alternatesCount = {};

    // Group nodes by tier for efficient same-tier lookup
    var nodesByTier = {};
    positions.forEach(function(node) {
        var tier = node.tier || 0;
        if (!nodesByTier[tier]) nodesByTier[tier] = [];
        nodesByTier[tier].push(node);
    });

    // Process each tier
    for (var tier in nodesByTier) {
        var tierNodes = nodesByTier[tier];
        if (tierNodes.length < 2) continue;

        // Also include adjacent tiers for tier tolerance
        var nearbyNodes = tierNodes.slice();
        var tierNum = parseInt(tier);

        if (config.tierTolerance >= 1 && nodesByTier[tierNum - 1]) {
            nearbyNodes = nearbyNodes.concat(nodesByTier[tierNum - 1]);
        }
        if (config.tierTolerance >= 1 && nodesByTier[tierNum + 1]) {
            nearbyNodes = nearbyNodes.concat(nodesByTier[tierNum + 1]);
        }

        // Check each pair of nodes in this tier
        for (var i = 0; i < tierNodes.length; i++) {
            var nodeA = tierNodes[i];

            // Skip if already has max alternates
            if ((alternatesCount[nodeA.formId] || 0) >= config.maxAlternatesPerNode) continue;

            // Find candidates
            var candidates = [];

            for (var j = 0; j < nearbyNodes.length; j++) {
                var nodeB = nearbyNodes[j];
                if (nodeA.formId === nodeB.formId) continue;

                // Skip if edge already exists
                var edgeKey = nodeA.formId + '->' + nodeB.formId;
                if (existingEdges[edgeKey]) continue;

                // Skip if nodeB has max alternates
                if ((alternatesCount[nodeB.formId] || 0) >= config.maxAlternatesPerNode) continue;

                // Check spatial distance first (fast filter)
                var dx = nodeA.x - nodeB.x;
                var dy = nodeA.y - nodeB.y;
                var spatialDist = Math.sqrt(dx * dx + dy * dy);

                if (spatialDist > nodeSize * config.maxSpatialDistance) continue;

                // Calculate path distance (slower, so filter first)
                var pathDist = calculatePathDistance(
                    nodeA.formId,
                    nodeB.formId,
                    adjacencyList,
                    config.minPathDistance + 3 // Search a bit beyond minimum
                );

                // Only consider if path is long enough (or no path exists)
                if (pathDist >= 0 && pathDist < config.minPathDistance) continue;

                // If no path found, use a default high value
                if (pathDist < 0) pathDist = 10;

                // Calculate score
                var score = calculateAlternatePathScore(nodeA, nodeB, pathDist, spellToGroup);

                if (score > 0) {
                    candidates.push({ node: nodeB, score: score, pathDist: pathDist });
                }
            }

            // Sort by score and select
            candidates.sort(function(a, b) { return b.score - a.score; });

            // Apply probability and randomness
            for (var k = 0; k < candidates.length && (alternatesCount[nodeA.formId] || 0) < config.maxAlternatesPerNode; k++) {
                var candidate = candidates[k];

                // Calculate probability based on score and fuzzy bonus
                var groupA = spellToGroup[nodeA.formId];
                var groupB = spellToGroup[candidate.node.formId];
                var isSameGroup = groupA && groupB && groupA.theme === groupB.theme;

                var probability = config.baseProbability + (isSameGroup ? config.fuzzyBonus : 0);

                // Higher scores get higher probability
                probability += (candidate.score / 200);
                probability = Math.min(0.8, probability); // Cap at 80%

                if (rng() < probability) {
                    // Create alternate path edge
                    var edgeKey = nodeA.formId + '->' + candidate.node.formId;

                    edges.push({
                        from: nodeA.formId,
                        to: candidate.node.formId,
                        type: 'alternate',
                        pathDistance: candidate.pathDist
                    });

                    existingEdges[edgeKey] = true;
                    existingEdges[candidate.node.formId + '->' + nodeA.formId] = true;

                    // Update adjacency for future pathfinding
                    if (!adjacencyList[nodeA.formId]) adjacencyList[nodeA.formId] = [];
                    if (!adjacencyList[candidate.node.formId]) adjacencyList[candidate.node.formId] = [];
                    adjacencyList[nodeA.formId].push(candidate.node.formId);
                    adjacencyList[candidate.node.formId].push(nodeA.formId);

                    // Track counts
                    alternatesCount[nodeA.formId] = (alternatesCount[nodeA.formId] || 0) + 1;
                    alternatesCount[candidate.node.formId] = (alternatesCount[candidate.node.formId] || 0) + 1;

                    // Store alternate paths on nodes
                    if (!nodeA.alternatePaths) nodeA.alternatePaths = [];
                    nodeA.alternatePaths.push(candidate.node.formId);

                    if (!candidate.node.alternatePaths) candidate.node.alternatePaths = [];
                    candidate.node.alternatePaths.push(nodeA.formId);

                    alternatesAdded++;
                }
            }
        }
    }

    return { count: alternatesAdded };
}
