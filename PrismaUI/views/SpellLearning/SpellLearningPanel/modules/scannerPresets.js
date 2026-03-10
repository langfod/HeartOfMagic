/**
 * Scanner Presets Module
 * Save/load/delete/rename user configurations for the spell scanner.
 *
 * Captures: settings.treeGeneration, TreePreviewSun.settings,
 *           TreePreviewFlat.settings, TreePreview.activeMode,
 *           TreeCore globe position, TreeGrowthClassic.settings
 *
 * Stored in UnifiedConfig.json via the global `scannerPresets` object.
 *
 * Depends on:
 * - modules/state.js (settings, scannerPresets)
 * - modules/settingsPanel.js (autoSaveSettings, updateTreeSettingsUI)
 * - modules/treePreview.js (TreePreview)
 * - modules/treePreviewSun.js (TreePreviewSun)
 * - modules/treePreviewFlat.js (TreePreviewFlat)
 * - modules/treeCore.js (TreeCore)
 * - modules/classic/classicMain.js (TreeGrowthClassic)
 * - modules/treeGrowth.js (TreeGrowth)
 *
 * Exports (global):
 * - initializeScannerPresets()
 * - updateScannerPresetsUI()
 * - saveScannerPreset(name)
 * - applyScannerPreset(name)
 * - deleteScannerPreset(name)
 * - renameScannerPreset(oldName, newName)
 * - promptSaveScannerPreset()
 */

// Track which preset was last applied (for active highlighting)
var _activeScannerPreset = '';
var _scannerPresetsInitialized = false;

// =============================================================================
// INITIALIZATION
// =============================================================================

function initializeScannerPresets() {
    if (_scannerPresetsInitialized) return;

    var saveBtn = document.getElementById('saveScannerPresetBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            promptSaveScannerPreset();
        });
    }

    _scannerPresetsInitialized = true;

    // NOTE: LoadPresets is NOT called here anymore.
    // It's triggered from onUnifiedConfigLoaded (in settingsPanel.js) AFTER the active
    // preset name is loaded from config and any legacy migration is complete.
    if (!window.callCpp) {
        updateScannerPresetsUI();
    }

    console.log('[ScannerPresets] Initialized');
}

// =============================================================================
// SAVE PRESET
// =============================================================================

function promptSaveScannerPreset() {
    showPresetNamePrompt('Save Scanner Preset', function(name) {
        // Check for duplicate — overwrite without confirmation since user typed the name
        saveScannerPreset(name);
    });
}

function saveScannerPreset(name) {
    var preset = {
        name: name,
        created: Date.now(),
        settings: {}
    };

    var s = preset.settings;

    // Tree Generation (~40 settings)
    s.treeGeneration = JSON.parse(JSON.stringify(settings.treeGeneration));

    // Root Base — Sun mode
    if (typeof TreePreviewSun !== 'undefined') {
        s.sunSettings = JSON.parse(JSON.stringify(TreePreviewSun.settings));
    }

    // Root Base — Flat mode
    if (typeof TreePreviewFlat !== 'undefined') {
        s.flatSettings = JSON.parse(JSON.stringify(TreePreviewFlat.settings));
    }

    // Active preview mode
    if (typeof TreePreview !== 'undefined') {
        s.activeMode = TreePreview.activeMode;
    }

    // Core Settings — Globe position
    if (typeof TreeCore !== 'undefined') {
        s.globeX = TreeCore.globeX;
        s.globeY = TreeCore.globeY;
        s.globeRadius = TreeCore.globeRadius;
    }

    // Classic Growth settings
    if (typeof TreeGrowthClassic !== 'undefined') {
        s.classicSettings = JSON.parse(JSON.stringify(TreeGrowthClassic.settings));
    }

    // Tree Growth active mode (Classic, Tree, etc.)
    if (typeof TreeGrowth !== 'undefined') {
        s.treeGrowthActiveMode = TreeGrowth.activeMode;
    }

    // Tree Growth — Tree mode settings
    if (typeof TreeGrowthTree !== 'undefined') {
        s.treeGrowthTreeSettings = JSON.parse(JSON.stringify(TreeGrowthTree.settings));
    }

    // Pre Req Master (lock) settings
    if (typeof PreReqMaster !== 'undefined') {
        s.prmEnabled = PreReqMaster.isEnabled();
        s.prmSettings = PreReqMaster.getSettings();
    }

    scannerPresets[name] = preset;
    _activeScannerPreset = name;

    // Save as individual file via C++
    if (window.callCpp) {
        window.callCpp('SavePreset', JSON.stringify({
            type: 'scanner',
            name: name,
            data: preset
        }));
    }

    // Save active preset name to unified config
    _scannerAutoSave();

    updateScannerPresetsUI();
    console.log('[ScannerPresets] Saved preset file:', name);
}

