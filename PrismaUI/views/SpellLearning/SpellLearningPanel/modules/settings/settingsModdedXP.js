/**
 * Modded XP Sources UI
 * Dynamic UI for external mod XP sources registered via the public API.
 * C++ calls window.onModdedXPSourceRegistered when a new source is registered.
 *
 * Depends on: state.js (settings)
 */

// =============================================================================
// MODDED XP SOURCES - Dynamic UI for external mod XP sources
// =============================================================================

/**
 * Add a single modded XP source row to the UI.
 * Called when a source is registered (from C++) or loaded from config.
 */
function addModdedXPSourceUI(sourceId, displayName, multiplier, cap, enabled) {
    var section = document.getElementById('moddedXPSourcesSection');
    var list = document.getElementById('moddedXPSourcesList');
    if (!section || !list) return;

    section.style.display = '';  // Show section

    // Check if already exists
    if (document.getElementById('moddedSrc_' + sourceId)) return;

    var row = document.createElement('div');
    row.id = 'moddedSrc_' + sourceId;
    row.className = 'modded-xp-source-row';
    row.innerHTML =
        '<div class="modded-source-header">' +
            '<label class="toggle-switch toggle-sm">' +
                '<input type="checkbox" id="moddedEnabled_' + sourceId + '"' + (enabled ? ' checked' : '') + '>' +
                '<span class="toggle-slider"></span>' +
            '</label>' +
            '<span class="modded-source-name">' + displayName + '</span>' +
        '</div>' +
        '<div class="slider-grid slider-grid-2">' +
            '<div class="slider-compact">' +
                '<span class="slider-compact-label">Multiplier</span>' +
                '<div class="slider-compact-control">' +
                    '<input type="range" id="moddedMult_' + sourceId + '" min="0" max="200" value="' + multiplier + '" class="setting-slider">' +
                    '<span id="moddedMultVal_' + sourceId + '" class="slider-value">' + multiplier + '%</span>' +
                '</div>' +
            '</div>' +
            '<div class="slider-compact">' +
                '<span class="slider-compact-label">Cap</span>' +
                '<div class="slider-compact-control">' +
                    '<input type="range" id="moddedCap_' + sourceId + '" min="0" max="100" value="' + cap + '" class="setting-slider">' +
                    '<span id="moddedCapVal_' + sourceId + '" class="slider-value">' + cap + '%</span>' +
                '</div>' +
            '</div>' +
        '</div>';
    list.appendChild(row);

    // Wire enable toggle
    var enableToggle = document.getElementById('moddedEnabled_' + sourceId);
    if (enableToggle) {
        enableToggle.addEventListener('change', function() {
            if (settings.moddedXPSources[sourceId]) {
                settings.moddedXPSources[sourceId].enabled = this.checked;
            }
            if (typeof scheduleAutoSave === 'function') scheduleAutoSave();
        });
    }

    // Wire multiplier slider
    var multSlider = document.getElementById('moddedMult_' + sourceId);
    var multVal = document.getElementById('moddedMultVal_' + sourceId);
    if (multSlider) {
        updateSliderFillGlobal(multSlider);
        multSlider.addEventListener('input', function() {
            if (multVal) multVal.textContent = this.value + '%';
            updateSliderFillGlobal(this);
            if (settings.moddedXPSources[sourceId]) {
                settings.moddedXPSources[sourceId].multiplier = parseInt(this.value);
            }
        });
        multSlider.addEventListener('change', function() {
            if (typeof scheduleAutoSave === 'function') scheduleAutoSave();
        });
    }

    // Wire cap slider
    var capSlider = document.getElementById('moddedCap_' + sourceId);
    var capVal = document.getElementById('moddedCapVal_' + sourceId);
    if (capSlider) {
        updateSliderFillGlobal(capSlider);
        capSlider.addEventListener('input', function() {
            if (capVal) capVal.textContent = this.value + '%';
            updateSliderFillGlobal(this);
            if (settings.moddedXPSources[sourceId]) {
                settings.moddedXPSources[sourceId].cap = parseInt(this.value);
            }
        });
        capSlider.addEventListener('change', function() {
            if (typeof scheduleAutoSave === 'function') scheduleAutoSave();
        });
    }
}

/**
 * Rebuild all modded XP source UI rows from settings.moddedXPSources.
 * Called when loading config or applying presets.
 */
// Internal sources that use the modded cap system but have their own UI section
var INTERNAL_XP_SOURCES = { 'passive': true };

function rebuildModdedXPSourcesUI() {
    var list = document.getElementById('moddedXPSourcesList');
    var section = document.getElementById('moddedXPSourcesSection');
    if (list) list.innerHTML = '';

    var hasAny = false;
    for (var srcId in settings.moddedXPSources) {
        if (!settings.moddedXPSources.hasOwnProperty(srcId)) continue;
        if (INTERNAL_XP_SOURCES[srcId]) continue;
        var src = settings.moddedXPSources[srcId];
        addModdedXPSourceUI(srcId, src.displayName || srcId, src.multiplier, src.cap, src.enabled);
        hasAny = true;
    }

    if (section) section.style.display = hasAny ? '' : 'none';
}

/**
 * C++ -> JS callback when a modded XP source is registered.
 */
window.onModdedXPSourceRegistered = function(dataStr) {
    try {
        var data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
        if (INTERNAL_XP_SOURCES[data.sourceId]) return;
        if (!settings.moddedXPSources[data.sourceId]) {
            settings.moddedXPSources[data.sourceId] = {
                displayName: data.displayName,
                enabled: data.enabled !== false,
                multiplier: data.multiplier || 100,
                cap: data.cap || 25
            };
        }
        addModdedXPSourceUI(data.sourceId, data.displayName,
            data.multiplier || 100, data.cap || 25, data.enabled !== false);
    } catch (e) {
        console.error('[SpellLearning] Failed to parse modded XP source data:', e);
    }
};
