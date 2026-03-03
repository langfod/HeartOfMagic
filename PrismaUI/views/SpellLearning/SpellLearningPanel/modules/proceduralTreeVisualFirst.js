/**
 * Procedural Tree Builder - Visual-First Generation
 *
 * Visual-first generation integration: calls C++ for fuzzy NLP analysis
 * and LLM configs, then uses JS-side visual-first layout.
 *
 * Depends on:
 * - modules/proceduralTreeConfig.js (filterBlacklistedSpells, filterWhitelistedSpells)
 * - modules/proceduralTreeGenerate.js (applySchoolConfigsToUI)
 * - modules/state.js (state, settings)
 * - modules/uiHelpers.js (updateStatus, setStatusIcon)
 * - modules/treeParser.js (TreeParser)
 */

// =============================================================================
// VISUAL-FIRST GENERATION
// =============================================================================

/**
 * Generate all trees using the visual-first layout system.
 * This calls C++ for LLM school configs, then uses visual-first layout in JS.
 */
function startVisualFirstGenerate() {
    console.log('[VisualFirst] Button clicked');

    // Disable button while generating
    var btn = document.getElementById('tgBuildBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-icon">...</span> Generating...';
    }

    if (!state.lastSpellData || !state.lastSpellData.spells) {
        updateStatus('Scanning spells first...');
        setStatusIcon('...');
        // Set flag to run visual-first after scan completes
        state.visualFirstPending = true;
        if (typeof startScan === 'function') {
            startScan(false);
        }
        return;
    }

    // Call C++ for LLM school configs
    startVisualFirstTreeConfig();
}

// Default prompt in case the UI element doesn't exist
var FALLBACK_AUTO_CONFIG_PROMPT =
    'Configure visual spell trees for ALL schools at once.\n\n' +
    '## SCHOOLS:\n{{ALL_SCHOOLS_DATA}}\n\n' +
    '## OPTIONS:\n' +
    '- shape: organic|radial|spiky|mountain|cloud|flame|tree|cascade|galaxy\n' +
    '- growth_behavior: fire_explosion|gentle_bloom|mountain_builder|portal_network|spider_web|ocean_wave|ancient_tree|crystal_growth|vine_crawl|nebula_burst\n' +
    '- branching_mode: fuzzy_groups|proximity\n' +
    '- slice_weight: 0.5-2.0\n' +
    '- density: 0.3-0.9\n' +
    '- branch_chance: 0.1-0.5 (base fork probability)\n' +
    '- branch_energy_gain: 0.05-0.25 (pressure buildup per non-branch)\n' +
    '- branch_energy_threshold: 1.0-3.0 (force branch at this energy)\n' +
    '- branch_subdivide_pool: true|false (fuzzy check each sub-branch)\n' +
    '- alt_path_min_distance: 2-8 (min edges for shortcut)\n' +
    '- alt_path_max_distance: 2-8 (max spatial distance in nodes)\n' +
    '- alt_path_probability: 0.1-0.7 (shortcut chance)\n' +
    '- alt_path_max_per_node: 1-4 (max shortcuts per node)\n\n' +
    'Return JSON with ALL schools:\n' +
    '{"SchoolName": {"shape": "...", "growth_behavior": "...", "branching_mode": "fuzzy_groups", "slice_weight": 1.0, "density": 0.6, "branch_chance": 0.25, "branch_energy_gain": 0.12, "branch_energy_threshold": 1.8, "branch_subdivide_pool": true, "alt_path_min_distance": 4, "alt_path_max_distance": 4, "alt_path_probability": 0.3, "alt_path_max_per_node": 2, "reasoning": "..."}, ...}';

/**
 * Build a summary of all schools with spell counts and sample spells.
 * Used to populate the {{ALL_SCHOOLS_DATA}} placeholder in the LLM prompt.
 */
