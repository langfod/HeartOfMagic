/**
 * Settings Config Persistence
 * Save/load settings to localStorage and C++ backend.
 * Contains saveUnifiedConfig, loadSettings, saveSettings, autoSaveSettings, resetSettings.
 *
 * Depends on: state.js, settings/settingsUIHelpers.js, settings/settingsTheme.js,
 *             settings/settingsModdedXP.js, settings/settingsHeart.js,
 *             settings/settingsTreeGen.js, uiHelpers.js, i18n.js
 */

// =============================================================================
// LOAD / SAVE / AUTO-SAVE
// =============================================================================

function loadSettings() {
    // Load unified config from C++ (all settings in one file)
    if (window.callCpp) {
        window.callCpp('LoadUnifiedConfig', '');
    }
}

function saveSettings() {
    // Save unified config to C++ (all settings in one file)
    saveUnifiedConfig();
}

// Auto-save settings (debounced to avoid excessive saves)
var autoSaveTimer = null;
function autoSaveSettings() {
    // Clear any pending save
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
    }
    // Save after a brief delay
    autoSaveTimer = setTimeout(function() {
        saveUnifiedConfig();
        console.log('[SpellLearning] Settings auto-saved');
        autoSaveTimer = null;
    }, 500);
}

// =============================================================================
// SAVE UNIFIED CONFIG
// =============================================================================

