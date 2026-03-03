/**
 * Procedural Tree Builder - Generation UI Handlers
 *
 * UI handlers and generation entry points for both JS and C++ tree generation.
 *
 * Depends on:
 * - modules/proceduralTreeConfig.js (PROCEDURAL_CONFIG, filterBlacklistedSpells, filterWhitelistedSpells)
 * - modules/proceduralTreeCore.js (discoverThemes, buildProceduralSchoolTree, buildProceduralTrees, assignGridPositions)
 * - modules/state.js (state, settings)
 * - modules/uiHelpers.js (updateStatus, setStatusIcon)
 * - modules/treeParser.js (TreeParser)
 */

// =============================================================================
// SINGLE SCHOOL GENERATION (Simple mode for individual regeneration)
// =============================================================================

/**
 * Generate a simple tree for a single school and merge it into the existing tree.
 * Uses JavaScript-only logic with grid positioning.
 */
function generateSimpleSchoolTree(schoolName, spells, config) {
    console.log('[SimpleSchool] Generating ' + schoolName + ' with ' + spells.length + ' spells');

    if (!spells || spells.length === 0) {
        console.warn('[SimpleSchool] No spells for ' + schoolName);
        return null;
    }

    // Build tree structure using basic theme grouping
    var themes = discoverThemes(spells);
    var schoolTree = buildProceduralSchoolTree(schoolName, spells, themes);

    if (!schoolTree) {
        console.error('[SimpleSchool] Failed to build tree for ' + schoolName);
        return null;
    }

    // Get grid configuration
    var gridCfg = typeof GRID_CONFIG !== 'undefined' ? GRID_CONFIG.getComputedConfig() : {
        baseRadius: 80,
        tierSpacing: 60,
        nodeSize: 18,
        minNodeSpacing: 25
    };

    // Get existing slice info if available, otherwise calculate new
    var sliceInfo;
    if (config.useExistingSlice && typeof storedSliceAngles !== 'undefined' && storedSliceAngles[schoolName]) {
        sliceInfo = storedSliceAngles[schoolName];
        console.log('[SimpleSchool] Using existing slice for ' + schoolName);
    } else {
        // Calculate slice based on all schools in current tree
        var allSchools = state.treeData && state.treeData.schools ? Object.keys(state.treeData.schools) : [schoolName];
        if (allSchools.indexOf(schoolName) === -1) allSchools.push(schoolName);
        var schoolIndex = allSchools.indexOf(schoolName);
        var anglePerSchool = 360 / allSchools.length;
        var startAngle = schoolIndex * anglePerSchool;

        sliceInfo = {
            startAngle: startAngle,
            endAngle: startAngle + anglePerSchool,
            centerAngle: startAngle + anglePerSchool / 2,
            halfSector: anglePerSchool / 2 * 0.9
        };
    }

    // Position nodes on grid
    var seed = 0;
    for (var i = 0; i < schoolName.length; i++) {
        seed = ((seed << 5) - seed) + schoolName.charCodeAt(i);
        seed |= 0;
    }
    var rng = function() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };

    // Build lookups
    var nodeById = {};
    var nodesByTier = {};
    var maxTier = 0;

    schoolTree.nodes.forEach(function(node) {
        nodeById[node.formId] = node;
        var tier = node.tier || 0;
        if (!nodesByTier[tier]) nodesByTier[tier] = [];
        nodesByTier[tier].push(node);
        if (tier > maxTier) maxTier = tier;
    });

    var placedPositions = [];
    var centerAngle = sliceInfo.centerAngle;
    var halfSector = sliceInfo.halfSector;

    // Position nodes tier by tier
    for (var tier = 0; tier <= maxTier; tier++) {
        var tierNodes = nodesByTier[tier] || [];
        if (tierNodes.length === 0) continue;

        var radius = gridCfg.baseRadius + tier * gridCfg.tierSpacing;
        var nodesInTier = tierNodes.length;
        var availableAngle = halfSector * 2;
        var angleStep = nodesInTier > 1 ? availableAngle / (nodesInTier - 1) : 0;
        var baseAngle = centerAngle - (nodesInTier > 1 ? halfSector : 0);

        tierNodes.forEach(function(node, idx) {
            var angle = baseAngle + idx * angleStep;
            var angleJitter = (rng() - 0.5) * 3;
            var radiusJitter = (rng() - 0.5) * gridCfg.tierSpacing * 0.15;

            angle += angleJitter;
            var nodeRadius = radius + radiusJitter;

            angle = Math.max(centerAngle - halfSector * 0.95,
                     Math.min(centerAngle + halfSector * 0.95, angle));

            var rad = angle * Math.PI / 180;
            var x = Math.cos(rad) * nodeRadius;
            var y = Math.sin(rad) * nodeRadius;

            var minSpacing = gridCfg.minNodeSpacing;
            var attempts = 0;
            while (attempts < 10 && hasOverlap(x, y, placedPositions, minSpacing)) {
                nodeRadius += minSpacing * 0.5;
                x = Math.cos(rad) * nodeRadius;
                y = Math.sin(rad) * nodeRadius;
                attempts++;
            }

            node.x = x;
            node.y = y;
            node.angle = angle;
            node.radius = nodeRadius;
            node._fromVisualFirst = true;

            if (tier === 0) node.isRoot = true;

            placedPositions.push({ x: x, y: y });
        });
    }

    // Build edges and add prereqs/alternate paths
    var edges = [];
    schoolTree.nodes.forEach(function(node) {
        (node.prerequisites || []).forEach(function(prereqId) {
            // Skip undefined/null prerequisites
            if (prereqId && node.formId) {
                edges.push({ from: prereqId, to: node.formId });
            }
        });
    });

    assignSimplePrerequisites(schoolTree.nodes, nodeById, edges, rng);
    addSimpleAlternatePaths(schoolTree.nodes, nodeById, nodesByTier, edges, rng, gridCfg);
    updateNodeConnections(schoolTree.nodes, nodeById, edges);

    // Store slice info
    schoolTree.sliceInfo = sliceInfo;

    // Merge into existing tree data
    if (typeof mergeSchoolTree === 'function') {
        mergeSchoolTree(schoolName, schoolTree);
    } else if (state.treeData && state.treeData.rawData) {
        state.treeData.rawData.schools[schoolName] = schoolTree;
        if (typeof loadTreeData === 'function') {
            loadTreeData(state.treeData.rawData);
        }
    }

    // Save to C++ if available
    if (window.callCpp && state.treeData && state.treeData.rawData) {
        window.callCpp('SaveSpellTree', JSON.stringify(state.treeData.rawData));
    }

    console.log('[SimpleSchool] Generated ' + schoolName + ' with ' + schoolTree.nodes.length + ' nodes');
    return schoolTree;
}