function buildAllSchoolsSummary(spells) {
    var schoolData = {};

    // Group spells by school
    spells.forEach(function(spell) {
        var school = spell.school || 'Unknown';
        if (!school || school === 'null' || school === 'None') school = 'Hedge Wizard';

        if (!schoolData[school]) {
            schoolData[school] = {
                count: 0,
                spells: [],
                themes: {}
            };
        }

        schoolData[school].count++;
        schoolData[school].spells.push(spell);

        // Extract simple themes from spell name for fuzzy context
        var name = (spell.name || '').toLowerCase();
        var themeWords = ['fire', 'frost', 'ice', 'shock', 'lightning', 'flame', 'burn',
                         'heal', 'restore', 'ward', 'cure', 'protect', 'bless',
                         'summon', 'conjure', 'bound', 'soul', 'reanimate', 'call',
                         'calm', 'fear', 'frenzy', 'invisible', 'muffle', 'illusion',
                         'flesh', 'armor', 'detect', 'transmute', 'paralyze', 'light',
                         'undead', 'daedra', 'atronach', 'familiar', 'zombie'];

        themeWords.forEach(function(theme) {
            if (name.indexOf(theme) >= 0) {
                schoolData[school].themes[theme] = (schoolData[school].themes[theme] || 0) + 1;
            }
        });
    });

    // Build summary text
    var summaryLines = [];
    var schools = Object.keys(schoolData).sort();

    schools.forEach(function(school) {
        var data = schoolData[school];

        // Get top themes
        var themeList = Object.keys(data.themes)
            .map(function(t) { return { theme: t, count: data.themes[t] }; })
            .sort(function(a, b) { return b.count - a.count; })
            .slice(0, 5)
            .map(function(t) { return t.theme + '(' + t.count + ')'; });

        // Get sample spell names
        var sampleSpells = data.spells.slice(0, 8).map(function(s) { return s.name || 'Unknown'; });

        summaryLines.push('### ' + school + ' (' + data.count + ' spells)');
        if (themeList.length > 0) {
            summaryLines.push('Common themes: ' + themeList.join(', '));
        }
        summaryLines.push('Sample spells: ' + sampleSpells.join(', '));
        summaryLines.push('');
    });

    return {
        text: summaryLines.join('\n'),
        schools: schools,
        data: schoolData
    };
}

/**
 * Call C++ to get LLM school configurations AND run fuzzy NLP analysis.
 * C++ will:
 * 1. Call LLM for ALL schools at once (full context)
 * 2. Run TF-IDF/fuzzy matching to find spell relationships
 * 3. Return both configs and relationship data for visual-first layout
 */
