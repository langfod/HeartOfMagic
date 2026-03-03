/**
 * settingsAwareCore.js - Core scoring, edge creation, and tree setup
 * for the SettingsAwareTreeBuilder system.
 *
 * Depends on: edgeScoring.js, shapeProfiles.js, growthBehaviors.js (optional)
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

var SETTINGS_AWARE_BUILDER_VERSION = '2.1.0';  // Updated with growthBehaviors integration

// =============================================================================
// USE UNIFIED EDGE SCORING MODULE
// =============================================================================

// These functions are now provided by edgeScoring.js
// The globals detectSpellElement, hasElementConflict, hasSameElement,
// getSpellTier, and scoreEdge are available from that module.

// Verify EdgeScoring module is loaded
if (typeof EdgeScoring === 'undefined') {
    console.warn('[SettingsAwareBuilder] EdgeScoring module not loaded, using fallbacks');
}

// Local aliases with fallbacks for backwards compatibility
var _detectSpellElement = typeof detectSpellElement === 'function'
    ? detectSpellElement
    : function(spell) {
        if (!spell) return null;
        var text = (spell.name || '').toLowerCase();
        if (text.indexOf('fire') >= 0 || text.indexOf('flame') >= 0) return 'fire';
        if (text.indexOf('frost') >= 0 || text.indexOf('ice') >= 0) return 'frost';
        if (text.indexOf('shock') >= 0 || text.indexOf('lightning') >= 0) return 'shock';
        return null;
    };

var _hasElementConflict = typeof hasElementConflict === 'function'
    ? hasElementConflict
    : function(spell1, spell2) {
        var e1 = _detectSpellElement(spell1);
        var e2 = _detectSpellElement(spell2);
        return e1 && e2 && e1 !== e2;
    };

var _hasSameElement = typeof hasSameElement === 'function'
    ? hasSameElement
    : function(spell1, spell2) {
        var e1 = _detectSpellElement(spell1);
        var e2 = _detectSpellElement(spell2);
        return e1 && e2 && e1 === e2;
    };

var _getSpellTier = typeof getSpellTier === 'function'
    ? getSpellTier
    : function(spell) {
        if (!spell) return 0;
        var level = spell.skillLevel || spell.tier || 0;
        // Handle string tier names (e.g. "Expert", "Novice")
        if (typeof level === 'string') {
            var lower = level.toLowerCase();
            var tierNames = { 'novice': 0, 'apprentice': 1, 'adept': 2, 'expert': 3, 'master': 4 };
            for (var name in tierNames) {
                if (lower.indexOf(name) >= 0) return tierNames[name];
            }
        }
        // Handle numeric skill levels
        if (typeof level === 'number') {
            if (level < 25) return 0;
            if (level < 50) return 1;
            if (level < 75) return 2;
            if (level < 100) return 3;
            return 4;
        }
        return 0;
    };

// =============================================================================
// CORE SCORING FUNCTION - Uses EdgeScoring module when available
// =============================================================================

/**
 * Score a potential edge between two spells.
 * Delegates to EdgeScoring module if available, otherwise uses local logic.
 *
 * @param {Object} fromSpell - Source spell (prerequisite)
 * @param {Object} toSpell - Target spell (depends on source)
 * @param {Object} settings - Tree generation settings
 * @returns {number} - Score (negative = forbidden, 0 = neutral, positive = good)
 */
