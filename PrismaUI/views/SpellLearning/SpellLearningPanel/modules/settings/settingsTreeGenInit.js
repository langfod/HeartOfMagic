/**
 * Dynamic Tree Building Settings Initialization
 * UI initialization for tree generation settings, LLM features, and action buttons.
 *
 * Depends on: state.js (settings), settings/settingsTreeGen.js (presets, markTreeSettingsModified),
 *             settingsPanel.js (autoSaveSettings), uiHelpers.js (updateSliderFillGlobal, updateStatus)
 */

// =============================================================================
// TREE BUILDING SETTINGS INITIALIZATION
// =============================================================================

/**
 * Initialize Dynamic Tree Building settings UI
 */
function initializeDynamicTreeBuildingSettings() {
    // Guard against double init — prevents duplicate event handlers
    if (window._dynamicTreeSettingsInitialized) {
        console.log('[TreeSettings] Already initialized, skipping');
        return;
    }
    window._dynamicTreeSettingsInitialized = true;

    console.log('[TreeSettings] Initializing dynamic tree building settings...');

    // Set up collapsible header toggle
    var dynamicTreeHeader = document.getElementById('dynamicTreeHeader');
    var dynamicTreeContent = document.getElementById('dynamicTreeContent');

    if (dynamicTreeHeader && dynamicTreeContent) {
        dynamicTreeHeader.addEventListener('click', function() {
            var isCollapsed = dynamicTreeContent.style.display === 'none';
            dynamicTreeContent.style.display = isCollapsed ? '' : 'none';
            var toggle = dynamicTreeHeader.querySelector('.section-toggle');
            if (toggle) {
                toggle.textContent = isCollapsed ? '▼' : '▶';
            }
        });
        console.log('[TreeSettings] Collapsible header initialized');
    }

    var tg = settings.treeGeneration;
    if (!tg) {
        console.warn('[TreeSettings] settings.treeGeneration not found');
        return;
    }

    // =========================================================================
    // PRESET SELECTION
    // =========================================================================
    var treePresetSelect = document.getElementById('treePresetSelect');
    var treePresetDescription = document.getElementById('treePresetDescription');

    if (treePresetSelect) {
        // Detect current preset
        var currentPreset = detectCurrentTreePreset();
        treePresetSelect.value = currentPreset;

        // Update description
        if (treePresetDescription) {
            var preset = TREE_GENERATION_PRESETS[currentPreset];
            treePresetDescription.textContent = preset ? preset.description : 'Custom settings';
        }

        treePresetSelect.addEventListener('change', function() {
            var presetName = this.value;
            if (presetName === 'custom') {
                // Don't change settings, just allow user to tweak
                if (treePresetDescription) treePresetDescription.textContent = 'Custom settings';
            } else {
                applyTreeGenerationPreset(presetName);
                var preset = TREE_GENERATION_PRESETS[presetName];
                if (treePresetDescription) treePresetDescription.textContent = preset.description;
            }
            autoSaveSettings();
        });
    }

    // =========================================================================
    // THEME DISCOVERY
    // =========================================================================
    var themeDiscoveryModeSelect = document.getElementById('themeDiscoveryModeSelect');
    if (themeDiscoveryModeSelect) {
        themeDiscoveryModeSelect.value = tg.themeDiscoveryMode;
        themeDiscoveryModeSelect.addEventListener('change', function() {
            tg.themeDiscoveryMode = this.value;
            markTreeSettingsModified();
            autoSaveSettings();
        });
    }

    var enableSmartRoutingToggle = document.getElementById('enableSmartRoutingToggle');
    if (enableSmartRoutingToggle) {
        enableSmartRoutingToggle.checked = tg.enableSmartRouting;
        enableSmartRoutingToggle.addEventListener('change', function() {
            tg.enableSmartRouting = this.checked;
            markTreeSettingsModified();
            autoSaveSettings();
        });
    }

    var autoBranchFallbackToggle = document.getElementById('autoBranchFallbackToggle');
    if (autoBranchFallbackToggle) {
        autoBranchFallbackToggle.checked = tg.autoBranchFallback;
        autoBranchFallbackToggle.addEventListener('change', function() {
            tg.autoBranchFallback = this.checked;
            markTreeSettingsModified();
            autoSaveSettings();
        });
    }

    // =========================================================================
    // ELEMENT RULES
    // =========================================================================
    var elementIsolationToggle = document.getElementById('elementIsolationToggle');
    var elementIsolationStrictRow = document.getElementById('elementIsolationStrictRow');

    if (elementIsolationToggle) {
        elementIsolationToggle.checked = tg.elementIsolation;
        // Show/hide strict option
        if (elementIsolationStrictRow) {
            elementIsolationStrictRow.style.display = tg.elementIsolation ? '' : 'none';
        }
        elementIsolationToggle.addEventListener('change', function() {
            tg.elementIsolation = this.checked;
            if (elementIsolationStrictRow) {
                elementIsolationStrictRow.style.display = this.checked ? '' : 'none';
            }
            // If disabled, also disable strict
            if (!this.checked) {
                tg.elementIsolationStrict = false;
                var strictToggle = document.getElementById('elementIsolationStrictToggle');
                if (strictToggle) strictToggle.checked = false;
            }
            markTreeSettingsModified();
            autoSaveSettings();
        });
    }

    var elementIsolationStrictToggle = document.getElementById('elementIsolationStrictToggle');
    if (elementIsolationStrictToggle) {
        elementIsolationStrictToggle.checked = tg.elementIsolationStrict;
        elementIsolationStrictToggle.addEventListener('change', function() {
            tg.elementIsolationStrict = this.checked;
            markTreeSettingsModified();
            autoSaveSettings();
        });
    }

    // Root Count selector
    var rootCountSelect = document.getElementById('rootCountSelect');
    var rootCountRow = document.getElementById('rootCountRow');
    if (rootCountSelect) {
        rootCountSelect.value = tg.rootCount || 1;
        rootCountSelect.addEventListener('change', function() {
            tg.rootCount = parseInt(this.value, 10);
            console.log('[TreeSettings] rootCount changed to:', tg.rootCount);
            markTreeSettingsModified();
            autoSaveSettings();
        });
    }
    // Show rootCount only when element isolation is on
    if (rootCountRow && elementIsolationToggle) {
        rootCountRow.style.display = tg.elementIsolation ? '' : 'none';
        elementIsolationToggle.addEventListener('change', function() {
            rootCountRow.style.display = this.checked ? '' : 'none';
        });
    }

    // =========================================================================
    // TIER RULES
    // =========================================================================
    var strictTierOrderingToggle = document.getElementById('strictTierOrderingToggle');
    if (strictTierOrderingToggle) {
        strictTierOrderingToggle.checked = tg.strictTierOrdering;
        strictTierOrderingToggle.addEventListener('change', function() {
            tg.strictTierOrdering = this.checked;
            markTreeSettingsModified();
            autoSaveSettings();
        });
    }

    var allowSameTierLinksToggle = document.getElementById('allowSameTierLinksToggle');
    if (allowSameTierLinksToggle) {
        allowSameTierLinksToggle.checked = tg.allowSameTierLinks;
        allowSameTierLinksToggle.addEventListener('change', function() {
            tg.allowSameTierLinks = this.checked;
            markTreeSettingsModified();
            autoSaveSettings();
        });
    }

    var tierMixingToggle = document.getElementById('tierMixingToggle');
    var tierMixingAmountRow = document.getElementById('tierMixingAmountRow');

    if (tierMixingToggle) {
        tierMixingToggle.checked = tg.tierMixing;
        if (tierMixingAmountRow) {
            tierMixingAmountRow.style.display = tg.tierMixing ? '' : 'none';
        }
        tierMixingToggle.addEventListener('change', function() {
            tg.tierMixing = this.checked;
            if (tierMixingAmountRow) {
                tierMixingAmountRow.style.display = this.checked ? '' : 'none';
            }
            markTreeSettingsModified();
            autoSaveSettings();
        });
    }

    var tierMixingAmountSlider = document.getElementById('tierMixingAmountSlider');
    var tierMixingAmountValue = document.getElementById('tierMixingAmountValue');
    if (tierMixingAmountSlider) {
        tierMixingAmountSlider.value = tg.tierMixingAmount;
        if (tierMixingAmountValue) tierMixingAmountValue.textContent = tg.tierMixingAmount + '%';
        updateSliderFillGlobal(tierMixingAmountSlider);

        tierMixingAmountSlider.addEventListener('input', function() {
            tg.tierMixingAmount = parseInt(this.value);
            if (tierMixingAmountValue) tierMixingAmountValue.textContent = this.value + '%';
            updateSliderFillGlobal(this);
        });
        tierMixingAmountSlider.addEventListener('change', function() {
            markTreeSettingsModified();
            autoSaveSettings();
        });
    }

    // =========================================================================
    // LINK STRATEGY
    // =========================================================================
    var linkStrategySelect = document.getElementById('linkStrategySelect');
    if (linkStrategySelect) {
        linkStrategySelect.value = tg.linkStrategy;
        linkStrategySelect.addEventListener('change', function() {
            tg.linkStrategy = this.value;
            markTreeSettingsModified();
            autoSaveSettings();
        });
    }

    var maxChildrenSlider = document.getElementById('maxChildrenSlider');
    var maxChildrenValue = document.getElementById('maxChildrenValue');
    if (maxChildrenSlider) {
        maxChildrenSlider.value = tg.maxChildrenPerNode;
        if (maxChildrenValue) maxChildrenValue.textContent = tg.maxChildrenPerNode;
        updateSliderFillGlobal(maxChildrenSlider);

        maxChildrenSlider.addEventListener('input', function() {
            tg.maxChildrenPerNode = parseInt(this.value);
            if (maxChildrenValue) maxChildrenValue.textContent = this.value;
            updateSliderFillGlobal(this);
        });
        maxChildrenSlider.addEventListener('change', function() {
            markTreeSettingsModified();
            autoSaveSettings();
        });
    }

    // =========================================================================
    // CONVERGENCE (Multi-Prerequisites)
    // =========================================================================
    var convergenceEnabledToggle = document.getElementById('convergenceEnabledToggle');
    var convergenceSettings = document.getElementById('convergenceSettings');

    if (convergenceEnabledToggle) {
        convergenceEnabledToggle.checked = tg.convergenceEnabled;
        if (convergenceSettings) {
            convergenceSettings.style.display = tg.convergenceEnabled ? '' : 'none';
        }
        convergenceEnabledToggle.addEventListener('change', function() {
            tg.convergenceEnabled = this.checked;
            if (convergenceSettings) {
                convergenceSettings.style.display = this.checked ? '' : 'none';
            }
            markTreeSettingsModified();
            autoSaveSettings();
        });
    }

    var convergenceChanceSlider = document.getElementById('convergenceChanceSlider');
    var convergenceChanceValue = document.getElementById('convergenceChanceValue');
    if (convergenceChanceSlider) {
        convergenceChanceSlider.value = tg.convergenceChance;
        if (convergenceChanceValue) convergenceChanceValue.textContent = tg.convergenceChance + '%';
        updateSliderFillGlobal(convergenceChanceSlider);

        convergenceChanceSlider.addEventListener('input', function() {
            tg.convergenceChance = parseInt(this.value);
            if (convergenceChanceValue) convergenceChanceValue.textContent = this.value + '%';
            updateSliderFillGlobal(this);
        });
        convergenceChanceSlider.addEventListener('change', function() {
            markTreeSettingsModified();
            autoSaveSettings();
        });
    }

    var convergenceMinTierSelect = document.getElementById('convergenceMinTierSelect');
    if (convergenceMinTierSelect) {
        convergenceMinTierSelect.value = tg.convergenceMinTier;
        convergenceMinTierSelect.addEventListener('change', function() {
            tg.convergenceMinTier = parseInt(this.value);
            markTreeSettingsModified();
            autoSaveSettings();
        });
    }

    // =========================================================================
    // SCORING FACTORS (Collapsible section)
    // =========================================================================
    var scoringFactorsHeader = document.getElementById('scoringFactorsHeader');
    var scoringFactorsContent = document.getElementById('scoringFactorsContent');
    var scoringCollapseIcon = scoringFactorsHeader ? scoringFactorsHeader.querySelector('.collapse-icon') : null;

    console.log('[TreeSettings] Scoring factors - header:', !!scoringFactorsHeader, 'content:', !!scoringFactorsContent);

    if (scoringFactorsHeader && scoringFactorsContent) {
        // Use both class AND style for maximum compatibility
        scoringFactorsHeader.addEventListener('click', function(e) {
            e.stopPropagation();  // Prevent bubbling
            console.log('[TreeSettings] Scoring factors header clicked');
            var isHidden = scoringFactorsContent.style.display === 'none' ||
                          scoringFactorsContent.classList.contains('hidden');
            if (isHidden) {
                scoringFactorsContent.classList.remove('hidden');
                scoringFactorsContent.style.display = '';
                if (scoringCollapseIcon) scoringCollapseIcon.textContent = '[-]';
                console.log('[TreeSettings] Scoring factors expanded');
            } else {
                scoringFactorsContent.classList.add('hidden');
                scoringFactorsContent.style.display = 'none';
                if (scoringCollapseIcon) scoringCollapseIcon.textContent = '[+]';
                console.log('[TreeSettings] Scoring factors collapsed');
            }
        });
        console.log('[TreeSettings] Scoring factors click handler registered');
    } else {
        console.warn('[TreeSettings] Scoring factors elements not found!');
    }

    // Initialize scoring checkboxes
    var scoring = tg.scoring || {};
    var scoringIds = {
        'scoringElementMatching': 'elementMatching',
        'scoringSpellTypeMatching': 'spellTypeMatching',
        'scoringTierProgression': 'tierProgression',
        'scoringKeywordMatching': 'keywordMatching',
        'scoringThemeCoherence': 'themeCoherence',
        'scoringEffectNameMatching': 'effectNameMatching',
        'scoringDescriptionSimilarity': 'descriptionSimilarity',
        'scoringMagickaCost': 'magickaCostProximity',
        'scoringSameModSource': 'sameModSource'
    };

    Object.keys(scoringIds).forEach(function(elementId) {
        var checkbox = document.getElementById(elementId);
        var settingKey = scoringIds[elementId];
        if (checkbox) {
            checkbox.checked = scoring[settingKey] !== false;
            checkbox.addEventListener('change', function() {
                if (!tg.scoring) tg.scoring = {};
                tg.scoring[settingKey] = this.checked;
                markTreeSettingsModified();
                autoSaveSettings();
            });
        }
    });

    // =========================================================================
    // LLM FEATURES (Collapsible section)
    // =========================================================================
    initializeLLMFeaturesSection(tg);

    // =========================================================================
    // ACTION BUTTONS
    // =========================================================================
    var resetTreeSettingsBtn = document.getElementById('resetTreeSettingsBtn');
    if (resetTreeSettingsBtn) {
        resetTreeSettingsBtn.addEventListener('click', function() {
            // Reset to current preset (or thematic if custom)
            var presetSelect = document.getElementById('treePresetSelect');
            var currentPreset = presetSelect ? presetSelect.value : 'thematic';
            if (currentPreset === 'custom') currentPreset = 'thematic';

            applyTreeGenerationPreset(currentPreset);
            if (presetSelect) presetSelect.value = currentPreset;

            var descEl = document.getElementById('treePresetDescription');
            var preset = TREE_GENERATION_PRESETS[currentPreset];
            if (descEl && preset) descEl.textContent = preset.description;

            autoSaveSettings();
            updateStatus('Tree settings reset to ' + currentPreset + ' preset');
        });
    }

    var applyTreeSettingsBtn = document.getElementById('applyTreeSettingsBtn');
    if (applyTreeSettingsBtn) {
        applyTreeSettingsBtn.addEventListener('click', function() {
            // Save settings
            autoSaveSettings();

            // Trigger tree regeneration if tree exists
            if (state.treeData && typeof startVisualFirstGenerate === 'function') {
                updateStatus('Regenerating tree with new settings...');
                startVisualFirstGenerate();
            } else {
                updateStatus('Tree settings applied. Generate a tree to see changes.');
            }
        });
    }

    console.log('[TreeSettings] Initialization complete');
}

