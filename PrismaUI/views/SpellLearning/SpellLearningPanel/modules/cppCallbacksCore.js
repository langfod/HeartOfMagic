/**
 * C++ Callbacks - Core Module
 * Core C++ SKSE callbacks: builder status, spell data, status updates,
 * prompt handling, clipboard, and tree data loading.
 *
 * Also contains shared duplicate-node helpers used by all cppCallbacks files.
 *
 * Depends on:
 * - modules/state.js (state, settings)
 * - modules/treeParser.js (TreeParser)
 * - modules/wheelRenderer.js (WheelRenderer)
 * - modules/spellCache.js (SpellCache)
 *
 * Exports (global):
 * - window.onBuilderStatus
 * - window.updateSpellData
 * - window.updateStatus
 * - window.updateTreeStatus
 * - window.updatePrompt
 * - window.onPromptSaved
 * - window.onClipboardContent
 * - window.onCopyComplete
 * - window.updateTreeData
 * - getCanonicalFormId() (free function)
 * - findDuplicateSiblings() (free function)
 * - syncDuplicateState() (free function)
 */

// =============================================================================
// DUPLICATE NODE SHARED STATE HELPERS
// =============================================================================

/**
 * Get the canonical (original) formId for a node.
 * Duplicate nodes spawned in edit mode have originalFormId set,
 * or have _dup_ in their formId. Returns the original spell's formId
 * so all copies share the same progress/state key.
 */
function getCanonicalFormId(node) {
    if (node.originalFormId) return node.originalFormId;
    var id = node.formId || node.id;
    var dupIdx = id.indexOf('_dup_');
    if (dupIdx !== -1) return id.substring(0, dupIdx);
    return id;
}

/**
 * Find all sibling nodes that share the same original spell.
 * Returns an array of nodes (excluding the source node itself).
 */
function findDuplicateSiblings(sourceNode) {
    if (!state.treeData || !state.treeData.nodes) return [];
    var canonicalId = getCanonicalFormId(sourceNode);
    return state.treeData.nodes.filter(function(n) {
        if (n === sourceNode) return false;
        return getCanonicalFormId(n) === canonicalId;
    });
}

/**
 * Sync state from one node to all its duplicate siblings.
 * Call this after any state change on a node.
 */
function syncDuplicateState(sourceNode) {
    var siblings = findDuplicateSiblings(sourceNode);
    if (siblings.length === 0) return;

    siblings.forEach(function(sibling) {
        if (sibling.state !== sourceNode.state) {
            console.log('[SharedState] Syncing ' + (sibling.name || sibling.formId) +
                        ': ' + sibling.state + ' -> ' + sourceNode.state);
            sibling.state = sourceNode.state;
        }
    });

    if (typeof CanvasRenderer !== 'undefined') {
        CanvasRenderer._needsRender = true;
    }
}

// =============================================================================
// C++ CALLBACKS
// =============================================================================

/**
 * Called by C++ when panel opens to report builder availability.
 * Native C++ builder is always available -- enables Build button.
 */
window.onBuilderStatus = function(statusStr) {
    // Native C++ builder -- always ready
    console.log('[SpellLearning] Builder status: native C++');
    if (typeof TreeGrowth !== 'undefined') {
        TreeGrowth.updateBuilderReady();
    }
};

