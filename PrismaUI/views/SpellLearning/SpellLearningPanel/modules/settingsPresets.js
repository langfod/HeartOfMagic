/**
 * Settings Presets Module
 * Save/load/delete/rename user configurations for progression, early spell,
 * and spell tome settings. Replaces the old difficulty profile system.
 *
 * Ships with 3 built-in presets: Default (Normal), Easy, Hard.
 *
 * Depends on:
 * - modules/state.js (settings, settingsPresets)
 * - modules/settingsPanel.js (autoSaveSettings/scheduleAutoSave, updateEarlyLearningUI, updateSpellTomeLearningUI)
 * - modules/constants.js (no longer needs DIFFICULTY_PROFILES)
 *
 * Exports (global):
 * - initializeSettingsPresets()
 * - updateSettingsPresetsUI()
 * - saveSettingsPreset(name)
 * - applySettingsPreset(name)
 * - deleteSettingsPreset(name, deleteBtn)
 * - renameSettingsPreset(oldName, newName)
 * - promptSaveSettingsPreset()
 * - updateProgressionSettingsUI()
 */

// Track which preset was last applied (for active highlighting)
var _activeSettingsPreset = '';
var _settingsPresetsInitialized = false;

var SETTINGS_PRESET_DEFAULT_NAME = 'Default';

// =============================================================================
// BUILT-IN PRESETS
// =============================================================================

var BUILT_IN_SETTINGS_PRESETS = {
    'Default': {
        name: 'Default',
        builtIn: true,
        settings: {
            xpGlobalMultiplier: 1,
            xpMultiplierDirect: 100,
            xpMultiplierSchool: 50,
            xpMultiplierAny: 10,
            xpCapAny: 5,
            xpCapSchool: 15,
            xpCapDirect: 50,
            xpNovice: 100,
            xpApprentice: 200,
            xpAdept: 400,
            xpExpert: 800,
            xpMaster: 1500,
            learningMode: 'perSchool',
            revealName: 10,
            revealEffects: 25,
            revealDescription: 50,
            discoveryMode: false,
            showRootSpellNames: true,
            earlySpellLearning: {
                enabled: true,
                unlockThreshold: 25,
                minEffectiveness: 20,
                maxEffectiveness: 70,
                selfCastRequiredAt: 75,
                selfCastXPMultiplier: 150,
                binaryEffectThreshold: 80,
                modifyGameDisplay: true,
                powerSteps: [
                    { xp: 25, power: 20, label: 'Budding' },
                    { xp: 40, power: 35, label: 'Developing' },
                    { xp: 55, power: 50, label: 'Practicing' },
                    { xp: 70, power: 65, label: 'Advancing' },
                    { xp: 85, power: 80, label: 'Refining' }
                ]
            },
            spellTomeLearning: {
                enabled: true,
                useProgressionSystem: true,
                grantXPOnRead: true,
                autoSetLearningTarget: true,
                showNotifications: true,
                xpPercentToGrant: 25,
                tomeInventoryBoost: true,
                tomeInventoryBoostPercent: 25,
                requirePrereqs: true,
                requireAllPrereqs: true,
                requireSkillLevel: false
            },
            notifications: {
                weakenedSpellNotifications: true,
                weakenedSpellInterval: 10
            }
        }
    },
    'Easy': {
        name: 'Easy',
        builtIn: false,
        settings: {
            xpGlobalMultiplier: 2,
            xpMultiplierDirect: 150,
            xpMultiplierSchool: 75,
            xpMultiplierAny: 25,
            xpCapAny: 10,
            xpCapSchool: 25,
            xpCapDirect: 65,
            xpNovice: 50,
            xpApprentice: 100,
            xpAdept: 200,
            xpExpert: 400,
            xpMaster: 800,
            learningMode: 'perSchool',
            revealName: 5,
            revealEffects: 15,
            revealDescription: 30,
            discoveryMode: false,
            showRootSpellNames: true,
            earlySpellLearning: {
                enabled: true,
                unlockThreshold: 20,
                minEffectiveness: 30,
                maxEffectiveness: 80,
                selfCastRequiredAt: 60,
                selfCastXPMultiplier: 200,
                binaryEffectThreshold: 70,
                modifyGameDisplay: true,
                powerSteps: [
                    { xp: 25, power: 20, label: 'Budding' },
                    { xp: 40, power: 35, label: 'Developing' },
                    { xp: 55, power: 50, label: 'Practicing' },
                    { xp: 70, power: 65, label: 'Advancing' },
                    { xp: 85, power: 80, label: 'Refining' }
                ]
            },
            spellTomeLearning: {
                enabled: true,
                useProgressionSystem: true,
                grantXPOnRead: true,
                autoSetLearningTarget: true,
                showNotifications: true,
                xpPercentToGrant: 30,
                tomeInventoryBoost: true,
                tomeInventoryBoostPercent: 30,
                requirePrereqs: true,
                requireAllPrereqs: true,
                requireSkillLevel: false
            },
            notifications: {
                weakenedSpellNotifications: true,
                weakenedSpellInterval: 10
            }
        }
    },
    'Hard': {
        name: 'Hard',
        builtIn: false,
        settings: {
            xpGlobalMultiplier: 0.75,
            xpMultiplierDirect: 75,
            xpMultiplierSchool: 35,
            xpMultiplierAny: 5,
            xpCapAny: 3,
            xpCapSchool: 10,
            xpCapDirect: 40,
            xpNovice: 150,
            xpApprentice: 350,
            xpAdept: 700,
            xpExpert: 1200,
            xpMaster: 2500,
            learningMode: 'perSchool',
            revealName: 15,
            revealEffects: 35,
            revealDescription: 60,
            discoveryMode: false,
            showRootSpellNames: true,
            earlySpellLearning: {
                enabled: true,
                unlockThreshold: 30,
                minEffectiveness: 15,
                maxEffectiveness: 60,
                selfCastRequiredAt: 70,
                selfCastXPMultiplier: 125,
                binaryEffectThreshold: 85,
                modifyGameDisplay: true,
                powerSteps: [
                    { xp: 25, power: 20, label: 'Budding' },
                    { xp: 40, power: 35, label: 'Developing' },
                    { xp: 55, power: 50, label: 'Practicing' },
                    { xp: 70, power: 65, label: 'Advancing' },
                    { xp: 85, power: 80, label: 'Refining' }
                ]
            },
            spellTomeLearning: {
                enabled: true,
                useProgressionSystem: true,
                grantXPOnRead: true,
                autoSetLearningTarget: true,
                showNotifications: true,
                xpPercentToGrant: 20,
                tomeInventoryBoost: true,
                tomeInventoryBoostPercent: 20,
                requirePrereqs: true,
                requireAllPrereqs: true,
                requireSkillLevel: false
            },
            notifications: {
                weakenedSpellNotifications: true,
                weakenedSpellInterval: 10
            }
        }
    }
};

