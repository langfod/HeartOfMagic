/**
 * LLM Generate Core
 * Core LLM generation functions: output helpers, availability checks,
 * correction/refinement requests, and full auto-generation entry point.
 *
 * Depends on: state.js (state, settings), growthDSL.js (GROWTH_DSL),
 *             uiHelpers.js (updateStatus, setStatusIcon, setTreeStatus),
 *             colorUtils.js (detectAllSchools, getOrAssignSchoolColor)
 */

// =============================================================================
// LLM INTEGRATION
// =============================================================================

// Helper to append progress messages to output textarea
function appendToOutput(message) {
    var outputArea = document.getElementById('outputArea');
    if (!outputArea) return;

    var timestamp = new Date().toLocaleTimeString();
    var line = '[' + timestamp + '] ' + message + '\n';

    // Append to output
    outputArea.value += line;

    // Auto-scroll to bottom
    outputArea.scrollTop = outputArea.scrollHeight;

    // Update char count
    if (typeof updateCharCount === 'function') {
        updateCharCount();
    }
}

// Clear output and set initial message
function clearOutputWithMessage(message) {
    var outputArea = document.getElementById('outputArea');
    if (!outputArea) return;

    outputArea.value = message ? message + '\n' : '';

    // Update char count
    if (typeof updateCharCount === 'function') {
        updateCharCount();
    }
}

function checkLLMAvailability() {
    console.log('[SpellLearning] Checking LLM availability...');
    if (window.callCpp) {
        window.callCpp('CheckLLM', '');
    } else {
        console.log('[SpellLearning] window.callCpp not available yet');
        // Retry after a short delay
        setTimeout(checkLLMAvailability, 500);
    }
}

/**
 * Send a correction request to the LLM with info about unreachable nodes
 * The LLM will attempt to fix the tree structure while preserving intent
 */
function sendCorrectionRequest(schoolName, originalResponse, reachabilityInfo) {
    console.log('[SpellLearning] Sending correction request for ' + schoolName);

    // Build a detailed description of the issues
    var issuesList = reachabilityInfo.unreachable.map(function(node) {
        var blocking = node.blockingPrereqs.length > 0
            ? ' (blocked by unreachable prereqs: ' + node.blockingPrereqs.join(', ') + ')'
            : ' (has no path to root)';
        return '- ' + node.formId + ' "' + node.name + '" tier ' + node.tier + blocking;
    }).join('\n');

    var correctionPrompt = 'Your previous response had ' + reachabilityInfo.unreachable.length + ' unreachable spells out of ' + reachabilityInfo.total + ' total.\n\n' +
        '## UNREACHABLE NODES\n' + issuesList + '\n\n' +
        '## WHAT WENT WRONG\n' +
        'These spells cannot be unlocked because their prerequisites form cycles or reference other unreachable spells.\n' +
        'Remember: Every spell must have a valid path from root. If spell A requires spell B, then B must be reachable from root.\n\n' +
        '## YOUR TASK\n' +
        'Fix ONLY the prerequisites of the unreachable spells. Keep all other spells unchanged.\n' +
        'Options for each unreachable spell:\n' +
        '1. Change its prerequisites to point to REACHABLE spells of lower tier\n' +
        '2. Remove one or more blocking prerequisites\n' +
        '3. Add an additional prerequisite to a reachable spell (for convergence)\n\n' +
        '## YOUR PREVIOUS RESPONSE\n' + originalResponse + '\n\n' +
        '## CORRECTED OUTPUT\n' +
        'Return the COMPLETE corrected JSON (same format as before). Only modify the unreachable nodes\' prerequisites.';

    // Get prompt rules
    var promptRules = '';
    if (typeof getTreeRulesPrompt === 'function') {
        promptRules = getTreeRulesPrompt();
    }

    // Prepare request with correction flag
    var request = {
        school: schoolName,
        spellData: '', // Not needed for correction
        promptRules: promptRules,
        model: state.llmConfig.model || 'anthropic/claude-sonnet-4',
        maxTokens: state.llmConfig.maxTokens || 4096,
        apiKey: state.llmConfig.apiKey,
        // Mark as correction request
        isCorrection: true,
        correctionPrompt: correctionPrompt,
        // Settings
        allowMultiplePrereqs: settings.allowLLMMultiplePrereqs,
        aggressiveValidation: settings.aggressivePathValidation
    };

    appendToOutput('>>> CORRECTION: ' + schoolName + ' (fixing ' + reachabilityInfo.unreachable.length + ' nodes)');

    if (window.callCpp) {
        window.callCpp('LLMGenerate', JSON.stringify(request));
    }
}

