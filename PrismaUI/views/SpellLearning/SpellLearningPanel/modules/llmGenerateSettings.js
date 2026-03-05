/**
 * LLM Generate Settings - Tree save and ISL/DEST settings helpers.
 *
 * Loaded after: llmGenerateProcess.js
 * Depends on: state.js (state, settings), uiHelpers.js
 */

// Helper function to save tree - can be called anytime
function saveTreeToFile() {
    if (!state.treeData || !state.treeData.rawData) {
        console.warn('[SpellLearning] No tree data to save');
        return false;
    }

    if (!window.callCpp) {
        console.warn('[SpellLearning] Cannot save - callCpp not available');
        return false;
    }

    var treeJson = JSON.stringify(state.treeData.rawData);
    console.log('[SpellLearning] Saving tree to file, size:', treeJson.length, 'chars,',
                Object.keys(state.treeData.rawData.schools || {}).length, 'schools');

    window.callCpp('SaveSpellTree', treeJson);
    return true;
}

// Helper function to show/hide divider settings based on toggle state
function updateDividerSettingsVisibility() {
    var fadeRow = document.getElementById('dividerFadeRow');
    var spacingRow = document.getElementById('dividerSpacingRow');
    var colorModeRow = document.getElementById('dividerColorModeRow');
    var isVisible = settings.showSchoolDividers;

    if (fadeRow) fadeRow.style.display = isVisible ? '' : 'none';
    if (spacingRow) spacingRow.style.display = isVisible ? '' : 'none';
    if (colorModeRow) colorModeRow.style.display = isVisible ? '' : 'none';

    // Also update custom color row visibility
    updateDividerColorRowVisibility();
}

// Helper function to show/hide custom color picker based on color mode
function updateDividerColorRowVisibility() {
    var customColorRow = document.getElementById('dividerCustomColorRow');
    var isVisible = settings.showSchoolDividers && settings.dividerColorMode === 'custom';

    if (customColorRow) customColorRow.style.display = isVisible ? '' : 'none';
}

// Initialize Spell Tome Integration settings (DEST bundled)
function initializeISLSettings() {
    // Simple enable toggle - DEST is bundled, always available
    var destEnabledToggle = document.getElementById('islEnabledToggle') || document.getElementById('destEnabledToggle');
    if (destEnabledToggle) {
        destEnabledToggle.checked = settings.islEnabled;
        destEnabledToggle.addEventListener('change', function() {
            settings.islEnabled = this.checked;
            console.log('[SpellLearning] Spell Tome Integration enabled:', settings.islEnabled);
            scheduleAutoSave();
        });
    }

    // Update status badge to show "Bundled" since DEST is included
    updateDESTStatus();
}

// Update DEST status badge - always shows "Bundled" since it's included
function updateDESTStatus() {
    var badge = document.getElementById('islDetectionStatus') || document.getElementById('destStatus');
    if (!badge) return;

    // DEST is always bundled with this mod
    badge.textContent = 'Bundled';
    badge.classList.remove('not-detected');
    badge.classList.add('detected');
}

// Called from C++ when DEST detection status changes (legacy support)
window.onISLDetectionUpdate = function(detected) {
    // Ignore - DEST is always bundled
    console.log('[SpellLearning] DEST status check (bundled, always available)');
    updateDESTStatus();
};

// New callback name for DEST
window.onDESTDetectionUpdate = function(detected) {
    // Ignore - DEST is always bundled
    console.log('[SpellLearning] DEST status check (bundled, always available)');
    updateDESTStatus();
};