// =============================================================================
// INITIALIZATION
// =============================================================================

function initializeSettingsPresets() {
    if (_settingsPresetsInitialized) return;

    // Set Default as active if nothing is active
    if (!_activeSettingsPreset) {
        _activeSettingsPreset = SETTINGS_PRESET_DEFAULT_NAME;
    }

    var saveBtn = document.getElementById('saveSettingsPresetBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            promptSaveSettingsPreset();
        });
    }

    _settingsPresetsInitialized = true;

    // NOTE: LoadPresets is NOT called here anymore.
    // It's triggered from onUnifiedConfigLoaded (in settingsPanel.js) AFTER the active
    // preset name is loaded from config and any legacy migration is complete.
    // This ensures the correct ordering: config → migrate → load files → apply.
    if (!window.callCpp) {
        // Dev harness / no C++ — seed built-ins directly
        for (var key in BUILT_IN_SETTINGS_PRESETS) {
            if (!BUILT_IN_SETTINGS_PRESETS.hasOwnProperty(key)) continue;
            if (!settingsPresets[key]) {
                settingsPresets[key] = JSON.parse(JSON.stringify(BUILT_IN_SETTINGS_PRESETS[key]));
            }
        }
        updateSettingsPresetsUI();
    }

    console.log('[SettingsPresets] Initialized');
}

// =============================================================================
// SAVE PRESET
// =============================================================================

