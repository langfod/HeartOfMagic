/**
 * ClassicLayout — Grid layout algorithm (method extension).
 *
 * Adds the _layoutOnGrid method which places tree nodes on actual grid
 * dot positions using adjacency BFS with 4 phases:
 *   Phase 1: Seed all physical roots before BFS
 *   Phase 2: Wave-based fair BFS across all roots
 *   Phase 3: Place deferred nodes (tier zone mismatch recovery)
 *   Phase 4: Force-place remaining (delegates to _forcePlaceRemaining)
 *
 * Loaded after: classicLayoutCore.js, classicLayoutSpell.js
 */

// ---- GRID-AWARE LAYOUT --------------------------------------------------

/**
 * Place tree nodes on actual grid dot positions using adjacency BFS.
 * Works for both SUN and FLAT modes since gridPoints are already in
 * world-space coordinates relative to center.
 */
ClassicLayout._layoutOnGrid = function (schoolTree, schoolInfo, schoolRoots, grid, schoolGridPts, mode) {
    // Use appropriate spacing for adjacency: tierSpacing for SUN, grid.spacing for FLAT
    var tierSpacing = grid.tierSpacing || grid.spacing || 30;
    var ringRadius = grid.ringRadius || ((grid.ringTier || 3) * tierSpacing);
    var isFlat = (mode === 'flat');

    // Center mask: non-root nodes cannot be placed inside this radius
    var centerMaskR = (this._centerMask || 0) * tierSpacing;
    var centerMaskR2 = centerMaskR * centerMaskR;

    if (!schoolGridPts || schoolGridPts.length === 0) {
        console.warn('[ClassicLayout] No grid points for school');
        return [];
    }

    // Count tree nodes to check if grid has enough capacity
    var nodeCount = schoolTree.nodes ? schoolTree.nodes.length : 0;
    var deficit = nodeCount - schoolGridPts.length;
    // Also check grid depth: estimate tiers needed and ensure grid extends far enough
    if (nodeCount > 0) {
        var estimatedTiers = Math.ceil(Math.sqrt(nodeCount)) + 5;
        var neededRadius = ringRadius + tierSpacing * estimatedTiers;
        var currentMaxR = 0;
        for (var cri = 0; cri < schoolGridPts.length; cri++) {
            var crp = schoolGridPts[cri];
            var crr = Math.sqrt(crp.x * crp.x + crp.y * crp.y);
            if (crr > currentMaxR) currentMaxR = crr;
        }
        if (currentMaxR < neededRadius) {
            var depthDeficit = Math.ceil((neededRadius - currentMaxR) / tierSpacing) * 4;
            deficit = Math.max(deficit, depthDeficit);
        }
    }
    if (deficit > 0) {
        console.log('[ClassicLayout] Grid deficit: ' + nodeCount + ' nodes vs ' +
            schoolGridPts.length + ' points, expanding by ' + deficit);
        schoolGridPts = this._densifyGrid(schoolGridPts, deficit, tierSpacing);
    }

    // Compute max grid radius for radius-based tier zone scoring
    this._ringRadius = ringRadius;
    var schoolMaxR = 0;
    for (var mri = 0; mri < schoolGridPts.length; mri++) {
        var mrp = schoolGridPts[mri];
        var mrr = Math.sqrt(mrp.x * mrp.x + mrp.y * mrp.y);
        if (mrr > schoolMaxR) schoolMaxR = mrr;
    }
    this._maxGridRadius = schoolMaxR;

    // 1. Build adjacency graph from the actual grid points
    var gridGraph = this._buildGridGraph(schoolGridPts, tierSpacing);

    var nodeLookup = this._buildNodeLookup(schoolTree.nodes);
    this._currentNodeLookup = nodeLookup;
    var rootFormId = schoolTree.root;
    if (!nodeLookup[rootFormId]) return [];

    // Smart mode: dynamically discover themes and override nodeLookup
    if (this._smartThemes && typeof ClassicThemeEngine !== 'undefined') {
        var smartSpells = this._getSpellData();
        var refined = ClassicThemeEngine.discoverAndAssign(schoolTree.nodes, smartSpells);
        for (var rfId in refined) {
            if (refined.hasOwnProperty(rfId) && nodeLookup[rfId]) {
                nodeLookup[rfId].theme = refined[rfId];
            }
        }
    }

    // Sanitize tree: rescue orphans, cap fan-out
    this._sanitizeTree(nodeLookup, rootFormId);

    // Compute theme angular sectors for this school (layered/smart mode only)
    this._currentThemeSectors = null;
    if (this._useThemeScoring) {
        var growAngleDir = schoolRoots.length > 0
            ? { x: Math.cos(schoolRoots[0].dir || 0), y: Math.sin(schoolRoots[0].dir || 0) }
            : { x: 1, y: 0 };
        this._currentThemeSectors = this._computeThemeSectors(
            schoolTree.nodes, growAngleDir.x, growAngleDir.y
        );
    }

    var rootNode = nodeLookup[rootFormId];
    var rootChildren = rootNode.children || [];
    var groups = this._buildGroups(rootFormId, rootChildren, schoolRoots, nodeLookup);

    var positioned = [];
    var placed = {};    // formId -> true (tree nodes already positioned)
    var occupied = {};  // grid point index -> true
    var queued = {};    // formId -> true (in BFS queue, prevents double-assign)
    var spells = this._getSpellData();
    // Build spell lookup map for O(1) access instead of O(N) linear scan
    var spellMap = {};
    if (spells) {
        for (var smi = 0; smi < spells.length; smi++) {
            if (spells[smi].formId) spellMap[spells[smi].formId] = spells[smi];
        }
    }
    this._spellMap = spellMap;
    var deferredNodes = []; // shared across phases 1-3

    // ==== Phase 1: Seed ALL physical roots before any BFS ====
    // Pre-queue seeds across all groups so no group steals another's seeds.
    // Seeds whose tier zone doesn't include root depth (0%) are deferred.
    var groupQueues = [];
    var groupDirs = [];
    var groupMinR2s = [];

    for (var gi = 0; gi < groups.length; gi++) {
        var group = groups[gi];
        var physRoot = group.physicalRoot;
        var growDirX = Math.cos(physRoot.dir || 0);
        var growDirY = Math.sin(physRoot.dir || 0);

        var minR2 = 0;
        if (!isFlat && this._isOutward(physRoot)) {
            var minR = ringRadius - tierSpacing * 0.5;
            minR2 = minR * minR;
        }

        groupDirs.push({ x: growDirX, y: growDirY });
        groupMinR2s.push(minR2);

        // Skip empty groups (more physical roots than children)
        if (group.seedIds.length === 0) {
            groupQueues.push([]);
            continue;
        }

        var rootIdx = this._snapToNearest(gridGraph.points, physRoot.x, physRoot.y);
        if (rootIdx < 0) {
            groupQueues.push([]);
            continue;
        }

        // Filter seeds: non-root seeds whose tier zone doesn't include
        // this position are deferred. Uses simulated max radius from pass 1.
        var groupRootId = group.seedIds[0];
        var validSeeds = [groupRootId]; // first seed always placed (group root)

        // Compute seed position's radial % using pass 1 simulated height
        var seedR = Math.sqrt(physRoot.x * physRoot.x + physRoot.y * physRoot.y);
        var sfRingR = this._ringRadius || 0;
        var sfSimMax = this._simulatedMaxRadius || this._maxGridRadius || 1;
        var sfGrowR = sfSimMax - sfRingR;
        var seedPct = sfGrowR > 1 ? ((seedR - sfRingR) / sfGrowR) * 100 : 0;
        if (seedPct < 0) seedPct = 0;

        for (var sf = 1; sf < group.seedIds.length; sf++) {
            var sfId = group.seedIds[sf];
            var sfSpell = this._findSpell(sfId, spells);
            var sfLevel = sfSpell ? sfSpell.skillLevel : '';
            var sfZone = this._tierZones ? this._tierZones[sfLevel] : null;
            var sfNodeInfo = nodeLookup[sfId];
            var sfTheme = sfNodeInfo ? sfNodeInfo.theme : null;
            if (sfZone && (seedPct < sfZone.min - 5 || seedPct > sfZone.max + 5)) {
                // Seed position outside this tier's zone — defer
                deferredNodes.push({
                    formId: sfId,
                    originalParent: groupRootId,
                    skillLevel: sfLevel,
                    theme: sfTheme,
                    groupIdx: gi
                });
                queued[sfId] = true;
            } else {
                validSeeds.push(sfId);
            }
        }

        // Reserve grid positions for valid seeds only
        var seedPositions = [rootIdx];
        occupied[rootIdx] = true;
        if (validSeeds.length > 1) {
            var seedNodeInfo = nodeLookup[groupRootId];
            var seedTheme = seedNodeInfo ? seedNodeInfo.theme : null;
            var extraSlots = this._findSlots(
                gridGraph, occupied, rootIdx,
                validSeeds.length - 1, growDirX, growDirY, minR2,
                null, 0, seedTheme
            );
            for (var es = 0; es < extraSlots.length; es++) {
                seedPositions.push(extraSlots[es]);
                occupied[extraSlots[es]] = true;
            }
        }

        // Queue valid seeds — first seed is independent root,
        // additional seeds parent to the group's first seed.
        var gQueue = [];
        for (var si = 0; si < validSeeds.length; si++) {
            var sid = validSeeds[si];
            if (placed[sid] || queued[sid]) continue;
            if (si >= seedPositions.length) break;

            var seedX, seedY;
            if (si === 0) {
                seedX = physRoot.x;
                seedY = physRoot.y;
            } else {
                var seedPt = gridGraph.points[seedPositions[si]];
                seedX = seedPt.x;
                seedY = seedPt.y;
            }
            queued[sid] = true;
            gQueue.push({
                formId: sid,
                parentFormId: si === 0 ? null : groupRootId,
                gridIdx: seedPositions[si],
                x: seedX,
                y: seedY,
                depth: si === 0 ? 0 : 1
            });
        }
        groupQueues.push(gQueue);
    }

    console.log('[ClassicLayout] Phase 1 complete: ' + groupQueues.length +
        ' root groups, seeds queued: ' + Object.keys(queued).length);

    // ==== Phase 2: Wave-based fair BFS across all roots ====
    // Each wave: collect ALL frontier nodes from ALL groups, shuffle
    // randomly, process each one. Children spawned this wave form the
    // NEXT wave. This ensures every root tree grows at the same rate.

    // Build first wave from all group seed queues
    var currentWave = [];
    for (var gi2 = 0; gi2 < groupQueues.length; gi2++) {
        var gq = groupQueues[gi2];
        for (var qi = 0; qi < gq.length; qi++) {
            gq[qi].groupIdx = gi2;
            currentWave.push(gq[qi]);
        }
    }

    var waveNum = 0;
    while (currentWave.length > 0) {
        // Shuffle this wave so no group consistently goes first
        this._shuffleArray(currentWave);

        var nextWave = [];
        for (var wi = 0; wi < currentWave.length; wi++) {
            var cur = currentWave[wi];
            if (placed[cur.formId]) continue;
            placed[cur.formId] = true;

            var curNode = nodeLookup[cur.formId];
            if (!curNode) continue;

            var spellInfo = this._findSpell(cur.formId, spells);
            positioned.push({
                formId: cur.formId,
                x: cur.x,
                y: cur.y,
                parentFormId: cur.parentFormId,
                tier: curNode.tier || 0,
                skillLevel: spellInfo ? spellInfo.skillLevel : '',
                theme: curNode.theme || '',
                name: spellInfo ? spellInfo.name : cur.formId,
                isRoot: cur.parentFormId === null,
                gridIdx: cur.gridIdx
            });

            // Collect children for NEXT wave (not current)
            var children = curNode.children || [];
            if (children.length === 0) continue;

            // Sort children by tier: Novice first → Master last
            if (children.length > 1 && this._tierZones) {
                var tierOrd = { 'Novice': 0, 'Apprentice': 1, 'Adept': 2, 'Expert': 3, 'Master': 4 };
                var sortSelf = this;
                children = children.slice();
                children.sort(function (a, b) {
                    var sa = sortSelf._findSpell(a, spells);
                    var sb = sortSelf._findSpell(b, spells);
                    var ta = sa ? (tierOrd[sa.skillLevel] || 0) : 0;
                    var tb = sb ? (tierOrd[sb.skillLevel] || 0) : 0;
                    return ta - tb;
                });
            }

            var curGI = cur.groupIdx;
            var gDir = groupDirs[curGI];
            var gMinR2 = groupMinR2s[curGI];
            var childMinR2 = Math.max(gMinR2, centerMaskR2);

            // Compute parent's radial position for deferral check
            var curR = Math.sqrt(cur.x * cur.x + cur.y * cur.y);
            var dRingR = this._ringRadius || 0;
            var dSimMax = this._simulatedMaxRadius || this._maxGridRadius || 1;
            var dGrowR = dSimMax - dRingR;
            var curPct = dGrowR > 1 ? ((curR - dRingR) / dGrowR) * 100 : 50;

            for (var ci2 = 0; ci2 < children.length; ci2++) {
                var childId = children[ci2];
                if (placed[childId] || queued[childId]) continue;

                var childSpell = this._findSpell(childId, spells);
                var childLevel = childSpell ? childSpell.skillLevel : '';
                var childNodeInfo = nodeLookup[childId];
                var childTheme = childNodeInfo ? childNodeInfo.theme : null;

                // Defer children whose tier zone starts well beyond parent's radius
                var childZone = this._tierZones ? this._tierZones[childLevel] : null;
                if (childZone && curPct < childZone.min - 10) {
                    deferredNodes.push({
                        formId: childId,
                        originalParent: cur.formId,
                        skillLevel: childLevel,
                        theme: childTheme,
                        groupIdx: curGI
                    });
                    queued[childId] = true;
                    continue;
                }

                var childSlots = this._findSlots(
                    gridGraph, occupied, cur.gridIdx,
                    1, gDir.x, gDir.y, childMinR2,
                    childLevel, cur.depth + 1, childTheme
                );
                if (childSlots.length === 0) {
                    // Defer instead of silently dropping
                    deferredNodes.push({
                        formId: childId,
                        originalParent: cur.formId,
                        skillLevel: childLevel,
                        theme: childTheme,
                        groupIdx: curGI
                    });
                    queued[childId] = true;
                    continue;
                }

                var gIdx = childSlots[0];
                occupied[gIdx] = true;
                queued[childId] = true;

                var slotPt = gridGraph.points[gIdx];
                nextWave.push({
                    formId: childId,
                    parentFormId: cur.formId,
                    gridIdx: gIdx,
                    x: slotPt.x,
                    y: slotPt.y,
                    depth: cur.depth + 1,
                    groupIdx: curGI
                });
            }
        }

        waveNum++;
        currentWave = nextWave;
    }

    console.log('[ClassicLayout] Phase 2 complete: ' + waveNum + ' waves, ' +
        positioned.length + ' nodes placed');

    // Build parent-child count for fan-out cap enforcement across phases 3-4
    var FAN_OUT_CAP = 5;
    var parentChildCount = {};
    for (var pcci = 0; pcci < positioned.length; pcci++) {
        var pccParent = positioned[pcci].parentFormId;
        if (pccParent) {
            parentChildCount[pccParent] = (parentChildCount[pccParent] || 0) + 1;
        }
    }

    // ==== Phase 3: Place deferred nodes ====
    // Nodes deferred from Phase 2: tier zone mismatch OR no adjacent slots.
    // Try to attach to placed nodes, preferring tier zone radius when available.
    if (deferredNodes.length > 0) {
        console.log('[ClassicLayout] Deferred nodes: ' + deferredNodes.length);

        var dfRingR = this._ringRadius || 0;
        var dfSimMax = this._simulatedMaxRadius || this._maxGridRadius || 1;
        var dfGrowR = dfSimMax - dfRingR;

        var dfQueue = deferredNodes;
        var maxPasses = 30;
        for (var dfPass = 0; dfPass < maxPasses && dfQueue.length > 0; dfPass++) {
            var dfRemaining = [];
            var dfPlaced = 0;

            var dfTierOrd = { 'Novice': 0, 'Apprentice': 1, 'Adept': 2, 'Expert': 3, 'Master': 4 };
            dfQueue.sort(function (a, b) {
                return (dfTierOrd[a.skillLevel] || 0) - (dfTierOrd[b.skillLevel] || 0);
            });

            for (var di = 0; di < dfQueue.length; di++) {
                var def = dfQueue[di];
                if (placed[def.formId]) continue;

                var defZone = this._tierZones ? this._tierZones[def.skillLevel] : null;

                // Find best attach point among placed nodes
                var bestAttachGridIdx = -1;
                var bestAttachFormId = null;
                var bestScore = -Infinity;

                for (var pi = 0; pi < positioned.length; pi++) {
                    var pn = positioned[pi];
                    if (pn.gridIdx === undefined) continue;

                    var pAdj = gridGraph.adj[pn.gridIdx] || [];
                    var hasOpen = false;
                    for (var ai = 0; ai < pAdj.length; ai++) {
                        if (!occupied[pAdj[ai]]) { hasOpen = true; break; }
                    }
                    if (!hasOpen) continue;

                    var dfScore = 0;

                    // Prefer original parent if placed
                    if (pn.formId === def.originalParent) {
                        dfScore += 200;
                    }

                    // Tier zone preference (soft, not hard filter)
                    if (defZone) {
                        var pnR = Math.sqrt(pn.x * pn.x + pn.y * pn.y);
                        var pnPct = dfGrowR > 1 ? ((pnR - dfRingR) / dfGrowR) * 100 : 50;
                        if (pnPct >= defZone.min - 15 && pnPct <= defZone.max + 15) {
                            var dfZoneMid = (defZone.min + defZone.max) / 2;
                            dfScore += 50 - Math.abs(pnPct - dfZoneMid) * 0.5;
                        }
                    }

                    // Theme affinity: strong preference for same-theme parent (layered mode)
                    var defTheme = def.theme || null;
                    if (this._useThemeScoring && defTheme && defTheme !== '_none') {
                        var pnNodeInfo = nodeLookup[pn.formId];
                        var pnTheme = pnNodeInfo ? pnNodeInfo.theme : null;
                        if (pnTheme === defTheme) {
                            dfScore += 150;
                        } else if (pnTheme && pnTheme !== '_none') {
                            dfScore -= 30;
                        }
                    }

                    // Tier ordering: parent should be at lower or equal tier
                    var dfTierOrdMap = { 'Novice': 1, 'Apprentice': 2, 'Adept': 3, 'Expert': 4, 'Master': 5 };
                    var defTierVal = dfTierOrdMap[def.skillLevel] || 3;
                    var pnTierVal = dfTierOrdMap[pn.skillLevel] || 3;
                    if (pnTierVal > defTierVal) {
                        // Parent tier higher than child — wrong direction
                        dfScore -= 300;
                    } else if (pnTierVal === defTierVal - 1) {
                        // Ideal: immediate predecessor tier
                        dfScore += 30;
                    }

                    // Fan-out cap: strongly discourage parents already at limit
                    var pnCC = parentChildCount[pn.formId] || 0;
                    if (pnCC >= FAN_OUT_CAP) {
                        dfScore -= 500;
                    }

                    if (dfScore > bestScore) {
                        bestScore = dfScore;
                        bestAttachGridIdx = pn.gridIdx;
                        bestAttachFormId = pn.formId;
                    }
                }

                if (bestAttachGridIdx < 0) { dfRemaining.push(def); continue; }

                var dfDir = groupDirs[def.groupIdx] || groupDirs[0];
                var dfMinR2 = groupMinR2s[def.groupIdx] || 0;
                var dfChildMinR2 = Math.max(dfMinR2, centerMaskR2);

                var dfSlots = this._findSlots(
                    gridGraph, occupied, bestAttachGridIdx,
                    1, dfDir.x, dfDir.y, dfChildMinR2,
                    def.skillLevel, 0, def.theme
                );
                if (dfSlots.length === 0) { dfRemaining.push(def); continue; }

                var dfIdx = dfSlots[0];
                occupied[dfIdx] = true;
                placed[def.formId] = true;
                dfPlaced++;

                var dfPt = gridGraph.points[dfIdx];
                var dfSpell = this._findSpell(def.formId, spells);
                var dfNodeInfo = nodeLookup[def.formId];
                positioned.push({
                    formId: def.formId,
                    x: dfPt.x,
                    y: dfPt.y,
                    parentFormId: bestAttachFormId,
                    tier: 0,
                    skillLevel: dfSpell ? dfSpell.skillLevel : def.skillLevel,
                    theme: dfNodeInfo ? dfNodeInfo.theme : (def.theme || ''),
                    name: dfSpell ? dfSpell.name : def.formId,
                    isRoot: false,
                    gridIdx: dfIdx
                });
                parentChildCount[bestAttachFormId] = (parentChildCount[bestAttachFormId] || 0) + 1;

                // Enqueue children
                if (dfNodeInfo && dfNodeInfo.children) {
                    for (var dci = 0; dci < dfNodeInfo.children.length; dci++) {
                        var dcId = dfNodeInfo.children[dci];
                        if (placed[dcId] || queued[dcId]) continue;
                        var dcSpell = this._findSpell(dcId, spells);
                        var dcLevel = dcSpell ? dcSpell.skillLevel : '';
                        var dcNodeInfo = nodeLookup[dcId];
                        var dcTheme = dcNodeInfo ? dcNodeInfo.theme : null;
                        dfRemaining.push({
                            formId: dcId,
                            originalParent: def.formId,
                            skillLevel: dcLevel,
                            theme: dcTheme,
                            groupIdx: def.groupIdx
                        });
                        queued[dcId] = true;
                    }
                }
            }

            dfQueue = dfRemaining;
            if (dfPlaced === 0) break;
        }

        console.log('[ClassicLayout] Deferred placement done, remaining: ' + dfQueue.length);
    }

    // ==== Phase 4: Force-place any remaining unplaced nodes ====
    var allNodeIds = Object.keys(nodeLookup);
    var unplacedIds = [];
    for (var ui = 0; ui < allNodeIds.length; ui++) {
        if (!placed[allNodeIds[ui]]) unplacedIds.push(allNodeIds[ui]);
    }

    if (unplacedIds.length > 0) {
        this._forcePlaceRemaining({
            nodeLookup: nodeLookup, placed: placed, occupied: occupied,
            positioned: positioned, gridGraph: gridGraph, spells: spells,
            parentChildCount: parentChildCount, fanOutCap: FAN_OUT_CAP,
            schoolGridPts: schoolGridPts, tierSpacing: tierSpacing,
            unplacedIds: unplacedIds, allNodeIds: allNodeIds
        });
    }

    return positioned;
};

/**
 * Find the grid point nearest to (x, y).
 * @returns {number} index into points array, or -1 if empty
 */
ClassicLayout._snapToNearest = function (points, x, y) {
    var bestIdx = -1;
    var bestDist = Infinity;
    for (var i = 0; i < points.length; i++) {
        var dx = points[i].x - x;
        var dy = points[i].y - y;
        var d2 = dx * dx + dy * dy;
        if (d2 < bestDist) {
            bestDist = d2;
            bestIdx = i;
        }
    }
    return bestIdx;
};