window.updateSpellData = function(jsonStr) {
    console.log('[SpellLearning] Received spell data, length:' + jsonStr.length);

    // Check if this is a tome-only scan response (used for filtering, not main data)
    try {
        var parsed = JSON.parse(jsonStr);
        if (parsed.scanMode === 'spell_tomes') {
            console.log('[SpellLearning] Tome scan received: ' + (parsed.spells ? parsed.spells.length : 0) + ' tomed spells');
            state.tomedSpellIds = {};
            if (parsed.spells) {
                parsed.spells.forEach(function(s) {
                    if (s.formId) state.tomedSpellIds[s.formId] = true;
                });
            }
            if (typeof updatePrimedCount === 'function') updatePrimedCount();
            // Restore scan status after background tome scan (C++ overwrites with "Scanning spell tomes...")
            if (state.lastSpellData && state.lastSpellData.spellCount) {
                var schoolSet = {};
                if (state.lastSpellData.spells) state.lastSpellData.spells.forEach(function(s) { if (s.school) schoolSet[s.school] = true; });
                if (typeof updateScanStatus === 'function') {
                    updateScanStatus(t('status.scannedSpellsSchools', {count: state.lastSpellData.spellCount, schools: Object.keys(schoolSet).length}), 'success');
                }
            }
            return;
        }
    } catch (e) {
        console.error('[SpellLearning] Failed to parse JSON for tome scan check:', e);
        /* continue to normal processing */ }

    var scanSuccess = false;
    try {
        var data = JSON.parse(jsonStr);
        state.lastSpellData = data;

        var formatted = JSON.stringify(data, null, 2);
        var outputArea = document.getElementById('outputArea');
        if (outputArea) outputArea.value = formatted;

        if (state.fullAutoMode) {
            updateStatus(t('status.step2Generating', {count: data.spellCount}));
            updateScanStatus(t('status.step2Generating', {count: data.spellCount}), 'working');
        } else {
            var schoolSet = {};
            if (data.spells) data.spells.forEach(function(s) { if (s.school) schoolSet[s.school] = true; });
            var schoolCount = Object.keys(schoolSet).length;
            updateStatus(t('status.scannedSpells', {count: data.spellCount}));
            updateScanStatus(t('status.scannedSpellsSchools', {count: data.spellCount, schools: schoolCount}), 'success');
        }
        setStatusIcon('X');
        updateCharCount();
        scanSuccess = true;

        // Populate scan stats panel early — before downstream code that might throw
        if (data.spells && data.spells.length > 0) {
            var totalEl = document.getElementById('statTotalSpells');
            if (totalEl) totalEl.textContent = data.spells.length;

            var modSet = {};
            data.spells.forEach(function(s) { if (s.plugin) modSet[s.plugin] = true; });
            var modsEl = document.getElementById('statTotalMods');
            if (modsEl) modsEl.textContent = Object.keys(modSet).length;
        }

        // Show per-school control panels
        if (data.spells && typeof showSchoolControlPanels === 'function') {
            var schoolData = {};
            data.spells.forEach(function(spell) {
                var school = spell.school || 'Unknown';
                if (!school || school === 'null' || school === 'None') school = 'Hedge Wizard';
                if (!schoolData[school]) schoolData[school] = [];
                schoolData[school].push(spell);
            });
            showSchoolControlPanels(schoolData);
        }

        // Build button managed by TreeGrowth.updateScanStatus / updateBuildButton

        // Enable scan-dependent buttons after successful scan
        if (data.spells && data.spells.length > 0) {
            var postScanBtns = ['blacklistBtn', 'whitelistBtn', 'saveBtn'];
            postScanBtns.forEach(function(id) {
                var btn = document.getElementById(id);
                if (btn) btn.disabled = false;
            });
            // Migrate legacy blacklist entries: add plugin + localFormId from scan data
            if (settings.spellBlacklist && data.spells && typeof getLocalFormId === 'function') {
                var spellLookup = {};
                data.spells.forEach(function(s) { if (s.formId) spellLookup[s.formId] = s; });
                var migrated = 0;
                settings.spellBlacklist.forEach(function(entry) {
                    if (!entry.localFormId && entry.formId && spellLookup[entry.formId]) {
                        var spell = spellLookup[entry.formId];
                        entry.plugin = spell.plugin || '';
                        entry.localFormId = getLocalFormId(entry.formId);
                        migrated++;
                    }
                });
                if (migrated > 0) {
                    console.log('[SpellLearning] Migrated ' + migrated + ' legacy blacklist entries to stable format');
                    if (typeof autoSaveSettings === 'function') autoSaveSettings();
                }
            }

            // Update primed count (filtered by blacklist/whitelist)
            if (typeof updatePrimedCount === 'function') updatePrimedCount();
        }

        // If tomes toggle is ON, auto-trigger a tome scan to get tomed IDs for filtering
        if (data.spells && data.spells.length > 0) {
            var scanModeTomesEl = document.getElementById('scanModeTomes');
            if (scanModeTomesEl && scanModeTomesEl.checked && window.callCpp) {
                window.callCpp('ScanSpells', JSON.stringify({ scanMode: 'tomes', fields: { plugin: true } }));
            }
        }

        // Show Classify Keywords button if LLM keyword classification is enabled
        var classifyBtn = document.getElementById('classifyKeywordsBtn');
        if (classifyBtn && data.spells && data.spells.length > 0) {
            var llmEnabled = settings.treeGeneration && settings.treeGeneration.llm &&
                             settings.treeGeneration.llm.enabled &&
                             settings.treeGeneration.llm.keywordClassification;
            classifyBtn.style.display = llmEnabled ? '' : 'none';
        }

    } catch (e) {
        console.error('[SpellLearning] Failed to parse spell data:', e);
        var outputAreaFallback = document.getElementById('outputArea');
        if (outputAreaFallback) outputAreaFallback.value = jsonStr;
        updateStatus(t('status.receivedDataParseError'));
        setStatusIcon('!');
        state.fullAutoMode = false;
    }

    // Show tree preview section (outside try-catch so errors don't kill scan flow)
    if (typeof TreePreview !== 'undefined' && state.lastSpellData) {
        try {
            TreePreview.show(state.lastSpellData);
        } catch (tpErr) {
            console.error('[TreePreview] Failed to show:', tpErr);
        }
    }

    // Initialize core settings (globe position/size) - now lives in Extra Settings tab
    if (typeof TreeCore !== 'undefined') {
        try {
            TreeCore.show();
        } catch (tcErr) {
            console.error('[TreeCore] Failed to init:', tcErr);
        }
    }

    // Show tree growth section (pulls data from TreePreview)
    if (typeof TreeGrowth !== 'undefined' && state.lastSpellData) {
        try {
            TreeGrowth.show();
        } catch (tgErr) {
            console.error('[TreeGrowth] Failed to show:', tgErr);
        }
    }

    // Show Extra Settings section after scan (preview renders empty state until tree is built)
    var prmSection = document.getElementById('prereqMasterSection');
    if (prmSection) prmSection.style.display = '';

    // Notify growth modes that spells are available for building
    if (state.lastSpellData && state.lastSpellData.spells && state.lastSpellData.spells.length > 0) {
        if (typeof TreeGrowth !== 'undefined') TreeGrowth.updateScanStatus(true);
    }

    // Update scan stats + status outside try-catch (guaranteed to run)
    if (state.lastSpellData && state.lastSpellData.spells && state.lastSpellData.spells.length > 0) {
        var spells = state.lastSpellData.spells;
        try {
            var totalEl = document.getElementById('statTotalSpells');
            if (totalEl) totalEl.textContent = spells.length;

            var modSet2 = {};
            spells.forEach(function(s) { if (s.plugin) modSet2[s.plugin] = true; });
            var modsEl2 = document.getElementById('statTotalMods');
            if (modsEl2) modsEl2.textContent = Object.keys(modSet2).length;

            if (typeof updatePrimedCount === 'function') updatePrimedCount();
        } catch (statErr) {
            console.error('[SpellLearning] Stats update error:', statErr);
        }

        // Update status bar if it wasn't set by the try block
        var statusText = document.getElementById('statusText');
        if (statusText && statusText.textContent === 'Ready to scan') {
            var schoolSet2 = {};
            spells.forEach(function(s) { if (s.school) schoolSet2[s.school] = true; });
            if (typeof updateStatus === 'function') {
                updateStatus(t('status.scannedSpells', {count: spells.length}));
            }
            if (typeof updateScanStatus === 'function') {
                updateScanStatus(t('status.scannedSpellsSchools', {count: spells.length, schools: Object.keys(schoolSet2).length}), 'success');
            }
        }
    }

    var scanBtn = document.getElementById('scanBtn');
    if (scanBtn) {
        scanBtn.disabled = false;
        scanBtn.innerHTML = '<span class="btn-icon">[*]</span>' + t('buttons.scanSpells');
    }

    // Continue to auto-generation if in full auto mode
    if (state.fullAutoMode && scanSuccess) {
        console.log('[SpellLearning] Full Auto: Starting tree generation...');
        setTimeout(function() {
            startFullAutoGenerate();
        }, 500);
    } else if (state.proceduralPending && scanSuccess) {
        // Trigger JS procedural generation
        console.log('[SpellLearning] Procedural (JS): Starting tree generation...');
        state.proceduralPending = false;
        setTimeout(function() {
            startProceduralGenerate();
        }, 100);
    } else if (state.visualFirstPending && scanSuccess) {
        // Trigger Visual-First generation
        console.log('[SpellLearning] Visual-First: Starting tree generation...');
        state.visualFirstPending = false;
        setTimeout(function() {
            if (typeof doVisualFirstGenerate === 'function') {
                doVisualFirstGenerate();
            }
        }, 100);
    } else if (state.proceduralPlusScanPending && scanSuccess) {
        // Trigger procedural generation
        console.log('[SpellLearning] Procedural+: Starting tree generation...');
        state.proceduralPlusScanPending = false;
        setTimeout(function() {
            startProceduralTreeGenerate();
        }, 100);
    } else {
        // Reset all buttons if not continuing
        var fullAutoBtn = document.getElementById('fullAutoBtn');
        if (fullAutoBtn) {
            fullAutoBtn.disabled = false;
            fullAutoBtn.innerHTML = '<span class="btn-icon">>></span> Full Auto';
        }
        if (typeof resetProceduralButton === 'function') resetProceduralButton();
        if (typeof resetProceduralPlusButton === 'function') resetProceduralPlusButton();
    }
};

