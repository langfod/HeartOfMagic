/**
 * settingsAwareBuilder.js - Tree construction, entry points, and exports
 * for the SettingsAwareTreeBuilder system.
 *
 * Depends on: settingsAwareCore.js (must be loaded first), edgeScoring.js,
 * layoutEngine.js
 */

// =============================================================================
// STRING HASH UTILITY
// =============================================================================

/**
 * Simple string hash for seeding
 */
function hashString(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash);
}

// =============================================================================
// TREE BUILDER
// =============================================================================

/**
 * Build a spell tree for a single school with guaranteed settings respect.
 *
 * @param {Array} spells - Array of spell objects
 * @param {Object} settings - Tree generation settings (from presets)
 * @param {number} seed - Random seed for reproducibility
 * @param {string} schoolName - Name of the school (for growth behavior)
 * @param {Object} schoolConfig - Optional per-school configuration
 * @returns {Object} - { nodes: [], links: [], root: formId, stats: {} }
 */
function buildSchoolTree(spells, settings, seed, schoolName, schoolConfig, nlpData) {
    var ctx = _setupSchoolTreeContext(spells, settings, seed, schoolName, schoolConfig, nlpData);
    if (ctx.empty) return ctx.result;

    var nodes = ctx.nodes, edges = ctx.edges, existingEdges = ctx.existingEdges;
    var stats = ctx.stats, nodeByFormId = ctx.nodeByFormId;
    var nodesByTier = ctx.nodesByTier, tierNums = ctx.tierNums;
    var maxChildrenPerNode = ctx.maxChildrenPerNode;
    var rng = ctx.rng, behavior = ctx.behavior;
    var rootCount = ctx.rootCount, rootSpell = ctx.rootSpell;
    settings = ctx.settings;

    // Hub tracking for behavior-driven hub creation
    var nodesSinceLastHub = 0;

    // =================================================================
    // PHASE 1: Primary tree structure (each node gets one parent)
    // =================================================================
    console.log('[SettingsAwareBuilder] Phase 1: Building primary tree');

    // Build root subtree tracking for multi-root balance
    var nodeRootMap = {}; // formId -> root formId
    var rootSubtreeSize = {}; // root formId -> count
    var multiRootBalance = (rootCount > 1);
    var idealSizePerRoot = Math.ceil(nodes.length / rootCount);

    if (multiRootBalance) {
        // Initialize from tier-0 distribution
        nodes.forEach(function(n) {
            if (n.isRoot) {
                nodeRootMap[n.formId] = n.formId;
                rootSubtreeSize[n.formId] = 1;
            }
        });
        // Map tier-0 children to their root
        nodes.forEach(function(n) {
            if (!n.isRoot && n.prerequisites.length > 0) {
                var parentId = n.prerequisites[0];
                var rootId = nodeRootMap[parentId];
                if (rootId) {
                    nodeRootMap[n.formId] = rootId;
                    rootSubtreeSize[rootId] = (rootSubtreeSize[rootId] || 0) + 1;
                }
            }
        });
        // Walk deeper for cascaded tier-0 nodes
        var changed = true;
        while (changed) {
            changed = false;
            nodes.forEach(function(n) {
                if (!nodeRootMap[n.formId] && n.prerequisites.length > 0) {
                    var parentRoot = nodeRootMap[n.prerequisites[0]];
                    if (parentRoot) {
                        nodeRootMap[n.formId] = parentRoot;
                        rootSubtreeSize[parentRoot] = (rootSubtreeSize[parentRoot] || 0) + 1;
                        changed = true;
                    }
                }
            });
        }
        console.log('[SettingsAwareBuilder] Initial subtree sizes:', Object.keys(rootSubtreeSize).map(function(rid) {
            var rn = nodeByFormId[rid];
            return (rn ? rn.name : rid) + '=' + rootSubtreeSize[rid];
        }).join(', '));
    }

    for (var tIdx = 1; tIdx < tierNums.length; tIdx++) {
        var currentTier = tierNums[tIdx];
        var currentNodes = nodesByTier[currentTier] || [];

        // Get all potential parents (lower tiers)
        var parentCandidates = [];
        for (var pIdx = 0; pIdx < tIdx; pIdx++) {
            var parentTier = tierNums[pIdx];
            (nodesByTier[parentTier] || []).forEach(function(n) {
                parentCandidates.push(n);
            });
        }

        // Connect each node to best parent
        currentNodes.forEach(function(node) {
            if (node.isRoot) return;

            // Score all candidates, respecting maxChildrenPerNode
            // NO EXEMPTIONS - all nodes respect child limits to enable cascading/branching
            var scored = parentCandidates.map(function(parent) {
                var baseScore = _scoreEdge(parent.spell, node.spell, settings);

                // Apply subtree balance penalty in multi-root mode
                if (multiRootBalance && nodeRootMap[parent.formId]) {
                    var parentRootId = nodeRootMap[parent.formId];
                    var subtreeSize = rootSubtreeSize[parentRootId] || 0;
                    // Start penalizing at 80% of ideal, escalate non-linearly
                    var threshold = idealSizePerRoot * 0.8;
                    if (subtreeSize > threshold) {
                        var overload = (subtreeSize - threshold) / idealSizePerRoot;
                        baseScore -= Math.floor(overload * 80 + overload * overload * 120);
                    }
                }

                return {
                    node: parent,
                    score: baseScore,
                    childCount: parent.children.length
                };
            }).filter(function(s) {
                // Only valid edges AND hasn't reached max children
                return s.score >= 0 && s.childCount < maxChildrenPerNode;
            }).sort(function(a, b) {
                // Primary sort: score (higher is better)
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                // Tie-breaker: prefer parent with fewer children (load balance)
                return a.childCount - b.childCount;
            });

            // Track rejections for stats
            var rejected = parentCandidates.length - scored.length;
            if (settings.elementIsolationStrict || settings.elementIsolation) {
                stats.rejectedCrossElement += rejected;
            }

            // Connect to best parent
            if (scored.length > 0) {
                var best = scored[0];
                if (tryCreateEdge(best.node, node, edges, settings, existingEdges, 'primary')) {
                    node.prerequisites.push(best.node.formId);
                    best.node.children.push(node.formId);
                    stats.totalEdges++;
                    nodesSinceLastHub++;


                    // Check if this node should become a hub (behavior-driven)
                    if (behavior && behavior.hubProbability > 0) {
                        var hubMinSpacing = behavior.hubMinSpacing || 5;
                        if (node.tier >= 2 && nodesSinceLastHub >= hubMinSpacing) {
                            if (rng() < behavior.hubProbability) {
                                node.isHub = true;
                                nodesSinceLastHub = 0;
                                stats.hubsCreated++;
                                console.log('[SettingsAwareBuilder] Created hub:', node.name);
                            }
                        }
                    }
                }
            } else if (parentCandidates.length > 0 && !settings.elementIsolationStrict) {
                // Fallback: connect to any parent (orphan prevention)
                // NO exemptions - all nodes respect maxChildrenPerNode
                var availableFallbacks = parentCandidates.filter(function(p) {
                    return p.children.length < maxChildrenPerNode;
                });

                if (availableFallbacks.length === 0) {
                    // All parents are full - create hub from deepest node
                    var sortedByDepth = parentCandidates.slice().sort(function(a, b) {
                        return b.tier - a.tier;  // Deepest first
                    });
                    var hubCandidate = sortedByDepth.find(function(n) { return !n.isHub; });
                    if (hubCandidate) {
                        hubCandidate.isHub = true;
                        stats.hubsCreated++;
                        console.log('[SettingsAwareBuilder] Promoted to hub (cascade):', hubCandidate.name);
                        availableFallbacks = [hubCandidate];
                    } else {
                        // All are already hubs - use the one with fewest children
                        availableFallbacks = parentCandidates.slice().sort(function(a, b) {
                            return a.children.length - b.children.length;
                        }).slice(0, 1);
                    }
                }

                var fallback = availableFallbacks[Math.floor(rng() * Math.min(3, availableFallbacks.length))];
                edges.push({
                    from: fallback.formId,
                    to: node.formId,
                    type: 'cascaded',
                    score: 0
                });
                existingEdges[fallback.formId + '->' + node.formId] = true;
                node.prerequisites.push(fallback.formId);
                fallback.children.push(node.formId);
                stats.totalEdges++;
                console.log('[SettingsAwareBuilder] Cascaded (non-strict):', node.name, '-> ' + fallback.name);
            } else if (parentCandidates.length > 0 && settings.elementIsolationStrict) {
                // In strict mode: NO exemptions - cascade through same-element chain
                // Find any same-element node that has room for children
                var sameElementNodes = nodes.filter(function(n) {
                    return n.element === node.element &&
                           n.formId !== node.formId &&
                           n.tier < node.tier;
                });

                // Sort by tier (prefer higher tier = deeper in chain) then by child count
                sameElementNodes.sort(function(a, b) {
                    // Prefer nodes with fewer children first
                    var aRoom = maxChildrenPerNode - a.children.length;
                    var bRoom = maxChildrenPerNode - b.children.length;
                    if (aRoom !== bRoom) return bRoom - aRoom;  // More room = better
                    // Then prefer higher tier (deeper in chain)
                    return b.tier - a.tier;
                });

                // Find one with room for children - NO EXEMPTIONS in strict mode
                var availableParent = sameElementNodes.find(function(p) {
                    return p.children.length < maxChildrenPerNode;
                });

                if (availableParent) {
                    // Connect to this same-element parent that has room
                    if (tryCreateEdge(availableParent, node, edges, settings, existingEdges, 'element-cascade')) {
                        node.prerequisites.push(availableParent.formId);
                        availableParent.children.push(node.formId);
                        stats.totalEdges++;
                        console.log('[SettingsAwareBuilder] Cascaded:', node.name, '-> ' + availableParent.name + ' (children: ' + availableParent.children.length + ')');
                    }
                } else if (sameElementNodes.length > 0) {
                    // All same-element parents are FULL - need to promote one to hub
                    // Hubs can exceed maxChildrenPerNode (only option when ALL nodes full)
                    var existingHub = sameElementNodes.find(function(n) { return n.isHub; });
                    if (existingHub) {
                        // Connect to existing hub (hubs have no child limit as last resort)
                        if (tryCreateEdge(existingHub, node, edges, settings, existingEdges, 'hub-connect')) {
                            node.prerequisites.push(existingHub.formId);
                            existingHub.children.push(node.formId);
                            stats.totalEdges++;
                        }
                    } else {
                        // Create new hub from the deepest same-element node (never root nodes)
                        var hubCandidate = sameElementNodes.find(function(n) {
                            return !n.isRoot && n.tier >= 1 && n.tier < node.tier;
                        });
                        if (hubCandidate) {
                            hubCandidate.isHub = true;
                            stats.hubsCreated++;
                            console.log('[SettingsAwareBuilder] Promoted to hub (overflow):', hubCandidate.name, '(' + node.element + ')');

                            // Now connect to the new hub
                            if (tryCreateEdge(hubCandidate, node, edges, settings, existingEdges, 'hub-connect')) {
                                node.prerequisites.push(hubCandidate.formId);
                                hubCandidate.children.push(node.formId);
                                stats.totalEdges++;
                            }
                        } else {
                            // No hub candidate - find ANY non-root node that can become hub
                            var anyCandidate = sameElementNodes.find(function(n) { return !n.isRoot; }) || sameElementNodes[0];
                            if (anyCandidate) {
                                anyCandidate.isHub = true;
                                stats.hubsCreated++;
                                console.log('[SettingsAwareBuilder] Promoted to hub (last resort):', anyCandidate.name);
                                if (tryCreateEdge(anyCandidate, node, edges, settings, existingEdges, 'hub-connect')) {
                                    node.prerequisites.push(anyCandidate.formId);
                                    anyCandidate.children.push(node.formId);
                                    stats.totalEdges++;
                                }
                            }
                        }
                    }
                } else {
                    // No same-element nodes at all - connect to a node with room
                    console.log('[SettingsAwareBuilder] No same-element nodes for', node.name, '(' + node.element + ') - finding available parent');

                    // Find any node with room (prefer same-element root, then any root, then any node)
                    var rescueParent = nodes.find(function(n) { return n.isRoot && n.element === node.element && n.children.length < maxChildrenPerNode; }) ||
                                       nodes.find(function(n) { return n.isRoot && n.children.length < maxChildrenPerNode; }) ||
                                       nodes.find(function(n) { return n.tier < node.tier && n.children.length < maxChildrenPerNode; });

                    if (rescueParent) {
                        var key = rescueParent.formId + '->' + node.formId;
                        if (!existingEdges[key]) {
                            edges.push({
                                from: rescueParent.formId,
                                to: node.formId,
                                type: 'orphan-rescue',
                                score: 0
                            });
                            existingEdges[key] = true;
                            node.prerequisites.push(rescueParent.formId);
                            rescueParent.children.push(node.formId);
                            stats.totalEdges++;
                            console.log('[SettingsAwareBuilder] Orphan rescue:', node.name, '(' + node.element + ') -> ' + rescueParent.name);
                        }
                    }
                }
            }

            // Catch-all root subtree tracking: if node got connected, map it to parent's root
            if (multiRootBalance && node.prerequisites.length > 0 && !nodeRootMap[node.formId]) {
                var parentRoot = nodeRootMap[node.prerequisites[0]];
                if (parentRoot) {
                    nodeRootMap[node.formId] = parentRoot;
                    rootSubtreeSize[parentRoot] = (rootSubtreeSize[parentRoot] || 0) + 1;
                }
            }
        });
    }

    if (multiRootBalance) {
        console.log('[SettingsAwareBuilder] Final subtree sizes:', Object.keys(rootSubtreeSize).map(function(rid) {
            var rn = nodeByFormId[rid];
            return (rn ? rn.name : rid) + '=' + rootSubtreeSize[rid];
        }).join(', '));
    }

    // =================================================================
    // PHASE 2: Add convergence (multiple prerequisites for higher tiers)
    // =================================================================
    if (settings.convergenceEnabled !== false) {
        console.log('[SettingsAwareBuilder] Phase 2: Adding convergence links');

        // Use behavior's crossConnectionDensity to influence convergence
        var convergenceChance = (settings.convergenceChance || 40) / 100;
        if (behavior && behavior.crossConnectionDensity !== undefined) {
            // Blend settings with behavior's density
            convergenceChance = Math.max(convergenceChance, behavior.crossConnectionDensity);
        }
        var minTier = settings.convergenceMinTier || 3;

        nodes.forEach(function(node) {
            if (node.isRoot) return;
            if (node.tier < minTier) return;
            if (rng() > convergenceChance) return;
            if (node.prerequisites.length >= 2) return;  // Already has multiple

            // Find additional parent candidates (respecting maxChildrenPerNode)
            var candidates = [];
            nodes.forEach(function(other) {
                if (other.tier >= node.tier) return;
                if (node.prerequisites.indexOf(other.formId) >= 0) return;
                // Skip parents that have reached max children
                if (other.children.length >= maxChildrenPerNode) return;

                var edgeScore = _scoreEdge(other.spell, node.spell, settings);
                if (edgeScore >= 0) {
                    candidates.push({ node: other, score: edgeScore });
                }
            });

            candidates.sort(function(a, b) { return b.score - a.score; });

            if (candidates.length > 0) {
                var pick = candidates[Math.floor(rng() * Math.min(3, candidates.length))];
                if (tryCreateEdge(pick.node, node, edges, settings, existingEdges, 'convergence')) {
                    node.prerequisites.push(pick.node.formId);
                    pick.node.children.push(node.formId);
                    stats.totalEdges++;
                }
            }
        });
    }

    // =================================================================
    // OUTPUT
    // =================================================================

    // Convert to output format
    // Safety: ensure root nodes never have prerequisites (they are entry points)
    var outputNodes = nodes.map(function(n) {
        return {
            formId: n.formId,
            name: n.name,
            tier: n.tier,
            element: n.element,
            isRoot: n.isRoot,
            prerequisites: n.isRoot ? [] : n.prerequisites,
            children: n.isRoot ? n.children.filter(function(cid) {
                // Remove other root formIds from children (roots are independent)
                var childNode = nodeByFormId[cid];
                return !childNode || !childNode.isRoot;
            }) : n.children
        };
    });

    var outputLinks = edges.map(function(e) {
        return {
            from: e.from,
            to: e.to,
            type: e.type
        };
    });

    console.log('[SettingsAwareBuilder] Complete:',
                stats.totalEdges, 'edges,',
                stats.rejectedCrossElement, 'rejected for cross-element');

    // DIAGNOSTIC: Verify children arrays are populated
    var nodesWithChildren = outputNodes.filter(function(n) { return n.children && n.children.length > 0; });
    var nodesWithPrereqs = outputNodes.filter(function(n) { return n.prerequisites && n.prerequisites.length > 0; });
    console.log('[SettingsAwareBuilder] DIAGNOSTIC: Nodes with children:', nodesWithChildren.length + '/' + outputNodes.length);
    console.log('[SettingsAwareBuilder] DIAGNOSTIC: Nodes with prerequisites:', nodesWithPrereqs.length + '/' + outputNodes.length);
    if (outputNodes.length > 0) {
        var rootNode = outputNodes.find(function(n) { return n.isRoot; });
        if (rootNode) {
            console.log('[SettingsAwareBuilder] DIAGNOSTIC: Root node children count:', rootNode.children ? rootNode.children.length : 0);
        }
    }

    // Use the first actual root node (may differ from initial rootSpell in multi-root mode)
    var actualRoot = outputNodes.find(function(n) { return n.isRoot; });
    var rootFormId = actualRoot ? actualRoot.formId : rootSpell.formId;

    return {
        nodes: outputNodes,
        links: outputLinks,
        root: rootFormId,
        stats: stats
    };
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

/**
 * Build trees for all schools using settings-aware builder.
 *
 * @param {Array} allSpells - All spells
 * @param {Object} schoolConfigs - Per-school configurations
 * @param {Object} treeGeneration - Tree generation settings (from presets)
 * @param {Object} fuzzyData - C++ TF-IDF themes, groups, similarity scores (optional)
 * @returns {Object} - Complete tree data
 */
function buildAllTreesSettingsAware(allSpells, schoolConfigs, treeGeneration, fuzzyData) {
    console.log('='.repeat(60));
    console.log('[SettingsAwareBuilder] v' + SETTINGS_AWARE_BUILDER_VERSION);
    console.log('[SettingsAwareBuilder] Building trees for', allSpells.length, 'spells');
    console.log('[SettingsAwareBuilder] Settings:');
    console.log('  rootCount:', treeGeneration.rootCount, '(type:', typeof treeGeneration.rootCount + ')');
    console.log('  elementIsolation:', treeGeneration.elementIsolation);
    console.log('  elementIsolationStrict:', treeGeneration.elementIsolationStrict);
    console.log('  strictTierOrdering:', treeGeneration.strictTierOrdering);
    console.log('  linkStrategy:', treeGeneration.linkStrategy);

    // Store NLP fuzzy data for EdgeScoring to use
    var nlpData = fuzzyData || {};
    window._nlpFuzzyData = nlpData;  // Global for EdgeScoring access

    if (nlpData.themes && Object.keys(nlpData.themes).length > 0) {
        console.log('[SettingsAwareBuilder] NLP THEMES AVAILABLE:');
        for (var themeName in nlpData.themes) {
            var themeSpells = nlpData.themes[themeName];
            console.log('  ' + themeName + ': ' + (Array.isArray(themeSpells) ? themeSpells.length : 'N/A') + ' spells');
        }
    } else {
        console.log('[SettingsAwareBuilder] No NLP themes - using keyword detection fallback');
    }

    if (nlpData.groups && Object.keys(nlpData.groups).length > 0) {
        console.log('[SettingsAwareBuilder] NLP GROUPS:', Object.keys(nlpData.groups).length, 'groups');
    }

    if (nlpData.similarity_scores) {
        console.log('[SettingsAwareBuilder] NLP SIMILARITY: scores available for parent selection');
    }

    console.log('='.repeat(60));

    var seed = Date.now();

    // Group spells by school
    var spellsBySchool = {};
    allSpells.forEach(function(spell) {
        var school = spell.school || 'Unknown';
        if (!school || school === 'null' || school === 'None') school = 'Unknown';
        if (!spellsBySchool[school]) spellsBySchool[school] = [];
        spellsBySchool[school].push(spell);
    });

    // Build each school
    var schools = {};
    var totalStats = { totalEdges: 0, rejectedCrossElement: 0, hubsCreated: 0 };

    for (var schoolName in spellsBySchool) {
        var spells = spellsBySchool[schoolName];
        var schoolSeed = seed + hashString(schoolName);
        var schoolConfig = schoolConfigs ? schoolConfigs[schoolName] : null;

        console.log('[SettingsAwareBuilder] Processing', schoolName, '(' + spells.length + ' spells)');

        var result = buildSchoolTree(spells, treeGeneration, schoolSeed, schoolName, schoolConfig, nlpData);

        schools[schoolName] = {
            root: result.root,
            nodes: result.nodes,
            links: result.links
        };

        totalStats.totalEdges += result.stats.totalEdges;
        totalStats.rejectedCrossElement += result.stats.rejectedCrossElement;
        totalStats.hubsCreated += result.stats.hubsCreated || 0;
    }

    console.log('[SettingsAwareBuilder] COMPLETE');
    console.log('  Total edges:', totalStats.totalEdges);
    console.log('  Rejected cross-element:', totalStats.rejectedCrossElement);
    console.log('  Hubs created:', totalStats.hubsCreated);

    // Build the result object
    var result = {
        version: '2.0',
        generator: 'SettingsAwareBuilder',
        generatedAt: new Date().toISOString(),
        settings: {
            rootCount: treeGeneration.rootCount || 1,
            elementIsolation: treeGeneration.elementIsolation,
            elementIsolationStrict: treeGeneration.elementIsolationStrict,
            strictTierOrdering: treeGeneration.strictTierOrdering,
            linkStrategy: treeGeneration.linkStrategy,
            maxChildrenPerNode: treeGeneration.maxChildrenPerNode || 5,
            shapeStyle: treeGeneration.shapeStyle || 'organic'
        },
        schools: schools
    };

    // Apply positions using LayoutEngine
    if (typeof LayoutEngine !== 'undefined' && typeof LayoutEngine.applyPositionsToTree === 'function') {
        var layoutOptions = {
            shape: treeGeneration.shape || 'organic',
            seed: seed,
            schoolConfigs: schoolConfigs
        };
        LayoutEngine.applyPositionsToTree(result, layoutOptions);
        console.log('[SettingsAwareBuilder] Applied positions via LayoutEngine');
    } else {
        console.warn('[SettingsAwareBuilder] LayoutEngine not available, nodes will have no positions!');
    }

    return result;
}

// =============================================================================
// ASYNC WRAPPER WITH LLM PREPROCESSING
// =============================================================================

/**
 * Async version that runs LLM preprocessing before building trees
 * @param {Array} allSpells - All spells to build trees for
 * @param {Object} schoolConfigs - Per-school configurations
 * @param {Object} treeGeneration - Tree generation settings
 * @param {Function} callback - Called with tree data when complete
 */
function buildAllTreesSettingsAwareAsync(allSpells, schoolConfigs, treeGeneration, callback) {
    var llmSettings = treeGeneration.llm || (settings.treeGeneration && settings.treeGeneration.llm);

    // Check if LLM preprocessing is needed
    var needsLLMPreprocessing = llmSettings && llmSettings.enabled && (
        llmSettings.elementDetection ||
        llmSettings.themeDiscovery ||
        llmSettings.keywordExpansion
    );

    if (needsLLMPreprocessing && typeof preprocessSpellsWithLLM === 'function') {
        console.log('[SettingsAwareBuilder] Running LLM preprocessing...');

        preprocessSpellsWithLLM(allSpells, function() {
            console.log('[SettingsAwareBuilder] LLM preprocessing complete, building trees...');
            var result = buildAllTreesSettingsAware(allSpells, schoolConfigs, treeGeneration);
            if (callback) callback(result);
        });
    } else {
        // No LLM preprocessing needed, build synchronously
        var result = buildAllTreesSettingsAware(allSpells, schoolConfigs, treeGeneration);
        if (callback) callback(result);
    }
}

// =============================================================================
// EXPORTS
// =============================================================================

window.SettingsAwareTreeBuilder = {
    version: SETTINGS_AWARE_BUILDER_VERSION,
    buildSchoolTree: buildSchoolTree,
    buildAllTrees: buildAllTreesSettingsAware,
    buildAllTreesAsync: buildAllTreesSettingsAwareAsync,
    scoreEdge: _scoreEdge,
    detectSpellElement: _detectSpellElement,
    hasElementConflict: _hasElementConflict
};

// Also export for direct use
window.buildAllTreesSettingsAware = buildAllTreesSettingsAware;
window.buildAllTreesSettingsAwareAsync = buildAllTreesSettingsAwareAsync;

console.log('[SettingsAwareBuilder] Module loaded v' + SETTINGS_AWARE_BUILDER_VERSION);