// =============================================================================
// LLM FEATURES
// =============================================================================

/**
 * Initialize LLM Features collapsible section
 */
function initializeLLMFeaturesSection(tg) {
    // Ensure llm settings object exists
    if (!tg.llm) {
        tg.llm = {
            enabled: false,
            themeDiscovery: false,
            elementDetection: false,
            edgeCases: false,
            edgeCaseThreshold: 10,
            branchAssignment: false,
            parentSuggestion: false,
            treeValidation: false,
            keywordExpansion: false
        };
    }
    var llm = tg.llm;

    // Collapsible header
    var llmFeaturesHeader = document.getElementById('llmFeaturesHeader');
    var llmFeaturesContent = document.getElementById('llmFeaturesContent');
    var llmCollapseIcon = llmFeaturesHeader ? llmFeaturesHeader.querySelector('.collapse-icon') : null;

    if (llmFeaturesHeader && llmFeaturesContent) {
        llmFeaturesHeader.addEventListener('click', function() {
            var isHidden = llmFeaturesContent.classList.contains('hidden');
            if (isHidden) {
                llmFeaturesContent.classList.remove('hidden');
                if (llmCollapseIcon) llmCollapseIcon.textContent = '[-]';
            } else {
                llmFeaturesContent.classList.add('hidden');
                if (llmCollapseIcon) llmCollapseIcon.textContent = '[+]';
            }
        });
    }

    // Master toggle
    var llmMasterToggle = document.getElementById('llmMasterToggle');
    var llmFeatureToggles = document.getElementById('llmFeatureToggles');
    var llmStatusIndicator = document.getElementById('llmStatusIndicator');

    function updateLLMUIState() {
        var enabled = llmMasterToggle && llmMasterToggle.checked;
        if (llmFeatureToggles) {
            llmFeatureToggles.style.opacity = enabled ? '1' : '0.5';
            llmFeatureToggles.style.pointerEvents = enabled ? 'auto' : 'none';
        }
        if (llmStatusIndicator) {
            llmStatusIndicator.textContent = enabled ? '(Enabled)' : '(Disabled)';
            llmStatusIndicator.style.color = enabled ? 'var(--accent-green)' : 'var(--text-muted)';
        }
    }

    if (llmMasterToggle) {
        llmMasterToggle.checked = llm.enabled === true;
        llmMasterToggle.addEventListener('change', function() {
            llm.enabled = this.checked;
            updateLLMUIState();
            markTreeSettingsModified();
            autoSaveSettings();
        });
        updateLLMUIState();
    }

    // Individual feature toggles
    var llmToggles = {
        'llmThemeDiscoveryToggle': 'themeDiscovery',
        'llmElementDetectionToggle': 'elementDetection',
        'llmEdgeCasesToggle': 'edgeCases',
        'llmBranchAssignmentToggle': 'branchAssignment',
        'llmParentSuggestionToggle': 'parentSuggestion',
        'llmTreeValidationToggle': 'treeValidation',
        'llmKeywordExpansionToggle': 'keywordExpansion',
        'llmKeywordClassificationToggle': 'keywordClassification'
    };

    Object.keys(llmToggles).forEach(function(elementId) {
        var toggle = document.getElementById(elementId);
        var settingKey = llmToggles[elementId];
        if (toggle) {
            toggle.checked = llm[settingKey] === true;
            toggle.addEventListener('change', function() {
                llm[settingKey] = this.checked;
                markTreeSettingsModified();
                autoSaveSettings();

                // Show/hide edge case threshold when edge cases enabled
                if (settingKey === 'edgeCases') {
                    var thresholdRow = document.getElementById('llmEdgeCaseThresholdRow');
                    if (thresholdRow) {
                        thresholdRow.style.display = this.checked ? 'flex' : 'none';
                    }
                }
            });

            // Initialize edge case threshold row visibility
            if (settingKey === 'edgeCases') {
                var thresholdRow = document.getElementById('llmEdgeCaseThresholdRow');
                if (thresholdRow) {
                    thresholdRow.style.display = llm.edgeCases ? 'flex' : 'none';
                }
            }
        }
    });

    // Edge case threshold slider
    var thresholdSlider = document.getElementById('llmEdgeCaseThresholdSlider');
    var thresholdValue = document.getElementById('llmEdgeCaseThresholdValue');
    if (thresholdSlider) {
        thresholdSlider.value = llm.edgeCaseThreshold || 10;
        if (thresholdValue) thresholdValue.textContent = thresholdSlider.value;

        thresholdSlider.addEventListener('input', function() {
            if (thresholdValue) thresholdValue.textContent = this.value;
            llm.edgeCaseThreshold = parseInt(this.value, 10);
            markTreeSettingsModified();
            autoSaveSettings();
        });
    }

    console.log('[LLMFeatures] Section initialized');
}
