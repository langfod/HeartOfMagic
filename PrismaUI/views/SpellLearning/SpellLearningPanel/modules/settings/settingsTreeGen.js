/**
 * Dynamic Tree Building Settings
 * Tree generation presets, scoring factors, and preset detection.
 *
 * Depends on: state.js (settings), config.js, settings/settingsUIHelpers.js,
 *             i18n.js (t()), uiHelpers.js
 */

// =============================================================================
// DYNAMIC TREE BUILDING SETTINGS
// =============================================================================

/**
 * Tree generation presets - each preset configures settings.treeGeneration
 */
var TREE_GENERATION_PRESETS = {
    strict: {
        name: 'Strict',
        description: 'Clean element chains, no cross-element links',
        settings: {
            themeDiscoveryMode: 'dynamic',
            enableSmartRouting: true,
            autoBranchFallback: true,
            rootCount: 1,  // Single root, element tier-0 spells branch from it
            elementIsolation: true,
            elementIsolationStrict: true,
            strictTierOrdering: true,
            allowSameTierLinks: false,
            tierMixing: false,
            tierMixingAmount: 0,
            linkStrategy: 'strict',
            convergenceEnabled: true,
            convergenceChance: 30,
            convergenceMinTier: 3,
            maxChildrenPerNode: 5,  // Higher for element chains
            scoring: {
                elementMatching: true,
                spellTypeMatching: true,
                tierProgression: true,
                keywordMatching: false,
                themeCoherence: false,
                effectNameMatching: true,
                descriptionSimilarity: false,
                magickaCostProximity: false,
                sameModSource: false
            }
        }
    },
    thematic: {
        name: 'Thematic',
        description: 'Keyword matching, coherent themes (Recommended)',
        settings: {
            themeDiscoveryMode: 'dynamic',
            enableSmartRouting: true,
            autoBranchFallback: true,
            rootCount: 1,  // Single root with element branches
            elementIsolation: true,
            elementIsolationStrict: false,
            strictTierOrdering: true,
            allowSameTierLinks: true,
            tierMixing: false,
            tierMixingAmount: 0,
            linkStrategy: 'thematic',
            convergenceEnabled: true,
            convergenceChance: 40,
            convergenceMinTier: 3,
            maxChildrenPerNode: 3,
            scoring: {
                elementMatching: true,
                spellTypeMatching: true,
                tierProgression: true,
                keywordMatching: true,
                themeCoherence: true,
                effectNameMatching: true,
                descriptionSimilarity: true,
                magickaCostProximity: false,
                sameModSource: false
            }
        }
    },
    organic: {
        name: 'Organic',
        description: 'Natural growth, tier mixing allowed',
        settings: {
            themeDiscoveryMode: 'dynamic',
            enableSmartRouting: true,
            autoBranchFallback: true,
            rootCount: 3,  // Multiple roots for natural growth
            elementIsolation: false,
            elementIsolationStrict: false,
            strictTierOrdering: false,
            allowSameTierLinks: true,
            tierMixing: true,
            tierMixingAmount: 30,
            linkStrategy: 'organic',
            convergenceEnabled: true,
            convergenceChance: 50,
            convergenceMinTier: 2,
            maxChildrenPerNode: 4,
            scoring: {
                elementMatching: true,
                spellTypeMatching: true,
                tierProgression: true,
                keywordMatching: true,
                themeCoherence: true,
                effectNameMatching: true,
                descriptionSimilarity: true,
                magickaCostProximity: true,
                sameModSource: true
            }
        }
    },
    random: {
        name: 'Random',
        description: 'Chaotic, unpredictable connections',
        settings: {
            themeDiscoveryMode: 'dynamic',
            enableSmartRouting: false,
            autoBranchFallback: false,
            rootCount: 3,  // Multiple roots for chaos
            elementIsolation: false,
            elementIsolationStrict: false,
            strictTierOrdering: false,
            allowSameTierLinks: true,
            tierMixing: true,
            tierMixingAmount: 50,
            linkStrategy: 'random',
            convergenceEnabled: false,
            convergenceChance: 0,
            convergenceMinTier: 4,
            maxChildrenPerNode: 5,
            scoring: {
                elementMatching: false,
                spellTypeMatching: false,
                tierProgression: false,
                keywordMatching: false,
                themeCoherence: false,
                effectNameMatching: false,
                descriptionSimilarity: false,
                magickaCostProximity: false,
                sameModSource: false
            }
        }
    }
};

/**
 * Apply a tree generation preset to settings.treeGeneration
 */
