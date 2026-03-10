/**
 * Settings UI Update Helpers
 * Learning color, font size, early learning, spell tome, and notification UI updaters.
 *
 * Depends on: state.js (settings), uiHelpers.js (updateSliderFillGlobal)
 */

// =============================================================================
// UI DISPLAY HELPERS
// =============================================================================

/**
 * Apply learning color to CSS variables
 * @param {string} color - Hex color value
 */
function applyLearningColor(color) {
    if (!color) return;

    var root = document.documentElement;
    root.style.setProperty('--learning-color', color);
    root.style.setProperty('--node-learning-border', color);

    // Parse hex to RGB for transparent versions
    var r = parseInt(color.slice(1, 3), 16);
    var g = parseInt(color.slice(3, 5), 16);
    var b = parseInt(color.slice(5, 7), 16);

    root.style.setProperty('--node-learning-bg', 'rgba(' + r + ', ' + g + ', ' + b + ', 0.2)');
    root.style.setProperty('--node-learning-glow', 'rgba(' + r + ', ' + g + ', ' + b + ', 0.5)');

    console.log('[SpellLearning] Applied learning color:', color);
}

/**
 * Apply font size multiplier to the entire UI
 * @param {number} multiplier - Font size multiplier (0.7 - 1.5)
 */
function applyFontSizeMultiplier(multiplier) {
    if (!multiplier || multiplier < 0.5 || multiplier > 2) {
        multiplier = 1.0;
    }

    var root = document.documentElement;
    root.style.setProperty('--font-size-multiplier', multiplier);

    // Apply to body font size (base is 14px in Skyrim theme)
    var baseFontSize = 14;
    document.body.style.fontSize = (baseFontSize * multiplier) + 'px';

    console.log('[SpellLearning] Applied font size multiplier:', multiplier);
}

// =============================================================================
// EARLY LEARNING UI UPDATE
// =============================================================================

/**
 * Update early learning UI elements from settings
 */
function updateEarlyLearningUI() {
    var el = settings.earlySpellLearning;

    var enabledToggle = document.getElementById('earlyLearningEnabled');
    if (enabledToggle) enabledToggle.checked = el.enabled;

    var displayToggle = document.getElementById('modifyGameDisplayToggle');
    if (displayToggle) displayToggle.checked = el.modifyGameDisplay;

    // Sliders
    var unlockSlider = document.getElementById('earlyUnlockThreshold');
    if (unlockSlider) {
        unlockSlider.value = el.unlockThreshold;
        var unlockValue = document.getElementById('earlyUnlockValue');
        if (unlockValue) unlockValue.textContent = el.unlockThreshold + '%';
        updateSliderFillGlobal(unlockSlider);
    }

    var selfCastSlider = document.getElementById('selfCastRequired');
    if (selfCastSlider) {
        selfCastSlider.value = el.selfCastRequiredAt;
        var selfCastValue = document.getElementById('selfCastRequiredValue');
        if (selfCastValue) selfCastValue.textContent = el.selfCastRequiredAt + '%';
        updateSliderFillGlobal(selfCastSlider);
    }

    var selfCastBonusSlider = document.getElementById('selfCastBonus');
    if (selfCastBonusSlider) {
        selfCastBonusSlider.value = el.selfCastXPMultiplier;
        var selfCastBonusValue = document.getElementById('selfCastBonusValue');
        if (selfCastBonusValue) selfCastBonusValue.textContent = el.selfCastXPMultiplier + '%';
        updateSliderFillGlobal(selfCastBonusSlider);
    }

    var binarySlider = document.getElementById('binaryEffectThreshold');
    if (binarySlider) {
        binarySlider.value = el.binaryEffectThreshold;
        var binaryValue = document.getElementById('binaryEffectValue');
        if (binaryValue) binaryValue.textContent = el.binaryEffectThreshold + '%';
        updateSliderFillGlobal(binarySlider);
    }
}

// =============================================================================
// SPELL TOME LEARNING UI UPDATE
// =============================================================================

