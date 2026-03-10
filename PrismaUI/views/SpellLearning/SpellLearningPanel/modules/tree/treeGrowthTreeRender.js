/**
 * Tree Growth Tree — Render
 *
 * Method-extension of TreeGrowthTree (defined in treeGrowthTree.js).
 * Provides rendering, cache management, and the layout orchestrator that
 * coordinates grid building, trunk placement, branch placement, root growth,
 * and catch-all phases via helper methods defined in treeGrowthTreeLayout.js
 * and treeGrowthTreeAnim.js.
 */

// =========================================================================
// RENDER
// =========================================================================

TreeGrowthTree.render = function(ctx, w, h, baseData) {
    if (!baseData) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'rgba(184, 168, 120, 0.4)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('preview.scanToPreview'), w / 2, h / 2);
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
        // 4a. Tree is built — show edges + positioned nodes (CACHED)
        var layoutKey = this._buildCacheKey(baseData) + '|built|' + this.settings.branchSpread;
        if (!this._builtPlacements || this._builtLayoutKey !== layoutKey) {
            this._builtPlacements = this._computeBuiltLayout(baseData);
            this._builtLayoutKey = layoutKey;
            // Update status with actual placement counts
            if (this._builtPlacements) {
                TreeSettings.setTreeBuilt(true,
                    this._builtPlacements.totalPlaced,
                    this._builtPlacements.totalPool);
            }
        }
        var layout = this._builtPlacements;
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
};

// =========================================================================
// CACHE
// =========================================================================

