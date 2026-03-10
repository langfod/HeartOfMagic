/**
 * Generation Mode Core
 * Handles the generation panel initialization, seed controls, LLM prompt helpers,
 * visual-first configuration UI, and generation options.
 *
 * Depends on: state.js (state, settings), uiHelpers.js (updateStatus)
 */

// =============================================================================
// DEFAULT LLM PROMPTS
// =============================================================================

var DEFAULT_AUTO_CONFIG_PROMPT =
    'You are configuring visual spell trees for ALL magic schools at once.\n' +
    'Consider how schools should relate to each other visually - contrasts, similarities.\n\n' +
    '## SCHOOLS DATA:\n' +
    '{{ALL_SCHOOLS_DATA}}\n\n' +
    '## SHAPE OPTIONS - Visual silhouette of each tree:\n' +
    '- "organic": Natural flowing, irregular (nature/life magic)\n' +
    '- "radial": Even spread like a sun (holy/light magic)\n' +
    '- "spiky": Aggressive jutting branches (destruction/chaos)\n' +
    '- "mountain": Wide base narrowing to peak (earth/alteration)\n' +
    '- "cloud": Clustered groupings (illusion/mystery)\n' +
    '- "flame": Flickering upward (fire magic)\n' +
    '- "tree": Trunk with spreading canopy (nature/growth)\n' +
    '- "cascade": Flowing tiers (water/flow)\n' +
    '- "galaxy": Spiral arms (cosmic/summoning)\n\n' +
    '## GROWTH BEHAVIORS - How the tree grows from root:\n' +
    '- "fire_explosion": Bursts outward aggressively, reaches for sky. Many hubs, radial branching.\n' +
    '- "gentle_bloom": Fills each layer before growing up. Compact, nurturing, terminal clusters.\n' +
    '- "mountain_builder": Builds solid foundation, very compact. High fill threshold, few hubs.\n' +
    '- "portal_network": Creates hub portals spawning distant clusters. Chaotic, many hubs.\n' +
    '- "spider_web": Weaves intricate interconnected web. Many cross-connections, balanced growth.\n' +
    '- "ocean_wave": Flows like waves, building then crashing. Undulating, periodic growth.\n' +
    '- "ancient_tree": Thick trunk, spreading branches, leaf clusters at ends.\n' +
    '- "crystal_growth": Geometric, angular formation. Low variance, structured hubs.\n' +
    '- "vine_crawl": Spreads horizontally, occasionally shoots up. High spread, linear chains.\n' +
    '- "nebula_burst": Starts tight, explodes outward. Phase-dependent massive spread.\n\n' +
    '## BRANCHING MODE:\n' +
    '- "fuzzy_groups": Organic growth based on spell theme similarity (recommended)\n' +
    '- "proximity": Grid-based layout with proximity connections\n\n' +
    '## OTHER PARAMETERS:\n' +
    '- slice_weight (0.5-2.0): Visual presence. 1.0=proportional, 1.5=prominent, 0.7=subtle\n' +
    '- symmetry (0.0-1.0): How symmetrical/centered the tree grows. LOW=organic spread, HIGH=centered/ordered\n' +
    '- outward_growth (0.0-1.0): How aggressively tree spreads outward. LOW=compact near center, HIGH=reaches far out\n' +
    '- density (0.3-0.9): Node packing. LOW=scattered, HIGH=tight\n\n' +
    '## BRANCHING ENERGY (how trees fork into sub-branches):\n' +
    '- branch_chance (0.1-0.5): Base probability of creating a new branch at each node\n' +
    '- branch_energy_gain (0.05-0.25): Energy gained per node that doesn\'t branch (builds up pressure)\n' +
    '- branch_energy_threshold (1.0-3.0): Force branch when energy reaches this (prevents long linear runs)\n' +
    '- branch_subdivide_pool (true/false): When branching, do fresh fuzzy check on spell pool for each sub-branch\n\n' +
    '## ALTERNATE PATH PARAMETERS (create shortcuts between nodes):\n' +
    '- alt_path_min_distance (2-8): Only create shortcut if existing path is this many edges. Higher=fewer shortcuts\n' +
    '- alt_path_max_distance (2-8): Max spatial distance (in node sizes) for shortcuts. Lower=tighter clusters\n' +
    '- alt_path_probability (0.1-0.7): Base chance to create shortcut. Higher=more interconnected\n' +
    '- alt_path_max_per_node (1-4): Max shortcuts per node. Higher=more web-like\n\n' +
    '## THEMATIC GUIDANCE:\n' +
    '- Make schools VISUALLY DISTINCT - avoid giving similar configs\n' +
    '- Consider the school\'s fuzzy themes when choosing behavior\n' +
    '- Destruction should feel aggressive; Restoration nurturing; Illusion mysterious\n' +
    '- Large schools (500+ spells) need behaviors that spread well (portal_network, fire_explosion)\n' +
    '- Small schools (100-200) work well with compact behaviors (mountain_builder, gentle_bloom)\n\n' +
    'Return ONLY valid JSON with ALL schools:\n' +
    '{\n' +
    '  "SchoolName1": {\n' +
    '    "shape": "spiky|organic|radial|mountain|cloud|flame|tree|cascade|galaxy",\n' +
    '    "growth_behavior": "fire_explosion|gentle_bloom|mountain_builder|portal_network|spider_web|ocean_wave|ancient_tree|crystal_growth|vine_crawl|nebula_burst",\n' +
    '    "branching_mode": "fuzzy_groups|proximity",\n' +
    '    "slice_weight": 0.5-2.0,\n' +
    '    "symmetry": 0.0-1.0,\n' +
    '    "outward_growth": 0.0-1.0,\n' +
    '    "density": 0.3-0.9,\n' +
    '    "branch_chance": 0.1-0.5,\n' +
    '    "branch_energy_gain": 0.05-0.25,\n' +
    '    "branch_energy_threshold": 1.0-3.0,\n' +
    '    "branch_subdivide_pool": true|false,\n' +
    '    "alt_path_min_distance": 2-8,\n' +
    '    "alt_path_max_distance": 2-8,\n' +
    '    "alt_path_probability": 0.1-0.7,\n' +
    '    "alt_path_max_per_node": 1-4,\n' +
    '    "reasoning": "brief explanation"\n' +
    '  },\n' +
    '  "SchoolName2": { ... }\n' +
    '}';

