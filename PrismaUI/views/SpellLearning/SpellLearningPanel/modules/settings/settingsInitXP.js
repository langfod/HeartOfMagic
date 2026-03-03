/**
 * Settings Init: XP & School Colors
 * Extracted sub-initializers for XP progression sliders, tier inputs,
 * reveal thresholds, save/reset buttons, and school color picker UI.
 *
 * Called from initializeSettings() in settingsInit.js.
 *
 * Depends on: state.js, settings/settingsUIHelpers.js, settings/settingsConfig.js,
 *             uiHelpers.js (updateSliderFillGlobal, updateStatus)
 */

// =============================================================================
// XP / PROGRESSION SETTINGS
// =============================================================================

/**
 * Initialize XP progression sliders and tier inputs.
 */
function _initXPSettings() {
    // Progression settings - Learning Mode (segmented toggle)
    initSegmentedToggle('learningModeToggle', settings.learningMode, function(value) {
        settings.learningMode = value;
        console.log('[SpellLearning] Learning mode:', value);
        autoSaveSettings();
    });

    // Progression settings - Auto-Advance Learning Target
    var autoAdvanceToggle = document.getElementById('autoAdvanceLearningToggle');
    if (autoAdvanceToggle) {
        autoAdvanceToggle.checked = settings.autoAdvanceLearning;
        autoAdvanceToggle.addEventListener('change', function() {
            settings.autoAdvanceLearning = this.checked;
            setSegmentedToggleEnabled('autoAdvanceModeToggle', this.checked);
            autoSaveSettings();
        });
    }
    initSegmentedToggle('autoAdvanceModeToggle', settings.autoAdvanceMode || 'branch', function(value) {
        settings.autoAdvanceMode = value;
        autoSaveSettings();
    });
    setSegmentedToggleEnabled('autoAdvanceModeToggle', settings.autoAdvanceLearning);

    // Progression settings - XP Multiplier Sliders
    function updateSliderFill(slider) {
        var percent = (slider.value - slider.min) / (slider.max - slider.min) * 100;
        slider.style.setProperty('--slider-fill', percent + '%');
    }

    function setupSlider(sliderId, valueId, settingKey) {
        var slider = document.getElementById(sliderId);
        var valueDisplay = document.getElementById(valueId);

        if (slider && valueDisplay) {
            slider.value = settings[settingKey];
            valueDisplay.textContent = settings[settingKey] + '%';
            updateSliderFill(slider);

            slider.addEventListener('input', function() {
                settings[settingKey] = parseInt(this.value);
                valueDisplay.textContent = this.value + '%';
                updateSliderFill(this);
                // Re-render tree labels when reveal thresholds change
                if (settingKey === 'revealName' || settingKey === 'revealEffects' || settingKey === 'revealDescription') {
                    if (typeof CanvasRenderer !== 'undefined') { CanvasRenderer._needsRender = true; }
                    if (typeof SmartRenderer !== 'undefined' && SmartRenderer.refresh) { SmartRenderer.refresh(); }
                    if (typeof WheelRenderer !== 'undefined' && WheelRenderer.updateNodeStates) { WheelRenderer.updateNodeStates(); }
                    // Refresh detail panel if a node is selected
                    if (state.selectedNode && typeof showSpellDetails === 'function') {
                        showSpellDetails(state.selectedNode);
                    }
                }
            });

            // Save on change (when user releases slider)
            slider.addEventListener('change', function() {
                console.log('[SpellLearning] ' + settingKey + ':', settings[settingKey]);
                    autoSaveSettings();
            });
        }
    }

    // Global XP multiplier slider (shows "x1" format instead of "%")
    var globalMultSlider = document.getElementById('xpGlobalMultiplierSlider');
    var globalMultValue = document.getElementById('xpGlobalMultiplierValue');
    if (globalMultSlider && globalMultValue) {
        globalMultSlider.value = settings.xpGlobalMultiplier;
        globalMultValue.textContent = 'x' + settings.xpGlobalMultiplier;
        updateSliderFill(globalMultSlider);

        globalMultSlider.addEventListener('input', function() {
            settings.xpGlobalMultiplier = parseInt(this.value);
            globalMultValue.textContent = 'x' + this.value;
            updateSliderFill(this);
        });

        globalMultSlider.addEventListener('change', function() {
            console.log('[SpellLearning] Global XP multiplier:', settings.xpGlobalMultiplier);
            autoSaveSettings();
        });
    }

    setupSlider('xpDirectSlider', 'xpDirectValue', 'xpMultiplierDirect');
    setupSlider('xpSchoolSlider', 'xpSchoolValue', 'xpMultiplierSchool');
    setupSlider('xpAnySlider', 'xpAnyValue', 'xpMultiplierAny');

    // XP Cap sliders
    setupSlider('xpCapAnySlider', 'xpCapAnyValue', 'xpCapAny');
    setupSlider('xpCapSchoolSlider', 'xpCapSchoolValue', 'xpCapSchool');
    setupSlider('xpCapDirectSlider', 'xpCapDirectValue', 'xpCapDirect');

    // Tier XP requirement inputs
    function setupXPInput(inputId, settingKey) {
        var input = document.getElementById(inputId);

        if (input) {
            input.value = settings[settingKey];

            input.addEventListener('change', function() {
                var val = parseInt(this.value) || 1;
                val = Math.max(1, Math.min(99999, val));  // Clamp to valid range
                this.value = val;
                settings[settingKey] = val;
                console.log('[SpellLearning] ' + settingKey + ':', settings[settingKey]);
                    autoSaveSettings();
            });

            // Also save on blur
            input.addEventListener('blur', function() {
                var val = parseInt(this.value) || 1;
                val = Math.max(1, Math.min(99999, val));
                this.value = val;
                settings[settingKey] = val;
                });
        }
    }

    setupXPInput('xpNoviceInput', 'xpNovice');
    setupXPInput('xpApprenticeInput', 'xpApprentice');
    setupXPInput('xpAdeptInput', 'xpAdept');
    setupXPInput('xpExpertInput', 'xpExpert');
    setupXPInput('xpMasterInput', 'xpMaster');

    // Progressive reveal threshold sliders
    setupSlider('revealNameSlider', 'revealNameValue', 'revealName');
    setupSlider('revealEffectsSlider', 'revealEffectsValue', 'revealEffects');
    setupSlider('revealDescSlider', 'revealDescValue', 'revealDescription');

    // Save settings button
    var saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', function() {
            saveSettings();
            console.log('[SpellLearning] Settings saved');
        });
    }

    // Reset settings button
    var resetSettingsBtn = document.getElementById('resetSettingsBtn');
    if (resetSettingsBtn) {
        resetSettingsBtn.addEventListener('click', function() {
            resetSettings();
        });
    }
}

