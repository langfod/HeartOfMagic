/**
 * Settings Panel Module (Core)
 * Handles settings UI initialization and config management.
 *
 * Split modules (loaded separately):
 *   settings/settingsTheme.js      - Theme system
 *   settings/settingsModdedXP.js   - Modded XP source UI
 *   settings/settingsBlacklist.js  - Spell blacklist modal
 *   settings/settingsWhitelist.js  - Plugin whitelist modal
 *   settings/settingsHeartUI.js    - Learning color, font, early learning, tome, notification UI
 *   settings/settingsHeart.js      - Heart animation popup + renderer helpers
 *   settings/settingsTreeGen.js    - Tree generation presets + UI update
 *   settings/settingsTreeGenInit.js - Tree gen settings init + LLM features
 *
 * Depends on: state.js, config.js, constants.js, uiHelpers.js, i18n.js,
 *             settings/settingsTheme.js, settings/settingsModdedXP.js
 *
 * Exports (global):
 * - initializeSettings()
 * - loadSettings()
 * - saveSettings()
 * - autoSaveSettings()
 * - saveUnifiedConfig()
 * - resetSettings()
 * - window.onUnifiedConfigLoaded
 */

// =============================================================================
// SEGMENTED TOGGLE HELPER
// =============================================================================

/**
 * Initialize a segmented toggle control.
 * @param {string} containerId - The id of the .segmented-toggle div
 * @param {string} activeValue - The currently active value
 * @param {function} onChange - Callback with selected value string
 */
function initSegmentedToggle(containerId, activeValue, onChange) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var btns = container.querySelectorAll('.seg-btn');
    // Set initial active state
    for (var i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute('data-value') === activeValue) {
            btns[i].classList.add('active');
        } else {
            btns[i].classList.remove('active');
        }
    }
    // Click handlers
    container.addEventListener('click', function(e) {
        var btn = e.target.closest('.seg-btn');
        if (!btn || btn.classList.contains('active')) return;
        var siblings = container.querySelectorAll('.seg-btn');
        for (var j = 0; j < siblings.length; j++) siblings[j].classList.remove('active');
        btn.classList.add('active');
        if (onChange) onChange(btn.getAttribute('data-value'));
    });
}

/**
 * Set the active button on a segmented toggle without triggering callbacks.
 */
function setSegmentedToggleValue(containerId, value) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var btns = container.querySelectorAll('.seg-btn');
    for (var i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute('data-value') === value) {
            btns[i].classList.add('active');
        } else {
            btns[i].classList.remove('active');
        }
    }
}

/**
 * Enable or disable (dim) a segmented toggle.
 */
function setSegmentedToggleEnabled(containerId, enabled) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.style.opacity = enabled ? '1' : '0.5';
    container.style.pointerEvents = enabled ? '' : 'none';
}

// =============================================================================
// SETTINGS PANEL
// =============================================================================

/**
 * Update the Retry School UI based on schools that need attention
 * Called periodically to keep the dropdown current
 */
function updateRetrySchoolUI() {
    var retrySchoolRow = document.getElementById('retrySchoolRow');
    var retrySchoolSelect = document.getElementById('retrySchoolSelect');
    
    if (!retrySchoolRow || !retrySchoolSelect) return;
    
    // Get schools needing attention
    var needsAttention = window.getSchoolsNeedingAttention ? window.getSchoolsNeedingAttention() : [];
    
    // Also include failed schools if any
    var failedSchools = state.lastFailedSchools || [];
    
    // Combine both lists
    var allProblemSchools = [];
    needsAttention.forEach(function(info) {
        allProblemSchools.push({
            school: info.school,
            reason: t('settingsPanel.unreachableNodes', {count: info.unreachableCount})
        });
    });
    failedSchools.forEach(function(school) {
        // Don't duplicate
        if (!allProblemSchools.some(function(p) { return p.school === school; })) {
            allProblemSchools.push({
                school: school,
                reason: t('settingsPanel.generationFailed')
            });
        }
    });
    
    // Show/hide the row
    if (allProblemSchools.length > 0) {
        retrySchoolRow.style.display = 'flex';
        
        // Remember current selection
        var currentSelection = retrySchoolSelect.value;
        
        // Rebuild dropdown options
        retrySchoolSelect.innerHTML = '<option value="">' + t('settings.treeGen.selectSchool') + '</option>';
        allProblemSchools.forEach(function(info) {
            var option = document.createElement('option');
            option.value = info.school;
            option.textContent = info.school + ' (' + info.reason + ')';
            retrySchoolSelect.appendChild(option);
        });
        
        // Restore selection if still valid
        if (currentSelection && allProblemSchools.some(function(p) { return p.school === currentSelection; })) {
            retrySchoolSelect.value = currentSelection;
        }
    } else {
        retrySchoolRow.style.display = 'none';
    }
}

