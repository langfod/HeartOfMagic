/**
 * Tree Growth — TREE Mode (Orchestrator)
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
 * Self-registers with TreeGrowth via registerMode().
 * Depends on: tree/treeSettings.js, tree/treeTrunk.js, tree/treeRenderer.js
 */

var TreeGrowthTree = {

    settings: {
        ghostOpacity: 35,
        nodeRadius: 5,
        trunkThickness: 40,
        pctBranches: 30,
        pctTrunk: 50,
        pctRoot: 20
    },

    // Placement cache — only recompute when baseData or settings change
    _cache: null,
    _lastCacheKey: '',

    // Built tree data (from Python backend)
    _treeData: null,
    _builtPlacements: null,

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
            onSetupPython: function() { window.callCpp('SetupPython', ''); },
            onSettingChanged: function(key, value) {
                self.settings[key] = value;
                self._cache = null;
                self._markDirty();
            },
            onAllocationChanged: function(pctBranches, pctTrunk, pctRoot) {
                self.settings.pctBranches = pctBranches;
                self.settings.pctTrunk = pctTrunk;
                self.settings.pctRoot = pctRoot;
                self._cache = null;
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

        TreeSettings.setStatusText('Building tree (Python)...', '#f59e0b');
        var buildBtn = document.getElementById('tgTreeBuildBtn');
        if (buildBtn) buildBtn.disabled = true;

        // Set pending flag so onProceduralPythonComplete routes result here
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
            prefer_vanilla_roots: true
        };

        window.callCpp('ProceduralPythonGenerate', JSON.stringify({
            spells: spellsToProcess,
            config: config
        }));
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

        // Build formId → {x, y} lookup from layout results
        var posLookup = {};
        if (layout && layout.posMap) {
            posLookup = layout.posMap;
        }

        // Convert built tree data into spell_tree.json format
        var output = {
            version: '1.0',
            generator: 'PrismaUI TreeGrowth',
            generatedAt: new Date().toISOString(),
            config: {
                trunkThickness: this.settings.trunkThickness,
                pctBranches: this.settings.pctBranches,
                pctTrunk: this.settings.pctTrunk,
                pctRoot: this.settings.pctRoot
            },
            schools: {}
        };

        var srcSchools = this._treeData.schools || {};
        for (var schoolName in srcSchools) {
            if (!srcSchools.hasOwnProperty(schoolName)) continue;
            var src = srcSchools[schoolName];
            var srcNodes = src.nodes || [];

            var outNodes = [];
            for (var i = 0; i < srcNodes.length; i++) {
                var sn = srcNodes[i];
                var outNode = {
                    formId: sn.formId,
                    children: sn.children || [],
                    prerequisites: sn.prerequisites || [],
                    tier: sn.tier || 1
                };
                if (sn.skillLevel) outNode.skillLevel = sn.skillLevel;
                if (sn.theme) outNode.theme = sn.theme;
                if (sn.name) outNode.name = sn.name;

                // Bake layout position if computed
                var pos = posLookup[sn.formId];
                if (pos) {
                    outNode.x = Math.round(pos.x * 100) / 100;
                    outNode.y = Math.round(pos.y * 100) / 100;
                }
                outNodes.push(outNode);
            }

            output.schools[schoolName] = {
                root: src.root || (srcNodes.length > 0 ? srcNodes[0].formId : ''),
                layoutStyle: src.layoutStyle || 'tree',
                nodes: outNodes
            };
        }

        window.callCpp('SaveSpellTree', JSON.stringify(output));
        TreeSettings.setStatusText('Tree saved (' +
            Object.keys(output.schools).length + ' schools)', '#22c55e');
    },

    clearTree: function() {
        this._treeData = null;
        this._builtPlacements = null;
        this._cache = null;
        TreeSettings.setTreeBuilt(false);
        this._markDirty();
    },

    // =========================================================================
    // RENDER
    // =========================================================================

    render: function(ctx, w, h, baseData) {
        if (!baseData) {
            ctx.font = '12px sans-serif';
            ctx.fillStyle = 'rgba(184, 168, 120, 0.4)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Scan spells to see preview', w / 2, h / 2);
            return;
        }

        // 1. Render base grid + root nodes underneath
        baseData.renderGrid(ctx, w, h);

        // 2. Compute or retrieve cached trunk data
        var computed = this._getOrCompute(baseData, w, h);
        if (!computed) return;

        var cx = w / 2;
        var cy = h / 2;
        var opacity = this.settings.ghostOpacity / 100;

        // 3. Render trunk corridors (always visible)
        if (typeof TreeRenderer !== 'undefined' && computed.corridors) {
            TreeRenderer.renderCorridors(ctx, cx, cy, computed.corridors, opacity);
        }

        if (this._treeData) {
            // 4a. Tree is built — show edges + positioned nodes
            var layout = this._computeBuiltLayout(baseData);
            if (layout && typeof TreeRenderer !== 'undefined') {
                TreeRenderer.renderEdges(ctx, cx, cy, layout.edges, opacity);
                TreeRenderer.renderNodes(
                    ctx, cx, cy, layout.nodes,
                    opacity, this.settings.nodeRadius
                );
            }
        } else {
            // 4b. No tree yet — show ghost node preview (trunk fill)
            if (typeof TreeRenderer !== 'undefined' && computed.placements) {
                TreeRenderer.renderGhostNodes(
                    ctx, cx, cy, computed.placements,
                    opacity, this.settings.nodeRadius
                );
            }
        }
    },

    // =========================================================================
    // CACHE
    // =========================================================================

    _buildCacheKey: function(baseData) {
        var s = this.settings;
        var parts = [
            baseData.mode,
            JSON.stringify(baseData.grid),
            baseData.rootNodes.length,
            s.trunkThickness,
            s.pctBranches,
            s.pctTrunk,
            s.pctRoot
        ];
        var sd = baseData.schoolData;
        if (sd) {
            var keys = [];
            for (var k in sd) {
                if (sd.hasOwnProperty(k)) keys.push(k + ':' + sd[k]);
            }
            keys.sort();
            parts.push(keys.join(','));
        }
        for (var ri = 0; ri < baseData.rootNodes.length; ri++) {
            var rn = baseData.rootNodes[ri];
            parts.push(Math.round(rn.x) + ',' + Math.round(rn.y));
        }
        return parts.join('|');
    },

    _getOrCompute: function(baseData, w, h) {
        var key = this._buildCacheKey(baseData);
        if (this._cache && this._lastCacheKey === key) {
            return this._cache;
        }

        if (typeof TreeTrunk === 'undefined') return null;

        var mode = baseData.mode;
        var schools = baseData.schools;
        var rootNodes = baseData.rootNodes;
        var grid = baseData.grid;
        var gridPoints = baseData.gridPoints || [];
        var schoolData = baseData.schoolData;
        if (!grid || !schools || schools.length === 0) return null;

        // 1. Compute trunk corridors
        var corridors = TreeTrunk.computeCorridors(
            mode, schools, rootNodes, grid, this.settings.trunkThickness
        );

        // 2. For each corridor, filter actual grid points and fill trunk
        var allPlacements = [];
        for (var ci = 0; ci < corridors.length; ci++) {
            var corridor = corridors[ci];
            var schoolName = corridor.school;
            var totalSpells = schoolData[schoolName] || 0;
            var trunkCount = Math.round(totalSpells * this.settings.pctTrunk / 100);

            if (trunkCount === 0) continue;

            // Filter actual grid points caught inside corridor
            var captured = TreeTrunk.getGridPointsInCorridor(
                corridor, gridPoints, trunkCount + 50
            );

            // Fill layer by layer (closest to root first)
            var placements = TreeTrunk.fillLayerByLayer(captured, trunkCount);
            for (var pi = 0; pi < placements.length; pi++) {
                allPlacements.push(placements[pi]);
            }
        }

        // 3. Update allocation display with actual spell counts
        if (typeof TreeSettings !== 'undefined' && TreeSettings._updateAllocationDisplay) {
            // Sum total across all schools for display
            var totalAll = 0;
            for (var sk in schoolData) {
                if (schoolData.hasOwnProperty(sk)) totalAll += schoolData[sk];
            }
            TreeSettings._updateAllocationDisplay(
                this.settings.pctBranches,
                this.settings.pctTrunk,
                this.settings.pctRoot,
                totalAll
            );
        }

        var result = {
            corridors: corridors,
            placements: allPlacements
        };

        this._cache = result;
        this._lastCacheKey = key;
        return result;
    },

    // =========================================================================
    // BUILT TREE LAYOUT
    // =========================================================================

    /**
     * Map built tree nodes to corridor-filtered grid positions via BFS
     * and compute edges. Uses the same trunk corridor filter as the ghost
     * preview so nodes only land on valid trunk grid points.
     *
     * Root node → school's root position on the ring.
     * Each child → closest unused corridor grid point to its parent.
     *
     * @param {Object} baseData - from TreePreview.getOutput()
     * @returns {Object|null} { edges, nodes, posMap: { formId: {x,y} } }
     */
    _computeBuiltLayout: function(baseData) {
        var treeData = this._treeData;
        if (!treeData || !treeData.schools) return null;
        if (!this._cache || !this._cache.corridors) return null;

        var gridPoints = baseData.gridPoints || [];
        var rootNodes = baseData.rootNodes || [];
        var corridors = this._cache.corridors;

        var allEdges = [];
        var allNodes = [];
        var allPosMap = {}; // formId → {x, y} across all schools

        var schoolData = baseData.schoolData || {};

        for (var ci = 0; ci < corridors.length; ci++) {
            var corridor = corridors[ci];
            var schoolName = corridor.school;
            var schoolTree = treeData.schools[schoolName];
            if (!schoolTree) continue;

            var allTreeNodes = schoolTree.nodes || [];
            if (allTreeNodes.length === 0) continue;

            // Only place trunk-section nodes (branches/roots handled later)
            var trunkNodes = [];
            for (var ti = 0; ti < allTreeNodes.length; ti++) {
                if (allTreeNodes[ti].section === 'trunk') {
                    trunkNodes.push(allTreeNodes[ti]);
                }
            }

            // Cap at trunk allocation count
            var totalSpells = schoolData[schoolName] || allTreeNodes.length;
            var trunkCap = Math.round(totalSpells * this.settings.pctTrunk / 100);
            if (trunkNodes.length > trunkCap) {
                trunkNodes = trunkNodes.slice(0, trunkCap);
            }

            if (trunkNodes.length === 0) continue;

            var schoolColor = corridor.color || '#888888';

            // Root node position on ring
            var rootPos = null;
            for (var r = 0; r < rootNodes.length; r++) {
                if (rootNodes[r].school === schoolName) {
                    rootPos = { x: rootNodes[r].x, y: rootNodes[r].y };
                    break;
                }
            }
            if (!rootPos) continue;

            // Get corridor-filtered grid points — only real grid points,
            // no synthetic fill. Tree naturally stops when grid runs out.
            var captured = TreeTrunk.getGridPointsInCorridor(
                corridor, gridPoints, trunkNodes.length * 3
            );

            // Mark each as available for assignment
            var pts = [];
            for (var pi = 0; pi < captured.length; pi++) {
                pts.push({ x: captured[pi].x, y: captured[pi].y, used: false });
            }

            // Build node map + trunk set
            var nodeMap = {};
            var trunkSet = {};
            for (var ni = 0; ni < trunkNodes.length; ni++) {
                nodeMap[trunkNodes[ni].formId] = trunkNodes[ni];
                trunkSet[trunkNodes[ni].formId] = true;
            }

            // Find ALL trunk entry points (trunk nodes whose parent
            // is NOT in the trunk set — they connect to root-section nodes)
            var trunkEntries = [];
            for (var te = 0; te < trunkNodes.length; te++) {
                var tn = trunkNodes[te];
                var parentInTrunk = false;
                if (tn.prerequisites) {
                    for (var tp = 0; tp < tn.prerequisites.length; tp++) {
                        if (trunkSet[tn.prerequisites[tp]]) {
                            parentInTrunk = true;
                            break;
                        }
                    }
                }
                if (!parentInTrunk) {
                    trunkEntries.push(tn.formId);
                }
            }

            if (trunkEntries.length === 0) continue;

            // Distance cutoff: if closest point is farther than this,
            // the front stops growing (no long-range jumps).
            // Must be generous — radial grids have wide spoke gaps on outer rings.
            var tierSp = corridor.tierSpacing || 25;
            var maxReach = tierSp * 2;
            var maxReachSq = maxReach * maxReach;

            var posMap = {};
            var visited = {};

            // Seed trunk entries at closest grid points to root,
            // then draw edges from rootPos to each entry.
            // Root spell lives on the ring; trunk entries branch outward.
            for (var sei = 0; sei < trunkEntries.length; sei++) {
                var entryId = trunkEntries[sei];
                visited[entryId] = true;

                var bestE = -1;
                var bestED = Infinity;
                for (var gpe = 0; gpe < pts.length; gpe++) {
                    if (pts[gpe].used) continue;
                    var edx = pts[gpe].x - rootPos.x;
                    var edy = pts[gpe].y - rootPos.y;
                    var ed = edx * edx + edy * edy;
                    if (ed < bestED) { bestED = ed; bestE = gpe; }
                }
                if (bestE !== -1) {
                    posMap[entryId] = { x: pts[bestE].x, y: pts[bestE].y };
                    pts[bestE].used = true;
                    // Edge from root spell to this trunk entry
                    allEdges.push({
                        x1: rootPos.x, y1: rootPos.y,
                        x2: pts[bestE].x, y2: pts[bestE].y,
                        color: schoolColor
                    });
                }
            }

            // Build per-entry BFS fronts for round-robin
            var fronts = [];
            for (var fi = 0; fi < trunkEntries.length; fi++) {
                if (posMap[trunkEntries[fi]]) {
                    fronts.push({ queue: [trunkEntries[fi]], alive: true });
                }
            }

            // Round-robin: each front expands one node per turn.
            // A front dies if its next node can't find a nearby point.
            var safety = trunkNodes.length * 2;
            while (safety-- > 0) {
                var anyAlive = false;
                for (var fri = 0; fri < fronts.length; fri++) {
                    var front = fronts[fri];
                    if (!front.alive || front.queue.length === 0) {
                        front.alive = false;
                        continue;
                    }

                    // Pop one node from this front
                    var formId = front.queue.shift();
                    var node = nodeMap[formId];
                    if (!node) continue;

                    var parentPos = posMap[formId];
                    if (!parentPos) continue;

                    allNodes.push({
                        x: parentPos.x,
                        y: parentPos.y,
                        color: schoolColor,
                        skillLevel: node.skillLevel || ''
                    });

                    // Expand children into this front's queue
                    if (node.children) {
                        var placedAny = false;
                        for (var chi = 0; chi < node.children.length; chi++) {
                            var childId = node.children[chi];
                            if (visited[childId]) continue;
                            if (!trunkSet[childId]) continue;
                            visited[childId] = true;

                            // Find closest unused point to parent
                            var bestIdx = -1;
                            var bestDist = Infinity;
                            for (var gpi = 0; gpi < pts.length; gpi++) {
                                if (pts[gpi].used) continue;
                                var cdx = pts[gpi].x - parentPos.x;
                                var cdy = pts[gpi].y - parentPos.y;
                                var d = cdx * cdx + cdy * cdy;
                                if (d < bestDist) {
                                    bestDist = d;
                                    bestIdx = gpi;
                                }
                            }

                            // Distance cutoff — too far means stop this branch
                            if (bestIdx === -1 || bestDist > maxReachSq) {
                                continue;
                            }

                            posMap[childId] = { x: pts[bestIdx].x, y: pts[bestIdx].y };
                            pts[bestIdx].used = true;
                            front.queue.push(childId);
                            placedAny = true;
                        }
                    }

                    // If queue is now empty, this front is done
                    if (front.queue.length === 0) {
                        front.alive = false;
                    }
                    anyAlive = anyAlive || front.alive;
                }
                if (!anyAlive) break;
            }

            // Build edges between trunk nodes that got positions
            for (var ei = 0; ei < trunkNodes.length; ei++) {
                var pNode = trunkNodes[ei];
                var pPos = posMap[pNode.formId];
                if (!pPos || !pNode.children) continue;

                for (var eci = 0; eci < pNode.children.length; eci++) {
                    var cPos = posMap[pNode.children[eci]];
                    if (!cPos) continue;

                    allEdges.push({
                        x1: pPos.x, y1: pPos.y,
                        x2: cPos.x, y2: cPos.y,
                        color: schoolColor
                    });
                }
            }

            // =============================================================
            // BRANCH GROWTH — top 10% of trunk nodes sprout branches
            // =============================================================

            // Collect branch-section spells
            var branchNodes = [];
            for (var bni = 0; bni < allTreeNodes.length; bni++) {
                if (allTreeNodes[bni].section === 'branch') {
                    branchNodes.push(allTreeNodes[bni]);
                }
            }
            var branchCap = Math.round(totalSpells * this.settings.pctBranches / 100);
            if (branchNodes.length > branchCap) {
                branchNodes = branchNodes.slice(0, branchCap);
            }

            if (branchNodes.length > 0) {
                // Find placed trunk nodes sorted by distance from root (descending)
                var placedTrunk = [];
                for (var pti = 0; pti < trunkNodes.length; pti++) {
                    var tPos = posMap[trunkNodes[pti].formId];
                    if (!tPos) continue;
                    var dtx = tPos.x - rootPos.x;
                    var dty = tPos.y - rootPos.y;
                    placedTrunk.push({
                        formId: trunkNodes[pti].formId,
                        x: tPos.x, y: tPos.y,
                        dist: dtx * dtx + dty * dty
                    });
                }
                placedTrunk.sort(function(a, b) { return b.dist - a.dist; });

                // Top 10% become branch attachment points (min 2)
                var attachCount = Math.max(2, Math.ceil(placedTrunk.length * 0.1));
                var attachPoints = placedTrunk.slice(0, attachCount);

                // Collect ALL this school's grid points (not just corridor)
                // for branch placement — branches grow outside the trunk
                var branchPts = [];
                var usedSet = {};
                for (var uki = 0; uki < pts.length; uki++) {
                    if (pts[uki].used) {
                        usedSet[Math.round(pts[uki].x) + ',' + Math.round(pts[uki].y)] = true;
                    }
                }
                usedSet[Math.round(rootPos.x) + ',' + Math.round(rootPos.y)] = true;

                for (var gbi = 0; gbi < gridPoints.length; gbi++) {
                    var gp = gridPoints[gbi];
                    if (gp.school && gp.school !== schoolName) continue;
                    var gpKey = Math.round(gp.x) + ',' + Math.round(gp.y);
                    if (usedSet[gpKey]) continue;
                    branchPts.push({ x: gp.x, y: gp.y, used: false });
                }

                // BFS tree growth from attachment points.
                // Each placed node goes into a queue; when expanded it
                // grows 1-2 children (30% chance to fork) biased outward.
                var branchPool = branchNodes.slice();
                var branchReachSq = (tierSp * 5) * (tierSp * 5);
                var forkChance = 0.3;

                // Seed BFS queue with attachment points
                var bfsQueue = []; // { x, y, parentX, parentY }
                for (var afi = 0; afi < attachPoints.length; afi++) {
                    bfsQueue.push({
                        x: attachPoints[afi].x,
                        y: attachPoints[afi].y,
                        parentX: attachPoints[afi].x,
                        parentY: attachPoints[afi].y
                    });
                }

                // Simple seeded random for deterministic forking
                var _brSeed = 12345;
                var _brRand = function() {
                    _brSeed = (_brSeed * 16807 + 0) % 2147483647;
                    return _brSeed / 2147483647;
                };

                while (bfsQueue.length > 0 && branchPool.length > 0) {
                    var tip = bfsQueue.shift();

                    // Outward direction from root through this tip
                    var outDx = tip.x - rootPos.x;
                    var outDy = tip.y - rootPos.y;
                    var outLen = Math.sqrt(outDx * outDx + outDy * outDy) || 1;
                    outDx /= outLen;
                    outDy /= outLen;

                    // How many children: 1 normally, 2 on fork
                    var nChildren = (_brRand() < forkChance) ? 2 : 1;

                    // Find best candidates near this tip, scored with outward bias
                    var candidates = [];
                    for (var bpi = 0; bpi < branchPts.length; bpi++) {
                        if (branchPts[bpi].used) continue;
                        var bdx = branchPts[bpi].x - tip.x;
                        var bdy = branchPts[bpi].y - tip.y;
                        var rawDist = bdx * bdx + bdy * bdy;
                        if (rawDist > branchReachSq || rawDist < 1) continue;

                        // Outward dot product bonus: prefer growing away from root
                        var dist1 = Math.sqrt(rawDist);
                        var dot = (bdx * outDx + bdy * outDy) / dist1;
                        // Score: lower is better. Subtract outward bonus (0 to tierSp)
                        var score = rawDist - dot * tierSp * tierSp;
                        candidates.push({ idx: bpi, score: score, rawDist: rawDist });
                    }
                    candidates.sort(function(a, b) { return a.score - b.score; });

                    var placed = 0;
                    for (var ci2 = 0; ci2 < candidates.length && placed < nChildren && branchPool.length > 0; ci2++) {
                        if (branchPts[candidates[ci2].idx].used) continue;

                        var bSpell = branchPool.shift();
                        var bpx = branchPts[candidates[ci2].idx].x;
                        var bpy = branchPts[candidates[ci2].idx].y;
                        branchPts[candidates[ci2].idx].used = true;

                        allEdges.push({
                            x1: tip.x, y1: tip.y,
                            x2: bpx, y2: bpy,
                            color: schoolColor
                        });
                        allNodes.push({
                            x: bpx, y: bpy,
                            color: schoolColor,
                            skillLevel: bSpell.skillLevel || ''
                        });
                        posMap[bSpell.formId] = { x: bpx, y: bpy };

                        // Child becomes a new BFS node to expand later
                        bfsQueue.push({
                            x: bpx, y: bpy,
                            parentX: tip.x, parentY: tip.y
                        });
                        placed++;
                    }
                }
            }

            // Merge this school's positions into the global map
            for (var pmk in posMap) {
                if (posMap.hasOwnProperty(pmk)) {
                    allPosMap[pmk] = posMap[pmk];
                }
            }
        }

        return { edges: allEdges, nodes: allNodes, posMap: allPosMap };
    },

    // =========================================================================
    // HELPERS
    // =========================================================================

    _markDirty: function() {
        if (typeof TreeGrowth !== 'undefined') {
            TreeGrowth._markDirty();
        }
    },

    getSettings: function() {
        return {
            ghostOpacity: this.settings.ghostOpacity,
            nodeRadius: this.settings.nodeRadius,
            trunkThickness: this.settings.trunkThickness,
            pctBranches: this.settings.pctBranches,
            pctTrunk: this.settings.pctTrunk,
            pctRoot: this.settings.pctRoot
        };
    }
};

// Self-register when TreeGrowth is available
if (typeof TreeGrowth !== 'undefined') {
    TreeGrowth.registerMode('tree', TreeGrowthTree);
}
