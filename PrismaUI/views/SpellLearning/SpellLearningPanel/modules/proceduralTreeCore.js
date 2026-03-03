/**
 * Procedural Tree Builder - Core Algorithms
 *
 * Theme discovery, spell grouping, tree building, and grid-based positioning.
 *
 * Depends on:
 * - modules/proceduralTreeConfig.js (PROCEDURAL_CONFIG, VANILLA_ROOTS, STOP_WORDS)
 * - modules/state.js (state)
 */

// =============================================================================
// THEME DISCOVERY (Simplified TF-IDF using word frequency)
// =============================================================================

function extractSpellText(spell) {
    var parts = [];
    if (spell.name) parts.push(spell.name);
    if (spell.effectNames && Array.isArray(spell.effectNames)) {
        parts = parts.concat(spell.effectNames);
    }
    if (spell.effects && Array.isArray(spell.effects)) {
        spell.effects.forEach(function(effect) {
            if (effect.name) parts.push(effect.name);
            if (effect.description) parts.push(effect.description);
        });
    }
    if (spell.keywords && Array.isArray(spell.keywords)) {
        spell.keywords.forEach(function(kw) {
            var cleaned = kw.replace(/^Magic/, '').replace(/([A-Z])/g, ' $1').trim();
            parts.push(cleaned);
        });
    }
    return parts.join(' ').toLowerCase();
}

function discoverThemes(spells, topN) {
    topN = topN || PROCEDURAL_CONFIG.topThemesPerSchool;
    if (!spells || spells.length === 0) return [];

    var wordCounts = {};
    var docCounts = {};

    spells.forEach(function(spell) {
        var text = extractSpellText(spell);
        var words = text.match(/[a-z]{3,}/g) || [];
        var seenInDoc = {};

        words.forEach(function(word) {
            if (STOP_WORDS.indexOf(word) !== -1) return;
            wordCounts[word] = (wordCounts[word] || 0) + 1;
            if (!seenInDoc[word]) {
                seenInDoc[word] = true;
                docCounts[word] = (docCounts[word] || 0) + 1;
            }
        });
    });

    var scores = [];
    var totalDocs = spells.length;

    for (var word in wordCounts) {
        var tf = wordCounts[word];
        var df = docCounts[word];
        var idf = Math.log((totalDocs + 1) / (df + 1));
        var score = tf * idf;
        if (df >= 2 && df < totalDocs * 0.8) score *= 1.5;
        scores.push({ word: word, score: score, count: tf });
    }

    scores.sort(function(a, b) { return b.score - a.score; });
    return scores.slice(0, topN).map(function(s) { return s.word; });
}

function discoverThemesPerSchool(spells) {
    var schoolSpells = {};
    spells.forEach(function(spell) {
        var school = spell.school || 'Unknown';
        if (!school || school === 'null' || school === 'undefined' || school === 'None') {
            school = 'Hedge Wizard';
        }
        if (!schoolSpells[school]) schoolSpells[school] = [];
        schoolSpells[school].push(spell);
    });

    var schoolThemes = {};
    for (var school in schoolSpells) {
        schoolThemes[school] = discoverThemes(schoolSpells[school]);
        console.log('[Procedural] ' + school + ': themes = ' + schoolThemes[school].slice(0, 5).join(', '));
    }
    return schoolThemes;
}

// =============================================================================
// SPELL GROUPING
// =============================================================================

function calculateThemeScore(spell, theme) {
    var text = extractSpellText(spell);
    var name = (spell.name || '').toLowerCase();
    var score = 0;

    if (text.indexOf(theme) !== -1) score += 40;
    if (name.indexOf(theme) !== -1) score += 50;

    var words = text.match(/[a-z]+/g) || [];
    words.forEach(function(word) {
        if (word.indexOf(theme) !== -1 || theme.indexOf(word) !== -1) score += 15;
    });

    if (name.indexOf(theme) === 0) score += 20;
    return Math.min(100, score);
}

function groupSpellsByThemes(spells, themes) {
    var groups = {};
    themes.forEach(function(theme) { groups[theme] = []; });
    groups['_unassigned'] = [];

    spells.forEach(function(spell) {
        var bestTheme = '_unassigned';
        var bestScore = 0;

        themes.forEach(function(theme) {
            var score = calculateThemeScore(spell, theme);
            if (score > bestScore) {
                bestScore = score;
                bestTheme = theme;
            }
        });

        if (bestScore >= PROCEDURAL_CONFIG.minThemeScore) {
            groups[bestTheme].push(spell);
        } else {
            groups['_unassigned'].push(spell);
        }
    });
    return groups;
}

// =============================================================================
// TREE BUILDING
// =============================================================================

function TreeNode(spell) {
    this.spell = spell;
    this.formId = spell.formId;
    this.name = spell.name || spell.formId;
    this.tier = spell.skillLevel || 'Unknown';
    this.children = [];
    this.prerequisites = [];
    this.depth = 0;
    this.theme = null;
}

TreeNode.prototype.toDict = function() {
    return {
        formId: this.formId,
        children: this.children.slice(),
        prerequisites: this.prerequisites.slice(),
        tier: this.depth + 1
    };
};