/**
 * Update spell tome learning UI elements from settings
 */
function updateSpellTomeLearningUI() {
    var stl = settings.spellTomeLearning;

    // Main toggle - Vanilla vs Progression system
    var progressionToggle = document.getElementById('useProgressionSystemToggle');
    if (progressionToggle) progressionToggle.checked = stl.useProgressionSystem;

    // Tome inventory boost toggle
    var inventoryBoostToggle = document.getElementById('tomeInventoryBoostToggle');
    if (inventoryBoostToggle) inventoryBoostToggle.checked = stl.tomeInventoryBoost;

    // XP percent to grant slider
    var xpGrantSlider = document.getElementById('tomeXpGrantSlider');
    if (xpGrantSlider) {
        xpGrantSlider.value = stl.xpPercentToGrant;
        var xpGrantValue = document.getElementById('tomeXpGrantValue');
        if (xpGrantValue) xpGrantValue.textContent = stl.xpPercentToGrant + '%';
        updateSliderFillGlobal(xpGrantSlider);
    }

    // Inventory boost percent slider
    var boostSlider = document.getElementById('tomeInventoryBoostSlider');
    if (boostSlider) {
        boostSlider.value = stl.tomeInventoryBoostPercent;
        var boostValue = document.getElementById('tomeInventoryBoostValue');
        if (boostValue) boostValue.textContent = '+' + stl.tomeInventoryBoostPercent + '%';
        updateSliderFillGlobal(boostSlider);
    }

    // Learning requirements toggles
    var requirePrereqsToggle = document.getElementById('tomeRequirePrereqsToggle');
    if (requirePrereqsToggle) requirePrereqsToggle.checked = stl.requirePrereqs;

    var requireAllPrereqsToggle = document.getElementById('tomeRequireAllPrereqsToggle');
    if (requireAllPrereqsToggle) requireAllPrereqsToggle.checked = stl.requireAllPrereqs;

    var requireSkillLevelToggle = document.getElementById('tomeRequireSkillLevelToggle');
    if (requireSkillLevelToggle) requireSkillLevelToggle.checked = stl.requireSkillLevel;

    // Show/hide child setting based on parent
    var allPrereqsRow = document.getElementById('tomeRequireAllPrereqsRow');
    if (allPrereqsRow) allPrereqsRow.style.display = stl.requirePrereqs ? '' : 'none';

    // Update description based on mode
    var modeDesc = document.getElementById('tomeLearningModeDesc');
    if (modeDesc) {
        if (stl.useProgressionSystem) {
            modeDesc.textContent = 'Reading tomes grants XP and gives early access to weakened spells. Keep tomes to practice!';
        } else {
            modeDesc.textContent = 'Vanilla behavior: Reading tomes instantly teaches spells and consumes the book.';
        }
    }
}

// =============================================================================
// NOTIFICATIONS UI UPDATE
// =============================================================================

/**
 * Update notification settings UI elements from settings
 */
function updateNotificationsUI() {
    // Ensure settings exist
    if (!settings.notifications) {
        settings.notifications = { weakenedSpellNotifications: true, weakenedSpellInterval: 10 };
    }
    var notif = settings.notifications;

    // Weakened spell notifications toggle
    var weakenedToggle = document.getElementById('weakenedNotificationsToggle');
    if (weakenedToggle) weakenedToggle.checked = notif.weakenedSpellNotifications;

    // Notification interval slider
    var intervalSlider = document.getElementById('notificationIntervalSlider');
    if (intervalSlider) {
        intervalSlider.value = notif.weakenedSpellInterval;
        var intervalValue = document.getElementById('notificationIntervalValue');
        if (intervalValue) intervalValue.textContent = notif.weakenedSpellInterval + 's';
        updateSliderFillGlobal(intervalSlider);
    }

    // Show/hide interval row based on toggle
    var intervalRow = document.getElementById('notificationIntervalRow');
    if (intervalRow) {
        intervalRow.style.display = notif.weakenedSpellNotifications ? 'flex' : 'none';
    }
}
