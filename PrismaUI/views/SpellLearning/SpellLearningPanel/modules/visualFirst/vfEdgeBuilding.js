/**
 * Visual-First Edge Building
 *
 * Tier-based grid placement and proximity-based edge construction with NLP scoring.
 * Depends on: vfConstants.js, vfHelpers.js, vfThematic.js
 */

// =============================================================================
// SPELL ASSIGNMENT
// =============================================================================

/**
 * Assign spells to positions by tier.
 * Simple assignment - spells go to positions matching their tier.
 *
 * @param {Array} positions - All positions
 * @param {Array} spells - Array of spell objects with tier info
 * @param {number} seed - Random seed
 * @returns {Array} - Positions with spells assigned
 */
function assignSpellsToPositions(positions, spells, seed) {
    var rng = seededRandom(seed);

    // Get school from first spell (all spells in this call are same school)
    var school = spells.length > 0 ? spells[0].school : null;
    var vanillaRootId = school ? VANILLA_ROOTS[school] : null;

    // Group spells by tier (0-4 for Novice to Master)
    var spellsByTier = {};
    var vanillaRootSpell = null;

    spells.forEach(function(spell) {
        // Check if this is the vanilla root spell
        if (vanillaRootId && spell.formId && spell.formId.toLowerCase() === vanillaRootId.toLowerCase()) {
            vanillaRootSpell = spell;
            return; // Don't add to tier pool - will assign directly to root
        }

        var tier = getTierIndex(spell.skillLevel || spell.tier);
        if (!spellsByTier[tier]) spellsByTier[tier] = [];
        spellsByTier[tier].push(spell);
    });

    // Shuffle each tier's spells for variety
    for (var t in spellsByTier) {
        shuffle(spellsByTier[t], rng);
    }

    // Separate positions by type
    var rootPositions = positions.filter(function(p) { return p.isRoot; });
    var regularPositions = positions.filter(function(p) { return !p.isRoot; });

    // Sort regular positions by tier (lower tier = closer to center)
    regularPositions.sort(function(a, b) { return a.tier - b.tier; });

    var assignedCount = 0;

    // Step 1: Assign root positions - PREFER vanilla root spell first
    var noviceSpells = spellsByTier[0] || [];
    for (var i = 0; i < rootPositions.length; i++) {
        if (i === 0 && vanillaRootSpell) {
            // First root position gets vanilla root spell (Flames, Healing, etc.)
            rootPositions[i].spell = vanillaRootSpell;
            console.log('[VisualFirstBuilder] Assigned vanilla root:', vanillaRootSpell.name, 'to', school);
        } else if (noviceSpells.length > 0) {
            rootPositions[i].spell = noviceSpells.shift();
        }
        if (rootPositions[i].spell) assignedCount++;
    }

    // Step 2: Collect all remaining spells in tier order
    var allSpellsOrdered = [];
    allSpellsOrdered = allSpellsOrdered.concat(noviceSpells);  // Remaining novice
    for (var t = 1; t < 5; t++) {
        allSpellsOrdered = allSpellsOrdered.concat(spellsByTier[t] || []);
    }

    // Step 3: Assign to regular positions (inner to outer)
    for (var i = 0; i < regularPositions.length && allSpellsOrdered.length > 0; i++) {
        regularPositions[i].spell = allSpellsOrdered.shift();
        assignedCount++;
    }

    console.log('[VisualFirstBuilder] Assigned', assignedCount, 'spells to',
                positions.length, 'positions');

    return positions;
}

// =============================================================================
// EDGE BUILDING - Ensures all nodes connect to root, no cycles
// =============================================================================

