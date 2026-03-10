/**
 * Settings Init: Tree Generation & Procedural Injection
 * Extracted sub-initializer for tree gen toggles, LLM correction,
 * procedural prereq injection, divider settings, ISL, early/passive learning,
 * presets, and dynamic tree building settings.
 *
 * Called from initializeSettings() in settingsInit.js.
 *
 * Depends on: state.js, settings/settingsUIHelpers.js, settings/settingsConfig.js,
 *             uiHelpers.js (updateSliderFillGlobal)
 */

// =============================================================================
// TREE GENERATION & PROCEDURAL INJECTION SETTINGS
// =============================================================================

function _initTreeGenProceduralSettings() {
    var aggressivePathValidationToggle = document.getElementById('aggressivePathValidationToggle');
    if (aggressivePathValidationToggle) {
        aggressivePathValidationToggle.checked = settings.aggressivePathValidation;
        aggressivePathValidationToggle.addEventListener('change', function() {
            settings.aggressivePathValidation = this.checked;
            console.log('[SpellLearning] Aggressive path validation:', settings.aggressivePathValidation);
            scheduleAutoSave();
        });
    }

    var allowLLMMultiplePrereqsToggle = document.getElementById('allowLLMMultiplePrereqsToggle');
    if (allowLLMMultiplePrereqsToggle) {
        allowLLMMultiplePrereqsToggle.checked = settings.allowLLMMultiplePrereqs;
        allowLLMMultiplePrereqsToggle.addEventListener('change', function() {
            settings.allowLLMMultiplePrereqs = this.checked;
            console.log('[SpellLearning] Allow LLM multiple prerequisites:', settings.allowLLMMultiplePrereqs);
            scheduleAutoSave();
        });
    }

    var llmSelfCorrectionToggle = document.getElementById('llmSelfCorrectionToggle');
    var llmCorrectionLoopsRow = document.getElementById('llmCorrectionLoopsRow');
    if (llmSelfCorrectionToggle) {
        llmSelfCorrectionToggle.checked = settings.llmSelfCorrection;
        if (llmCorrectionLoopsRow) {
            llmCorrectionLoopsRow.style.display = settings.llmSelfCorrection ? '' : 'none';
        }
        llmSelfCorrectionToggle.addEventListener('change', function() {
            settings.llmSelfCorrection = this.checked;
            console.log('[SpellLearning] LLM self-correction:', settings.llmSelfCorrection);
            if (llmCorrectionLoopsRow) {
                llmCorrectionLoopsRow.style.display = this.checked ? '' : 'none';
            }
            scheduleAutoSave();
        });
    }

    var llmCorrectionLoopsSlider = document.getElementById('llmCorrectionLoopsSlider');
    var llmCorrectionLoopsValue = document.getElementById('llmCorrectionLoopsValue');
    if (llmCorrectionLoopsSlider) {
        llmCorrectionLoopsSlider.value = settings.llmSelfCorrectionMaxLoops;
        if (llmCorrectionLoopsValue) llmCorrectionLoopsValue.textContent = settings.llmSelfCorrectionMaxLoops;
        updateSliderFillGlobal(llmCorrectionLoopsSlider);
        llmCorrectionLoopsSlider.addEventListener('input', function() {
            settings.llmSelfCorrectionMaxLoops = parseInt(this.value);
            if (llmCorrectionLoopsValue) llmCorrectionLoopsValue.textContent = this.value;
            updateSliderFillGlobal(this);
            scheduleAutoSave();
        });
    }

    // Retry School UI
    var retrySchoolBtn = document.getElementById('retrySchoolBtn');
    var retrySchoolSelect = document.getElementById('retrySchoolSelect');
    if (retrySchoolBtn && retrySchoolSelect) {
        retrySchoolBtn.addEventListener('click', function() {
            var selectedSchool = retrySchoolSelect.value;
            if (selectedSchool && window.retrySpecificSchool) {
                window.retrySpecificSchool(selectedSchool);
            } else if (!selectedSchool) {
                console.warn('[SpellLearning] No school selected for retry');
            }
        });
    }

    // Check for schools needing attention periodically
    setInterval(function() {
        if (window._panelVisible !== false) {
            updateRetrySchoolUI();
        }
    }, 2000);

    var proceduralPrereqInjectionToggle = document.getElementById('proceduralPrereqInjectionToggle');
    var proceduralInjectionSettings = document.getElementById('proceduralInjectionSettings');
    if (proceduralPrereqInjectionToggle) {
        proceduralPrereqInjectionToggle.checked = settings.proceduralPrereqInjection;
        if (proceduralInjectionSettings) {
            proceduralInjectionSettings.style.display = settings.proceduralPrereqInjection ? 'block' : 'none';
        }
        proceduralPrereqInjectionToggle.addEventListener('change', function() {
            settings.proceduralPrereqInjection = this.checked;
            console.log('[SpellLearning] Procedural prereq injection:', settings.proceduralPrereqInjection);
            if (proceduralInjectionSettings) {
                proceduralInjectionSettings.style.display = this.checked ? 'block' : 'none';
            }
            scheduleAutoSave();
            if (this.checked && state.treeData && state.treeData.nodes) {
                injectProceduralPrerequisites();
            }
        });
    }

    // Procedural injection sub-settings
    var injectionChanceSlider = document.getElementById('injectionChanceSlider');
    var injectionChanceValue = document.getElementById('injectionChanceValue');
    if (injectionChanceSlider) {
        injectionChanceSlider.value = settings.proceduralInjection.chance;
        if (injectionChanceValue) injectionChanceValue.textContent = settings.proceduralInjection.chance + '%';
        updateSliderFillGlobal(injectionChanceSlider);
        injectionChanceSlider.addEventListener('input', function() {
            settings.proceduralInjection.chance = parseInt(this.value);
            if (injectionChanceValue) injectionChanceValue.textContent = this.value + '%';
            updateSliderFillGlobal(this);
            scheduleAutoSave();
        });
    }

    var maxPrereqsSlider = document.getElementById('maxPrereqsSlider');
    var maxPrereqsValue = document.getElementById('maxPrereqsValue');
    if (maxPrereqsSlider) {
        maxPrereqsSlider.value = settings.proceduralInjection.maxPrereqs;
        if (maxPrereqsValue) maxPrereqsValue.textContent = settings.proceduralInjection.maxPrereqs;
        updateSliderFillGlobal(maxPrereqsSlider);
        maxPrereqsSlider.addEventListener('input', function() {
            settings.proceduralInjection.maxPrereqs = parseInt(this.value);
            if (maxPrereqsValue) maxPrereqsValue.textContent = this.value;
            updateSliderFillGlobal(this);
            scheduleAutoSave();
        });
    }

    var minTierSlider = document.getElementById('minTierSlider');
    var minTierValue = document.getElementById('minTierValue');
    if (minTierSlider) {
        minTierSlider.value = settings.proceduralInjection.minTier;
        if (minTierValue) minTierValue.textContent = settings.proceduralInjection.minTier;
        updateSliderFillGlobal(minTierSlider);
        minTierSlider.addEventListener('input', function() {
            settings.proceduralInjection.minTier = parseInt(this.value);
            if (minTierValue) minTierValue.textContent = this.value;
            updateSliderFillGlobal(this);
            scheduleAutoSave();
        });
    }

    var sameTierPreferenceToggle = document.getElementById('sameTierPreferenceToggle');
    if (sameTierPreferenceToggle) {
        sameTierPreferenceToggle.checked = settings.proceduralInjection.sameTierPreference;
        sameTierPreferenceToggle.addEventListener('change', function() {
            settings.proceduralInjection.sameTierPreference = this.checked;
            console.log('[SpellLearning] Same-tier preference:', settings.proceduralInjection.sameTierPreference);
            scheduleAutoSave();
        });
    }

    var rerollInjectionsBtn = document.getElementById('rerollInjectionsBtn');
    if (rerollInjectionsBtn) {
        rerollInjectionsBtn.addEventListener('click', function() {
            if (typeof rerollProceduralPrerequisites === 'function') {
                rerollProceduralPrerequisites();
            } else {
                console.warn('[SpellLearning] rerollProceduralPrerequisites not defined');
            }
        });
    }

    // Divider fade slider
    var dividerFadeSlider = document.getElementById('dividerFadeSlider');
    var dividerFadeValue = document.getElementById('dividerFadeValue');
    if (dividerFadeSlider) {
        dividerFadeSlider.value = settings.dividerFade;
        if (dividerFadeValue) dividerFadeValue.textContent = settings.dividerFade + '%';
        updateSliderFillGlobal(dividerFadeSlider);
        dividerFadeSlider.addEventListener('input', function() {
            settings.dividerFade = parseInt(this.value);
            if (dividerFadeValue) dividerFadeValue.textContent = settings.dividerFade + '%';
            updateSliderFillGlobal(this);
            if (state.treeData) { WheelRenderer.render(); }
        });
    }

    // Divider spacing slider
    var dividerSpacingSlider = document.getElementById('dividerSpacingSlider');
    var dividerSpacingValue = document.getElementById('dividerSpacingValue');
    if (dividerSpacingSlider) {
        dividerSpacingSlider.value = settings.dividerSpacing;
        if (dividerSpacingValue) dividerSpacingValue.textContent = settings.dividerSpacing + 'px';
        updateSliderFillGlobal(dividerSpacingSlider);
        dividerSpacingSlider.addEventListener('input', function() {
            settings.dividerSpacing = parseInt(this.value);
            if (dividerSpacingValue) dividerSpacingValue.textContent = settings.dividerSpacing + 'px';
            updateSliderFillGlobal(this);
            if (state.treeData) { WheelRenderer.render(); }
        });
    }

    // Divider color mode select
    var dividerColorModeSelect = document.getElementById('dividerColorModeSelect');
    if (dividerColorModeSelect) {
        dividerColorModeSelect.value = settings.dividerColorMode;
        dividerColorModeSelect.addEventListener('change', function() {
            settings.dividerColorMode = this.value;
            updateDividerColorRowVisibility();
            if (state.treeData) { WheelRenderer.render(); }
        });
    }

    // Divider custom color picker
    var dividerCustomColorPicker = document.getElementById('dividerCustomColorPicker');
    if (dividerCustomColorPicker) {
        dividerCustomColorPicker.value = settings.dividerCustomColor;
        dividerCustomColorPicker.addEventListener('input', function() {
            settings.dividerCustomColor = this.value;
            if (state.treeData) { WheelRenderer.render(); }
        });
    }

    // Initial visibility of divider settings
    try { updateDividerSettingsVisibility(); } catch(e) { console.error('[SpellLearning] updateDividerSettingsVisibility error:', e); }
    try { updateDividerColorRowVisibility(); } catch(e) { console.error('[SpellLearning] updateDividerColorRowVisibility error:', e); }

    // ISL-DESTified Integration Settings
    try { initializeISLSettings(); } catch(e) { console.error('[SpellLearning] ISL settings init error:', e); }

    // Early Spell Learning Settings
    try { initializeEarlyLearningSettings(); } catch(e) { console.error('[SpellLearning] Early learning settings init error:', e); }

    // Passive Learning Settings
    try { initializePassiveLearningSettings(); } catch(e) { console.error('[SpellLearning] Passive learning settings init error:', e); }

    // Settings Presets
    try { if (typeof initializeSettingsPresets === 'function') initializeSettingsPresets(); } catch(e) { console.error('[SpellLearning] Settings presets init error:', e); }

    // Scanner Presets
    try { if (typeof initializeScannerPresets === 'function') initializeScannerPresets(); } catch(e) { console.error('[SpellLearning] Scanner presets init error:', e); }

    // Dynamic Tree Building Settings
    try {
        initializeDynamicTreeBuildingSettings();
    } catch (treeSettingsErr) {
        console.error('[SpellLearning] Tree building settings init error (non-fatal):', treeSettingsErr);
    }
}