function getTierIndex(tier) {
    var idx = PROCEDURAL_CONFIG.tierOrder.indexOf(tier);
    return idx >= 0 ? idx : PROCEDURAL_CONFIG.tierOrder.length;
}

function sortByTier(spells) {
    return spells.slice().sort(function(a, b) {
        return getTierIndex(a.skillLevel) - getTierIndex(b.skillLevel);
    });
}

function selectRoot(schoolName, spells) {
    var spellIds = {};
    spells.forEach(function(s) { spellIds[s.formId] = s; });

    if (PROCEDURAL_CONFIG.preferVanillaRoots && VANILLA_ROOTS[schoolName]) {
        if (spellIds[VANILLA_ROOTS[schoolName]]) return VANILLA_ROOTS[schoolName];
    }

    for (var i = 0; i < spells.length; i++) {
        var spell = spells[i];
        if (spell.formId.indexOf('0x00') === 0 && spell.skillLevel === 'Novice') {
            return spell.formId;
        }
    }

    for (var i = 0; i < spells.length; i++) {
        if (spells[i].skillLevel === 'Novice') return spells[i].formId;
    }

    return spells[0].formId;
}

function buildProceduralSchoolTree(schoolName, spells, themes) {
    if (!spells || spells.length === 0) return null;
    console.log('[Procedural] Building ' + schoolName + ' with ' + spells.length + ' spells');

    var nodes = {};
    spells.forEach(function(spell) {
        var node = new TreeNode(spell);
        var bestTheme = '_unassigned';
        var bestScore = 0;
        themes.forEach(function(theme) {
            var score = calculateThemeScore(spell, theme);
            if (score > bestScore) { bestScore = score; bestTheme = theme; }
        });
        node.theme = bestScore >= PROCEDURAL_CONFIG.minThemeScore ? bestTheme : '_unassigned';
        nodes[node.formId] = node;
    });

    var rootId = selectRoot(schoolName, spells);
    if (!nodes[rootId]) return null;

    var rootNode = nodes[rootId];
    rootNode.depth = 0;

    var grouped = groupSpellsByThemes(spells, themes);
    var connected = {};
    connected[rootId] = true;

    var availableParents = {};
    availableParents[0] = [rootNode];

    var sortedThemes = Object.keys(grouped).sort(function(a, b) {
        return (grouped[b] || []).length - (grouped[a] || []).length;
    });

    sortedThemes.forEach(function(theme) {
        if (theme === '_unassigned') return;
        var themeSpells = sortByTier(grouped[theme] || []);
        var themeParent = null;

        themeSpells.forEach(function(spell) {
            if (connected[spell.formId]) { themeParent = nodes[spell.formId]; return; }

            var node = nodes[spell.formId];
            var tierDepth = getTierIndex(node.tier);
            var parent = findParent(node, themeParent, availableParents, tierDepth, theme);

            if (parent) {
                linkNodes(parent, node);
                connected[node.formId] = true;
                if (node.children.length < PROCEDURAL_CONFIG.maxChildrenPerNode) {
                    if (!availableParents[node.depth]) availableParents[node.depth] = [];
                    availableParents[node.depth].push(node);
                }
                themeParent = node;
                if (tierDepth >= PROCEDURAL_CONFIG.convergenceAtTier) {
                    maybeAddConvergence(node, availableParents, connected, nodes);
                }
            }
        });
    });

    var unassigned = sortByTier(grouped['_unassigned'] || []);
    unassigned.forEach(function(spell) {
        if (connected[spell.formId]) return;
        var node = nodes[spell.formId];
        var tierDepth = getTierIndex(node.tier);
        var parent = findParent(node, null, availableParents, tierDepth, '_unassigned');
        if (parent) {
            linkNodes(parent, node);
            connected[node.formId] = true;
            if (node.children.length < PROCEDURAL_CONFIG.maxChildrenPerNode) {
                if (!availableParents[node.depth]) availableParents[node.depth] = [];
                availableParents[node.depth].push(node);
            }
        }
    });

    connectOrphans(rootNode, nodes, connected);

    var nodeList = [];
    for (var formId in nodes) nodeList.push(nodes[formId].toDict());

    return { root: rootId, layoutStyle: 'radial', nodes: nodeList };
}

function findParent(node, preferredParent, availableParents, targetDepth, theme) {
    if (preferredParent && preferredParent.children.length < PROCEDURAL_CONFIG.maxChildrenPerNode) {
        return preferredParent;
    }

    var searchDepths = [targetDepth - 1, targetDepth - 2, targetDepth];
    for (var i = 0; i < searchDepths.length; i++) {
        var depth = searchDepths[i];
        if (depth < 0) continue;
        var candidates = (availableParents[depth] || []).filter(function(p) {
            return p.children.length < PROCEDURAL_CONFIG.maxChildrenPerNode;
        });
        if (candidates.length === 0) continue;

        var sameTheme = candidates.filter(function(p) { return p.theme === theme; });
        if (sameTheme.length > 0) {
            sameTheme.sort(function(a, b) { return a.children.length - b.children.length; });
            return sameTheme[0];
        }
        candidates.sort(function(a, b) { return a.children.length - b.children.length; });
        return candidates[0];
    }

    for (var depth in availableParents) {
        var candidates = (availableParents[depth] || []).filter(function(p) {
            return p.children.length < PROCEDURAL_CONFIG.maxChildrenPerNode;
        });
        if (candidates.length > 0) {
            candidates.sort(function(a, b) { return a.children.length - b.children.length; });
            return candidates[0];
        }
    }
    return null;
}