var DEFAULT_GROUP_PROMPT =
    'You are analyzing spell groups for a magic skill tree.\n\n' +
    'GROUP: Common keywords: {{GROUP_KEYWORDS}}\n' +
    'SAMPLE SPELLS:\n' +
    '{{SPELL_LIST}}\n\n' +
    'Decide:\n' +
    '1. GROUP_NAME: A thematic name (e.g., "Pyromancy", "Inferno Arts")\n' +
    '2. GROUP_COLOR: Hex color that fits the theme (e.g., "#FF4500")\n' +
    '3. GROWTH_STYLE: One of [dense, sparse, linear, branchy, clustered]\n' +
    '4. BRANCHING_ENERGY: {"min_straight": 1-5, "max_straight": 3-8}\n' +
    '5. SPECIAL_RULE: Optional unique behavior (e.g., "chain_to_same_element")\n\n' +
    'Return JSON only.';

// Available shapes
var AVAILABLE_SHAPES = [
    'organic', 'radial', 'grid', 'cascade',
    'mountain', 'spiky', 'cloud', 'linear',
    'tree', 'swords', 'portals', 'explosion'
];

// =============================================================================
// INITIALIZATION
// =============================================================================

function initGenerationModeUI() {
    // Load saved LLM prompts from localStorage
    loadLLMPrompts();

    // Initialize seed controls
    initSeedControls();

    // Setup collapsible LLM settings
    var llmHeader = document.getElementById('llmSettingsHeader');
    var llmContent = document.getElementById('llmSettingsContent');
    if (llmHeader && llmContent) {
        llmHeader.addEventListener('click', function() {
            llmContent.classList.toggle('hidden');
            var toggle = llmHeader.querySelector('.section-toggle');
            if (toggle) toggle.textContent = llmContent.classList.contains('hidden') ? '▼' : '▲';
        });
    }

    // LLM API Settings button (toggles settings panel visibility)
    var llmApiSettingsBtn = document.getElementById('llmApiSettingsBtn');
    if (llmApiSettingsBtn) {
        llmApiSettingsBtn.addEventListener('click', function() {
            var settingsPanel = document.getElementById('settingsPanel');
            if (settingsPanel) {
                // Toggle visibility
                if (settingsPanel.classList.contains('hidden')) {
                    settingsPanel.classList.remove('hidden');
                    // Scroll to make it visible
                    settingsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } else {
                    settingsPanel.classList.add('hidden');
                }
            }
        });
    }

    // LLM auto-config checkbox - save state when changed
    var llmAutoConfigCheckbox = document.getElementById('visualFirstLLMCheck');
    if (llmAutoConfigCheckbox) {
        llmAutoConfigCheckbox.addEventListener('change', function() {
            console.log('[GenerationModeUI] LLM auto-config changed:', this.checked);
            // Auto-save settings
            if (typeof autoSaveSettings === 'function') {
                autoSaveSettings();
            }
        });
    }

    // Reset prompt buttons
    var resetAutoBtn = document.getElementById('resetAutoConfigPromptBtn');
    if (resetAutoBtn) {
        resetAutoBtn.addEventListener('click', function() {
            var area = document.getElementById('autoConfigPromptArea');
            if (area) {
                area.value = DEFAULT_AUTO_CONFIG_PROMPT;
                saveLLMPrompts();
            }
        });
    }

    var resetGroupBtn = document.getElementById('resetGroupPromptBtn');
    if (resetGroupBtn) {
        resetGroupBtn.addEventListener('click', function() {
            var area = document.getElementById('groupPromptArea');
            if (area) {
                area.value = DEFAULT_GROUP_PROMPT;
                saveLLMPrompts();
            }
        });
    }

    // Save prompts on change
    var autoArea = document.getElementById('autoConfigPromptArea');
    if (autoArea) autoArea.addEventListener('change', saveLLMPrompts);

    var groupArea = document.getElementById('groupPromptArea');
    if (groupArea) groupArea.addEventListener('change', saveLLMPrompts);

    // NEW: Generate Final Prompt button
    var generateFinalPromptBtn = document.getElementById('generateFinalPromptBtn');
    if (generateFinalPromptBtn) {
        generateFinalPromptBtn.addEventListener('click', generateFinalPrompt);
    }

    // NEW: Copy final prompt button
    var copyFinalPromptBtn = document.getElementById('copyFinalPromptBtn');
    if (copyFinalPromptBtn) {
        copyFinalPromptBtn.addEventListener('click', function() {
            var finalPromptArea = document.getElementById('finalPromptArea');
            if (finalPromptArea && finalPromptArea.value) {
                navigator.clipboard.writeText(finalPromptArea.value).then(function() {
                    copyFinalPromptBtn.textContent = t('generationMode.copied');
                    setTimeout(function() { copyFinalPromptBtn.textContent = t('generationMode.copy'); }, 1500);
                });
            }
        });
    }

    // NEW: Paste LLM response button
    var pasteLLMResponseBtn = document.getElementById('pasteLLMResponseBtn');
    if (pasteLLMResponseBtn) {
        pasteLLMResponseBtn.addEventListener('click', function() {
            navigator.clipboard.readText().then(function(text) {
                var llmResponseArea = document.getElementById('llmResponseArea');
                if (llmResponseArea) {
                    llmResponseArea.value = text;
                }
            });
        });
    }

    // NEW: Clear LLM response button
    var clearLLMResponseBtn = document.getElementById('clearLLMResponseBtn');
    if (clearLLMResponseBtn) {
        clearLLMResponseBtn.addEventListener('click', function() {
            var llmResponseArea = document.getElementById('llmResponseArea');
            if (llmResponseArea) {
                llmResponseArea.value = '';
            }
        });
    }

    // NEW: Apply LLM response button
    var applyLLMResponseBtn = document.getElementById('applyLLMResponseBtn');
    if (applyLLMResponseBtn) {
        applyLLMResponseBtn.addEventListener('click', applyLLMResponse);
    }

    // NEW: Reset to default config button
    var resetToDefaultConfigBtn = document.getElementById('resetToDefaultConfigBtn');
    if (resetToDefaultConfigBtn) {
        resetToDefaultConfigBtn.addEventListener('click', function() {
            var currentConfigArea = document.getElementById('currentConfigArea');
            if (currentConfigArea) {
                currentConfigArea.value = JSON.stringify(getDefaultVisualFirstConfig(), null, 2);
                saveCurrentConfig();
            }
        });
    }

    // NEW: Clear tree button on spell scan page
    var clearTreeScanBtn = document.getElementById('clear-tree-scan-btn');
    if (clearTreeScanBtn) {
        clearTreeScanBtn.addEventListener('click', function() {
            if (confirm(t('generationMode.clearTreeConfirm'))) {
                if (typeof clearTree === 'function') {
                    clearTree();
                } else {
                    state.treeData = null;
                    if (typeof WheelRenderer !== 'undefined') {
                        WheelRenderer.clear();
                    }
                    console.log('[SpellLearning] Tree cleared');
                }
            }
        });
    }

    // Load current config
    loadCurrentConfig();

    // Collapse all schools button
    var collapseBtn = document.getElementById('collapseAllSchoolsBtn');
    if (collapseBtn) {
        collapseBtn.addEventListener('click', collapseAllSchoolPanels);
    }

    console.log('[GenerationModeUI] Initialized');
}

