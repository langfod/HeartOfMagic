/**
 * Tree Growth — TREE Mode (Core)
 *
 * Trunk-first tree building system. Defines a trunk corridor from the root
 * line, uses a 3-section allocation bar (Branches / Trunk / Root), and shows
 * live ghost node preview of trunk filling (layer-by-layer, bottom-up).
 *
 * Delegates to sub-modules:
 *   - TreeSettings:  Settings panel UI + allocation bar
 *   - TreeTrunk:     Corridor computation + grid point filtering
 *   - TreeRenderer:  Canvas drawing (corridors + ghost nodes)
 *
 * This is the core declaration. Extension files add methods:
 *   - treeGrowthTreeRender.js:  Rendering + cache + layout orchestrator
 *   - treeGrowthTreeLayout.js:  Grid building + trunk placement
 *   - treeGrowthTreeAnim.js:    Branch/root growth + state + registerMode
 *
 * Self-registers with TreeGrowth via registerMode() (in treeGrowthTreeAnim.js).
 * Depends on: tree/treeSettings.js, tree/treeTrunk.js, tree/treeRenderer.js
 */

var TreeGrowthTree = {

    settings: {
        ghostOpacity: 35,
        nodeRadius: 5,
        trunkThickness: 70,
        branchSpread: 2.5,
        rootSpread: 2.5,
        pctBranches: 30,
        pctTrunk: 50,
        pctRoot: 20
    },

    // Placement cache — only recompute when baseData or settings change
    _cache: null,
    _lastCacheKey: '',

    // Built tree data (from C++ backend)
    _treeData: null,
    _builtPlacements: null,
    _builtLayoutKey: '',

    // =========================================================================
    // SETTINGS UI — delegates to TreeSettings
    // =========================================================================

    buildSettingsHTML: function() {
        if (typeof TreeSettings !== 'undefined') {
            return TreeSettings.buildHTML(this.settings);
        }
        return '<div class="tree-preview-empty">TreeSettings module not loaded</div>';
    },

    bindEvents: function() {
        var self = this;

        if (typeof TreeSettings === 'undefined') return;

        TreeSettings.bindEvents({
            onBuild: function() { self.buildTree(); },
            onApply: function() { self.applyTree(); },
            onClear: function() { self.clearTree(); },
            onSettingChanged: function(key, value) {
                self.settings[key] = value;
                self._cache = null;
                self._builtPlacements = null;
                self._builtLayoutKey = '';
                self._markDirty();
            },
            onAllocationChanged: function(pctBranches, pctTrunk, pctRoot) {
                self.settings.pctBranches = pctBranches;
                self.settings.pctTrunk = pctTrunk;
                self.settings.pctRoot = pctRoot;
                self._cache = null;
                self._builtPlacements = null;
                self._builtLayoutKey = '';
                self._markDirty();
            }
        });
    },

    // =========================================================================
    // TREE BUILDING FLOW
    // =========================================================================

    buildTree: function() {
        var spellData = (typeof state !== 'undefined' && state.lastSpellData)
            ? state.lastSpellData : null;

        if (!spellData || !spellData.spells || spellData.spells.length === 0) {
            TreeSettings.setStatusText('No spells scanned \u2014 scan first', '#ef4444');
            return;
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

        TreeSettings.setStatusText('Building tree (C++)...', '#f59e0b');
        if (typeof updateScanStatus === 'function') updateScanStatus(t('status.buildingTree'), 'working');
        var buildBtn = document.getElementById('tgTreeBuildBtn');
        if (buildBtn) buildBtn.disabled = true;

        // Set pending flag so onProceduralTreeComplete routes result here
        if (typeof state !== 'undefined') {
            state._treeGrowthBuildPending = true;
        }

        var baseData = null;
        if (typeof TreePreview !== 'undefined' && TreePreview.getOutput) {
            baseData = TreePreview.getOutput();
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
        console.log('[TreeGrowthTree] Filtered spells: ' + spellsToProcess.length + '/' + spellData.spells.length);

        var config = {
            mode: 'tree',
            trunkThickness: this.settings.trunkThickness,
            pctBranches: this.settings.pctBranches,
            pctTrunk: this.settings.pctTrunk,
            pctRoot: this.settings.pctRoot,
            baseMode: baseData ? baseData.mode : 'sun',
            max_children_per_node: 4,
            top_themes_per_school: 8,
            convergence_chance: 0.3,
            prefer_vanilla_roots: true,
            selected_roots: TreePreview._flattenSelectedRoots()
        };

        // Defer to let UI render progress modal before blocking on JSON.stringify
        setTimeout(function() {
            window.callCpp('ProceduralTreeGenerate', JSON.stringify({
                command: 'build_tree',
                spells: spellsToProcess,
                config: config
            }));
        }, 0);
    },

    loadTreeData: function(data) {
        this._treeData = data;
        console.log('[TreeGrowthTree] loadTreeData, schools:',
            data && data.schools ? Object.keys(data.schools) : 'none');

        // Count total nodes
        var totalNodes = 0;
        if (data && data.schools) {
            for (var name in data.schools) {
                if (data.schools.hasOwnProperty(name)) {
                    var sd = data.schools[name];
                    totalNodes += sd.nodes ? sd.nodes.length : 0;
                }
            }
        }

        TreeSettings.setTreeBuilt(true, totalNodes);
        this._cache = null;
        this._markDirty();
    },

    applyTree: function() {
        if (!this._treeData) return;

        // Compute layout positions so we can bake x/y into saved nodes.
        // EditMode reads node.x / node.y for drag-and-drop repositioning.
        var baseData = null;
        if (typeof TreePreview !== 'undefined' && TreePreview.getOutput) {
            baseData = TreePreview.getOutput();
        }
        var layout = baseData ? this._computeBuiltLayout(baseData) : null;

        // Build formId -> {x, y} lookup from layout results
        var posLookup = {};
        if (layout && layout.posMap) {
            posLookup = layout.posMap;
        }

        // LOG: How many positions did we get?
        var posCount = Object.keys(posLookup).length;
        console.log('[applyTree] layout=' + (layout ? 'yes' : 'null') +
                    ', posMap keys=' + posCount +
                    ', baseData=' + (baseData ? baseData.mode : 'null'));
        if (window.callCpp) {
            window.callCpp('LogMessage', JSON.stringify({
                message: '[applyTree] posMap keys=' + posCount + ', baseData mode=' + (baseData ? baseData.mode : 'null'),
                level: 'info'
            }));
        }

        // Re-center positions around (0,0) for the canvasRenderer.
        // Layout positions are in preview canvas coordinates (origin
        // at top-left, tree center at ~w/2,h/2). The wheel/canvas
        // renderer expects world coords centered at (0,0).
        var posKeys = Object.keys(posLookup);
        if (posKeys.length > 0) {
            var sumX = 0, sumY = 0;
            for (var pk = 0; pk < posKeys.length; pk++) {
                sumX += posLookup[posKeys[pk]].x;
                sumY += posLookup[posKeys[pk]].y;
            }
            var cx = sumX / posKeys.length;
            var cy = sumY / posKeys.length;
            for (var pk2 = 0; pk2 < posKeys.length; pk2++) {
                posLookup[posKeys[pk2]].x -= cx;
                posLookup[posKeys[pk2]].y -= cy;
            }
        }

        // Build layout-derived edge lookups from parentMap
        // This replaces C++ NLP edges with edges that match the visual layout
        var childrenLookup = {};
        var prereqLookup = {};
        if (layout && layout.parentMap) {
            for (var pmId in layout.parentMap) {
                if (!layout.parentMap.hasOwnProperty(pmId)) continue;
                var pmParent = layout.parentMap[pmId];
                if (!childrenLookup[pmParent]) childrenLookup[pmParent] = [];
                childrenLookup[pmParent].push(pmId);
                if (!prereqLookup[pmId]) prereqLookup[pmId] = [];
                prereqLookup[pmId].push(pmParent);
            }
        }
        var hasLayoutEdges = layout && layout.parentMap && Object.keys(layout.parentMap).length > 0;

        // Bake school sector data from TreePreview so the wheel renderer
        // can use exact angles/colors instead of guessing from node positions.
        var sectorLookup = {};
        if (baseData && baseData.schools) {
            for (var si = 0; si < baseData.schools.length; si++) {
                var bs = baseData.schools[si];
                sectorLookup[bs.name] = {
                    color: bs.color,
                    arcStart: bs.arcStart,
                    arcSize: bs.arcSize
                };
            }
        }

        // Bake root node directions (both sun and flat output dir on roots).
        // The wheel renderer uses this for school rotation when no arc data.
        var rootDirLookup = {};
        if (baseData && baseData.rootNodes) {
            for (var rdi = 0; rdi < baseData.rootNodes.length; rdi++) {
                var rdn = baseData.rootNodes[rdi];
                if (rdn.school && rdn.dir !== undefined) {
                    rootDirLookup[rdn.school] = rdn.dir;
                }
            }
        }

        // Convert built tree data into spell_tree.json format
        var output = {
            version: '1.0',
            generator: 'PrismaUI TreeGrowth',
            generatedAt: new Date().toISOString(),
            trustPrereqs: true, // Skip TreeParser prereq mutations — data is authoritative
            config: {
                trunkThickness: this.settings.trunkThickness,
                pctBranches: this.settings.pctBranches,
                pctTrunk: this.settings.pctTrunk,
                pctRoot: this.settings.pctRoot,
                layoutMode: baseData ? baseData.mode : 'sun',
                ringRadius: baseData && baseData.grid ? baseData.grid.ringRadius : 120
            },
            globe: (typeof TreeCore !== 'undefined' && TreeCore.getOutput)
                ? TreeCore.getOutput()
                : { x: 0, y: 0, radius: 45 },
            schools: {}
        };

        var srcSchools = this._treeData.schools || {};
        for (var schoolName in srcSchools) {
            if (!srcSchools.hasOwnProperty(schoolName)) continue;
            var src = srcSchools[schoolName];
            var srcNodes = src.nodes || [];

            var schoolRootId = src.root || (srcNodes.length > 0 ? srcNodes[0].formId : '');
            var outNodes = [];
            for (var i = 0; i < srcNodes.length; i++) {
                var sn = srcNodes[i];

                // Skip unpositioned nodes when layout edges exist
                // (they weren't placed by the layout engine)
                if (hasLayoutEdges && !posLookup[sn.formId]) continue;

                // Use layout-derived edges when available, fall back to C++ NLP edges
                var layoutChildren = hasLayoutEdges ? (childrenLookup[sn.formId] || []) : (sn.children || []);
                var layoutPrereqs = hasLayoutEdges ? (prereqLookup[sn.formId] || []) : (sn.prerequisites || []);

                // Prereq rework: regular prereqs = soft (need any 1 of N)
                // Lock prereqs = hard (mandatory)
                var lockHardPrereqs = [];
                var lockData = [];
                // Locks are stored directly on the node by PreReqMaster
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
                if (sn.formId === schoolRootId) {
                    outNode.isRoot = true;
                    // Root nodes are school entry points — never assign prerequisites
                    outNode.prerequisites = [];
                    outNode.softPrereqs = [];
                    outNode.softNeeded = 0;
                }

                // Bake layout position if computed
                var pos = posLookup[sn.formId];
                if (pos) {
                    outNode.x = Math.round(pos.x * 100) / 100;
                    outNode.y = Math.round(pos.y * 100) / 100;
                }
                outNodes.push(outNode);
            }

            // LOG: Per-school position stats
            var schoolWithPos = 0;
            for (var ni = 0; ni < outNodes.length; ni++) {
                if (outNodes[ni].x !== undefined || outNodes[ni].y !== undefined) schoolWithPos++;
            }
            var logMsg = '[applyTree] School "' + schoolName + '": ' + outNodes.length +
                         ' nodes, ' + schoolWithPos + ' with x/y';
            if (outNodes.length > 0) {
                var s0 = outNodes[0];
                logMsg += ', first={x:' + s0.x + ',y:' + s0.y + ',id:' + s0.formId + '}';
            }
            console.log(logMsg);
            if (window.callCpp) {
                window.callCpp('LogMessage', JSON.stringify({ message: logMsg, level: 'info' }));
            }

            // Bake sector angles from TreePreview
            var sector = sectorLookup[schoolName];
            var schoolOut = {
                root: schoolRootId,
                layoutStyle: src.layoutStyle || 'tree',
                nodes: outNodes
            };
            if (sector) {
                schoolOut.color = sector.color;
                schoolOut.arcStart = sector.arcStart;
                schoolOut.arcSize = sector.arcSize;
                // Spoke angle = center of arc (radians -> degrees for renderer)
                schoolOut.spokeAngle = (sector.arcStart + sector.arcSize / 2) * 180 / Math.PI;
                schoolOut.startAngle = sector.arcStart * 180 / Math.PI;
                schoolOut.endAngle = (sector.arcStart + sector.arcSize) * 180 / Math.PI;
            }

            // Bake root direction (works for both sun and flat modes).
            // Wheel renderer uses this for school sector rotation when
            // arc data is missing (flat mode has no arcs, only directions).
            if (rootDirLookup[schoolName] !== undefined) {
                schoolOut.rootDirection = rootDirLookup[schoolName];
                // If no sector data (flat mode), derive spokeAngle from direction
                if (!sector) {
                    schoolOut.spokeAngle = rootDirLookup[schoolName] * 180 / Math.PI;
                }
            }

            output.schools[schoolName] = schoolOut;
        }

        // Save to disk via C++
        window.callCpp('SaveSpellTree', JSON.stringify(output));

        // Load into the spell tree viewer so it displays immediately
        if (typeof loadTreeData === 'function') {
            loadTreeData(output);
        }

        var schoolCount = Object.keys(output.schools).length;
        TreeSettings.setStatusText('Tree applied (' + schoolCount + ' schools)', '#22c55e');
        if (typeof updateScanStatus === 'function') updateScanStatus(t('status.treeApplied', {schools: schoolCount}), 'success');

        // Switch to the Spell Tree tab after a brief delay
        if (typeof switchTab === 'function') {
            setTimeout(function() {
                switchTab('spellTree');
            }, 300);
        }
    },

    /**
     * Return the current layout position map (formId -> {x, y}) for preview rendering.
     * Returns null if no tree has been built yet.
     */
    getPositionMap: function() {
        return this._builtPlacements ? this._builtPlacements.posMap || null : null;
    },

    clearTree: function() {
        this._treeData = null;
        this._builtPlacements = null;
        this._builtLayoutKey = '';
        this._cache = null;
        TreeSettings.setTreeBuilt(false);
        if (typeof updateScanStatus === 'function') updateScanStatus(t('status.treeCleared'));
        this._markDirty();
    }
};

// =========================================================================
// LAYOUT SCORING HELPERS
// =========================================================================

/**
 * Score a candidate grid point for placement.
 * @param {Array} schoolPts - The school grid points array
 * @param {number} ptIdx - Index into schoolPts
 * @param {number} parentPosX - Parent position X
 * @param {number} parentPosY - Parent position Y
 * @param {number} gDx - Growth direction X
 * @param {number} gDy - Growth direction Y
 * @param {Array} sibDirs - Array of sibling direction vectors
 * @returns {number} Score value (higher = better candidate)
 */
TreeGrowthTree._scoreCandidate = function(schoolPts, ptIdx, parentPosX, parentPosY, gDx, gDy, sibDirs) {
    var cdx = schoolPts[ptIdx].x - parentPosX;
    var cdy = schoolPts[ptIdx].y - parentPosY;
    var cLen = Math.sqrt(cdx * cdx + cdy * cdy);
    if (cLen > 0) { cdx /= cLen; cdy /= cLen; }
    var outward = cdx * gDx + cdy * gDy;
    var separation = 0;
    if (sibDirs.length > 0) {
        var minSep = 2;
        for (var sd = 0; sd < sibDirs.length; sd++) {
            var dot = cdx * sibDirs[sd].dx + cdy * sibDirs[sd].dy;
            if (dot < minSep) minSep = dot;
        }
        separation = -minSep;
    }
    if (sibDirs.length === 0) {
        return outward;
    }
    return separation * 2.0 + outward * 0.3;
};

/**
 * Record a sibling placement direction for spread scoring.
 * @param {Array} schoolPts - The school grid points array
 * @param {number} ptIdx - Index into schoolPts
 * @param {number} parentPosX - Parent position X
 * @param {number} parentPosY - Parent position Y
 * @param {Array} sibDirs - Array to push direction vector into
 */
TreeGrowthTree._recordSibDir = function(schoolPts, ptIdx, parentPosX, parentPosY, sibDirs) {
    var sdx = schoolPts[ptIdx].x - parentPosX;
    var sdy = schoolPts[ptIdx].y - parentPosY;
    var sLen = Math.sqrt(sdx * sdx + sdy * sdy);
    if (sLen > 0) {
        sibDirs.push({ dx: sdx / sLen, dy: sdy / sLen });
    }
};

// =========================================================================
// NODE TREE PREPARATION
// =========================================================================

/**
 * Build node lookup, subtree sizes, and root child split.
 * @param {Object} ctx - Per-school layout context
 */
TreeGrowthTree._prepareNodeTree = function(ctx) {
    var allTreeNodes = ctx.allTreeNodes;
    var numRoots = ctx.numRoots;

    // Build node lookup
    var nodeLookup = {};
    for (var ni = 0; ni < allTreeNodes.length; ni++) {
        nodeLookup[allTreeNodes[ni].formId] = allTreeNodes[ni];
    }

    // Find root spell
    var rootSpellId = null;
    for (var rfi = 0; rfi < allTreeNodes.length; rfi++) {
        if (!allTreeNodes[rfi].prerequisites || allTreeNodes[rfi].prerequisites.length === 0) {
            rootSpellId = allTreeNodes[rfi].formId;
            break;
        }
    }
    if (!rootSpellId) rootSpellId = allTreeNodes[0].formId;

    // Compute subtree sizes
    var subtreeSize = {};
    var computeSubSize = function(id) {
        if (subtreeSize[id] !== undefined) return subtreeSize[id];
        var nd = nodeLookup[id];
        if (!nd || !nd.children || nd.children.length === 0) {
            subtreeSize[id] = 1;
            return 1;
        }
        var sum = 1;
        for (var ssi = 0; ssi < nd.children.length; ssi++) {
            sum += computeSubSize(nd.children[ssi]);
        }
        subtreeSize[id] = sum;
        return sum;
    };
    computeSubSize(rootSpellId);

    // Split root children among root positions (round-robin)
    var rootChildSplit = null;
    var childToRootIdx = {};
    if (numRoots > 1 && nodeLookup[rootSpellId]) {
        var origRootChildren = nodeLookup[rootSpellId].children || [];
        rootChildSplit = [];
        for (var rcbi = 0; rcbi < numRoots; rcbi++) rootChildSplit.push([]);
        for (var rcri = 0; rcri < origRootChildren.length; rcri++) {
            var assignedRoot = rcri % numRoots;
            rootChildSplit[assignedRoot].push(origRootChildren[rcri]);
            childToRootIdx[origRootChildren[rcri]] = assignedRoot;
        }
        console.log('[TreeGrowthTree] ' + ctx.schoolName + ': split ' +
            origRootChildren.length + ' root children among ' + numRoots + ' roots');
    }

    // Compute allocation targets
    var trunkTarget = Math.round(allTreeNodes.length * ctx.settings.pctTrunk / 100);
    var branchTarget = Math.round(allTreeNodes.length * ctx.settings.pctBranches / 100);
    var rootGrowthTarget = Math.round(allTreeNodes.length * ctx.settings.pctRoot / 100);

    // Store on context
    ctx.nodeLookup = nodeLookup;
    ctx.rootSpellId = rootSpellId;
    ctx.subtreeSize = subtreeSize;
    ctx.rootChildSplit = rootChildSplit;
    ctx.childToRootIdx = childToRootIdx;
    ctx.trunkTarget = trunkTarget;
    ctx.branchTarget = branchTarget;
    ctx.rootGrowthTarget = rootGrowthTarget;
    ctx.maxPlaceable = trunkTarget + branchTarget + rootGrowthTarget + 1;
};

// =========================================================================
// ROOT NODE PLACEMENT
// =========================================================================

/**
 * Place the root spell node at the first root grid position.
 * @param {Object} ctx - Per-school layout context
 */
TreeGrowthTree._placeRootNode = function(ctx) {
    var schoolPts = ctx.schoolPts;
    var rootLocalIdx = ctx.rootLocalIdx;
    var rootPos = ctx.rootPos;

    schoolPts[rootLocalIdx].used = true;
    ctx.posMap[ctx.rootSpellId] = { x: rootPos.x, y: rootPos.y };
    ctx.gridIdxMap[ctx.rootSpellId] = rootLocalIdx;
    ctx.placedCount = 1;

    ctx.allNodes.push({
        x: rootPos.x, y: rootPos.y,
        color: ctx.schoolColor,
        skillLevel: ctx.nodeLookup[ctx.rootSpellId] ? ctx.nodeLookup[ctx.rootSpellId].skillLevel || '' : ''
    });

    ctx.dirMap[ctx.rootSpellId] = { dx: ctx.gdx, dy: ctx.gdy };
};
