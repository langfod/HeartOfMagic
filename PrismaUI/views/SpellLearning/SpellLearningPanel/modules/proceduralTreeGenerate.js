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
    var placementGrid = new PlacementGrid(gridCfg.minNodeSpacing);
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
            while (attempts < 10 && hasOverlap(x, y, placedPositions, minSpacing, placementGrid)) {
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
            placementGrid.add(x, y);
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
