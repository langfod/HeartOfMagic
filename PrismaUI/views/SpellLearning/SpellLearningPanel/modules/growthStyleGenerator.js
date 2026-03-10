/**
 * Growth Style Generator UI
 * LLM-powered generation of growth style recipes for spell trees.
 *
 * Depends on: state.js (settings, state), llmIntegration.js (callOpenRouterAPI - when using C++ bridge),
 *             growthDSL.js (GROWTH_DSL), uiHelpers.js (setTreeStatus)
 */

// Store generated recipes (only if not defined by modules)
if (typeof generatedGrowthRecipes === 'undefined') {
    var generatedGrowthRecipes = {};
}

function initializeGrowthStyleGenerator() {
    var header = document.getElementById('growthStyleHeader');
    var content = document.getElementById('growthStyleContent');
    var generateBtn = document.getElementById('generateStylesBtn');
    var applyBtn = document.getElementById('applyStylesBtn');

    if (!header || !content) {
        console.log('[GrowthDSL] UI elements not found');
        return;
    }

    // Collapsible header
    header.addEventListener('click', function() {
        header.classList.toggle('collapsed');
    });

    // Generate styles button
    if (generateBtn) {
        generateBtn.addEventListener('click', function() {
            onGenerateGrowthStyles();
        });
    }

    // Apply to tree button
    if (applyBtn) {
        applyBtn.addEventListener('click', function() {
            onApplyGrowthStyles();
        });
    }

    console.log('[GrowthDSL] UI initialized');
}

function onGenerateGrowthStyles() {
    var statusEl = document.getElementById('growthStatus');
    var applyBtn = document.getElementById('applyStylesBtn');
    var container = document.getElementById('schoolStylesContainer');

    // Check if we have scanned spells
    if (!state.treeData || !state.treeData.rawData || !state.treeData.rawData.schools) {
        if (statusEl) {
            statusEl.textContent = 'Scan spells first, then generate styles.';
            statusEl.className = 'growth-status error';
        }
        return;
    }

    // Get schools from tree data
    var schools = Object.keys(state.treeData.rawData.schools);
    if (schools.length === 0) {
        if (statusEl) {
            statusEl.textContent = 'No schools found in tree data.';
            statusEl.className = 'growth-status error';
        }
        return;
    }

    // Update status
    if (statusEl) {
        statusEl.textContent = 'Generating styles for ' + schools.length + ' schools...';
        statusEl.className = 'growth-status processing';
    }

    // Clear container
    if (container) {
        container.innerHTML = '<div class="growth-loading">Generating...</div>';
    }

    // Prepare school data
    var schoolData = schools.map(function(name) {
        var school = state.treeData.rawData.schools[name];
        return {
            name: name,
            spells: school ? (school.spells || []) : []
        };
    });

    // Generate via LLM
    generateGrowthRecipesViaLLM(schoolData, function(result) {
        generatedGrowthRecipes = result.recipes || {};

        if (statusEl) {
            if (result.success) {
                statusEl.textContent = 'Generated styles for all schools!';
                statusEl.className = 'growth-status success';
            } else if (result.failed && result.failed.length > 0) {
                statusEl.textContent = 'Generated styles (' + result.failed.length + ' used defaults)';
                statusEl.className = 'growth-status';
            } else {
                statusEl.textContent = 'Using default styles (no API key)';
                statusEl.className = 'growth-status';
            }
        }

        // Enable apply button
        if (applyBtn) {
            applyBtn.disabled = false;
        }

        // Display school style cards
        displaySchoolStyleCards(generatedGrowthRecipes);
    });
}