function applyTreeGenerationPreset(presetName) {
    var preset = TREE_GENERATION_PRESETS[presetName];
    if (!preset) {
        console.warn('[TreeSettings] Unknown preset:', presetName);
        return;
    }

    console.log('[TreeSettings] ====== APPLYING PRESET:', presetName, '======');
    console.log('[TreeSettings] Preset settings:', JSON.stringify(preset.settings, null, 2));

    // Deep copy preset settings into treeGeneration
    Object.keys(preset.settings).forEach(function(key) {
        if (key === 'scoring') {
            // Deep copy scoring object
            Object.keys(preset.settings.scoring).forEach(function(scoreKey) {
                settings.treeGeneration.scoring[scoreKey] = preset.settings.scoring[scoreKey];
            });
        } else {
            settings.treeGeneration[key] = preset.settings[key];
        }
    });

    // Log the actual values after applying
    console.log('[TreeSettings] After apply - elementIsolation:', settings.treeGeneration.elementIsolation);
    console.log('[TreeSettings] After apply - elementIsolationStrict:', settings.treeGeneration.elementIsolationStrict);
    console.log('[TreeSettings] After apply - strictTierOrdering:', settings.treeGeneration.strictTierOrdering);
    console.log('[TreeSettings] After apply - linkStrategy:', settings.treeGeneration.linkStrategy);

    // Update all UI elements to reflect the new settings
    updateTreeSettingsUI();

    // Mark as not modified (matching a preset)
    settings.treeGenerationPresetModified = false;
}

/**
 * Update all tree settings UI elements from settings.treeGeneration
 */
function updateTreeSettingsUI() {
    var tg = settings.treeGeneration;

    // Theme Discovery
    var themeDiscoveryModeSelect = document.getElementById('themeDiscoveryModeSelect');
    if (themeDiscoveryModeSelect) themeDiscoveryModeSelect.value = tg.themeDiscoveryMode;

    var enableSmartRoutingToggle = document.getElementById('enableSmartRoutingToggle');
    if (enableSmartRoutingToggle) enableSmartRoutingToggle.checked = tg.enableSmartRouting;

    var autoBranchFallbackToggle = document.getElementById('autoBranchFallbackToggle');
    if (autoBranchFallbackToggle) autoBranchFallbackToggle.checked = tg.autoBranchFallback;

    // Element Rules
    var elementIsolationToggle = document.getElementById('elementIsolationToggle');
    if (elementIsolationToggle) elementIsolationToggle.checked = tg.elementIsolation;

    var elementIsolationStrictToggle = document.getElementById('elementIsolationStrictToggle');
    if (elementIsolationStrictToggle) elementIsolationStrictToggle.checked = tg.elementIsolationStrict;

    var elementIsolationStrictRow = document.getElementById('elementIsolationStrictRow');
    if (elementIsolationStrictRow) {
        elementIsolationStrictRow.style.display = tg.elementIsolation ? '' : 'none';
    }

    // Root Count
    var rootCountSelect = document.getElementById('rootCountSelect');
    if (rootCountSelect) rootCountSelect.value = tg.rootCount || 1;
    var rootCountRow = document.getElementById('rootCountRow');
    if (rootCountRow) rootCountRow.style.display = tg.elementIsolation ? '' : 'none';

    // Tier Rules
    var strictTierOrderingToggle = document.getElementById('strictTierOrderingToggle');
    if (strictTierOrderingToggle) strictTierOrderingToggle.checked = tg.strictTierOrdering;

    var allowSameTierLinksToggle = document.getElementById('allowSameTierLinksToggle');
    if (allowSameTierLinksToggle) allowSameTierLinksToggle.checked = tg.allowSameTierLinks;

    var tierMixingToggle = document.getElementById('tierMixingToggle');
    if (tierMixingToggle) tierMixingToggle.checked = tg.tierMixing;

    var tierMixingAmountRow = document.getElementById('tierMixingAmountRow');
    if (tierMixingAmountRow) {
        tierMixingAmountRow.style.display = tg.tierMixing ? '' : 'none';
    }

    var tierMixingAmountSlider = document.getElementById('tierMixingAmountSlider');
    var tierMixingAmountValue = document.getElementById('tierMixingAmountValue');
    if (tierMixingAmountSlider) {
        tierMixingAmountSlider.value = tg.tierMixingAmount;
        updateSliderFillGlobal(tierMixingAmountSlider);
    }
    if (tierMixingAmountValue) tierMixingAmountValue.textContent = tg.tierMixingAmount + '%';

    // Link Strategy
    var linkStrategySelect = document.getElementById('linkStrategySelect');
    if (linkStrategySelect) linkStrategySelect.value = tg.linkStrategy;

    var maxChildrenSlider = document.getElementById('maxChildrenSlider');
    var maxChildrenValue = document.getElementById('maxChildrenValue');
    if (maxChildrenSlider) {
        maxChildrenSlider.value = tg.maxChildrenPerNode;
        updateSliderFillGlobal(maxChildrenSlider);
    }
    if (maxChildrenValue) maxChildrenValue.textContent = tg.maxChildrenPerNode;

    // Convergence
    var convergenceEnabledToggle = document.getElementById('convergenceEnabledToggle');
    if (convergenceEnabledToggle) convergenceEnabledToggle.checked = tg.convergenceEnabled;

    var convergenceSettings = document.getElementById('convergenceSettings');
    if (convergenceSettings) {
        convergenceSettings.style.display = tg.convergenceEnabled ? '' : 'none';
    }

    var convergenceChanceSlider = document.getElementById('convergenceChanceSlider');
    var convergenceChanceValue = document.getElementById('convergenceChanceValue');
    if (convergenceChanceSlider) {
        convergenceChanceSlider.value = tg.convergenceChance;
        updateSliderFillGlobal(convergenceChanceSlider);
    }
    if (convergenceChanceValue) convergenceChanceValue.textContent = tg.convergenceChance + '%';

    var convergenceMinTierSelect = document.getElementById('convergenceMinTierSelect');
    if (convergenceMinTierSelect) convergenceMinTierSelect.value = tg.convergenceMinTier;

    // Scoring factors
    var scoring = tg.scoring || {};
    var scoringIds = {
        'scoringElementMatching': 'elementMatching',
        'scoringSpellTypeMatching': 'spellTypeMatching',
        'scoringTierProgression': 'tierProgression',
        'scoringKeywordMatching': 'keywordMatching',
        'scoringThemeCoherence': 'themeCoherence',
        'scoringEffectNameMatching': 'effectNameMatching',
        'scoringDescriptionSimilarity': 'descriptionSimilarity',
        'scoringMagickaCost': 'magickaCostProximity',
        'scoringSameModSource': 'sameModSource'
    };

    Object.keys(scoringIds).forEach(function(elementId) {
        var checkbox = document.getElementById(elementId);
        if (checkbox) {
            checkbox.checked = scoring[scoringIds[elementId]] !== false;
        }
    });

    // Update preset dropdown to reflect current settings
    var treePresetSelect = document.getElementById('treePresetSelect');
    var treePresetDescription = document.getElementById('treePresetDescription');
    if (treePresetSelect) {
        var currentPreset = detectCurrentTreePreset();
        treePresetSelect.value = currentPreset;
        if (treePresetDescription) {
            var preset = TREE_GENERATION_PRESETS[currentPreset];
            treePresetDescription.textContent = preset ? preset.description : 'Custom settings';
        }
    }
}

