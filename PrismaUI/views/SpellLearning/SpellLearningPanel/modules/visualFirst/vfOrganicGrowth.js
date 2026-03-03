/**
 * Visual-First Organic Growth System
 *
 * Shape-constrained organic tree growth with NLP clustering.
 * Depends on: vfHelpers.js, vfThematic.js, vfPrereqLinks.js, vfAlternatePaths.js,
 *             growthBehaviors.js (optional)
 */

// =============================================================================
// ORGANIC GROWTH SYSTEM - Shape-constrained growth with NLP clustering
// =============================================================================

/**
 * Grow organic tree using behavior-driven placement.
 * Uses the growth behavior system to determine how the tree expands.
 *
 * Key principles:
 * 1. Shape mask defines VALID positions (where nodes CAN go)
 * 2. Tree grows from root, branching outward
 * 3. Similar spells cluster together spatially (NLP grouping)
 * 4. Branching distance is configurable per tree
 * 5. No tier limit - grows until all spells placed
 *
 * @param {Array} spells - Spells to place
 * @param {Object} sliceInfo - Sector bounds
 * @param {Object} config - {shape, branch_distance, schoolName, ...}
 * @param {number} seed - Random seed
 * @returns {Object} - {positions, edges}
 */
function growOrganicTree(spells, sliceInfo, config, seed) {
    var rng = seededRandom(seed);

    // GRID CONFIGURATION - Use unified source from config.js
    var gridCfg = GRID_CONFIG.getComputedConfig();
    var nodeSize = gridCfg.nodeSize;
    var minNodeSpacing = gridCfg.minNodeSpacing;
    var baseRadius = gridCfg.baseRadius;
    var totalSpells = spells.length;

    // Get growth behavior for this school (supports both camelCase and snake_case)
    var behaviorName = config.growthBehavior || config.growth_behavior ||
        (typeof SCHOOL_DEFAULT_BEHAVIORS !== 'undefined' ? SCHOOL_DEFAULT_BEHAVIORS[config.schoolName] : null) ||
        'gentle_bloom';
    var baseBehavior = (typeof GROWTH_BEHAVIORS !== 'undefined' ? GROWTH_BEHAVIORS[behaviorName] : null) || getDefaultBehavior();

    console.log('[OrganicGrowth] School:', config.schoolName, 'Behavior:', behaviorName);

    var shape = config.shape || 'organic';
    var shapeMask = getShapeMask(shape);

    // Symmetry: 0 = full randomness, 1 = highly symmetrical/ordered
    var symmetry = config.symmetry !== undefined ? config.symmetry : 0.3;

    // Outward Growth: 0 = compact near center, 1 = aggressive outward reach
    // Priority: config value > behavior default > 0.5
    var outwardGrowth = config.outward_growth !== undefined ? config.outward_growth :
                        (baseBehavior.outwardGrowth !== undefined ? baseBehavior.outwardGrowth : 0.5);

    console.log('[OrganicGrowth] Symmetry:', symmetry, 'OutwardGrowth:', outwardGrowth, 'Shape:', shape);

    var positions = [];
    var edges = [];
    var placedNodes = [];
    var nodesByTier = {};  // Track nodes per tier for fill threshold
    var hubNodes = [];     // Track hub nodes
    var nodesSinceLastHub = 0;

    if (spells.length === 0) {
        return { positions: [], edges: [] };
    }

    // Step 1: Discover NLP groups
    var groups = discoverFuzzyGroupsFromSpells(spells.slice(), rng);
    console.log('[OrganicGrowth] Groups:', groups.map(function(g) { return g.theme + '(' + g.spells.length + ')'; }).join(', '));

    // Assign angular regions to groups
    var usableSector = sliceInfo.sectorAngle * 0.85;
    var sectorStart = sliceInfo.spokeAngle - usableSector / 2;
    var groupCount = Math.max(1, groups.length);

    groups.forEach(function(group, idx) {
        var laneWidth = usableSector / groupCount;
        group.preferredAngle = sectorStart + (idx + 0.5) * laneWidth;
        group.angleMin = sectorStart + idx * laneWidth;
        group.angleMax = sectorStart + (idx + 1) * laneWidth;
    });

    // Build spell -> group mapping
    var spellToGroup = {};
    groups.forEach(function(group) {
        group.spells.forEach(function(spell) {
            spellToGroup[spell.formId] = group;
        });
    });

    // Step 2: Find and place root spell
    var VANILLA_ROOT_FORMIDS = {
        'Destruction': '0x00012FCD',
        'Restoration': '0x00012FCC',
        'Alteration': '0x0005AD5C',
        'Conjuration': '0x000640B6',
        'Illusion': '0x00021143'
    };

    var VANILLA_ROOT_NAMES = {
        'Destruction': 'flames',
        'Restoration': 'healing',
        'Alteration': 'oakflesh',
        'Conjuration': 'conjure familiar',
        'Illusion': 'clairvoyance'
    };

    var rootFormId = VANILLA_ROOT_FORMIDS[config.schoolName];
    var rootName = VANILLA_ROOT_NAMES[config.schoolName];
    var rootSpell = null;
    var spellQueue = [];

    spells.forEach(function(spell) {
        if (!rootSpell && rootFormId && spell.formId === rootFormId) {
            rootSpell = spell;
        } else if (!rootSpell && rootName && spell.name &&
                   spell.name.toLowerCase() === rootName) {
            rootSpell = spell;
        } else {
            spellQueue.push(spell);
        }
    });

    if (!rootSpell) rootSpell = spellQueue.shift();

    // Place root
    var rootRad = sliceInfo.spokeAngle * Math.PI / 180;
    var rootNode = {
        tier: 0,
        radius: baseRadius,
        angle: sliceInfo.spokeAngle,
        x: Math.cos(rootRad) * baseRadius,
        y: Math.sin(rootRad) * baseRadius,
        isRoot: true,
        isHub: true,  // Root is always a hub
        spell: rootSpell,
        formId: rootSpell.formId,
        children: [],
        _fromVisualFirst: true
    };
    positions.push(rootNode);
    placedNodes.push(rootNode);
    hubNodes.push(rootNode);
    nodesByTier[0] = [rootNode];

    // Step 3: Sort spells by group AND spell level (Novice -> Master within each group)
    spellQueue.sort(function(a, b) {
        var groupA = spellToGroup[a.formId];
        var groupB = spellToGroup[b.formId];
        if (!groupA || !groupB) return 0;

        // First sort by group (angular position)
        if (groupA.theme !== groupB.theme) {
            return groupA.preferredAngle - groupB.preferredAngle;
        }

        // Within same group, sort by spell level (lower levels first)
        var levelA = getSpellRank(a);
        var levelB = getSpellRank(b);
        if (levelA !== levelB) {
            return levelA - levelB;  // Novice (0) before Apprentice (1) before Master (4)
        }

        // Same level: use match score
        return (b.matchScore || 0) - (a.matchScore || 0);
    });

    // Step 4: Grow tree using behavior-driven placement with DYNAMIC tier-weighted selection
    var currentTier = 1;
    var maxTier = 1;

    // Count spells by rank for dynamic tier calculation
    var spellsByRank = [0, 0, 0, 0, 0]; // Novice, Apprentice, Adept, Expert, Master
    spellQueue.forEach(function(s) {
        var rank = getSpellRank(s);
        spellsByRank[Math.min(4, rank)]++;
    });

    // Estimate max tiers based on spell count and grid capacity
    // Assume ~8-12 spells per tier on average (varies by sector size)
    var estimatedTiers = Math.max(10, Math.ceil(totalSpells / 8));

    // Calculate dynamic tier ranges for each rank
    // Spread ranks across the estimated tree depth proportionally
    var tierRanges = calculateTierRanges(spellsByRank, estimatedTiers);

    console.log('[OrganicGrowth] Dynamic tier ranges:', JSON.stringify(tierRanges));
    console.log('[OrganicGrowth] Spells by rank:', spellsByRank, 'Estimated tiers:', estimatedTiers);

    /**
     * Calculate dynamic tier ranges based on spell distribution.
     * Each rank gets a range of tiers where it's "allowed" with full probability.
     */
    function calculateTierRanges(rankCounts, maxTiers) {
        var totalSpells = rankCounts.reduce(function(a, b) { return a + b; }, 0);
        if (totalSpells === 0) return { 0: [1, maxTiers], 1: [1, maxTiers], 2: [1, maxTiers], 3: [1, maxTiers], 4: [1, maxTiers] };

        var ranges = {};
        var currentStart = 1;

        for (var rank = 0; rank <= 4; rank++) {
            var proportion = rankCounts[rank] / totalSpells;
            // Each rank gets tiers proportional to its spell count
            // Minimum 2 tiers per rank that has spells, more for ranks with many spells
            var tiersForRank = Math.max(2, Math.ceil(proportion * maxTiers * 1.2));

            // Overlap: ranks can appear slightly before their "main" range
            var overlapStart = Math.max(1, currentStart - 1);
            var rangeEnd = Math.min(maxTiers, currentStart + tiersForRank);

            ranges[rank] = {
                start: overlapStart,      // Earliest tier this rank is allowed
                main: currentStart,        // Main range start (full probability)
                end: rangeEnd,            // Latest tier with full probability
                extended: maxTiers        // Can still appear beyond, with lower probability
            };

            currentStart = rangeEnd;
        }

        return ranges;
    }

    /**
     * Select next spell from queue based on current tier (DYNAMIC version).
     * Uses calculated tier ranges to determine allowed spells.
     */
    function selectNextSpell(queue, placementTier, rng) {
        if (queue.length === 0) return null;
        if (queue.length === 1) return queue.shift();

        // Build weighted candidates based on dynamic tier ranges
        var candidates = [];
        var totalWeight = 0;

        for (var i = 0; i < queue.length; i++) {
            var spell = queue[i];
            var spellRank = getSpellRank(spell);
            var range = tierRanges[spellRank] || tierRanges[0];

            var weight = 0.1; // Base weight (always some small chance)

            if (placementTier < range.start) {
                // Before this rank's allowed range - very low probability
                // Higher ranks shouldn't appear in early tiers
                weight = 0.05;
            } else if (placementTier >= range.start && placementTier < range.main) {
                // In overlap zone - moderate probability
                weight = 0.4;
            } else if (placementTier >= range.main && placementTier <= range.end) {
                // In main range - full probability
                weight = 1.0;
            } else if (placementTier > range.end && placementTier <= range.extended) {
                // Beyond main range but still allowed - decreasing probability
                var overTiers = placementTier - range.end;
                weight = Math.max(0.2, 1.0 - overTiers * 0.1);
            }

            // Fuzzy group bonus: if spell matches an active fuzzy group being built
            var group = spellToGroup[spell.formId];
            if (group && group.matchScore > 0.5) {
                weight *= 1.3;
            }

            candidates.push({ index: i, spell: spell, weight: weight });
            totalWeight += weight;
        }

        // Weighted random selection
        var roll = rng() * totalWeight;
        var cumulative = 0;

        for (var j = 0; j < candidates.length; j++) {
            cumulative += candidates[j].weight;
            if (roll <= cumulative) {
                return queue.splice(candidates[j].index, 1)[0];
            }
        }

        // Fallback: return first
        return queue.shift();
    }

    // Initialize params before loop (in case loop doesn't run due to empty queue)
    var params = baseBehavior || {};
    params.symmetry = symmetry;
    params.outwardGrowth = outwardGrowth;
    // Ensure crossConnectionDensity has a default
    if (params.crossConnectionDensity === undefined) {
        params.crossConnectionDensity = 0.1;
    }

    while (spellQueue.length > 0) {

        // Calculate progress and get behavior parameters for this point
        var progress = 1 - (spellQueue.length / totalSpells);
        params = typeof getActiveParameters === 'function'
            ? getActiveParameters(baseBehavior, progress)
            : baseBehavior;

        // Add symmetry and outwardGrowth from config to params
        params.symmetry = symmetry;
        params.outwardGrowth = outwardGrowth;
        // Pass tree generation settings for element isolation etc
        params.treeGeneration = config.treeGeneration;

        // Select spell with tier-weighted probability (not just shift)
        var spell = selectNextSpell(spellQueue, currentTier, rng);
        if (!spell) break;

        var group = spellToGroup[spell.formId];

        // Estimate tier capacity for fill threshold - use unified config
        var tierRadius = baseRadius + currentTier * gridCfg.tierSpacing;
        var tierArc = (sliceInfo.sectorAngle * Math.PI / 180) * tierRadius;
        var tierCapacity = Math.floor(tierArc / gridCfg.arcSpacing);
        var tierNodesPlaced = nodesByTier[currentTier] ? nodesByTier[currentTier].length : 0;

        // Find best parent node (pass spell for level-aware selection)
        var parentNode = findBehaviorParent(placedNodes, hubNodes, group, params, rng, spell);

        // Calculate preferred direction based on behavior
        var direction = typeof calculatePreferredDirection === 'function'
            ? calculatePreferredDirection(parentNode, params, tierNodesPlaced, tierCapacity, sliceInfo, rng)
            : { angle: parentNode.angle + (rng() - 0.5) * 20, radiusStep: gridCfg.tierSpacing };

        // Find best position near parent in preferred direction
        var bestPos = findBehaviorPosition(
            parentNode, direction, group, placedNodes, sliceInfo, shapeMask,
            nodeSize, minNodeSpacing, rng, params
        );

        if (!bestPos) {
            bestPos = findFallbackPosition(sliceInfo, tierRadius, currentTier, rng, nodeSize, placedNodes, minNodeSpacing);
        }

        // If still no position, skip this spell (shouldn't happen with enough tiers)
        if (!bestPos) {
            console.warn('[OrganicGrowth] Could not find position for spell:', spell.formId);
            continue;
        }

        // Determine if this node should be a hub
        var isHub = typeof shouldBeHub === 'function'
            ? shouldBeHub({ tier: currentTier }, params, nodesSinceLastHub, rng)
            : false;

        // Create node - clamp tier to reasonable range (use unified config)
        var rawTier = Math.floor((bestPos.radius - baseRadius) / gridCfg.tierSpacing) + 1;
        var nodeTier = Math.max(1, Math.min(500, rawTier)); // Cap at 500 tiers max
        var node = {
            tier: nodeTier,
            radius: bestPos.radius,
            angle: bestPos.angle,
            x: bestPos.x,
            y: bestPos.y,
            isRoot: false,
            isHub: isHub,
            spell: spell,
            formId: spell.formId,
            fuzzyGroup: group ? group.theme : '_other',
            parent: parentNode.formId,
            children: [],
            _fromVisualFirst: true
        };

        positions.push(node);
        placedNodes.push(node);
        parentNode.children.push(node.formId);

        // Track by tier
        if (!nodesByTier[nodeTier]) nodesByTier[nodeTier] = [];
        nodesByTier[nodeTier].push(node);

        if (isHub) {
            hubNodes.push(node);
            nodesSinceLastHub = 0;
        } else {
            nodesSinceLastHub++;
        }

        // Create edge to parent
        edges.push({
            from: parentNode.formId,
            to: spell.formId,
            type: isHub ? 'hub' : 'primary'
        });

        // DISABLED: Terminal cluster creation causes bunching outside grid
        // All spells now placed on exact grid positions via the main loop

        // Update current tier tracking
        maxTier = Math.max(maxTier, nodeTier);

        // Advance tier based on fill threshold
        var fillRatio = tierCapacity > 0 ? tierNodesPlaced / tierCapacity : 1;
        if (fillRatio >= params.layerFillThreshold || params.verticalBias > 0.3) {
            currentTier = Math.min(currentTier + 1, maxTier + 1);
        }
    }

    // Step 5: Add cross-group and web connections based on behavior
    var crossConnections = typeof getCrossConnections === 'function'
        ? getCrossConnections(positions, params, rng)
        : [];

    crossConnections.forEach(function(conn) {
        edges.push({
            from: conn.from.formId,
            to: conn.to.formId,
            type: conn.type || 'cross'
        });
    });

    // Step 6: Add prerequisite links based on spell rank
    // Pass treeGeneration settings for element isolation
    var prereqResult = addPrerequisiteLinks(positions, edges, spellToGroup, rng, config.treeGeneration);

    // Step 7: Add alternate paths between nearby same-tier nodes with long paths
    // Pass alternate path config from school config (supports both camelCase and snake_case)
    var altPathConfig = {
        minPathDistance: config.altPathMinDistance || config.alt_path_min_distance,
        maxSpatialDistance: config.altPathMaxDistance || config.alt_path_max_distance,
        baseProbability: config.altPathProbability || config.alt_path_probability,
        maxAlternatesPerNode: config.altPathMaxPerNode || config.alt_path_max_per_node,
        fuzzyBonus: config.altPathFuzzyBonus || config.alt_path_fuzzy_bonus
    };
    var alternateResult = addAlternatePaths(positions, edges, spellToGroup, rng, altPathConfig);

    // Step 8: Assign hard/soft prerequisite requirements
    var prereqStats = assignPrerequisiteRequirements(positions, edges, rng);

    // Step 9: Fix thematic inconsistencies (post-processing)
    // This ensures spells have at least one thematically related prerequisite
    var thematicStats = fixThematicInconsistencies(positions, edges, rng);

    console.log('[OrganicGrowth] Placed', positions.length, 'nodes,', edges.length, 'edges,',
                hubNodes.length, 'hubs,', prereqResult.count, 'prereqs,',
                alternateResult.count, 'alternates, max tier:', maxTier,
                ', thematic fixes:', thematicStats.nodesFixed);

    return { positions: positions, edges: edges };
}