function _scoreEdge(fromSpell, toSpell, settings) {
    // Use EdgeScoring module if available
    if (typeof EdgeScoring !== 'undefined' && typeof EdgeScoring.scoreEdge === 'function') {
        return EdgeScoring.scoreEdge(fromSpell, toSpell, settings);
    }

    // Fallback: local implementation
    var score = 0;
    settings = settings || {};

    // =================================================================
    // ELEMENT ISOLATION - HIGHEST PRIORITY
    // =================================================================
    var elementConflict = _hasElementConflict(fromSpell, toSpell);
    var sameElement = _hasSameElement(fromSpell, toSpell);

    if (elementConflict) {
        if (settings.elementIsolationStrict) {
            // STRICT MODE: Cross-element is FORBIDDEN
            return -10000;
        } else if (settings.elementIsolation) {
            // NORMAL MODE: Heavy penalty
            score -= 500;
        }
    }

    // Same element bonus (only if elementMatching scoring is enabled)
    var useElementScoring = !settings.scoring || settings.scoring.elementMatching !== false;
    if (sameElement && useElementScoring) {
        score += 100;
    }

    // =================================================================
    // TIER ORDERING
    // =================================================================
    var fromTier = _getSpellTier(fromSpell);
    var toTier = _getSpellTier(toSpell);
    var tierDiff = toTier - fromTier;

    if (settings.strictTierOrdering) {
        // Must go from lower to higher tier
        if (tierDiff < 0) {
            return -5000;  // Forbidden: can't go backwards
        }
        if (tierDiff === 0 && !settings.allowSameTierLinks) {
            return -5000;  // Forbidden: same tier not allowed
        }
    }

    // Prefer adjacent tiers
    if (tierDiff === 1) {
        score += 50;  // Perfect progression
    } else if (tierDiff === 0) {
        score += 20;  // Same tier (if allowed)
    } else if (tierDiff > 0) {
        score += Math.max(0, 30 - tierDiff * 10);  // Skip penalty
    }

    // =================================================================
    // THEMATIC MATCHING (if enabled)
    // =================================================================
    if (settings.scoring && settings.scoring.themeCoherence !== false) {
        // Check for shared keywords beyond elements
        var fromText = (fromSpell.name || '').toLowerCase();
        var toText = (toSpell.name || '').toLowerCase();

        // Shared word fragments
        var fromWords = fromText.split(/[^a-z]+/).filter(function(w) { return w.length > 3; });
        var toWords = toText.split(/[^a-z]+/).filter(function(w) { return w.length > 3; });

        var sharedWords = 0;
        fromWords.forEach(function(w) {
            if (toWords.indexOf(w) >= 0) sharedWords++;
        });

        score += sharedWords * 30;
    }

    return score;
}

// =============================================================================
// EDGE CREATION GATE - THE SINGLE ENTRY POINT
// =============================================================================

/**
 * Attempt to create an edge. Returns true if edge was created.
 * This is THE ONLY function that adds edges to the tree.
 *
 * @param {Object} fromNode - Source node
 * @param {Object} toNode - Target node
 * @param {Array} edges - Edge array to add to
 * @param {Object} settings - Tree generation settings
 * @param {Object} existingEdges - Set of existing edge keys
 * @param {string} edgeType - Type of edge ('primary', 'prerequisite', 'alternate')
 * @returns {boolean} - True if edge was created
 */
function tryCreateEdge(fromNode, toNode, edges, settings, existingEdges, edgeType) {
    // Check for duplicate
    var key = fromNode.formId + '->' + toNode.formId;
    if (existingEdges[key]) return false;

    // Score the edge
    var edgeScore = _scoreEdge(fromNode.spell, toNode.spell, settings);

    // Reject if score is negative (forbidden by settings)
    if (edgeScore < 0) {
        return false;
    }

    // Create the edge
    edges.push({
        from: fromNode.formId,
        to: toNode.formId,
        type: edgeType || 'primary',
        score: edgeScore
    });

    existingEdges[key] = true;
    return true;
}

// =============================================================================
// GROWTH BEHAVIOR INTEGRATION
// =============================================================================

/**
 * Get the growth behavior for a school
 * @param {string} schoolName - School name
 * @param {Object} schoolConfig - Optional school config with custom behavior
 * @returns {Object|null} - Growth behavior profile or null
 */
