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

window.discoverThemes = discoverThemes;
window.buildProceduralSchoolTree = buildProceduralSchoolTree;
window.buildProceduralTrees = buildProceduralTrees;