TreeGrowthTree._buildCacheKey = function(baseData) {
    var s = this.settings;
    var parts = [
        baseData.mode,
        JSON.stringify(baseData.grid),
        baseData.rootNodes.length,
        s.trunkThickness,
        s.branchSpread,
        s.rootSpread,
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
};

TreeGrowthTree._getOrCompute = function(baseData, w, h) {
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

        // Filter REAL grid points that fall inside the corridor
        var ghGdx = corridor.growDirX || 0;
        var ghGdy = corridor.growDirY || 0;
        if (ghGdx === 0 && ghGdy === 0) {
            var ghbx = (corridor.x1 + corridor.x4) / 2;
            var ghby = (corridor.y1 + corridor.y4) / 2;
            var ghfx = (corridor.x2 + corridor.x3) / 2;
            var ghfy = (corridor.y2 + corridor.y3) / 2;
            var ghfl = Math.sqrt((ghfx - ghbx) * (ghfx - ghbx) + (ghfy - ghby) * (ghfy - ghby));
            if (ghfl > 0) { ghGdx = (ghfx - ghbx) / ghfl; ghGdy = (ghfy - ghby) / ghfl; }
        }
        var ghPerpX = -ghGdy;
        var ghPerpY = ghGdx;
        var ghDx14 = corridor.x4 - corridor.x1;
        var ghDy14 = corridor.y4 - corridor.y1;
        var ghHalfW = Math.sqrt(ghDx14 * ghDx14 + ghDy14 * ghDy14) / 2;
        var ghMidX = (corridor.x1 + corridor.x4) / 2;
        var ghMidY = (corridor.y1 + corridor.y4) / 2;
        var ghTierSp = corridor.tierSpacing || 20;
        var ghMinDist = ghTierSp * 0.5;

        var captured = [];
        for (var ghgi = 0; ghgi < gridPoints.length; ghgi++) {
            var ghgp = gridPoints[ghgi];
            if (ghgp.school !== schoolName) continue;
            var ghRelX = ghgp.x - ghMidX;
            var ghRelY = ghgp.y - ghMidY;
            var ghAlong = ghRelX * ghGdx + ghRelY * ghGdy;
            var ghAcross = ghRelX * ghPerpX + ghRelY * ghPerpY;
            if (ghAlong >= ghMinDist && Math.abs(ghAcross) <= ghHalfW) {
                captured.push({
                    x: ghgp.x, y: ghgp.y,
                    color: corridor.color,
                    dist: ghAlong
                });
            }
        }
        captured.sort(function(a, b) { return a.dist - b.dist; });

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
};

// =========================================================================
// BUILT TREE LAYOUT — Orchestrator
// =========================================================================

/**
 * Two-phase grid layout: TRUNK then BRANCHES, delegating to helper
 * methods defined in treeGrowthTreeLayout.js and treeGrowthTreeAnim.js.
 * @param {Object} baseData - from TreePreview.getOutput()
 * @returns {Object|null} { edges, nodes, posMap, parentMap, totalPlaced, totalPool }
 */
TreeGrowthTree._computeBuiltLayout = function(baseData) {
    var self = this;
    var treeData = this._treeData;
    if (!treeData || !treeData.schools) return null;
    if (!this._cache || !this._cache.corridors) return null;

    var gridPoints = baseData.gridPoints || [];
    var rootNodes = baseData.rootNodes || [];
    var corridors = this._cache.corridors;
    var grid = baseData.grid || {};
    var tierSp = grid.tierSpacing || 40;

    var allEdges = [];
    var allNodes = [];
    var allPosMap = {};
    var allParentMap = {};
    var totalPlaced = 0;
    var totalPool = 0;

    for (var ci = 0; ci < corridors.length; ci++) {
        var corridor = corridors[ci];
        var schoolName = corridor.school;
        var schoolTree = treeData.schools[schoolName];
        if (!schoolTree) continue;

        var allTreeNodes = schoolTree.nodes || [];
        if (allTreeNodes.length === 0) continue;

        // Create per-school layout context
        var ctx = {
            corridor: corridor, schoolName: schoolName,
            allTreeNodes: allTreeNodes, schoolColor: corridor.color || '#888888',
            gridPoints: gridPoints, rootNodes: rootNodes,
            grid: grid, tierSp: tierSp, settings: self.settings,
            // Corridor geometry (populated by _buildSchoolGrid)
            gdx: 0, gdy: 0, perpX: 0, perpY: 0,
            halfWidth: 0, baseMidX: 0, baseMidY: 0,
            // Root positions (populated by _buildSchoolGrid)
            schoolRootPositions: [], rootPos: null, rootDir: 0, numRoots: 0,
            rootLocalIdxs: [], rootLocalIdx: -1,
            // Grid data (populated by _buildSchoolGrid)
            schoolPts: [], trunkCount: 0, sectorStart: 0, trunkMaxAlong: 0,
            // Node tree (populated by _prepareNodeTree)
            nodeLookup: {}, rootSpellId: null, subtreeSize: {},
            rootChildSplit: null, childToRootIdx: {},
            // Placement state
            posMap: {}, parentMap: {}, gridIdxMap: {}, dirMap: {},
            deferredNodes: [], placedCount: 0,
            trunkPlaced: 0, branchPlaced: 0, rootGrowthPlaced: 0,
            trunkTarget: 0, branchTarget: 0, rootGrowthTarget: 0,
            maxPlaceable: 0, branchSpread: self.settings.branchSpread || 2.5,
            placeStats: {
                trunkHop1: 0, trunkMulti: 0, trunkRetry: 0,
                branchHop1: 0, branchMulti: 0, globalFB: 0
            },
            // Branch phase data (populated by _collectBranchOrigins)
            branchOrigins: [], trunkTipPos: null, trunkTipGIdx: -1, trunkTipProj: 0,
            // Output arrays
            allEdges: [], allNodes: []
        };

        // Execute layout phases
        self._buildSchoolGrid(ctx);
        self._prepareNodeTree(ctx);
        self._placeRootNode(ctx);
        self._placeTrunkBFS(ctx);
        self._placeTrunkRetry(ctx);
        self._collectBranchOrigins(ctx);
        self._placeBranchPhase(ctx);
        self._placeRootGrowth(ctx);
        self._placeCatchAll(ctx);

        // Log final placement stats
        console.log('[TreeGrowthTree] ' + schoolName + ': placed ' +
            ctx.placedCount + '/' + allTreeNodes.length +
            ' (max=' + ctx.maxPlaceable + ', trunk=' + ctx.trunkTarget +
            ', branch=' + ctx.branchTarget + ', root=' + ctx.rootGrowthTarget + ')' +
            ' | trunkH1=' + ctx.placeStats.trunkHop1 +
            ' trunkM=' + ctx.placeStats.trunkMulti +
            ' trunkRetry=' + ctx.placeStats.trunkRetry +
            ' branchH1=' + ctx.placeStats.branchHop1 +
            ' branchM=' + ctx.placeStats.branchMulti +
            ' globalFB=' + ctx.placeStats.globalFB +
            ' rootGrowth=' + ctx.rootGrowthPlaced);

        totalPlaced += ctx.placedCount;
        totalPool += allTreeNodes.length;

        // Merge per-school results into output
        for (var pmk in ctx.posMap) {
            if (ctx.posMap.hasOwnProperty(pmk)) allPosMap[pmk] = ctx.posMap[pmk];
        }
        for (var pmk2 in ctx.parentMap) {
            if (ctx.parentMap.hasOwnProperty(pmk2)) allParentMap[pmk2] = ctx.parentMap[pmk2];
        }
        for (var ei = 0; ei < ctx.allEdges.length; ei++) allEdges.push(ctx.allEdges[ei]);
        for (var noi = 0; noi < ctx.allNodes.length; noi++) allNodes.push(ctx.allNodes[noi]);
    }

    return {
        edges: allEdges,
        nodes: allNodes,
        posMap: allPosMap,
        parentMap: allParentMap,
        totalPlaced: totalPlaced,
        totalPool: totalPool
    };
};

// =========================================================================
// TRUNK RETRY PHASE
// =========================================================================

/**
 * Phase 1b: Trunk retry — fill corridor to at least 90% of target.
 * Deferred nodes search from ANY placed trunk node (nearest to parent).
 * @param {Object} ctx - Per-school layout context
 */
TreeGrowthTree._placeTrunkRetry = function(ctx) {
    var self = this;
    var schoolPts = ctx.schoolPts;
    var trunkCount = ctx.trunkCount;

    var corridorFree = 0;
    for (var cfk = 0; cfk < trunkCount; cfk++) {
        if (!schoolPts[cfk].used) corridorFree++;
    }
    var trunkMinTarget = Math.floor(ctx.trunkTarget * 0.90);

    console.log('[TreeGrowthTree] ' + ctx.schoolName + ' AFTER DFS: trunkPlaced=' +
        ctx.trunkPlaced + '/' + ctx.trunkTarget + ' (min90%=' + trunkMinTarget +
        '), corridorFree=' + corridorFree + '/' + trunkCount +
        ', deferred=' + ctx.deferredNodes.length);

    if (ctx.trunkPlaced >= trunkMinTarget || corridorFree <= 0 || ctx.deferredNodes.length === 0) {
        return;
    }

    // Collect all placed trunk grid indices for nearest-search
    var placedTrunkIdxs = [];
    for (var ptk in ctx.gridIdxMap) {
        if (!ctx.gridIdxMap.hasOwnProperty(ptk)) continue;
        var ptgi = ctx.gridIdxMap[ptk];
        if (ptgi !== undefined && ptgi < trunkCount && schoolPts[ptgi].inCorridor) {
            placedTrunkIdxs.push(ptgi);
        }
    }

    var retryDeferred = [];
    var dfsStack = [];

    for (var rdi = 0; rdi < ctx.deferredNodes.length; rdi++) {
        if (ctx.trunkPlaced >= trunkMinTarget || corridorFree <= 0) {
            retryDeferred.push(ctx.deferredNodes[rdi]);
            continue;
        }

        var rdChild = ctx.deferredNodes[rdi];
        var rdChildId = rdChild.childId;
        if (ctx.posMap[rdChildId]) continue;

        // Find nearest placed trunk node to the deferred node's parent
        var rdParentPos = ctx.posMap[rdChild.parentId];
        if (!rdParentPos) {
            retryDeferred.push(rdChild);
            continue;
        }

        // Search from nearest placed trunk node
        var rdBestAnchor = -1;
        var rdBestADist = Infinity;
        for (var rai = 0; rai < placedTrunkIdxs.length; rai++) {
            var raIdx = placedTrunkIdxs[rai];
            var radx = schoolPts[raIdx].x - rdParentPos.x;
            var rady = schoolPts[raIdx].y - rdParentPos.y;
            var rad = radx * radx + rady * rady;
            if (rad < rdBestADist) { rdBestADist = rad; rdBestAnchor = raIdx; }
        }

        if (rdBestAnchor < 0) {
            retryDeferred.push(rdChild);
            continue;
        }

        // BFS from this anchor to find free corridor point (up to 8 hops)
        var rdVisited = {};
        rdVisited[rdBestAnchor] = true;
        var rdQueue = [{ idx: rdBestAnchor, hops: 0 }];
        var rdBest = -1;
        var rdBestScore = -Infinity;
        var rdSearched = 0;

        while (rdQueue.length > 0 && rdSearched < 400) {
            var rdq = rdQueue.shift();
            rdSearched++;
            var rdNbrs = schoolPts[rdq.idx].neighbors;
            for (var rdni = 0; rdni < rdNbrs.length; rdni++) {
                var rdnIdx = rdNbrs[rdni];
                if (rdVisited[rdnIdx]) continue;
                rdVisited[rdnIdx] = true;
                if (!schoolPts[rdnIdx].inCorridor) continue;
                if (!schoolPts[rdnIdx].used) {
                    var rdsc = self._scoreCandidate(schoolPts, rdnIdx,
                        rdParentPos.x, rdParentPos.y, ctx.gdx, ctx.gdy, [])
                        - rdq.hops * 0.3;
                    if (rdsc > rdBestScore) { rdBestScore = rdsc; rdBest = rdnIdx; }
                }
                if (rdq.hops < 8) {
                    rdQueue.push({ idx: rdnIdx, hops: rdq.hops + 1 });
                }
            }
        }

        if (rdBest >= 0) {
            schoolPts[rdBest].used = true;
            ctx.posMap[rdChildId] = { x: schoolPts[rdBest].x, y: schoolPts[rdBest].y };
            ctx.gridIdxMap[rdChildId] = rdBest;
            placedTrunkIdxs.push(rdBest);
            ctx.trunkPlaced++;
            ctx.placedCount++;
            corridorFree--;
            ctx.placeStats.trunkRetry++;

            ctx.allNodes.push({
                x: schoolPts[rdBest].x, y: schoolPts[rdBest].y,
                color: ctx.schoolColor,
                skillLevel: ctx.nodeLookup[rdChildId] ? ctx.nodeLookup[rdChildId].skillLevel || '' : ''
            });
            ctx.allEdges.push({
                x1: rdParentPos.x, y1: rdParentPos.y,
                x2: schoolPts[rdBest].x, y2: schoolPts[rdBest].y,
                color: ctx.schoolColor
            });
            ctx.parentMap[rdChildId] = rdChild.parentId;

            // Push to DFS so this node's children also try corridor
            dfsStack.push(rdChildId);
        } else {
            retryDeferred.push(rdChild);
        }
    }
    ctx.deferredNodes = retryDeferred;

    // Run DFS for newly placed retry nodes' children
    while (dfsStack.length > 0) {
        var rCurId = dfsStack.pop();
        var rCurNode = ctx.nodeLookup[rCurId];
        if (!rCurNode || !rCurNode.children || rCurNode.children.length === 0) continue;
        if (ctx.trunkPlaced >= ctx.trunkTarget || corridorFree <= 0) {
            // Over target — defer remaining children
            for (var rck = 0; rck < rCurNode.children.length; rck++) {
                if (!ctx.posMap[rCurNode.children[rck]]) {
                    ctx.deferredNodes.push({ childId: rCurNode.children[rck], parentId: rCurId });
                }
            }
            continue;
        }

        var rParentPos = ctx.posMap[rCurId];
        var rParentGIdx = ctx.gridIdxMap[rCurId];
        if (!rParentPos) continue;

        var rChildren = rCurNode.children.slice();
        rChildren.sort(function(a, b) {
            return (ctx.subtreeSize[a] || 1) - (ctx.subtreeSize[b] || 1);
        });

        for (var rci2 = 0; rci2 < rChildren.length; rci2++) {
            var rChildId2 = rChildren[rci2];
            if (ctx.posMap[rChildId2] || !ctx.nodeLookup[rChildId2]) continue;

            var rBest = -1;
            var rBScore = -Infinity;

            // 1-hop corridor
            if (rParentGIdx !== undefined && rParentGIdx >= 0) {
                var rNbrs = schoolPts[rParentGIdx].neighbors;
                for (var rni2 = 0; rni2 < rNbrs.length; rni2++) {
                    var rnIdx2 = rNbrs[rni2];
                    if (schoolPts[rnIdx2].used || !schoolPts[rnIdx2].inCorridor) continue;
                    var rsc2 = self._scoreCandidate(schoolPts, rnIdx2,
                        rParentPos.x, rParentPos.y, ctx.gdx, ctx.gdy, []);
                    if (rsc2 > rBScore) { rBScore = rsc2; rBest = rnIdx2; }
                }
            }
            if (rBest >= 0) { ctx.placeStats.trunkRetry++; }

            // Multi-hop corridor (up to 6)
            if (rBest < 0 && rParentGIdx !== undefined && rParentGIdx >= 0) {
                var rVis = {};
                rVis[rParentGIdx] = true;
                var rSQ = [{ idx: rParentGIdx, hops: 0 }];
                var rCands = [];
                var rSrch = 0;
                while (rSQ.length > 0 && rSrch < 300) {
                    var rsq = rSQ.shift();
                    rSrch++;
                    var rCurN = schoolPts[rsq.idx].neighbors;
                    for (var rsi = 0; rsi < rCurN.length; rsi++) {
                        var rsIdx = rCurN[rsi];
                        if (rVis[rsIdx]) continue;
                        rVis[rsIdx] = true;
                        if (!schoolPts[rsIdx].inCorridor) continue;
                        if (!schoolPts[rsIdx].used) {
                            rCands.push({ idx: rsIdx, hops: rsq.hops + 1 });
                            if (rCands.length >= 8) { rSQ = []; break; }
                        }
                        if (rsq.hops < 6) rSQ.push({ idx: rsIdx, hops: rsq.hops + 1 });
                    }
                }
                if (rCands.length > 0) {
                    var rhBest = -Infinity;
                    for (var rhci = 0; rhci < rCands.length; rhci++) {
                        var rhSc = self._scoreCandidate(schoolPts, rCands[rhci].idx,
                            rParentPos.x, rParentPos.y, ctx.gdx, ctx.gdy, [])
                            - rCands[rhci].hops * 0.5;
                        if (rhSc > rhBest) { rhBest = rhSc; rBest = rCands[rhci].idx; }
                    }
                    if (rBest >= 0) ctx.placeStats.trunkRetry++;
                }
            }

            if (rBest < 0) {
                ctx.deferredNodes.push({ childId: rChildId2, parentId: rCurId });
                continue;
            }

            schoolPts[rBest].used = true;
            ctx.posMap[rChildId2] = { x: schoolPts[rBest].x, y: schoolPts[rBest].y };
            ctx.gridIdxMap[rChildId2] = rBest;
            ctx.trunkPlaced++;
            ctx.placedCount++;
            corridorFree--;

            ctx.allNodes.push({
                x: schoolPts[rBest].x, y: schoolPts[rBest].y,
                color: ctx.schoolColor,
                skillLevel: ctx.nodeLookup[rChildId2].skillLevel || ''
            });
            ctx.allEdges.push({
                x1: rParentPos.x, y1: rParentPos.y,
                x2: schoolPts[rBest].x, y2: schoolPts[rBest].y,
                color: ctx.schoolColor
            });
            ctx.parentMap[rChildId2] = rCurId;

            dfsStack.push(rChildId2);
        }
    }

    console.log('[TreeGrowthTree] ' + ctx.schoolName + ' AFTER RETRY: trunkPlaced=' +
        ctx.trunkPlaced + '/' + ctx.trunkTarget +
        ', deferred=' + ctx.deferredNodes.length +
        ', trunkRetry=' + ctx.placeStats.trunkRetry);
};