function saveUnifiedConfig() {
    if (!window.callCpp) return;

    var unifiedConfig = {
        // Panel settings
        hotkey: settings.hotkey,
        hotkeyCode: settings.hotkeyCode,
        developerMode: settings.developerMode,
        cheatMode: settings.cheatMode,
        nodeSizeScaling: settings.nodeSizeScaling,
        showNodeNames: settings.showNodeNames,
        showSchoolDividers: settings.showSchoolDividers,
        dividerFade: settings.dividerFade,
        dividerSpacing: settings.dividerSpacing,
        dividerLength: settings.dividerLength,
        dividerColorMode: settings.dividerColorMode,
        dividerCustomColor: settings.dividerCustomColor,
        preserveMultiPrereqs: settings.preserveMultiPrereqs,
        verboseLogging: settings.verboseLogging,
        // UI Display settings
        uiTheme: settings.uiTheme,
        learningColor: settings.learningColor,
        fontSizeMultiplier: settings.fontSizeMultiplier,
        aggressivePathValidation: settings.aggressivePathValidation,
        allowLLMMultiplePrereqs: settings.allowLLMMultiplePrereqs,
        llmSelfCorrection: settings.llmSelfCorrection,
        llmSelfCorrectionMaxLoops: settings.llmSelfCorrectionMaxLoops,
        proceduralPrereqInjection: settings.proceduralPrereqInjection,
        proceduralInjection: settings.proceduralInjection,

        // Progression settings
        learningMode: settings.learningMode,
        autoAdvanceLearning: settings.autoAdvanceLearning,
        autoAdvanceMode: settings.autoAdvanceMode,
        xpGlobalMultiplier: settings.xpGlobalMultiplier,
        xpMultiplierDirect: settings.xpMultiplierDirect,
        xpMultiplierSchool: settings.xpMultiplierSchool,
        xpMultiplierAny: settings.xpMultiplierAny,
        // XP caps (max contribution from each source)
        xpCapAny: settings.xpCapAny,
        xpCapSchool: settings.xpCapSchool,
        xpCapDirect: settings.xpCapDirect,
        // Modded XP sources
        moddedXPSources: settings.moddedXPSources,
        // Tier XP requirements
        xpNovice: settings.xpNovice,
        xpApprentice: settings.xpApprentice,
        xpAdept: settings.xpAdept,
        xpExpert: settings.xpExpert,
        xpMaster: settings.xpMaster,
        // Progressive reveal thresholds
        revealName: settings.revealName,
        revealEffects: settings.revealEffects,
        revealDescription: settings.revealDescription,

        // LLM API settings
        llm: {
            apiKey: state.llmConfig.apiKey,
            model: state.llmConfig.model,
            customModel: state.llmConfig.customModel || '',
            maxTokens: state.llmConfig.maxTokens
        },

        // LLM auto-config checkbox state (for Build Tree)
        llmAutoConfigEnabled: document.getElementById('visualFirstLLMCheck')?.checked || false,

        // Field output settings for spell scan
        fields: state.fields,

        // Scan mode
        scanModeTomes: document.getElementById('scanModeTomes') ?
            document.getElementById('scanModeTomes').checked : true,

        // Per-node XP overrides
        xpOverrides: xpOverrides,

        // Window position and size
        windowX: settings.windowX,
        windowY: settings.windowY,
        windowWidth: settings.windowWidth,
        windowHeight: settings.windowHeight,
        isFullscreen: state.isFullscreen,

        // School colors
        schoolColors: settings.schoolColors,
        schoolVisibility: settings.schoolVisibility,
        autoLLMColors: settings.autoLLMColors,

        // ISL-DESTified integration
        islEnabled: settings.islEnabled,
        islXpPerHour: settings.islXpPerHour,
        islTomeBonus: settings.islTomeBonus,

        // Active preset names (preset data now in individual files)
        activeSettingsPreset: typeof _activeSettingsPreset !== 'undefined' ? _activeSettingsPreset : 'Default',

        // Discovery mode
        discoveryMode: settings.discoveryMode,
        showRootSpellNames: settings.showRootSpellNames,

        // Early spell learning
        earlySpellLearning: settings.earlySpellLearning,

        // Passive learning
        passiveLearning: settings.passiveLearning,

        // Spell tome learning
        spellTomeLearning: settings.spellTomeLearning,

        // Heart animation settings
        heartAnimationEnabled: settings.heartAnimationEnabled,
        heartPulseSpeed: settings.heartPulseSpeed,
        heartPulseDelay: settings.heartPulseDelay,
        heartBgOpacity: settings.heartBgOpacity,
        heartBgColor: settings.heartBgColor,
        heartRingColor: settings.heartRingColor,

        // Starfield settings
        starfieldEnabled: settings.starfieldEnabled,
        starfieldFixed: settings.starfieldFixed,
        starfieldSeed: settings.starfieldSeed,
        starfieldColor: settings.starfieldColor,
        starfieldBgColor: settings.starfieldBgColor,
        starfieldDensity: settings.starfieldDensity,
        starfieldMaxSize: settings.starfieldMaxSize,
        // Globe settings
        globeSize: settings.globeSize,
        globeDensity: settings.globeDensity,
        globeDotMin: settings.globeDotMin,
        globeDotMax: settings.globeDotMax,
        globeColor: settings.globeColor,
        magicTextColor: settings.magicTextColor,
        globeText: settings.globeText,
        globeTextSize: settings.globeTextSize,
        particleTrailEnabled: settings.particleTrailEnabled,
        globeBgFill: settings.globeBgFill,
        globeParticleRadius: settings.globeParticleRadius,
        nodeFontSize: settings.nodeFontSize,

        // Spell blacklist & plugin whitelist
        spellBlacklist: settings.spellBlacklist || [],
        pluginWhitelist: settings.pluginWhitelist || [],

        // User-selected root spells per school
        selectedRoots: settings.selectedRoots || {},

        // Dynamic tree building settings
        treeGeneration: settings.treeGeneration,

        // Active scanner preset name (preset data now in individual files)
        activeScannerPreset: typeof _activeScannerPreset !== 'undefined' ? _activeScannerPreset : ''
    };

    console.log('[SpellLearning] Saving unified config');
    window.callCpp('SaveUnifiedConfig', JSON.stringify(unifiedConfig));
}

// =============================================================================
// RESET SETTINGS
// =============================================================================