function _getSchoolBehavior(schoolName, schoolConfig) {
    // Check if growthBehaviors module is loaded
    if (typeof GROWTH_BEHAVIORS === 'undefined') {
        return null;
    }

    // Try to get custom behavior from school config
    if (schoolConfig && schoolConfig.growthBehavior && GROWTH_BEHAVIORS[schoolConfig.growthBehavior]) {
        return GROWTH_BEHAVIORS[schoolConfig.growthBehavior];
    }

    // Try to get default behavior for this school
    if (typeof SCHOOL_DEFAULT_BEHAVIORS !== 'undefined' && SCHOOL_DEFAULT_BEHAVIORS[schoolName]) {
        return GROWTH_BEHAVIORS[SCHOOL_DEFAULT_BEHAVIORS[schoolName]];
    }

    // Return first behavior as fallback (organic-like)
    return GROWTH_BEHAVIORS.gentle_bloom || null;
}

/**
 * Get behavior parameters at a given progress point
 * @param {Object} behavior - Growth behavior profile
 * @param {number} progress - Progress through tree (0-1)
 * @returns {Object} - Merged parameters with phase overrides
 */
function _getBehaviorParams(behavior, progress) {
    if (!behavior) return null;

    // Use growthBehaviors.js getActiveParameters if available
    if (typeof getActiveParameters === 'function') {
        return getActiveParameters(behavior, progress);
    }

    // Fallback: return base behavior without phase changes
    return behavior;
}

// =============================================================================
// SEEDED RANDOM
// =============================================================================

/**
 * Simple seeded random number generator
 */
function createSeededRandom(seed) {
    var m = 0x80000000;
    var a = 1103515245;
    var c = 12345;
    var state = seed || Date.now();

    return function() {
        state = (a * state + c) % m;
        return state / m;
    };
}

// =============================================================================
// TREE SETUP AND ROOT CONFIGURATION
// =============================================================================

/**
 * Set up the initial tree context: create nodes, compute tiers,
 * configure roots. Called by buildSchoolTree before Phase 1/Phase 2.
 * @returns {Object} - Context object with nodes, edges, settings, etc.
 */