/**
 * Build edges connecting nodes with guaranteed connectivity to root.
 * Uses fuzzy NLP relationships to prefer semantically related spells as prerequisites.
 *
 * Rules:
 * 1. All nodes MUST connect to root through some path
 * 2. No circular dependencies (edges only go from lower tier to higher tier)
 * 3. Convergence creates interesting multi-prerequisite nodes
 * 4. Fuzzy relationships influence prerequisite selection (prefer related spells)
 *
 * @param {Array} positions - All positions with spells assigned
 * @param {Object} config - {convergence_chance, ...}
 * @param {number} seed - Random seed
 * @param {Object} fuzzyData - Optional fuzzy relationship data
 * @returns {Array} - Array of edge objects {from, to}
 */
function buildEdges(positions, config, seed, fuzzyData) {
    var edges = [];
    var convergence = config.convergence_chance || config.convergence || 0.4;
    var rng = seededRandom(seed);

    // Log tree generation settings being used
    var treeGenSettings = config.treeGeneration || {};
    console.log('[buildEdges] Tree generation settings:',
                'elementIsolation=' + (treeGenSettings.elementIsolation || false),
                'strict=' + (treeGenSettings.elementIsolationStrict || false),
                'linkStrategy=' + (treeGenSettings.linkStrategy || 'default'));

    // Setup fuzzy data helpers
    var fuzzy = fuzzyData || { relationships: {}, similarity_scores: {} };
    var relationships = fuzzy.relationships || {};
    var similarities = fuzzy.similarity_scores || {};

    // Helper to get similarity score between two spells
    function getSimilarity(formId1, formId2) {
        // Try both orderings
        var key1 = formId1 + ':' + formId2;
        var key2 = formId2 + ':' + formId1;
        return similarities[key1] || similarities[key2] || 0;
    }

    // Helper to check if spells are fuzzy-related
    function areRelated(formId1, formId2) {
        var related1 = relationships[formId1] || [];
        var related2 = relationships[formId2] || [];
        return related1.indexOf(formId2) >= 0 || related2.indexOf(formId1) >= 0;
    }

    // Get only positions with spells
    var nodesWithSpells = positions.filter(function(p) { return p.spell; });

    // Build lookup maps
    var nodeByFormId = {};
    nodesWithSpells.forEach(function(p) {
        nodeByFormId[p.spell.formId] = p;
    });

    // Find root node (tier 0 or isRoot flag)
    var rootNode = nodesWithSpells.find(function(p) { return p.isRoot; }) ||
                   nodesWithSpells.find(function(p) { return p.tier === 0; });

    if (!rootNode) {
        console.warn('[VisualFirstBuilder] No root node found!');
        return edges;
    }

    // Track which nodes are connected to root
    var connectedToRoot = {};
    connectedToRoot[rootNode.spell.formId] = true;

    // Group by effective tier
    var byTier = {};
    nodesWithSpells.forEach(function(p) {
        var t = Math.floor(p.tier);
        if (!byTier[t]) byTier[t] = [];
        byTier[t].push(p);
    });

    // Get sorted tier numbers
    var tierNums = Object.keys(byTier).map(Number).sort(function(a, b) { return a - b; });

    // Track fuzzy matches used
    var fuzzyMatchCount = 0;
    var totalEdges = 0;

    // Process each tier in order, connecting to previous tiers
    for (var tIdx = 1; tIdx < tierNums.length; tIdx++) {
        var currentTierNum = tierNums[tIdx];
        var currentTier = byTier[currentTierNum] || [];

        // Get all nodes from previous tiers that are connected
        var connectedPrevious = [];
        for (var pIdx = 0; pIdx < tIdx; pIdx++) {
            var prevTierNum = tierNums[pIdx];
            (byTier[prevTierNum] || []).forEach(function(p) {
                if (connectedToRoot[p.spell.formId]) {
                    connectedPrevious.push(p);
                }
            });
        }

        if (connectedPrevious.length === 0) {
            console.warn('[VisualFirstBuilder] No connected previous nodes for tier', currentTierNum);
            continue;
        }

        // Connect each node in current tier
        currentTier.forEach(function(pos) {
            if (!pos.spell) return;
            var myFormId = pos.spell.formId;

            // Get tree generation settings (if available)
            var treeGen = config.treeGeneration || {};
            var scoring = treeGen.scoring || {};

            // Pre-compute themes for current node (hoisted from inner loop)
            var myThemes = getSpellThemes(pos.spell);
            var elements = ['fire', 'frost', 'shock'];
            var myElements = myThemes.filter(function(t) { return elements.indexOf(t) !== -1; });

            // Score candidates using tree generation settings
            var scoredCandidates = connectedPrevious.map(function(c) {
                var cFormId = c.spell.formId;
                var dist = distance(pos, c);
                var isRelated = areRelated(myFormId, cFormId);
                var sim = getSimilarity(myFormId, cFormId);

                // Calculate thematic similarity for element isolation
                var thematicSim = calculateThematicSimilarity(pos.spell, c.spell);
                var themes2 = getSpellThemes(c.spell);

                // Check for element conflict (fire vs frost, etc.)
                var candidateElements = themes2.filter(function(t) { return elements.indexOf(t) !== -1; });
                var hasElementConflict = myElements.length > 0 && candidateElements.length > 0 &&
                    !myElements.some(function(e) { return candidateElements.indexOf(e) !== -1; });
                var hasElementMatch = myElements.length > 0 && candidateElements.length > 0 &&
                    myElements.some(function(e) { return candidateElements.indexOf(e) !== -1; });

                // Build score based on settings
                var score = 0;

                // Element isolation rules
                if (treeGen.elementIsolationStrict && hasElementConflict) {
                    // STRICT: Cross-element links are forbidden
                    score = -10000;
                } else if (treeGen.elementIsolation && hasElementConflict) {
                    // NORMAL: Heavy penalty for cross-element
                    score -= 500;
                }

                // Scoring factors from settings
                if (scoring.elementMatching !== false && hasElementMatch) {
                    score += 100;  // Same element bonus
                }

                if (scoring.fuzzyRelationship !== false && isRelated) {
                    score += 1000;  // Fuzzy relationship bonus (highest)
                }

                if (scoring.themeCoherence !== false) {
                    // Theme overlap bonus (scaled by similarity)
                    var themeOverlap = 0;
                    myThemes.forEach(function(t) { if (themes2.indexOf(t) !== -1) themeOverlap++; });
                    score += themeOverlap * 70;  // +70 per shared theme
                }

                if (scoring.tierProgression !== false) {
                    // Adjacent tier bonus
                    var tierDiff = pos.tier - c.tier;
                    if (tierDiff === 1) score += 50;  // Perfect progression
                    else if (tierDiff > 1) score += 20;  // Skip tier (less ideal)
                }

                // Always apply similarity and distance (but can be scaled)
                score += sim * 100;  // Similarity 0-1 => 0-100 bonus

                if (scoring.distancePenalty !== false) {
                    score -= dist * 0.1;  // Distance penalty
                }

                return { pos: c, score: score, isRelated: isRelated, similarity: sim, distance: dist,
                         hasElementConflict: hasElementConflict, hasElementMatch: hasElementMatch };
            });

            // Sort by score (highest first)
            scoredCandidates.sort(function(a, b) { return b.score - a.score; });

            // Filter out forbidden connections in strict mode
            var viableCandidates = scoredCandidates;
            if (treeGen.elementIsolationStrict) {
                viableCandidates = scoredCandidates.filter(function(c) { return !c.hasElementConflict; });
                if (viableCandidates.length === 0) {
                    // Strict mode but no valid candidates - fall back to all (orphan prevention)
                    viableCandidates = scoredCandidates;
                }
            }

            // ALWAYS connect to best scored - this guarantees connectivity
            if (viableCandidates.length > 0) {
                var best = viableCandidates[0];
                edges.push({
                    from: best.pos.spell.formId,
                    to: myFormId,
                    type: best.isRelated ? 'fuzzy_primary' : (best.hasElementMatch ? 'element_match' : 'primary')
                });
                connectedToRoot[myFormId] = true;
                totalEdges++;
                if (best.isRelated) fuzzyMatchCount++;
            }

            // Add convergence (multiple prerequisites) based on chance
            if (viableCandidates.length > 1 && rng() < convergence) {
                // Find a second prerequisite - prefer fuzzy-related or high similarity
                // But also consider distance to avoid ugly crossing lines

                var candidates = viableCandidates.slice(1).filter(function(c) {
                    // Must be sufficiently far from first choice (different branch)
                    var farEnough = distance(c.pos, viableCandidates[0].pos) > 40;
                    // Also respect element isolation in convergence
                    var elementOk = !treeGen.elementIsolation || !c.hasElementConflict;
                    return farEnough && elementOk;
                });

                // If fuzzy related candidates exist, prefer them
                var fuzzyRelatedCandidates = candidates.filter(function(c) { return c.isRelated; });
                if (fuzzyRelatedCandidates.length > 0) {
                    candidates = fuzzyRelatedCandidates;
                }

                // Sort by: tier diff (prefer earlier tiers) then score
                candidates.sort(function(a, b) {
                    var tierDiffA = pos.tier - a.pos.tier;
                    var tierDiffB = pos.tier - b.pos.tier;
                    if (tierDiffA !== tierDiffB) return tierDiffB - tierDiffA;
                    return b.score - a.score;
                });

                if (candidates.length > 0) {
                    // Pick from top candidates with some randomness
                    var pickIdx = Math.floor(rng() * Math.min(3, candidates.length));
                    var picked = candidates[pickIdx];
                    edges.push({
                        from: picked.pos.spell.formId,
                        to: myFormId,
                        type: picked.isRelated ? 'fuzzy_convergence' : 'convergence'
                    });
                    totalEdges++;
                    if (picked.isRelated) fuzzyMatchCount++;
                } else if (viableCandidates.length > 1) {
                    // Fallback to second best scored (only if element-compatible or not strict)
                    var fallback = viableCandidates[1];
                    if (!treeGen.elementIsolation || !fallback.hasElementConflict) {
                        edges.push({
                            from: fallback.pos.spell.formId,
                            to: myFormId,
                            type: 'convergence'
                        });
                        totalEdges++;
                    }
                }
            }
        });
    }

    // Log fuzzy matching stats
    if (totalEdges > 0) {
        var fuzzyPercent = Math.round(fuzzyMatchCount / totalEdges * 100);
        console.log('[VisualFirstBuilder] Fuzzy matching:', fuzzyMatchCount + '/' + totalEdges, 'edges (' + fuzzyPercent + '%) used fuzzy relationships');
    }

    // VALIDATION: Check for any orphaned nodes and connect them
    var orphans = nodesWithSpells.filter(function(p) {
        return !connectedToRoot[p.spell.formId] && !p.isRoot;
    });

    if (orphans.length > 0) {
        console.warn('[VisualFirstBuilder] Found', orphans.length, 'orphan nodes, connecting...');

        orphans.forEach(function(orphan) {
            // Find nearest connected node with lower tier
            var candidates = nodesWithSpells.filter(function(p) {
                return connectedToRoot[p.spell.formId] && p.tier < orphan.tier;
            });

            if (candidates.length === 0) {
                // Last resort: connect to root
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
    }

    // VALIDATION: Check for circular dependencies (should never happen with tier-based approach)
    var hasCycle = detectCycles(edges, nodeByFormId);
    if (hasCycle) {
        console.error('[VisualFirstBuilder] CYCLE DETECTED! This should not happen.');
    }

    console.log('[VisualFirstBuilder] Built', edges.length, 'edges,',
                nodesWithSpells.length, 'nodes connected,',
                orphans.length, 'orphans fixed');
    return edges;
}
