/**
 * Settings UI Helpers
 * Generic UI components used by the settings panel (segmented toggles, etc.)
 *
 * Depends on: state.js (settings), i18n.js (t)
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
// RETRY SCHOOL UI
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

// =============================================================================
// DEVELOPER MODE VISIBILITY
// =============================================================================

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

// Export updateDeveloperModeVisibility for use by other modules
window.updateDeveloperModeVisibility = updateDeveloperModeVisibility;