function linkNodes(parent, child) {
    parent.children.push(child.formId);
    child.prerequisites.push(parent.formId);
    child.depth = parent.depth + 1;
}

function maybeAddConvergence(node, availableParents, connected, nodes) {
    if (Math.random() > PROCEDURAL_CONFIG.convergenceChance) return;
    if (node.prerequisites.length >= 2) return;

    for (var depth = node.depth - 1; depth >= 0; depth--) {
        var candidates = (availableParents[depth] || []).filter(function(p) {
            return p.theme !== node.theme && node.prerequisites.indexOf(p.formId) === -1 && connected[p.formId];
        });
        if (candidates.length > 0) {
            var extraPrereq = candidates[Math.floor(Math.random() * candidates.length)];
            node.prerequisites.push(extraPrereq.formId);
            extraPrereq.children.push(node.formId);
            console.log('[Procedural] Convergence: ' + node.name + ' now requires ' + extraPrereq.name);
            return;
        }
    }
}

function connectOrphans(rootNode, nodes, connected) {
    var orphans = [];
    for (var formId in nodes) {
        if (!connected[formId]) orphans.push(nodes[formId]);
    }
    if (orphans.length > 0) console.log('[Procedural] Connecting ' + orphans.length + ' orphan nodes');

    orphans = sortByTier(orphans.map(function(n) { return n.spell; }));
    orphans.forEach(function(spell) {
        var orphanNode = nodes[spell.formId];
        var tierDepth = getTierIndex(orphanNode.tier);
        var bestParent = null;

        for (var formId in nodes) {
            if (!connected[formId]) continue;
            var node = nodes[formId];
            if (node.children.length >= PROCEDURAL_CONFIG.maxChildrenPerNode) continue;
            if (node.depth > tierDepth) continue;
            if (!bestParent || node.children.length < bestParent.children.length) bestParent = node;
        }
        if (!bestParent) bestParent = rootNode;

        linkNodes(bestParent, orphanNode);
        connected[orphanNode.formId] = true;
    });
}

// =============================================================================
// MAIN API - JAVASCRIPT VERSION
// =============================================================================

function buildProceduralTrees(spells) {
    spells = filterBlacklistedSpells(spells);
    spells = filterWhitelistedSpells(spells);
    console.log('[Procedural] Building trees for ' + spells.length + ' spells');
    var startTime = Date.now();

    var schoolSpells = {};
    spells.forEach(function(spell) {
        var school = spell.school || 'Unknown';
        if (!school || school === 'null' || school === 'undefined' || school === 'None' || school === '') {
            school = 'Hedge Wizard';
        }
        if (!schoolSpells[school]) schoolSpells[school] = [];
        schoolSpells[school].push(spell);
    });

    var allThemes = discoverThemesPerSchool(spells);

    var output = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        generator: 'Procedural (JavaScript)',
        schools: {}
    };

    var totalNodes = 0;
    for (var schoolName in schoolSpells) {
        var themes = allThemes[schoolName] || [];
        var schoolTree = buildProceduralSchoolTree(schoolName, schoolSpells[schoolName], themes);
        if (schoolTree) {
            output.schools[schoolName] = schoolTree;
            totalNodes += schoolTree.nodes.length;
        }
    }

    var elapsed = Date.now() - startTime;
    console.log('[Procedural] Built ' + Object.keys(output.schools).length + ' schools, ' +
                totalNodes + ' nodes in ' + elapsed + 'ms');

    return output;
}

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
                while (attempts < 10 && hasOverlap(x, y, placedPositions, minSpacing)) {
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

                // Check spatial distance
                var dx = nodeA.x - nodeB.x;
                var dy = nodeA.y - nodeB.y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > altPathConfig.maxSpatialDistance) return;

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

    edges.forEach(function(e) {
        var fromNode = nodeById[e.from];
        var toNode = nodeById[e.to];

        if (fromNode && toNode) {
            if (fromNode.children.indexOf(e.to) === -1) {
                fromNode.children.push(e.to);
            }
            if (toNode.prerequisites.indexOf(e.from) === -1) {
                toNode.prerequisites.push(e.from);
            }
        }
    });
}

/**
 * Check if a position overlaps with any placed positions
 */
function hasOverlap(x, y, placedPositions, minSpacing) {
    for (var i = 0; i < placedPositions.length; i++) {
        var p = placedPositions[i];
        var dx = x - p.x;
        var dy = y - p.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minSpacing) return true;
    }
    return false;
}

window.discoverThemes = discoverThemes;
window.buildProceduralSchoolTree = buildProceduralSchoolTree;
window.buildProceduralTrees = buildProceduralTrees;
