/**
 * Procedural Tree Layout - Grid-based position assignment for procedural trees.
 *
 * Loaded after: proceduralTreeCore.js
 *
 * Depends on:
 * - modules/proceduralTreeCore.js (buildProceduralTrees, etc.)
 * - modules/config.js (GRID_CONFIG)
 */

// =============================================================================
// GRID-BASED POSITION ASSIGNMENT (Similar to Fuzzy Builder)
// =============================================================================

/**
 * Assigns grid-based positions to all nodes in the tree data.
 * Uses the same grid system as the fuzzy builder for consistent spacing.
 *
 * @param {Object} treeData - Tree data from buildProceduralTrees
 * @returns {Object} - Tree data with positions assigned
 */
function assignGridPositions(treeData) {
    console.log('[SimpleGrid] Assigning grid positions to tree...');

    // Get grid configuration (same as fuzzy builder)
    var gridCfg = typeof GRID_CONFIG !== 'undefined' ? GRID_CONFIG.getComputedConfig() : {
        baseRadius: 80,
        tierSpacing: 60,
        nodeSize: 18,
        minNodeSpacing: 25
    };

    var schoolNames = Object.keys(treeData.schools);
    var schoolCount = schoolNames.length;
    if (schoolCount === 0) return treeData;

    // Calculate equal pie slices for each school
    var anglePerSchool = 360 / schoolCount;

    schoolNames.forEach(function(schoolName, schoolIndex) {
        var school = treeData.schools[schoolName];
        if (!school || !school.nodes || school.nodes.length === 0) return;

        // Calculate this school's angular sector
        var startAngle = schoolIndex * anglePerSchool;
        var centerAngle = startAngle + anglePerSchool / 2;
        var halfSector = anglePerSchool / 2 * 0.9; // Use 90% of sector to avoid edge overlap

        var sliceInfo = {
            startAngle: startAngle,
            endAngle: startAngle + anglePerSchool,
            centerAngle: centerAngle,
            halfSector: halfSector
        };

        // Store slice info for renderer
        school.sliceInfo = sliceInfo;

        // Build node lookup and organize by tier
        var nodeById = {};
        var nodesByTier = {};
        var maxTier = 0;

        school.nodes.forEach(function(node) {
            nodeById[node.formId] = node;
            var tier = node.tier || 0;
            if (!nodesByTier[tier]) nodesByTier[tier] = [];
            nodesByTier[tier].push(node);
            if (tier > maxTier) maxTier = tier;
        });

        // Seeded random for consistent positioning
        var seed = 0;
        for (var i = 0; i < schoolName.length; i++) {
            seed = ((seed << 5) - seed) + schoolName.charCodeAt(i);
            seed |= 0;
        }
        var rng = function() {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };

        // Track placed positions to avoid overlap
        var placedPositions = [];
        var placementGrid = new PlacementGrid(gridCfg.minNodeSpacing);

        // Place nodes tier by tier
        for (var tier = 0; tier <= maxTier; tier++) {
            var tierNodes = nodesByTier[tier] || [];
            if (tierNodes.length === 0) continue;

            var radius = gridCfg.baseRadius + tier * gridCfg.tierSpacing;

            // Calculate angular positions for this tier
            var nodesInTier = tierNodes.length;
            var availableAngle = halfSector * 2;
            var angleStep = nodesInTier > 1 ? availableAngle / (nodesInTier - 1) : 0;
            var baseAngle = centerAngle - (nodesInTier > 1 ? halfSector : 0);

            // Sort nodes to spread them nicely (by theme or formId for consistency)
            tierNodes.sort(function(a, b) {
                var themeA = a.theme || '';
                var themeB = b.theme || '';
                if (themeA !== themeB) return themeA.localeCompare(themeB);
                return (a.formId || '').localeCompare(b.formId || '');
            });

            tierNodes.forEach(function(node, idx) {
                var angle = baseAngle + idx * angleStep;

                // Add small jitter for visual variety (but less than fuzzy builder)
                var angleJitter = (rng() - 0.5) * 3; // ±1.5 degrees
                var radiusJitter = (rng() - 0.5) * gridCfg.tierSpacing * 0.15;

                angle += angleJitter;
                var nodeRadius = radius + radiusJitter;

                // Clamp to sector boundaries
                angle = Math.max(centerAngle - halfSector * 0.95,
                         Math.min(centerAngle + halfSector * 0.95, angle));

                // Convert to cartesian
                var rad = angle * Math.PI / 180;
                var x = Math.cos(rad) * nodeRadius;
                var y = Math.sin(rad) * nodeRadius;

                // Check for overlap and nudge if needed
                var minSpacing = gridCfg.minNodeSpacing;
                var attempts = 0;
                while (attempts < 10 && hasOverlap(x, y, placedPositions, minSpacing, placementGrid)) {
                    // Nudge outward slightly
                    nodeRadius += minSpacing * 0.5;
                    x = Math.cos(rad) * nodeRadius;
                    y = Math.sin(rad) * nodeRadius;
                    attempts++;
                }

                // Assign position
                node.x = x;
                node.y = y;
                node.angle = angle;
                node.radius = nodeRadius;
                node._fromVisualFirst = true; // Mark as pre-positioned

                // Mark root node
                if (tier === 0) {
                    node.isRoot = true;
                }

                placedPositions.push({ x: x, y: y });
                placementGrid.add(x, y);
            });
        }

        console.log('[SimpleGrid] ' + schoolName + ': ' + school.nodes.length + ' nodes positioned');

        // Build edges array for prerequisite/alternate path processing
        var edges = [];
        school.nodes.forEach(function(node) {
            (node.prerequisites || []).forEach(function(prereqId) {
                // Skip undefined/null prerequisites
                if (prereqId && node.formId) {
                    edges.push({ from: prereqId, to: node.formId });
                }
            });
        });

        // Assign hard/soft prerequisites
        assignSimplePrerequisites(school.nodes, nodeById, edges, rng);

        // Add alternate paths between nearby same-tier nodes
        addSimpleAlternatePaths(school.nodes, nodeById, nodesByTier, edges, rng, gridCfg);

        // Update node children/prerequisites arrays from edges
        updateNodeConnections(school.nodes, nodeById, edges);
    });

    return treeData;
}

