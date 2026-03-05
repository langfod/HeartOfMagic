/**
 * VF Organic Growth Parent -- Behavior-driven parent finding for organic growth.
 *
 * Loaded after: vfOrganicGrowth.js
 * Depends on: vfHelpers.js, vfThematic.js, growthBehaviors.js (optional)
 */

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
