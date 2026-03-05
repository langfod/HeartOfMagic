/**
 * Visual-First Builder Helpers
 *
 * Shared utility functions used by other vf modules.
 * Depends on: vfConstants.js, layoutGenerator.js (GRID_CONFIG)
 */

// =============================================================================
// UTILITIES
// =============================================================================

// seededRandom() is defined in layoutGenerator.js (loaded before this file)

function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
    return arr;
}

function hashString(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

// =============================================================================
// DISTANCE CALCULATION
// =============================================================================

/**
 * Calculate distance between two positions.
 */
function distance(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// =============================================================================
// TIER CONVERSION
// =============================================================================

/**
 * Convert tier name to index.
 */
function getTierIndex(tier) {
    if (typeof tier === 'number') return tier;
    var tiers = ['Novice', 'Apprentice', 'Adept', 'Expert', 'Master'];
    var idx = tiers.indexOf(tier);
    return idx >= 0 ? idx : 0;
}

/**
 * Get spell rank index from skill level
 */
function getSpellRank(spell) {
    if (!spell) return 0;

    var level = spell.skillLevel || spell.tier || 0;

    // Handle string levels
    if (typeof level === 'string') {
        var levelLower = level.toLowerCase();
        if (levelLower.indexOf('novice') >= 0) return 0;
        if (levelLower.indexOf('apprentice') >= 0) return 1;
        if (levelLower.indexOf('adept') >= 0) return 2;
        if (levelLower.indexOf('expert') >= 0) return 3;
        if (levelLower.indexOf('master') >= 0) return 4;
    }

    // Handle numeric levels (0-100 skill requirement)
    if (typeof level === 'number') {
        if (level < 25) return 0;      // Novice
        if (level < 50) return 1;      // Apprentice
        if (level < 75) return 2;      // Adept
        if (level < 100) return 3;     // Expert
        return 4;                       // Master
    }

    return 0;
}

// =============================================================================
// DEFAULT BEHAVIOR
// =============================================================================

/**
 * Get default behavior when module not loaded
 */
function getDefaultBehavior() {
    return {
        outwardGrowth: 0.5,   // Default balanced outward growth
        verticalBias: 0.0,
        layerFillThreshold: 0.5,
        spreadFactor: 0.6,
        angularWander: 20,
        branchingFactor: 2,
        branchingVariance: 0.3,
        branchStyle: 'binary',
        hubProbability: 0.1,
        hubMinSpacing: 10,
        hubBranchCount: 4,
        createTerminalClusters: true,
        terminalClusterSize: 3,
        terminalClusterChance: 0.3,
        waveAmplitude: 0,
        waveFrequency: 0,
        crossConnectionDensity: 0.1,
        crossConnectionMaxDist: 2.0,
        webPattern: false,
        phases: []
    };
}

// =============================================================================
// SHAPE MASKS
// =============================================================================

/**
 * Get shape mask function by name.
 */
function getShapeMask(shapeName) {
    console.log('[ShapeMask] Using shape:', shapeName);

    var masks = {
        // All positions valid - full radial spread
        radial: function(t, a, r) { return true; },

        // Slight organic randomness (90% pass)
        organic: function(t, a, r) { return r() > 0.1; },

        // 5-arm star pattern - MORE AGGRESSIVE
        spiky: function(t, a, r) {
            var rayCount = 5;
            var rayValue = Math.abs(Math.sin(a * rayCount * Math.PI));
            // Higher threshold = more defined spikes
            return rayValue > 0.4 + t * 0.3 || r() < 0.15;
        },

        // Mountain/peak shape - narrows as it grows outward
        mountain: function(t, a, r) {
            var peakWidth = 1.0 - t * 0.8;  // Narrower peak
            var distFromCenter = Math.abs(a - 0.5) * 2;
            return distFromCenter < peakWidth + r() * 0.1;
        },

        // Cloud - bumpy top edge
        cloud: function(t, a, r) {
            var bumpPhase = a * 3 * Math.PI;
            var bumpValue = Math.sin(bumpPhase) * 0.5 + 0.5;
            return t < 0.65 + bumpValue * 0.3 + r() * 0.1;
        },

        // Flame - wavy edges that narrow
        flame: function(t, a, r) {
            var wave = Math.sin(a * Math.PI * 4 + t * 2) * 0.3;
            var edge = 0.8 - t * 0.5 + wave;
            var dist = Math.abs(a - 0.5) * 2;
            return dist < edge + r() * 0.08;
        },

        // Tree - narrow trunk then branches
        tree: function(t, a, r) {
            if (t < 0.3) return Math.abs(a - 0.5) < 0.15;  // Narrow trunk
            var branchCount = 2 + Math.floor(t * 4);
            return Math.abs(Math.sin(a * branchCount * Math.PI)) > 0.5 || r() < 0.2;
        },

        // Cascade - horizontal bands
        cascade: function(t, a, r) {
            var band = (t * 5) % 1;
            return band > 0.35 || r() < 0.25;
        },

        // Galaxy - spiral arms
        galaxy: function(t, a, r) {
            var spiralTwist = t * 2;
            var armValue = Math.sin((a * 2 + spiralTwist) * Math.PI) * 0.5 + 0.5;
            return armValue > 0.45 || r() < 0.2;
        }
    };

    return masks[shapeName] || masks.organic;
}

// =============================================================================
// FUZZY GROUP DISCOVERY (from spell arrays)
// =============================================================================

/**
 * Discover fuzzy groups from spell names/effects.
 */
function discoverFuzzyGroupsFromSpells(spells, rng) {
    // Extract keywords from all spells using UNIFIED extraction (includes description)
    var keywordCounts = {};
    var spellKeywords = {};

    var stopWords = ['the', 'of', 'and', 'a', 'to', 'in', 'for', 'is', 'on', 'that', 'by', 'this', 'with', 'spell', 'magic', 'magicka', 'target', 'effect', 'damage', 'points', 'second', 'seconds', 'level', 'health', 'restore', 'greater', 'lesser', 'mass', 'caster', 'concentration', 'enemies', 'enemy', 'nearby', 'area'];

    spells.forEach(function(spell, idx) {
        // Use UNIFIED text extraction (name + effectNames + effects + description)
        var words = extractSpellKeywords(spell, stopWords);

        spellKeywords[idx] = words;
        words.forEach(function(w) {
            keywordCounts[w] = (keywordCounts[w] || 0) + 1;
        });
    });

    // Find themes (keywords in 8-45% of spells)
    var minCount = Math.max(2, Math.floor(spells.length * 0.08));
    var maxCount = Math.floor(spells.length * 0.45);

    var themes = [];
    for (var kw in keywordCounts) {
        if (keywordCounts[kw] >= minCount && keywordCounts[kw] <= maxCount) {
            themes.push({ keyword: kw, count: keywordCounts[kw] });
        }
    }
    themes.sort(function(a, b) { return b.count - a.count; });
    themes = themes.slice(0, 6);  // Max 6 themes

    var groups = themes.map(function(t) {
        return { theme: t.keyword, spells: [], preferredAngle: 0 };
    });
    groups.push({ theme: '_other', spells: [], preferredAngle: 0 });

    // Assign spells
    spells.forEach(function(spell, idx) {
        var keywords = spellKeywords[idx] || [];
        var bestGroup = null;
        var bestScore = 0;

        for (var g = 0; g < groups.length - 1; g++) {
            if (keywords.indexOf(groups[g].theme) >= 0) {
                var score = keywordCounts[groups[g].theme];
                if (score > bestScore) {
                    bestScore = score;
                    bestGroup = groups[g];
                }
            }
        }

        spell.matchScore = bestScore;
        (bestGroup || groups[groups.length - 1]).spells.push(spell);
    });

    groups = groups.filter(function(g) { return g.spells.length > 0; });

    // Handle large '_other'
    var other = groups.find(function(g) { return g.theme === '_other'; });
    if (other && groups.length > 1 && other.spells.length > spells.length * 0.4) {
        var realGroups = groups.filter(function(g) { return g.theme !== '_other'; });
        other.spells.forEach(function(s, i) {
            realGroups[i % realGroups.length].spells.push(s);
        });
        groups = realGroups;
    }

    // Fallback groups
    if (groups.length === 0) {
        groups = [
            { theme: 'branch_a', spells: [], preferredAngle: 0 },
            { theme: 'branch_b', spells: [], preferredAngle: 0 },
            { theme: 'branch_c', spells: [], preferredAngle: 0 }
        ];
        spells.forEach(function(s, i) {
            groups[i % 3].spells.push(s);
        });
    }

    return groups;
}

// =============================================================================
// POSITION FINDING HELPERS
// =============================================================================

/**
 * Find best position for a spell near its thematic neighbors.
 */
function findBestPosition(spell, group, placedNodes, sliceInfo, shapeMask, currentRadius, nodeSize, minSpacing, rng, branchDistance) {
    var candidates = [];
    var searchRadius = nodeSize * branchDistance * 2;

    // Find placed nodes in same group (or all nodes if no group matches)
    var sameGroupNodes = group ? placedNodes.filter(function(n) {
        return n.fuzzyGroup === group.theme || n.isRoot;
    }) : placedNodes;

    if (sameGroupNodes.length === 0) {
        sameGroupNodes = placedNodes;
    }

    // Generate candidate positions around same-group nodes
    sameGroupNodes.forEach(function(node) {
        // Try positions radiating outward from this node
        for (var angleOffset = -30; angleOffset <= 30; angleOffset += 15) {
            for (var radiusMult = 1.0; radiusMult <= 2.0; radiusMult += 0.3) {
                var angle = node.angle + angleOffset + (rng() - 0.5) * 10;
                var radius = node.radius + nodeSize * radiusMult * branchDistance;

                // Check sector bounds
                if (angle < sliceInfo.startAngle + 5 || angle > sliceInfo.endAngle - 5) continue;

                // Check shape mask
                var tierProgress = (radius - 60) / 500;  // Approximate tier progress
                var angleNorm = (angle - sliceInfo.startAngle) / sliceInfo.sectorAngle;
                if (!shapeMask(Math.min(1, Math.max(0, tierProgress)), Math.min(1, Math.max(0, angleNorm)), rng)) {
                    continue;
                }

                var rad = angle * Math.PI / 180;
                var x = Math.cos(rad) * radius;
                var y = Math.sin(rad) * radius;

                // Check not too close to existing nodes
                var tooClose = false;
                for (var i = 0; i < placedNodes.length; i++) {
                    var dx = x - placedNodes[i].x;
                    var dy = y - placedNodes[i].y;
                    if (Math.sqrt(dx*dx + dy*dy) < minSpacing) {
                        tooClose = true;
                        break;
                    }
                }
                if (tooClose) continue;

                // Score this candidate
                var distToParent = Math.sqrt(
                    Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2)
                );

                // Prefer positions in group's preferred angle region
                var anglePref = group ? Math.abs(angle - group.preferredAngle) : 0;

                candidates.push({
                    x: x,
                    y: y,
                    radius: radius,
                    angle: angle,
                    score: distToParent + anglePref * 0.5,
                    parentNode: node
                });
            }
        }
    });

    if (candidates.length === 0) return null;

    // Sort by score (lower is better) and pick best
    candidates.sort(function(a, b) { return a.score - b.score; });
    return candidates[0];
}

/**
 * Fallback position when no valid candidate found.
 * GRID-ALIGNED: Snaps to tier AND angular grid
 * CHECKS OCCUPIED: Won't return position that overlaps existing nodes
 */
function findFallbackPosition(sliceInfo, currentRadius, tier, rng, nodeSize, placedNodes, minSpacing) {
    // GRID CONFIGURATION - Use unified source from config.js
    var gridCfg = GRID_CONFIG.getComputedConfig();
    var baseRadius = gridCfg.baseRadius;
    var tierSpacing = gridCfg.tierSpacing;
    var arcSpacing = gridCfg.arcSpacing;

    // Try multiple tiers until we find a free slot
    for (var tierOffset = 1; tierOffset <= 20; tierOffset++) {
        var nextTier = tier + tierOffset;
        var radius = baseRadius + nextTier * tierSpacing;

        // Calculate angular grid positions for this tier
        var arcLength = (sliceInfo.sectorAngle / 360) * 2 * Math.PI * radius;
        var candidateCount = Math.max(3, Math.floor(arcLength / arcSpacing));
        var usableAngle = sliceInfo.sectorAngle * 0.85;
        var angleStep = candidateCount > 1 ? usableAngle / (candidateCount - 1) : 0;
        var startAngle = sliceInfo.spokeAngle - usableAngle / 2;

        // Try each grid position in this tier
        for (var i = 0; i < candidateCount; i++) {
            var angle = candidateCount === 1 ? sliceInfo.spokeAngle : startAngle + i * angleStep;

            // Clamp to sector bounds
            if (angle < sliceInfo.startAngle + 3 || angle > sliceInfo.endAngle - 3) continue;

            var rad = angle * Math.PI / 180;
            var x = Math.cos(rad) * radius;
            var y = Math.sin(rad) * radius;

            // Check if position is free
            var isOccupied = false;
            if (placedNodes) {
                for (var j = 0; j < placedNodes.length; j++) {
                    var dx = x - placedNodes[j].x;
                    var dy = y - placedNodes[j].y;
                    if (Math.sqrt(dx * dx + dy * dy) < (minSpacing || gridCfg.minNodeSpacing)) {
                        isOccupied = true;
                        break;
                    }
                }
            }

            if (!isOccupied) {
                return {
                    x: x,
                    y: y,
                    radius: radius,
                    angle: angle
                };
            }
        }
    }

    // No free position found (very unlikely with 20 tiers)
    return null;
}

/**
 * Find best parent node to connect to.
 * - Root can only accept Novice/Apprentice children, max 5 children
 * - Other nodes max 4 children
 * - Parent level should be <= child level
 */
function findBestParent(node, placedNodes, group, maxEdgeLength) {
    var candidates = [];
    var childLevel = node.spell ? getSpellRank(node.spell) : 0;

    // Branch limits
    var ROOT_MAX_CHILDREN = 5;
    var NODE_MAX_CHILDREN = 4;
    var ROOT_MAX_CHILD_LEVEL = 1;  // Novice (0) or Apprentice (1)

    placedNodes.forEach(function(p) {
        if (p.formId === node.formId) return;

        var dx = node.x - p.x;
        var dy = node.y - p.y;
        var dist = Math.sqrt(dx*dx + dy*dy);

        if (dist > maxEdgeLength && !p.isRoot) return;

        var childCount = p.children ? p.children.length : 0;
        var parentLevel = p.spell ? getSpellRank(p.spell) : 0;

        // ROOT RESTRICTIONS
        if (p.isRoot) {
            // Root has max children?
            if (childCount >= ROOT_MAX_CHILDREN) return;
            // Root can only accept low-level children
            if (childLevel > ROOT_MAX_CHILD_LEVEL) {
                // Don't add to candidates at all
                return;
            }
        } else {
            // Regular node has max children?
            if (childCount >= NODE_MAX_CHILDREN) return;
        }

        // Spell level check: parent should be same level or weaker
        var levelPenalty = 0;
        if (parentLevel > childLevel) {
            levelPenalty = (parentLevel - childLevel) * 150;
        }

        // Child count penalty (prefer nodes with fewer children)
        var childCountPenalty = childCount * 20;

        // Score: prefer same group, shorter distance, lower tier, appropriate spell level, fewer children
        var sameGroup = (p.fuzzyGroup === node.fuzzyGroup || p.isRoot) ? 0 : 50;
        var tierPenalty = p.tier >= node.tier ? 100 : 0;

        candidates.push({
            node: p,
            score: dist + sameGroup + tierPenalty + levelPenalty + childCountPenalty
        });
    });

    if (candidates.length === 0) {
        // Fallback: find any node with fewest children
        var sorted = placedNodes.slice().sort(function(a, b) {
            return (a.children ? a.children.length : 0) - (b.children ? b.children.length : 0);
        });
        return sorted[0];
    }

    candidates.sort(function(a, b) { return a.score - b.score; });
    return candidates[0].node;
}

/**
 * Add cross-group connections for thematic prerequisites.
 */
function addCrossGroupConnections(positions, edges, groups, rng, maxDist) {
    var count = 0;
    var maxCross = Math.floor(positions.length * 0.08);  // Max 8% cross connections

    // Build edge set for quick lookup
    var edgeSet = {};
    edges.forEach(function(e) {
        edgeSet[e.from + '->' + e.to] = true;
        edgeSet[e.to + '->' + e.from] = true;
    });

    positions.forEach(function(node) {
        if (node.isRoot || count >= maxCross) return;
        if (rng() > 0.12) return;  // 12% chance per node

        // Find nodes in OTHER groups that are nearby and lower tier
        var candidates = positions.filter(function(other) {
            if (other.formId === node.formId) return false;
            if (other.fuzzyGroup === node.fuzzyGroup) return false;
            if (other.tier >= node.tier) return false;
            if (edgeSet[other.formId + '->' + node.formId]) return false;

            var dx = node.x - other.x;
            var dy = node.y - other.y;
            return Math.sqrt(dx*dx + dy*dy) < maxDist;
        });

        if (candidates.length > 0) {
            // Pick closest
            candidates.sort(function(a, b) {
                var da = Math.sqrt(Math.pow(node.x - a.x, 2) + Math.pow(node.y - a.y, 2));
                var db = Math.sqrt(Math.pow(node.x - b.x, 2) + Math.pow(node.y - b.y, 2));
                return da - db;
            });

            edges.push({
                from: candidates[0].formId,
                to: node.formId,
                type: 'cross_branch'
            });
            edgeSet[candidates[0].formId + '->' + node.formId] = true;
            count++;
        }
    });

    return count;
}

