/**
 * Growth Mode Utils Helpers - Shared utility methods for growth mode modules
 *
 * Extracted from growthModeUtils.js to keep files under 600 LOC.
 * Adds position map, settings helpers, layout utilities, and render helpers
 * to GrowthModeUtils.
 *
 * Loaded after: growthModeUtils.js
 *
 * Extends (global):
 * - GrowthModeUtils (adds helper and utility methods)
 */

// =========================================================================
// POSITION MAP (DUP-G10 partial)
// =========================================================================

/**
 * Build a position map (formId -> {x, y}) from layout data.
 * Identical logic was in Classic, Graph, Oracle, Thematic getPositionMap().
 *
 * @param {Object} layoutData - Layout data with .schools map
 * @returns {Object|null} Position map or null
 */
GrowthModeUtils.getPositionMap = function (layoutData) {
    if (!layoutData || !layoutData.schools) return null;
    var posMap = {};
    var schools = layoutData.schools;
    for (var name in schools) {
        if (!schools.hasOwnProperty(name)) continue;
        var nodes = schools[name].nodes || [];
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (n.formId) posMap[n.formId] = { x: n.x, y: n.y };
        }
    }
    return Object.keys(posMap).length > 0 ? posMap : null;
};

// =========================================================================
// SETTINGS COPY (DUP-G10 partial)
// =========================================================================

/**
 * Return a shallow copy of a settings object.
 * Identical logic was in all 5 modes' getSettings().
 *
 * @param {Object} settings - Settings object to copy
 * @returns {Object} Shallow copy
 */
GrowthModeUtils.shallowCopySettings = function (settings) {
    var copy = {};
    for (var key in settings) {
        if (settings.hasOwnProperty(key)) {
            copy[key] = settings[key];
        }
    }
    return copy;
};

// =========================================================================
// SETTINGS DELEGATION MIXIN (DUP-G8)
// =========================================================================

/**
 * Add standard TreeGrowth delegation methods to a settings module.
 * setTreeBuilt, setStatusText, updateScanStatus, _updateBuildButton
 * were copy-pasted across all 5 settings files.
 *
 * @param {Object}  settingsObj     - The settings module to extend
 * @param {boolean} [trackHasSpells] - If true, updateScanStatus sets this._hasSpells (graph/thematic variant)
 * @param {boolean} [addBuildButton] - If true, adds _updateBuildButton (classic/oracle/tree variant)
 */
GrowthModeUtils.mixinSettingsDelegation = function (settingsObj, trackHasSpells, addBuildButton) {
    settingsObj.setTreeBuilt = function (built, nodeCount, totalPool) {
        if (typeof TreeGrowth !== 'undefined') TreeGrowth.setTreeBuilt(built, nodeCount, totalPool);
    };
    settingsObj.setStatusText = function (text, color) {
        if (typeof TreeGrowth !== 'undefined') TreeGrowth.setStatusText(text, color);
    };
    settingsObj.updateScanStatus = function (hasSpells) {
        if (trackHasSpells) this._hasSpells = hasSpells;
        if (typeof TreeGrowth !== 'undefined') TreeGrowth.updateScanStatus(hasSpells);
    };
    if (addBuildButton) {
        settingsObj._updateBuildButton = function () {
            if (typeof TreeGrowth !== 'undefined') TreeGrowth.updateBuildButton();
        };
    }
};

// =========================================================================
// LAYOUT UTILITIES (DUP-G9)
// =========================================================================

/**
 * Simple string hash (DJB2 variant). Used by Classic, Oracle, Thematic layouts.
 *
 * @param {string} str
 * @returns {number} 32-bit hash
 */
GrowthModeUtils.hashString = function (str) {
    var hash = 0;
    if (!str) return hash;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash | 0;
    }
    return hash;
};

/**
 * Build a formId -> node lookup from an array of nodes.
 *
 * @param {Array} nodes
 * @returns {Object} lookup map
 */
GrowthModeUtils.buildNodeLookup = function (nodes) {
    var lookup = {};
    if (!nodes) return lookup;
    for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].formId != null) lookup[nodes[i].formId] = nodes[i];
    }
    return lookup;
};

/**
 * Get the current spell data array from global state.
 *
 * @returns {Array|null}
 */
GrowthModeUtils.getSpellData = function () {
    if (typeof state !== 'undefined' && state.lastSpellData && state.lastSpellData.spells) {
        return state.lastSpellData.spells;
    }
    return null;
};

// =========================================================================
// RENDER PLACEHOLDER (DUP-G10 partial)
// =========================================================================

/**
 * Draw a "scan to preview" placeholder message on a canvas.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 */
GrowthModeUtils.renderPlaceholder = function (ctx, w, h) {
    ctx.save();
    ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(184, 168, 120, 0.5)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('preview.scanToPreview'), w / 2, h / 2);
    ctx.restore();
};

// =========================================================================
// LAZY LAYOUT (shared render-time layout trigger)
// =========================================================================

/**
 * Perform lazy layout during render if tree data exists but layout is missing.
 * Returns the new layoutData or null if layout wasn't needed/possible.
 *
 * @param {Object} mode          - The growth mode object (has _treeData, _layoutData)
 * @param {Object} layoutModule  - Layout module with layoutAllSchools()
 * @param {Object} settingsModule - Settings module with setTreeBuilt()
 * @param {Object} baseData      - TreePreview output
 * @param {string} logPrefix     - For console logging
 * @returns {Object|null} New layoutData if lazy layout was performed
 */
GrowthModeUtils.tryLazyLayout = function (mode, layoutModule, settingsModule, baseData, logPrefix) {
    if (!mode._treeData || (mode._layoutData && mode._layoutData.schools)) return null;

    var layoutData = layoutModule.layoutAllSchools(mode._treeData, baseData, mode.settings);
    if (layoutData && layoutData.schools) {
        var totalNodes = 0;
        var s = layoutData.schools;
        for (var sn in s) {
            if (s.hasOwnProperty(sn)) totalNodes += s[sn].nodes ? s[sn].nodes.length : 0;
        }
        var lazyPool = 0;
        if (mode._treeData && mode._treeData.schools) {
            for (var lpn in mode._treeData.schools) {
                if (mode._treeData.schools.hasOwnProperty(lpn)) {
                    lazyPool += mode._treeData.schools[lpn].nodes ? mode._treeData.schools[lpn].nodes.length : 0;
                }
            }
        }
        console.log('[' + logPrefix + '] Lazy layout: ' + totalNodes + '/' + lazyPool + ' nodes positioned');
        settingsModule.setTreeBuilt(true, totalNodes, lazyPool);
        mode._layoutData = layoutData;
        return layoutData;
    }
    return null;
};