function startVisualFirstTreeConfig() {
    updateStatus('Running C++ fuzzy analysis + LLM configs...');
    setStatusIcon('...');

    // Get LLM options from Visual-First specific checkbox (or fallback to shared one)
    var visualFirstLLMCheck = document.getElementById('visualFirstLLMCheck');
    var llmAutoConfigCheck = visualFirstLLMCheck || document.getElementById('llmAutoConfigCheck');
    var llmGroupsCheck = document.getElementById('llmGroupsCheck');

    // Build all-schools summary for LLM context
    var schoolsSummary = buildAllSchoolsSummary(state.lastSpellData.spells);
    console.log('[VisualFirst] Schools found:', schoolsSummary.schools.join(', '));

    // Get prompt template - use fallback if UI not available
    var autoConfigPrompt = '';
    if (typeof getAutoConfigPrompt === 'function') {
        autoConfigPrompt = getAutoConfigPrompt();
    }
    if (!autoConfigPrompt || autoConfigPrompt.length < 50) {
        console.warn('[VisualFirst] Auto-config prompt empty or too short, using fallback');
        autoConfigPrompt = FALLBACK_AUTO_CONFIG_PROMPT;
    }

    // Replace {{ALL_SCHOOLS_DATA}} placeholder with actual data
    autoConfigPrompt = autoConfigPrompt.replace('{{ALL_SCHOOLS_DATA}}', schoolsSummary.text);

    console.log('[VisualFirst] Auto-config prompt length:', autoConfigPrompt.length);
    console.log('[VisualFirst] Prompt includes', schoolsSummary.schools.length, 'schools context');

    // Build config for C++ - enable fuzzy analysis AND LLM config
    var config = {
        shape: 'organic',
        density: 0.6,
        seed: typeof getCurrentSeed === 'function' ? getCurrentSeed() : Date.now(),

        // ALWAYS run fuzzy NLP for visual-first (this determines spell relationships)
        run_fuzzy_analysis: true,

        // LLM auto-configuration for school shapes (uses checkbox setting)
        llm_auto_configure: {
            enabled: llmAutoConfigCheck ? llmAutoConfigCheck.checked : true,  // Default ON for visual-first
            prompt_template: autoConfigPrompt,
            // Process ALL schools in ONE LLM call for full context
            all_schools_at_once: true,
            schools_list: schoolsSummary.schools
        },

        // LLM groups for themed clustering (uses checkbox setting)
        llm_groups: {
            enabled: llmGroupsCheck ? llmGroupsCheck.checked : false,
            prompt_template: typeof getGroupPrompt === 'function' ? getGroupPrompt() : ''
        },

        // LLM keyword classification
        llm_keyword_classification: {
            enabled: (settings.treeGeneration && settings.treeGeneration.llm &&
                      settings.treeGeneration.llm.enabled &&
                      settings.treeGeneration.llm.keywordClassification) || false,
            batch_size: 100,
            min_confidence: 40
        },

        // Flag to tell C++ we want visual-first output format
        visual_first_mode: true,

        // Include fuzzy relationship data in response
        return_fuzzy_data: true,

        // Pass school summary for LLM context
        schools_summary: schoolsSummary.text
    };

    // Pass API credentials to C++ for LLM calls
    console.log('[VisualFirst] === LLM Configuration ===');
    console.log('[VisualFirst] Visual-First LLM checkbox:', visualFirstLLMCheck ? visualFirstLLMCheck.checked : 'N/A (using fallback)');
    console.log('[VisualFirst] Effective LLM enabled:', llmAutoConfigCheck ? llmAutoConfigCheck.checked : false);
    console.log('[VisualFirst] state.llmConfig exists:', !!state.llmConfig);
    console.log('[VisualFirst] API key length:', state.llmConfig && state.llmConfig.apiKey ? state.llmConfig.apiKey.length : 0);

    var llmWasRequested = llmAutoConfigCheck ? llmAutoConfigCheck.checked : false;
    var hasValidApiKey = state.llmConfig && state.llmConfig.apiKey && state.llmConfig.apiKey.length > 10;

    if (hasValidApiKey) {
        config.llm_api = {
            api_key: state.llmConfig.apiKey,
            model: state.llmConfig.model || 'openai/gpt-4o-mini',
            endpoint: 'https://openrouter.ai/api/v1/chat/completions'
        };
        console.log('[VisualFirst] LLM API configured, model:', config.llm_api.model);
    } else {
        // No API key - disable LLM in config regardless of checkbox
        if (llmWasRequested) {
            console.warn('[VisualFirst] LLM auto-config requested but no API key! Using defaults instead.');
            updateStatus('No API key - using default settings');
            // Override the config to disable LLM
            config.llm_auto_configure.enabled = false;
        }
        console.log('[VisualFirst] Running without LLM (default settings)');
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
        console.log('[VisualFirst] Tree generation settings applied:', config.tree_generation.link_strategy);
    }

    var request = {
        spells: filterWhitelistedSpells(filterBlacklistedSpells(state.lastSpellData.spells)),
        config: config
    };

    // Set flag so callback knows to use visual-first
    state.visualFirstConfigPending = true;

    if (window.callCpp) {
        console.log('[VisualFirst] Calling C++ for fuzzy analysis + LLM configs...');
        console.log('[VisualFirst] Spells:', state.lastSpellData.spells.length);
        console.log('[VisualFirst] LLM Auto-Config:', config.llm_auto_configure.enabled);
        console.log('[VisualFirst] LLM Groups:', config.llm_groups.enabled);
        // Defer to let UI render before blocking on JSON.stringify
        setTimeout(function() {
            window.callCpp('ProceduralTreeGenerate', JSON.stringify(request));
        }, 0);
    } else {
        console.warn('[VisualFirst] C++ bridge not available, using JS fallback');
        doVisualFirstGenerate({}, null);
    }
}

function resetVisualFirstButton() {
    var btn = document.getElementById('tgBuildBtn');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">[B]</span> Build Tree';
    }
}

/**
 * Called after C++ returns LLM configs (or directly with defaults).
 * Uses visual-first layout system with the provided school configs.
 *
 * Priority for config: LLM > UI Controls > Defaults
 */
