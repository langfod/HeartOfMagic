/**
 * Visual-First Thematic Keyword Matching System
 *
 * Element/theme-based spell similarity and compatibility checking.
 * Depends on: (none - self-contained)
 */

// =============================================================================
// THEMATIC KEYWORD MATCHING SYSTEM
// =============================================================================

/**
 * Extract thematic keywords from spell name/effects for matching.
 * This helps ensure prerequisites make thematic sense.
 */
var THEMATIC_KEYWORDS = {
    // Element groups - spells with these keywords should prefer same-element prereqs
    frost: ['frost', 'ice', 'cold', 'freeze', 'frozen', 'blizzard', 'frostbite', 'chill', 'winter', 'glacial', 'snow'],
    fire: ['fire', 'flame', 'burn', 'inferno', 'blaze', 'fireball', 'incinerate', 'scorch', 'heat', 'ember', 'ignite', 'magma', 'lava'],
    shock: ['shock', 'lightning', 'thunder', 'spark', 'electric', 'storm', 'bolt', 'discharge', 'chain lightning', 'electr'],
    stone: ['stone', 'earth', 'rock', 'granite', 'mineral', 'ore', 'boulder', 'grasp', 'petrify', 'crystallize', 'mud', 'sand', 'gravel'],
    wind: ['wind', 'air', 'gust', 'breeze', 'tornado', 'cyclone', 'whirlwind', 'gale'],
    poison: ['poison', 'venom', 'toxic', 'disease', 'plague', 'rot', 'decay', 'corrupt', 'taint', 'blight'],
    nature: ['nature', 'plant', 'vine', 'thorn', 'root', 'tree', 'forest', 'bloom', 'growth', 'seed', 'leaf', 'spriggan'],
    water: ['water', 'wave', 'ocean', 'sea', 'tide', 'aqua', 'drown', 'flood', 'rain', 'mist'],
    // Magic type groups
    conjuration: ['summon', 'conjure', 'bound', 'atronach', 'zombie', 'thrall', 'familiar', 'raise', 'reanimate', 'dremora', 'daedra', 'necro'],
    restoration: ['heal', 'restore', 'ward', 'protection', 'cure', 'repel', 'turn', 'undead', 'sunfire', 'bane', 'blessing', 'divine'],
    illusion: ['invisible', 'calm', 'fear', 'fury', 'courage', 'muffle', 'clairvoyance', 'vision', 'frenzy', 'rally', 'pacify', 'phantom', 'shadow', 'dream'],
    alteration: ['flesh', 'armor', 'transmute', 'detect', 'paralyze', 'levitate', 'feather', 'candlelight', 'light', 'mass', 'telekinesis', 'equilibrium'],
    // Effect types
    trap: ['trap', 'rune', 'mine', 'glyph'],
    cloak: ['cloak'],
    wall: ['wall'],
    projectile: ['bolt', 'ball', 'spray', 'stream'],
    aoe: ['mass', 'circle', 'storm', 'nova', 'explosion', 'burst']
};

// =============================================================================
// UNIFIED TEXT EXTRACTION
// =============================================================================

/**
 * UNIFIED: Extract all searchable text from a spell.
 * This is the SINGLE source of truth for spell text extraction used by ALL fuzzy/NLP logic.
 * Includes: name, effectNames, effects (objects), and description.
 *
 * @param {Object} spell - Spell object
 * @returns {string} - Lowercase concatenated text from all spell data
 */
function extractSpellText(spell) {
    if (!spell) return '';

    var textParts = [];

    // Spell name (most important)
    if (spell.name) {
        textParts.push(spell.name.toLowerCase());
    }

    // Effect names (e.g., "Fire Storm 100", "Ice Spike", etc.)
    if (spell.effectNames && Array.isArray(spell.effectNames)) {
        spell.effectNames.forEach(function(eff) {
            if (eff) textParts.push(String(eff).toLowerCase());
        });
    }

    // Detailed effects (if provided as objects with name property)
    if (spell.effects && Array.isArray(spell.effects)) {
        spell.effects.forEach(function(eff) {
            if (eff && eff.name) textParts.push(eff.name.toLowerCase());
            if (eff && eff.effectName) textParts.push(eff.effectName.toLowerCase());
            if (eff && eff.description) textParts.push(eff.description.toLowerCase());
        });
    }

    // Description (critical for thematic matching)
    if (spell.description) {
        textParts.push(spell.description.toLowerCase());
    }

    return textParts.join(' ');
}

/**
 * UNIFIED: Extract keywords from spell text for grouping/branching.
 * Uses extractSpellText() for consistent data extraction.
 *
 * @param {Object} spell - Spell object
 * @param {Array} stopWords - Words to filter out
 * @returns {Array} - Array of keyword strings
 */