window.updateStatus = function(message) {
    var msg = message;
    if (msg.startsWith('"') && msg.endsWith('"')) {
        try { msg = JSON.parse(msg); } catch (e) {}
    }
    var el = document.getElementById('statusText');
    if (el) el.textContent = msg;
    // Forward to scan feedback bar with auto-detected type
    var type = '';
    if (msg.indexOf('Saved') !== -1 || msg.indexOf('saved') !== -1) type = 'success';
    else if (msg.indexOf('Error') !== -1 || msg.indexOf('Failed') !== -1 || msg.indexOf('failed') !== -1) type = 'error';
    if (typeof updateScanStatus === 'function') updateScanStatus(msg, type);
};

window.updateTreeStatus = function(message) {
    var msg = message;
    if (msg.startsWith('"') && msg.endsWith('"')) {
        try { msg = JSON.parse(msg); } catch (e) {}
    }
    if (typeof setTreeStatus === 'function') setTreeStatus(msg);
};

window.updatePrompt = function(promptContent) {
    console.log('[SpellLearning] Received prompt, length:', promptContent.length);

    if (promptContent && promptContent.length > 0) {
        state.originalPrompt = promptContent;
        state.promptModified = false;
        var promptArea = document.getElementById('promptArea');
        if (promptArea) {
            promptArea.value = promptContent;
            setPromptStatus('Loaded', '');
        }
    }
};

