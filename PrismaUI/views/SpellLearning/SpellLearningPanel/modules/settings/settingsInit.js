/**
 * Settings Panel Initialization
 * The main initializeSettings() function that wires up all settings UI controls.
 *
 * Depends on: state.js, config.js, constants.js, settings/settingsUIHelpers.js,
 *             settings/settingsTheme.js, settings/settingsHeart.js,
 *             settings/settingsTreeGen.js, settings/settingsConfig.js,
 *             settings/settingsInitXP.js, uiHelpers.js, i18n.js, colorPicker.js
 */

// =============================================================================
// MAIN INITIALIZATION
// =============================================================================

function initializeSettings() {
    // Load saved settings
    loadSettings();

    // Verbose logging toggle
    var verboseToggle = document.getElementById('verboseLogToggle');
    if (verboseToggle) {
        verboseToggle.checked = settings.verboseLogging;
        verboseToggle.addEventListener('change', function() {
            settings.verboseLogging = this.checked;
        });
    }

    // Debug grid toggle - shows grid candidate positions
    var debugGridToggle = document.getElementById('debugGridToggle');
    if (debugGridToggle) {
        debugGridToggle.checked = settings.showDebugGrid || false;
        debugGridToggle.addEventListener('change', function() {
            settings.showDebugGrid = this.checked;
            console.log('[SpellLearning] Debug grid:', settings.showDebugGrid);

            // Update SVG renderer
            if (typeof WheelRenderer !== 'undefined') {
                WheelRenderer.showDebugGrid = this.checked;
                if (WheelRenderer.debugGridLayer) {
                    WheelRenderer.debugGridLayer.style.display = this.checked ? 'block' : 'none';
                }
                if (this.checked) {
                    WheelRenderer.renderDebugGrid();
                }
            }

            // Update Canvas renderer
            if (typeof CanvasRenderer !== 'undefined') {
                CanvasRenderer.showDebugGrid = this.checked;
                CanvasRenderer._needsRender = true;
            }
        });
    }

    // Developer mode toggle - shows/hides advanced options
    var devModeToggle = document.getElementById('developerModeToggle');
    var debugOptionsSection = document.getElementById('debugOptionsSection');
    if (devModeToggle) {
        devModeToggle.checked = settings.developerMode || false;
        updateDeveloperModeVisibility(settings.developerMode || false);

        devModeToggle.addEventListener('change', function() {
            settings.developerMode = this.checked;
            console.log('[SpellLearning] Developer mode:', settings.developerMode);
            updateDeveloperModeVisibility(settings.developerMode);
        });
    }

    // Cheat mode toggle - includes all debug features
    var cheatToggle = document.getElementById('cheatModeToggle');
    var cheatInfo = document.getElementById('cheatModeInfo');
    if (cheatToggle) {
        cheatToggle.checked = settings.cheatMode;
        if (cheatInfo) cheatInfo.classList.toggle('hidden', !settings.cheatMode);

        cheatToggle.addEventListener('change', function() {
            settings.cheatMode = this.checked;
            console.log('[SpellLearning] Cheat mode:', settings.cheatMode);
            if (cheatInfo) cheatInfo.classList.toggle('hidden', !settings.cheatMode);
            autoSaveSettings();
            // Re-render tree to show/hide all spell names
            if (state.treeData) {
                WheelRenderer.render();
                // Also refresh canvas renderer
                if (typeof CanvasRenderer !== 'undefined') {
                    CanvasRenderer.refresh();
                }
                if (typeof SmartRenderer !== 'undefined') {
                    SmartRenderer.refresh();
                }
            }
            // Update button visibility if node is selected
            if (state.selectedNode) {
                showSpellDetails(state.selectedNode);
                updateDetailsProgression(state.selectedNode);
            }
        });
    }

    // Node size scaling toggle
    var nodeSizeToggle = document.getElementById('nodeSizeScalingToggle');
    if (nodeSizeToggle) {
        nodeSizeToggle.checked = settings.nodeSizeScaling;
        nodeSizeToggle.addEventListener('change', function() {
            settings.nodeSizeScaling = this.checked;
            console.log('[SpellLearning] Node size scaling:', settings.nodeSizeScaling);
            // Re-render tree with new sizing
            if (state.treeData) {
                WheelRenderer.render();
            }
        });
    }

    // Show node names toggle
    var showNamesToggle = document.getElementById('showNodeNamesToggle');
    if (showNamesToggle) {
        showNamesToggle.checked = settings.showNodeNames;
        showNamesToggle.addEventListener('change', function() {
            settings.showNodeNames = this.checked;
            console.log('[SpellLearning] Show node names:', settings.showNodeNames);
            // Re-render tree
            if (state.treeData) {
                WheelRenderer.render();
            }
        });
    }

    // Show school dividers toggle
    var showDividersToggle = document.getElementById('showSchoolDividersToggle');
    if (showDividersToggle) {
        showDividersToggle.checked = settings.showSchoolDividers;
        showDividersToggle.addEventListener('change', function() {
            settings.showSchoolDividers = this.checked;
            console.log('[SpellLearning] Show school dividers:', settings.showSchoolDividers);
            // Show/hide related settings
            updateDividerSettingsVisibility();
            // Re-render tree
            if (state.treeData) {
                WheelRenderer.render();
            }
        });
    }

    // Strict pie slices toggle
    var strictPieSlicesToggle = document.getElementById('strictPieSlicesToggle');
    if (strictPieSlicesToggle) {
        strictPieSlicesToggle.checked = settings.strictPieSlices;
        strictPieSlicesToggle.addEventListener('change', function() {
            settings.strictPieSlices = this.checked;
            console.log('[SpellLearning] Strict pie slices:', settings.strictPieSlices);
            // Re-layout and render tree
            if (state.treeData) {
                WheelRenderer.layout();
                WheelRenderer.render();
            }
        });
    }

    // Discovery mode toggle
    var discoveryModeToggle = document.getElementById('discoveryModeToggle');
    if (discoveryModeToggle) {
        discoveryModeToggle.checked = settings.discoveryMode;
        discoveryModeToggle.addEventListener('change', function() {
            settings.discoveryMode = this.checked;
            console.log('[SpellLearning] Discovery mode:', settings.discoveryMode);
            // Re-render tree to show/hide locked nodes
            if (state.treeData) {
                WheelRenderer.render();
                // Also refresh canvas renderer (rebuilds discovery visibility)
                if (typeof CanvasRenderer !== 'undefined') {
                    CanvasRenderer.refresh();
                }
                if (typeof SmartRenderer !== 'undefined') {
                    SmartRenderer.refresh();
                }
            }
        });
    }

    // Show root spell names toggle (for discovery mode)
    var showRootNamesToggle = document.getElementById('showRootSpellNamesToggle');
    if (showRootNamesToggle) {
        showRootNamesToggle.checked = settings.showRootSpellNames;
        showRootNamesToggle.addEventListener('change', function() {
            settings.showRootSpellNames = this.checked;
            console.log('[SpellLearning] Show root spell names:', settings.showRootSpellNames);
            // Re-render tree
            if (state.treeData) {
                WheelRenderer.render();
            }
        });
    }

    // =========================================================================
    // SPELL TOME LEARNING SETTINGS
    // =========================================================================

    // Use Progression System toggle (Vanilla vs XP system)
    var useProgressionToggle = document.getElementById('useProgressionSystemToggle');
    if (useProgressionToggle) {
        useProgressionToggle.checked = settings.spellTomeLearning.useProgressionSystem;
        useProgressionToggle.addEventListener('change', function() {
            settings.spellTomeLearning.useProgressionSystem = this.checked;
            console.log('[SpellLearning] Use progression system:', this.checked);
            // Update description
            var modeDesc = document.getElementById('tomeLearningModeDesc');
            if (modeDesc) {
                if (this.checked) {
                    modeDesc.textContent = t('settings.tomeLearning.progressionModeDesc');
                } else {
                    modeDesc.textContent = t('settings.tomeLearning.vanillaModeDesc');
                }
            }
            // Show/hide progression-specific settings
            var xpGrantRow = document.getElementById('tomeXpGrantRow');
            if (xpGrantRow) xpGrantRow.style.display = this.checked ? '' : 'none';

            scheduleAutoSave();
        });
        // Initial visibility
        var xpGrantRow = document.getElementById('tomeXpGrantRow');
        if (xpGrantRow) xpGrantRow.style.display = settings.spellTomeLearning.useProgressionSystem ? '' : 'none';
    }

    // Tome XP Grant slider
    var tomeXpGrantSlider = document.getElementById('tomeXpGrantSlider');
    var tomeXpGrantValue = document.getElementById('tomeXpGrantValue');
    if (tomeXpGrantSlider) {
        tomeXpGrantSlider.value = settings.spellTomeLearning.xpPercentToGrant;
        if (tomeXpGrantValue) tomeXpGrantValue.textContent = settings.spellTomeLearning.xpPercentToGrant + '%';
        updateSliderFillGlobal(tomeXpGrantSlider);

        tomeXpGrantSlider.addEventListener('input', function() {
            var value = parseInt(this.value);
            settings.spellTomeLearning.xpPercentToGrant = value;
            if (tomeXpGrantValue) tomeXpGrantValue.textContent = value + '%';
            updateSliderFillGlobal(this);
            scheduleAutoSave();
        });
    }

    // Tome Inventory Boost toggle
    var tomeInventoryBoostToggle = document.getElementById('tomeInventoryBoostToggle');
    if (tomeInventoryBoostToggle) {
        tomeInventoryBoostToggle.checked = settings.spellTomeLearning.tomeInventoryBoost;
        tomeInventoryBoostToggle.addEventListener('change', function() {
            settings.spellTomeLearning.tomeInventoryBoost = this.checked;
            console.log('[SpellLearning] Tome inventory boost:', this.checked);
            // Show/hide boost slider
            var boostRow = document.getElementById('tomeInventoryBoostRow');
            if (boostRow) boostRow.style.display = this.checked ? '' : 'none';
            scheduleAutoSave();
        });
        // Initial visibility
        var boostRow = document.getElementById('tomeInventoryBoostRow');
        if (boostRow) boostRow.style.display = settings.spellTomeLearning.tomeInventoryBoost ? '' : 'none';
    }

    // Tome Inventory Boost Percent slider
    var tomeBoostSlider = document.getElementById('tomeInventoryBoostSlider');
    var tomeBoostValue = document.getElementById('tomeInventoryBoostValue');
    if (tomeBoostSlider) {
        tomeBoostSlider.value = settings.spellTomeLearning.tomeInventoryBoostPercent;
        if (tomeBoostValue) tomeBoostValue.textContent = '+' + settings.spellTomeLearning.tomeInventoryBoostPercent + '%';
        updateSliderFillGlobal(tomeBoostSlider);

        tomeBoostSlider.addEventListener('input', function() {
            var value = parseInt(this.value);
            settings.spellTomeLearning.tomeInventoryBoostPercent = value;
            if (tomeBoostValue) tomeBoostValue.textContent = '+' + value + '%';
            updateSliderFillGlobal(this);
            scheduleAutoSave();
        });
    }

    // Require Prerequisites toggle
    var requirePrereqsToggle = document.getElementById('tomeRequirePrereqsToggle');
    if (requirePrereqsToggle) {
        requirePrereqsToggle.checked = settings.spellTomeLearning.requirePrereqs;
        requirePrereqsToggle.addEventListener('change', function() {
            settings.spellTomeLearning.requirePrereqs = this.checked;
            console.log('[SpellLearning] Tome require prereqs:', this.checked);
            // Show/hide child setting
            var allPrereqsRow = document.getElementById('tomeRequireAllPrereqsRow');
            if (allPrereqsRow) allPrereqsRow.style.display = this.checked ? '' : 'none';
            scheduleAutoSave();
        });
        // Initial visibility
        var allPrereqsRow = document.getElementById('tomeRequireAllPrereqsRow');
        if (allPrereqsRow) allPrereqsRow.style.display = settings.spellTomeLearning.requirePrereqs ? '' : 'none';
    }

    // Require ALL Prerequisites toggle (child setting)
    var requireAllPrereqsToggle = document.getElementById('tomeRequireAllPrereqsToggle');
    if (requireAllPrereqsToggle) {
        requireAllPrereqsToggle.checked = settings.spellTomeLearning.requireAllPrereqs;
        requireAllPrereqsToggle.addEventListener('change', function() {
            settings.spellTomeLearning.requireAllPrereqs = this.checked;
            console.log('[SpellLearning] Tome require ALL prereqs:', this.checked);
            scheduleAutoSave();
        });
    }

    // Require Skill Level toggle
    var requireSkillLevelToggle = document.getElementById('tomeRequireSkillLevelToggle');
    if (requireSkillLevelToggle) {
        requireSkillLevelToggle.checked = settings.spellTomeLearning.requireSkillLevel;
        requireSkillLevelToggle.addEventListener('change', function() {
            settings.spellTomeLearning.requireSkillLevel = this.checked;
            console.log('[SpellLearning] Tome require skill level:', this.checked);
            scheduleAutoSave();
        });
    }

    // =========================================================================
    // NOTIFICATION SETTINGS
    // =========================================================================

    // Ensure notifications object exists
    if (!settings.notifications) {
        settings.notifications = {
            weakenedSpellNotifications: true,
            weakenedSpellInterval: 10
        };
    }

    // Weakened spell notifications toggle
    var weakenedNotificationsToggle = document.getElementById('weakenedNotificationsToggle');
    var notificationIntervalRow = document.getElementById('notificationIntervalRow');
    if (weakenedNotificationsToggle) {
        weakenedNotificationsToggle.checked = settings.notifications.weakenedSpellNotifications;
        // Show/hide interval row based on toggle state
        if (notificationIntervalRow) {
            notificationIntervalRow.style.display = weakenedNotificationsToggle.checked ? 'flex' : 'none';
        }

        weakenedNotificationsToggle.addEventListener('change', function() {
            settings.notifications.weakenedSpellNotifications = this.checked;
            // Show/hide interval row
            if (notificationIntervalRow) {
                notificationIntervalRow.style.display = this.checked ? 'flex' : 'none';
            }
            console.log('[SpellLearning] Weakened spell notifications:', this.checked);
            scheduleAutoSave();
        });
    }

    // Notification interval slider
    var notificationIntervalSlider = document.getElementById('notificationIntervalSlider');
    var notificationIntervalValue = document.getElementById('notificationIntervalValue');
    if (notificationIntervalSlider) {
        notificationIntervalSlider.value = settings.notifications.weakenedSpellInterval || 10;
        if (notificationIntervalValue) {
            notificationIntervalValue.textContent = notificationIntervalSlider.value + 's';
        }
        updateSliderFillGlobal(notificationIntervalSlider);

        notificationIntervalSlider.addEventListener('input', function() {
            var value = parseInt(this.value);
            settings.notifications.weakenedSpellInterval = value;
            if (notificationIntervalValue) {
                notificationIntervalValue.textContent = value + 's';
            }
            updateSliderFillGlobal(this);
            console.log('[SpellLearning] Notification interval:', value, 'seconds');
            scheduleAutoSave();
        });
    }

    // UI Theme selector
    initializeThemeSelector();

    // Learning color picker
    var learningColorPicker = document.getElementById('learningColorPicker');
    var learningColorValue = document.getElementById('learningColorValue');
    if (learningColorPicker) {
        learningColorPicker.value = settings.learningColor || '#7890A8';
        if (learningColorValue) learningColorValue.textContent = learningColorPicker.value.toUpperCase();
        applyLearningColor(settings.learningColor || '#7890A8');

        learningColorPicker.addEventListener('input', function() {
            settings.learningColor = this.value;
            if (learningColorValue) learningColorValue.textContent = this.value.toUpperCase();
            applyLearningColor(this.value);
            console.log('[SpellLearning] Learning color:', settings.learningColor);
            // Re-render tree with new color
            if (state.treeData) {
                WheelRenderer.render();
            }
            scheduleAutoSave();
        });
    }

    // Font size multiplier slider
    var fontSizeSlider = document.getElementById('fontSizeSlider');
    var fontSizeValue = document.getElementById('fontSizeValue');
    if (fontSizeSlider) {
        fontSizeSlider.value = settings.fontSizeMultiplier || 1.0;
        if (fontSizeValue) fontSizeValue.textContent = (settings.fontSizeMultiplier || 1.0).toFixed(1) + 'x';
        updateSliderFillGlobal(fontSizeSlider);
        applyFontSizeMultiplier(settings.fontSizeMultiplier || 1.0);

        fontSizeSlider.addEventListener('input', function() {
            var value = parseFloat(this.value);
            settings.fontSizeMultiplier = value;
            if (fontSizeValue) fontSizeValue.textContent = value.toFixed(1) + 'x';
            updateSliderFillGlobal(this);
            applyFontSizeMultiplier(value);
            console.log('[SpellLearning] Font size multiplier:', settings.fontSizeMultiplier);
            scheduleAutoSave();
        });
    }

    // Preserve multi-prerequisites toggle
    var preserveMultiPrereqsToggle = document.getElementById('preserveMultiPrereqsToggle');
    if (preserveMultiPrereqsToggle) {
        preserveMultiPrereqsToggle.checked = settings.preserveMultiPrereqs;
        preserveMultiPrereqsToggle.addEventListener('change', function() {
            settings.preserveMultiPrereqs = this.checked;
            console.log('[SpellLearning] Preserve multi-prerequisites:', settings.preserveMultiPrereqs);
            // Note: This affects tree parsing, so user would need to re-scan to see changes
        });
    }

    // Tree generation, procedural injection, dividers, ISL, presets (extracted helper)
    _initTreeGenProceduralSettings();

    // Hotkey configuration
    var hotkeyInput = document.getElementById('hotkeyInput');
    var changeHotkeyBtn = document.getElementById('changeHotkeyBtn');
    var resetHotkeyBtn = document.getElementById('resetHotkeyBtn');

    if (hotkeyInput && changeHotkeyBtn) {
        hotkeyInput.value = settings.hotkey;

        changeHotkeyBtn.addEventListener('click', function() {
            hotkeyInput.classList.add('listening');
            hotkeyInput.value = t('settingsPanel.pressAKey');

            function onKeyDown(e) {
                e.preventDefault();
                var keyName = e.key.toUpperCase();

                // Check if it's a valid key we support
                if (KEY_CODES[keyName] || KEY_CODES[e.key]) {
                    settings.hotkey = keyName;
                    settings.hotkeyCode = KEY_CODES[keyName] || KEY_CODES[e.key];
                    hotkeyInput.value = keyName;
                    console.log('[SpellLearning] Hotkey changed to:', keyName, '(code:', settings.hotkeyCode, ')');
                } else {
                    hotkeyInput.value = settings.hotkey;
                    console.log('[SpellLearning] Unsupported key:', e.key);
                }

                hotkeyInput.classList.remove('listening');
                document.removeEventListener('keydown', onKeyDown);
            }

            document.addEventListener('keydown', onKeyDown);
        });

        resetHotkeyBtn.addEventListener('click', function() {
            settings.hotkey = 'F8';
            settings.hotkeyCode = 66;
            hotkeyInput.value = 'F8';
            hotkeyInput.classList.remove('listening');
        });
    }

    // Pause Game on Focus toggle
    var pauseGameToggle = document.getElementById('pauseGameOnFocusToggle');
    if (pauseGameToggle) {
        // Default to true (checked) if not set
        pauseGameToggle.checked = settings.pauseGameOnFocus !== false;

        pauseGameToggle.addEventListener('change', function() {
            settings.pauseGameOnFocus = this.checked;
            console.log('[SpellLearning] Pause game on focus:', settings.pauseGameOnFocus);

            // Notify C++ immediately
            if (window.callCpp) {
                window.callCpp('SetPauseGameOnFocus', settings.pauseGameOnFocus ? 'true' : 'false');
            }
        });
    }

    // Heart Animation Settings Popup
    initializeHeartSettings();

    // XP / Progression settings (extracted helper)
    _initXPSettings();

    // School color UI (extracted helper)
    _initSchoolColorUI();
}
