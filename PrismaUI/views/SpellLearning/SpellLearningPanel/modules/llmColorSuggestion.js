/**
 * LLM Color Suggestion
 * Suggests school colors using LLM via C++ bridge.
 *
 * Depends on: state.js (state), colorUtils.js (getOrAssignSchoolColor)
 */

/**
 * Suggest school colors using LLM via C++ bridge
 * @param {function} onComplete - Optional callback when done
 */
function suggestSchoolColorsWithLLM(onComplete) {
    var schools = Object.keys(settings.schoolColors);

    if (schools.length === 0) {
        console.log('[SpellLearning] No schools to suggest colors for');
        if (onComplete) onComplete();
        return;
    }

    if (!state.llmConfig.apiKey || state.llmConfig.apiKey.length < 10) {
        updateStatus('Configure API key to use LLM color suggestions');
        if (onComplete) onComplete();
        return;
    }

    if (!state.fullAutoMode) {
        updateStatus('Asking LLM for color suggestions...');
    }

    // Output to textarea for visibility
    appendToOutput('>>> REQUESTING: Color suggestions for ' + schools.length + ' schools: ' + schools.join(', '));

    // Simple, fast prompt - just school names, no spell data
    var prompt = 'Suggest distinct hex colors for these Skyrim magic schools on a dark UI (#0a0a0f). ' +
        'Schools: ' + schools.join(', ') + '. ' +
        'Return ONLY JSON: {"SchoolName": "#hexcolor", ...}. ' +
        'Use thematic colors (fire=red, restoration=gold, etc). All ' + schools.length + ' schools.';

    // Store callback for when response arrives
    window._colorSuggestionCallback = onComplete;

    // Use C++ bridge to call OpenRouter (Ultralight doesn't support fetch well)
    var request = {
        school: '_ColorSuggestion',  // Special marker
        spellData: '',
        promptRules: prompt,  // Put the full prompt in promptRules
        model: state.llmConfig.model || 'anthropic/claude-sonnet-4',
        maxTokens: state.llmConfig.maxTokens || 2000,
        apiKey: state.llmConfig.apiKey,
        isColorSuggestion: true  // Flag for C++ to handle differently
    };

    console.log('[SpellLearning] Sending color suggestion request via C++ bridge');

    // Set current school so poll handler knows this is a color suggestion
    state.llmCurrentSchool = '_ColorSuggestion';

    if (window.callCpp) {
        window.callCpp('LLMGenerate', JSON.stringify(request));
    } else {
        console.error('[SpellLearning] C++ bridge not available');
        updateStatus('Error: C++ bridge not available');
        state.llmCurrentSchool = null;
        if (onComplete) onComplete();
    }
}

/**
 * Handle color suggestion response from C++
 */
function handleColorSuggestionResponse(result) {
    var onComplete = window._colorSuggestionCallback;
    window._colorSuggestionCallback = null;

    if (result.success === 1 && result.response) {
        try {
            // Parse JSON from response
            var jsonMatch = result.response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON found in response');

            var colors = JSON.parse(jsonMatch[0]);

            // Validate and apply
            var applied = 0;
            for (var school in colors) {
                if (settings.schoolColors.hasOwnProperty(school)) {
                    var color = colors[school];
                    if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
                        settings.schoolColors[school] = color;
                        applied++;
                    }
                }
            }

            if (applied > 0) {
                applySchoolColorsToCSS();
                updateSchoolColorPickerUI();
                autoSaveSettings();

                if (WheelRenderer.nodes && WheelRenderer.nodes.length > 0) {
                    WheelRenderer.render();
                }

                appendToOutput('<<< RECEIVED: Color suggestions - ' + applied + ' schools colored');

                if (!state.fullAutoMode) {
                    updateStatus('Applied LLM color suggestions for ' + applied + ' schools');
                }
                console.log('[SpellLearning] LLM suggested colors:', colors);
            } else {
                appendToOutput('<<< RECEIVED: Color suggestions - no valid colors');
                if (!state.fullAutoMode) {
                    updateStatus('LLM response did not contain valid colors');
                }
            }
        } catch (e) {
            console.error('[SpellLearning] Failed to parse LLM color suggestion:', e);
            appendToOutput('<<< ERROR: Failed to parse color response - ' + e.message);
            if (!state.fullAutoMode) {
                updateStatus('Failed to parse LLM color suggestion');
            }
        }
    } else {
        appendToOutput('<<< ERROR: Color suggestion failed - ' + (result.response || 'unknown error'));
        if (!state.fullAutoMode) {
            updateStatus('Color suggestion failed: ' + (result.response || 'unknown error'));
        }
    }

    // Call completion callback if provided
    if (onComplete) onComplete();
}