/**
 * Send a correction request to add missing spells to the tree
 * @param {string} schoolName - Name of the school
 * @param {string} originalResponse - The LLM's previous response
 * @param {Array} missingSpells - Array of spell objects that were not included
 * @param {number} totalExpected - Total number of spells expected
 */
function sendMissingSpellsCorrectionRequest(schoolName, originalResponse, missingSpells, totalExpected) {
    console.log('[SpellLearning] Sending missing spells correction for ' + schoolName + ' (' + missingSpells.length + ' missing)');

    // Build list of missing spells with their details
    var missingList = missingSpells.map(function(spell) {
        return '- ' + spell.formId + ' "' + spell.name + '" (' + spell.skillLevel + ')';
    }).join('\n');

    var correctionPrompt = 'Your previous response for ' + schoolName + ' included only ' +
        (totalExpected - missingSpells.length) + ' out of ' + totalExpected + ' spells.\n\n' +
        '## CRITICAL: ' + missingSpells.length + ' SPELLS ARE MISSING\n\n' +
        'These spells from the input were NOT included in your output:\n' + missingList + '\n\n' +
        '## YOUR TASK\n' +
        'You MUST include ALL spells. Return the COMPLETE corrected JSON with ALL ' + totalExpected + ' spells.\n' +
        'Add the missing spells to appropriate locations in the tree based on their skill level:\n' +
        '- Novice spells: tier 1-2, can branch from root or other Novice\n' +
        '- Apprentice spells: tier 2-3, require Novice prereqs\n' +
        '- Adept spells: tier 3-4, require Apprentice prereqs\n' +
        '- Expert spells: tier 4-5, require Adept prereqs\n' +
        '- Master spells: tier 5-6, require Expert prereqs\n\n' +
        '## MISSING SPELL DATA (for reference)\n' +
        JSON.stringify(missingSpells, null, 2) + '\n\n' +
        '## YOUR PREVIOUS (INCOMPLETE) RESPONSE\n' + originalResponse + '\n\n' +
        '## CORRECTED OUTPUT\n' +
        'Return the COMPLETE JSON with ALL ' + totalExpected + ' spells included.';

    // Prepare request
    var request = {
        school: schoolName,
        spellData: '', // Not needed for correction
        promptRules: typeof getTreeRulesPrompt === 'function' ? getTreeRulesPrompt() : '',
        model: state.llmConfig.model || 'anthropic/claude-sonnet-4',
        maxTokens: state.llmConfig.maxTokens || 64000,
        apiKey: state.llmConfig.apiKey,
        isCorrection: true,
        correctionPrompt: correctionPrompt,
        allowMultiplePrereqs: settings.allowLLMMultiplePrereqs,
        aggressiveValidation: settings.aggressivePathValidation
    };

    appendToOutput('>>> CORRECTION: ' + schoolName + ' (adding ' + missingSpells.length + ' missing spells)');

    if (window.callCpp) {
        window.callCpp('LLMGenerate', JSON.stringify(request));
    }
}

/**
 * Find spells from expected list that are missing from the response
 * @param {Object} treeData - Parsed tree data from LLM
 * @param {string} schoolName - School being validated
 * @param {Array} expectedFormIds - Array of expected formIds
 * @param {Array} fullSpellData - Full spell objects for missing spell lookup
 * @returns {Object} { valid: boolean, missing: Array, received: number, expected: number }
 */
function findMissingSpells(treeData, schoolName, expectedFormIds, fullSpellData) {
    var receivedFormIds = [];

    // Collect all formIds from the response
    if (treeData.schools && treeData.schools[schoolName] && treeData.schools[schoolName].nodes) {
        receivedFormIds = treeData.schools[schoolName].nodes.map(function(node) {
            return node.formId;
        });
    }

    // Find missing formIds
    var missingFormIds = expectedFormIds.filter(function(id) {
        return receivedFormIds.indexOf(id) === -1;
    });

    // Get full spell objects for missing spells
    var missingSpells = [];
    if (missingFormIds.length > 0 && fullSpellData) {
        missingSpells = fullSpellData.filter(function(spell) {
            return missingFormIds.indexOf(spell.formId) !== -1;
        });
    }

    return {
        valid: missingFormIds.length === 0,
        missing: missingSpells,
        missingFormIds: missingFormIds,
        received: receivedFormIds.length,
        expected: expectedFormIds.length
    };
}

