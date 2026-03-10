/**
 * Visual-First Fuzzy Grouping
 *
 * Fuzzy group-aware edge building and group discovery algorithm.
 * Depends on: vfHelpers.js, vfThematic.js
 */

// =============================================================================
// FUZZY GROUP BRANCHING (Alternative edge building mode)
// =============================================================================

/**
 * Build edges using fuzzy group logic.
 *
 * Algorithm:
 * 1. Find 2-4 most distinct fuzzy groups from spell names/effects
 * 2. Connect root to representative spells from each group
 * 3. Branch within each group by theme commonality
 * 4. Final pass: add cross-branch prereqs based on fuzzy similarity
 *
 * @param {Array} positions - All positions with spells assigned
 * @param {Object} config - Configuration
 * @param {number} seed - Random seed
 * @param {Object} fuzzyData - Fuzzy relationship data
 * @returns {Array} - Array of edge objects {from, to}
 */
function buildEdgesFuzzyGroups(positions, config, seed, fuzzyData) {
    var edges = [];
    var rng = seededRandom(seed);

    // Get only positions with spells
    var nodesWithSpells = positions.filter(function(p) { return p.spell; });
    if (nodesWithSpells.length === 0) return edges;

    // Build lookup
    var nodeByFormId = {};
    nodesWithSpells.forEach(function(p) {
        nodeByFormId[p.spell.formId] = p;
    });

    // Find root
    var rootNode = nodesWithSpells.find(function(p) { return p.isRoot; }) ||
                   nodesWithSpells.find(function(p) { return p.tier === 0; });
    if (!rootNode) return edges;

    var connectedToRoot = {};
    connectedToRoot[rootNode.spell.formId] = true;

    console.log('[FuzzyGroupBranching] Starting with', nodesWithSpells.length, 'spells');

    // =========================================================================
    // STEP 1: Discover fuzzy groups from spell names and effects
    // =========================================================================
    var groups = discoverFuzzyGroups(nodesWithSpells, rng);
    console.log('[FuzzyGroupBranching] Found', groups.length, 'distinct groups');

    // =========================================================================
    // STEP 2: Connect root to first spell of each group (most common/representative)
    // =========================================================================
    var groupRoots = [];
    groups.forEach(function(group, idx) {
        if (group.spells.length === 0) return;

        // Pick the lowest tier spell as group representative
        var sorted = group.spells.slice().sort(function(a, b) {
            return a.tier - b.tier;
        });
        var representative = sorted[0];

        // Connect root to this representative
        if (representative.spell.formId !== rootNode.spell.formId) {
            edges.push({
                from: rootNode.spell.formId,
                to: representative.spell.formId,
                type: 'group_root'
            });
            connectedToRoot[representative.spell.formId] = true;
            groupRoots.push({ node: representative, group: group });
            console.log('[FuzzyGroupBranching] Group "' + group.theme + '" root:', representative.spell.name);
        }
    });

    // =========================================================================
    // STEP 3: Branch within each group (most common first, then less common)
    // =========================================================================
    groups.forEach(function(group) {
        // Sort by tier, then by match score (most common first)
        var sorted = group.spells.slice().sort(function(a, b) {
            if (a.tier !== b.tier) return a.tier - b.tier;
            return (b.matchScore || 0) - (a.matchScore || 0);
        });

        // Connect each spell to the best connected predecessor in same group
        for (var i = 1; i < sorted.length; i++) {
            var current = sorted[i];
            if (current.spell.formId === rootNode.spell.formId) continue;
            if (connectedToRoot[current.spell.formId]) continue;

            // Find best parent: connected, lower tier, same group preferred
            var candidates = sorted.slice(0, i).filter(function(c) {
                return connectedToRoot[c.spell.formId] && c.tier < current.tier;
            });

            // Also consider group root if no candidates
            if (candidates.length === 0) {
                candidates = sorted.filter(function(c) {
                    return connectedToRoot[c.spell.formId] && c.tier <= current.tier && c !== current;
                });
            }

            if (candidates.length > 0) {
                // Pick closest in tier, with some fuzziness score weight
                candidates.sort(function(a, b) {
                    var tierDiffA = current.tier - a.tier;
                    var tierDiffB = current.tier - b.tier;
                    var scoreA = tierDiffA * 10 - (a.matchScore || 0) * 0.1;
                    var scoreB = tierDiffB * 10 - (b.matchScore || 0) * 0.1;
                    return scoreA - scoreB;
                });

                var parent = candidates[0];
                edges.push({
                    from: parent.spell.formId,
                    to: current.spell.formId,
                    type: 'group_branch'
                });
                connectedToRoot[current.spell.formId] = true;
            }
        }
    });

    // =========================================================================
    // STEP 4: Connect any orphans (spells not in any group or not connected)
    // =========================================================================
    var orphans = nodesWithSpells.filter(function(p) {
        return !connectedToRoot[p.spell.formId] && !p.isRoot;
    });

    orphans.forEach(function(orphan) {
        // Find nearest connected node with lower or equal tier
        var candidates = nodesWithSpells.filter(function(p) {
            return connectedToRoot[p.spell.formId] && p.tier < orphan.tier;
        });

        if (candidates.length === 0) {
            candidates = [rootNode];
        }

        candidates.sort(function(a, b) {
            return distance(orphan, a) - distance(orphan, b);
        });

        edges.push({
            from: candidates[0].spell.formId,
            to: orphan.spell.formId,
            type: 'orphan_fix'
        });
        connectedToRoot[orphan.spell.formId] = true;
    });

    // =========================================================================
    // STEP 5: Cross-branch prereqs (fuzzy similarity across whole tree)
    // =========================================================================
    var crossPrereqChance = config.cross_prereq_chance || 0.15;
    var maxCrossPrereqs = Math.min(10, Math.floor(nodesWithSpells.length * 0.1));
    var crossPrereqCount = 0;

    // Get fuzzy data helpers
    var fuzzy = fuzzyData || { relationships: {}, similarity_scores: {} };
    var similarities = fuzzy.similarity_scores || {};

    function getSimilarity(formId1, formId2) {
        var key1 = formId1 + ':' + formId2;
        var key2 = formId2 + ':' + formId1;
        return similarities[key1] || similarities[key2] || 0;
    }

    // Find high-similarity pairs across different groups
    nodesWithSpells.forEach(function(node) {
        if (node.isRoot || crossPrereqCount >= maxCrossPrereqs) return;
        if (rng() > crossPrereqChance) return;

        var myFormId = node.spell.formId;
        var myGroup = node.fuzzyGroup;

        // Find spells in OTHER groups with high similarity
        var crossCandidates = nodesWithSpells.filter(function(other) {
            if (other.spell.formId === myFormId) return false;
            if (other.tier >= node.tier) return false;  // Must be prerequisite
            if (other.fuzzyGroup === myGroup) return false;  // Different group
            if (!connectedToRoot[other.spell.formId]) return false;

            var sim = getSimilarity(myFormId, other.spell.formId);
            return sim > 0.3;  // Only if reasonably similar
        });

        if (crossCandidates.length > 0) {
            // Sort by similarity
            crossCandidates.sort(function(a, b) {
                return getSimilarity(myFormId, b.spell.formId) - getSimilarity(myFormId, a.spell.formId);
            });

            // Check we don't already have this edge
            var best = crossCandidates[0];
            var existingEdge = edges.find(function(e) {
                return e.from === best.spell.formId && e.to === myFormId;
            });

            if (!existingEdge) {
                edges.push({
                    from: best.spell.formId,
                    to: myFormId,
                    type: 'cross_branch'
                });
                crossPrereqCount++;
            }
        }
    });

    console.log('[FuzzyGroupBranching] Built', edges.length, 'edges (' + crossPrereqCount + ' cross-branch)');

    // Validate no cycles
    var hasCycle = detectCycles(edges, nodeByFormId);
    if (hasCycle) {
        console.error('[FuzzyGroupBranching] CYCLE DETECTED! Removing cross-branch edges...');
        edges = edges.filter(function(e) { return e.type !== 'cross_branch'; });
    }

    return edges;
}