// Export for use by generationModeUI
window.generateSimpleSchoolTree = generateSimpleSchoolTree;

// =============================================================================
// UI HANDLERS - JAVASCRIPT VERSION
// =============================================================================

function startProceduralGenerate() {
    if (!state.lastSpellData || !state.lastSpellData.spells) {
        updateStatus('No spell data - scan spells first');
        setStatusIcon('X');
        resetProceduralButton();
        return;
    }

    updateStatus('Generating trees (JS)...');
    setStatusIcon('...');

    setTimeout(function() {
        try {
            var treeData = buildProceduralTrees(state.lastSpellData.spells);

            // Assign grid-based positions (same system as fuzzy builder)
            treeData = assignGridPositions(treeData);

            if (typeof loadTreeData === 'function') {
                loadTreeData(treeData);
            } else {
                var result = TreeParser.parse(treeData);
                if (result.success) {
                    state.treeData = result;
                    state.treeData.rawData = treeData;
                }
            }

            var schoolCount = Object.keys(treeData.schools).length;
            var nodeCount = 0;
            for (var school in treeData.schools) {
                nodeCount += treeData.schools[school].nodes.length;
            }

            updateStatus('Simple Build: ' + schoolCount + ' schools, ' + nodeCount + ' spells');
            setStatusIcon('OK');

            if (window.callCpp) window.callCpp('SaveSpellTree', JSON.stringify(treeData));

            setTimeout(function() {
                switchTab('spellTree');
            }, 300);

        } catch (e) {
            console.error('[Procedural] Error:', e);
            updateStatus('JS Procedural failed: ' + e.message);
            setStatusIcon('X');
        }
        resetProceduralButton();
    }, 50);
}

function resetProceduralButton() {
    state.proceduralMode = false;
    var btn = document.getElementById('proceduralBtn');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">[T]</span> Build Tree';
    }
}

function onProceduralClick() {
    console.log('[Procedural] JS button clicked');
    var btn = document.getElementById('proceduralBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-icon">...</span> Building...';
    }
    state.proceduralMode = true;

    if (state.lastSpellData && state.lastSpellData.spells) {
        startProceduralGenerate();
    } else {
        updateStatus('Scanning spells...');
        state.proceduralPending = true;
        startScan(false);
    }
}

// =============================================================================
// UI HANDLERS - C++ VERSION
// All LLM calls happen in C++ - JS just passes API credentials
// =============================================================================

