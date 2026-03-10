/**
 * Procedural Tree Builder - Configuration
 *
 * Configuration constants and filter functions for procedural tree generation.
 *
 * Depends on:
 * - modules/state.js (settings)
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

var PROCEDURAL_CONFIG = {
    maxChildrenPerNode: 3,
    topThemesPerSchool: 8,
    minThemeScore: 30,
    preferVanillaRoots: true,
    convergenceAtTier: 3,
    convergenceChance: 0.4,
    tierOrder: ['Novice', 'Apprentice', 'Adept', 'Expert', 'Master']
};

// Vanilla root spell FormIDs (preferred starting points)
var VANILLA_ROOTS = {
    'Destruction': '0x00012FCD',   // Flames
    'Restoration': '0x00012FCC',   // Healing
    'Alteration': '0x0005AD5C',    // Oakflesh
    'Conjuration': '0x000640B6',   // Conjure Familiar
    'Illusion': '0x00021143'       // Clairvoyance
};

// Stop words to ignore in theme discovery
var STOP_WORDS = [
    'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'and', 'or',
    'spell', 'magic', 'magical', 'target', 'targets', 'effect', 'effects',
    'damage', 'point', 'points', 'second', 'seconds', 'per', 'does', 'causes',
    'cast', 'caster', 'casting', 'level', 'levels', 'health', 'magicka', 'stamina',
    'novice', 'apprentice', 'adept', 'expert', 'master', 'restore', 'restores'
];

// O(1) lookup version of STOP_WORDS
var STOP_WORDS_SET = {};
(function() {
    for (var i = 0; i < STOP_WORDS.length; i++) {
        STOP_WORDS_SET[STOP_WORDS[i]] = true;
    }
})();

// =============================================================================
// BLACKLIST FILTER
// =============================================================================

/**
 * Filter blacklisted spells from a spell array.
 * Uses settings.spellBlacklist (saved persistently via UnifiedConfig).
 */
function filterBlacklistedSpells(spells) {
    if (!settings.spellBlacklist || settings.spellBlacklist.length === 0) {
        return spells;
    }

    var blacklistedIds = {};
    settings.spellBlacklist.forEach(function(entry) {
        blacklistedIds[entry.formId] = true;
    });

    var filtered = spells.filter(function(spell) {
        var formId = spell.formId || spell.id;
        return !blacklistedIds[formId];
    });

    var removedCount = spells.length - filtered.length;
    if (removedCount > 0) {
        console.log('[Procedural] Filtered ' + removedCount + ' blacklisted spells (' + filtered.length + ' remaining)');
    }

    return filtered;
}

window.filterBlacklistedSpells = filterBlacklistedSpells;

// =============================================================================
// WHITELIST FILTER
// =============================================================================

/**
 * Filter spells to exclude those from disabled plugins.
 * Uses settings.pluginWhitelist (saved persistently via UnifiedConfig).
 * All plugins are ENABLED by default - this filters OUT explicitly disabled ones.
 * Blacklist is applied separately (filters individual spells).
 */
function filterWhitelistedSpells(spells) {
    if (!settings.pluginWhitelist || settings.pluginWhitelist.length === 0) {
        return spells;  // No whitelist configured = include all
    }

    // Get DISABLED plugins (whitelist is opt-out, not opt-in)
    var disabledPlugins = settings.pluginWhitelist.filter(function(entry) {
        return entry.enabled === false;
    });

    if (disabledPlugins.length === 0) {
        return spells;  // Nothing disabled = include all
    }

    // Build lookup of disabled plugin names (lowercase for case-insensitive comparison)
    var disabledMap = {};
    disabledPlugins.forEach(function(entry) {
        disabledMap[entry.plugin.toLowerCase()] = true;
    });

    var filtered = spells.filter(function(spell) {
        var plugin = null;

        // Extract plugin from persistentId: "PluginName.esp|0x00123456"
        if (spell.persistentId && spell.persistentId.includes('|')) {
            plugin = spell.persistentId.split('|')[0];
        }
        // Fallback: try source field
        else if (spell.source) {
            plugin = spell.source;
        }

        if (!plugin) {
            // Can't determine plugin - include it to be safe
            return true;
        }

        // Include if NOT in disabled list
        return disabledMap[plugin.toLowerCase()] !== true;
    });

    var removedCount = spells.length - filtered.length;
    if (removedCount > 0) {
        console.log('[Procedural] Whitelist filtered ' + removedCount + ' spells from disabled plugins (' + filtered.length + ' remaining)');
    }

    return filtered;
}

window.filterWhitelistedSpells = filterWhitelistedSpells;
