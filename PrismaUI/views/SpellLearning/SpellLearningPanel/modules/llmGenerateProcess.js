/**
 * LLM Generate Process
 * LLM processing pipeline: per-school generation, queue processing,
 * poll result callbacks, tree saving, and ISL/DEST detection settings.
 *
 * Depends on: state.js (state, settings), llmGenerateCore.js (appendToOutput, clearOutputWithMessage, checkLLMAvailability, findMissingSpells, sendCorrectionRequest, sendMissingSpellsCorrectionRequest),
 *             treeParser.js (TreeParser), colorUtils.js (detectAllSchools, getOrAssignSchoolColor),
 *             uiHelpers.js (updateStatus, setTreeStatus)
 */

function startLLMAutoGenerate() {
    // First, check if we have spell data
    if (!state.lastSpellData) {
        setTreeStatus('Scan spells first (Spell Scan tab)');
        return;
    }

    console.log('[SpellLearning] Starting LLM auto-generation');

    // state.lastSpellData is already a parsed object (set in updateSpellData)
    var spellData = state.lastSpellData;

    if (!spellData || !spellData.spells || !Array.isArray(spellData.spells)) {
        setTreeStatus('No spells found - rescan spells');
        return;
    }

    console.log('[SpellLearning] Found ' + spellData.spells.length + ' spells to process');

    // Group spells by school - dynamically handle ALL schools
    var schoolSpells = {};
    var HEDGE_WIZARD = 'Hedge Wizard';

    spellData.spells.forEach(function(spell) {
        var school = spell.school;

        // Handle null/undefined/empty schools -> Hedge Wizard
        if (!school || school === '' || school === 'null' || school === 'undefined' || school === 'None') {
            school = HEDGE_WIZARD;
            spell.school = HEDGE_WIZARD;
        }

        if (!schoolSpells[school]) {
            schoolSpells[school] = [];
        }
        schoolSpells[school].push(spell);
    });

    // Ensure Hedge Wizard has a color
    if (schoolSpells[HEDGE_WIZARD] && schoolSpells[HEDGE_WIZARD].length > 0) {
        if (!settings.schoolColors[HEDGE_WIZARD]) {
            settings.schoolColors[HEDGE_WIZARD] = '#9ca3af';
            applySchoolColorsToCSS();
        }
    }

    // Build queue of schools with spells
    state.llmQueue = [];
    state.llmStats = {
        totalSpells: 0,
        processedSpells: 0,
        failedSchools: [],
        successSchools: [],
        needsAttentionSchools: []  // Schools with unreachable nodes after auto-fix
    };

    for (var school in schoolSpells) {
        if (schoolSpells[school].length > 0) {
            state.llmQueue.push({
                school: school,
                spells: schoolSpells[school]
            });
            state.llmStats.totalSpells += schoolSpells[school].length;
        }
    }

    if (state.llmQueue.length === 0) {
        setTreeStatus('No spells to process');
        return;
    }

    console.log('[SpellLearning] Queued ' + state.llmQueue.length + ' schools: ' +
                Object.keys(schoolSpells).join(', ') + ' (' + state.llmStats.totalSpells + ' total spells)');

    state.llmGenerating = true;

    // Disable the button during generation
    var btn = document.getElementById('llm-auto-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-icon">â³</span> Generating...';
    }

    // Start processing first school
    processNextLLMSchool();
}