function startProceduralTreeGenerate(schoolFilter, schoolConfig) {
    if (!state.lastSpellData || !state.lastSpellData.spells) {
        updateStatus('No spell data - scan spells first');
        setStatusIcon('X');
        resetProceduralPlusButton();
        return;
    }

    var spellsToProcess = filterBlacklistedSpells(state.lastSpellData.spells);
    spellsToProcess = filterWhitelistedSpells(spellsToProcess);

    // If filtering to a specific school
    if (schoolFilter) {
        spellsToProcess = spellsToProcess.filter(function(s) {
            return s.school === schoolFilter;
        });
    }

    // Get LLM options from UI checkboxes
    var llmAutoConfigCheck = document.getElementById('llmAutoConfigCheck');
    var llmGroupsCheck = document.getElementById('llmGroupsCheck');

    // Build config - use school-specific if provided, otherwise global
    var config = schoolConfig || {
        shape: 'organic',
        density: 0.6,
        symmetry: 0.3,
        max_children_per_node: PROCEDURAL_CONFIG.maxChildrenPerNode,
        top_themes_per_school: PROCEDURAL_CONFIG.topThemesPerSchool,
        convergence_chance: PROCEDURAL_CONFIG.convergenceChance,
        prefer_vanilla_roots: PROCEDURAL_CONFIG.preferVanillaRoots,
        branching_energy: {
            enabled: true,
            min_straight: 2,
            max_straight: 5,
            randomness: 0.3
        }
    };

    // Add seed from UI - applies on top of LLM results for reproducible randomness
    var seed = typeof getCurrentSeed === 'function' ? getCurrentSeed() : null;
    if (seed) {
        config.seed = seed;
        console.log('[Procedural] Using seed:', seed);
    }

    // LLM options - ALL LLM calls happen in C++
    config.llm_auto_configure = {
        enabled: llmAutoConfigCheck ? llmAutoConfigCheck.checked : false,
        prompt_template: typeof getAutoConfigPrompt === 'function' ? getAutoConfigPrompt() : ''
    };

    config.llm_groups = {
        enabled: llmGroupsCheck ? llmGroupsCheck.checked : false,
        prompt_template: typeof getGroupPrompt === 'function' ? getGroupPrompt() : ''
    };

    // LLM Keyword Classification
    var llmKwClass = settings.treeGeneration && settings.treeGeneration.llm &&
                     settings.treeGeneration.llm.enabled &&
                     settings.treeGeneration.llm.keywordClassification;
    config.llm_keyword_classification = {
        enabled: llmKwClass || false,
        batch_size: 100,
        min_confidence: 40
    };

    // Pass API credentials to C++ for LLM calls
    var llmEnabled = config.llm_auto_configure.enabled || config.llm_groups.enabled || config.llm_keyword_classification.enabled;
    if (llmEnabled && state.llmConfig && state.llmConfig.apiKey) {
        config.llm_api = {
            api_key: state.llmConfig.apiKey,
            model: state.llmConfig.model || 'openai/gpt-4o-mini',
            endpoint: 'https://openrouter.ai/api/v1/chat/completions'
        };
        console.log('[Procedural] LLM enabled - API key provided: YES');
    }

    // Add tree generation settings from UI (Tier 4 wiring)
    if (settings.treeGeneration) {
        var tg = settings.treeGeneration;
        config.tree_generation = {
            // Theme Discovery
            theme_discovery_mode: tg.themeDiscoveryMode || 'dynamic',
            enable_smart_routing: tg.enableSmartRouting !== false,
            auto_branch_fallback: tg.autoBranchFallback !== false,

            // Element Rules
            element_isolation: tg.elementIsolation !== false,
            element_isolation_strict: tg.elementIsolationStrict || false,

            // Tier Rules
            strict_tier_ordering: tg.strictTierOrdering !== false,
            allow_same_tier_links: tg.allowSameTierLinks !== false,
            tier_mixing: tg.tierMixing || false,
            tier_mixing_amount: tg.tierMixingAmount || 20,

            // Link Strategy
            link_strategy: tg.linkStrategy || 'thematic',
            max_children_per_node: tg.maxChildrenPerNode || 3,

            // Convergence
            convergence_enabled: tg.convergenceEnabled !== false,
            convergence_chance: tg.convergenceChance || 40,
            convergence_min_tier: tg.convergenceMinTier || 3,

            // Scoring Factors
            scoring: tg.scoring || {
                elementMatching: true,
                spellTypeMatching: true,
                tierProgression: true,
                keywordMatching: true,
                themeCoherence: true,
                effectNameMatching: true,
                descriptionSimilarity: true,
                magickaCostProximity: false,
                sameModSource: false
            },

            // LLM Edge Cases
            llm_edge_case_enabled: tg.llmEdgeCaseEnabled || false,
            llm_edge_case_threshold: tg.llmEdgeCaseThreshold || 10
        };
        console.log('[Procedural] Tree generation settings applied:', config.tree_generation.link_strategy);
    }

    // Update status based on LLM options
    var statusMsg = schoolFilter ? 'Regenerating ' + schoolFilter : 'Generating trees';
    statusMsg += ' (C++';
    if (config.llm_auto_configure.enabled) statusMsg += ' + LLM Config';
    if (config.llm_groups.enabled) statusMsg += ' + LLM Groups';
    statusMsg += ')...';

    updateStatus(statusMsg);
    setStatusIcon('...');

    // Send to C++
    if (window.callCpp) {
        var request = {
            spells: spellsToProcess,
            config: config,
            schoolFilter: schoolFilter || null
        };
        console.log('[Procedural] C++ request:', {
            spells: spellsToProcess.length,
            llmConfig: config.llm_auto_configure.enabled,
            llmGroups: config.llm_groups.enabled
        });
        // Defer to let UI render progress modal before blocking on JSON.stringify
        setTimeout(function() {
            window.callCpp('ProceduralTreeGenerate', JSON.stringify(request));
        }, 0);
    } else {
        updateStatus('C++ bridge not available');
        setStatusIcon('X');
        resetProceduralPlusButton();
    }
}

