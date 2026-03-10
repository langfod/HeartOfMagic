/**
 * Passive Learning Settings
 * UI for configuring passive XP learning (scope, rates, tier caps).
 *
 * Depends on: state.js (settings), settingsPanel.js (initSegmentedToggle, setSegmentedToggleValue, updateSliderFillGlobal, autoSaveSettings)
 */

function initializePassiveLearningSettings() {
    // Enable toggle
    var enableToggle = document.getElementById('passiveLearningToggle');
    if (enableToggle) {
        enableToggle.checked = settings.passiveLearning.enabled;
        enableToggle.addEventListener('change', function() {
            settings.passiveLearning.enabled = this.checked;
            updatePassiveLearningVisibility();
            console.log('[SpellLearning] Passive learning enabled:', this.checked);
            autoSaveSettings();
        });
    }

    // Scope toggle (segmented)
    initSegmentedToggle('passiveScopeToggle', settings.passiveLearning.scope, function(value) {
        settings.passiveLearning.scope = value;
        console.log('[SpellLearning] Passive learning scope:', value);
        autoSaveSettings();
    });

    // XP per game hour slider
    var xpSlider = document.getElementById('passiveXpPerHourSlider');
    var xpValue = document.getElementById('passiveXpPerHourValue');
    if (xpSlider) {
        xpSlider.value = settings.passiveLearning.xpPerGameHour;
        if (xpValue) xpValue.textContent = settings.passiveLearning.xpPerGameHour;
        updateSliderFillGlobal(xpSlider);
        xpSlider.addEventListener('input', function() {
            var val = parseInt(this.value);
            settings.passiveLearning.xpPerGameHour = val;
            if (xpValue) xpValue.textContent = val;
            updateSliderFillGlobal(this);
            autoSaveSettings();
        });
    }

    // Max tier inputs
    var tierMap = {
        'passiveMaxNovice': 'novice',
        'passiveMaxApprentice': 'apprentice',
        'passiveMaxAdept': 'adept',
        'passiveMaxExpert': 'expert',
        'passiveMaxMaster': 'master'
    };
    for (var elId in tierMap) {
        (function(elementId, tierKey) {
            var input = document.getElementById(elementId);
            if (input) {
                input.value = settings.passiveLearning.maxByTier[tierKey];
                input.addEventListener('change', function() {
                    var val = Math.max(0, Math.min(100, parseInt(this.value) || 0));
                    this.value = val;
                    settings.passiveLearning.maxByTier[tierKey] = val;
                    console.log('[SpellLearning] Passive max ' + tierKey + ':', val);
                    autoSaveSettings();
                });
            }
        })(elId, tierMap[elId]);
    }

    // Initial visibility
    updatePassiveLearningVisibility();
    console.log('[SpellLearning] Passive learning settings initialized');
}

function updatePassiveLearningVisibility() {
    var controls = document.querySelector('.passive-learning-controls');
    if (!controls) return;
    var rows = controls.querySelectorAll('.setting-row-inline, .setting-row, .slider-row, .settings-subsection, .tier-xp-grid');
    var isEnabled = settings.passiveLearning.enabled;
    // Skip the first row (the enable toggle itself)
    for (var i = 1; i < rows.length; i++) {
        rows[i].style.opacity = isEnabled ? '1' : '0.5';
        rows[i].style.pointerEvents = isEnabled ? '' : 'none';
    }
}

function updatePassiveLearningUI() {
    var enableToggle = document.getElementById('passiveLearningToggle');
    if (enableToggle) enableToggle.checked = settings.passiveLearning.enabled;

    setSegmentedToggleValue('passiveScopeToggle', settings.passiveLearning.scope);

    var xpSlider = document.getElementById('passiveXpPerHourSlider');
    var xpValue = document.getElementById('passiveXpPerHourValue');
    if (xpSlider) {
        xpSlider.value = settings.passiveLearning.xpPerGameHour;
        if (xpValue) xpValue.textContent = settings.passiveLearning.xpPerGameHour;
        updateSliderFillGlobal(xpSlider);
    }

    var tierMap = {
        'passiveMaxNovice': 'novice',
        'passiveMaxApprentice': 'apprentice',
        'passiveMaxAdept': 'adept',
        'passiveMaxExpert': 'expert',
        'passiveMaxMaster': 'master'
    };
    for (var elId in tierMap) {
        var input = document.getElementById(elId);
        if (input) input.value = settings.passiveLearning.maxByTier[tierMap[elId]];
    }

    updatePassiveLearningVisibility();
}