function processNextLLMSchool() {
    if (state.llmQueue.length === 0) {
        // All done
        finishLLMGeneration();
        return;
    }

    var schoolData = state.llmQueue.shift();
    state.llmCurrentSchool = schoolData.school;

    // Track expected spell IDs for validation after response
    state.llmExpectedSpellIds = schoolData.spells.map(function(s) { return s.formId; });
    state.llmExpectedSpellCount = schoolData.spells.length;
    state.llmCurrentSpells = schoolData.spells; // Keep full spell data for correction requests

    var step = state.llmStats.successSchools.length + state.llmStats.failedSchools.length + 1;
    var remaining = state.llmQueue.length;
    var total = step + remaining;

    var progressMsg = 'Generating ' + schoolData.school + ' (' + schoolData.spells.length + ' spells)...';

    // Update both status areas
    setTreeStatus(progressMsg);
    if (state.fullAutoMode) {
        updateStatus('Step 2/3: ' + schoolData.school + ' (' + step + '/' + total + ' schools)');
    }

    // Output to textarea for visibility
    appendToOutput('>>> SENDING: ' + schoolData.school + ' (' + schoolData.spells.length + ' spells) [' + step + '/' + total + ']');

    console.log('[SpellLearning] Processing ' + schoolData.school + ' with ' + schoolData.spells.length + ' spells');

    // Get prompt rules
    var promptRules = getTreeRulesPrompt();

    // Prepare request with all LLM settings
    var request = {
        school: schoolData.school,
        spellData: JSON.stringify(schoolData.spells),
        promptRules: promptRules,
        model: getEffectiveModel(),
        maxTokens: state.llmConfig.maxTokens || 4096,
        apiKey: state.llmConfig.apiKey,
        // Tree generation settings
        allowMultiplePrereqs: settings.allowLLMMultiplePrereqs,
        aggressiveValidation: settings.aggressivePathValidation,
        // LLM self-correction settings
        selfCorrection: settings.llmSelfCorrection,
        selfCorrectionMaxLoops: settings.llmSelfCorrectionMaxLoops
    };

    console.log('[SpellLearning] Generating ' + schoolData.school + ' with model:', request.model, 'maxTokens:', request.maxTokens);
    appendToOutput('    Model: ' + request.model + ', Max Tokens: ' + request.maxTokens);

    if (window.callCpp) {
        window.callCpp('LLMGenerate', JSON.stringify(request));
    }
}

window.onLLMQueued = function(responseStr) {
    console.log('[SpellLearning] LLM request queued raw:', responseStr);

    var response;
    try {
        response = typeof responseStr === 'string' ? JSON.parse(responseStr) : responseStr;
    } catch (e) {
        console.error('[SpellLearning] Failed to parse queued response:', e);
        setTreeStatus('Error parsing response');
        return;
    }

    console.log('[SpellLearning] LLM request queued parsed:', response);
    setTreeStatus(response.school + ': ' + response.message);

    // Start polling for response
    if (state.llmPollInterval) {
        clearInterval(state.llmPollInterval);
    }

    state.llmPollInterval = setInterval(function() {
        if (window.callCpp) {
            window.callCpp('PollLLMResponse', '');
        }
    }, 2000); // Poll every 2 seconds
};