/**
 * Update visibility of developer-only elements based on developer mode setting.
 * @param {boolean} enabled - Whether developer mode is enabled
 */
function updateDeveloperModeVisibility(enabled) {
    console.log('[SpellLearning] Updating developer mode visibility:', enabled);
    
    // Get all elements with dev-only class
    var devOnlyElements = document.querySelectorAll('.dev-only');
    devOnlyElements.forEach(function(el) {
        if (enabled) {
            el.classList.remove('hidden');
            el.style.display = '';
        } else {
            el.classList.add('hidden');
            el.style.display = 'none';
        }
    });
    
    // Show/hide debug options section in settings
    var debugOptionsSection = document.getElementById('debugOptionsSection');
    if (debugOptionsSection) {
        if (enabled) {
            debugOptionsSection.classList.remove('hidden');
        } else {
            debugOptionsSection.classList.add('hidden');
        }
    }
    
    // Handle Tree Rules tab visibility
    var treeRulesTab = document.getElementById('tabTreeRules');
    if (treeRulesTab) {
        if (enabled) {
            treeRulesTab.style.display = '';
        } else {
            treeRulesTab.style.display = 'none';
            // If currently on Tree Rules tab, switch to Spell Scan
            if (treeRulesTab.classList.contains('active')) {
                var spellScanTab = document.getElementById('tabSpellScan');
                if (spellScanTab) {
                    spellScanTab.click();
                }
            }
        }
    }
}

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
    
    // ===========================================================================
    // SPELL TOME LEARNING SETTINGS
    // ===========================================================================
    
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
    
    // Tree Generation Settings
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
        // Show/hide loops slider based on toggle
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
    
    // Check for schools needing attention periodically and update UI
    // Only runs when panel is visible to avoid wasting CPU
    setInterval(function() {
        if (window._panelVisible !== false) {
            updateRetrySchoolUI();
        }
    }, 2000);
    
    var proceduralPrereqInjectionToggle = document.getElementById('proceduralPrereqInjectionToggle');
    var proceduralInjectionSettings = document.getElementById('proceduralInjectionSettings');
    if (proceduralPrereqInjectionToggle) {
        proceduralPrereqInjectionToggle.checked = settings.proceduralPrereqInjection;
        // Show/hide sub-settings
        if (proceduralInjectionSettings) {
            proceduralInjectionSettings.style.display = settings.proceduralPrereqInjection ? 'block' : 'none';
        }
        proceduralPrereqInjectionToggle.addEventListener('change', function() {
            settings.proceduralPrereqInjection = this.checked;
            console.log('[SpellLearning] Procedural prereq injection:', settings.proceduralPrereqInjection);
            // Show/hide sub-settings
            if (proceduralInjectionSettings) {
                proceduralInjectionSettings.style.display = this.checked ? 'block' : 'none';
            }
            scheduleAutoSave();
            // If enabled and tree exists, inject prereqs now
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
            // Re-render tree
            if (state.treeData) {
                WheelRenderer.render();
            }
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
            // Re-render tree
            if (state.treeData) {
                WheelRenderer.render();
            }
        });
    }
    
    // Divider color mode select
    var dividerColorModeSelect = document.getElementById('dividerColorModeSelect');
    if (dividerColorModeSelect) {
        dividerColorModeSelect.value = settings.dividerColorMode;
        dividerColorModeSelect.addEventListener('change', function() {
            settings.dividerColorMode = this.value;
            updateDividerColorRowVisibility();
            // Re-render tree
            if (state.treeData) {
                WheelRenderer.render();
            }
        });
    }
    
    // Divider custom color picker
    var dividerCustomColorPicker = document.getElementById('dividerCustomColorPicker');
    if (dividerCustomColorPicker) {
        dividerCustomColorPicker.value = settings.dividerCustomColor;
        dividerCustomColorPicker.addEventListener('input', function() {
            settings.dividerCustomColor = this.value;
            // Re-render tree
            if (state.treeData) {
                WheelRenderer.render();
            }
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

// C++ callback for loading unified config
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
        settings.nodeSizeScaling = data.nodeSizeScaling !== false;  // default true
        settings.showNodeNames = data.showNodeNames !== false;  // default true
        settings.showSchoolDividers = data.showSchoolDividers !== false;  // default true
        settings.dividerFade = data.dividerFade !== undefined ? data.dividerFade : 50;
        settings.dividerSpacing = data.dividerSpacing !== undefined ? data.dividerSpacing : 3;
        settings.dividerLength = data.dividerLength !== undefined ? data.dividerLength : 800;
        settings.dividerColorMode = data.dividerColorMode || 'school';
        settings.dividerCustomColor = data.dividerCustomColor || '#ffffff';
        settings.preserveMultiPrereqs = data.preserveMultiPrereqs !== false;  // default true
        settings.verboseLogging = data.verboseLogging || false;
        // UI Display settings
        settings.uiTheme = data.uiTheme || 'skyrim';
        settings.learningColor = data.learningColor || '#7890A8';
        settings.fontSizeMultiplier = data.fontSizeMultiplier !== undefined ? data.fontSizeMultiplier : 1.0;
        settings.aggressivePathValidation = data.aggressivePathValidation !== false;  // default true
        settings.allowLLMMultiplePrereqs = data.allowLLMMultiplePrereqs !== false;  // default true
        settings.llmSelfCorrection = data.llmSelfCorrection !== false;  // default true
        settings.llmSelfCorrectionMaxLoops = data.llmSelfCorrectionMaxLoops !== undefined ? data.llmSelfCorrectionMaxLoops : 5;
        settings.proceduralPrereqInjection = data.proceduralPrereqInjection || false;  // default false
        // Procedural injection settings
        if (data.proceduralInjection) {
            settings.proceduralInjection.chance = data.proceduralInjection.chance !== undefined ? data.proceduralInjection.chance : 50;
            settings.proceduralInjection.maxPrereqs = data.proceduralInjection.maxPrereqs !== undefined ? data.proceduralInjection.maxPrereqs : 3;
            settings.proceduralInjection.minTier = data.proceduralInjection.minTier !== undefined ? data.proceduralInjection.minTier : 3;
            settings.proceduralInjection.sameTierPreference = data.proceduralInjection.sameTierPreference !== false;
        }
        
        // === Progression Settings ===
        settings.learningMode = data.learningMode || 'perSchool';
        settings.autoAdvanceLearning = data.autoAdvanceLearning !== false;  // default true
        settings.autoAdvanceMode = data.autoAdvanceMode || 'branch';
        settings.xpGlobalMultiplier = data.xpGlobalMultiplier !== undefined ? data.xpGlobalMultiplier : 1;
        settings.xpMultiplierDirect = data.xpMultiplierDirect !== undefined ? data.xpMultiplierDirect : 100;
        settings.xpMultiplierSchool = data.xpMultiplierSchool !== undefined ? data.xpMultiplierSchool : 50;
        settings.xpMultiplierAny = data.xpMultiplierAny !== undefined ? data.xpMultiplierAny : 10;
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
        
        // Apply fullscreen state
        applyFullscreenState();
        
        // School colors
        if (data.schoolColors && typeof data.schoolColors === 'object') {
            // Merge with defaults (keep any new schools that might have been added)
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
        
        // Active preset names (preset data now loaded from individual files)
        if (data.activeSettingsPreset && typeof _activeSettingsPreset !== 'undefined') {
            _activeSettingsPreset = data.activeSettingsPreset;
        }
        if (data.activeScannerPreset && typeof _activeScannerPreset !== 'undefined') {
            _activeScannerPreset = data.activeScannerPreset;
        }

        // LEGACY MIGRATION: Removed. Preset files are now bundled with the mod.
        // Old embedded presets in config.json are simply ignored.
        // If data.settingsPresets or data.scannerPresets exist, we no longer migrate them
        // to avoid overwriting user's customized preset files on every load.
        
        // Discovery mode
        settings.discoveryMode = data.discoveryMode !== undefined ? data.discoveryMode : true;
        var discoveryModeToggle = document.getElementById('discoveryModeToggle');
        if (discoveryModeToggle) discoveryModeToggle.checked = settings.discoveryMode;
        
        // Show root spell names in discovery mode
        settings.showRootSpellNames = data.showRootSpellNames !== undefined ? data.showRootSpellNames : true;
        var showRootNamesToggle = document.getElementById('showRootSpellNamesToggle');
        if (showRootNamesToggle) showRootNamesToggle.checked = settings.showRootSpellNames;
        
        // Preserve multi-prerequisites
        var preserveMultiPrereqsToggle = document.getElementById('preserveMultiPrereqsToggle');
        if (preserveMultiPrereqsToggle) preserveMultiPrereqsToggle.checked = settings.preserveMultiPrereqs;
        
        // Tree generation settings
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
            // Update slider fill AFTER setting value
            updateSliderFillGlobal(islTomeBonusSlider);
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
            // Load power steps if present
            if (el.powerSteps && Array.isArray(el.powerSteps)) {
                settings.earlySpellLearning.powerSteps = el.powerSteps;
            }
        }
        updateEarlyLearningUI();
        // Update power steps UI if function exists
        if (typeof renderPowerSteps === 'function') renderPowerSteps();

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
        if (typeof updatePassiveLearningUI === 'function') updatePassiveLearningUI();

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
            // Learning requirements
            settings.spellTomeLearning.requirePrereqs = stl.requirePrereqs !== undefined ? stl.requirePrereqs : true;
            settings.spellTomeLearning.requireAllPrereqs = stl.requireAllPrereqs !== undefined ? stl.requireAllPrereqs : true;
            settings.spellTomeLearning.requireSkillLevel = stl.requireSkillLevel !== undefined ? stl.requireSkillLevel : false;
        }
        updateSpellTomeLearningUI();
        
        // Load notification settings
        if (data.notifications) {
            var notif = data.notifications;
            if (!settings.notifications) {
                settings.notifications = { weakenedSpellNotifications: true, weakenedSpellInterval: 10 };
            }
            settings.notifications.weakenedSpellNotifications = notif.weakenedSpellNotifications !== undefined ? notif.weakenedSpellNotifications : true;
            settings.notifications.weakenedSpellInterval = notif.weakenedSpellInterval !== undefined ? notif.weakenedSpellInterval : 10;
        }
        updateNotificationsUI();
        
        // Update settings presets UI
        if (typeof updateSettingsPresetsUI === 'function') {
            updateSettingsPresetsUI();
        }
        
        if (verboseToggle) verboseToggle.checked = settings.verboseLogging;
        if (hotkeyInput) hotkeyInput.value = settings.hotkey;
        if (cheatInfo) cheatInfo.classList.toggle('hidden', !settings.cheatMode);
        
        // Update progression settings UI
        var xpDirectSlider = document.getElementById('xpDirectSlider');
        var xpSchoolSlider = document.getElementById('xpSchoolSlider');
        var xpAnySlider = document.getElementById('xpAnySlider');

        // Helper to update slider fill visual
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
        
        // === LLM Settings ===
        if (data.llm) {
            state.llmConfig.apiKey = data.llm.apiKey || '';
            state.llmConfig.model = data.llm.model || 'anthropic/claude-sonnet-4';
            state.llmConfig.customModel = data.llm.customModel || '';
            state.llmConfig.maxTokens = data.llm.maxTokens || 4096;
            
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
            
            // Set model dropdown - try to match, but if custom model is set, it takes priority
            if (modelSelect) {
                // If custom model looks like a known dropdown value, select it
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
        
        // === LLM Auto-Config Checkbox (Build Tree) ===
        if (data.llmAutoConfigEnabled !== undefined) {
            var llmAutoConfigCheckbox = document.getElementById('visualFirstLLMCheck');
            if (llmAutoConfigCheckbox) {
                llmAutoConfigCheckbox.checked = data.llmAutoConfigEnabled;
                console.log('[SpellLearning] LLM auto-config checkbox loaded:', data.llmAutoConfigEnabled);
            }
        }
        
        // === Field Settings ===
        if (data.fields) {
            state.fields = data.fields;
            
            // Update field checkboxes
            for (var fieldName in data.fields) {
                var checkbox = document.getElementById('field_' + fieldName);
                if (checkbox) {
                    checkbox.checked = data.fields[fieldName];
                }
            }
        }
        
        // === Scan Mode ===
        if (data.scanModeTomes !== undefined) {
            var scanModeCheckbox = document.getElementById('scanModeTomes');
            if (scanModeCheckbox) {
                scanModeCheckbox.checked = data.scanModeTomes;
            }
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
        if (data.spellBlacklist && Array.isArray(data.spellBlacklist)) {
            settings.spellBlacklist = data.spellBlacklist;
            console.log('[SpellLearning] Loaded spell blacklist:', settings.spellBlacklist.length, 'entries');
        } else {
            settings.spellBlacklist = [];
        }

        // Plugin whitelist
        if (data.pluginWhitelist && Array.isArray(data.pluginWhitelist)) {
            settings.pluginWhitelist = data.pluginWhitelist;
            console.log('[SpellLearning] Loaded plugin whitelist:', settings.pluginWhitelist.length, 'entries');
        } else {
            settings.pluginWhitelist = [];
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

            // Theme Discovery
            stg.themeDiscoveryMode = tg.themeDiscoveryMode || 'dynamic';
            stg.minThemeSize = tg.minThemeSize !== undefined ? tg.minThemeSize : 3;
            stg.maxThemes = tg.maxThemes !== undefined ? tg.maxThemes : 15;
            stg.maxThemeSize = tg.maxThemeSize !== undefined ? tg.maxThemeSize : 80;

            // Smart Routing
            stg.enableSmartRouting = tg.enableSmartRouting !== false;
            stg.llmBranchRouting = tg.llmBranchRouting || false;
            stg.autoBranchFallback = tg.autoBranchFallback !== false;

            // Root Configuration
            stg.rootCount = tg.rootCount !== undefined ? tg.rootCount : 1;

            // Element/Theme Isolation
            stg.elementIsolation = tg.elementIsolation !== false;
            stg.elementIsolationStrict = tg.elementIsolationStrict || false;
            stg.elementWeight = tg.elementWeight !== undefined ? tg.elementWeight : 100;

            // Tier Rules
            stg.strictTierOrdering = tg.strictTierOrdering !== false;
            stg.allowSameTierLinks = tg.allowSameTierLinks !== false;
            stg.maxTierSkip = tg.maxTierSkip !== undefined ? tg.maxTierSkip : 2;
            stg.tierMixing = tg.tierMixing || false;
            stg.tierMixingAmount = tg.tierMixingAmount !== undefined ? tg.tierMixingAmount : 20;

            // Link Strategy
            stg.linkStrategy = tg.linkStrategy || 'thematic';

            // Scoring Factors
            if (tg.scoring && typeof tg.scoring === 'object') {
                for (var scoreKey in tg.scoring) {
                    stg.scoring[scoreKey] = tg.scoring[scoreKey];
                }
            }

            // Convergence
            stg.convergenceEnabled = tg.convergenceEnabled !== false;
            stg.convergenceChance = tg.convergenceChance !== undefined ? tg.convergenceChance : 40;
            stg.convergenceMinTier = tg.convergenceMinTier !== undefined ? tg.convergenceMinTier : 3;

            // Parent Limits
            stg.maxChildrenPerNode = tg.maxChildrenPerNode !== undefined ? tg.maxChildrenPerNode : 3;

            // Shape Settings
            stg.shapeStyle = tg.shapeStyle || 'organic';

            // Advanced Options
            stg.allowSpellRepetition = tg.allowSpellRepetition || false;
            stg.maxRepetitions = tg.maxRepetitions !== undefined ? tg.maxRepetitions : 2;
            stg.repetitionMinTierGap = tg.repetitionMinTierGap !== undefined ? tg.repetitionMinTierGap : 2;

            // Mod Handling
            stg.prioritizeVanilla = tg.prioritizeVanilla !== false;
            stg.modBranchMode = tg.modBranchMode || 'mixed';

            // Validation
            stg.linkValidationPasses = tg.linkValidationPasses !== undefined ? tg.linkValidationPasses : 3;
            stg.warnOnDistanceViolation = tg.warnOnDistanceViolation !== false;
            stg.warnOnElementMismatch = tg.warnOnElementMismatch !== false;

            // Bidirectional soft prereqs
            stg.bidirectionalSoftPrereqs = tg.bidirectionalSoftPrereqs !== undefined ? tg.bidirectionalSoftPrereqs : true;

            // LLM Edge Case
            stg.llmEdgeCaseEnabled = tg.llmEdgeCaseEnabled || false;
            stg.llmEdgeCaseThreshold = tg.llmEdgeCaseThreshold !== undefined ? tg.llmEdgeCaseThreshold : 10;

            console.log('[SpellLearning] Loaded treeGeneration settings');

            // Update the UI if the function exists
            if (typeof updateTreeSettingsUI === 'function') {
                updateTreeSettingsUI();
            }
        }

        // Apply heart settings to renderer
        applyHeartSettingsToRenderer();
        applyGlobeSettings();
        
        console.log('[SpellLearning] Unified config loaded:', {
            settings: settings,
            llmModel: state.llmConfig.model,
            hasApiKey: !!state.llmConfig.apiKey,
            fields: state.fields
        });
        
        // NOW load presets from individual files.
        // This runs AFTER active preset names are set and legacy migration is done,
        // ensuring correct ordering: config loaded → migrate legacy → load files → apply.
        // Guard: only load presets once (LoadUnifiedConfig may be called from both
        // initializeSettings and onPrismaReady, causing onUnifiedConfigLoaded to fire twice).
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

// Legacy callback for backwards compatibility
window.onSettingsLoaded = window.onUnifiedConfigLoaded;

// Export updateDeveloperModeVisibility for use by other modules (e.g., when school controls are created)
window.updateDeveloperModeVisibility = updateDeveloperModeVisibility;
window.onLLMConfigLoaded = function(dataStr) {
    // This is now handled by onUnifiedConfigLoaded
    // But keep for backwards compatibility with any existing code
    try {
        var data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
        if (data && data.apiKey) {
            state.llmConfig.apiKey = data.apiKey;
            state.llmConfig.model = data.model || state.llmConfig.model;
            state.llmConfig.maxTokens = data.maxTokens || state.llmConfig.maxTokens;
        }
    } catch (e) { }
};
