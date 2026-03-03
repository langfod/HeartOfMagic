/**
 * Panel Chrome
 * Fullscreen toggle, keyboard shortcuts, tab navigation, prompt editor,
 * settings toggle, window position/size, dragging, and resizing.
 *
 * Depends on: state.js (state, settings), constants.js (DEFAULT_TREE_RULES),
 *             uiHelpers.js (updateCharCount)
 */

// =============================================================================
// FULLSCREEN TOGGLE
// =============================================================================

function toggleFullscreen() {
    var panel = document.getElementById('spellPanel');
    if (!panel) return;

    state.isFullscreen = !state.isFullscreen;
    panel.classList.toggle('fullscreen', state.isFullscreen);

    // Update fullscreen button icon
    var btn = document.getElementById('fullscreenBtn');
    if (btn) {
        btn.textContent = state.isFullscreen ? '[ ]' : '[ ]';
        btn.title = state.isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen';
    }

    // Save state
    settings.isFullscreen = state.isFullscreen;
    autoSaveSettings();

    // Re-render tree if on tree tab
    if (state.currentTab === 'spellTree' && WheelRenderer.svg) {
        setTimeout(function() {
            WheelRenderer.updateTransform();
        }, 100);
    }

    console.log('[SpellLearning] Fullscreen:', state.isFullscreen);
}

// =============================================================================
// KEYBOARD SHORTCUTS
// =============================================================================

function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Don't close if user is typing in an input/textarea
        var activeElement = document.activeElement;
        var isTyping = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        );

        // Escape always closes (even when typing)
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCloseClick();
            return;
        }

        // Tab closes only when not typing in a field
        if (e.key === 'Tab' && !isTyping) {
            e.preventDefault();
            e.stopPropagation();
            onCloseClick();
            return;
        }
    });

    console.log('[SpellLearning] Keyboard shortcuts initialized (Escape/Tab to close)');
}

// =============================================================================
// TAB NAVIGATION
// =============================================================================

function initializeTabs() {
    if (state._tabsInitialized) return;
    state._tabsInitialized = true;

    // Header buttons toggle panels (Scan, Settings) over the default Spell Tree view
    var headerTabBtns = document.querySelectorAll('.header-btn[data-tab]');
    headerTabBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var tabId = this.getAttribute('data-tab');
            // Toggle: clicking active panel button returns to tree
            if (state.currentTab === tabId) {
                switchTab('spellTree');
            } else {
                switchTab(tabId);
            }
        });
    });

    // Return button — navigates back to spell tree view
    var returnBtn = document.getElementById('returnToTreeBtn');
    if (returnBtn) {
        returnBtn.addEventListener('click', function() {
            switchTab('spellTree');
        });
    }

    // Orphan repair button
    var orphanBtn = document.getElementById('orphanRepairBtn');
    if (orphanBtn) {
        orphanBtn.addEventListener('click', function() {
            if (typeof repairOrphans !== 'function') return;
            var result = repairOrphans();
            var msg = 'Repaired: removed ' + result.removedPrereqs + ' bad prereqs, reconnected ' +
                result.reconnectedSubtrees + ' subtrees (' + result.nodesRecovered + ' nodes recovered)';
            console.log('[OrphanRepair] ' + msg);
            if (typeof updateOrphanRepairButton === 'function') {
                updateOrphanRepairButton();
            }
        });
    }
}

function switchTab(tabId) {
    // Auto-save settings when leaving settings tab
    if (state.currentTab === 'settings' && tabId !== 'settings') {
        autoSaveSettings();
    }

    state.currentTab = tabId;

    // Update header button active states
    document.querySelectorAll('.header-btn[data-tab]').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.tab-content').forEach(function(content) {
        content.classList.remove('active');
    });

    // Show/hide Return button based on current tab
    var returnBtn = document.getElementById('returnToTreeBtn');
    if (returnBtn) {
        returnBtn.style.display = (tabId !== 'spellTree') ? '' : 'none';
    }

    if (tabId === 'spellScan') {
        document.getElementById('contentSpellScan').classList.add('active');
    } else if (tabId === 'spellTree') {
        document.getElementById('contentSpellTree').classList.add('active');
        // Initialize tree viewer if not done yet
        if (!state.treeInitialized) {
            initializeTreeViewer();
        }
        // Update transform on tab switch
        if (WheelRenderer.svg) {
            setTimeout(function() { WheelRenderer.updateTransform(); }, 50);
        }
    } else if (tabId === 'settings') {
        document.getElementById('contentSettings').classList.add('active');
    }
}

// =============================================================================
// PROMPT EDITOR
// =============================================================================

function initializePromptEditor() {
    var promptArea = document.getElementById('promptArea');
    if (!promptArea) {
        // Tree Rules tab removed - prompt editor not available
        // Still load prompt from C++ for internal use
        if (window.callCpp) {
            window.callCpp('LoadPrompt', '');
        }
        return;
    }

    var resetBtn = document.getElementById('resetPromptBtn');
    var saveBtn = document.getElementById('savePromptBtn');

    promptArea.value = DEFAULT_TREE_RULES;

    if (window.callCpp) {
        window.callCpp('LoadPrompt', '');
    }

    promptArea.addEventListener('input', function() {
        state.promptModified = (promptArea.value !== state.originalPrompt);
        updatePromptStatus();
    });

    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            if (confirm('Reset tree rules to default? Your changes will be lost.')) {
                promptArea.value = DEFAULT_TREE_RULES;
                state.promptModified = true;
                updatePromptStatus();
            }
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', onSavePromptClick);
    }
}

