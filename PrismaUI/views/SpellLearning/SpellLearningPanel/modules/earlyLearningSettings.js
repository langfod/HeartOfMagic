/**
 * Early Spell Learning Settings
 * UI for configuring early spell learning (power steps, effectiveness scaling).
 *
 * Depends on: state.js (settings), settingsPanel.js (updateSliderFillGlobal, autoSaveSettings)
 */

function initializeEarlyLearningSettings() {
    // Enable toggle
    var enabledToggle = document.getElementById('earlyLearningEnabledToggle');
    if (enabledToggle) {
        enabledToggle.checked = settings.earlySpellLearning.enabled;
        enabledToggle.addEventListener('change', function() {
            settings.earlySpellLearning.enabled = this.checked;
            updateEarlyLearningSettingsVisibility();
            console.log('[SpellLearning] Early learning enabled:', settings.earlySpellLearning.enabled);

        });
    }

    // Unlock threshold slider
    setupEarlyLearningSlider('unlockThreshold', 'unlockThreshold', '%');

    // Min effectiveness slider
    setupEarlyLearningSlider('minEffectiveness', 'minEffectiveness', '%');

    // Max effectiveness slider
    setupEarlyLearningSlider('maxEffectiveness', 'maxEffectiveness', '%');

    // Self-cast required slider
    setupEarlyLearningSlider('selfCastRequired', 'selfCastRequiredAt', '%');

    // Self-cast multiplier slider
    setupEarlyLearningSlider('selfCastMultiplier', 'selfCastXPMultiplier', '%');

    // Binary threshold slider
    setupEarlyLearningSlider('binaryThreshold', 'binaryEffectThreshold', '%');

    // Modify game display toggle
    var gameDisplayToggle = document.getElementById('modifyGameDisplayToggle');
    if (gameDisplayToggle) {
        gameDisplayToggle.checked = settings.earlySpellLearning.modifyGameDisplay !== false;
        gameDisplayToggle.addEventListener('change', function() {
            settings.earlySpellLearning.modifyGameDisplay = this.checked;
            console.log('[SpellLearning] Modify game display:', this.checked);

        });
    }

    // Power steps configuration
    initializePowerStepsUI();

    // Reset power steps button
    var resetPowerStepsBtn = document.getElementById('resetPowerStepsBtn');
    if (resetPowerStepsBtn) {
        resetPowerStepsBtn.addEventListener('click', function() {
            resetPowerStepsToDefaults();
        });
    }

    // Initial visibility
    updateEarlyLearningSettingsVisibility();
}

// Default power steps configuration
var DEFAULT_POWER_STEPS = [
    { xp: 25, power: 20, label: "Budding" },
    { xp: 40, power: 35, label: "Developing" },
    { xp: 55, power: 50, label: "Practicing" },
    { xp: 70, power: 65, label: "Advancing" },
    { xp: 85, power: 80, label: "Refining" }
];

function initializePowerStepsUI() {
    var container = document.getElementById('powerStepsContainer');
    if (!container) return;

    // Ensure powerSteps exists
    if (!settings.earlySpellLearning.powerSteps) {
        settings.earlySpellLearning.powerSteps = JSON.parse(JSON.stringify(DEFAULT_POWER_STEPS));
    }

    renderPowerSteps();
}

function renderPowerSteps() {
    var container = document.getElementById('powerStepsContainer');
    if (!container) return;

    container.innerHTML = '';

    var steps = settings.earlySpellLearning.powerSteps;

    steps.forEach(function(step, index) {
        var row = document.createElement('div');
        row.className = 'power-step-row';
        row.dataset.index = index;

        // Stage label
        var labelSpan = document.createElement('span');
        labelSpan.className = 'power-step-label';
        labelSpan.textContent = t('progression.stageN', {n: index + 1});

        // XP threshold input
        var xpInput = document.createElement('input');
        xpInput.type = 'number';
        xpInput.className = 'power-step-input';
        xpInput.value = step.xp;
        xpInput.min = 1;
        xpInput.max = 99;
        xpInput.dataset.index = index;
        xpInput.dataset.field = 'xp';
        xpInput.addEventListener('change', onPowerStepInputChange);

        var xpUnit = document.createElement('span');
        xpUnit.className = 'power-step-unit';
        xpUnit.textContent = t('progression.xpUnit');

        // Power level input
        var powerInput = document.createElement('input');
        powerInput.type = 'number';
        powerInput.className = 'power-step-input';
        powerInput.value = step.power;
        powerInput.min = 1;
        powerInput.max = 99;
        powerInput.dataset.index = index;
        powerInput.dataset.field = 'power';
        powerInput.addEventListener('change', onPowerStepInputChange);

        var powerUnit = document.createElement('span');
        powerUnit.className = 'power-step-unit';
        powerUnit.textContent = t('progression.powerUnit');

        // Name input
        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'power-step-name';
        nameInput.value = step.label;
        nameInput.placeholder = t('progression.stageNamePlaceholder');
        nameInput.dataset.index = index;
        nameInput.dataset.field = 'label';
        nameInput.addEventListener('change', onPowerStepInputChange);

        row.appendChild(labelSpan);
        row.appendChild(xpInput);
        row.appendChild(xpUnit);
        row.appendChild(powerInput);
        row.appendChild(powerUnit);
        row.appendChild(nameInput);

        container.appendChild(row);
    });

    // Add "Mastered" row (readonly)
    var masteredRow = document.createElement('div');
    masteredRow.className = 'power-step-row';
    masteredRow.style.opacity = '0.7';

    var masteredLabel = document.createElement('span');
    masteredLabel.className = 'power-step-label';
    masteredLabel.textContent = t('progression.stageFinal');
    masteredLabel.style.color = 'var(--accent-gold, #ffd700)';

    var masteredXp = document.createElement('span');
    masteredXp.className = 'power-step-unit';
    masteredXp.textContent = t('progression.fullXp');
    masteredXp.style.marginLeft = '10px';

    var masteredPower = document.createElement('span');
    masteredPower.className = 'power-step-unit';
    masteredPower.textContent = t('progression.fullPower');
    masteredPower.style.marginLeft = '20px';

    var masteredName = document.createElement('span');
    masteredName.className = 'power-step-unit';
    masteredName.textContent = t('progression.masteredFixed');
    masteredName.style.marginLeft = '20px';

    masteredRow.appendChild(masteredLabel);
    masteredRow.appendChild(masteredXp);
    masteredRow.appendChild(document.createElement('span')); // spacer
    masteredRow.appendChild(masteredPower);
    masteredRow.appendChild(document.createElement('span')); // spacer
    masteredRow.appendChild(masteredName);

    container.appendChild(masteredRow);
}