// =============================================================================
// SEED MANAGEMENT
// =============================================================================

function initSeedControls() {
    var seedInput = document.getElementById('seedInput');
    var newSeedBtn = document.getElementById('newSeedBtn');

    if (seedInput) {
        // Load saved seed or generate new one
        var savedSeed = localStorage.getItem('spellTreeSeed');
        if (savedSeed) {
            seedInput.value = savedSeed;
        } else {
            generateNewSeed();
        }

        // Save seed when changed
        seedInput.addEventListener('change', function() {
            localStorage.setItem('spellTreeSeed', seedInput.value);
            console.log('[Seed] Updated to:', seedInput.value);
        });
    }

    if (newSeedBtn) {
        newSeedBtn.addEventListener('click', generateNewSeed);
    }
}

function generateNewSeed() {
    var seedInput = document.getElementById('seedInput');
    if (seedInput) {
        // Generate random seed between 1 and 999999999
        var newSeed = Math.floor(Math.random() * 999999999) + 1;
        seedInput.value = newSeed;
        localStorage.setItem('spellTreeSeed', newSeed);
        console.log('[Seed] Generated new seed:', newSeed);
    }
}

function getCurrentSeed() {
    var seedInput = document.getElementById('seedInput');
    if (seedInput && seedInput.value) {
        return parseInt(seedInput.value, 10);
    }
    // Return random seed if none set
    return Math.floor(Math.random() * 999999999) + 1;
}