/**
 * Check if current settings match any preset
 * Returns preset name or 'custom'
 */
function detectCurrentTreePreset() {
    var tg = settings.treeGeneration;

    for (var presetName in TREE_GENERATION_PRESETS) {
        var preset = TREE_GENERATION_PRESETS[presetName];
        var matches = true;

        // Check all non-scoring settings (rootCount is independent, not part of preset identity)
        for (var key in preset.settings) {
            if (key === 'scoring' || key === 'rootCount') continue;
            if (tg[key] !== preset.settings[key]) {
                matches = false;
                break;
            }
        }

        // Check scoring settings
        if (matches) {
            var scoring = tg.scoring || {};
            var presetScoring = preset.settings.scoring || {};
            for (var scoreKey in presetScoring) {
                if (scoring[scoreKey] !== presetScoring[scoreKey]) {
                    matches = false;
                    break;
                }
            }
        }

        if (matches) return presetName;
    }

    return 'custom';
}

/**
 * Mark tree settings as modified (no longer matching a preset)
 */
function markTreeSettingsModified() {
    var presetSelect = document.getElementById('treePresetSelect');
    var currentPreset = detectCurrentTreePreset();

    if (presetSelect && presetSelect.value !== currentPreset) {
        presetSelect.value = currentPreset;
        var descEl = document.getElementById('treePresetDescription');
        if (descEl) {
            var preset = TREE_GENERATION_PRESETS[currentPreset];
            descEl.textContent = preset ? preset.description : 'Custom settings';
        }
    }
}

// Export tree settings functions
window.applyTreeGenerationPreset = applyTreeGenerationPreset;
window.updateTreeSettingsUI = updateTreeSettingsUI;
window.TREE_GENERATION_PRESETS = TREE_GENERATION_PRESETS;
