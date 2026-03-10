/**
 * Procedural Tree Callbacks - C++ tree generation completion handler and growth mode routing.
 *
 * Contains the onProceduralTreeComplete callback that routes C++ build results
 * to the appropriate growth mode (Classic, Tree, Graph, Oracle, Thematic),
 * handles visual-first config extraction, and applies school configs to UI.
 *
 * Depends on:
 * - modules/proceduralTreeGenerate.js (_handleBuildFailure, resetProceduralPlusButton)
 * - modules/state.js (state, settings)
 * - modules/uiHelpers.js (updateStatus, setStatusIcon)
 * - modules/treeParser.js (TreeParser)
 *
 * Loaded after: proceduralTreeGenerate.js
 */

/**
 * Callback from C++ when procedural tree generation completes
 */
window.onProceduralTreeComplete = function(resultStr) {
    console.log('[Procedural] C++ result received');

    try {
        var result = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;

        // Route to Classic Growth mode if it triggered this build
        if (state._classicGrowthBuildPending) {
            state._classicGrowthBuildPending = false;
            if (result.success && result.treeData) {
                // Advance build progress: tree done → prereqs or finalize
                if (typeof BuildProgress !== 'undefined' && BuildProgress.isActive()) {
                    BuildProgress.setStage('prereqs');
                }
                var cgTreeData = typeof result.treeData === 'string' ? JSON.parse(result.treeData) : result.treeData;
                if (typeof TreeGrowthClassic !== 'undefined' && TreeGrowthClassic.loadTreeData) {
                    TreeGrowthClassic.loadTreeData(cgTreeData);
                    if (typeof TreeGrowth !== 'undefined') TreeGrowth._markDirty();
                }
                // Update notification bar with build result
                var cgSchools = cgTreeData && cgTreeData.schools ? Object.keys(cgTreeData.schools).length : 0;
                var cgSpells = 0;
                if (cgTreeData && cgTreeData.schools) { for (var s in cgTreeData.schools) { cgSpells += (cgTreeData.schools[s].nodes || []).length; } }
                if (typeof updateScanStatus === 'function') updateScanStatus(t('status.treeBuildComplete', {schools: cgSchools, spells: cgSpells}), 'success');
            } else {
                _handleBuildFailure(
                    result.error || 'unknown',
                    '_classicGrowthBuildPending',
                    typeof ClassicSettings !== 'undefined' ? ClassicSettings : null,
                    { command: 'build_tree_classic', config: { shape: 'organic', density: 0.6, symmetry: 0.3, max_children_per_node: 3, top_themes_per_school: 8, convergence_chance: 0.4, prefer_vanilla_roots: true } },
                    'tgClassicBuildBtn',
                    '[ClassicGrowth]'
                );
            }
            resetProceduralPlusButton();
            return;
        }

        // Route to Tree Growth mode if it triggered this build
        if (state._treeGrowthBuildPending) {
            state._treeGrowthBuildPending = false;
            if (result.success && result.treeData) {
                // Advance build progress: tree done → prereqs or finalize
                if (typeof BuildProgress !== 'undefined' && BuildProgress.isActive()) {
                    BuildProgress.setStage('prereqs');
                }
                var tgTreeData = typeof result.treeData === 'string' ? JSON.parse(result.treeData) : result.treeData;
                if (typeof TreeGrowthTree !== 'undefined' && TreeGrowthTree.loadTreeData) {
                    TreeGrowthTree.loadTreeData(tgTreeData);
                    if (typeof TreeGrowth !== 'undefined') TreeGrowth._markDirty();
                }
                // Update notification bar with build result
                var tgSchools = tgTreeData && tgTreeData.schools ? Object.keys(tgTreeData.schools).length : 0;
                var tgSpells = 0;
                if (tgTreeData && tgTreeData.schools) { for (var s in tgTreeData.schools) { tgSpells += (tgTreeData.schools[s].nodes || []).length; } }
                if (typeof updateScanStatus === 'function') updateScanStatus(t('status.treeBuildComplete', {schools: tgSchools, spells: tgSpells}), 'success');
            } else {
                _handleBuildFailure(
                    result.error || 'unknown',
                    '_treeGrowthBuildPending',
                    typeof TreeSettings !== 'undefined' ? TreeSettings : null,
                    { command: 'build_tree', config: state._lastTreeGrowthConfig || {} },
                    'tgTreeBuildBtn',
                    '[TreeGrowthTree]'
                );
            }
            resetProceduralPlusButton();
            return;
        }

        // Route to Graph Growth mode if it triggered this build
        if (state._graphGrowthBuildPending) {
            state._graphGrowthBuildPending = false;
            if (result.success && result.treeData) {
                if (typeof BuildProgress !== 'undefined' && BuildProgress.isActive()) {
                    BuildProgress.setStage('prereqs');
                }
                var graphTreeData = typeof result.treeData === 'string' ? JSON.parse(result.treeData) : result.treeData;
                if (typeof TreeGrowthGraph !== 'undefined' && TreeGrowthGraph.loadTreeData) {
                    TreeGrowthGraph.loadTreeData(graphTreeData);
                    if (typeof TreeGrowth !== 'undefined') TreeGrowth._markDirty();
                }
                var graphSchools = graphTreeData && graphTreeData.schools ? Object.keys(graphTreeData.schools).length : 0;
                var graphSpells = 0;
                if (graphTreeData && graphTreeData.schools) { for (var gs in graphTreeData.schools) { graphSpells += (graphTreeData.schools[gs].nodes || []).length; } }
                if (typeof updateScanStatus === 'function') updateScanStatus(t('status.treeBuildComplete', {schools: graphSchools, spells: graphSpells}), 'success');
            } else {
                _handleBuildFailure(
                    result.error || 'unknown',
                    '_graphGrowthBuildPending',
                    typeof GraphSettings !== 'undefined' ? GraphSettings : null,
                    { command: 'build_tree_graph', config: {} },
                    'tgGraphBuildBtn',
                    '[GraphGrowth]'
                );
            }
            resetProceduralPlusButton();
            return;
        }

        // Route to Oracle Growth mode if it triggered this build
        if (state._oracleGrowthBuildPending) {
            state._oracleGrowthBuildPending = false;
            if (result.success && result.treeData) {
                if (typeof BuildProgress !== 'undefined' && BuildProgress.isActive()) {
                    BuildProgress.setStage('prereqs');
                }
                var oracleTreeData = typeof result.treeData === 'string' ? JSON.parse(result.treeData) : result.treeData;
                if (typeof TreeGrowthOracle !== 'undefined' && TreeGrowthOracle.loadTreeData) {
                    TreeGrowthOracle.loadTreeData(oracleTreeData);
                    if (typeof TreeGrowth !== 'undefined') TreeGrowth._markDirty();
                }
                var oracleSchools = oracleTreeData && oracleTreeData.schools ? Object.keys(oracleTreeData.schools).length : 0;
                var oracleSpells = 0;
                if (oracleTreeData && oracleTreeData.schools) { for (var os in oracleTreeData.schools) { oracleSpells += (oracleTreeData.schools[os].nodes || []).length; } }
                if (typeof updateScanStatus === 'function') updateScanStatus(t('status.treeBuildComplete', {schools: oracleSchools, spells: oracleSpells}), 'success');
            } else {
                _handleBuildFailure(
                    result.error || 'unknown',
                    '_oracleGrowthBuildPending',
                    typeof OracleSettings !== 'undefined' ? OracleSettings : null,
                    { command: 'build_tree_oracle', config: {} },
                    'tgOracleBuildBtn',
                    '[OracleGrowth]'
                );
            }
            resetProceduralPlusButton();
            return;
        }

        // Route to Thematic Growth mode if it triggered this build
        if (state._thematicGrowthBuildPending) {
            state._thematicGrowthBuildPending = false;
            if (result.success && result.treeData) {
                if (typeof BuildProgress !== 'undefined' && BuildProgress.isActive()) {
                    BuildProgress.setStage('prereqs');
                }
                var thematicTreeData = typeof result.treeData === 'string' ? JSON.parse(result.treeData) : result.treeData;
                if (typeof TreeGrowthThematic !== 'undefined' && TreeGrowthThematic.loadTreeData) {
                    TreeGrowthThematic.loadTreeData(thematicTreeData);
                    if (typeof TreeGrowth !== 'undefined') TreeGrowth._markDirty();
                }
                var thematicSchools = thematicTreeData && thematicTreeData.schools ? Object.keys(thematicTreeData.schools).length : 0;
                var thematicSpells = 0;
                if (thematicTreeData && thematicTreeData.schools) { for (var ts in thematicTreeData.schools) { thematicSpells += (thematicTreeData.schools[ts].nodes || []).length; } }
                if (typeof updateScanStatus === 'function') updateScanStatus(t('status.treeBuildComplete', {schools: thematicSchools, spells: thematicSpells}), 'success');
            } else {
                _handleBuildFailure(
                    result.error || 'unknown',
                    '_thematicGrowthBuildPending',
                    typeof ThematicSettings !== 'undefined' ? ThematicSettings : null,
                    { command: 'build_tree_thematic', config: {} },
                    'tgThematicBuildBtn',
                    '[ThematicGrowth]'
                );
            }
            resetProceduralPlusButton();
            return;
        }

        // Check if visual-first mode was waiting for LLM configs + fuzzy data
        if (state.visualFirstConfigPending && result.success) {
            state.visualFirstConfigPending = false;
            console.log('[VisualFirst] Received C++ response, extracting configs + fuzzy data...');

            var treeData = typeof result.treeData === 'string' ? JSON.parse(result.treeData) : result.treeData;
            var schoolConfigs = treeData.school_configs || {};

            // Extract fuzzy relationship data from C++ response
            var fuzzyData = {
                relationships: treeData.fuzzy_relationships || {},  // spell -> [related spells]
                similarity_scores: treeData.similarity_scores || {},  // spell pairs -> similarity
                groups: treeData.fuzzy_groups || {},  // group_name -> [spells]
                themes: treeData.spell_themes || {}  // spell -> detected themes
            };

            console.log('[VisualFirst] School configs:', Object.keys(schoolConfigs));
            console.log('[VisualFirst] Fuzzy data keys:', Object.keys(fuzzyData.relationships).length, 'spells with relationships');
            console.log('[VisualFirst] Fuzzy themes:', Object.keys(fuzzyData.themes).length, 'spells with themes');
            if (Object.keys(fuzzyData.themes).length > 0) {
                var sampleKeys = Object.keys(fuzzyData.themes).slice(0, 3);
                console.log('[VisualFirst] Sample themes:', sampleKeys.map(function(k) { return k + ': ' + fuzzyData.themes[k]; }));
            }

            // Use configs + fuzzy data with visual-first builder (ignore C++ tree structure)
            doVisualFirstGenerate(schoolConfigs, fuzzyData);
            resetProceduralPlusButton();
            return;
        }

        if (result.success && result.treeData) {
            var treeData = typeof result.treeData === 'string' ? JSON.parse(result.treeData) : result.treeData;

            if (typeof loadTreeData === 'function') {
                loadTreeData(treeData);
            } else {
                var parseResult = TreeParser.parse(treeData);
                if (parseResult.success) {
                    state.treeData = parseResult;
                    state.treeData.rawData = treeData;
                }
            }

            var schoolCount = Object.keys(treeData.schools || {}).length;
            var nodeCount = 0;
            for (var school in treeData.schools) {
                nodeCount += treeData.schools[school].nodes.length;
            }

            // Extract and apply per-school configs to UI controls
            if (treeData.school_configs) {
                console.log('[Procedural] Applying school configs to UI:', Object.keys(treeData.school_configs));
                applySchoolConfigsToUI(treeData.school_configs);
            }

            var llmConfigCount = 0;
            for (var sc in treeData.school_configs || {}) {
                if (treeData.school_configs[sc].source === 'llm') llmConfigCount++;
            }

            var statusMsg = 'C++ NLP: ' + schoolCount + ' schools, ' + nodeCount + ' spells';
            if (llmConfigCount > 0) {
                statusMsg += ' (LLM configured ' + llmConfigCount + ' schools)';
            }
            statusMsg += ' (' + (result.elapsed || '?') + 's)';

            updateStatus(statusMsg);
            setStatusIcon('OK');

            if (window.callCpp) window.callCpp('SaveSpellTree', JSON.stringify(treeData));

            setTimeout(function() {
                switchTab('spellTree');
            }, 300);

        } else {
            // Check if visual-first was pending - fall back to defaults
            if (state.visualFirstConfigPending) {
                state.visualFirstConfigPending = false;
                console.warn('[VisualFirst] C++ build failed, using default configs (no fuzzy data)');
                doVisualFirstGenerate({}, null);
                return;
            }
            updateStatus('Build failed: ' + (result.error || 'Unknown error'));
            setStatusIcon('X');
        }
    } catch (e) {
        console.error('[Procedural] Error parsing C++ result:', e);
        // Check if visual-first was pending - fall back to defaults
        if (state.visualFirstConfigPending) {
            state.visualFirstConfigPending = false;
            console.warn('[VisualFirst] C++ error, using default configs (no fuzzy data)');
            doVisualFirstGenerate({}, null);
            return;
        }
        updateStatus('Result parse error');
        setStatusIcon('X');
    }

    resetProceduralPlusButton();
};