function doVisualFirstGenerate(schoolConfigs, fuzzyData) {
    updateStatus('Generating visual-first layout...');
    setStatusIcon('...');

    console.log('');
    console.log('='.repeat(60));
    console.log('[VisualFirst] === STARTING VISUAL-FIRST GENERATION ===');
    console.log('='.repeat(60));

    // Log received configs
    console.log('[VisualFirst] Received school configs from C++:');
    if (schoolConfigs && Object.keys(schoolConfigs).length > 0) {
        for (var sc in schoolConfigs) {
            var cfg = schoolConfigs[sc];
            console.log('  ' + sc + ': shape=' + cfg.shape + ', density=' + cfg.density +
                        ', source=' + (cfg.source || '?'));
        }
    } else {
        console.log('  [EMPTY or NULL - will use UI/defaults]');
    }

    // Store fuzzy data for edge building
    var fuzzy = fuzzyData || {
        relationships: {},
        similarity_scores: {},
        groups: {},
        themes: {}
    };

    console.log('[VisualFirst] Fuzzy data:', Object.keys(fuzzy.relationships || {}).length, 'spell relationships');

    setTimeout(function() {
        try {
            var spellsBySchool = {};

            // Group spells by school (filter blacklisted and whitelisted)
            filterWhitelistedSpells(filterBlacklistedSpells(state.lastSpellData.spells)).forEach(function(spell) {
                var school = spell.school || 'Unknown';
                if (!school || school === 'null' || school === 'None' || school === '') {
                    school = 'Hedge Wizard';
                }
                if (!spellsBySchool[school]) spellsBySchool[school] = [];
                spellsBySchool[school].push(spell);
            });

            // Build configs: LLM > UI Controls > Defaults
            console.log('[VisualFirst] Building final configs for', Object.keys(spellsBySchool).length, 'schools');

            var finalConfigs = {};
            for (var schoolName in spellsBySchool) {
                var config = null;
                var source = 'default';

                console.log('[VisualFirst] --- Processing', schoolName, '(' + spellsBySchool[schoolName].length + ' spells) ---');

                // 1. Try LLM config first
                if (schoolConfigs && schoolConfigs[schoolName]) {
                    config = schoolConfigs[schoolName];
                    source = config.source || 'llm';
                    console.log('[VisualFirst]   LLM config found: shape=' + config.shape);
                } else {
                    console.log('[VisualFirst]   No LLM config for', schoolName);
                }

                // 2. Try UI controls (always read to get latest values)
                if (typeof getSchoolConfig === 'function') {
                    var uiConfig = getSchoolConfig(schoolName);
                    if (uiConfig) {
                        console.log('[VisualFirst]   UI config: shape=' + uiConfig.shape + ', density=' + uiConfig.density);
                        // If no LLM config, use UI config entirely
                        if (!config) {
                            config = uiConfig;
                            source = 'ui';
                        }
                        // If LLM config exists but UI has specific shape selected, prefer UI shape
                        else if (uiConfig.shape && uiConfig.shape !== 'organic') {
                            config.shape = uiConfig.shape;
                            console.log('[VisualFirst]   UI shape override:', uiConfig.shape);
                        }
                    } else {
                        console.log('[VisualFirst]   No UI config for', schoolName);
                    }
                } else {
                    console.log('[VisualFirst]   getSchoolConfig function not available');
                }

                // 3. Fall back to defaults
                if (!config) {
                    config = {
                        shape: 'organic',
                        density: 0.6,
                        convergence_chance: 0.4,
                        slice_weight: 1.0,
                        jitter: 30
                    };
                    console.log('[VisualFirst] Using defaults for', schoolName);
                }

                // Read global branching mode from Visual-First dropdown
                var globalBranchingMode = document.getElementById('visualFirstBranchingMode');
                var branchingMode = globalBranchingMode ? globalBranchingMode.value : 'fuzzy_groups';

                // Ensure all required fields exist
                config.shape = config.shape || 'organic';
                config.density = config.density || 0.6;
                config.convergence_chance = config.convergence_chance || config.convergence || 0.4;
                config.slice_weight = config.slice_weight || 1.0;
                config.jitter = config.jitter || 30;
                config.source = source;

                // Apply branching mode (global from UI > LLM > per-school UI)
                config.branching_mode = config.branching_mode || branchingMode;

                console.log('[VisualFirst]   Branching mode:', config.branching_mode);

                finalConfigs[schoolName] = config;
            }

            console.log('[VisualFirst] Final configs:', finalConfigs);
            console.log('[VisualFirst] Spell counts:', Object.keys(spellsBySchool).map(function(s) { return s + ': ' + spellsBySchool[s].length; }));

            // Apply configs to UI for display
            if (typeof applySchoolConfigsToUI === 'function') {
                applySchoolConfigsToUI(finalConfigs);
            }

            // USE NEW SETTINGS-AWARE BUILDER (unified scoring, guaranteed element isolation)
            if (typeof buildAllTreesSettingsAware === 'function') {
                console.log('[ComplexBuild] ====== USING NEW SettingsAwareBuilder ======');
                console.log('[ComplexBuild] settings.treeGeneration exists:', !!settings.treeGeneration);
                if (settings.treeGeneration) {
                    console.log('[ComplexBuild] SETTINGS BEING PASSED:');
                    console.log('[ComplexBuild]   rootCount:', settings.treeGeneration.rootCount);
                    console.log('[ComplexBuild]   elementIsolation:', settings.treeGeneration.elementIsolation);
                    console.log('[ComplexBuild]   elementIsolationStrict:', settings.treeGeneration.elementIsolationStrict);
                    console.log('[ComplexBuild]   strictTierOrdering:', settings.treeGeneration.strictTierOrdering);
                    console.log('[ComplexBuild]   linkStrategy:', settings.treeGeneration.linkStrategy);
                    console.log('[ComplexBuild]   maxChildrenPerNode:', settings.treeGeneration.maxChildrenPerNode);
                }

                // Filter spells
                var filteredSpells = filterWhitelistedSpells(filterBlacklistedSpells(state.lastSpellData.spells));

                // Build tree using new unified builder - PASS C++ NLP FUZZY DATA!
                // fuzzy contains: themes, groups, relationships, similarity_scores from C++ TF-IDF
                console.log('[ComplexBuild] Passing fuzzy data to builder:', Object.keys(fuzzy));
                if (fuzzy.themes) {
                    console.log('[ComplexBuild]   NLP discovered themes:', Object.keys(fuzzy.themes));
                }
                if (fuzzy.groups) {
                    console.log('[ComplexBuild]   NLP spell groups:', Object.keys(fuzzy.groups).length);
                }
                var treeData = buildAllTreesSettingsAware(filteredSpells, finalConfigs, settings.treeGeneration, fuzzy);

                // Log build results
                console.log('[ComplexBuild] Build complete - generator:', treeData.generator);
                console.log('[ComplexBuild] Settings used:', JSON.stringify(treeData.settings));

                // DIAGNOSTIC: Check tree data before loadTreeData
                console.log('[ComplexBuild] === Tree structure ===');
                for (var scName in treeData.schools) {
                    var school = treeData.schools[scName];
                    var nodeCount = school.nodes ? school.nodes.length : 0;
                    var linkCount = school.links ? school.links.length : 0;
                    console.log('[ComplexBuild] ' + scName + ': ' + nodeCount + ' nodes, ' + linkCount + ' links');
                }

                // Load into UI (WheelRenderer will calculate positions via layoutRadial)
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
                var totalNodes = 0;
                for (var school in treeData.schools) {
                    totalNodes += treeData.schools[school].nodes.length;
                }

                var llmCount = 0;
                for (var sc in finalConfigs) {
                    if (finalConfigs[sc].source === 'llm') llmCount++;
                }

                var statusMsg = 'Settings-Aware Build: ' + schoolCount + ' schools, ' + totalNodes + ' spells';
                if (llmCount > 0) {
                    statusMsg += ' (LLM configs: ' + llmCount + ')';
                }
                updateStatus(statusMsg);
                setStatusIcon('OK');

                if (window.callCpp) window.callCpp('SaveSpellTree', JSON.stringify(treeData));

                setTimeout(function() {
                    switchTab('spellTree');
                }, 300);
            } else {
                console.error('[ComplexBuild] buildAllTreesSettingsAware not available! Check if settingsAwareTreeBuilder.js is loaded.');
                updateStatus('Settings-aware builder not loaded');
                setStatusIcon('X');
            }

        } catch (e) {
            console.error('[VisualFirst] Error:', e);
            updateStatus('Visual-first failed: ' + e.message);
            setStatusIcon('X');
        }
        resetVisualFirstButton();
    }, 50);
}

window.startVisualFirstGenerate = startVisualFirstGenerate;
window.startVisualFirstTreeConfig = startVisualFirstTreeConfig;
window.doVisualFirstGenerate = doVisualFirstGenerate;
window.resetVisualFirstButton = resetVisualFirstButton;