function resetSettings() {
    settings.hotkey = 'F8';
    settings.hotkeyCode = 66;
    settings.developerMode = false;
    settings.cheatMode = false;
    settings.nodeSizeScaling = true;
    settings.showNodeNames = true;
    settings.showSchoolDividers = true;
    settings.verboseLogging = false;
    // UI Display defaults
    settings.uiTheme = 'skyrim';
    settings.learningColor = '#7890A8';
    settings.fontSizeMultiplier = 1.0;
    settings.learningMode = 'perSchool';
    settings.autoAdvanceLearning = true;
    settings.autoAdvanceMode = 'branch';
    settings.xpGlobalMultiplier = 1;
    settings.xpMultiplierDirect = 100;
    settings.xpMultiplierSchool = 50;
    settings.xpMultiplierAny = 10;
    settings.xpNovice = 100;
    settings.xpApprentice = 200;
    settings.xpAdept = 400;
    settings.xpExpert = 800;
    settings.xpMaster = 1500;
    settings.revealName = 0;
    settings.revealEffects = 25;
    settings.revealDescription = 50;

    // Clear XP overrides
    xpOverrides = {};

    // Update UI
    var cheatToggle = document.getElementById('cheatModeToggle');
    var nodeSizeToggle = document.getElementById('nodeSizeScalingToggle');
    var showNamesToggle = document.getElementById('showNodeNamesToggle');
    var verboseToggle = document.getElementById('verboseLogToggle');
    var hotkeyInput = document.getElementById('hotkeyInput');
    var cheatInfo = document.getElementById('cheatModeInfo');

    var devModeToggle = document.getElementById('developerModeToggle');
    if (devModeToggle) devModeToggle.checked = false;
    if (cheatToggle) cheatToggle.checked = false;
    if (nodeSizeToggle) nodeSizeToggle.checked = true;
    if (showNamesToggle) showNamesToggle.checked = true;
    var showDividersToggle = document.getElementById('showSchoolDividersToggle');
    if (showDividersToggle) showDividersToggle.checked = true;
    if (verboseToggle) verboseToggle.checked = false;
    updateDeveloperModeVisibility(false);
    if (hotkeyInput) hotkeyInput.value = 'F8';
    if (cheatInfo) cheatInfo.classList.add('hidden');

    // Update progression settings UI
    var xpDirectSlider = document.getElementById('xpDirectSlider');
    var xpSchoolSlider = document.getElementById('xpSchoolSlider');
    var xpAnySlider = document.getElementById('xpAnySlider');
    var globalMultSlider = document.getElementById('xpGlobalMultiplierSlider');

    // Helper to update slider fill visual
    function updateSliderFillReset(slider) {
        if (!slider) return;
        var percent = (slider.value - slider.min) / (slider.max - slider.min) * 100;
        slider.style.setProperty('--slider-fill', percent + '%');
    }

    setSegmentedToggleValue('learningModeToggle', 'perSchool');

    // Auto-advance reset
    var autoAdvanceToggle = document.getElementById('autoAdvanceLearningToggle');
    if (autoAdvanceToggle) autoAdvanceToggle.checked = true;
    setSegmentedToggleValue('autoAdvanceModeToggle', 'branch');
    setSegmentedToggleEnabled('autoAdvanceModeToggle', true);

    // Global multiplier
    if (globalMultSlider) {
        globalMultSlider.value = 1;
        updateSliderFillReset(globalMultSlider);
        var globalMultValue = document.getElementById('xpGlobalMultiplierValue');
        if (globalMultValue) globalMultValue.textContent = 'x1';
    }

    if (xpDirectSlider) {
        xpDirectSlider.value = 100;
        updateSliderFillReset(xpDirectSlider);
        var xpDirectValue = document.getElementById('xpDirectValue');
        if (xpDirectValue) xpDirectValue.textContent = '100%';
    }
    if (xpSchoolSlider) {
        xpSchoolSlider.value = 50;
        updateSliderFillReset(xpSchoolSlider);
        var xpSchoolValue = document.getElementById('xpSchoolValue');
        if (xpSchoolValue) xpSchoolValue.textContent = '50%';
    }
    if (xpAnySlider) {
        xpAnySlider.value = 10;
        updateSliderFillReset(xpAnySlider);
        var xpAnyValue = document.getElementById('xpAnyValue');
        if (xpAnyValue) xpAnyValue.textContent = '10%';
    }

    // Reset tier XP inputs
    var tierInputDefaults = {
        'xpNoviceInput': 100,
        'xpApprenticeInput': 200,
        'xpAdeptInput': 400,
        'xpExpertInput': 800,
        'xpMasterInput': 1500
    };
    for (var inputId in tierInputDefaults) {
        var input = document.getElementById(inputId);
        if (input) input.value = tierInputDefaults[inputId];
    }

    // Reset reveal sliders
    var revealSliderDefaults = [
        { id: 'revealNameSlider', valueId: 'revealNameValue', val: 0 },
        { id: 'revealEffectsSlider', valueId: 'revealEffectsValue', val: 25 },
        { id: 'revealDescSlider', valueId: 'revealDescValue', val: 50 }
    ];
    revealSliderDefaults.forEach(function(cfg) {
        var slider = document.getElementById(cfg.id);
        var valueEl = document.getElementById(cfg.valueId);
        if (slider) {
            slider.value = cfg.val;
            updateSliderFillReset(slider);
            if (valueEl) valueEl.textContent = cfg.val + '%';
        }
    });

    // Re-render tree
    if (state.treeData) {
        WheelRenderer.render();
    }

    // Persist reset to C++
    saveSettings();

    console.log('[SpellLearning] Settings reset to defaults and saved');
}
