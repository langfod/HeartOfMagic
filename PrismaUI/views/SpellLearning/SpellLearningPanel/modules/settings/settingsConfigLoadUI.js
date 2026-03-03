/**
 * Settings Config Load: UI Sync
 * Syncs loaded config values to DOM controls (toggles, sliders, pickers, etc.)
 * Called from onUnifiedConfigLoaded after settings values are populated.
 *
 * Depends on: state.js, settings/settingsUIHelpers.js, settings/settingsTheme.js,
 *             settings/settingsHeart.js, settings/settingsTreeGen.js,
 *             uiHelpers.js (updateSliderFillGlobal)
 */

// =============================================================================
// SYNC CONFIG VALUES TO UI CONTROLS
// =============================================================================

/**
 * Sync all loaded config values to their corresponding DOM controls.
 * Called after settings object has been fully populated from loaded data.
 * @param {object} data - The raw parsed config data (for LLM, fields, etc.)
 */
function _syncConfigToUI(data) {
    // Discovery mode toggle
    var discoveryModeToggle = document.getElementById('discoveryModeToggle');
    if (discoveryModeToggle) discoveryModeToggle.checked = settings.discoveryMode;

    // Show root spell names in discovery mode
    var showRootNamesToggle = document.getElementById('showRootSpellNamesToggle');
    if (showRootNamesToggle) showRootNamesToggle.checked = settings.showRootSpellNames;

    // Preserve multi-prerequisites
    var preserveMultiPrereqsToggle = document.getElementById('preserveMultiPrereqsToggle');
    if (preserveMultiPrereqsToggle) preserveMultiPrereqsToggle.checked = settings.preserveMultiPrereqs;

    // Tree generation settings toggles
    var aggressivePathValidationToggle = document.getElementById('aggressivePathValidationToggle');
    if (aggressivePathValidationToggle) aggressivePathValidationToggle.checked = settings.aggressivePathValidation;

    var allowLLMMultiplePrereqsToggle = document.getElementById('allowLLMMultiplePrereqsToggle');
    if (allowLLMMultiplePrereqsToggle) allowLLMMultiplePrereqsToggle.checked = settings.allowLLMMultiplePrereqs;

    var llmSelfCorrectionToggle = document.getElementById('llmSelfCorrectionToggle');
    if (llmSelfCorrectionToggle) llmSelfCorrectionToggle.checked = settings.llmSelfCorrection;

    var llmCorrectionLoopsRow = document.getElementById('llmCorrectionLoopsRow');
    if (llmCorrectionLoopsRow) {
        llmCorrectionLoopsRow.style.display = settings.llmSelfCorrection ? '' : 'none';
    }

    var llmCorrectionLoopsSlider = document.getElementById('llmCorrectionLoopsSlider');
    var llmCorrectionLoopsValue = document.getElementById('llmCorrectionLoopsValue');
    if (llmCorrectionLoopsSlider) {
        llmCorrectionLoopsSlider.value = settings.llmSelfCorrectionMaxLoops;
        if (llmCorrectionLoopsValue) llmCorrectionLoopsValue.textContent = settings.llmSelfCorrectionMaxLoops;
        updateSliderFillGlobal(llmCorrectionLoopsSlider);
    }

    var proceduralPrereqInjectionToggle = document.getElementById('proceduralPrereqInjectionToggle');
    if (proceduralPrereqInjectionToggle) proceduralPrereqInjectionToggle.checked = settings.proceduralPrereqInjection;

    // Procedural injection sub-settings
    var proceduralInjectionSettings = document.getElementById('proceduralInjectionSettings');
    if (proceduralInjectionSettings) {
        proceduralInjectionSettings.style.display = settings.proceduralPrereqInjection ? 'block' : 'none';
    }

    var injectionChanceSlider = document.getElementById('injectionChanceSlider');
    var injectionChanceValue = document.getElementById('injectionChanceValue');
    if (injectionChanceSlider) {
        injectionChanceSlider.value = settings.proceduralInjection.chance;
        if (injectionChanceValue) injectionChanceValue.textContent = settings.proceduralInjection.chance + '%';
        updateSliderFillGlobal(injectionChanceSlider);
    }

    var maxPrereqsSlider = document.getElementById('maxPrereqsSlider');
    var maxPrereqsValue = document.getElementById('maxPrereqsValue');
    if (maxPrereqsSlider) {
        maxPrereqsSlider.value = settings.proceduralInjection.maxPrereqs;
        if (maxPrereqsValue) maxPrereqsValue.textContent = settings.proceduralInjection.maxPrereqs;
        updateSliderFillGlobal(maxPrereqsSlider);
    }

    var minTierSlider = document.getElementById('minTierSlider');
    var minTierValue = document.getElementById('minTierValue');
    if (minTierSlider) {
        minTierSlider.value = settings.proceduralInjection.minTier;
        if (minTierValue) minTierValue.textContent = settings.proceduralInjection.minTier;
        updateSliderFillGlobal(minTierSlider);
    }

    var sameTierPreferenceToggle = document.getElementById('sameTierPreferenceToggle');
    if (sameTierPreferenceToggle) sameTierPreferenceToggle.checked = settings.proceduralInjection.sameTierPreference;

    // Apply school colors to CSS
    applySchoolColorsToCSS();
    updateSchoolColorPickerUI();

    // Update Auto LLM toggle
    var autoLLMToggle = document.getElementById('autoLLMColorsToggle');
    if (autoLLMToggle) autoLLMToggle.checked = settings.autoLLMColors;

    // Update UI toggles
    var cheatToggle = document.getElementById('cheatModeToggle');
    var nodeSizeToggle = document.getElementById('nodeSizeScalingToggle');
    var showNamesToggle = document.getElementById('showNodeNamesToggle');
    var verboseToggle = document.getElementById('verboseLogToggle');
    var hotkeyInput = document.getElementById('hotkeyInput');
    var cheatInfo = document.getElementById('cheatModeInfo');

    var devModeToggle = document.getElementById('developerModeToggle');
    if (devModeToggle) devModeToggle.checked = settings.developerMode;
    updateDeveloperModeVisibility(settings.developerMode);

    if (cheatToggle) cheatToggle.checked = settings.cheatMode;
    if (nodeSizeToggle) nodeSizeToggle.checked = settings.nodeSizeScaling;
    if (showNamesToggle) showNamesToggle.checked = settings.showNodeNames;
    var showDividersToggle = document.getElementById('showSchoolDividersToggle');
    if (showDividersToggle) showDividersToggle.checked = settings.showSchoolDividers;

    // Update divider settings
    var dividerFadeSlider = document.getElementById('dividerFadeSlider');
    var dividerFadeValue = document.getElementById('dividerFadeValue');
    if (dividerFadeSlider) {
        dividerFadeSlider.value = settings.dividerFade;
        if (dividerFadeValue) dividerFadeValue.textContent = settings.dividerFade + '%';
        updateSliderFillGlobal(dividerFadeSlider);
    }
    var dividerSpacingSlider = document.getElementById('dividerSpacingSlider');
    var dividerSpacingValue = document.getElementById('dividerSpacingValue');
    if (dividerSpacingSlider) {
        dividerSpacingSlider.value = settings.dividerSpacing;
        if (dividerSpacingValue) dividerSpacingValue.textContent = settings.dividerSpacing + 'px';
        updateSliderFillGlobal(dividerSpacingSlider);
    }

    // Update divider color settings
    var dividerColorModeSelect = document.getElementById('dividerColorModeSelect');
    if (dividerColorModeSelect) {
        dividerColorModeSelect.value = settings.dividerColorMode;
    }
    var dividerCustomColorPicker = document.getElementById('dividerCustomColorPicker');
    if (dividerCustomColorPicker) {
        dividerCustomColorPicker.value = settings.dividerCustomColor;
    }

    updateDividerSettingsVisibility();

    // Update popup divider settings (gear icon popup)
    var popupShowDividers = document.getElementById('popup-show-dividers');
    if (popupShowDividers) popupShowDividers.checked = settings.showSchoolDividers;

    var popupDividerLength = document.getElementById('popup-divider-length');
    var popupDividerLengthVal = document.getElementById('popup-divider-length-val');
    if (popupDividerLength) {
        popupDividerLength.value = settings.dividerLength || 800;
        if (popupDividerLengthVal) popupDividerLengthVal.textContent = settings.dividerLength || 800;
    }

    var popupDividerWidth = document.getElementById('popup-divider-width');
    var popupDividerWidthVal = document.getElementById('popup-divider-width-val');
    if (popupDividerWidth) {
        popupDividerWidth.value = settings.dividerSpacing || 3;
        if (popupDividerWidthVal) popupDividerWidthVal.textContent = (settings.dividerSpacing || 3) + 'px';
    }

    var popupDividerFade = document.getElementById('popup-divider-fade');
    var popupDividerFadeVal = document.getElementById('popup-divider-fade-val');
    if (popupDividerFade) {
        popupDividerFade.value = settings.dividerFade !== undefined ? settings.dividerFade : 50;
        if (popupDividerFadeVal) popupDividerFadeVal.textContent = (settings.dividerFade !== undefined ? settings.dividerFade : 50) + '%';
    }

    var popupDividerColorMode = document.getElementById('popup-divider-color-mode');
    var popupDividerCustomRow = document.getElementById('popup-divider-custom-row');
    if (popupDividerColorMode) {
        popupDividerColorMode.value = settings.dividerColorMode || 'school';
        if (popupDividerCustomRow) {
            popupDividerCustomRow.style.display = (settings.dividerColorMode === 'custom') ? '' : 'none';
        }
    }

    var dividerCustomSwatch = document.getElementById('divider-custom-color-swatch');
    var popupDividerCustomColor = document.getElementById('popup-divider-custom-color');
    if (dividerCustomSwatch && popupDividerCustomColor) {
        var customColor = settings.dividerCustomColor || '#ffffff';
        dividerCustomSwatch.style.background = customColor;
        popupDividerCustomColor.value = customColor;
    }

    // Update theme UI
    var themeSelect = document.getElementById('uiThemeSelect');
    var themeDesc = document.getElementById('themeDescription');
    if (themeSelect && settings.uiTheme) {
        themeSelect.value = settings.uiTheme;
        if (themeDesc && UI_THEMES[settings.uiTheme]) {
            themeDesc.textContent = UI_THEMES[settings.uiTheme].description;
        }
        // Apply saved theme if different from current
        var currentStylesheet = document.querySelector('link[rel="stylesheet"][href*="styles"]');
        if (currentStylesheet && UI_THEMES[settings.uiTheme]) {
            var currentFile = currentStylesheet.getAttribute('href');
            if (currentFile !== UI_THEMES[settings.uiTheme].file) {
                applyTheme(settings.uiTheme);
            }
        }
    }

    // Update learning color UI
    var learningColorPicker = document.getElementById('learningColorPicker');
    var learningColorValue = document.getElementById('learningColorValue');
    if (learningColorPicker) {
        learningColorPicker.value = settings.learningColor;
        if (learningColorValue) learningColorValue.textContent = settings.learningColor.toUpperCase();
        applyLearningColor(settings.learningColor);
    }

    // Update font size UI
    var fontSizeSlider = document.getElementById('fontSizeSlider');
    var fontSizeValue = document.getElementById('fontSizeValue');
    if (fontSizeSlider) {
        fontSizeSlider.value = settings.fontSizeMultiplier;
        if (fontSizeValue) fontSizeValue.textContent = settings.fontSizeMultiplier.toFixed(1) + 'x';
        updateSliderFillGlobal(fontSizeSlider);
        applyFontSizeMultiplier(settings.fontSizeMultiplier);
    }

    // Update ISL settings UI
    var islEnabledToggle = document.getElementById('islEnabledToggle');
    var islXpPerHourInput = document.getElementById('islXpPerHourInput');
    var islTomeBonusSlider = document.getElementById('islTomeBonusSlider');
    var islTomeBonusValue = document.getElementById('islTomeBonusValue');

    if (islEnabledToggle) islEnabledToggle.checked = settings.islEnabled;
    if (islXpPerHourInput) islXpPerHourInput.value = settings.islXpPerHour;
    if (islTomeBonusSlider) {
        islTomeBonusSlider.value = settings.islTomeBonus;
        if (islTomeBonusValue) islTomeBonusValue.textContent = settings.islTomeBonus + '%';
        updateSliderFillGlobal(islTomeBonusSlider);
    }

    // Update early/passive/tome learning UI
    updateEarlyLearningUI();
    if (typeof renderPowerSteps === 'function') renderPowerSteps();
    if (typeof updatePassiveLearningUI === 'function') updatePassiveLearningUI();
    updateSpellTomeLearningUI();

    // Notification settings UI
    updateNotificationsUI();

    // Update settings presets UI
    if (typeof updateSettingsPresetsUI === 'function') {
        updateSettingsPresetsUI();
    }

    if (verboseToggle) verboseToggle.checked = settings.verboseLogging;
    if (hotkeyInput) hotkeyInput.value = settings.hotkey;
    if (cheatInfo) cheatInfo.classList.toggle('hidden', !settings.cheatMode);

    // =========================================================================
    // PROGRESSION SLIDERS
    // =========================================================================

    var xpDirectSlider = document.getElementById('xpDirectSlider');
    var xpSchoolSlider = document.getElementById('xpSchoolSlider');
    var xpAnySlider = document.getElementById('xpAnySlider');

    function updateSliderFillVisual(slider) {
        if (!slider) return;
        var percent = (slider.value - slider.min) / (slider.max - slider.min) * 100;
        slider.style.setProperty('--slider-fill', percent + '%');
    }

    setSegmentedToggleValue('learningModeToggle', settings.learningMode);

    // Auto-advance learning target
    var autoAdvanceToggle = document.getElementById('autoAdvanceLearningToggle');
    if (autoAdvanceToggle) autoAdvanceToggle.checked = settings.autoAdvanceLearning;
    setSegmentedToggleValue('autoAdvanceModeToggle', settings.autoAdvanceMode);
    setSegmentedToggleEnabled('autoAdvanceModeToggle', settings.autoAdvanceLearning);

    // Global multiplier slider
    var globalMultSlider = document.getElementById('xpGlobalMultiplierSlider');
    var globalMultValue = document.getElementById('xpGlobalMultiplierValue');
    if (globalMultSlider) {
        globalMultSlider.value = settings.xpGlobalMultiplier;
        updateSliderFillVisual(globalMultSlider);
        if (globalMultValue) globalMultValue.textContent = 'x' + settings.xpGlobalMultiplier;
    }

    if (xpDirectSlider) {
        xpDirectSlider.value = settings.xpMultiplierDirect;
        updateSliderFillVisual(xpDirectSlider);
        var xpDirectValue = document.getElementById('xpDirectValue');
        if (xpDirectValue) xpDirectValue.textContent = settings.xpMultiplierDirect + '%';
    }
    if (xpSchoolSlider) {
        xpSchoolSlider.value = settings.xpMultiplierSchool;
        updateSliderFillVisual(xpSchoolSlider);
        var xpSchoolValue = document.getElementById('xpSchoolValue');
        if (xpSchoolValue) xpSchoolValue.textContent = settings.xpMultiplierSchool + '%';
    }
    if (xpAnySlider) {
        xpAnySlider.value = settings.xpMultiplierAny;
        updateSliderFillVisual(xpAnySlider);
        var xpAnyValue = document.getElementById('xpAnyValue');
        if (xpAnyValue) xpAnyValue.textContent = settings.xpMultiplierAny + '%';
    }

    // XP Cap sliders
    var xpCapAnySlider = document.getElementById('xpCapAnySlider');
    var xpCapSchoolSlider = document.getElementById('xpCapSchoolSlider');
    var xpCapDirectSlider = document.getElementById('xpCapDirectSlider');

    if (xpCapAnySlider) {
        xpCapAnySlider.value = settings.xpCapAny;
        updateSliderFillVisual(xpCapAnySlider);
        var xpCapAnyValue = document.getElementById('xpCapAnyValue');
        if (xpCapAnyValue) xpCapAnyValue.textContent = settings.xpCapAny + '%';
    }
    if (xpCapSchoolSlider) {
        xpCapSchoolSlider.value = settings.xpCapSchool;
        updateSliderFillVisual(xpCapSchoolSlider);
        var xpCapSchoolValue = document.getElementById('xpCapSchoolValue');
        if (xpCapSchoolValue) xpCapSchoolValue.textContent = settings.xpCapSchool + '%';
    }
    if (xpCapDirectSlider) {
        xpCapDirectSlider.value = settings.xpCapDirect;
        updateSliderFillVisual(xpCapDirectSlider);
        var xpCapDirectValue = document.getElementById('xpCapDirectValue');
        if (xpCapDirectValue) xpCapDirectValue.textContent = settings.xpCapDirect + '%';
    }

    // Update tier XP inputs
    var tierInputs = [
        { id: 'xpNoviceInput', key: 'xpNovice' },
        { id: 'xpApprenticeInput', key: 'xpApprentice' },
        { id: 'xpAdeptInput', key: 'xpAdept' },
        { id: 'xpExpertInput', key: 'xpExpert' },
        { id: 'xpMasterInput', key: 'xpMaster' }
    ];

    tierInputs.forEach(function(cfg) {
        var input = document.getElementById(cfg.id);
        if (input) {
            input.value = settings[cfg.key];
        }
    });

    // Update reveal threshold sliders
    var revealSliders = [
        { id: 'revealNameSlider', valueId: 'revealNameValue', key: 'revealName', suffix: '%' },
        { id: 'revealEffectsSlider', valueId: 'revealEffectsValue', key: 'revealEffects', suffix: '%' },
        { id: 'revealDescSlider', valueId: 'revealDescValue', key: 'revealDescription', suffix: '%' }
    ];

    revealSliders.forEach(function(cfg) {
        var slider = document.getElementById(cfg.id);
        var valueEl = document.getElementById(cfg.valueId);
        if (slider) {
            slider.value = settings[cfg.key];
            updateSliderFillVisual(slider);
            if (valueEl) valueEl.textContent = settings[cfg.key] + cfg.suffix;
        }
    });

    // =========================================================================
    // LLM SETTINGS UI
    // =========================================================================

    if (data.llm) {
        // Update LLM UI
        var apiKeyInput = document.getElementById('apiKeyInput');
        var modelSelect = document.getElementById('modelSelect');
        var customModelInput = document.getElementById('customModelInput');

        if (apiKeyInput && state.llmConfig.apiKey) {
            // Mask the key for display
            var key = state.llmConfig.apiKey;
            apiKeyInput.value = key.length > 10 ?
                key.substring(0, 6) + '...' + key.substring(key.length - 4) :
                key;
        }

        // Set model dropdown
        if (modelSelect) {
            var knownModels = ['anthropic/claude-sonnet-4', 'anthropic/claude-opus-4',
                'anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'openai/gpt-4o-mini',
                'google/gemini-2.0-flash-001', 'meta-llama/llama-3.3-70b-instruct'];
            if (knownModels.indexOf(state.llmConfig.model) !== -1) {
                modelSelect.value = state.llmConfig.model;
            }
        }

        // Set custom model input
        if (customModelInput) {
            customModelInput.value = state.llmConfig.customModel || '';
            updateModelDisplayState();
        }

        // Set max tokens input
        var maxTokensInput = document.getElementById('maxTokensInput');
        if (maxTokensInput) {
            maxTokensInput.value = state.llmConfig.maxTokens || 4096;
        }

        // Update API status
        var apiStatus = document.getElementById('apiStatus');
        if (apiStatus && state.llmConfig.apiKey) {
            apiStatus.textContent = 'API key loaded (' + state.llmConfig.apiKey.length + ' chars)';
            apiStatus.style.color = '#4ade80';
        }
    }

    // LLM Auto-Config Checkbox (Build Tree)
    if (data.llmAutoConfigEnabled !== undefined) {
        var llmAutoConfigCheckbox = document.getElementById('visualFirstLLMCheck');
        if (llmAutoConfigCheckbox) {
            llmAutoConfigCheckbox.checked = data.llmAutoConfigEnabled;
            console.log('[SpellLearning] LLM auto-config checkbox loaded:', data.llmAutoConfigEnabled);
        }
    }

    // Field Settings
    if (data.fields) {
        for (var fieldName in data.fields) {
            var checkbox = document.getElementById('field_' + fieldName);
            if (checkbox) {
                checkbox.checked = data.fields[fieldName];
            }
        }
    }

    // Scan Mode
    if (data.scanModeTomes !== undefined) {
        var scanModeCheckbox = document.getElementById('scanModeTomes');
        if (scanModeCheckbox) {
            scanModeCheckbox.checked = data.scanModeTomes;
        }
    }

    // Apply heart settings to renderer
    applyHeartSettingsToRenderer();
    applyGlobeSettings();

    // Update the tree gen UI if available
    if (typeof updateTreeSettingsUI === 'function') {
        updateTreeSettingsUI();
    }
}