/**
 * Assign hard/soft prerequisites to nodes (simplified version)
 */
function assignSimplePrerequisites(nodes, nodeById, edges, rng) {
    // Tier configs: higher tier = more likely to have complex prereqs
    var TIER_CONFIG = {
        0: { hardChance: 1.0, maxHard: 1, softNeededBase: 0 },  // Novice: simple
        1: { hardChance: 0.8, maxHard: 1, softNeededBase: 1 },  // Apprentice
        2: { hardChance: 0.6, maxHard: 2, softNeededBase: 1 },  // Adept
        3: { hardChance: 0.5, maxHard: 2, softNeededBase: 2 },  // Expert
        4: { hardChance: 0.4, maxHard: 3, softNeededBase: 2 }   // Master
    };

    // Build incoming edges map
    var incomingEdges = {};
    nodes.forEach(function(n) { incomingEdges[n.formId] = []; });
    edges.forEach(function(e) {
        // Skip malformed edges
        if (e && e.from && e.to && incomingEdges[e.to]) {
            incomingEdges[e.to].push(e);
        }
    });

    nodes.forEach(function(node) {
        if (node.isRoot) {
            node.hardPrereqs = [];
            node.softPrereqs = [];
            node.softNeeded = 0;
            return;
        }

        var incoming = incomingEdges[node.formId] || [];
        if (incoming.length === 0) {
            node.hardPrereqs = [];
            node.softPrereqs = [];
            node.softNeeded = 0;
            return;
        }

        // Single incoming = always hard
        if (incoming.length === 1) {
            node.hardPrereqs = [incoming[0].from];
            node.softPrereqs = [];
            node.softNeeded = 0;
            return;
        }

        var tier = Math.min(node.tier || 0, 4);
        var config = TIER_CONFIG[tier];

        var hardPrereqs = [];
        var softPrereqs = [];

        // Shuffle and assign
        var shuffled = incoming.slice();
        for (var i = shuffled.length - 1; i > 0; i--) {
            var j = Math.floor(rng() * (i + 1));
            var temp = shuffled[i];
            shuffled[i] = shuffled[j];
            shuffled[j] = temp;
        }

        var hardCount = 0;
        shuffled.forEach(function(edge) {
            // Skip undefined/malformed edges
            if (!edge || !edge.from) return;

            if (hardCount < config.maxHard && rng() < config.hardChance) {
                hardPrereqs.push(edge.from);
                hardCount++;
            } else {
                softPrereqs.push(edge.from);
            }
        });

        var softNeeded = Math.min(config.softNeededBase, softPrereqs.length);

        // If all soft needed equals all available, consolidate to hard
        if (softNeeded > 0 && softNeeded >= softPrereqs.length) {
            hardPrereqs = hardPrereqs.concat(softPrereqs);
            softPrereqs = [];
            softNeeded = 0;
        }

        node.hardPrereqs = hardPrereqs;
        node.softPrereqs = softPrereqs;
        node.softNeeded = softNeeded;
    });
}

/**
 * Add alternate paths between nearby same-tier nodes (simplified version)
 */
