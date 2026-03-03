/**
 * Settings Config Load (C++ Callbacks)
 * Handles window.onUnifiedConfigLoaded callback from C++ backend.
 * Deserializes unified config JSON into settings, then delegates UI updates
 * to _syncConfigToUI() in settingsConfigLoadUI.js.
 *
 * Depends on: state.js, settings/settingsConfigLoadUI.js, settings/settingsModdedXP.js,
 *             settings/settingsConfig.js
 */

// =============================================================================
// C++ CALLBACK: UNIFIED CONFIG LOADED
// =============================================================================

window.onUnifiedConfigLoaded = function(dataStr) {
    console.log('[SpellLearning] Unified config received');
    try {
        var data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
        if (!data) return;

        // === Panel Settings ===
        settings.hotkey = data.hotkey || 'F8';
        settings.hotkeyCode = data.hotkeyCode || 66;
        settings.developerMode = data.developerMode || false;
        settings.cheatMode = data.cheatMode || false;
        settings.nodeSizeScaling = data.nodeSizeScaling !== false;
        settings.showNodeNames = data.showNodeNames !== false;
        settings.showSchoolDividers = data.showSchoolDividers !== false;
        settings.dividerFade = data.dividerFade !== undefined ? data.dividerFade : 50;
        settings.dividerSpacing = data.dividerSpacing !== undefined ? data.dividerSpacing : 3;
        settings.dividerLength = data.dividerLength !== undefined ? data.dividerLength : 800;
        settings.dividerColorMode = data.dividerColorMode || 'school';
        settings.dividerCustomColor = data.dividerCustomColor || '#ffffff';
        settings.preserveMultiPrereqs = data.preserveMultiPrereqs !== false;
        settings.verboseLogging = data.verboseLogging || false;
        // UI Display settings
        settings.uiTheme = data.uiTheme || 'skyrim';
        settings.learningColor = data.learningColor || '#7890A8';
        settings.fontSizeMultiplier = data.fontSizeMultiplier !== undefined ? data.fontSizeMultiplier : 1.0;
        settings.aggressivePathValidation = data.aggressivePathValidation !== false;
        settings.allowLLMMultiplePrereqs = data.allowLLMMultiplePrereqs !== false;
        settings.llmSelfCorrection = data.llmSelfCorrection !== false;
        settings.llmSelfCorrectionMaxLoops = data.llmSelfCorrectionMaxLoops !== undefined ? data.llmSelfCorrectionMaxLoops : 5;
        settings.proceduralPrereqInjection = data.proceduralPrereqInjection || false;
        // Procedural injection settings
        if (data.proceduralInjection) {
            settings.proceduralInjection.chance = data.proceduralInjection.chance !== undefined ? data.proceduralInjection.chance : 50;
            settings.proceduralInjection.maxPrereqs = data.proceduralInjection.maxPrereqs !== undefined ? data.proceduralInjection.maxPrereqs : 3;
            settings.proceduralInjection.minTier = data.proceduralInjection.minTier !== undefined ? data.proceduralInjection.minTier : 3;
            settings.proceduralInjection.sameTierPreference = data.proceduralInjection.sameTierPreference !== false;
        }

        // === Progression Settings ===
        settings.learningMode = data.learningMode || 'perSchool';
        settings.autoAdvanceLearning = data.autoAdvanceLearning !== false;
        settings.autoAdvanceMode = data.autoAdvanceMode || 'branch';
        settings.xpGlobalMultiplier = data.xpGlobalMultiplier !== undefined ? data.xpGlobalMultiplier : 1;
        settings.xpMultiplierDirect = data.xpMultiplierDirect !== undefined ? data.xpMultiplierDirect : 100;
        settings.xpMultiplierSchool = data.xpMultiplierSchool !== undefined ? data.xpMultiplierSchool : 50;
        settings.xpMultiplierAny = data.xpMultiplierAny !== undefined ? data.xpMultiplierAny : 10;
        // XP caps
        settings.xpCapAny = data.xpCapAny !== undefined ? data.xpCapAny : 100;
        settings.xpCapSchool = data.xpCapSchool !== undefined ? data.xpCapSchool : 100;
        settings.xpCapDirect = data.xpCapDirect !== undefined ? data.xpCapDirect : 100;
        // Tier XP requirements
        settings.xpNovice = data.xpNovice !== undefined ? data.xpNovice : 100;
        settings.xpApprentice = data.xpApprentice !== undefined ? data.xpApprentice : 200;
        settings.xpAdept = data.xpAdept !== undefined ? data.xpAdept : 400;
        settings.xpExpert = data.xpExpert !== undefined ? data.xpExpert : 800;
        settings.xpMaster = data.xpMaster !== undefined ? data.xpMaster : 1500;
        // Progressive reveal thresholds
        settings.revealName = data.revealName !== undefined ? data.revealName : 0;
        settings.revealEffects = data.revealEffects !== undefined ? data.revealEffects : 25;
        settings.revealDescription = data.revealDescription !== undefined ? data.revealDescription : 50;

        // Per-node XP overrides
        if (data.xpOverrides && typeof data.xpOverrides === 'object') {
            xpOverrides = data.xpOverrides;
            console.log('[SpellLearning] Loaded XP overrides for', Object.keys(xpOverrides).length, 'spells');
        } else {
            xpOverrides = {};
        }

        // Modded XP sources
        if (data.moddedXPSources && typeof data.moddedXPSources === 'object') {
            settings.moddedXPSources = data.moddedXPSources;
            rebuildModdedXPSourcesUI();
            console.log('[SpellLearning] Loaded modded XP sources:', Object.keys(settings.moddedXPSources).length);
        }

        // Window position and size
        settings.windowX = data.windowX !== undefined ? data.windowX : null;
        settings.windowY = data.windowY !== undefined ? data.windowY : null;
        settings.windowWidth = data.windowWidth !== undefined ? data.windowWidth : null;
        settings.windowHeight = data.windowHeight !== undefined ? data.windowHeight : null;

        // Fullscreen state
        state.isFullscreen = data.isFullscreen || false;
        settings.isFullscreen = state.isFullscreen;

        // Apply window position and size if saved
        applyWindowPositionAndSize();
        applyFullscreenState();

        // School colors
        if (data.schoolColors && typeof data.schoolColors === 'object') {
            for (var school in data.schoolColors) {
                settings.schoolColors[school] = data.schoolColors[school];
            }
            console.log('[SpellLearning] Loaded colors for', Object.keys(settings.schoolColors).length, 'schools');
        }

        // School visibility
        if (data.schoolVisibility && typeof data.schoolVisibility === 'object') {
            for (var school in data.schoolVisibility) {
                settings.schoolVisibility[school] = data.schoolVisibility[school];
            }
            console.log('[SpellLearning] Loaded visibility for', Object.keys(settings.schoolVisibility).length, 'schools');
        }

        // Auto LLM colors setting
        settings.autoLLMColors = data.autoLLMColors !== undefined ? data.autoLLMColors : false;

        // ISL-DESTified integration settings
        settings.islEnabled = data.islEnabled !== undefined ? data.islEnabled : true;
        settings.islXpPerHour = data.islXpPerHour !== undefined ? data.islXpPerHour : 50;
        settings.islTomeBonus = data.islTomeBonus !== undefined ? data.islTomeBonus : 25;

        // Active preset names
        if (data.activeSettingsPreset && typeof _activeSettingsPreset !== 'undefined') {
            _activeSettingsPreset = data.activeSettingsPreset;
        }
        if (data.activeScannerPreset && typeof _activeScannerPreset !== 'undefined') {
            _activeScannerPreset = data.activeScannerPreset;
        }

        // Discovery mode
        settings.discoveryMode = data.discoveryMode !== undefined ? data.discoveryMode : true;
        settings.showRootSpellNames = data.showRootSpellNames !== undefined ? data.showRootSpellNames : true;

        // Notification settings
        if (data.notifications) {
            var notif = data.notifications;
            if (!settings.notifications) {
                settings.notifications = { weakenedSpellNotifications: true, weakenedSpellInterval: 10 };
            }
            settings.notifications.weakenedSpellNotifications = notif.weakenedSpellNotifications !== undefined ? notif.weakenedSpellNotifications : true;
            settings.notifications.weakenedSpellInterval = notif.weakenedSpellInterval !== undefined ? notif.weakenedSpellInterval : 10;
        }

        // Early spell learning settings
        if (data.earlySpellLearning && typeof data.earlySpellLearning === 'object') {
            var el = data.earlySpellLearning;
            settings.earlySpellLearning.enabled = el.enabled !== undefined ? el.enabled : true;
            settings.earlySpellLearning.unlockThreshold = el.unlockThreshold !== undefined ? el.unlockThreshold : 25;
            settings.earlySpellLearning.selfCastRequiredAt = el.selfCastRequiredAt !== undefined ? el.selfCastRequiredAt : 75;
            settings.earlySpellLearning.selfCastXPMultiplier = el.selfCastXPMultiplier !== undefined ? el.selfCastXPMultiplier : 150;
            settings.earlySpellLearning.binaryEffectThreshold = el.binaryEffectThreshold !== undefined ? el.binaryEffectThreshold : 80;
            settings.earlySpellLearning.modifyGameDisplay = el.modifyGameDisplay !== undefined ? el.modifyGameDisplay : true;
            if (el.powerSteps && Array.isArray(el.powerSteps)) {
                settings.earlySpellLearning.powerSteps = el.powerSteps;
            }
        }

        // Passive learning settings
        if (data.passiveLearning && typeof data.passiveLearning === 'object') {
            var pl = data.passiveLearning;
            settings.passiveLearning.enabled = pl.enabled !== undefined ? pl.enabled : false;
            settings.passiveLearning.scope = pl.scope || 'novice';
            settings.passiveLearning.xpPerGameHour = pl.xpPerGameHour !== undefined ? pl.xpPerGameHour : 5;
            if (pl.maxByTier && typeof pl.maxByTier === 'object') {
                settings.passiveLearning.maxByTier.novice = pl.maxByTier.novice !== undefined ? pl.maxByTier.novice : 100;
                settings.passiveLearning.maxByTier.apprentice = pl.maxByTier.apprentice !== undefined ? pl.maxByTier.apprentice : 75;
                settings.passiveLearning.maxByTier.adept = pl.maxByTier.adept !== undefined ? pl.maxByTier.adept : 50;
                settings.passiveLearning.maxByTier.expert = pl.maxByTier.expert !== undefined ? pl.maxByTier.expert : 25;
                settings.passiveLearning.maxByTier.master = pl.maxByTier.master !== undefined ? pl.maxByTier.master : 5;
            }
        }

        // Spell tome learning settings
        if (data.spellTomeLearning && typeof data.spellTomeLearning === 'object') {
            var stl = data.spellTomeLearning;
            settings.spellTomeLearning.enabled = stl.enabled !== undefined ? stl.enabled : true;
            settings.spellTomeLearning.useProgressionSystem = stl.useProgressionSystem !== undefined ? stl.useProgressionSystem : true;
            settings.spellTomeLearning.grantXPOnRead = stl.grantXPOnRead !== undefined ? stl.grantXPOnRead : true;
            settings.spellTomeLearning.autoSetLearningTarget = stl.autoSetLearningTarget !== undefined ? stl.autoSetLearningTarget : true;
            settings.spellTomeLearning.showNotifications = stl.showNotifications !== undefined ? stl.showNotifications : true;
            settings.spellTomeLearning.xpPercentToGrant = stl.xpPercentToGrant !== undefined ? stl.xpPercentToGrant : 25;
            settings.spellTomeLearning.tomeInventoryBoost = stl.tomeInventoryBoost !== undefined ? stl.tomeInventoryBoost : true;
            settings.spellTomeLearning.tomeInventoryBoostPercent = stl.tomeInventoryBoostPercent !== undefined ? stl.tomeInventoryBoostPercent : 25;
            settings.spellTomeLearning.requirePrereqs = stl.requirePrereqs !== undefined ? stl.requirePrereqs : true;
            settings.spellTomeLearning.requireAllPrereqs = stl.requireAllPrereqs !== undefined ? stl.requireAllPrereqs : true;
            settings.spellTomeLearning.requireSkillLevel = stl.requireSkillLevel !== undefined ? stl.requireSkillLevel : false;
        }

        // === LLM Settings ===
        if (data.llm) {
            state.llmConfig.apiKey = data.llm.apiKey || '';
            state.llmConfig.model = data.llm.model || 'anthropic/claude-sonnet-4';
            state.llmConfig.customModel = data.llm.customModel || '';
            state.llmConfig.maxTokens = data.llm.maxTokens || 4096;
        }

        // === Field Settings ===
        if (data.fields) {
            state.fields = data.fields;
        }

        // === Heart Animation Settings ===
        settings.heartAnimationEnabled = data.heartAnimationEnabled !== false;
        settings.heartPulseSpeed = data.heartPulseSpeed !== undefined ? data.heartPulseSpeed : 1;
        settings.heartPulseDelay = data.heartPulseDelay !== undefined ? data.heartPulseDelay : 0.75;
        settings.heartBgOpacity = data.heartBgOpacity !== undefined ? data.heartBgOpacity : 1.0;
        settings.heartBgColor = data.heartBgColor || '#000000';
        settings.heartRingColor = data.heartRingColor || '#b8a878';

        // === Starfield Settings ===
        settings.starfieldEnabled = data.starfieldEnabled !== false;
        settings.starfieldFixed = data.starfieldFixed === true;
        settings.starfieldSeed = data.starfieldSeed !== undefined ? data.starfieldSeed : 42;
        settings.starfieldColor = data.starfieldColor || '#ffffff';
        settings.starfieldBgColor = data.starfieldBgColor || '#000000';
        settings.starfieldDensity = data.starfieldDensity !== undefined ? data.starfieldDensity : 100;
        settings.starfieldMaxSize = data.starfieldMaxSize !== undefined ? data.starfieldMaxSize : 2;

        // === Globe Settings ===
        settings.globeSize = data.globeSize !== undefined ? data.globeSize : 50;
        settings.globeDensity = data.globeDensity !== undefined ? data.globeDensity : 50;
        settings.globeDotMin = data.globeDotMin !== undefined ? data.globeDotMin : 0.5;
        settings.globeDotMax = data.globeDotMax !== undefined ? data.globeDotMax : 1;
        settings.globeColor = data.globeColor || '#b8a878';
        settings.magicTextColor = data.magicTextColor || '#ffecb3';
        settings.globeText = data.globeText || 'HEART';
        settings.globeTextSize = data.globeTextSize !== undefined ? data.globeTextSize : 16;
        settings.particleTrailEnabled = data.particleTrailEnabled !== false;
        settings.globeBgFill = data.globeBgFill !== false;
        settings.globeParticleRadius = data.globeParticleRadius !== undefined ? data.globeParticleRadius : 50;
        settings.nodeFontSize = data.nodeFontSize !== undefined ? data.nodeFontSize : 10;

        // Spell blacklist
        settings.spellBlacklist = (data.spellBlacklist && Array.isArray(data.spellBlacklist)) ? data.spellBlacklist : [];
        if (settings.spellBlacklist.length > 0) {
            console.log('[SpellLearning] Loaded spell blacklist:', settings.spellBlacklist.length, 'entries');
        }

        // Plugin whitelist
        settings.pluginWhitelist = (data.pluginWhitelist && Array.isArray(data.pluginWhitelist)) ? data.pluginWhitelist : [];
        if (settings.pluginWhitelist.length > 0) {
            console.log('[SpellLearning] Loaded plugin whitelist:', settings.pluginWhitelist.length, 'entries');
        }

        // Selected root spells per school
        if (data.selectedRoots && typeof data.selectedRoots === 'object' && !Array.isArray(data.selectedRoots)) {
            settings.selectedRoots = data.selectedRoots;
            console.log('[SpellLearning] Loaded selected roots:', Object.keys(settings.selectedRoots).length, 'schools');
        } else {
            settings.selectedRoots = {};
        }

        // === Dynamic Tree Building Settings ===
        if (data.treeGeneration && typeof data.treeGeneration === 'object') {
            var tg = data.treeGeneration;
            var stg = settings.treeGeneration;

            stg.themeDiscoveryMode = tg.themeDiscoveryMode || 'dynamic';
            stg.minThemeSize = tg.minThemeSize !== undefined ? tg.minThemeSize : 3;
            stg.maxThemes = tg.maxThemes !== undefined ? tg.maxThemes : 15;
            stg.maxThemeSize = tg.maxThemeSize !== undefined ? tg.maxThemeSize : 80;
            stg.enableSmartRouting = tg.enableSmartRouting !== false;
            stg.llmBranchRouting = tg.llmBranchRouting || false;
            stg.autoBranchFallback = tg.autoBranchFallback !== false;
            stg.rootCount = tg.rootCount !== undefined ? tg.rootCount : 1;
            stg.elementIsolation = tg.elementIsolation !== false;
            stg.elementIsolationStrict = tg.elementIsolationStrict || false;
            stg.elementWeight = tg.elementWeight !== undefined ? tg.elementWeight : 100;
            stg.strictTierOrdering = tg.strictTierOrdering !== false;
            stg.allowSameTierLinks = tg.allowSameTierLinks !== false;
            stg.maxTierSkip = tg.maxTierSkip !== undefined ? tg.maxTierSkip : 2;
            stg.tierMixing = tg.tierMixing || false;
            stg.tierMixingAmount = tg.tierMixingAmount !== undefined ? tg.tierMixingAmount : 20;
            stg.linkStrategy = tg.linkStrategy || 'thematic';
            if (tg.scoring && typeof tg.scoring === 'object') {
                for (var scoreKey in tg.scoring) {
                    stg.scoring[scoreKey] = tg.scoring[scoreKey];
                }
            }
            stg.convergenceEnabled = tg.convergenceEnabled !== false;
            stg.convergenceChance = tg.convergenceChance !== undefined ? tg.convergenceChance : 40;
            stg.convergenceMinTier = tg.convergenceMinTier !== undefined ? tg.convergenceMinTier : 3;
            stg.maxChildrenPerNode = tg.maxChildrenPerNode !== undefined ? tg.maxChildrenPerNode : 3;
            stg.shapeStyle = tg.shapeStyle || 'organic';
            stg.allowSpellRepetition = tg.allowSpellRepetition || false;
            stg.maxRepetitions = tg.maxRepetitions !== undefined ? tg.maxRepetitions : 2;
            stg.repetitionMinTierGap = tg.repetitionMinTierGap !== undefined ? tg.repetitionMinTierGap : 2;
            stg.prioritizeVanilla = tg.prioritizeVanilla !== false;
            stg.modBranchMode = tg.modBranchMode || 'mixed';
            stg.linkValidationPasses = tg.linkValidationPasses !== undefined ? tg.linkValidationPasses : 3;
            stg.warnOnDistanceViolation = tg.warnOnDistanceViolation !== false;
            stg.warnOnElementMismatch = tg.warnOnElementMismatch !== false;
            stg.bidirectionalSoftPrereqs = tg.bidirectionalSoftPrereqs !== undefined ? tg.bidirectionalSoftPrereqs : true;
            stg.llmEdgeCaseEnabled = tg.llmEdgeCaseEnabled || false;
            stg.llmEdgeCaseThreshold = tg.llmEdgeCaseThreshold !== undefined ? tg.llmEdgeCaseThreshold : 10;

            console.log('[SpellLearning] Loaded treeGeneration settings');
        }

        // === Sync all loaded values to UI controls ===
        _syncConfigToUI(data);

        console.log('[SpellLearning] Unified config loaded:', {
            settings: settings,
            llmModel: state.llmConfig.model,
            hasApiKey: !!state.llmConfig.apiKey,
            fields: state.fields
        });

        // Load presets from individual files (guard: only once)
        if (window.callCpp && !window._presetsLoadRequested) {
            window._presetsLoadRequested = true;
            console.log('[SpellLearning] Loading preset files from disk...');
            window.callCpp('LoadPresets', JSON.stringify({ type: 'settings' }));
            window.callCpp('LoadPresets', JSON.stringify({ type: 'scanner' }));
        }

    } catch (e) {
        console.error('[SpellLearning] Failed to parse unified config:', e);
    }
};

// =============================================================================
// LEGACY / COMPATIBILITY CALLBACKS
// =============================================================================

window.onSettingsLoaded = window.onUnifiedConfigLoaded;

window.onLLMConfigLoaded = function(dataStr) {
    try {
        var data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
        if (data && data.apiKey) {
            state.llmConfig.apiKey = data.apiKey;
            state.llmConfig.model = data.model || state.llmConfig.model;
            state.llmConfig.maxTokens = data.maxTokens || state.llmConfig.maxTokens;
        }
    } catch (e) { }
};