window.onLLMPollResult = function(resultStr) {
    var result;
    try {
        result = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;
    } catch (e) {
        console.error('[SpellLearning] Failed to parse poll result:', e);
        return;
    }

    if (!result.hasResponse) {
        return; // Keep waiting
    }

    // Stop polling
    if (state.llmPollInterval) {
        clearInterval(state.llmPollInterval);
        state.llmPollInterval = null;
    }

    console.log('[SpellLearning] Got LLM response, success=' + result.success + ', currentSchool=' + state.llmCurrentSchool);

    // Ignore stray responses when not expecting any
    if (!state.llmCurrentSchool) {
        console.warn('[SpellLearning] Received response but no current school - ignoring stray response');
        return;
    }

    // Check if this is a color suggestion response
    if (state.llmCurrentSchool === '_ColorSuggestion') {
        console.log('[SpellLearning] Routing to color suggestion handler');
        if (typeof handleColorSuggestionResponse === 'function') {
            handleColorSuggestionResponse(result);
        }
        state.llmCurrentSchool = null;
        // Continue with next school in queue if any
        setTimeout(processNextLLMSchool, 500);
        return;
    }

    if (result.success === 1 && result.response) {
        // Try to parse and import the tree
        try {
            var treeData = JSON.parse(result.response);

            // Count spells in response and log layout style
            var spellCount = 0;
            var layoutStyle = 'radial';
            if (treeData.schools) {
                for (var school in treeData.schools) {
                    if (treeData.schools[school].nodes) {
                        spellCount += treeData.schools[school].nodes.length;
                    }
                    if (treeData.schools[school].layoutStyle) {
                        layoutStyle = treeData.schools[school].layoutStyle;
                    }
                }
            }

            state.llmStats.processedSpells += spellCount;
            // Note: successSchools is pushed AFTER validation (see below) to avoid duplicates during correction

            console.log('[SpellLearning] ' + state.llmCurrentSchool + ': ' + spellCount + ' spells, layout: ' + layoutStyle);

            // Output to textarea
            appendToOutput('<<< RECEIVED: ' + state.llmCurrentSchool + ' - SUCCESS');
            appendToOutput('    Spells: ' + spellCount + ', Layout: ' + layoutStyle);
            appendToOutput('    Response size: ' + (result.response.length / 1024).toFixed(1) + ' KB');

            // Merge with existing tree
            if (state.treeData && state.treeData.success && state.treeData.rawData) {
                treeData = mergeTreeData(state.treeData.rawData, treeData);
            }

            // Parse temporarily to check for unreachable nodes (before full loadTreeData)
            var tempParseResult = TreeParser.parse(treeData);

            // Check for unreachable nodes and attempt self-correction if enabled
            if (tempParseResult.success && settings.llmSelfCorrection) {
                var schoolData = TreeParser.schools[state.llmCurrentSchool];
                if (schoolData && schoolData.root) {
                    var reachabilityInfo = TreeParser.getUnreachableNodesInfo(state.llmCurrentSchool, schoolData.root);

                    if (!reachabilityInfo.valid && reachabilityInfo.unreachable.length > 0) {
                        // Initialize correction count if needed
                        state.llmCorrectionCount = state.llmCorrectionCount || 0;

                        if (state.llmCorrectionCount < settings.llmSelfCorrectionMaxLoops) {
                            state.llmCorrectionCount++;

                            appendToOutput('    VALIDATION: ' + reachabilityInfo.unreachable.length + ' unreachable nodes detected');
                            appendToOutput('    Requesting LLM self-correction (attempt ' + state.llmCorrectionCount + '/' + settings.llmSelfCorrectionMaxLoops + ')...');

                            console.log('[SpellLearning] Self-correction attempt ' + state.llmCorrectionCount + ' for ' + state.llmCurrentSchool);

                            // Send correction request
                            sendCorrectionRequest(state.llmCurrentSchool, result.response, reachabilityInfo);
                            return; // Don't proceed to next school yet
                        } else {
                            appendToOutput('    VALIDATION: Max correction loops reached (' + settings.llmSelfCorrectionMaxLoops + ')');
                            appendToOutput('    ERROR: ' + reachabilityInfo.unreachable.length + ' spells are unreachable - tree needs regeneration');
                            console.log('[SpellLearning] Max self-correction loops reached, tree has unreachable nodes');

                            // Log the issue (no auto-fix)
                            TreeParser.detectAndFixCycles(state.llmCurrentSchool, schoolData.root);

                            // Track for retry
                            if (reachabilityInfo.unreachable.length > 0) {
                                appendToOutput('    Unreachable: ' + reachabilityInfo.unreachable.map(function(n) { return n.name || n.id; }).slice(0, 5).join(', '));
                                if (reachabilityInfo.unreachable.length > 5) {
                                    appendToOutput('    ... and ' + (reachabilityInfo.unreachable.length - 5) + ' more');
                                }
                                state.llmStats.needsAttentionSchools.push({
                                    school: state.llmCurrentSchool,
                                    unreachableCount: reachabilityInfo.unreachable.length,
                                    unreachableNodes: reachabilityInfo.unreachable.map(function(n) { return n.name || n.id; })
                                });
                                console.log('[SpellLearning] ' + state.llmCurrentSchool + ' needs attention: ' + postFixInfo.unreachable.length + ' unreachable');
                            } else {
                                appendToOutput('    AUTO-FIX: SUCCESS - all nodes now reachable!');
                            }
                        }
                    } else {
                        appendToOutput('    VALIDATION: Tree is valid - all nodes reachable!');
                    }
                }
            }

            // =====================================================================
            // MISSING SPELL VALIDATION
            // Check if all expected spells are present in the response
            // =====================================================================
            if (state.llmExpectedSpellIds && state.llmExpectedSpellIds.length > 0) {
                var missingInfo = findMissingSpells(
                    treeData,
                    state.llmCurrentSchool,
                    state.llmExpectedSpellIds,
                    state.llmCurrentSpells
                );

                if (!missingInfo.valid && missingInfo.missing.length > 0) {
                    appendToOutput('    SPELL COUNT: ' + missingInfo.received + '/' + missingInfo.expected + ' spells');

                    // Initialize missing spell correction count if needed
                    state.llmMissingCorrectionCount = state.llmMissingCorrectionCount || 0;

                    // Try to correct missing spells (up to 3 attempts)
                    var maxMissingCorrections = 3;
                    if (state.llmMissingCorrectionCount < maxMissingCorrections) {
                        state.llmMissingCorrectionCount++;

                        appendToOutput('    WARNING: ' + missingInfo.missing.length + ' spells missing from response!');
                        appendToOutput('    Requesting LLM to add missing spells (attempt ' +
                            state.llmMissingCorrectionCount + '/' + maxMissingCorrections + ')...');

                        console.log('[SpellLearning] Missing spell correction attempt ' +
                            state.llmMissingCorrectionCount + ' for ' + state.llmCurrentSchool);

                        // Send correction request with missing spells
                        sendMissingSpellsCorrectionRequest(
                            state.llmCurrentSchool,
                            result.response,
                            missingInfo.missing,
                            missingInfo.expected
                        );
                        return; // Don't proceed to next school yet
                    } else {
                        // Max corrections reached - log warning and continue
                        appendToOutput('    WARNING: Max missing spell corrections reached (' + maxMissingCorrections + ')');
                        appendToOutput('    ' + missingInfo.missing.length + ' spells still missing - continuing with partial tree');
                        console.warn('[SpellLearning] ' + state.llmCurrentSchool + ' has ' +
                            missingInfo.missing.length + ' missing spells after ' + maxMissingCorrections + ' correction attempts');

                        // Track as needs attention
                        state.llmStats.needsAttentionSchools.push({
                            school: state.llmCurrentSchool,
                            missingCount: missingInfo.missing.length,
                            missingSpells: missingInfo.missing.slice(0, 10).map(function(s) { return s.name; }) // First 10 names
                        });
                    }
                } else {
                    appendToOutput('    SPELL COUNT: ' + missingInfo.received + '/' + missingInfo.expected + ' - All spells included!');
                }
            }

            // Reset correction counts on successful validation
            state.llmCorrectionCount = 0;
            state.llmMissingCorrectionCount = 0;

            // Add to successSchools AFTER validation (avoid duplicates from correction loops)
            if (state.llmStats.successSchools.indexOf(state.llmCurrentSchool) === -1) {
                state.llmStats.successSchools.push(state.llmCurrentSchool);
            }

            loadTreeData(treeData);
            var statusSuffix = '';
            if (state.llmStats.needsAttentionSchools.some(function(s) { return s.school === state.llmCurrentSchool; })) {
                statusSuffix = ' (needs attention)';
            }
            setTreeStatus(state.llmCurrentSchool + ' imported (' + spellCount + ' spells)' + statusSuffix);
            state.llmRetryCount = 0;  // Reset retry counter on success

        } catch (e) {
            console.error('[SpellLearning] Failed to parse tree response for ' + state.llmCurrentSchool + ':', e);
            console.error('[SpellLearning] Raw response (first 500 chars):', result.response ? result.response.substring(0, 500) : 'empty');

            // Output failure to textarea
            appendToOutput('<<< RECEIVED: ' + state.llmCurrentSchool + ' - PARSE ERROR');
            appendToOutput('    Error: ' + e.message);

            // Retry logic
            state.llmRetryCount = (state.llmRetryCount || 0) + 1;
            if (state.llmRetryCount < 2) {
                console.log('[SpellLearning] Retrying ' + state.llmCurrentSchool + ' (attempt ' + (state.llmRetryCount + 1) + ')...');
                setTreeStatus(state.llmCurrentSchool + ' failed to parse, retrying...');
                appendToOutput('    Retrying... (attempt ' + (state.llmRetryCount + 1) + ')');

                // Re-queue this school at the front
                var retrySchool = state.llmCurrentSchool;
                var retrySpells = state.lastSpellData.spells.filter(function(s) { return s.school === retrySchool; });
                state.llmQueue.unshift({ school: retrySchool, spells: retrySpells });

                // Longer delay before retry
                setTimeout(processNextLLMSchool, 3000);
                return;
            }

            state.llmStats.failedSchools.push(state.llmCurrentSchool);
            setTreeStatus(state.llmCurrentSchool + ' failed: invalid JSON after ' + state.llmRetryCount + ' attempts');
            appendToOutput('    FAILED after ' + state.llmRetryCount + ' attempts');
            state.llmRetryCount = 0;
        }
    } else {
        console.error('[SpellLearning] ' + state.llmCurrentSchool + ' request failed:', result.response || 'unknown error');

        // Output failure to textarea
        appendToOutput('<<< RECEIVED: ' + state.llmCurrentSchool + ' - REQUEST FAILED');
        appendToOutput('    Error: ' + (result.response || 'unknown error'));

        // Retry logic for failed requests
        state.llmRetryCount = (state.llmRetryCount || 0) + 1;
        if (state.llmRetryCount < 2) {
            console.log('[SpellLearning] Retrying ' + state.llmCurrentSchool + ' (attempt ' + (state.llmRetryCount + 1) + ')...');
            setTreeStatus(state.llmCurrentSchool + ' failed, retrying...');
            appendToOutput('    Retrying... (attempt ' + (state.llmRetryCount + 1) + ')');

            // Re-queue this school at the front
            var retrySchool = state.llmCurrentSchool;
            var retrySpells = state.lastSpellData.spells.filter(function(s) { return s.school === retrySchool; });
            state.llmQueue.unshift({ school: retrySchool, spells: retrySpells });

            // Longer delay before retry
            setTimeout(processNextLLMSchool, 3000);
            return;
        }

        state.llmStats.failedSchools.push(state.llmCurrentSchool);
        setTreeStatus(state.llmCurrentSchool + ' failed: ' + (result.response || 'unknown error'));
        appendToOutput('    FAILED after ' + state.llmRetryCount + ' attempts');
        state.llmRetryCount = 0;
    }

    // Process next school after a short delay
    setTimeout(processNextLLMSchool, 1000);
};