function promptSaveSettingsPreset() {
    showPresetNamePrompt('Save Settings Preset', function(name) {
        // Cannot use reserved name
        if (name.toLowerCase() === SETTINGS_PRESET_DEFAULT_NAME.toLowerCase() && !settingsPresets[name]) {
            return;
        }
        saveSettingsPreset(name);
    });
}

function saveSettingsPreset(name) {
    var preset = settingsPresets[name] || {};
    preset.name = name;
    preset.created = preset.created || Date.now();

    preset.settings = {
        // Flat progression settings
        xpGlobalMultiplier: settings.xpGlobalMultiplier,
        xpMultiplierDirect: settings.xpMultiplierDirect,
        xpMultiplierSchool: settings.xpMultiplierSchool,
        xpMultiplierAny: settings.xpMultiplierAny,
        xpCapAny: settings.xpCapAny,
        xpCapSchool: settings.xpCapSchool,
        xpCapDirect: settings.xpCapDirect,
        xpNovice: settings.xpNovice,
        xpApprentice: settings.xpApprentice,
        xpAdept: settings.xpAdept,
        xpExpert: settings.xpExpert,
        xpMaster: settings.xpMaster,
        learningMode: settings.learningMode,
        revealName: settings.revealName,
        revealEffects: settings.revealEffects,
        revealDescription: settings.revealDescription,
        discoveryMode: settings.discoveryMode,
        showRootSpellNames: settings.showRootSpellNames,
        // Nested objects (deep copy)
        earlySpellLearning: JSON.parse(JSON.stringify(settings.earlySpellLearning)),
        spellTomeLearning: JSON.parse(JSON.stringify(settings.spellTomeLearning)),
        notifications: JSON.parse(JSON.stringify(settings.notifications || {})),
        moddedXPSources: JSON.parse(JSON.stringify(settings.moddedXPSources || {}))
    };

    settingsPresets[name] = preset;
    _activeSettingsPreset = name;

    // Save as individual file via C++
    if (window.callCpp) {
        window.callCpp('SavePreset', JSON.stringify({
            type: 'settings',
            name: name,
            data: preset
        }));
    }

    updateSettingsPresetsUI();

    // Save active preset name to unified config
    _settingsAutoSave();

    console.log('[SettingsPresets] Saved preset file:', name);
}

// =============================================================================
// APPLY PRESET
// =============================================================================

function applySettingsPreset(name) {
    var preset = settingsPresets[name];
    if (!preset || !preset.settings) {
        console.warn('[SettingsPresets] Preset not found:', name);
        return;
    }

    var ps = preset.settings;
    console.log('[SettingsPresets] Applying preset:', name);

    // --- Flat progression settings ---
    var flatKeys = [
        'xpGlobalMultiplier', 'xpMultiplierDirect', 'xpMultiplierSchool', 'xpMultiplierAny',
        'xpCapAny', 'xpCapSchool', 'xpCapDirect',
        'xpNovice', 'xpApprentice', 'xpAdept', 'xpExpert', 'xpMaster',
        'learningMode', 'revealName', 'revealEffects', 'revealDescription',
        'discoveryMode', 'showRootSpellNames'
    ];
    for (var i = 0; i < flatKeys.length; i++) {
        var key = flatKeys[i];
        if (ps[key] !== undefined) {
            settings[key] = ps[key];
        }
    }

    // --- Early Spell Learning (deep copy) ---
    if (ps.earlySpellLearning) {
        var src = ps.earlySpellLearning;
        for (var k in src) {
            if (!src.hasOwnProperty(k)) continue;
            if (k === 'powerSteps') {
                settings.earlySpellLearning.powerSteps = JSON.parse(JSON.stringify(src.powerSteps));
            } else {
                settings.earlySpellLearning[k] = src[k];
            }
        }
    }

    // --- Spell Tome Learning (deep copy) ---
    if (ps.spellTomeLearning) {
        for (var k in ps.spellTomeLearning) {
            if (ps.spellTomeLearning.hasOwnProperty(k)) {
                settings.spellTomeLearning[k] = ps.spellTomeLearning[k];
            }
        }
    }

    // --- Notifications ---
    if (ps.notifications && settings.notifications) {
        for (var k in ps.notifications) {
            if (ps.notifications.hasOwnProperty(k)) {
                settings.notifications[k] = ps.notifications[k];
            }
        }
    }

    // --- Modded XP Sources ---
    if (ps.moddedXPSources) {
        settings.moddedXPSources = JSON.parse(JSON.stringify(ps.moddedXPSources));
        if (typeof rebuildModdedXPSourcesUI === 'function') {
            rebuildModdedXPSourcesUI();
        }
    }

    // --- Update all UI controls ---
    updateProgressionSettingsUI();

    if (typeof updateEarlyLearningUI === 'function') {
        updateEarlyLearningUI();
    }

    if (typeof updateSpellTomeLearningUI === 'function') {
        updateSpellTomeLearningUI();
    }

    // Discovery mode toggle
    var discoveryModeToggle = document.getElementById('discoveryModeToggle');
    if (discoveryModeToggle) discoveryModeToggle.checked = settings.discoveryMode;
    var showRootNamesToggle = document.getElementById('showRootSpellNamesToggle');
    if (showRootNamesToggle) showRootNamesToggle.checked = settings.showRootSpellNames;

    // Re-render tree if discovery mode changed
    if (typeof state !== 'undefined' && state.treeData) {
        if (typeof WheelRenderer !== 'undefined' && WheelRenderer.render) {
            WheelRenderer.render();
        }
    }

    _activeSettingsPreset = name;
    updateSettingsPresetsUI();

    _settingsAutoSave();

    console.log('[SettingsPresets] Applied preset:', name);
}