window.onLLMStatus = function(statusStr) {
    console.log('[SpellLearning] LLM status raw:', statusStr);

    var status;
    try {
        status = typeof statusStr === 'string' ? JSON.parse(statusStr) : statusStr;
    } catch (e) {
        console.error('[SpellLearning] Failed to parse LLM status:', e);
        return;
    }

    console.log('[SpellLearning] LLM status parsed:', status);
    state.llmAvailable = status.available;

    console.log('[SpellLearning] API status updated, available:', status.available);
};

// Full Auto: Called after scan completes to start tree generation
function startFullAutoGenerate() {
    if (!state.lastSpellData) {
        updateStatus('No spell data - scan failed');
        setStatusIcon('*');
        resetFullAutoButton();
        return;
    }

    var spellData = state.lastSpellData;

    if (!spellData || !spellData.spells || !Array.isArray(spellData.spells)) {
        updateStatus('No spells found in scan data');
        setStatusIcon('*');
        resetFullAutoButton();
        return;
    }

    console.log('[SpellLearning] Full Auto: Processing ' + spellData.spells.length + ' spells');

    // Group spells by school - dynamically handle ALL schools found in data
    var schoolSpells = {};
    var HEDGE_WIZARD = 'Hedge Wizard';  // Catch-all for spells without a school

    spellData.spells.forEach(function(spell) {
        var school = spell.school;

        // Handle null/undefined/empty schools -> Hedge Wizard
        if (!school || school === '' || school === 'null' || school === 'undefined' || school === 'None') {
            school = HEDGE_WIZARD;
            spell.school = HEDGE_WIZARD;  // Update the spell's school for tree generation
        }

        // Dynamically create school group if it doesn't exist
        if (!schoolSpells[school]) {
            schoolSpells[school] = [];
        }
        schoolSpells[school].push(spell);
    });

    // Log Hedge Wizard spells
    if (schoolSpells[HEDGE_WIZARD] && schoolSpells[HEDGE_WIZARD].length > 0) {
        console.log('[SpellLearning] ' + schoolSpells[HEDGE_WIZARD].length + ' miscellaneous spells assigned to Hedge Wizard:',
            schoolSpells[HEDGE_WIZARD].slice(0, 5).map(function(s) { return s.name || s.formId; }).join(', ') +
            (schoolSpells[HEDGE_WIZARD].length > 5 ? '...' : ''));

        // Ensure Hedge Wizard has a color
        if (!settings.schoolColors[HEDGE_WIZARD]) {
            settings.schoolColors[HEDGE_WIZARD] = '#9ca3af';  // Gray - for miscellaneous
            applySchoolColorsToCSS();
        }
    }

    // Build queue
    state.llmQueue = [];
    state.llmStats = {
        totalSpells: 0,
        processedSpells: 0,
        failedSchools: [],
        successSchools: [],
        needsAttentionSchools: []  // Schools with unreachable nodes after auto-fix
    };

    var schoolCount = 0;
    for (var school in schoolSpells) {
        if (schoolSpells[school].length > 0) {
            state.llmQueue.push({
                school: school,
                spells: schoolSpells[school]
            });
            state.llmStats.totalSpells += schoolSpells[school].length;
            schoolCount++;
        }
    }

    console.log('[SpellLearning] Found ' + schoolCount + ' schools:', Object.keys(schoolSpells).join(', '));

    if (state.llmQueue.length === 0) {
        updateStatus('No spells to process');
        setStatusIcon('*');
        resetFullAutoButton();
        return;
    }

    console.log('[SpellLearning] Full Auto: Queued ' + schoolCount + ' schools');
    state.llmGenerating = true;

    // Clear output and show generation header
    clearOutputWithMessage('=== TREE GENERATION STARTED ===');
    appendToOutput('Schools to generate: ' + schoolCount);
    appendToOutput('Total spells: ' + state.llmStats.totalSpells);
    appendToOutput('Model: ' + getEffectiveModel());
    appendToOutput('');

    // Process first school
    processNextLLMSchool();
}

function resetFullAutoButton() {
    state.fullAutoMode = false;
    var fullAutoBtn = document.getElementById('fullAutoBtn');
    if (fullAutoBtn) {
        // Show retry option if there were failures
        if (state.lastFailedSchools && state.lastFailedSchools.length > 0) {
            fullAutoBtn.disabled = false;
            fullAutoBtn.innerHTML = '<span class="btn-icon">ðŸ"„</span> Retry Failed (' + state.lastFailedSchools.length + ')';
            fullAutoBtn.onclick = retryFailedSchools;
        } else {
            fullAutoBtn.disabled = false;
            fullAutoBtn.innerHTML = '<span class="btn-icon">ðŸš€</span> Full Auto';
            fullAutoBtn.onclick = onFullAutoClick;
        }
    }
}