function finishLLMGeneration() {
    state.llmGenerating = false;
    state.llmCurrentSchool = null;
    state.llmRetryCount = 0;

    // Show summary
    var stats = state.llmStats;
    var statusMsg = 'Complete! ' + stats.successSchools.length + ' schools, ' + stats.processedSpells + ' spells';

    // Output final summary to textarea
    appendToOutput('');
    appendToOutput('=== GENERATION COMPLETE ===');
    appendToOutput('Successful schools: ' + stats.successSchools.length);
    appendToOutput('  - ' + (stats.successSchools.join(', ') || 'none'));
    appendToOutput('Total spells processed: ' + stats.processedSpells);

    if (stats.failedSchools.length > 0) {
        statusMsg += ' | Failed: ' + stats.failedSchools.join(', ');
        // Store failed schools for potential retry
        state.lastFailedSchools = stats.failedSchools.slice();
        appendToOutput('Failed schools: ' + stats.failedSchools.length);
        appendToOutput('  - ' + stats.failedSchools.join(', '));
    } else {
        state.lastFailedSchools = [];
        appendToOutput('Failed schools: 0');
    }

    // Report schools that need attention (unreachable nodes after auto-fix)
    if (stats.needsAttentionSchools.length > 0) {
        statusMsg += ' | Needs attention: ' + stats.needsAttentionSchools.length;
        state.lastNeedsAttentionSchools = stats.needsAttentionSchools.slice();
        appendToOutput('');
        appendToOutput('*** NEEDS ATTENTION: ' + stats.needsAttentionSchools.length + ' school(s) have unreachable nodes ***');
        stats.needsAttentionSchools.forEach(function(info) {
            appendToOutput('  - ' + info.school + ': ' + info.unreachableCount + ' unreachable (' + info.unreachableNodes.slice(0, 5).join(', ') + (info.unreachableNodes.length > 5 ? '...' : '') + ')');
        });
        appendToOutput('Use "Retry School" button in Settings > LLM to regenerate specific schools');
    } else {
        state.lastNeedsAttentionSchools = [];
    }

    appendToOutput('===========================');
    appendToOutput('');

    // Update appropriate UI based on mode
    if (state.fullAutoMode) {
        // Full Auto always runs LLM color suggestion for all detected schools
        var detectedSchools = Object.keys(settings.schoolColors);

        updateStatus('Step 3/4: Suggesting colors for ' + detectedSchools.length + ' schools...');
        console.log('[SpellLearning] Full Auto: Running LLM color suggestion for schools:', detectedSchools.join(', '));

        suggestSchoolColorsWithLLM(function() {
            // After colors are done, finish up
            updateStatus('Complete! ' + statusMsg);
            // Show warning icon if any failures or needs attention
            var hasProblems = stats.failedSchools.length > 0 || stats.needsAttentionSchools.length > 0;
            setStatusIcon(hasProblems ? '!' : '*');
            resetFullAutoButton();

            // Save tree again to ensure it's persisted
            console.log('[SpellLearning] Full Auto complete - final save');
            saveTreeToFile();

            // Switch to tree tab to show results
            setTimeout(function() {
                switchTab('spellTree');
            }, 500);
        });
    } else {
        setTreeStatus(statusMsg);
        // Re-enable the generate button (for single school retry)
        var btn = document.getElementById('llm-auto-btn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="btn-icon">🪄</span> Auto Generate';
        }
    }

    console.log('[SpellLearning] Generation complete:', stats);

    // Save the combined tree immediately after generation
    saveTreeToFile();

    // Update retry school UI to show current status
    if (typeof updateRetrySchoolUI === 'function') {
        updateRetrySchoolUI();
    }
}