// Export for use by proceduralTreeBuilder
window.getCurrentSeed = getCurrentSeed;
window.generateNewSeed = generateNewSeed;

// =============================================================================
// LLM PROMPT MANAGEMENT
// =============================================================================

function loadLLMPrompts() {
    var autoArea = document.getElementById('autoConfigPromptArea');
    var groupArea = document.getElementById('groupPromptArea');

    var savedAuto = localStorage.getItem('spellLearning_autoConfigPrompt');
    var savedGroup = localStorage.getItem('spellLearning_groupPrompt');

    if (autoArea) autoArea.value = savedAuto || DEFAULT_AUTO_CONFIG_PROMPT;
    if (groupArea) groupArea.value = savedGroup || DEFAULT_GROUP_PROMPT;
}

function saveLLMPrompts() {
    var autoArea = document.getElementById('autoConfigPromptArea');
    var groupArea = document.getElementById('groupPromptArea');

    if (autoArea) localStorage.setItem('spellLearning_autoConfigPrompt', autoArea.value);
    if (groupArea) localStorage.setItem('spellLearning_groupPrompt', groupArea.value);
}

function getAutoConfigPrompt() {
    var area = document.getElementById('autoConfigPromptArea');
    return area ? area.value : DEFAULT_AUTO_CONFIG_PROMPT;
}

function getGroupPrompt() {
    var area = document.getElementById('groupPromptArea');
    return area ? area.value : DEFAULT_GROUP_PROMPT;
}

// =============================================================================
// MANUAL LLM WORKFLOW (for users without API key)
// =============================================================================

/**
 * Get default configuration for Visual First generation.
 * This is used when LLM auto-config is disabled.
 */
function getDefaultVisualFirstConfig() {
    return {
        Alteration: { shape: 'organic', density: 'medium', node_spacing: 1.0, branching: 'balanced' },
        Conjuration: { shape: 'organic', density: 'medium', node_spacing: 1.0, branching: 'balanced' },
        Destruction: { shape: 'organic', density: 'high', node_spacing: 0.9, branching: 'expansive' },
        Illusion: { shape: 'organic', density: 'low', node_spacing: 1.1, branching: 'sparse' },
        Restoration: { shape: 'organic', density: 'medium', node_spacing: 1.0, branching: 'balanced' }
    };
}

/**
 * Generate the final prompt by substituting variables in the template.
 * User can copy this and paste into an online LLM.
 */