// =============================================================================
// APPLY PRESET
// =============================================================================

function applyScannerPreset(name) {
    var preset = scannerPresets[name];
    if (!preset || !preset.settings) {
        console.warn('[ScannerPresets] Preset not found:', name);
        return;
    }

    var s = preset.settings;
    console.log('[ScannerPresets] Applying preset:', name);

    // --- Tree Generation ---
    if (s.treeGeneration) {
        _deepCopy(s.treeGeneration, settings.treeGeneration);
        if (typeof updateTreeSettingsUI === 'function') {
            updateTreeSettingsUI();
        }
    }

    // --- Root Base — Sun mode ---
    if (s.sunSettings && typeof TreePreviewSun !== 'undefined') {
        _deepCopy(s.sunSettings, TreePreviewSun.settings);
        _updateDragInputs({
            'tpSunRingTier': TreePreviewSun.settings.ringTier,
            'tpSunNodeSize': TreePreviewSun.settings.nodeSize,
            'tpSunRoots': TreePreviewSun.settings.rootsPerSchool,
            'tpSunGrid': TreePreviewSun.settings.gridDensity,
            'tpSunTiers': TreePreviewSun.settings.tierDensity,
            'tpSunClump': TreePreviewSun.settings.rootClumping,
            'tpSunRand': TreePreviewSun.settings.rootRandomness
        });
        // Update grid type toggle buttons
        _updateToggleButtons('tpSunGrid', TreePreviewSun.settings.gridType);
        // Update section split buttons
        _updatePairButtons('tpSunSplitEqual', 'tpSunSplitProp', !TreePreviewSun.settings.proportional);
        // Update growth direction buttons
        _updatePairButtons('tpSunGrowOut', 'tpSunGrowInvert', !TreePreviewSun.settings.invertGrowth);
    }

    // --- Root Base — Flat mode ---
    if (s.flatSettings && typeof TreePreviewFlat !== 'undefined') {
        _deepCopy(s.flatSettings, TreePreviewFlat.settings);
        _updateDragInputs({
            'tpFlatNodeSize': TreePreviewFlat.settings.nodeSize,
            'tpFlatRoots': TreePreviewFlat.settings.rootsPerSchool
        });
    }

    // --- Active preview mode ---
    if (s.activeMode && typeof TreePreview !== 'undefined' && TreePreview.switchMode) {
        TreePreview.switchMode(s.activeMode);
    }

    // --- Core Settings — Globe ---
    if (typeof TreeCore !== 'undefined') {
        if (s.globeX !== undefined) TreeCore.globeX = s.globeX;
        if (s.globeY !== undefined) TreeCore.globeY = s.globeY;
        if (s.globeRadius !== undefined) TreeCore.globeRadius = s.globeRadius;
        if (TreeCore._updateSliders) TreeCore._updateSliders();
        if (TreeCore._markDirty) TreeCore._markDirty();
    }

    // --- Classic Growth ---
    if (s.classicSettings && typeof TreeGrowthClassic !== 'undefined') {
        _deepCopy(s.classicSettings, TreeGrowthClassic.settings);
        _updateDragInputs({
            'tgClassicOpacity': TreeGrowthClassic.settings.ghostOpacity,
            'tgClassicNodeSize': TreeGrowthClassic.settings.nodeRadius,
            'tgClassicSpread': TreeGrowthClassic.settings.spread,
            'tgClassicRadialBias': TreeGrowthClassic.settings.radialBias,
            'tgClassicCenterMask': TreeGrowthClassic.settings.centerMask
        });
        // Spell matching toggle needs special handling
        _updateClassicMatchButtons(TreeGrowthClassic.settings.spellMatching);
        // Tier zones chart is visual-only; redrawn on next render
    }

    // --- Tree Growth active mode ---
    if (s.treeGrowthActiveMode && typeof TreeGrowth !== 'undefined' && TreeGrowth.switchMode) {
        TreeGrowth.switchMode(s.treeGrowthActiveMode);
    }

    // --- Tree Growth — Tree mode settings ---
    if (s.treeGrowthTreeSettings && typeof TreeGrowthTree !== 'undefined') {
        _deepCopy(s.treeGrowthTreeSettings, TreeGrowthTree.settings);
        _updateDragInputs({
            'tgTreeOpacity': TreeGrowthTree.settings.ghostOpacity,
            'tgTreeNodeSize': TreeGrowthTree.settings.nodeRadius,
            'tgTreeTrunkThickness': TreeGrowthTree.settings.trunkThickness,
            'tgTreeBranchSpread': TreeGrowthTree.settings.branchSpread,
            'tgTreeRootSpread': TreeGrowthTree.settings.rootSpread,
            'tgTreePctBranches': TreeGrowthTree.settings.pctBranches,
            'tgTreePctTrunk': TreeGrowthTree.settings.pctTrunk,
            'tgTreePctRoot': TreeGrowthTree.settings.pctRoot
        });
    }

    // --- Pre Req Master (lock) settings ---
    if (typeof PreReqMaster !== 'undefined' && s.prmSettings) {
        _applyPrmSettings(s.prmSettings, s.prmEnabled);
    }

    // --- Mark all canvases dirty ---
    if (typeof TreePreview !== 'undefined' && TreePreview._markDirty) {
        TreePreview._markDirty(true);
    }
    if (typeof TreeGrowth !== 'undefined' && TreeGrowth._markDirty) {
        TreeGrowth._markDirty();
    }

    _activeScannerPreset = name;
    updateScannerPresetsUI();

    _scannerAutoSave();

    console.log('[ScannerPresets] Applied preset:', name);
}