// Helper function to save tree - can be called anytime
function saveTreeToFile() {
    if (!state.treeData || !state.treeData.rawData) {
        console.warn('[SpellLearning] No tree data to save');
        return false;
    }

    if (!window.callCpp) {
        console.warn('[SpellLearning] Cannot save - callCpp not available');
        return false;
    }

    var treeJson = JSON.stringify(state.treeData.rawData);
    console.log('[SpellLearning] Saving tree to file, size:', treeJson.length, 'chars,',
                Object.keys(state.treeData.rawData.schools || {}).length, 'schools');

    window.callCpp('SaveSpellTree', treeJson);
    return true;
}

// Helper function to show/hide divider settings based on toggle state
function updateDividerSettingsVisibility() {
    var fadeRow = document.getElementById('dividerFadeRow');
    var spacingRow = document.getElementById('dividerSpacingRow');
    var colorModeRow = document.getElementById('dividerColorModeRow');
    var isVisible = settings.showSchoolDividers;

    if (fadeRow) fadeRow.style.display = isVisible ? '' : 'none';
    if (spacingRow) spacingRow.style.display = isVisible ? '' : 'none';
    if (colorModeRow) colorModeRow.style.display = isVisible ? '' : 'none';

    // Also update custom color row visibility
    updateDividerColorRowVisibility();
}