function _setupSchoolTreeContext(spells, settings, seed, schoolName, schoolConfig, nlpData) {
    console.log('[SettingsAwareBuilder] Building tree with', spells.length, 'spells for', schoolName || 'Unknown');
    console.log('[SettingsAwareBuilder] Settings:',
                'elementIsolation=' + settings.elementIsolation,
                'strict=' + settings.elementIsolationStrict,
                'tierOrdering=' + settings.strictTierOrdering);

    // NLP data for smart routing
    nlpData = nlpData || {};
    var nlpThemes = nlpData.themes || {};
    var nlpSimilarity = nlpData.similarity_scores || {};
    var nlpGroups = nlpData.groups || {};

    // Build spell-to-theme lookup from NLP data
    var spellThemeMap = {};
    for (var themeName in nlpThemes) {
        var themeSpells = nlpThemes[themeName];
        if (Array.isArray(themeSpells)) {
            themeSpells.forEach(function(spellId) {
                spellThemeMap[spellId] = themeName;
            });
        }
    }
    if (Object.keys(spellThemeMap).length > 0) {
        console.log('[SettingsAwareBuilder] Using NLP themes for', Object.keys(spellThemeMap).length, 'spells');
    }

    var rng = createSeededRandom(seed);
    var nodes = [];
    var edges = [];
    var existingEdges = {};
    var stats = {
        totalEdges: 0,
        rejectedCrossElement: 0,
        rejectedTierOrder: 0,
        hubsCreated: 0
    };

    if (spells.length === 0) {
        return { empty: true, result: { nodes: [], links: [], root: null, stats: stats } };
    }

    // Get growth behavior for this school (if available)
    var behavior = _getSchoolBehavior(schoolName, schoolConfig);
    if (behavior) {
        console.log('[SettingsAwareBuilder] Using growth behavior:', behavior.name || 'default');
    }

    // Check for GROWTH_DSL recipe (overrides some settings)
    if (typeof getSchoolRecipe === 'function') {
        var dslRecipe = getSchoolRecipe(schoolName);
        if (dslRecipe) {
            console.log('[SettingsAwareBuilder] Found DSL recipe for', schoolName);
            // Merge recipe settings with provided settings (recipe fills gaps)
            if (typeof mergeRecipeSettings === 'function') {
                settings = mergeRecipeSettings(settings, dslRecipe, false);
            }
        }
    }

    // Sort spells by tier
    var sortedSpells = spells.slice().sort(function(a, b) {
        return _getSpellTier(a) - _getSpellTier(b);
    });

    // Find root (first novice spell)
    var rootSpell = sortedSpells.find(function(s) { return _getSpellTier(s) === 0; }) || sortedSpells[0];

    // Create nodes
    spells.forEach(function(spell, idx) {
        nodes.push({
            formId: spell.formId,
            name: spell.name,
            spell: spell,
            tier: _getSpellTier(spell),
            element: _detectSpellElement(spell),
            isRoot: spell.formId === rootSpell.formId,
            isHub: false,
            prerequisites: [],
            children: [],
            x: 0,  // Placeholder - will be set by LayoutEngine
            y: 0   // Placeholder - will be set by LayoutEngine
        });
    });

    // Build node lookup
    var nodeByFormId = {};
    nodes.forEach(function(n) { nodeByFormId[n.formId] = n; });

    // Group nodes by tier
    var nodesByTier = {};
    nodes.forEach(function(n) {
        if (!nodesByTier[n.tier]) nodesByTier[n.tier] = [];
        nodesByTier[n.tier].push(n);
    });

    var tierNums = Object.keys(nodesByTier).map(Number).sort(function(a, b) { return a - b; });

    // Get maxChildrenPerNode EARLY - needed by root config phase
    var maxChildrenPerNode = settings.maxChildrenPerNode || 5;
    if (behavior && behavior.branchingFactor && (settings.rootCount || 1) <= 1) {
        // Only apply branchingFactor boost for single-root mode
        maxChildrenPerNode = Math.max(maxChildrenPerNode, Math.ceil(behavior.branchingFactor * 1.5));
    }
    var baseMaxChildren = maxChildrenPerNode; // Save non-boosted value
    // Only apply strict mode boost for single-root mode
    // Multi-root mode keeps tighter branching since roots handle their own elements
    if (settings.elementIsolationStrict && (settings.rootCount || 1) <= 1) {
        var _elemCounts = {};
        nodes.forEach(function(n) {
            var e = n.element || 'unknown';
            _elemCounts[e] = (_elemCounts[e] || 0) + 1;
        });
        var _maxElemCount = Math.max.apply(null, Object.values(_elemCounts));
        var strictMaxChildren = Math.min(Math.max(maxChildrenPerNode, Math.ceil(_maxElemCount / 5)), 15);
        console.log('[SettingsAwareBuilder] Strict mode (single root): boosting maxChildren from', maxChildrenPerNode, 'to', strictMaxChildren);
        maxChildrenPerNode = strictMaxChildren;
    }
    console.log('[SettingsAwareBuilder] maxChildrenPerNode:', maxChildrenPerNode, '(base:', baseMaxChildren + ')');

    // === ROOT CONFIGURATION ===
    var rootCount = settings.rootCount || 1;
    var tier0Nodes = nodesByTier[0] || [];

    console.log('[SettingsAwareBuilder] Root count setting:', rootCount, '(tier-0 nodes:', tier0Nodes.length + ')');

    // Discover unique elements in tier-0
    var tier0Elements = {};
    tier0Nodes.forEach(function(node) {
        var elem = node.element || 'unknown';
        if (!tier0Elements[elem]) {
            tier0Elements[elem] = node;
        }
    });

    if (rootCount <= 1) {
        // === SINGLE ROOT MODE ===
        if (settings.elementIsolationStrict) {
            var elementRoots = Object.values(tier0Elements);
            var mainRoot = nodes.find(function(n) { return n.isRoot; });
            console.log('[SettingsAwareBuilder] Single root + strict: main root is', mainRoot.name, '(' + (mainRoot.element || 'unknown') + ')');

            elementRoots.forEach(function(elementRoot) {
                if (elementRoot === mainRoot) {
                    elementRoot.isElementRoot = true;
                    return;
                }
                edges.push({ from: mainRoot.formId, to: elementRoot.formId, type: 'element-root' });
                existingEdges[mainRoot.formId + '->' + elementRoot.formId] = true;
                elementRoot.prerequisites.push(mainRoot.formId);
                mainRoot.children.push(elementRoot.formId);
                elementRoot.isElementRoot = true;
                stats.totalEdges++;
            });

            tier0Nodes.forEach(function(node) {
                if (node.isRoot || node.isElementRoot) return;
                var elem = node.element || 'unknown';
                var elementRoot = tier0Elements[elem];
                if (elementRoot && elementRoot !== node) {
                    edges.push({ from: elementRoot.formId, to: node.formId, type: 'element-sibling' });
                    existingEdges[elementRoot.formId + '->' + node.formId] = true;
                    node.prerequisites.push(elementRoot.formId);
                    elementRoot.children.push(node.formId);
                    stats.totalEdges++;
                }
            });
        }
    } else {
        // === MULTIPLE ROOTS MODE (rootCount > 1) ===

        // Count spells per element across ALL tiers
        var elementCounts = {};
        nodes.forEach(function(n) {
            var elem = n.element || 'unknown';
            elementCounts[elem] = (elementCounts[elem] || 0) + 1;
        });

        // Only consider real detected elements (exclude null/unknown)
        var availableElements = Object.keys(tier0Elements).filter(function(elem) {
            return elem !== 'unknown';
        });
        availableElements.sort(function(a, b) {
            return (elementCounts[b] || 0) - (elementCounts[a] || 0);
        });

        // Fallback if no real elements
        if (availableElements.length === 0) {
            availableElements = Object.keys(tier0Elements);
            console.log('[SettingsAwareBuilder] No real elements, using all:', availableElements.join(', '));
        }

        var selectedElements = availableElements.slice(0, rootCount);
        var selectedSet = {};
        selectedElements.forEach(function(elem) { selectedSet[elem] = true; });

        console.log('[SettingsAwareBuilder] Multiple roots: top', selectedElements.length, 'elements:', selectedElements.map(function(e) { return e + '(' + (elementCounts[e] || 0) + ')'; }).join(', '));

        // --- STEP 1: Pick best tier-0 spell for each selected element ---
        // Prefer vanilla spells (lower plugin index in formId = earlier in load order)
        function _getPluginIndexFromFormId(formId) {
            if (!formId || typeof formId !== 'string') return 999;
            var hex = formId.replace('0x', '').replace('0X', '');
            while (hex.length < 8) hex = '0' + hex;
            return parseInt(hex.substring(0, 2), 16);
        }

        var rootNodes = [];
        selectedElements.forEach(function(elem) {
            var candidates = tier0Nodes.filter(function(n) {
                return (n.element || 'unknown') === elem;
            });

            // Sort: prefer lower plugin index (vanilla/DLC first), then shorter name (more canonical)
            candidates.sort(function(a, b) {
                var aPlugin = _getPluginIndexFromFormId(a.formId);
                var bPlugin = _getPluginIndexFromFormId(b.formId);
                if (aPlugin !== bPlugin) return aPlugin - bPlugin;
                // Shorter name = more likely canonical (e.g., "Sparks" vs "Lightning Cloak Drain")
                var aLen = (a.name || '').length;
                var bLen = (b.name || '').length;
                if (aLen !== bLen) return aLen - bLen;
                return (a.name || '').localeCompare(b.name || '');
            });

            var picked = candidates[0] || tier0Elements[elem];
            rootNodes.push(picked);
            console.log('[SettingsAwareBuilder] Root for ' + elem + ': ' + picked.name + ' (formId=' + picked.formId + ', plugin=' + _getPluginIndexFromFormId(picked.formId) + ', of ' + candidates.length + ' candidates)');
        });

        // --- STEP 2: Unmark all existing roots, mark new roots ---
        nodes.forEach(function(n) { n.isRoot = false; });
        rootNodes.forEach(function(rootNode) {
            rootNode.isRoot = true;
            rootNode.isElementRoot = true;
            // Ensure roots have clean state
            rootNode.prerequisites = [];
            rootNode.children = [];
        });

        // --- STEP 3: Distribute tier-0 non-root nodes across roots (balanced) ---
        // Collect non-root tier-0 nodes
        var tier0Remaining = tier0Nodes.filter(function(n) { return !n.isRoot; });

        // Sort: same-element nodes first (they get priority to their element root)
        tier0Remaining.sort(function(a, b) {
            var aMatch = selectedSet[a.element || 'unknown'] ? 0 : 1;
            var bMatch = selectedSet[b.element || 'unknown'] ? 0 : 1;
            return aMatch - bMatch;
        });

        // Build parent pool: starts with roots, grows as nodes get connected
        // Use baseMaxChildren (non-boosted) to keep tree spread out
        var tier0MaxChildren = baseMaxChildren;
        var parentPool = rootNodes.slice(); // Copy

        console.log('[SettingsAwareBuilder] Distributing', tier0Remaining.length, 'tier-0 nodes (maxChildren=' + tier0MaxChildren + ')');

        tier0Remaining.forEach(function(node) {
            var nodeElem = node.element || 'unknown';

            // Find best parent from pool that has capacity
            var bestParent = null;
            var bestScore = -Infinity;

            parentPool.forEach(function(parent) {
                if (parent.children.length >= tier0MaxChildren) return;

                // Scoring: prefer same-element root, then any root, then non-root with element match
                var score = 0;
                if (parent.isRoot && (parent.element || 'unknown') === nodeElem) {
                    score += 200; // Same element root - best match
                } else if ((parent.element || 'unknown') === nodeElem) {
                    score += 100; // Same element non-root
                } else if (parent.isRoot) {
                    score += 50;  // Different element root
                }
                // Add edge scoring for thematic match
                score += _scoreEdge(parent.spell, node.spell, settings);
                // Prefer parents with fewer children (load balance)
                score -= parent.children.length * 10;

                if (score > bestScore) {
                    bestScore = score;
                    bestParent = parent;
                }
            });

            if (!bestParent) {
                // All parents full - pick any parent from pool with fewest children
                var sorted = parentPool.slice().sort(function(a, b) {
                    return a.children.length - b.children.length;
                });
                bestParent = sorted[0];
            }

            // Connect node to parent
            edges.push({ from: bestParent.formId, to: node.formId, type: 'tier0-assign' });
            existingEdges[bestParent.formId + '->' + node.formId] = true;
            node.prerequisites.push(bestParent.formId);
            bestParent.children.push(node.formId);
            stats.totalEdges++;

            // Add this node to parent pool so future nodes can cascade through it
            parentPool.push(node);
        });

        // Log distribution
        rootNodes.forEach(function(r) {
            console.log('[SettingsAwareBuilder] Root "' + r.name + '" [' + r.element + ']: ' + r.children.length + ' direct children');
        });
    }

    // Return context for Phase 1 and Phase 2
    return {
        empty: false,
        nodes: nodes,
        edges: edges,
        existingEdges: existingEdges,
        stats: stats,
        nodeByFormId: nodeByFormId,
        nodesByTier: nodesByTier,
        tierNums: tierNums,
        maxChildrenPerNode: maxChildrenPerNode,
        rng: rng,
        behavior: behavior,
        settings: settings,
        rootCount: rootCount,
        rootSpell: rootSpell
    };
}

console.log('[SettingsAwareCore] Module loaded v' + SETTINGS_AWARE_BUILDER_VERSION);

// Export globals for extension file (settingsAwareBuilder.js) in Node.js require() context
if (typeof window !== 'undefined') {
    window.SETTINGS_AWARE_BUILDER_VERSION = SETTINGS_AWARE_BUILDER_VERSION;
    window._scoreEdge = _scoreEdge;
    window.tryCreateEdge = tryCreateEdge;
    window._getSchoolBehavior = _getSchoolBehavior;
    window._getBehaviorParams = _getBehaviorParams;
    window.createSeededRandom = createSeededRandom;
    window._setupSchoolTreeContext = _setupSchoolTreeContext;
    window._detectSpellElement = _detectSpellElement;
    window._hasElementConflict = _hasElementConflict;
    window._hasSameElement = _hasSameElement;
    window._getSpellTier = _getSpellTier;
}