function onSavePromptClick() {
    var promptArea = document.getElementById('promptArea');
    if (!promptArea) return;
    var content = promptArea.value;

    if (window.callCpp) {
        window.callCpp('SavePrompt', content);
    } else {
        console.warn('[SpellLearning] C++ bridge not ready');
        setPromptStatus('Cannot save', 'error');
    }
}

function updatePromptStatus() {
    if (state.promptModified) {
        setPromptStatus('Modified', 'modified');
    } else {
        setPromptStatus('Saved', '');
    }
}

function setPromptStatus(text, className) {
    var statusEl = document.getElementById('promptStatus');
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'prompt-status';
    if (className) {
        statusEl.classList.add(className);
    }
}

function getTreeRulesPrompt() {
    var promptArea = document.getElementById('promptArea');
    if (promptArea) return promptArea.value;
    // Fallback: use stored prompt or default
    return state.originalPrompt || (typeof DEFAULT_TREE_RULES !== 'undefined' ? DEFAULT_TREE_RULES : '');
}

// =============================================================================
// SETTINGS
// =============================================================================

function toggleSettings() {
    state.isSettingsOpen = !state.isSettingsOpen;
    var panel = document.getElementById('settingsPanel');
    if (panel) panel.classList.toggle('hidden', !state.isSettingsOpen);

    var btn = document.getElementById('settingsBtn');
    if (btn) btn.classList.toggle('active', state.isSettingsOpen);
}

// =============================================================================
// DRAGGING & RESIZING
// =============================================================================

function applyWindowPositionAndSize() {
    var panel = document.getElementById('spellPanel');
    if (!panel) return;

    // Apply saved size
    if (settings.windowWidth && settings.windowHeight) {
        panel.style.width = settings.windowWidth + 'px';
        panel.style.height = settings.windowHeight + 'px';
        console.log('[SpellLearning] Applied window size:', settings.windowWidth, 'x', settings.windowHeight);
    }

    // Apply saved position
    if (settings.windowX !== null && settings.windowY !== null) {
        panel.style.transform = 'none';
        panel.style.left = settings.windowX + 'px';
        panel.style.top = settings.windowY + 'px';
        console.log('[SpellLearning] Applied window position:', settings.windowX, settings.windowY);
    }
}

function applyFullscreenState() {
    var panel = document.getElementById('spellPanel');
    if (!panel) return;

    if (state.isFullscreen) {
        panel.classList.add('fullscreen');
        console.log('[SpellLearning] Applied fullscreen state: ON');
    } else {
        panel.classList.remove('fullscreen');
    }

    // Update fullscreen button icon
    var btn = document.getElementById('fullscreenBtn');
    if (btn) {
        btn.title = state.isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen';
    }
}

function initializeDragging() {
    var panel = document.getElementById('spellPanel');
    var header = document.getElementById('panelHeader');

    var startX, startY, initialX, initialY;

    header.addEventListener('mousedown', function(e) {
        if (e.target.closest('.header-btn')) return;

        state.isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        var rect = panel.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;

        panel.style.transform = 'none';
        panel.style.left = initialX + 'px';
        panel.style.top = initialY + 'px';

        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', onDragEnd);
    });

    function onDrag(e) {
        if (!state.isDragging) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        panel.style.left = (initialX + dx) + 'px';
        panel.style.top = (initialY + dy) + 'px';
    }

    function onDragEnd() {
        state.isDragging = false;
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', onDragEnd);

        // Save window position
        var rect = panel.getBoundingClientRect();
        settings.windowX = Math.round(rect.left);
        settings.windowY = Math.round(rect.top);
        console.log('[SpellLearning] Window position saved:', settings.windowX, settings.windowY);
        autoSaveSettings();
    }
}

function initializeResizing() {
    var panel = document.getElementById('spellPanel');
    var handle = document.getElementById('resizeHandle');

    var startX, startY, startWidth, startHeight;

    handle.addEventListener('mousedown', function(e) {
        state.isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = panel.offsetWidth;
        startHeight = panel.offsetHeight;

        document.addEventListener('mousemove', onResize);
        document.addEventListener('mouseup', onResizeEnd);
        e.preventDefault();
    });

    function onResize(e) {
        if (!state.isResizing) return;
        var newWidth = Math.max(500, startWidth + (e.clientX - startX));
        var newHeight = Math.max(400, startHeight + (e.clientY - startY));
        panel.style.width = newWidth + 'px';
        panel.style.height = newHeight + 'px';
    }

    function onResizeEnd() {
        state.isResizing = false;
        document.removeEventListener('mousemove', onResize);
        document.removeEventListener('mouseup', onResizeEnd);

        // Save window size
        settings.windowWidth = panel.offsetWidth;
        settings.windowHeight = panel.offsetHeight;
        console.log('[SpellLearning] Window size saved:', settings.windowWidth, 'x', settings.windowHeight);
        autoSaveSettings();
    }
}
