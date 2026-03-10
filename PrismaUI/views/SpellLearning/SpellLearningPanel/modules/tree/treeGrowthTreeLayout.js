/**
 * Tree Growth Tree — Layout
 *
 * Method-extension of TreeGrowthTree (defined in treeGrowthTree.js).
 * Provides grid building, node tree preparation, root placement,
 * trunk BFS placement, and branch origin collection.
 *
 * These methods operate on a per-school layout context object (ctx)
 * created by the _computeBuiltLayout orchestrator in treeGrowthTreeRender.js.
 */

// =========================================================================
// GRID BUILDING
// =========================================================================

/**
 * Build the unified school grid from real grid points.
 * Populates ctx with corridor geometry, school grid points (corridor +
 * sector), neighbor connections, root positions, and grid expansion.
 *
 * @param {Object} ctx - Per-school layout context
 */
TreeGrowthTree._buildSchoolGrid = function(ctx) {
    var corridor = ctx.corridor;
    var schoolName = ctx.schoolName;
    var allTreeNodes = ctx.allTreeNodes;
    var gridPoints = ctx.gridPoints;
    var rootNodes = ctx.rootNodes;
    var tierSp = ctx.tierSp;

    // ==========================================================
    // A) CORRIDOR GEOMETRY
    // ==========================================================
    var gdx = corridor.growDirX || 0;
    var gdy = corridor.growDirY || 0;
    if (gdx === 0 && gdy === 0) {
        // Flat mode: derive from corridor shape
        var cbx = (corridor.x1 + corridor.x4) / 2;
        var cby = (corridor.y1 + corridor.y4) / 2;
        var cfx = (corridor.x2 + corridor.x3) / 2;
        var cfy = (corridor.y2 + corridor.y3) / 2;
        var cfl = Math.sqrt((cfx - cbx) * (cfx - cbx) + (cfy - cby) * (cfy - cby));
        if (cfl > 0) { gdx = (cfx - cbx) / cfl; gdy = (cfy - cby) / cfl; }
        else {
            var rootDir = 0;
            for (var rr = 0; rr < rootNodes.length; rr++) {
                if (rootNodes[rr].school === schoolName) {
                    rootDir = rootNodes[rr].dir || 0;
                    break;
                }
            }
            gdx = Math.cos(rootDir);
            gdy = Math.sin(rootDir);
        }
    }
    var perpX = -gdy;
    var perpY = gdx;

    // Corridor dimensions
    var dx14 = corridor.x4 - corridor.x1;
    var dy14 = corridor.y4 - corridor.y1;
    var halfWidth = Math.sqrt(dx14 * dx14 + dy14 * dy14) / 2;
    var baseMidX = (corridor.x1 + corridor.x4) / 2;
    var baseMidY = (corridor.y1 + corridor.y4) / 2;

    ctx.gdx = gdx;
    ctx.gdy = gdy;
    ctx.perpX = perpX;
    ctx.perpY = perpY;
    ctx.halfWidth = halfWidth;
    ctx.baseMidX = baseMidX;
    ctx.baseMidY = baseMidY;

    // Root positions on ring (all roots for this school)
    var schoolRootPositions = [];
    for (var r = 0; r < rootNodes.length; r++) {
        if (rootNodes[r].school === schoolName) {
            schoolRootPositions.push({
                x: rootNodes[r].x, y: rootNodes[r].y,
                dir: rootNodes[r].dir || 0
            });
        }
    }
    if (schoolRootPositions.length === 0) return;
    ctx.schoolRootPositions = schoolRootPositions;
    ctx.rootPos = schoolRootPositions[0];
    ctx.rootDir = schoolRootPositions[0].dir;
    ctx.numRoots = schoolRootPositions.length;

    // ==========================================================
    // B+C) BUILD UNIFIED GRID from REAL grid points
    //       Corridor points (inCorridor=true) + sector points
    // ==========================================================
    var minDist = tierSp * 0.5;
    var schoolPts = [];
    var trunkCount = 0;
    var globalToLocal = {};
    var trunkMaxAlong = 0;

    // Pass 1: add corridor points (real grid points inside corridor)
    for (var gpi = 0; gpi < gridPoints.length; gpi++) {
        var gp = gridPoints[gpi];
        if (gp.school !== schoolName) continue;

        var relGx = gp.x - baseMidX;
        var relGy = gp.y - baseMidY;
        var projAlong = relGx * gdx + relGy * gdy;
        var projAcross = relGx * perpX + relGy * perpY;

        if (projAlong >= minDist && Math.abs(projAcross) <= halfWidth) {
            var tLocalIdx = schoolPts.length;
            if (gp._ptIdx !== undefined) {
                globalToLocal[gp._ptIdx] = tLocalIdx;
            }
            schoolPts.push({
                x: gp.x, y: gp.y,
                used: false,
                neighbors: [],
                _globalNeighbors: gp._neighbors || [],
                inCorridor: true,
                _alongDist: projAlong
            });
            trunkCount++;
            if (projAlong > trunkMaxAlong) trunkMaxAlong = projAlong;
        }
    }

    // Pass 1b: if corridor has fewer grid points than trunkTarget,
    // generate synthetic corridor points so the trunk can grow taller.
    var trunkTargetEst = Math.round(allTreeNodes.length * ctx.settings.pctTrunk / 100);
    if (trunkCount < trunkTargetEst) {
        var corridorWidth = halfWidth * 2;
        var cols = Math.max(1, Math.round(corridorWidth / tierSp));
        if (cols < 2 && halfWidth > tierSp * 0.3) cols = 2;
        var startAlong = trunkMaxAlong > 0 ? trunkMaxAlong + tierSp : minDist + tierSp;
        var needed = trunkTargetEst - trunkCount;
        var neededRows = Math.ceil(needed / cols);
        var along = startAlong;
        for (var sr = 0; sr < neededRows && trunkCount < trunkTargetEst; sr++) {
            for (var sc = 0; sc < cols && trunkCount < trunkTargetEst; sc++) {
                var across;
                if (cols === 1) { across = 0; }
                else { across = -halfWidth + corridorWidth * (sc + 0.5) / cols; }
                var spx = baseMidX + gdx * along + perpX * across;
                var spy = baseMidY + gdy * along + perpY * across;
                schoolPts.push({
                    x: spx, y: spy,
                    used: false,
                    neighbors: [],
                    _globalNeighbors: [],
                    inCorridor: true,
                    _alongDist: along,
                    _synthetic: true
                });
                trunkCount++;
            }
            along += tierSp;
        }
        if (along - tierSp > trunkMaxAlong) trunkMaxAlong = along - tierSp;
    }

    var sectorStart = schoolPts.length;

    // Pass 2: add sector points (real grid points OUTSIDE corridor)
    for (var gpi2 = 0; gpi2 < gridPoints.length; gpi2++) {
        var gp2 = gridPoints[gpi2];
        if (gp2.school !== schoolName) continue;

        var relGx2 = gp2.x - baseMidX;
        var relGy2 = gp2.y - baseMidY;
        var projAlong2 = relGx2 * gdx + relGy2 * gdy;
        var projAcross2 = relGx2 * perpX + relGy2 * perpY;

        // Outside corridor
        if (!(projAlong2 >= minDist && Math.abs(projAcross2) <= halfWidth)) {
            var sLocalIdx = schoolPts.length;
            if (gp2._ptIdx !== undefined) {
                globalToLocal[gp2._ptIdx] = sLocalIdx;
            }
            schoolPts.push({
                x: gp2.x, y: gp2.y,
                used: false,
                neighbors: [],
                _globalNeighbors: gp2._neighbors || [],
                inCorridor: false
            });
        }
    }

    // Resolve global neighbor indices to local for ALL points
    for (var rni = 0; rni < schoolPts.length; rni++) {
        var gnbs = schoolPts[rni]._globalNeighbors;
        if (!gnbs) continue;
        for (var gnj = 0; gnj < gnbs.length; gnj++) {
            var localNb = globalToLocal[gnbs[gnj]];
            if (localNb !== undefined && localNb !== rni) {
                schoolPts[rni].neighbors.push(localNb);
            }
        }
        delete schoolPts[rni]._globalNeighbors;
    }

    // Corridor-local neighbor enhancement: in thin corridors,
    // global KNN neighbors are mostly outside the corridor,
    // leaving corridor points disconnected. Add distance-based
    // neighbors within corridor to ensure traversability.
    var corridorNbrRadSq = tierSp * tierSp * 2.25; // 1.5 * tierSp
    for (var cnA = 0; cnA < trunkCount; cnA++) {
        for (var cnB = cnA + 1; cnB < trunkCount; cnB++) {
            var cndx = schoolPts[cnB].x - schoolPts[cnA].x;
            var cndy = schoolPts[cnB].y - schoolPts[cnA].y;
            if (cndx * cndx + cndy * cndy <= corridorNbrRadSq) {
                if (schoolPts[cnA].neighbors.indexOf(cnB) < 0) {
                    schoolPts[cnA].neighbors.push(cnB);
                }
                if (schoolPts[cnB].neighbors.indexOf(cnA) < 0) {
                    schoolPts[cnB].neighbors.push(cnA);
                }
            }
        }
    }

    // Bridge isolated points (no neighbors after resolution)
    for (var iso = 0; iso < schoolPts.length; iso++) {
        if (schoolPts[iso].neighbors.length > 0) continue;
        var isoBest = Infinity;
        var isoBestIdx = -1;
        // Search same zone first (corridor or sector)
        var isoInC = schoolPts[iso].inCorridor;
        for (var iso2 = 0; iso2 < schoolPts.length; iso2++) {
            if (iso2 === iso) continue;
            if (schoolPts[iso2].inCorridor !== isoInC) continue;
            var isodx = schoolPts[iso2].x - schoolPts[iso].x;
            var isody = schoolPts[iso2].y - schoolPts[iso].y;
            var isod = isodx * isodx + isody * isody;
            if (isod < isoBest) { isoBest = isod; isoBestIdx = iso2; }
        }
        // Fallback: any point
        if (isoBestIdx < 0) {
            for (var iso3 = 0; iso3 < schoolPts.length; iso3++) {
                if (iso3 === iso) continue;
                var isodx3 = schoolPts[iso3].x - schoolPts[iso].x;
                var isody3 = schoolPts[iso3].y - schoolPts[iso].y;
                var isod3 = isodx3 * isodx3 + isody3 * isody3;
                if (isod3 < isoBest) { isoBest = isod3; isoBestIdx = iso3; }
            }
        }
        if (isoBestIdx >= 0) {
            schoolPts[iso].neighbors.push(isoBestIdx);
            schoolPts[isoBestIdx].neighbors.push(iso);
        }
    }

    // ==========================================================
    // D) BRIDGE: Connect corridor edges to nearby sector points
    // ==========================================================
    var bridgeRadiusSq = tierSp * tierSp * 9; // 3x tierSpacing
    var tipThreshold = trunkMaxAlong * 0.80;
    for (var bti = 0; bti < trunkCount; bti++) {
        var btAlong = schoolPts[bti]._alongDist || 0;
        if (btAlong < tipThreshold) continue; // only tip corridor points

        for (var bsi = sectorStart; bsi < schoolPts.length; bsi++) {
            var bsdx = schoolPts[bsi].x - schoolPts[bti].x;
            var bsdy = schoolPts[bsi].y - schoolPts[bti].y;
            if (bsdx * bsdx + bsdy * bsdy <= bridgeRadiusSq) {
                if (schoolPts[bti].neighbors.indexOf(bsi) < 0) {
                    schoolPts[bti].neighbors.push(bsi);
                }
                if (schoolPts[bsi].neighbors.indexOf(bti) < 0) {
                    schoolPts[bsi].neighbors.push(bti);
                }
            }
        }
    }

    // ==========================================================
    // E) ADD ALL ROOT POSITIONS, connect to first trunk rows
    // ==========================================================
    var rootLocalIdxs = [];
    var numRoots = ctx.numRoots;
    for (var rpi = 0; rpi < numRoots; rpi++) {
        var rpPos = schoolRootPositions[rpi];
        var rpIdx = schoolPts.length;
        schoolPts.push({
            x: rpPos.x, y: rpPos.y,
            used: false,
            neighbors: [],
            inCorridor: true
        });
        // Connect to nearby trunk grid points
        for (var rpci = 0; rpci < trunkCount; rpci++) {
            var rpdx = schoolPts[rpci].x - rpPos.x;
            var rpdy = schoolPts[rpci].y - rpPos.y;
            if (rpdx * rpdx + rpdy * rpdy <= tierSp * tierSp * 4) {
                schoolPts[rpIdx].neighbors.push(rpci);
                schoolPts[rpci].neighbors.push(rpIdx);
            }
        }
        // Fallback: connect to nearest trunk point
        if (schoolPts[rpIdx].neighbors.length === 0 && trunkCount > 0) {
            var rpBest = Infinity;
            var rpBestI = 0;
            for (var rpbi = 0; rpbi < trunkCount; rpbi++) {
                var rpbdx = schoolPts[rpbi].x - rpPos.x;
                var rpbdy = schoolPts[rpbi].y - rpPos.y;
                var rpbd = rpbdx * rpbdx + rpbdy * rpbdy;
                if (rpbd < rpBest) { rpBest = rpbd; rpBestI = rpbi; }
            }
            schoolPts[rpIdx].neighbors.push(rpBestI);
            schoolPts[rpBestI].neighbors.push(rpIdx);
        }
        rootLocalIdxs.push(rpIdx);
    }
    var rootLocalIdx = rootLocalIdxs[0];

    var totalPts = schoolPts.length;
    var totalNeighbors = 0;
    for (var tni = 0; tni < totalPts; tni++) {
        totalNeighbors += schoolPts[tni].neighbors.length;
    }
    console.log('[TreeGrowthTree] ' + schoolName + ': ' +
        trunkCount + ' trunk pts + ' +
        (totalPts - trunkCount - 1) + ' sector pts (avg ' +
        Math.round(totalNeighbors / totalPts * 10) / 10 +
        ' nbrs) for ' + allTreeNodes.length + ' nodes');

    // ==========================================================
    // E2) PRE-LAYOUT GRID EXPANSION
    //     If grid has fewer free points than nodes, generate
    //     synthetic sector points so every node can be placed.
    // ==========================================================
    var gridDeficit = allTreeNodes.length - totalPts;
    if (gridDeficit > 0) {
        var expansionAdded = 0;
        var expansionSet = {};
        for (var exi = 0; exi < schoolPts.length; exi++) {
            expansionSet[Math.round(schoolPts[exi].x) + ',' + Math.round(schoolPts[exi].y)] = true;
        }
        // Strategy 1: midpoint insertion between existing pairs
        var expMaxD2 = tierSp * tierSp * 5; // pairs within ~2.2x tierSp
        for (var epi = 0; epi < totalPts && expansionAdded < gridDeficit; epi++) {
            for (var enj = 0; enj < schoolPts[epi].neighbors.length && expansionAdded < gridDeficit; enj++) {
                var enbIdx = schoolPts[epi].neighbors[enj];
                if (enbIdx <= epi) continue;
                var emdx = schoolPts[enbIdx].x - schoolPts[epi].x;
                var emdy = schoolPts[enbIdx].y - schoolPts[epi].y;
                if (emdx * emdx + emdy * emdy > expMaxD2) continue;
                var emx = (schoolPts[epi].x + schoolPts[enbIdx].x) / 2;
                var emy = (schoolPts[epi].y + schoolPts[enbIdx].y) / 2;
                var emk = Math.round(emx) + ',' + Math.round(emy);
                if (expansionSet[emk]) continue;
                expansionSet[emk] = true;
                schoolPts.push({
                    x: emx, y: emy,
                    used: false,
                    neighbors: [epi, enbIdx],
                    inCorridor: false,
                    _synthetic: true
                });
                var newMidIdx = schoolPts.length - 1;
                schoolPts[epi].neighbors.push(newMidIdx);
                schoolPts[enbIdx].neighbors.push(newMidIdx);
                expansionAdded++;
            }
        }
        // Strategy 2: radial extension from outermost points
        var extRound = 0;
        var extSeedStart = 0;
        while (expansionAdded < gridDeficit && extRound < 30) {
            extRound++;
            var extAdded = 0;
            // Sort by distance from center (outermost first)
            var extSeeds = [];
            for (var esi = extSeedStart; esi < schoolPts.length; esi++) {
                var esr = (schoolPts[esi].x - baseMidX) * (schoolPts[esi].x - baseMidX) +
                          (schoolPts[esi].y - baseMidY) * (schoolPts[esi].y - baseMidY);
                extSeeds.push({ idx: esi, r2: esr });
            }
            extSeeds.sort(function(a, b) { return b.r2 - a.r2; });
            extSeedStart = schoolPts.length;
            for (var eki = 0; eki < extSeeds.length && expansionAdded < gridDeficit; eki++) {
                var ekIdx = extSeeds[eki].idx;
                var ekR = Math.sqrt(extSeeds[eki].r2);
                if (ekR < 1) continue;
                var enx = schoolPts[ekIdx].x + (schoolPts[ekIdx].x - baseMidX) / ekR * tierSp;
                var eny = schoolPts[ekIdx].y + (schoolPts[ekIdx].y - baseMidY) / ekR * tierSp;
                var enk = Math.round(enx) + ',' + Math.round(eny);
                if (expansionSet[enk]) continue;
                expansionSet[enk] = true;
                var newExtIdx = schoolPts.length;
                schoolPts.push({
                    x: enx, y: eny,
                    used: false,
                    neighbors: [ekIdx],
                    inCorridor: false,
                    _synthetic: true
                });
                schoolPts[ekIdx].neighbors.push(newExtIdx);
                expansionAdded++;
                extAdded++;
            }
            if (extAdded === 0) break;
        }
        totalPts = schoolPts.length;
        console.log('[TreeGrowthTree] ' + schoolName + ': pre-layout expansion added ' +
            expansionAdded + ' points (deficit was ' + gridDeficit + ', now ' + totalPts + ' pts)');
    }

    // Store results on context
    ctx.schoolPts = schoolPts;
    ctx.trunkCount = trunkCount;
    ctx.sectorStart = sectorStart;
    ctx.trunkMaxAlong = trunkMaxAlong;
    ctx.rootLocalIdxs = rootLocalIdxs;
    ctx.rootLocalIdx = rootLocalIdx;
};