function generateFinalPrompt() {
    var finalPromptArea = document.getElementById('finalPromptArea');
    if (!finalPromptArea) return;

    // Get the template
    var template = getAutoConfigPrompt();

    // Get current spell data
    var spellData = state.outputData || state.lastScanData || null;

    if (!spellData || !spellData.schools) {
        finalPromptArea.value = t('generationMode.noSpellDataError');
        return;
    }

    // Build spell list summary for each school
    var schoolSummaries = [];
    Object.keys(spellData.schools).forEach(function(schoolName) {
        var school = spellData.schools[schoolName];
        var spellCount = school.spells ? school.spells.length : 0;
        var spellNames = school.spells ? school.spells.slice(0, 20).map(function(s) { return s.name; }).join(', ') : '';
        if (spellCount > 20) spellNames += '... (' + (spellCount - 20) + ' more)';
        schoolSummaries.push(schoolName + ': ' + spellCount + ' spells - ' + spellNames);
    });

    // Available shapes
    var availableShapes = ['organic', 'radial', 'linear', 'cascade', 'mountain', 'cloud', 'spiky', 'grid'];

    // Replace variables
    var finalPrompt = template
        .replace(/\{\{SCHOOL_NAMES\}\}/g, Object.keys(spellData.schools).join(', '))
        .replace(/\{\{SPELL_LIST\}\}/g, schoolSummaries.join('\\n'))
        .replace(/\{\{AVAILABLE_SHAPES\}\}/g, availableShapes.join(', '))
        .replace(/\{\{TOTAL_SPELLS\}\}/g, Object.keys(spellData.schools).reduce(function(sum, k) {
            return sum + (spellData.schools[k].spells ? spellData.schools[k].spells.length : 0);
        }, 0));

    finalPromptArea.value = finalPrompt;
    console.log('[LLMWorkflow] Generated final prompt');
}

/**
 * Apply the pasted LLM response as the current config.
 */
function applyLLMResponse() {
    var llmResponseArea = document.getElementById('llmResponseArea');
    var currentConfigArea = document.getElementById('currentConfigArea');

    if (!llmResponseArea || !currentConfigArea) return;

    var responseText = llmResponseArea.value.trim();
    if (!responseText) {
        alert(t('generationMode.noLlmResponse'));
        return;
    }

    try {
        // Try to parse as JSON
        var parsed = JSON.parse(responseText);
        currentConfigArea.value = JSON.stringify(parsed, null, 2);
        saveCurrentConfig();
        console.log('[LLMWorkflow] Applied LLM response as config');
        alert(t('generationMode.configApplied'));
    } catch (e) {
        // Try to extract JSON from response
        var jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                var extracted = JSON.parse(jsonMatch[0]);
                currentConfigArea.value = JSON.stringify(extracted, null, 2);
                saveCurrentConfig();
                console.log('[LLMWorkflow] Extracted and applied JSON from response');
                alert(t('generationMode.configExtracted'));
            } catch (e2) {
                alert(t('generationMode.cannotParseJson'));
            }
        } else {
            alert(t('generationMode.noValidJson'));
        }
    }
}

/**
 * Load current config from storage or defaults.
 */
function loadCurrentConfig() {
    var currentConfigArea = document.getElementById('currentConfigArea');
    if (!currentConfigArea) return;

    var savedConfig = localStorage.getItem('spellLearning_visualFirstConfig');
    if (savedConfig) {
        currentConfigArea.value = savedConfig;
    } else {
        currentConfigArea.value = JSON.stringify(getDefaultVisualFirstConfig(), null, 2);
    }
}

/**
 * Save current config to storage.
 */
function saveCurrentConfig() {
    var currentConfigArea = document.getElementById('currentConfigArea');
    if (!currentConfigArea) return;

    localStorage.setItem('spellLearning_visualFirstConfig', currentConfigArea.value);
}

/**
 * Get the current visual first config (from manual config or defaults).
 */
function getVisualFirstConfig() {
    var currentConfigArea = document.getElementById('currentConfigArea');
    if (currentConfigArea && currentConfigArea.value.trim()) {
        try {
            return JSON.parse(currentConfigArea.value);
        } catch (e) {
            console.warn('[LLMWorkflow] Invalid config in text area, using defaults');
        }
    }
    return getDefaultVisualFirstConfig();
}

// Export for use by other modules
window.getDefaultVisualFirstConfig = getDefaultVisualFirstConfig;
window.getVisualFirstConfig = getVisualFirstConfig;
window.generateFinalPrompt = generateFinalPrompt;

// =============================================================================
// GENERATION OPTIONS
// =============================================================================

function getGenerationOptions() {
    return {
        jsRandomSettings: document.getElementById('jsRandomSettingsCheck')?.checked || false,
        llmAutoConfig: document.getElementById('llmAutoConfigCheck')?.checked || false,
        llmGroups: document.getElementById('llmGroupsCheck')?.checked || false,
        autoConfigPrompt: getAutoConfigPrompt(),
        groupPrompt: getGroupPrompt()
    };
}

// =============================================================================
// EXPORTS
// =============================================================================

window.initGenerationModeUI = initGenerationModeUI;
window.getGenerationOptions = getGenerationOptions;
window.getAutoConfigPrompt = getAutoConfigPrompt;
window.getGroupPrompt = getGroupPrompt;
window.getCurrentSeed = getCurrentSeed;
window.generateNewSeed = generateNewSeed;