// =============================================================================
// DELETE PRESET
// =============================================================================

function deleteScannerPreset(name, deleteBtn) {
    PresetBase.handleDelete(deleteBtn, name, scannerPresets, SCANNER_PRESET_DEFAULT_NAME, 'scanner', {
        getDefaultKey: _getDefaultPresetKey,
        getActiveKey: function() { return _activeScannerPreset; },
        setActiveKey: function(v) { _activeScannerPreset = v; },
        onDefaultReset: '',
        onUpdateUI: updateScannerPresetsUI,
        onAutoSave: _scannerAutoSave
    });
}

// =============================================================================
// RENAME PRESET
// =============================================================================

function renameScannerPreset(oldName, newName) {
    PresetBase.handleRename(oldName, newName, scannerPresets, SCANNER_PRESET_DEFAULT_NAME, 'scanner', 'scannerPresets.overwriteConfirm', {
        getDefaultKey: _getDefaultPresetKey,
        getActiveKey: function() { return _activeScannerPreset; },
        setActiveKey: function(v) { _activeScannerPreset = v; },
        onUpdateUI: updateScannerPresetsUI,
        onAutoSave: _scannerAutoSave
    });
}

// =============================================================================
// UI RENDERING
// =============================================================================

function updateScannerPresetsUI() {
    var row = document.getElementById('scannerPresetsRow');
    var chipsContainer = document.getElementById('scannerPresetChips');
    if (!row || !chipsContainer) return;

    var keys = Object.keys(scannerPresets);
    var divider = row.querySelector('.scanner-presets-divider');

    // Show/hide the divider + chips when empty (row always visible for Save button)
    if (divider) divider.style.display = keys.length > 0 ? '' : 'none';
    chipsContainer.style.display = keys.length > 0 ? '' : 'none';

    PresetBase.renderChips(chipsContainer, scannerPresets, _activeScannerPreset, SCANNER_PRESET_DEFAULT_NAME, {
        onApply: applyScannerPreset,
        onSave: saveScannerPreset,
        onDelete: deleteScannerPreset,
        onInlineRename: function(k, span) {
            PresetBase.startInlineRename(k, span, scannerPresets, renameScannerPreset);
        }
    });

    // Sync easy mode chips
    if (typeof updateEasyPresetChips === 'function') updateEasyPresetChips();
}