// =============================================================================
// DELETE PRESET
// =============================================================================

function deleteSettingsPreset(name, deleteBtn) {
    PresetBase.handleDelete(deleteBtn, name, settingsPresets, SETTINGS_PRESET_DEFAULT_NAME, 'settings', {
        getDefaultKey: _getDefaultSettingsPresetKey,
        getActiveKey: function() { return _activeSettingsPreset; },
        setActiveKey: function(v) { _activeSettingsPreset = v; },
        onDefaultReset: SETTINGS_PRESET_DEFAULT_NAME,
        onUpdateUI: updateSettingsPresetsUI,
        onAutoSave: _settingsAutoSave
    });
}

// =============================================================================
// RENAME PRESET
// =============================================================================

function renameSettingsPreset(oldName, newName) {
    PresetBase.handleRename(oldName, newName, settingsPresets, SETTINGS_PRESET_DEFAULT_NAME, 'settings', 'settingsPresets.overwriteConfirm', {
        getDefaultKey: _getDefaultSettingsPresetKey,
        getActiveKey: function() { return _activeSettingsPreset; },
        setActiveKey: function(v) { _activeSettingsPreset = v; },
        onUpdateUI: updateSettingsPresetsUI,
        onAutoSave: _settingsAutoSave
    });
}

// =============================================================================
// UI RENDERING
// =============================================================================

function updateSettingsPresetsUI() {
    var row = document.getElementById('settingsPresetsRow');
    var chipsContainer = document.getElementById('settingsPresetChips');
    if (!row || !chipsContainer) return;

    var keys = Object.keys(settingsPresets);
    var divider = row.querySelector('.scanner-presets-divider');

    // Show/hide divider + chips when empty
    if (divider) divider.style.display = keys.length > 0 ? '' : 'none';
    chipsContainer.style.display = keys.length > 0 ? '' : 'none';

    PresetBase.renderChips(chipsContainer, settingsPresets, _activeSettingsPreset, SETTINGS_PRESET_DEFAULT_NAME, {
        onApply: applySettingsPreset,
        onSave: saveSettingsPreset,
        onDelete: deleteSettingsPreset,
        onInlineRename: function(k, span) {
            PresetBase.startInlineRename(k, span, settingsPresets, renameSettingsPreset);
        }
    });
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Returns the key of the default preset (named "Default", case-insensitive).
 */
function _getDefaultSettingsPresetKey() {
    return PresetBase.getDefaultKey(settingsPresets, SETTINGS_PRESET_DEFAULT_NAME);
}

/**
 * Auto-save helper — prefers debounced scheduleAutoSave over direct autoSaveSettings.
 */
function _settingsAutoSave() {
    if (typeof scheduleAutoSave === 'function') {
        scheduleAutoSave();
    } else if (typeof autoSaveSettings === 'function') {
        autoSaveSettings();
    }
}

console.log('[SettingsPresets] Loaded');