function onPowerStepInputChange(e) {
    var index = parseInt(e.target.dataset.index);
    var field = e.target.dataset.field;
    var value = field === 'label' ? e.target.value : parseInt(e.target.value);

    if (field !== 'label') {
        value = Math.max(1, Math.min(99, value || 1));
        e.target.value = value;
    }

    settings.earlySpellLearning.powerSteps[index][field] = value;

    // Sort steps by XP threshold to maintain order
    settings.earlySpellLearning.powerSteps.sort(function(a, b) {
        return a.xp - b.xp;
    });

    // Re-render if order changed
    renderPowerSteps();

    console.log('[SpellLearning] Power step updated:', settings.earlySpellLearning.powerSteps);

}

function resetPowerStepsToDefaults() {
    settings.earlySpellLearning.powerSteps = JSON.parse(JSON.stringify(DEFAULT_POWER_STEPS));
    renderPowerSteps();
    console.log('[SpellLearning] Power steps reset to defaults');

}

function setupEarlyLearningSlider(elementBaseName, settingName, suffix) {
    var slider = document.getElementById(elementBaseName + 'Slider');
    var valueEl = document.getElementById(elementBaseName + 'Value');

    if (slider) {
        slider.value = settings.earlySpellLearning[settingName];
        if (valueEl) valueEl.textContent = settings.earlySpellLearning[settingName] + suffix;
        // Update slider fill visual
        updateSliderFillGlobal(slider);

        slider.addEventListener('input', function() {
            var value = parseInt(this.value);
            settings.earlySpellLearning[settingName] = value;
            if (valueEl) valueEl.textContent = value + suffix;
            // Update slider fill visual
            updateSliderFillGlobal(this);

        });
    }
}

function updateEarlyLearningSettingsVisibility() {
    var rows = [
        'unlockThresholdRow',
        'minEffectivenessRow',
        'maxEffectivenessRow',
        'selfCastRequiredRow',
        'selfCastMultiplierRow',
        'binaryThresholdRow'
    ];

    var isEnabled = settings.earlySpellLearning.enabled;

    rows.forEach(function(rowId) {
        var row = document.getElementById(rowId);
        if (row) {
            row.style.opacity = isEnabled ? '1' : '0.5';
            row.style.pointerEvents = isEnabled ? '' : 'none';
        }
    });
}

function updateEarlyLearningUI() {
    // Update toggle
    var enabledToggle = document.getElementById('earlyLearningEnabledToggle');
    if (enabledToggle) enabledToggle.checked = settings.earlySpellLearning.enabled;

    // Update modifyGameDisplay toggle
    var gameDisplayToggle = document.getElementById('modifyGameDisplayToggle');
    if (gameDisplayToggle) {
        gameDisplayToggle.checked = settings.earlySpellLearning.modifyGameDisplay !== false;
    }

    // Update sliders
    var sliderMappings = [
        { element: 'unlockThreshold', setting: 'unlockThreshold' },
        { element: 'minEffectiveness', setting: 'minEffectiveness' },
        { element: 'maxEffectiveness', setting: 'maxEffectiveness' },
        { element: 'selfCastRequired', setting: 'selfCastRequiredAt' },
        { element: 'selfCastMultiplier', setting: 'selfCastXPMultiplier' },
        { element: 'binaryThreshold', setting: 'binaryEffectThreshold' }
    ];

    sliderMappings.forEach(function(mapping) {
        var slider = document.getElementById(mapping.element + 'Slider');
        var valueEl = document.getElementById(mapping.element + 'Value');
        if (slider && settings.earlySpellLearning[mapping.setting] !== undefined) {
            slider.value = settings.earlySpellLearning[mapping.setting];
            if (valueEl) valueEl.textContent = settings.earlySpellLearning[mapping.setting] + '%';
            // Update slider fill visual
            updateSliderFillGlobal(slider);
        }
    });

    // Update visibility
    updateEarlyLearningSettingsVisibility();
}