// =============================================================================
// HELPERS
// =============================================================================

var SCANNER_PRESET_DEFAULT_NAME = 'Default';

/**
 * Returns the key of the default preset (named "Default", case-insensitive).
 * The default preset cannot be deleted.
 */
function _getDefaultPresetKey() {
    return PresetBase.getDefaultKey(scannerPresets, SCANNER_PRESET_DEFAULT_NAME);
}

/**
 * Auto-save helper — uses scheduleAutoSave (debounced) if available, else autoSaveSettings.
 */
function _scannerAutoSave() {
    if (typeof scheduleAutoSave === 'function') {
        scheduleAutoSave();
    } else if (typeof autoSaveSettings === 'function') {
        autoSaveSettings();
    }
}

/**
 * Deep copy source object properties into target (preserves target's structure).
 * Handles nested objects like scoring and tierZones.
 */
function _deepCopy(source, target) {
    if (!source || !target) return;
    for (var key in source) {
        if (!source.hasOwnProperty(key)) continue;
        if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (!target[key] || typeof target[key] !== 'object') {
                target[key] = {};
            }
            _deepCopy(source[key], target[key]);
        } else {
            target[key] = source[key];
        }
    }
}

/**
 * Update drag input field values (TreePreviewUtils-style inputs).
 * @param {Object} idValueMap - { elementId: newValue, ... }
 */
function _updateDragInputs(idValueMap) {
    for (var id in idValueMap) {
        if (!idValueMap.hasOwnProperty(id)) continue;
        var field = document.getElementById(id);
        if (field) {
            field.value = idValueMap[id];
        }
    }
}

/**
 * Update grid type toggle buttons (e.g. Naive/Linear/EqualArea/Fibonacci/Square).
 * Looks for buttons with data-grid attribute inside the parent matching the prefix.
 */
function _updateToggleButtons(prefix, activeValue) {
    var buttons = document.querySelectorAll('[data-grid]');
    for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        if (btn.id && btn.id.indexOf('tpSunGrid') === 0) {
            if (btn.getAttribute('data-grid') === activeValue) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    }
}

/**
 * Update a pair of toggle buttons (one active, one off).
 */
function _updatePairButtons(activeId, inactiveId, firstIsActive) {
    var btn1 = document.getElementById(activeId);
    var btn2 = document.getElementById(inactiveId);
    if (!btn1 || !btn2) return;

    var actStyle = 'background:rgba(184,168,120,0.25); color:rgba(184,168,120,0.9);';
    var offStyle = 'background:transparent; color:rgba(184,168,120,0.4);';

    // Preserve the existing base style, just toggle bg/color
    if (firstIsActive) {
        btn1.style.background = 'rgba(184,168,120,0.25)';
        btn1.style.color = 'rgba(184,168,120,0.9)';
        btn2.style.background = 'transparent';
        btn2.style.color = 'rgba(184,168,120,0.4)';
    } else {
        btn2.style.background = 'rgba(184,168,120,0.25)';
        btn2.style.color = 'rgba(184,168,120,0.9)';
        btn1.style.background = 'transparent';
        btn1.style.color = 'rgba(184,168,120,0.4)';
    }
}

/**
 * Restore PRM (Pre Req Master) settings to their UI controls.
 * @param {Object} prmSettings - The saved PRM settings object
 * @param {boolean} prmEnabled - Whether PRM was enabled
 */