window.onPromptSaved = function(success) {
    if (success === 'true' || success === true) {
        var promptArea = document.getElementById('promptArea');
        if (promptArea) state.originalPrompt = promptArea.value;
        state.promptModified = false;
        setPromptStatus('Saved', '');
    } else {
        setPromptStatus('Save failed', 'error');
    }
};

/**
 * Called by C++ with clipboard content
 */
window.onClipboardContent = function(content) {
    console.log('[SpellLearning] Received clipboard content, length:', content ? content.length : 0);

    if (!content || content.length === 0) {
        updateStatus(t('status.clipboardEmpty'));
        setStatusIcon('!');
        state.pasteTarget = null;
        return;
    }

    // Paste to the target element
    var targetId = state.pasteTarget || 'outputArea';
    var targetEl = document.getElementById(targetId);

    if (targetEl) {
        targetEl.value = content.trim();

        if (targetId === 'outputArea') {
            updateStatus(t('status.pastedClipboard', {length: content.length}));
            setStatusIcon('X');
            updateCharCount();
        } else if (targetId === 'import-textarea') {
            // Clear any previous error
            var errorBox = document.getElementById('import-error');
            if (errorBox) errorBox.classList.add('hidden');
        } else if (targetId === 'apiKeyInput') {
            // API key pasted
            targetEl.dataset.hasKey = 'false';
            updateStatus(t('status.apiKeyPasted'));
            setStatusIcon('X');

            // Temporarily show the key so user can see it was pasted
            if (targetEl.type === 'password') {
                targetEl.type = 'text';
                setTimeout(function() {
                    targetEl.type = 'password';
                }, 2000);
            }
            targetEl.focus();
        } else if (targetId === 'customModelInput') {
            // Custom model ID pasted
            updateStatus(t('status.customModelPasted', {model: content.trim()}));
            setStatusIcon('X');
            updateModelDisplayState();
            onSaveApiSettings();
            targetEl.focus();
        }
    }

    state.pasteTarget = null;
};

/**
 * Called by C++ when copy succeeds
 */
window.onCopyComplete = function(success) {
    if (success === 'true' || success === true) {
        updateStatus(t('status.copiedClipboard'));
        setStatusIcon('X');
    } else {
        updateStatus(t('status.copyFailed'));
        setStatusIcon('X');
    }
};

// Tree viewer callbacks
window.updateTreeData = function(json) {
    console.log('[SpellLearning] Received tree data');
    try {
        var data = typeof json === 'string' ? JSON.parse(json) : json;

        // Check if we actually have tree data
        if (!data || !data.schools || Object.keys(data.schools).length === 0) {
            console.log('[SpellLearning] No valid tree data in response');
            return;
        }

        console.log('[SpellLearning] Loading tree with ' + Object.keys(data.schools).length + ' schools');
        loadTreeData(data);

        // Enable Pre Req Master now that tree is loaded
        if (typeof PreReqMaster !== 'undefined' && PreReqMaster.setButtonsEnabled) {
            PreReqMaster.setButtonsEnabled(true);
            PreReqMaster.updateStatus('Tree loaded - ready');
        }

        // Analyze orphans after tree loads and update repair button
        if (typeof analyzeOrphans === 'function') {
            setTimeout(function() {
                analyzeOrphans();
                if (typeof updateOrphanRepairButton === 'function') {
                    updateOrphanRepairButton();
                }
            }, 200);
        }

        // Force hide empty state after loading
        var emptyState = document.getElementById('empty-state');
        if (emptyState && state.treeData && state.treeData.nodes && state.treeData.nodes.length > 0) {
            emptyState.classList.add('hidden');
            console.log('[SpellLearning] Force-hid empty state');
        }
    } catch (e) {
        console.error('[SpellLearning] Failed to parse tree data:', e);
    }
};