// Helper function to show/hide custom color picker based on color mode
function updateDividerColorRowVisibility() {
    var customColorRow = document.getElementById('dividerCustomColorRow');
    var isVisible = settings.showSchoolDividers && settings.dividerColorMode === 'custom';

    if (customColorRow) customColorRow.style.display = isVisible ? '' : 'none';
}

// Initialize Spell Tome Integration settings (DEST bundled)
function initializeISLSettings() {
    // Simple enable toggle - DEST is bundled, always available
    var destEnabledToggle = document.getElementById('islEnabledToggle') || document.getElementById('destEnabledToggle');
    if (destEnabledToggle) {
        destEnabledToggle.checked = settings.islEnabled;
        destEnabledToggle.addEventListener('change', function() {
            settings.islEnabled = this.checked;
            console.log('[SpellLearning] Spell Tome Integration enabled:', settings.islEnabled);
            scheduleAutoSave();
        });
    }

    // Update status badge to show "Bundled" since DEST is included
    updateDESTStatus();
}

// Update DEST status badge - always shows "Bundled" since it's included
function updateDESTStatus() {
    var badge = document.getElementById('islDetectionStatus') || document.getElementById('destStatus');
    if (!badge) return;

    // DEST is always bundled with this mod
    badge.textContent = 'Bundled';
    badge.classList.remove('not-detected');
    badge.classList.add('detected');
}

// Called from C++ when DEST detection status changes (legacy support)
window.onISLDetectionUpdate = function(detected) {
    // Ignore - DEST is always bundled
    console.log('[SpellLearning] DEST status check (bundled, always available)');
    updateDESTStatus();
};

// New callback name for DEST
window.onDESTDetectionUpdate = function(detected) {
    // Ignore - DEST is always bundled
    console.log('[SpellLearning] DEST status check (bundled, always available)');
    updateDESTStatus();
};
