/**
 * Panel Initialization
 * Initial panel UI setup, button wiring, and textarea enter key handling.
 *
 * Depends on: state.js (state, settings), uiHelpers.js (updateCharCount),
 *             buttonHandlers.js (onScanClick, onFullAutoClick, etc.)
 */

// Fix Enter key in textareas - allow new lines
function initializeTextareaEnterKey() {
    var textareas = document.querySelectorAll('textarea');
    textareas.forEach(function(textarea) {
        textarea.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
                // Allow default behavior (insert newline)
                e.stopPropagation();
                // Don't prevent default - we want the newline
            }
        });

        // Also handle keypress for better compatibility
        textarea.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.stopPropagation();
            }
        });
    });
    console.log('[SpellLearning] Textarea Enter key handling initialized for', textareas.length, 'textareas');
}

function initializePanel() {
    // Helper to safely add event listener (null-safe for removed elements)
    function safeAddListener(id, event, handler) {
        var el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    }

    // Button event listeners (some may be removed during UI revamp)
    safeAddListener('scanBtn', 'click', onScanClick);
    safeAddListener('blacklistBtn', 'click', showBlacklistModal);
    safeAddListener('whitelistBtn', 'click', showWhitelistModal);
    safeAddListener('fullAutoBtn', 'click', onFullAutoClick);
    safeAddListener('proceduralPlusBtn', 'click', onProceduralPlusClick);
    safeAddListener('saveBtn', 'click', onSaveClick);

    // Tome toggle - client-side filter, triggers tome scan for IDs
    var tomeToggle = document.getElementById('scanModeTomes');
    if (tomeToggle) {
        tomeToggle.addEventListener('change', function() {
            if (this.checked) {
                // Tomes ON: request tome scan to get tomed spell IDs
                if (window.callCpp && state.lastSpellData) {
                    window.callCpp('ScanSpells', JSON.stringify({ scanMode: 'tomes', fields: { plugin: true } }));
                }
            } else {
                // Tomes OFF: clear tome filter, update primed with all spells
                state.tomedSpellIds = null;
                if (typeof updatePrimedCount === 'function') updatePrimedCount();
            }
        });
    }
    safeAddListener('saveBySchoolBtn', 'click', onSaveBySchoolClick);
    safeAddListener('copyBtn', 'click', onCopyClick);
    safeAddListener('pasteBtn', 'click', onPasteClick);
    safeAddListener('fullscreenBtn', 'click', toggleFullscreen);
    safeAddListener('minimizeBtn', 'click', toggleMinimize);
    safeAddListener('closeBtn', 'click', onCloseClick);
    safeAddListener('settingsBtn', 'click', toggleSettings);

    // Keyboard shortcuts - Escape and Tab close the panel
    initializeKeyboardShortcuts();

    // Growth Style Generator
    initializeGrowthStyleGenerator();

    // Tree import buttons in Spell Scan tab
    var importTreeScanBtn = document.getElementById('import-tree-scan-btn');
    var loadSavedScanBtn = document.getElementById('load-saved-scan-btn');
    if (importTreeScanBtn) {
        importTreeScanBtn.addEventListener('click', function() {
            showImportModal();
        });
    }
    if (loadSavedScanBtn) {
        loadSavedScanBtn.addEventListener('click', function() {
            loadSavedTree();
            // Switch to tree tab after loading
            switchTab('spellTree');
        });
    }

    // API Settings handlers
    safeAddListener('saveApiKeyBtn', 'click', onSaveApiSettings);
    safeAddListener('toggleApiKeyBtn', 'click', toggleApiKeyVisibility);
    safeAddListener('pasteApiKeyBtn', 'click', onPasteApiKey);
    safeAddListener('modelSelect', 'change', onModelChange);

    // Custom model handlers
    safeAddListener('pasteModelBtn', 'click', onPasteCustomModel);
    safeAddListener('clearModelBtn', 'click', onClearCustomModel);
    safeAddListener('customModelInput', 'input', onCustomModelInput);

    // Max tokens handler
    var maxTokensInput = document.getElementById('maxTokensInput');
    if (maxTokensInput) {
        maxTokensInput.value = state.llmConfig.maxTokens || 4096;
        maxTokensInput.addEventListener('change', function() {
            var val = parseInt(this.value) || 4096;
            val = Math.max(1000, Math.min(32000, val));
            this.value = val;
            state.llmConfig.maxTokens = val;
            console.log('[SpellLearning] Max tokens set to:', val);
            onSaveApiSettings();
        });
    }

    // Load API settings on init
    loadApiSettings();

    // Preset buttons
    safeAddListener('presetMinimal', 'click', function() { applyPreset('minimal'); });
    safeAddListener('presetBalanced', 'click', function() { applyPreset('balanced'); });
    safeAddListener('presetFull', 'click', function() { applyPreset('full'); });

    // Field checkbox listeners
    var fieldIds = ['editorId', 'magickaCost', 'minimumSkill', 'castingType', 'delivery',
                    'chargeTime', 'plugin', 'effects', 'effectNames', 'keywords'];
    fieldIds.forEach(function(fieldId) {
        var checkbox = document.getElementById('field_' + fieldId);
        if (checkbox) {
            checkbox.checked = state.fields[fieldId];
            checkbox.addEventListener('change', function(e) {
                state.fields[fieldId] = e.target.checked;
                if (fieldId === 'effects' && e.target.checked) {
                    state.fields.effectNames = false;
                    var effectNamesEl = document.getElementById('field_effectNames');
                    if (effectNamesEl) effectNamesEl.checked = false;
                }
                if (fieldId === 'effectNames' && e.target.checked) {
                    state.fields.effects = false;
                    var effectsEl = document.getElementById('field_effects');
                    if (effectsEl) effectsEl.checked = false;
                }
            });
        }
    });

    var outputArea = document.getElementById('outputArea');
    if (outputArea) {
        outputArea.addEventListener('input', updateCharCount);
    }
    updateCharCount();
}