function resetProceduralPlusButton() {
    state.proceduralPlusPending = false;
    var btn = document.getElementById('proceduralPlusBtn');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">[P]</span> Procedural+';
    }
}

function onProceduralPlusClick() {
    console.log('[Procedural] C++ button clicked');
    var btn = document.getElementById('proceduralPlusBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-icon">...</span> Building...';
    }
    state.proceduralPlusPending = true;

    if (state.lastSpellData && state.lastSpellData.spells) {
        startProceduralTreeGenerate();
    } else {
        updateStatus('Scanning spells...');
        state.proceduralPlusScanPending = true;
        startScan(false);
    }
}

/**
 * Shared error handler for C++ tree build failures.
 * Used by both Classic and Tree growth mode routing.
 *
 * @param {string} error - Error string from C++
 * @param {string} pendingKey - State key to set for retry (e.g. '_classicGrowthBuildPending')
 * @param {Object|null} settingsModule - ClassicSettings or TreeSettings (has .setStatusText)
 * @param {Object} retryConfig - Config to pass on retry {command, config}
 * @param {string} buildBtnId - DOM id of the build button to re-enable
 * @param {string} logPrefix - Console log prefix e.g. '[ClassicGrowth]'
 */
function _handleBuildFailure(error, pendingKey, settingsModule, retryConfig, buildBtnId, logPrefix) {
    console.error(logPrefix + ' C++ build failed:', error);
    var errorMsg = 'Tree build failed: ' + error + '\nPlease report this error on the mod page.';
    var retryFn = function() {
        if (state.lastSpellData && state.lastSpellData.spells && window.callCpp) {
            state[pendingKey] = true;
            var hasPRM = typeof PreReqMaster !== 'undefined' && PreReqMaster.isEnabled && PreReqMaster.isEnabled();
            if (typeof BuildProgress !== 'undefined') BuildProgress.start(hasPRM);
            if (settingsModule) settingsModule.setStatusText('Retrying with fallback...', '#f59e0b');
            // Defer to let UI render before blocking on JSON.stringify
            setTimeout(function() {
                window.callCpp('ProceduralTreeGenerate', JSON.stringify({
                    command: retryConfig.command || 'build_tree',
                    spells: state.lastSpellData.spells,
                    config: retryConfig.config || {},
                    fallback: true
                }));
            }, 0);
        }
    };
    if (typeof BuildProgress !== 'undefined' && BuildProgress.isActive()) {
        BuildProgress.fail(errorMsg, retryFn);
    }
    if (settingsModule) {
        settingsModule.setStatusText('Build failed: ' + error, '#ef4444');
    }
    if (typeof updateScanStatus === 'function') updateScanStatus(t('status.treeBuildFailed', {error: error}), 'error');
    var btn = document.getElementById(buildBtnId);
    if (btn) btn.disabled = false;
}

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

window.generateSimpleSchoolTree = generateSimpleSchoolTree;
window.startProceduralGenerate = startProceduralGenerate;
window.onProceduralClick = onProceduralClick;
window.resetProceduralButton = resetProceduralButton;
window.startProceduralTreeGenerate = startProceduralTreeGenerate;
window.onProceduralPlusClick = onProceduralPlusClick;
window.resetProceduralPlusButton = resetProceduralPlusButton;
window.applySchoolConfigsToUI = applySchoolConfigsToUI;