function extractSpellKeywords(spell, stopWords) {
    var text = extractSpellText(spell);
    if (!text) return [];

    stopWords = stopWords || [];

    return text.split(/[^a-z]+/).filter(function(w) {
        return w.length > 2 && stopWords.indexOf(w) < 0;
    });
}

// =============================================================================
// THEMATIC ANALYSIS FUNCTIONS
// =============================================================================

/**
 * Get thematic keywords for a spell based on its name, effects, and description.
 * Uses extractSpellText() for consistent data extraction.
 * @param {Object} spell - Spell object with name, effectNames, effects, description
 * @returns {Array} - Array of thematic group names this spell belongs to
 */
function getSpellThemes(spell) {
    var fullText = extractSpellText(spell);
    if (fullText.length === 0) return [];

    var themes = [];

    for (var group in THEMATIC_KEYWORDS) {
        var keywords = THEMATIC_KEYWORDS[group];
        for (var i = 0; i < keywords.length; i++) {
            if (fullText.indexOf(keywords[i]) !== -1) {
                themes.push(group);
                break; // Only add group once
            }
        }
    }

    return themes;
}

/**
 * Calculate thematic similarity between two spells
 * Elemental matches (fire-fire, frost-frost, shock-shock) get highest score.
 * @returns {number} 0-1 score (1 = perfect match)
 */
function calculateThematicSimilarity(spell1, spell2) {
    var themes1 = getSpellThemes(spell1);
    var themes2 = getSpellThemes(spell2);

    if (themes1.length === 0 || themes2.length === 0) {
        return 0.3; // Lower neutral score - prefer known themes
    }

    // Check for ELEMENTAL matches first (highest priority)
    var elements = ['fire', 'frost', 'shock'];
    var hasElementMatch = false;
    var hasElementConflict = false;

    var spell1Elements = themes1.filter(function(t) { return elements.indexOf(t) !== -1; });
    var spell2Elements = themes2.filter(function(t) { return elements.indexOf(t) !== -1; });

    if (spell1Elements.length > 0 && spell2Elements.length > 0) {
        // Both spells have elements - check if they match
        hasElementMatch = spell1Elements.some(function(e) {
            return spell2Elements.indexOf(e) !== -1;
        });

        if (!hasElementMatch) {
            // Different elements = conflict (fire vs frost = bad)
            hasElementConflict = true;
        }
    }

    // Elemental conflict = very low score
    if (hasElementConflict) {
        return 0.1;
    }

    // Elemental match = high score
    if (hasElementMatch) {
        return 0.9;
    }

    // Count all overlapping themes
    var overlap = 0;
    themes1.forEach(function(t) {
        if (themes2.indexOf(t) !== -1) overlap++;
    });

    // Score based on overlap ratio
    if (overlap === 0) {
        return 0.2; // No overlap but no element conflict
    }

    var maxThemes = Math.max(themes1.length, themes2.length);
    return 0.4 + (overlap / maxThemes) * 0.5; // 0.4-0.9 range for non-elemental matches
}

/**
 * Check if two spells are thematically compatible for prerequisite relationship
 * @returns {boolean} true if they share at least one theme or one has no themes
 */
function areThematicallyCompatible(spell1, spell2) {
    var themes1 = getSpellThemes(spell1);
    var themes2 = getSpellThemes(spell2);

    // If either has no detected themes, consider compatible (generic spell)
    if (themes1.length === 0 || themes2.length === 0) return true;

    // Check for any overlap
    for (var i = 0; i < themes1.length; i++) {
        if (themes2.indexOf(themes1[i]) !== -1) return true;
    }

    return false;
}

/**
 * Post-processing pass to fix thematically inconsistent prerequisites.
 * GENTLE VERSION: Only fixes ONE prereq per node, only when ALL prereqs are incompatible.
 * Uses spell name, effectNames, effects, and description for matching.
 *
 * @param {Array} positions - All positions with spell data
 * @param {Array} edges - All edges
 * @param {Function} rng - Seeded random
 * @returns {Object} - Stats about fixes made
 */