function retryFailedSchools() {
    if (!state.lastFailedSchools || state.lastFailedSchools.length === 0) {
        updateStatus('No failed schools to retry');
        return;
    }

    if (!state.lastSpellData || !state.lastSpellData.spells) {
        updateStatus('No spell data - run Full Auto first');
        return;
    }

    console.log('[SpellLearning] Retrying failed schools:', state.lastFailedSchools.join(', '));

    // Disable button during retry
    var fullAutoBtn = document.getElementById('fullAutoBtn');
    if (fullAutoBtn) {
        fullAutoBtn.disabled = true;
        fullAutoBtn.innerHTML = '<span class="btn-icon">â³</span> Retrying...';
    }

    // Build queue from failed schools
    state.llmQueue = [];
    state.llmStats = {
        totalSpells: 0,
        processedSpells: 0,
        failedSchools: [],
        successSchools: state.llmStats.successSchools || [],  // Keep previous successes
        needsAttentionSchools: []  // Schools with unreachable nodes after auto-fix
    };

    state.lastFailedSchools.forEach(function(school) {
        var spells = state.lastSpellData.spells.filter(function(s) { return s.school === school; });
        if (spells.length > 0) {
            state.llmQueue.push({ school: school, spells: spells });
            state.llmStats.totalSpells += spells.length;
        }
    });

    if (state.llmQueue.length === 0) {
        updateStatus('No spells found for failed schools');
        resetFullAutoButton();
        return;
    }

    state.lastFailedSchools = [];  // Clear the retry list
    state.llmGenerating = true;
    state.fullAutoMode = true;

    updateStatus('Retrying ' + state.llmQueue.length + ' failed school(s)...');

    // Start processing
    processNextLLMSchool();
}

/**
 * Retry generation for a specific school (used for "needs attention" schools)
 * @param {string} schoolName - Name of the school to retry
 */
function retrySpecificSchool(schoolName) {
    if (!schoolName) {
        console.warn('[SpellLearning] retrySpecificSchool: No school name provided');
        return;
    }

    if (state.llmGenerating) {
        console.warn('[SpellLearning] Generation already in progress');
        return;
    }

    if (!state.lastSpellData || !state.lastSpellData.spells) {
        setTreeStatus('No spell data - run Full Auto first');
        return;
    }

    // Find spells for this school
    var spells = state.lastSpellData.spells.filter(function(s) {
        return s.school === schoolName;
    });

    if (spells.length === 0) {
        setTreeStatus('No spells found for school: ' + schoolName);
        return;
    }

    console.log('[SpellLearning] Retrying specific school: ' + schoolName + ' (' + spells.length + ' spells)');

    // Clear the output and show retry message
    clearOutputWithMessage('=== RETRY: ' + schoolName + ' ===');
    appendToOutput('Regenerating tree for ' + schoolName + ' with ' + spells.length + ' spells...');
    appendToOutput('');

    // Initialize stats for single school retry
    state.llmQueue = [{ school: schoolName, spells: spells }];
    state.llmStats = {
        totalSpells: spells.length,
        processedSpells: 0,
        failedSchools: [],
        successSchools: state.llmStats.successSchools.filter(function(s) { return s !== schoolName; }), // Remove this school from success
        needsAttentionSchools: state.llmStats.needsAttentionSchools.filter(function(s) { return s.school !== schoolName; }) // Remove from needs attention
    };

    state.llmGenerating = true;
    state.llmCorrectionCount = 0;
    state.llmRetryCount = 0;

    // Disable buttons during retry
    var btn = document.getElementById('llm-auto-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-icon">⏳</span> Retrying ' + schoolName + '...';
    }

    // Start processing
    processNextLLMSchool();
}

// Make retrySpecificSchool available globally for UI buttons
window.retrySpecificSchool = retrySpecificSchool;

/**
 * Get list of schools that need attention (have unreachable nodes)
 * @returns {Array} Array of school info objects
 */
function getSchoolsNeedingAttention() {
    return state.lastNeedsAttentionSchools || [];
}

// Make available globally
window.getSchoolsNeedingAttention = getSchoolsNeedingAttention;
