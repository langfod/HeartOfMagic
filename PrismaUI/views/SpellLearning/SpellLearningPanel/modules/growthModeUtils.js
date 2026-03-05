/**
 * Growth Mode Shared Utilities
 *
 * Extracts common lifecycle methods from the 5 growth mode orchestrators
 * (Classic, Tree, Graph, Oracle, Thematic) to eliminate duplication.
 *
 * Shared: applyTree output building, buildTree preamble (filter chain),
 *         zoomToFit, loadTreeData counting.
 *
 * Extended by:
 * - growthModeUtilsHelpers.js (getPositionMap, shallowCopySettings,
 *     mixinSettingsDelegation, hashString, buildNodeLookup, getSpellData,
 *     renderPlaceholder, tryLazyLayout)
 *
 * Depends on: treeGrowth.js, treePreview.js, buildProgress.js, state.js
 */

var GrowthModeUtils = {

    // =========================================================================
    // APPLY TREE — shared output builder (DUP-G1)
    // =========================================================================

    /**
     * Build the standard applyTree output JSON and save it.
     *
     * Consolidates the ~120-line applyTree() body that was copy-pasted across
     * Classic, Graph, Oracle, and Thematic modes. Only the generator name and
     * optional per-node extra fields differ between modes.
     *
     * @param {Object}   treeData        - Raw tree structure from C++ backend
     * @param {Object}   layoutData      - Layout data with .schools map
     * @param {string}   generatorName   - e.g. 'ClassicGrowth', 'GraphGrowth'
     * @param {Object}   settingsModule  - The mode's Settings module (for setStatusText)
     * @param {Function} [extraNodeFieldsFn] - Optional callback(srcNode, outNode) to add mode-specific fields
     * @param {Function} [extraSchoolFieldsFn] - Optional callback(schoolName, srcSchool, outSchool) for mode-specific school fields
     * @param {Function} [extraLookupFn] - Optional callback(layoutSchools) to build extra lookups, returns object
     */
    buildApplyOutput: function (treeData, layoutData, generatorName, settingsModule, extraNodeFieldsFn, extraSchoolFieldsFn, extraLookupFn) {
        if (!treeData) return;

        // Build lookups from layout data
        var posLookup = {};
        var childrenLookup = {};
        var prereqLookup = {};
        var placedSet = {};

        if (layoutData && layoutData.schools) {
            var layoutSchools = layoutData.schools;
            for (var lsName in layoutSchools) {
                if (!layoutSchools.hasOwnProperty(lsName)) continue;
                var lsNodes = layoutSchools[lsName].nodes || [];
                for (var li = 0; li < lsNodes.length; li++) {
                    var ln = lsNodes[li];
                    posLookup[ln.formId] = { x: ln.x, y: ln.y };
                    placedSet[ln.formId] = true;

                    if (ln.parentFormId) {
                        if (!childrenLookup[ln.parentFormId]) childrenLookup[ln.parentFormId] = [];
                        childrenLookup[ln.parentFormId].push(ln.formId);

                        if (!prereqLookup[ln.formId]) prereqLookup[ln.formId] = [];
                        prereqLookup[ln.formId].push(ln.parentFormId);
                    }
                }
            }
        }

        // Allow modes to build extra lookups (e.g. themeColorLookup)
        var extraLookups = extraLookupFn ? extraLookupFn(layoutData ? layoutData.schools : null) : {};

        var posCount = Object.keys(posLookup).length;
        console.log('[' + generatorName + '] applyTree: posLookup=' + posCount +
                    ', placed=' + Object.keys(placedSet).length +
                    ', childrenEdges=' + Object.keys(childrenLookup).length);

        // Get base data for mode and root directions
        var baseData = null;
        if (typeof TreePreview !== 'undefined' && TreePreview.getOutput) {
            baseData = TreePreview.getOutput();
        }
        var layoutMode = baseData ? baseData.mode : 'sun';

        // Build output JSON
        var output = {
            version: treeData.version || '1.0',
            generator: 'PrismaUI ' + generatorName,
            generatedAt: new Date().toISOString(),
            trustPrereqs: true,
            noRotate: (layoutMode === 'flat'),
            layoutMode: layoutMode,
            config: treeData.config || {},
            globe: (typeof TreeCore !== 'undefined' && TreeCore.getOutput)
                ? TreeCore.getOutput()
                : { x: 0, y: 0, radius: 45 },
            schools: {}
        };

        if (treeData.seed) output.seed = treeData.seed;
        if (treeData.school_configs) output.school_configs = treeData.school_configs;

        // Get root directions from TreePreview baseData for spoke angles
        var rootDirBySchool = {};
        if (baseData && baseData.rootNodes) {
            for (var rni = 0; rni < baseData.rootNodes.length; rni++) {
                var rn = baseData.rootNodes[rni];
                if (rn.school && rn.dir !== undefined) {
                    rootDirBySchool[rn.school] = rn.dir;
                }
            }
        }
        var numSchools = Object.keys(treeData.schools || {}).length;
        var sliceAngle = numSchools > 0 ? 360 / numSchools : 60;

        var srcSchools = treeData.schools || {};
        for (var schoolName in srcSchools) {
            if (!srcSchools.hasOwnProperty(schoolName)) continue;
            var src = srcSchools[schoolName];
            var srcNodes = src.nodes || [];

            var schoolRootId = src.root || (srcNodes.length > 0 ? srcNodes[0].formId : '');
            var outNodes = [];
            var nodesWithPos = 0;

            for (var i = 0; i < srcNodes.length; i++) {
                var sn = srcNodes[i];

                if (!placedSet[sn.formId]) continue;

                var layoutChildren = childrenLookup[sn.formId] || [];
                var layoutPrereqs = prereqLookup[sn.formId] || [];

                var lockHardPrereqs = [];
                var lockData = [];
                if (sn.locks && sn.locks.length > 0) {
                    lockData = sn.locks;
                    lockHardPrereqs = sn.locks.map(function(l) { return l.nodeId; });
                }

                var outNode = {
                    formId: sn.formId,
                    children: layoutChildren,
                    prerequisites: layoutPrereqs,
                    hardPrereqs: lockHardPrereqs,
                    softPrereqs: layoutPrereqs,
                    softNeeded: layoutPrereqs.length > 0 ? 1 : 0,
                    tier: sn.tier || 1
                };
                if (lockData.length > 0) outNode.locks = lockData;
                if (sn.skillLevel) outNode.skillLevel = sn.skillLevel;
                if (sn.theme) outNode.theme = sn.theme;
                if (sn.name) outNode.name = sn.name;
                if (sn.section) outNode.section = sn.section;
                if (sn.formId === schoolRootId) {
                    outNode.isRoot = true;
                    outNode.prerequisites = [];
                    outNode.softPrereqs = [];
                    outNode.softNeeded = 0;
                }

                // Bake layout position
                var pos = posLookup[sn.formId];
                if (pos) {
                    outNode.x = Math.round(pos.x * 100) / 100;
                    outNode.y = Math.round(pos.y * 100) / 100;
                    nodesWithPos++;
                }

                // Apply mode-specific extra fields
                if (extraNodeFieldsFn) {
                    extraNodeFieldsFn(sn, outNode, extraLookups);
                }

                outNodes.push(outNode);
            }

            console.log('[' + generatorName + '] School "' + schoolName + '": ' +
                        outNodes.length + ' nodes, ' + nodesWithPos + ' with positions');

            var outSchool = {
                root: schoolRootId,
                layoutStyle: src.layoutStyle || generatorName.toLowerCase().replace('growth', ''),
                nodes: outNodes
            };

            if (src.color) outSchool.color = src.color;

            // Apply mode-specific school-level fields
            if (extraSchoolFieldsFn) {
                extraSchoolFieldsFn(schoolName, src, outSchool);
            }

            // Bake spoke angle from root direction
            var dirRad = rootDirBySchool[schoolName];
            if (dirRad !== undefined && !isNaN(dirRad)) {
                var spokeDeg = dirRad * 180 / Math.PI;
                outSchool.spokeAngle = Math.round(spokeDeg * 100) / 100;
                outSchool.startAngle = Math.round((spokeDeg - sliceAngle / 2) * 100) / 100;
                outSchool.endAngle = Math.round((spokeDeg + sliceAngle / 2) * 100) / 100;
                outSchool.rootDirection = dirRad;
            }

            output.schools[schoolName] = outSchool;
        }

        // Save to disk via C++
        window.callCpp('SaveSpellTree', JSON.stringify(output));

        // Load into the spell tree viewer
        if (typeof loadTreeData === 'function') {
            loadTreeData(output);
        }

        var appliedSchoolCount = Object.keys(output.schools).length;
        settingsModule.setStatusText('Tree applied (' + posCount + ' positioned)', '#22c55e');
        if (typeof updateScanStatus === 'function') updateScanStatus(t('status.treeApplied', {schools: appliedSchoolCount}), 'success');

        // Switch to the Spell Tree tab after a brief delay
        if (typeof switchTab === 'function') {
            setTimeout(function() {
                switchTab('spellTree');
            }, 300);
        }

        return posLookup;
    },

    // =========================================================================
    // BUILD TREE PREAMBLE — shared filter chain (DUP-G2)
    // =========================================================================

    /**
     * Common buildTree() preamble: validate spell data, reset state, show
     * progress modal, apply scan filters, gather grid hint.
     *
     * @param {Object} settingsModule - The mode's Settings module (for setStatusText)
     * @param {string} modeName       - e.g. 'ClassicGrowth', 'GraphGrowth'
     * @param {string} pendingFlag    - state property name, e.g. '_classicGrowthBuildPending'
     * @param {string} [buildBtnId]   - Optional DOM id for the build button to disable
     * @returns {Object|null} { spellsToProcess, gridHint } or null if validation failed
     */
    prepareBuild: function (settingsModule, modeName, pendingFlag, buildBtnId) {
        var spellData = (typeof state !== 'undefined' && state.lastSpellData)
            ? state.lastSpellData
            : null;

        if (!spellData || !spellData.spells || spellData.spells.length === 0) {
            settingsModule.setStatusText('No spells scanned \u2014 scan first', '#ef4444');
            return null;
        }

        // Reset _treeBuilt so setTreeBuilt(true) sees wasBuilt=false and PRM runs
        if (typeof TreeGrowth !== 'undefined') {
            TreeGrowth._treeBuilt = false;
        }

        // Show build progress modal
        var hasPRM = typeof PreReqMaster !== 'undefined' && PreReqMaster.isEnabled && PreReqMaster.isEnabled();
        if (typeof BuildProgress !== 'undefined') {
            BuildProgress.start(hasPRM);
        }

        settingsModule.setStatusText('Building tree (C++/' + modeName + ')...', '#f59e0b');

        if (buildBtnId) {
            var buildBtn = document.getElementById(buildBtnId);
            if (buildBtn) buildBtn.disabled = true;
        }

        // Set pending flag
        if (typeof state !== 'undefined' && pendingFlag) {
            state[pendingFlag] = true;
        }

        // Apply all scan filters: blacklist, whitelist, tome
        var spellsToProcess = spellData.spells;
        if (typeof filterBlacklistedSpells === 'function') {
            spellsToProcess = filterBlacklistedSpells(spellsToProcess);
        }
        if (typeof filterWhitelistedSpells === 'function') {
            spellsToProcess = filterWhitelistedSpells(spellsToProcess);
        }
        var tomeToggle = document.getElementById('scanModeTomes');
        if (tomeToggle && tomeToggle.checked && typeof state !== 'undefined' && state.tomedSpellIds) {
            var tomedIds = state.tomedSpellIds;
            spellsToProcess = spellsToProcess.filter(function(s) {
                return tomedIds[s.formId || s.id];
            });
        }
        console.log('[' + modeName + '] Filtered spells: ' + spellsToProcess.length + '/' + spellData.spells.length);

        // Gather grid layout info
        var gridHint = null;
        if (typeof TreePreview !== 'undefined' && TreePreview.getOutput) {
            var previewOut = TreePreview.getOutput();
            if (previewOut) {
                var avgPts = 0;
                var schoolCount = previewOut.schools ? previewOut.schools.length : 0;
                if (previewOut.gridPoints && schoolCount > 0) {
                    avgPts = Math.round(previewOut.gridPoints.length / schoolCount);
                }
                gridHint = {
                    mode: previewOut.mode || 'sun',
                    schoolCount: schoolCount,
                    avgPointsPerSchool: avgPts
                };
            }
        }

        return {
            spellsToProcess: spellsToProcess,
            gridHint: gridHint,
            totalSpells: spellData.spells.length
        };
    },

    // =========================================================================
    // ZOOM TO FIT (DUP-G3)
    // =========================================================================

    /**
     * Auto-zoom the Growth canvas so the full tree is visible with padding.
     *
     * @param {Object} layoutData - Layout data with .schools map containing nodes with x/y
     * @param {string} [logPrefix] - Log prefix, e.g. 'ClassicGrowth'
     */
    zoomToFit: function (layoutData, logPrefix) {
        if (!layoutData || !layoutData.schools) return;
        if (typeof TreeGrowth === 'undefined') return;

        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        var schools = layoutData.schools;
        var nodeCount = 0;
        for (var name in schools) {
            if (!schools.hasOwnProperty(name)) continue;
            var nodes = schools[name].nodes || [];
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].x < minX) minX = nodes[i].x;
                if (nodes[i].x > maxX) maxX = nodes[i].x;
                if (nodes[i].y < minY) minY = nodes[i].y;
                if (nodes[i].y > maxY) maxY = nodes[i].y;
                nodeCount++;
            }
        }
        if (nodeCount === 0) return;

        var treeW = maxX - minX;
        var treeH = maxY - minY;
        if (treeW < 1) treeW = 100;
        if (treeH < 1) treeH = 100;

        var padding = 1.15;
        var canvasW = TreeGrowth._width || 400;
        var canvasH = TreeGrowth._height || 400;
        var zoomX = canvasW / (treeW * padding);
        var zoomY = canvasH / (treeH * padding);
        var zoom = Math.min(zoomX, zoomY, 2.0);
        zoom = Math.max(zoom, 0.1);

        var centerX = (minX + maxX) / 2;
        var centerY = (minY + maxY) / 2;

        TreeGrowth.zoom = zoom;
        TreeGrowth.panX = -centerX * zoom;
        TreeGrowth.panY = -centerY * zoom;

        if (logPrefix) {
            console.log('[' + logPrefix + '] Zoom to fit: zoom=' + zoom.toFixed(2) +
                ' bounds=' + Math.round(treeW) + 'x' + Math.round(treeH) +
                ' center=' + Math.round(centerX) + ',' + Math.round(centerY));
        }
    },

    // =========================================================================
    // LOAD TREE DATA — shared counting logic (DUP-G4)
    // =========================================================================

    /**
     * Common loadTreeData counting logic: attempt layout, count nodes, update status.
     *
     * @param {Object} data           - Raw tree structure from the backend
     * @param {Object} layoutModule   - Layout module with layoutAllSchools(data, baseData, settings)
     * @param {Object} settingsModule - Settings module with setTreeBuilt(built, count, pool)
     * @param {Object} modeSettings   - The mode's settings object
     * @param {string} logPrefix      - Log prefix, e.g. 'ClassicGrowth'
     * @returns {Object|null} layoutData result (also sets it on the mode object if provided)
     */
    processLoadedTree: function (data, layoutModule, settingsModule, modeSettings, logPrefix) {
        var baseData = null;
        if (typeof TreePreview !== 'undefined' && TreePreview.getOutput) {
            baseData = TreePreview.getOutput();
        }
        console.log('[' + logPrefix + '] baseData:', baseData ? 'present' : 'null',
            baseData ? ('mode=' + baseData.mode + ' schools=' + (baseData.schools ? baseData.schools.length : 0) +
            ' rootNodes=' + (baseData.rootNodes ? baseData.rootNodes.length : 0)) : '');

        var layoutData = null;
        if (baseData) {
            layoutData = layoutModule.layoutAllSchools(data, baseData, modeSettings);
            console.log('[' + logPrefix + '] layoutData:', layoutData ? Object.keys(layoutData.schools || {}) : 'null');
        } else {
            console.warn('[' + logPrefix + '] No baseData from TreePreview -- layout skipped');
        }

        // Count positioned nodes vs total pool
        var totalNodes = 0;
        var totalPool = 0;
        if (layoutData && layoutData.schools) {
            var schools = layoutData.schools;
            for (var name in schools) {
                if (schools.hasOwnProperty(name)) {
                    totalNodes += schools[name].nodes ? schools[name].nodes.length : 0;
                    console.log('[' + logPrefix + '] School ' + name + ': ' + (schools[name].nodes ? schools[name].nodes.length : 0) + ' nodes');
                }
            }
        }
        if (data && data.schools) {
            for (var pn in data.schools) {
                if (data.schools.hasOwnProperty(pn)) {
                    totalPool += data.schools[pn].nodes ? data.schools[pn].nodes.length : 0;
                }
            }
        }
        console.log('[' + logPrefix + '] Total positioned nodes: ' + totalNodes + '/' + totalPool);

        settingsModule.setTreeBuilt(true, totalNodes, totalPool);

        return layoutData;
    }
};

window.GrowthModeUtils = GrowthModeUtils;