// =============================================================================
// SCHOOL COLOR PICKER UI
// =============================================================================

/**
 * Initialize school color picker UI and buttons.
 */
function _initSchoolColorUI() {
    // Auto LLM Colors toggle
    var autoLLMToggle = document.getElementById('autoLLMColorsToggle');
    if (autoLLMToggle) {
        autoLLMToggle.checked = settings.autoLLMColors;
        autoLLMToggle.addEventListener('change', function() {
            settings.autoLLMColors = this.checked;
            console.log('[SpellLearning] Auto LLM Colors:', settings.autoLLMColors);
        });
    }

    // School color buttons
    var suggestColorsBtn = document.getElementById('suggestColorsBtn');
    if (suggestColorsBtn) {
        suggestColorsBtn.addEventListener('click', function() {
            suggestSchoolColorsWithLLM();
        });
    }

    var resetColorsBtn = document.getElementById('resetColorsBtn');
    if (resetColorsBtn) {
        resetColorsBtn.addEventListener('click', function() {
            // Reset to default colors
            settings.schoolColors = {
                'Destruction': '#ef4444',
                'Restoration': '#facc15',
                'Alteration': '#22c55e',
                'Conjuration': '#a855f7',
                'Illusion': '#38bdf8'
            };
            applySchoolColorsToCSS();
            updateSchoolColorPickerUI();
            autoSaveSettings();

            // Re-render tree if visible
            if (WheelRenderer.nodes && WheelRenderer.nodes.length > 0) {
                WheelRenderer.render();
            }

            updateStatus('School colors reset to defaults');
        });
    }

    // Show All Schools button
    var showAllSchoolsBtn = document.getElementById('showAllSchoolsBtn');
    if (showAllSchoolsBtn) {
        showAllSchoolsBtn.addEventListener('click', function() {
            console.log('[SpellLearning] Show All Schools clicked');
            var schools = Object.keys(settings.schoolColors);
            schools.forEach(function(school) {
                settings.schoolVisibility[school] = true;
            });
            updateSchoolColorPickerUI();

            // Re-layout and render tree BEFORE saving
            if (typeof WheelRenderer !== 'undefined' && WheelRenderer.nodes && WheelRenderer.nodes.length > 0) {
                console.log('[SpellLearning] Re-laying out tree - showing all ' + schools.length + ' schools');
                WheelRenderer.layout();
                WheelRenderer.render();
            }

            autoSaveSettings();
            updateStatus('All schools visible');
        });
    }

    // Hide All Schools button
    var hideAllSchoolsBtn = document.getElementById('hideAllSchoolsBtn');
    if (hideAllSchoolsBtn) {
        hideAllSchoolsBtn.addEventListener('click', function() {
            console.log('[SpellLearning] Hide All Schools clicked');
            var schools = Object.keys(settings.schoolColors);
            schools.forEach(function(school) {
                settings.schoolVisibility[school] = false;
            });
            updateSchoolColorPickerUI();

            // Re-layout and render tree BEFORE saving
            if (typeof WheelRenderer !== 'undefined' && WheelRenderer.nodes && WheelRenderer.nodes.length > 0) {
                console.log('[SpellLearning] Re-laying out tree - hiding all schools');
                WheelRenderer.layout();
                WheelRenderer.render();
            }

            autoSaveSettings();
            updateStatus('All schools hidden');
        });
    }

    // Initialize school color picker UI
    updateSchoolColorPickerUI();

    // Apply saved school colors to CSS
    applySchoolColorsToCSS();
}