function displaySchoolStyleCards(recipes) {
    var container = document.getElementById('schoolStylesContainer');
    if (!container) return;

    container.innerHTML = '';

    var schoolNames = Object.keys(recipes);
    schoolNames.forEach(function(schoolName) {
        var recipe = recipes[schoolName];

        var card = document.createElement('div');
        card.className = 'school-style-card';
        card.dataset.school = schoolName;

        var header = document.createElement('div');
        header.className = 'school-style-header';

        var name = document.createElement('span');
        name.className = 'school-style-name ' + schoolName;
        name.textContent = schoolName;

        var actions = document.createElement('div');
        actions.className = 'school-style-actions';

        var detailsBtn = document.createElement('button');
        detailsBtn.className = 'btn-icon';
        detailsBtn.title = 'Show/hide details';
        detailsBtn.textContent = '[C]';
        detailsBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            card.classList.toggle('expanded');
        });

        var regenerateBtn = document.createElement('button');
        regenerateBtn.className = 'btn-icon';
        regenerateBtn.title = 'Regenerate this school';
        regenerateBtn.textContent = '[R]';
        regenerateBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            regenerateSchoolStyle(schoolName);
        });

        actions.appendChild(detailsBtn);
        actions.appendChild(regenerateBtn);

        header.appendChild(name);
        header.appendChild(actions);

        var rationale = document.createElement('div');
        rationale.className = 'school-style-rationale';
        rationale.textContent = recipe.rationale || 'Default style';

        var details = document.createElement('div');
        details.className = 'school-style-details';
        details.textContent = JSON.stringify({
            volume: recipe.volume,
            growth: recipe.growth,
            modifiers: recipe.modifiers
        }, null, 1);

        card.appendChild(header);
        card.appendChild(rationale);
        card.appendChild(details);

        container.appendChild(card);
    });
}

function regenerateSchoolStyle(schoolName) {
    var statusEl = document.getElementById('growthStatus');
    if (statusEl) {
        statusEl.textContent = 'Regenerating style for ' + schoolName + '...';
        statusEl.className = 'growth-status processing';
    }

    // Get school data
    var spells = [];
    if (state.treeData && state.treeData.rawData && state.treeData.rawData.schools[schoolName]) {
        spells = state.treeData.rawData.schools[schoolName].spells || [];
    }

    generateGrowthRecipesViaLLM([{ name: schoolName, spells: spells }], function(result) {
        if (result.recipes && result.recipes[schoolName]) {
            generatedGrowthRecipes[schoolName] = result.recipes[schoolName];

            if (statusEl) {
                statusEl.textContent = 'Regenerated style for ' + schoolName;
                statusEl.className = 'growth-status success';
            }

            // Refresh display
            displaySchoolStyleCards(generatedGrowthRecipes);
        } else {
            if (statusEl) {
                statusEl.textContent = 'Failed to regenerate - using default';
                statusEl.className = 'growth-status error';
            }
        }
    });
}

function onApplyGrowthStyles() {
    if (!generatedGrowthRecipes || Object.keys(generatedGrowthRecipes).length === 0) {
        console.warn('[GrowthDSL] No recipes to apply');
        return;
    }

    // Apply recipes to WheelRenderer
    var applied = 0;
    for (var schoolName in generatedGrowthRecipes) {
        if (WheelRenderer.applyGrowthRecipe(schoolName, generatedGrowthRecipes[schoolName])) {
            console.log('[GrowthDSL] Stored recipe for ' + schoolName + ':', JSON.stringify(generatedGrowthRecipes[schoolName]).substring(0, 200));
            applied++;
        }
    }

    console.log('[GrowthDSL] Stored ' + applied + ' growth recipes, now re-laying out tree...');

    // RE-LAYOUT tree (not just render) - modifiers are applied during layout!
    if (state.treeData && WheelRenderer.nodes.length > 0) {
        WheelRenderer.layout();  // This applies the modifiers
        WheelRenderer.render();  // This draws the result
        setTreeStatus('Applied visual styles to tree');
        console.log('[GrowthDSL] Tree re-laid out with new recipes');
    }

    // Update status
    var statusEl = document.getElementById('growthStatus');
    if (statusEl) {
        statusEl.textContent = 'Applied ' + applied + ' styles to tree!';
        statusEl.className = 'growth-status success';
    }

    // Switch to tree tab
    switchTab('spellTree');
}

