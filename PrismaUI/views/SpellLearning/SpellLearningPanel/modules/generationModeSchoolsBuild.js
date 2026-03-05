/**
 * Generation Mode Schools Build — Per-school tree building and merging.
 * Loaded after: generationModeSchools.js
 *
 * Depends on: state.js (state, settings), generationModeSchools.js (getSchoolConfig),
 *             uiHelpers.js (updateStatus, setStatusIcon)
 *
 * Exports (global):
 * - rerunSchool(schoolName, mode, useExistingSlice)
 * - buildSchoolTreeOnly(schoolName, spells, config)
 * - mergeSchoolTree(schoolName, schoolTree)
 * - hideSchoolControlPanels()
 */

function rerunSchool(schoolName, mode, useExistingSlice) {
    console.log('[RerunSchool] ' + schoolName + ' mode=' + mode);

    if (!state.lastSpellData || !state.lastSpellData.spells) {
        updateStatus('No spell data - scan spells first');
        setStatusIcon('X');
        return;
    }

    // Filter spells to this school (same filtering as main pipelines)
    var allSpells = state.lastSpellData.spells;
    if (typeof filterBlacklistedSpells === 'function') allSpells = filterBlacklistedSpells(allSpells);
    if (typeof filterWhitelistedSpells === 'function') allSpells = filterWhitelistedSpells(allSpells);

    var schoolSpells = allSpells.filter(function(s) {
        var school = s.school || 'Unknown';
        if (!school || school === 'null' || school === 'None' || school === '') school = 'Hedge Wizard';
        return school === schoolName;
    });

    if (schoolSpells.length === 0) {
        updateStatus('No spells found for ' + schoolName);
        setStatusIcon('X');
        return;
    }

    if (!state.treeData || !state.treeData.rawData) {
        updateStatus('Build full tree first, then regenerate individual schools');
        setStatusIcon('X');
        return;
    }

    updateStatus('Regenerating ' + schoolName + '...');
    setStatusIcon('...');

    if (mode === 'complex') {
        // =====================================================================
        // COMPLEX: Same pipeline as doVisualFirstGenerate() / main Build Complex
        // Uses buildAllTreesSettingsAware -> SettingsAwareBuilder
        // =====================================================================
        setTimeout(function() {
            try {
                if (typeof buildAllTreesSettingsAware !== 'function') {
                    updateStatus('Settings-aware builder not loaded');
                    setStatusIcon('X');
                    return;
                }

                // Read per-school UI config (same as doVisualFirstGenerate line 1901)
                var schoolConfig = getSchoolConfig(schoolName);

                // Build finalConfigs map with just this school
                // (same merge logic as doVisualFirstGenerate: LLM > UI > defaults)
                var config = schoolConfig || {};
                config.shape = config.shape || 'organic';
                config.density = config.density || 0.6;
                config.convergence_chance = config.convergence_chance || config.convergence || 0.4;
                config.slice_weight = config.slice_weight || 1.0;
                config.branching_mode = config.branching_mode || 'fuzzy_groups';
                config.source = 'ui';

                var finalConfigs = {};
                finalConfigs[schoolName] = config;

                // Get global tree generation settings (same as doVisualFirstGenerate line 1988)
                var treeGeneration = settings.treeGeneration || {};

                // Get stored NLP fuzzy data (same as doVisualFirstGenerate line 1858)
                var fuzzy = window._nlpFuzzyData || {
                    relationships: {},
                    similarity_scores: {},
                    groups: {},
                    themes: {}
                };

                console.log('[RerunSchool] Complex: calling buildAllTreesSettingsAware for', schoolName,
                    '(' + schoolSpells.length + ' spells)');
                console.log('[RerunSchool]   shape:', config.shape, 'growth:', config.growth_behavior);
                console.log('[RerunSchool]   treeGeneration:', JSON.stringify({
                    rootCount: treeGeneration.rootCount,
                    elementIsolation: treeGeneration.elementIsolation,
                    strictTierOrdering: treeGeneration.strictTierOrdering
                }));

                // Call the SAME function as the main Build Complex button
                // Pass only this school's spells — buildAllTreesSettingsAware groups by school internally
                var treeData = buildAllTreesSettingsAware(schoolSpells, finalConfigs, treeGeneration, fuzzy);

                // Merge the regenerated school into existing tree
                if (treeData.schools && treeData.schools[schoolName]) {
                    // Replace just this school's nodes/links in the full rawData
                    state.treeData.rawData.schools[schoolName] = treeData.schools[schoolName];

                    // Re-apply LayoutEngine to the FULL tree (all schools) so
                    // slice boundaries are correct — the new school stays in its
                    // pie slice and doesn't bleed into neighbours
                    if (typeof LayoutEngine !== 'undefined' && typeof LayoutEngine.applyPositionsToTree === 'function') {
                        // Build schoolConfigs for ALL schools from UI controls
                        var allSchoolConfigs = {};
                        for (var sn in state.treeData.rawData.schools) {
                            allSchoolConfigs[sn] = typeof getSchoolConfig === 'function' ? getSchoolConfig(sn) : {};
                        }
                        // Override the regenerated school's config with what we just used
                        allSchoolConfigs[schoolName] = config;

                        // Clear position flags on ALL nodes so LayoutEngine recalculates everything
                        for (var sn2 in state.treeData.rawData.schools) {
                            var sch = state.treeData.rawData.schools[sn2];
                            if (sch && sch.nodes) {
                                sch.nodes.forEach(function(n) {
                                    delete n.x; delete n.y;
                                    delete n._fromVisualFirst; delete n._fromLayoutEngine;
                                    delete n._visualFirstX; delete n._visualFirstY;
                                });
                            }
                        }

                        LayoutEngine.applyPositionsToTree(state.treeData.rawData, {
                            shape: config.shape || 'organic',
                            seed: Date.now(),
                            schoolConfigs: allSchoolConfigs
                        });
                        console.log('[RerunSchool] Re-applied LayoutEngine to full tree (all schools)');
                    }

                    // Reload full tree (re-parse + re-render)
                    if (typeof loadTreeData === 'function') {
                        loadTreeData(state.treeData.rawData);
                    }

                    // Save updated tree
                    if (window.callCpp) {
                        window.callCpp('SaveSpellTree', JSON.stringify(state.treeData.rawData));
                    }

                    var nodeCount = treeData.schools[schoolName].nodes ? treeData.schools[schoolName].nodes.length : 0;
                    updateStatus('Complex: ' + schoolName + ' (' + nodeCount + ' nodes)');
                    setStatusIcon('OK');
                } else {
                    updateStatus('Complex build produced no data for ' + schoolName);
                    setStatusIcon('X');
                }

            } catch (e) {
                console.error('[RerunSchool] Complex error:', e);
                updateStatus('Complex error: ' + e.message);
                setStatusIcon('X');
            }
        }, 50);

    } else if (mode === 'simple') {
        // =====================================================================
        // SIMPLE: Same pipeline as startProceduralGenerate() / main Build Simple
        // Uses buildProceduralTrees -> assignGridPositions
        // =====================================================================
        setTimeout(function() {
            try {
                if (typeof buildProceduralTrees !== 'function') {
                    updateStatus('Procedural builder not loaded');
                    setStatusIcon('X');
                    return;
                }

                console.log('[RerunSchool] Simple: calling buildProceduralTrees for', schoolName,
                    '(' + schoolSpells.length + ' spells)');

                // Call the SAME function as the main Build Simple button
                // buildProceduralTrees groups by school internally, so pass this school's spells
                var treeData = buildProceduralTrees(schoolSpells);

                // Apply grid positions (same as startProceduralGenerate line 1096)
                if (typeof assignGridPositions === 'function') {
                    treeData = assignGridPositions(treeData);
                }

                // Merge the regenerated school into existing tree
                if (treeData.schools && treeData.schools[schoolName]) {
                    state.treeData.rawData.schools[schoolName] = treeData.schools[schoolName];

                    // Re-apply LayoutEngine to the FULL tree (all schools) so
                    // slice boundaries are correct — same fix as complex mode
                    if (typeof LayoutEngine !== 'undefined' && typeof LayoutEngine.applyPositionsToTree === 'function') {
                        var allSchoolConfigs = {};
                        for (var sn in state.treeData.rawData.schools) {
                            allSchoolConfigs[sn] = typeof getSchoolConfig === 'function' ? getSchoolConfig(sn) : {};
                        }

                        // Clear position flags on ALL nodes so LayoutEngine recalculates
                        for (var sn2 in state.treeData.rawData.schools) {
                            var sch = state.treeData.rawData.schools[sn2];
                            if (sch && sch.nodes) {
                                sch.nodes.forEach(function(n) {
                                    delete n.x; delete n.y;
                                    delete n._fromVisualFirst; delete n._fromLayoutEngine;
                                    delete n._visualFirstX; delete n._visualFirstY;
                                });
                            }
                        }

                        LayoutEngine.applyPositionsToTree(state.treeData.rawData, {
                            shape: 'organic',
                            seed: Date.now(),
                            schoolConfigs: allSchoolConfigs
                        });
                        console.log('[RerunSchool] Re-applied LayoutEngine to full tree (all schools)');
                    }

                    // Reload full tree (re-parse + re-render)
                    if (typeof loadTreeData === 'function') {
                        loadTreeData(state.treeData.rawData);
                    }

                    // Save updated tree
                    if (window.callCpp) {
                        window.callCpp('SaveSpellTree', JSON.stringify(state.treeData.rawData));
                    }

                    var nodeCount = treeData.schools[schoolName].nodes ? treeData.schools[schoolName].nodes.length : 0;
                    updateStatus('Simple: ' + schoolName + ' (' + nodeCount + ' nodes)');
                    setStatusIcon('OK');
                } else {
                    updateStatus('Simple build produced no data for ' + schoolName);
                    setStatusIcon('X');
                }

            } catch (e) {
                console.error('[RerunSchool] Simple error:', e);
                updateStatus('Simple error: ' + e.message);
                setStatusIcon('X');
            }
        }, 50);

    } else if (mode === 'native') {
        // C++ native generation for single school
        if (typeof startProceduralTreeGenerate === 'function') {
            startProceduralTreeGenerate(schoolName, getSchoolConfig(schoolName));
        } else {
            updateStatus('Native C++ generation not available');
            setStatusIcon('X');
        }
    }
}