/**
 * Apply school configs from C++ to the per-school UI controls
 */
function applySchoolConfigsToUI(schoolConfigs) {
    for (var schoolName in schoolConfigs) {
        var cfg = schoolConfigs[schoolName];
        var safeId = schoolName.replace(/\s+/g, '-');

        // Update shape dropdown
        var shapeSelect = document.getElementById('school-shape-' + safeId);
        if (shapeSelect && cfg.shape) {
            shapeSelect.value = cfg.shape;
        }

        // Update density slider
        var densitySlider = document.getElementById('school-density-' + safeId);
        var densityVal = document.getElementById('school-density-val-' + safeId);
        if (densitySlider && cfg.density !== undefined) {
            densitySlider.value = Math.round(cfg.density * 100);
            if (densityVal) densityVal.textContent = cfg.density.toFixed(1);
        }

        // Update symmetry slider
        var symmetrySlider = document.getElementById('school-symmetry-' + safeId);
        var symmetryVal = document.getElementById('school-symmetry-val-' + safeId);
        if (symmetrySlider && cfg.symmetry !== undefined) {
            symmetrySlider.value = Math.round(cfg.symmetry * 100);
            if (symmetryVal) symmetryVal.textContent = cfg.symmetry.toFixed(1);
        }


        // Update convergence slider
        var convergenceSlider = document.getElementById('school-convergence-' + safeId);
        var convergenceVal = document.getElementById('school-convergence-val-' + safeId);
        if (convergenceSlider && cfg.convergence_chance !== undefined) {
            convergenceSlider.value = Math.round(cfg.convergence_chance * 100);
            if (convergenceVal) convergenceVal.textContent = Math.round(cfg.convergence_chance * 100) + '%';
        }

        // Update min straight slider
        var minStraightSlider = document.getElementById('school-min-straight-' + safeId);
        var minStraightVal = document.getElementById('school-min-straight-val-' + safeId);
        if (minStraightSlider && cfg.min_straight !== undefined) {
            minStraightSlider.value = cfg.min_straight;
            if (minStraightVal) minStraightVal.textContent = cfg.min_straight;
        }

        // Update max straight slider
        var maxStraightSlider = document.getElementById('school-max-straight-' + safeId);
        var maxStraightVal = document.getElementById('school-max-straight-val-' + safeId);
        if (maxStraightSlider && cfg.max_straight !== undefined) {
            maxStraightSlider.value = cfg.max_straight;
            if (maxStraightVal) maxStraightVal.textContent = cfg.max_straight;
        }

        // Log if LLM configured this school
        if (cfg.source === 'llm') {
            console.log('[Procedural] LLM config applied to ' + schoolName + ':', cfg);
        }
    }
}

// =============================================================================
// WINDOW EXPORTS
// =============================================================================

window.applySchoolConfigsToUI = applySchoolConfigsToUI;