// =========================================================================
// PHASE 1: TRUNK BFS
// =========================================================================

/**
 * Phase 1: Level-by-level BFS filling the corridor grid.
 * All roots take turns (random round-robin within each level).
 * Children that cannot fit in corridor are deferred to branches.
 *
 * @param {Object} ctx - Per-school layout context
 */
TreeGrowthTree._placeTrunkBFS = function(ctx) {
    var self = this;
    var schoolPts = ctx.schoolPts;
    var trunkCount = ctx.trunkCount;

    var trunkBfsQueue = [ctx.rootSpellId];
    while (trunkBfsQueue.length > 0) {
        // Shuffle current level for random round-robin
        for (var shI = trunkBfsQueue.length - 1; shI > 0; shI--) {
            var shJ = Math.floor(Math.random() * (shI + 1));
            var shT = trunkBfsQueue[shI];
            trunkBfsQueue[shI] = trunkBfsQueue[shJ];
            trunkBfsQueue[shJ] = shT;
        }

        var nextLevel = [];
        for (var tqi = 0; tqi < trunkBfsQueue.length; tqi++) {
            var tCurId = trunkBfsQueue[tqi];
            var tCurNode = ctx.nodeLookup[tCurId];
            if (!tCurNode || !tCurNode.children || tCurNode.children.length === 0) continue;

            var tParentPos = ctx.posMap[tCurId];
            var tParentGIdx = ctx.gridIdxMap[tCurId];
            if (!tParentPos) continue;

            var tChildren = tCurNode.children.slice();
            tChildren.sort(function(a, b) {
                return (ctx.subtreeSize[a] || 1) - (ctx.subtreeSize[b] || 1);
            });

            var tSibDirs = [];

            for (var tci = 0; tci < tChildren.length; tci++) {
                var tChildId = tChildren[tci];
                if (ctx.posMap[tChildId] || !ctx.nodeLookup[tChildId]) continue;

                // Trunk target reached — defer remaining children to branches
                if (ctx.trunkPlaced >= ctx.trunkTarget) {
                    ctx.deferredNodes.push({ childId: tChildId, parentId: tCurId });
                    continue;
                }

                // Determine anchor: root's children use their assigned root position
                var childAnchorPos = tParentPos;
                var childAnchorGIdx = tParentGIdx;
                if (tCurId === ctx.rootSpellId && ctx.childToRootIdx[tChildId] !== undefined) {
                    var aRIdx = ctx.childToRootIdx[tChildId];
                    childAnchorPos = ctx.schoolRootPositions[aRIdx];
                    childAnchorGIdx = ctx.rootLocalIdxs[aRIdx];
                }

                var bestIdx = -1;
                var bestScore = -Infinity;

                // 1-hop: corridor neighbors only
                if (childAnchorGIdx !== undefined && childAnchorGIdx >= 0) {
                    var tNbrs = schoolPts[childAnchorGIdx].neighbors;
                    for (var tnbi = 0; tnbi < tNbrs.length; tnbi++) {
                        var tnIdx = tNbrs[tnbi];
                        if (schoolPts[tnIdx].used || !schoolPts[tnIdx].inCorridor) continue;
                        var tsc = self._scoreCandidate(schoolPts, tnIdx,
                            childAnchorPos.x, childAnchorPos.y, ctx.gdx, ctx.gdy, tSibDirs);
                        if (tsc > bestScore) { bestScore = tsc; bestIdx = tnIdx; }
                    }
                }

                if (bestIdx >= 0) {
                    ctx.placeStats.trunkHop1++;
                }

                // Multi-hop on corridor (up to 4 hops)
                if (bestIdx < 0 && childAnchorGIdx !== undefined && childAnchorGIdx >= 0) {
                    var tVisited = {};
                    tVisited[childAnchorGIdx] = true;
                    var tSearchQ = [{ idx: childAnchorGIdx, hops: 0 }];
                    var tCands = [];
                    var tSearched = 0;
                    while (tSearchQ.length > 0 && tSearched < 200) {
                        var tsq = tSearchQ.shift();
                        tSearched++;
                        var tCurN = schoolPts[tsq.idx].neighbors;
                        for (var tsi = 0; tsi < tCurN.length; tsi++) {
                            var tsIdx = tCurN[tsi];
                            if (tVisited[tsIdx]) continue;
                            tVisited[tsIdx] = true;
                            if (!schoolPts[tsIdx].inCorridor) continue;
                            if (!schoolPts[tsIdx].used) {
                                tCands.push({ idx: tsIdx, hops: tsq.hops + 1 });
                                if (tCands.length >= 8) { tSearchQ = []; break; }
                            }
                            if (tsq.hops < 4) {
                                tSearchQ.push({ idx: tsIdx, hops: tsq.hops + 1 });
                            }
                        }
                    }
                    if (tCands.length > 0) {
                        var thBest = -Infinity;
                        for (var thci = 0; thci < tCands.length; thci++) {
                            var thScore = self._scoreCandidate(schoolPts, tCands[thci].idx,
                                childAnchorPos.x, childAnchorPos.y, ctx.gdx, ctx.gdy, tSibDirs)
                                - tCands[thci].hops * 0.5;
                            if (thScore > thBest) {
                                thBest = thScore;
                                bestIdx = tCands[thci].idx;
                            }
                        }
                        if (bestIdx >= 0) ctx.placeStats.trunkMulti++;
                    }
                }

                // Direct corridor scan
                if (bestIdx < 0 && ctx.trunkPlaced < ctx.trunkTarget) {
                    var dcBestDist = Infinity;
                    for (var dci = 0; dci < trunkCount; dci++) {
                        if (schoolPts[dci].used) continue;
                        var dcdx = schoolPts[dci].x - childAnchorPos.x;
                        var dcdy = schoolPts[dci].y - childAnchorPos.y;
                        var dcAlong = dcdx * ctx.gdx + dcdy * ctx.gdy;
                        if (dcAlong < 0) continue;
                        var dcDist = dcdx * dcdx + dcdy * dcdy;
                        if (dcDist < dcBestDist) {
                            dcBestDist = dcDist;
                            bestIdx = dci;
                        }
                    }
                    if (bestIdx >= 0) ctx.placeStats.trunkMulti++;
                }

                if (bestIdx < 0) {
                    ctx.deferredNodes.push({ childId: tChildId, parentId: tCurId });
                    continue;
                }

                self._recordSibDir(schoolPts, bestIdx,
                    childAnchorPos.x, childAnchorPos.y, tSibDirs);

                schoolPts[bestIdx].used = true;
                ctx.posMap[tChildId] = { x: schoolPts[bestIdx].x, y: schoolPts[bestIdx].y };
                ctx.gridIdxMap[tChildId] = bestIdx;
                ctx.trunkPlaced++;
                ctx.placedCount++;

                // Edge: from anchor position (assigned root for root children, parent for others)
                var edgeFromPos = childAnchorPos;
                if (tCurId !== ctx.rootSpellId) edgeFromPos = tParentPos;

                ctx.allNodes.push({
                    x: schoolPts[bestIdx].x, y: schoolPts[bestIdx].y,
                    color: ctx.schoolColor,
                    skillLevel: ctx.nodeLookup[tChildId].skillLevel || ''
                });
                ctx.allEdges.push({
                    x1: edgeFromPos.x, y1: edgeFromPos.y,
                    x2: schoolPts[bestIdx].x, y2: schoolPts[bestIdx].y,
                    color: ctx.schoolColor
                });
                ctx.parentMap[tChildId] = tCurId;

                ctx.dirMap[tChildId] = { dx: ctx.gdx, dy: ctx.gdy };
                nextLevel.push(tChildId);
            }
        }
        trunkBfsQueue = nextLevel;
    }
};