function addSimpleAlternatePaths(nodes, nodeById, nodesByTier, edges, rng, gridCfg) {
    var altPathConfig = {
        minPathDistance: 3,
        maxSpatialDistance: gridCfg.tierSpacing * 2,
        baseProbability: 0.25,
        maxAlternatesPerNode: 2
    };
    var maxDistSq = altPathConfig.maxSpatialDistance * altPathConfig.maxSpatialDistance;

    var addedCount = 0;
    var edgeSet = {};
    edges.forEach(function(e) {
        if (e && e.from && e.to) {
            edgeSet[e.from + '->' + e.to] = true;
        }
    });

    // For each tier, look for potential alternate connections
    for (var tier in nodesByTier) {
        var tierNodes = nodesByTier[tier];
        if (tierNodes.length < 2) continue;

        tierNodes.forEach(function(nodeA) {
            var altCount = 0;

            tierNodes.forEach(function(nodeB) {
                if (nodeA.formId === nodeB.formId) return;
                if (altCount >= altPathConfig.maxAlternatesPerNode) return;

                // Check if already connected
                var keyAB = nodeA.formId + '->' + nodeB.formId;
                var keyBA = nodeB.formId + '->' + nodeA.formId;
                if (edgeSet[keyAB] || edgeSet[keyBA]) return;

                // Check spatial distance (squared to avoid Math.sqrt)
                var dx = nodeA.x - nodeB.x;
                var dy = nodeA.y - nodeB.y;
                if (dx * dx + dy * dy > maxDistSq) return;

                // Random chance
                if (rng() > altPathConfig.baseProbability) return;

                // Add alternate path (from lower tier parent to higher, or random direction for same tier)
                var fromNode = (nodeA.tier || 0) < (nodeB.tier || 0) ? nodeA :
                              ((nodeA.tier || 0) > (nodeB.tier || 0) ? nodeB :
                              (rng() > 0.5 ? nodeA : nodeB));
                var toNode = fromNode === nodeA ? nodeB : nodeA;

                edges.push({ from: fromNode.formId, to: toNode.formId, isAlternate: true });
                edgeSet[fromNode.formId + '->' + toNode.formId] = true;
                addedCount++;
                altCount++;
            });
        });
    }

    console.log('[SimpleGrid] Added ' + addedCount + ' alternate paths');
}

/**
 * Update node children/prerequisites arrays from edges
 */
function updateNodeConnections(nodes, nodeById, edges) {
    // Clear and rebuild
    nodes.forEach(function(n) {
        n.children = [];
        n.prerequisites = [];
    });

    // Use object-sets for O(1) dedup instead of indexOf
    var childSets = {};
    var prereqSets = {};
    nodes.forEach(function(n) {
        childSets[n.formId] = {};
        prereqSets[n.formId] = {};
    });

    edges.forEach(function(e) {
        var fromNode = nodeById[e.from];
        var toNode = nodeById[e.to];

        if (fromNode && toNode) {
            if (!childSets[e.from][e.to]) {
                childSets[e.from][e.to] = true;
                fromNode.children.push(e.to);
            }
            if (!prereqSets[e.to][e.from]) {
                prereqSets[e.to][e.from] = true;
                toNode.prerequisites.push(e.from);
            }
        }
    });
}

/**
 * Check if a position overlaps with any placed positions.
 * Uses squared distance to avoid Math.sqrt.
 * When a PlacementGrid is provided, queries 3x3 cell neighborhood (O(1) amortized).
 * Falls back to linear scan when grid is null (for backward compat).
 */
function hasOverlap(x, y, placedPositions, minSpacing, grid) {
    var minSpacingSq = minSpacing * minSpacing;
    if (grid) {
        return grid.hasNearby(x, y, minSpacingSq);
    }
    for (var i = 0; i < placedPositions.length; i++) {
        var p = placedPositions[i];
        var dx = x - p.x;
        var dy = y - p.y;
        if (dx * dx + dy * dy < minSpacingSq) return true;
    }
    return false;
}

/**
 * Spatial hash grid for incremental overlap checking.
 * @param {number} cellSize - grid cell edge length (should match minSpacing)
 */
function PlacementGrid(cellSize) {
    this.cellSize = cellSize;
    this.cells = {};
}

PlacementGrid.prototype.add = function(x, y) {
    var cx = Math.floor(x / this.cellSize);
    var cy = Math.floor(y / this.cellSize);
    var key = cx * 100000 + cy;
    if (!this.cells[key]) this.cells[key] = [];
    this.cells[key].push(x, y);  // flat array: [x0,y0, x1,y1, ...]
};

PlacementGrid.prototype.hasNearby = function(x, y, minDistSq) {
    var cx = Math.floor(x / this.cellSize);
    var cy = Math.floor(y / this.cellSize);
    for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
            var key = (cx + dx) * 100000 + (cy + dy);
            var cell = this.cells[key];
            if (!cell) continue;
            for (var i = 0; i < cell.length; i += 2) {
                var ddx = x - cell[i];
                var ddy = y - cell[i + 1];
                if (ddx * ddx + ddy * ddy < minDistSq) return true;
            }
        }
    }
    return false;
};
