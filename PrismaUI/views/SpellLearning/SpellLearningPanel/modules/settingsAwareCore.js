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

// _getSchoolBehavior, _getBehaviorParams, createSeededRandom,
// _setupSchoolTreeContext moved to settingsAwareSetup.js

console.log('[SettingsAwareCore] Module loaded v' + SETTINGS_AWARE_BUILDER_VERSION);

// Export globals for extension file (settingsAwareBuilder.js) in Node.js require() context
if (typeof window !== 'undefined') {
    window.SETTINGS_AWARE_BUILDER_VERSION = SETTINGS_AWARE_BUILDER_VERSION;
    window._scoreEdge = _scoreEdge;
    window.tryCreateEdge = tryCreateEdge;
    window._detectSpellElement = _detectSpellElement;
    window._hasElementConflict = _hasElementConflict;
    window._hasSameElement = _hasSameElement;
    window._getSpellTier = _getSpellTier;
}