function fixThematicInconsistencies(positions, edges, rng) {
    var stats = { nodesChecked: 0, nodesFixed: 0, edgesRewired: 0 };

    // Build lookups
    var positionByFormId = {};
    positions.forEach(function(p) {
        if (p.spell) positionByFormId[p.spell.formId] = p;
    });

    // Build incoming edges map
    var incomingEdges = {};
    positions.forEach(function(p) {
        if (p.spell) incomingEdges[p.spell.formId] = [];
    });
    edges.forEach(function(e) {
        if (incomingEdges[e.to]) {
            incomingEdges[e.to].push(e);
        }
    });

    // Helper to get spell details for logging
    function getSpellDetails(spell) {
        var details = spell.name || 'Unknown';
        var themes = getSpellThemes(spell);
        if (themes.length > 0) {
            details += ' [' + themes.join(', ') + ']';
        }
        if (spell.effectNames && spell.effectNames.length > 0) {
            details += ' effects:(' + spell.effectNames.slice(0, 2).join(', ') + ')';
        }
        return details;
    }

    // Check each node
    positions.forEach(function(node) {
        if (!node.spell || node.isRoot) return;

        var formId = node.spell.formId;
        var nodeThemes = getSpellThemes(node.spell);

        // Skip if this spell has no clear themes (generic spells are fine with any prereqs)
        if (nodeThemes.length === 0) return;

        stats.nodesChecked++;

        var incoming = incomingEdges[formId] || [];
        if (incoming.length === 0) return;

        // Check if ANY prerequisite is thematically compatible
        var hasCompatiblePrereq = false;
        var worstIncompatibleEdge = null;
        var worstSimilarity = 1.0;

        incoming.forEach(function(edge) {
            if (!edge || !edge.from) return;
            var sourceNode = positionByFormId[edge.from];
            if (!sourceNode || !sourceNode.spell) return;

            var sim = calculateThematicSimilarity(node.spell, sourceNode.spell);

            if (sim >= 0.4) { // Compatible threshold
                hasCompatiblePrereq = true;
            } else if (sim < worstSimilarity) {
                worstSimilarity = sim;
                worstIncompatibleEdge = edge;
            }
        });

        // Only fix if ALL prereqs are incompatible
        if (hasCompatiblePrereq) return;
        if (!worstIncompatibleEdge) return;

        console.log('[ThematicFix] ' + getSpellDetails(node.spell) + ' has no compatible prereqs');
        console.log('[ThematicFix]   Current prereqs:');
        incoming.forEach(function(e) {
            var src = positionByFormId[e.from];
            if (src && src.spell) {
                var sim = calculateThematicSimilarity(node.spell, src.spell);
                console.log('[ThematicFix]     - ' + getSpellDetails(src.spell) + ' (sim: ' + sim.toFixed(2) + ')');
            }
        });

        // Find ONE better alternative from lower tiers
        var bestCandidate = null;
        var bestSimilarity = 0.3; // Minimum threshold
        var nodeRank = getSpellRank(node.spell);

        positions.forEach(function(p) {
            if (!p.spell || p.spell.formId === formId) return;
            if (p.tier >= node.tier) return; // Must be lower tier
            if (getSpellRank(p.spell) > nodeRank) return; // Must be same or weaker rank

            // Skip if already a prereq
            var isAlreadyPrereq = incoming.some(function(e) { return e.from === p.spell.formId; });
            if (isAlreadyPrereq) return;

            var sim = calculateThematicSimilarity(node.spell, p.spell);
            if (sim > bestSimilarity) {
                bestSimilarity = sim;
                bestCandidate = p;
            }
        });

        if (!bestCandidate) {
            console.log('[ThematicFix]   No better candidates found, keeping original prereqs');
            return;
        }

        console.log('[ThematicFix]   Best candidate: ' + getSpellDetails(bestCandidate.spell) +
                    ' (sim: ' + bestSimilarity.toFixed(2) + ')');

        // ADD the thematically compatible prereq (don't remove the original)
        // This way the spell has at least one prereq that makes sense
        edges.push({
            from: bestCandidate.spell.formId,
            to: formId,
            type: 'thematic'  // Mark as added for thematic reasons
        });

        // Update prereqRequirements if they exist - ADD new prereq as hard requirement
        if (node.prereqRequirements) {
            var newFrom = bestCandidate.spell.formId;

            // Add as hard prereq (must have at least one thematically correct prereq)
            if (node.prereqRequirements.hardPrereqs.indexOf(newFrom) === -1) {
                node.prereqRequirements.hardPrereqs.push(newFrom);
            }
        }

        stats.nodesFixed++;
        stats.edgesRewired++;

        console.log('[ThematicFix]   ADDED thematic prereq: ' + bestCandidate.spell.name +
                    ' (kept existing: ' + incoming.map(function(e) {
                        var s = positionByFormId[e.from];
                        return s && s.spell ? s.spell.name : e.from;
                    }).join(', ') + ')');
    });

    console.log('[ThematicFix] Checked ' + stats.nodesChecked + ' nodes, fixed ' +
                stats.nodesFixed + ', rewired ' + stats.edgesRewired + ' edges');

    return stats;
}

// Expose for testing
window.getSpellThemes = getSpellThemes;
window.calculateThematicSimilarity = calculateThematicSimilarity;
window.areThematicallyCompatible = areThematicallyCompatible;
window.fixThematicInconsistencies = fixThematicInconsistencies;