/**
 * Discover fuzzy groups from spell names and effects.
 * Uses simple keyword extraction and clustering.
 *
 * @param {Array} nodesWithSpells - Nodes with spells assigned
 * @param {Function} rng - Random number generator
 * @returns {Array} - Array of {theme, spells: [...]} objects
 */
function discoverFuzzyGroups(nodesWithSpells, rng) {
    // Extract keywords from all spells using UNIFIED extraction (includes description)
    var keywordCounts = {};
    var spellKeywords = {};

    var stopWords = ['the', 'of', 'and', 'a', 'to', 'in', 'for', 'is', 'on', 'that', 'by', 'this', 'with', 'i', 'you', 'it', 'not', 'or', 'be', 'are', 'from', 'at', 'as', 'your', 'all', 'have', 'new', 'more', 'an', 'was', 'we', 'will', 'can', 'us', 'about', 'if', 'my', 'has', 'but', 'our', 'one', 'other', 'do', 'no', 'time', 'very', 'when', 'come', 'could', 'now', 'than', 'like', 'only', 'into', 'its', 'also', 'after', 'use', 'two', 'how', 'which', 'way', 'well', 'may', 'then', 'any', 'through', 'during', 'each', 'where', 'spell', 'magic', 'magicka', 'target', 'effect', 'points', 'second', 'seconds', 'level', 'caster', 'concentration'];

    nodesWithSpells.forEach(function(node) {
        var spell = node.spell;

        // Use UNIFIED text extraction (name + effectNames + effects + description)
        var words = extractSpellKeywords(spell, stopWords);

        spellKeywords[spell.formId] = words;

        words.forEach(function(word) {
            keywordCounts[word] = (keywordCounts[word] || 0) + 1;
        });
    });

    // Find most common keywords (potential themes)
    var sortedKeywords = Object.keys(keywordCounts).sort(function(a, b) {
        return keywordCounts[b] - keywordCounts[a];
    });

    // Pick 2-4 distinct themes
    var themes = [];
    var minCount = Math.max(2, Math.floor(nodesWithSpells.length * 0.05));

    for (var i = 0; i < sortedKeywords.length && themes.length < 4; i++) {
        var keyword = sortedKeywords[i];
        if (keywordCounts[keyword] < minCount) continue;

        // Check it's not too similar to existing themes
        var isSimilar = themes.some(function(t) {
            return keyword.indexOf(t) >= 0 || t.indexOf(keyword) >= 0;
        });

        if (!isSimilar) {
            themes.push(keyword);
        }
    }

    // If we didn't find enough themes, add some generic ones based on tier
    if (themes.length < 2) {
        themes = ['primary', 'secondary'];
    }

    console.log('[FuzzyGroupBranching] Themes:', themes.join(', '));

    // Assign spells to groups
    var groups = themes.map(function(theme) {
        return { theme: theme, spells: [] };
    });
    groups.push({ theme: '_other', spells: [] });  // Catch-all

    nodesWithSpells.forEach(function(node) {
        var spell = node.spell;
        var words = spellKeywords[spell.formId] || [];

        // Find best matching theme
        var bestTheme = null;
        var bestScore = 0;

        themes.forEach(function(theme, idx) {
            var score = 0;
            words.forEach(function(word) {
                if (word === theme) score += 10;
                else if (word.indexOf(theme) >= 0) score += 5;
                else if (theme.indexOf(word) >= 0) score += 3;
            });

            if (score > bestScore) {
                bestScore = score;
                bestTheme = idx;
            }
        });

        // Assign to group
        if (bestTheme !== null && bestScore > 0) {
            node.fuzzyGroup = themes[bestTheme];
            node.matchScore = bestScore;
            groups[bestTheme].spells.push(node);
        } else {
            node.fuzzyGroup = '_other';
            node.matchScore = 0;
            groups[groups.length - 1].spells.push(node);
        }
    });

    // Remove empty groups
    groups = groups.filter(function(g) { return g.spells.length > 0; });

    // If '_other' is too large, redistribute or treat as its own branch
    var otherGroup = groups.find(function(g) { return g.theme === '_other'; });
    if (otherGroup && otherGroup.spells.length > nodesWithSpells.length * 0.5) {
        // Split _other into sub-groups by tier
        var byTier = {};
        otherGroup.spells.forEach(function(node) {
            var t = Math.floor(node.tier);
            if (!byTier[t]) byTier[t] = [];
            byTier[t].push(node);
        });

        // Remove original _other
        groups = groups.filter(function(g) { return g.theme !== '_other'; });

        // Add tier-based groups
        Object.keys(byTier).forEach(function(t) {
            if (byTier[t].length > 0) {
                groups.push({ theme: 'tier_' + t, spells: byTier[t] });
            }
        });
    }

    return groups;
}

/**
 * Detect cycles in edge graph (should never happen with tier-based edges).
 */
function detectCycles(edges, nodeByFormId) {
    // Build adjacency list
    var children = {};
    edges.forEach(function(e) {
        if (!children[e.from]) children[e.from] = [];
        children[e.from].push(e.to);
    });

    // DFS cycle detection
    var visited = {};
    var inStack = {};

    function dfs(nodeId) {
        if (inStack[nodeId]) return true;  // Cycle!
        if (visited[nodeId]) return false;

        visited[nodeId] = true;
        inStack[nodeId] = true;

        var nodeChildren = children[nodeId] || [];
        for (var i = 0; i < nodeChildren.length; i++) {
            if (dfs(nodeChildren[i])) return true;
        }

        inStack[nodeId] = false;
        return false;
    }

    for (var nodeId in nodeByFormId) {
        if (dfs(nodeId)) return true;
    }
    return false;
}