// Generate growth recipes for all schools via LLM
function generateGrowthRecipesViaLLM(schools, callback) {
    if (!schools || schools.length === 0) {
        console.warn('[GrowthDSL] No schools provided');
        if (callback) callback({ success: false, error: 'No schools' });
        return;
    }

    var results = {};
    var pending = schools.length;
    var failed = [];

    schools.forEach(function(school) {
        var schoolName = typeof school === 'string' ? school : school.name;
        var spellList = typeof school === 'object' && school.spells ? school.spells : [];

        var prompt = GROWTH_DSL.generateLLMPrompt(schoolName, spellList);

        // Call OpenRouter API
        if (state.llmConfig.apiKey) {
            callOpenRouterAPI(prompt, function(response) {
                if (response && response.success) {
                    // Try to parse the response as JSON
                    try {
                        var jsonMatch = response.content.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            var recipe = JSON.parse(jsonMatch[0]);
                            results[schoolName] = recipe;
                            console.log('[GrowthDSL] Generated recipe for ' + schoolName);
                        } else {
                            throw new Error('No JSON found in response');
                        }
                    } catch (e) {
                        console.warn('[GrowthDSL] Failed to parse recipe for ' + schoolName + ': ' + e.message);
                        failed.push(schoolName);
                        results[schoolName] = GROWTH_DSL.getDefaultRecipe(schoolName);
                    }
                } else {
                    console.warn('[GrowthDSL] LLM call failed for ' + schoolName);
                    failed.push(schoolName);
                    results[schoolName] = GROWTH_DSL.getDefaultRecipe(schoolName);
                }

                pending--;
                if (pending === 0) {
                    if (callback) callback({
                        success: failed.length === 0,
                        recipes: results,
                        failed: failed
                    });
                }
            });
        } else {
            // No API key - use defaults
            console.log('[GrowthDSL] No API key - using default recipe for ' + schoolName);
            results[schoolName] = GROWTH_DSL.getDefaultRecipe(schoolName);
            pending--;
            if (pending === 0) {
                if (callback) callback({
                    success: true,
                    recipes: results,
                    failed: []
                });
            }
        }
    });
}

// =============================================================================
// OPENROUTER API - Generic LLM calls
// =============================================================================

/**
 * Call OpenRouter API directly from JavaScript
 * @param {string} prompt - The prompt to send
 * @param {function} callback - Callback with {success: bool, content: string, error: string}
 */
function callOpenRouterAPI(prompt, callback) {
    var apiKey = state.llmConfig.apiKey;
    var model = state.llmConfig.model || 'anthropic/claude-3-haiku';
    var maxTokens = state.llmConfig.maxTokens || 2000;

    if (!apiKey || apiKey.length < 10) {
        console.warn('[OpenRouter] No API key configured');
        if (callback) callback({ success: false, error: 'No API key configured' });
        return;
    }

    var endpoint = 'https://openrouter.ai/api/v1/chat/completions';

    var requestBody = {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7
    };

    console.log('[OpenRouter] Calling API with model:', model);

    fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey,
            'HTTP-Referer': 'https://spelllearning.skyrim.mod',
            'X-Title': 'SpellLearning Mod'
        },
        body: JSON.stringify(requestBody)
    })
    .then(function(response) {
        if (!response.ok) {
            return response.text().then(function(text) {
                throw new Error('API error ' + response.status + ': ' + text);
            });
        }
        return response.json();
    })
    .then(function(data) {
        if (data.choices && data.choices[0] && data.choices[0].message) {
            var content = data.choices[0].message.content;
            console.log('[OpenRouter] Response received, length:', content.length);
            if (callback) callback({ success: true, content: content });
        } else {
            throw new Error('Unexpected response format');
        }
    })
    .catch(function(error) {
        console.error('[OpenRouter] API call failed:', error);
        if (callback) callback({ success: false, error: error.message });
    });
}
