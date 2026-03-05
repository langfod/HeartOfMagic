/**
 * Settings Presets UI — Preset UI rendering and progression settings display.
 * Loaded after: settingsPresets.js
 *
 * Depends on:
 * - modules/state.js (state, settings)
 * - modules/settingsPresets.js (settingsPresets globals)
 * - modules/settingsPanel.js (updateSpellTomeLearningUI)
 * - modules/uiHelpers.js (setSegmentedToggleValue, setTreeStatus, updateScanStatus, t)
 *
 * Exports (global):
 * - updateProgressionSettingsUI()
 * - clearTree()
 */

// =============================================================================
// UI UPDATE — PROGRESSION SETTINGS
// (Moved from difficultyProfiles.js)
// =============================================================================

function updateProgressionSettingsUI() {
    // Helper to update slider fill visual
    function updateSliderFill(slider) {
        if (!slider) return;
        var percent = (slider.value - slider.min) / (slider.max - slider.min) * 100;
        slider.style.setProperty('--slider-fill', percent + '%');
    }

    // Global multiplier
    var globalMultSlider = document.getElementById('xpGlobalMultiplierSlider');
    var globalMultValue = document.getElementById('xpGlobalMultiplierValue');
    if (globalMultSlider) {
        globalMultSlider.value = settings.xpGlobalMultiplier;
        updateSliderFill(globalMultSlider);
        if (globalMultValue) globalMultValue.textContent = 'x' + settings.xpGlobalMultiplier;
    }

    // XP multipliers
    var xpDirectSlider = document.getElementById('xpDirectSlider');
    var xpDirectValue = document.getElementById('xpDirectValue');
    if (xpDirectSlider) {
        xpDirectSlider.value = settings.xpMultiplierDirect;
        updateSliderFill(xpDirectSlider);
        if (xpDirectValue) xpDirectValue.textContent = settings.xpMultiplierDirect + '%';
    }

    var xpSchoolSlider = document.getElementById('xpSchoolSlider');
    var xpSchoolValue = document.getElementById('xpSchoolValue');
    if (xpSchoolSlider) {
        xpSchoolSlider.value = settings.xpMultiplierSchool;
        updateSliderFill(xpSchoolSlider);
        if (xpSchoolValue) xpSchoolValue.textContent = settings.xpMultiplierSchool + '%';
    }

    var xpAnySlider = document.getElementById('xpAnySlider');
    var xpAnyValue = document.getElementById('xpAnyValue');
    if (xpAnySlider) {
        xpAnySlider.value = settings.xpMultiplierAny;
        updateSliderFill(xpAnySlider);
        if (xpAnyValue) xpAnyValue.textContent = settings.xpMultiplierAny + '%';
    }

    // Tier XP inputs
    var tierInputs = {
        'xpNoviceInput': settings.xpNovice,
        'xpApprenticeInput': settings.xpApprentice,
        'xpAdeptInput': settings.xpAdept,
        'xpExpertInput': settings.xpExpert,
        'xpMasterInput': settings.xpMaster
    };
    for (var inputId in tierInputs) {
        var input = document.getElementById(inputId);
        if (input) input.value = tierInputs[inputId];
    }

    // Reveal sliders
    var revealSliders = [
        { sliderId: 'revealNameSlider', valueId: 'revealNameValue', setting: settings.revealName },
        { sliderId: 'revealEffectsSlider', valueId: 'revealEffectsValue', setting: settings.revealEffects },
        { sliderId: 'revealDescSlider', valueId: 'revealDescValue', setting: settings.revealDescription }
    ];
    for (var r = 0; r < revealSliders.length; r++) {
        var cfg = revealSliders[r];
        var slider = document.getElementById(cfg.sliderId);
        var valueEl = document.getElementById(cfg.valueId);
        if (slider) {
            slider.value = cfg.setting;
            updateSliderFill(slider);
            if (valueEl) valueEl.textContent = cfg.setting + '%';
        }
    }

    // XP caps
    var capSliders = [
        { sliderId: 'xpCapAnySlider', valueId: 'xpCapAnyValue', setting: settings.xpCapAny },
        { sliderId: 'xpCapSchoolSlider', valueId: 'xpCapSchoolValue', setting: settings.xpCapSchool },
        { sliderId: 'xpCapDirectSlider', valueId: 'xpCapDirectValue', setting: settings.xpCapDirect }
    ];
    for (var c = 0; c < capSliders.length; c++) {
        var cap = capSliders[c];
        var capSlider = document.getElementById(cap.sliderId);
        var capValue = document.getElementById(cap.valueId);
        if (capSlider) {
            capSlider.value = cap.setting;
            updateSliderFill(capSlider);
            if (capValue) capValue.textContent = cap.setting + '%';
        }
    }

    // Learning mode toggle
    setSegmentedToggleValue('learningModeToggle', settings.learningMode);

    // Update spell tome learning UI if function exists
    if (typeof updateSpellTomeLearningUI === 'function') {
        updateSpellTomeLearningUI();
    }
}

// =============================================================================
// CLEAR TREE (moved from difficultyProfiles.js)
// =============================================================================

function clearTree() {
    console.log('[SpellLearning] Clearing tree data');

    state.treeData = null;
    state.selectedNode = null;
    state.spellInfoCache = {};
    state.learningTargets = {};

    if (typeof SmartRenderer !== 'undefined') {
        SmartRenderer.clear();
    } else if (typeof WheelRenderer !== 'undefined') {
        WheelRenderer.clear();
    }

    var emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.classList.remove('hidden');

    var treeActions = document.getElementById('tree-actions');
    if (treeActions) treeActions.classList.add('hidden');

    var detailsPanel = document.getElementById('details-panel');
    if (detailsPanel) detailsPanel.classList.add('hidden');

    var totalCount = document.getElementById('total-count');
    if (totalCount) totalCount.textContent = '0';
    var unlockedCount = document.getElementById('unlocked-count');
    if (unlockedCount) unlockedCount.textContent = '0';

    if (typeof setTreeStatus === 'function') {
        setTreeStatus('Tree cleared - ready for new generation');
    }
    if (typeof updateScanStatus === 'function') updateScanStatus(t('status.treeCleared'));
}

window.clearTree = clearTree;

console.log('[SettingsPresetsUI] Loaded');