// =============================================================================
// BEHAVIOR-DRIVEN PARENT FINDING
// =============================================================================

/**
 * Find best parent for a new node based on behavior and spell level.
 * - Root can ONLY branch to Novice/Apprentice (level 0-1), max 4-6 children
 * - Other nodes limited by available adjacent empty positions
 * - Parents should have spell level <= child's level
 */
function findBehaviorParent(placedNodes, hubNodes, group, params, rng, childSpell) {
    var childLevel = childSpell ? getSpellRank(childSpell) : 0;

    // LOG: Show element isolation settings for this parent search
    var tg = params.treeGeneration || {};
    if (childSpell && childSpell.name) {
        console.log('[findBehaviorParent] Spell:', childSpell.name,
                    '| elementIsolation:', tg.elementIsolation,
                    '| strict:', tg.elementIsolationStrict);
    }

    // Branch limits
    var ROOT_MAX_CHILDREN = 5;       // Root can have max 5 direct children
    var NODE_MAX_CHILDREN = 4;       // Regular nodes max 4 children
    var ROOT_MAX_CHILD_LEVEL = 1;    // Root only accepts Novice(0) or Apprentice(1)

    // Filter candidates by multiple criteria
    var candidateFilter = function(n) {
        var childCount = n.children ? n.children.length : 0;
        var parentLevel = n.spell ? getSpellRank(n.spell) : 0;

        // ROOT NODE: Special restrictions
        if (n.isRoot) {
            // Root already has max children? Skip
            if (childCount >= ROOT_MAX_CHILDREN) return false;

            // Root can only accept Novice (0) or Apprentice (1) children
            if (childLevel > ROOT_MAX_CHILD_LEVEL) return false;

            return true;
        }

        // REGULAR NODES: Check child limit
        if (childCount >= NODE_MAX_CHILDREN) return false;

        // Level check: parent level should be <= child level
        // Allow 1 level higher with small probability for occasional jumps
        if (parentLevel > childLevel && !(parentLevel === childLevel + 1 && rng() < 0.15)) {
            return false;
        }

        return true;
    };

    // If we have hubs and behavior prefers them, consider hubs first
    if (hubNodes.length > 1 && params.hubProbability > 0.2 && rng() < 0.4) {
        var validHubs = hubNodes.filter(candidateFilter);
        if (validHubs.length > 1) {
            // Pick a random valid hub (not the root if child level is too high)
            var nonRootHubs = validHubs.filter(function(h) { return !h.isRoot; });
            if (nonRootHubs.length > 0) {
                var idx = Math.floor(rng() * nonRootHubs.length);
                return nonRootHubs[idx];
            }
        }
    }

    // Find nodes in same group that pass all filters
    var candidates = group ? placedNodes.filter(function(n) {
        if (!candidateFilter(n)) return false;
        return n.fuzzyGroup === group.theme || n.isRoot || n.isHub;
    }) : placedNodes.filter(candidateFilter);

    // Fallback: if no group-matching candidates, try any that pass filter
    if (candidates.length === 0) {
        candidates = placedNodes.filter(candidateFilter);
    }

    // Last resort: find node with fewest children (ignoring level)
    if (candidates.length === 0) {
        var sorted = placedNodes.slice().sort(function(a, b) {
            return (a.children ? a.children.length : 0) - (b.children ? b.children.length : 0);
        });
        // Return the one with fewest children
        return sorted[0];
    }

    // Score candidates: prefer appropriate parents with matching spell levels AND themes
    candidates.sort(function(a, b) {
        var aChildren = a.children ? a.children.length : 0;
        var bChildren = b.children ? b.children.length : 0;
        var aLevel = a.spell ? getSpellRank(a.spell) : 0;
        var bLevel = b.spell ? getSpellRank(b.spell) : 0;

        // Heavy penalty for root if child level > 1
        var aRootPenalty = (a.isRoot && childLevel > ROOT_MAX_CHILD_LEVEL) ? 1000 : 0;
        var bRootPenalty = (b.isRoot && childLevel > ROOT_MAX_CHILD_LEVEL) ? 1000 : 0;

        // Prefer closer spell levels (same level best, 1 level lower also good)
        var aLevelDiff = Math.abs(aLevel - childLevel);
        var bLevelDiff = Math.abs(bLevel - childLevel);

        // Penalize parents with higher level than child (hierarchy should go low -> high)
        var aLevelPenalty = (aLevel > childLevel) ? 10 : 0;
        var bLevelPenalty = (bLevel > childLevel) ? 10 : 0;

        // Fuzzy group bonus: same group = better thematic connection
        var aGroupBonus = (group && a.fuzzyGroup === group.theme) ? -5 : 0;
        var bGroupBonus = (group && b.fuzzyGroup === group.theme) ? -5 : 0;

        // THEMATIC BONUS: Prefer parents with similar element/theme keywords
        // This is critical for avoiding illogical prereqs like fire->frost
        var aThematicBonus = 0;
        var bThematicBonus = 0;
        var aElementPenalty = 0;
        var bElementPenalty = 0;

        if (childSpell && a.spell) {
            var aSim = calculateThematicSimilarity(childSpell, a.spell);
            aThematicBonus = aSim > 0.5 ? -10 : (aSim > 0.3 ? -5 : 0);

            // Element isolation penalty (uses config.treeGeneration if available)
            if (aSim <= 0.1) {  // Element conflict (fire vs frost etc)
                if (params.treeGeneration && params.treeGeneration.elementIsolationStrict) {
                    aElementPenalty = 10000;  // Effectively forbidden
                    console.log('[ELEMENT CONFLICT] STRICT BLOCK:', childSpell.name, '<-', a.spell.name, '(penalty 10000)');
                } else if (params.treeGeneration && params.treeGeneration.elementIsolation) {
                    aElementPenalty = 100;  // Strong penalty
                    console.log('[ELEMENT CONFLICT] penalty:', childSpell.name, '<-', a.spell.name, '(penalty 100)');
                }
            }
        }
        if (childSpell && b.spell) {
            var bSim = calculateThematicSimilarity(childSpell, b.spell);
            bThematicBonus = bSim > 0.5 ? -10 : (bSim > 0.3 ? -5 : 0);

            // Element isolation penalty
            if (bSim <= 0.1) {  // Element conflict
                if (params.treeGeneration && params.treeGeneration.elementIsolationStrict) {
                    bElementPenalty = 10000;
                } else if (params.treeGeneration && params.treeGeneration.elementIsolation) {
                    bElementPenalty = 100;
                }
            }
        }

        // Combined score: lower = better
        // child count * 3 + level diff * 2 + level penalty + root penalty + group bonus + thematic bonus + element penalty
        var aScore = aChildren * 3 + aLevelDiff * 2 + aLevelPenalty + aRootPenalty + aGroupBonus + aThematicBonus + aElementPenalty;
        var bScore = bChildren * 3 + bLevelDiff * 2 + bLevelPenalty + bRootPenalty + bGroupBonus + bThematicBonus + bElementPenalty;

        return aScore - bScore;
    });

    // Pick from top candidates with some randomness (but not too random)
    var pickIdx = Math.floor(rng() * Math.min(3, candidates.length));
    return candidates[pickIdx];
}

