/**
 * Settings-Aware Builder Entry - Main entry point and async wrapper
 * for tree building.
 *
 * Loaded after: settingsAwareBuilder.js
 * Depends on: settingsAwareCore.js, settingsAwareBuilder.js (buildSchoolTree,
 *             hashString), layoutEngine*.js
 */

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

console.log('[SettingsAwareBuilder] Entry module loaded v' + SETTINGS_AWARE_BUILDER_VERSION);