function _applyPrmSettings(prmSettings, prmEnabled) {
    // Enable toggle
    var enableToggle = document.getElementById('prmEnabled');
    if (enableToggle && prmEnabled !== undefined) {
        enableToggle.checked = !!prmEnabled;
    }

    // Global lock %
    var globalSlider = document.getElementById('prmGlobalLockSlider');
    var globalValue = document.getElementById('prmGlobalLockValue');
    if (globalSlider && prmSettings.globalLockPercent !== undefined) {
        globalSlider.value = prmSettings.globalLockPercent;
        if (globalValue) globalValue.textContent = prmSettings.globalLockPercent + '%';
        if (typeof updateSliderFillGlobal === 'function') updateSliderFillGlobal(globalSlider);
    }

    // Tier %s
    var tierMap = {
        'prmTierNovice': 'novice',
        'prmTierApprentice': 'apprentice',
        'prmTierAdept': 'adept',
        'prmTierExpert': 'expert',
        'prmTierMaster': 'master'
    };
    if (prmSettings.tierPercents) {
        for (var elId in tierMap) {
            if (!tierMap.hasOwnProperty(elId)) continue;
            var tierKey = tierMap[elId];
            var slider = document.getElementById(elId);
            if (slider && prmSettings.tierPercents[tierKey] !== undefined) {
                slider.value = prmSettings.tierPercents[tierKey];
                var valEl = document.getElementById(elId + 'Value');
                if (valEl) valEl.textContent = prmSettings.tierPercents[tierKey] + '%';
                if (typeof updateSliderFillGlobal === 'function') updateSliderFillGlobal(slider);
            }
        }
    }

    // School distribution
    var schoolDist = document.getElementById('prmSchoolDistribution');
    if (schoolDist && prmSettings.schoolDistribution) {
        schoolDist.value = prmSettings.schoolDistribution;
    }

    // Pool source
    var poolSource = document.getElementById('prmPoolSource');
    if (poolSource && prmSettings.poolSource) {
        poolSource.value = prmSettings.poolSource;
    }

    // Distance slider
    var distSlider = document.getElementById('prmDistanceSlider');
    var distValue = document.getElementById('prmDistanceValue');
    if (distSlider && prmSettings.distance !== undefined) {
        distSlider.value = prmSettings.distance;
        if (distValue) distValue.textContent = prmSettings.distance;
        if (typeof updateSliderFillGlobal === 'function') updateSliderFillGlobal(distSlider);
    }

    // Proximity bias slider
    var proxSlider = document.getElementById('prmProximityBiasSlider');
    var proxValue = document.getElementById('prmProximityBiasValue');
    if (proxSlider && prmSettings.proximityBias !== undefined) {
        var proxPercent = Math.round(prmSettings.proximityBias * 100);
        proxSlider.value = proxPercent;
        if (proxValue) proxValue.textContent = proxPercent + '%';
        if (typeof updateSliderFillGlobal === 'function') updateSliderFillGlobal(proxSlider);
    }

    // Tier constraint checkboxes
    var tierCheckboxes = {
        'prmSameTier': 'sameTier',
        'prmPrevTier': 'prevTier',
        'prmHigherTier': 'higherTier',
        'prmAllowLockedLock': 'allowLockedLock'
    };
    for (var cbId in tierCheckboxes) {
        if (!tierCheckboxes.hasOwnProperty(cbId)) continue;
        var settingKey = tierCheckboxes[cbId];
        var cb = document.getElementById(cbId);
        if (cb && prmSettings[settingKey] !== undefined) {
            cb.checked = !!prmSettings[settingKey];
        }
    }
}

/**
 * Update Classic Growth spell matching 3-way toggle buttons.
 */
function _updateClassicMatchButtons(mode) {
    var modes = ['Simple', 'Layered', 'Smart'];
    for (var i = 0; i < modes.length; i++) {
        var btn = document.getElementById('tgClassicMatch' + modes[i]);
        if (btn) {
            if (modes[i].toLowerCase() === mode) {
                btn.style.background = 'rgba(184,168,120,0.25)';
                btn.style.color = 'rgba(184,168,120,0.9)';
            } else {
                btn.style.background = 'transparent';
                btn.style.color = 'rgba(184,168,120,0.4)';
            }
        }
    }
}

console.log('[ScannerPresets] Loaded');