// Build tree for a single school (JS mode)
function buildSchoolTreeOnly(schoolName, spells, config) {
    console.log('[GenerationModeUI] Building ' + schoolName + ' with ' + spells.length + ' spells');

    // Use the existing procedural builder functions (exported to window)
    if (typeof window.discoverThemes !== 'function' || typeof window.buildProceduralSchoolTree !== 'function') {
        console.error('[GenerationModeUI] Procedural functions not available');
        console.log('[GenerationModeUI] discoverThemes:', typeof window.discoverThemes);
        console.log('[GenerationModeUI] buildProceduralSchoolTree:', typeof window.buildProceduralSchoolTree);
        return null;
    }

    try {
        var themes = window.discoverThemes(spells);
        console.log('[GenerationModeUI] Discovered ' + themes.length + ' themes for ' + schoolName);

        var schoolTree = window.buildProceduralSchoolTree(schoolName, spells, themes);
        console.log('[GenerationModeUI] Built tree with ' + (schoolTree && schoolTree.nodes ? schoolTree.nodes.length : 0) + ' nodes');

        return schoolTree;
    } catch (e) {
        console.error('[GenerationModeUI] buildSchoolTreeOnly error:', e);
        return null;
    }
}

// Merge a single school's tree into the existing tree data
function mergeSchoolTree(schoolName, schoolTree) {
    if (!state.treeData || !state.treeData.rawData) {
        console.warn('[GenerationModeUI] No existing tree data to merge into');
        return;
    }

    // Update the school in the raw data
    state.treeData.rawData.schools[schoolName] = schoolTree;

    // Re-parse the full tree
    if (typeof loadTreeData === 'function') {
        loadTreeData(state.treeData.rawData);
    } else if (typeof TreeParser !== 'undefined') {
        var result = TreeParser.parse(state.treeData.rawData);
        if (result.success) {
            state.treeData = result;
            state.treeData.rawData = state.treeData.rawData;
        }
    }

    // Save updated tree
    if (window.callCpp) {
        window.callCpp('SaveSpellTree', JSON.stringify(state.treeData.rawData));
    }

    console.log('[GenerationModeUI] Merged ' + schoolName + ' into tree');
}

function hideSchoolControlPanels() {
    var section = document.getElementById('schoolControlsSection');
    if (section) section.classList.add('hidden');
}

// =============================================================================
// EXPORTS
// =============================================================================

window.rerunSchool = rerunSchool;
window.hideSchoolControlPanels = hideSchoolControlPanels;

console.log('[GenerationModeSchoolsBuild] Loaded');
