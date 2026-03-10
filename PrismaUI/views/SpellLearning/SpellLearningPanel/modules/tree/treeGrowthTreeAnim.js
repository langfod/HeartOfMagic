/**
 * Tree Growth Tree — Anim (Branch/Root Growth + State)
 *
 * Method-extension of TreeGrowthTree (defined in treeGrowthTree.js).
 * Provides branch origin collection, branch placement, root growth,
 * catch-all placement, dirty tracking, and settings accessors.
 *
 * MUST be loaded last — ends with TreeGrowth.registerMode().
 */

// =========================================================================
// BRANCH ORIGIN COLLECTION
// =========================================================================

/**
 * Collect top 10% of trunk nodes as branch origins (furthest first).
 * @param {Object} ctx - Per-school layout context
 */
TreeGrowthTree._collectBranchOrigins = function(ctx) {
    var trunkPlacedList = [];
    for (var ttk in ctx.posMap) {
        if (!ctx.posMap.hasOwnProperty(ttk)) continue;
        var ttgi = ctx.gridIdxMap[ttk];
        if (ttgi === undefined || !ctx.schoolPts[ttgi].inCorridor) continue;
        var ttProj = (ctx.posMap[ttk].x - ctx.rootPos.x) * ctx.gdx +
                     (ctx.posMap[ttk].y - ctx.rootPos.y) * ctx.gdy;
        trunkPlacedList.push({ id: ttk, proj: ttProj, gIdx: ttgi });
    }
    trunkPlacedList.sort(function(a, b) { return b.proj - a.proj; });

    // Take top 10% (at least 3, at most 20) as branch origins
    var topCount = Math.max(3, Math.min(20, Math.ceil(trunkPlacedList.length * 0.10)));
    if (topCount > trunkPlacedList.length) topCount = trunkPlacedList.length;
    var branchOrigins = [];
    for (var toi = 0; toi < topCount; toi++) {
        var toEntry = trunkPlacedList[toi];
        branchOrigins.push({
            id: toEntry.id,
            pos: ctx.posMap[toEntry.id],
            gIdx: toEntry.gIdx,
            proj: toEntry.proj
        });
    }

    ctx.branchOrigins = branchOrigins;
    ctx.trunkTipPos = branchOrigins.length > 0 ? branchOrigins[0].pos : ctx.rootPos;
    ctx.trunkTipGIdx = branchOrigins.length > 0 ? branchOrigins[0].gIdx : ctx.rootLocalIdx;
    ctx.trunkTipProj = branchOrigins.length > 0 ? branchOrigins[0].proj : 0;

    console.log('[TreeGrowthTree] ' + ctx.schoolName + ': trunk placed ' +
        ctx.trunkPlaced + '/' + ctx.trunkTarget + ' (target), deferred ' + ctx.deferredNodes.length +
        ', retry=' + ctx.placeStats.trunkRetry +
        ', branch origins ' + branchOrigins.length +
        ', tip at (' + Math.round(ctx.trunkTipPos.x) + ',' + Math.round(ctx.trunkTipPos.y) + ')');
};

// =========================================================================
// PHASE 2: BRANCH PLACEMENT
// =========================================================================

/**
 * Place deferred nodes as branches fanning out from trunk tip.
 * @param {Object} ctx - Per-school layout context
 */
TreeGrowthTree._placeBranchPhase = function(ctx) {
    var self = this;
    var schoolPts = ctx.schoolPts;
    var branchOrigins = ctx.branchOrigins;
    var tierSp = ctx.tierSp;
    var branchSpread = ctx.branchSpread;
    var minHops = Math.max(1, Math.round(branchSpread));

    // Build a set of deferred node IDs for quick lookup
    var deferredSet = {};
    for (var di = 0; di < ctx.deferredNodes.length; di++) {
        deferredSet[ctx.deferredNodes[di].childId] = true;
    }
    // Assign each deferred node to a branch origin with a unique fan angle
    var branchDfsStack = [];
    var branchPushedBy = {};
    var originRR = 0; // round-robin counter
    var fanArc = Math.PI * 0.83; // +/-75 deg from growth direction
    for (var bqi = 0; bqi < ctx.deferredNodes.length; bqi++) {
        var defId = ctx.deferredNodes[bqi].childId;
        // Round-robin across origins for even distribution
        var assignedOrigin = branchOrigins[originRR % branchOrigins.length];
        originRR++;
        // Fan angle: spread evenly across arc centered on growth direction
        var fanT = ctx.deferredNodes.length > 1
            ? (bqi / (ctx.deferredNodes.length - 1)) * 2 - 1  // -1 to +1
            : 0;
        // Store the assigned origin and fan angle for this deferred node
        deferredSet[defId] = {
            originPos: assignedOrigin.pos,
            originGIdx: assignedOrigin.gIdx,
            originId: assignedOrigin.id,
            fanAngle: fanT * (fanArc / 2)
        };
        branchDfsStack.push(defId);
        branchPushedBy[defId] = assignedOrigin.id;
    }

    // Build placed positions list for empty-space scoring
    var schoolPlaced = [];
    for (var spk in ctx.posMap) {
        if (ctx.posMap.hasOwnProperty(spk)) {
            schoolPlaced.push(ctx.posMap[spk]);
        }
    }
    var densityRadSq = tierSp * tierSp * 4;
    // Shuffle deferred batch so no fan-angle side gets priority
    for (var shi = branchDfsStack.length - 1; shi > 0; shi--) {
        var shj = Math.floor(Math.random() * (shi + 1));
        var shTmp = branchDfsStack[shi];
        branchDfsStack[shi] = branchDfsStack[shj];
        branchDfsStack[shj] = shTmp;
    }

    // Process branches: BFS (shift) so all deferred nodes place
    // before any children — ensures balanced fan distribution
    while (branchDfsStack.length > 0) {
        if (ctx.placedCount >= ctx.maxPlaceable) break;
        if (ctx.branchPlaced >= ctx.branchTarget) break;
        var bNodeId = branchDfsStack.shift();

        if (ctx.posMap[bNodeId]) {
            // Already placed — process children
            var bNode = ctx.nodeLookup[bNodeId];
            if (bNode && bNode.children) {
                var bSorted = bNode.children.slice();
                bSorted.sort(function(a, b) {
                    return (ctx.subtreeSize[a] || 1) - (ctx.subtreeSize[b] || 1);
                });
                for (var bci = 0; bci < bSorted.length; bci++) {
                    if (!ctx.posMap[bSorted[bci]]) {
                        branchDfsStack.push(bSorted[bci]);
                        branchPushedBy[bSorted[bci]] = bNodeId;
                    }
                }
            }
            continue;
        }

        if (!ctx.nodeLookup[bNodeId]) continue;

        // Determine placement anchor
        var anchorPos, anchorGIdx, edgeParentPos;

        if (deferredSet[bNodeId] && typeof deferredSet[bNodeId] === 'object') {
            // Deferred trunk child: anchor to assigned origin
            anchorPos = deferredSet[bNodeId].originPos;
            anchorGIdx = deferredSet[bNodeId].originGIdx;
            edgeParentPos = ctx.posMap[deferredSet[bNodeId].originId] || anchorPos;
        } else {
            // Branch subtree node: anchor to placed parent
            anchorPos = ctx.trunkTipPos;
            anchorGIdx = ctx.trunkTipGIdx;
            edgeParentPos = ctx.trunkTipPos;
            var bPrereqs = ctx.nodeLookup[bNodeId].prerequisites || [];
            for (var bpi = 0; bpi < bPrereqs.length; bpi++) {
                if (ctx.posMap[bPrereqs[bpi]]) {
                    anchorPos = ctx.posMap[bPrereqs[bpi]];
                    anchorGIdx = ctx.gridIdxMap[bPrereqs[bpi]];
                    edgeParentPos = anchorPos;
                    break;
                }
            }
        }

        // Branch growth direction: inherit from parent with perturbation
        var parentId = null;
        var bPrereqs2 = ctx.nodeLookup[bNodeId].prerequisites || [];
        for (var bpi2 = 0; bpi2 < bPrereqs2.length; bpi2++) {
            if (ctx.posMap[bPrereqs2[bpi2]]) { parentId = bPrereqs2[bpi2]; break; }
        }
        if (!parentId && deferredSet[bNodeId] && typeof deferredSet[bNodeId] === 'object') {
            parentId = deferredSet[bNodeId].originId;
        }
        var inheritedDir = (parentId && ctx.dirMap[parentId]) ? ctx.dirMap[parentId] : { dx: ctx.gdx, dy: ctx.gdy };

        var bGrowDx, bGrowDy;
        if (deferredSet[bNodeId] && typeof deferredSet[bNodeId] === 'object') {
            // Fan direction: growth direction rotated by assigned fan angle
            var fanAngle = deferredSet[bNodeId].fanAngle || 0;
            var growAngle = Math.atan2(ctx.gdy, ctx.gdx);
            var targetAngle = growAngle + fanAngle;
            bGrowDx = Math.cos(targetAngle);
            bGrowDy = Math.sin(targetAngle);
        } else {
            // Subsequent branch node: inherit parent direction with perturbation
            bGrowDx = inheritedDir.dx;
            bGrowDy = inheritedDir.dy;
            // Random angular perturbation: +/-25 deg
            var pertAngle = (Math.random() - 0.5) * 0.87;
            var cosPert = Math.cos(pertAngle);
            var sinPert = Math.sin(pertAngle);
            var tmpDx = bGrowDx * cosPert - bGrowDy * sinPert;
            var tmpDy = bGrowDx * sinPert + bGrowDy * cosPert;
            bGrowDx = tmpDx;
            bGrowDy = tmpDy;
        }
        // Normalize
        var bDirLen = Math.sqrt(bGrowDx * bGrowDx + bGrowDy * bGrowDy);
        if (bDirLen > 0) { bGrowDx /= bDirLen; bGrowDy /= bDirLen; }

        // BFS from anchor: search up to minHops*2 hops
        var bestIdx = -1, bestScore = -Infinity;
        var maxSearchHops = Math.max(minHops * 2, 6);
        if (anchorGIdx !== undefined && anchorGIdx >= 0) {
            var bVisited = {};
            bVisited[anchorGIdx] = true;
            var bSearchQ = [{ idx: anchorGIdx, hops: 0 }];
            var bCandidates = [];
            var bSearched = 0;
            while (bSearchQ.length > 0 && bSearched < 200) {
                var bsq = bSearchQ.shift();
                bSearched++;
                var bCurN = schoolPts[bsq.idx].neighbors;
                for (var bsi = 0; bsi < bCurN.length; bsi++) {
                    var bsIdx = bCurN[bsi];
                    if (bVisited[bsIdx]) continue;
                    bVisited[bsIdx] = true;
                    if (!schoolPts[bsIdx].used) {
                        bCandidates.push({ idx: bsIdx, hops: bsq.hops + 1 });
                    }
                    if (bsq.hops < maxSearchHops) {
                        bSearchQ.push({ idx: bsIdx, hops: bsq.hops + 1 });
                    }
                }
            }
            if (bCandidates.length > 0) {
                // Score candidates: prefer those at minHops distance in growth direction
                for (var bhci = 0; bhci < bCandidates.length; bhci++) {
                    var bhIdx = bCandidates[bhci].idx;
                    var bhHops = bCandidates[bhci].hops;
                    var bhScore = self._scoreCandidate(schoolPts, bhIdx,
                        anchorPos.x, anchorPos.y, bGrowDx, bGrowDy, []);
                    // Prefer sector points over corridor leftovers
                    if (!schoolPts[bhIdx].inCorridor) bhScore += 0.3;
                    // Penalize backward growth (behind trunk tip)
                    var bhProj = (schoolPts[bhIdx].x - ctx.rootPos.x) * ctx.gdx +
                                 (schoolPts[bhIdx].y - ctx.rootPos.y) * ctx.gdy;
                    if (bhProj < ctx.trunkTipProj - tierSp) bhScore -= 3.0;
                    // Empty space scoring: penalize candidates near existing nodes
                    var density = 0;
                    for (var dpi = 0; dpi < schoolPlaced.length; dpi++) {
                        var dpdx = schoolPts[bhIdx].x - schoolPlaced[dpi].x;
                        var dpdy = schoolPts[bhIdx].y - schoolPlaced[dpi].y;
                        if (dpdx * dpdx + dpdy * dpdy < densityRadSq) density++;
                    }
                    bhScore -= density * 0.4;
                    // Hop distance scoring
                    if (bhHops < minHops) {
                        bhScore -= (minHops - bhHops) * 0.8;
                    } else if (bhHops > minHops + 2) {
                        bhScore -= (bhHops - minHops - 2) * 0.5;
                    }
                    if (bhScore > bestScore) {
                        bestScore = bhScore;
                        bestIdx = bhIdx;
                    }
                }
                if (bestIdx >= 0) {
                    ctx.placeStats.branchMulti++;
                }
            }
        }

        // Last resort: generate a synthetic grid point near the anchor
        if (bestIdx < 0) {
            ctx.placeStats.globalFB++;
            var synX = anchorPos.x + bGrowDx * tierSp * (0.8 + Math.random() * 0.4);
            var synY = anchorPos.y + bGrowDy * tierSp * (0.8 + Math.random() * 0.4);
            var synPerp = (Math.random() - 0.5) * tierSp * 0.6;
            synX += (-bGrowDy) * synPerp;
            synY += bGrowDx * synPerp;
            var synNewIdx = schoolPts.length;
            var synNearIdx = -1;
            var synNearD = Infinity;
            for (var sni = Math.max(0, schoolPts.length - 300); sni < schoolPts.length; sni++) {
                var sndx = schoolPts[sni].x - synX;
                var sndy = schoolPts[sni].y - synY;
                var snd = sndx * sndx + sndy * sndy;
                if (snd < synNearD) { synNearD = snd; synNearIdx = sni; }
            }
            var synNbrs = synNearIdx >= 0 ? [synNearIdx] : [];
            schoolPts.push({
                x: synX, y: synY,
                used: false,
                neighbors: synNbrs,
                inCorridor: false,
                _synthetic: true
            });
            if (synNearIdx >= 0) schoolPts[synNearIdx].neighbors.push(synNewIdx);
            bestIdx = synNewIdx;
        }

        schoolPts[bestIdx].used = true;
        ctx.posMap[bNodeId] = { x: schoolPts[bestIdx].x, y: schoolPts[bestIdx].y };
        ctx.gridIdxMap[bNodeId] = bestIdx;
        ctx.placedCount++;
        ctx.branchPlaced++;
        schoolPlaced.push({ x: schoolPts[bestIdx].x, y: schoolPts[bestIdx].y });
        // Store this branch node's growth direction
        var placedDx = schoolPts[bestIdx].x - anchorPos.x;
        var placedDy = schoolPts[bestIdx].y - anchorPos.y;
        var placedLen = Math.sqrt(placedDx * placedDx + placedDy * placedDy);
        if (placedLen > 0) { placedDx /= placedLen; placedDy /= placedLen; }
        var newDirDx = bGrowDx * 0.4 + placedDx * 0.6;
        var newDirDy = bGrowDy * 0.4 + placedDy * 0.6;
        var newDirLen = Math.sqrt(newDirDx * newDirDx + newDirDy * newDirDy);
        if (newDirLen > 0) { newDirDx /= newDirLen; newDirDy /= newDirLen; }
        ctx.dirMap[bNodeId] = { dx: newDirDx, dy: newDirDy };
        ctx.allNodes.push({
            x: schoolPts[bestIdx].x, y: schoolPts[bestIdx].y,
            color: ctx.schoolColor,
            skillLevel: ctx.nodeLookup[bNodeId].skillLevel || ''
        });
        ctx.allEdges.push({
            x1: edgeParentPos.x, y1: edgeParentPos.y,
            x2: schoolPts[bestIdx].x, y2: schoolPts[bestIdx].y,
            color: ctx.schoolColor
        });
        ctx.parentMap[bNodeId] = branchPushedBy[bNodeId] ||
            (deferredSet[bNodeId] && deferredSet[bNodeId].originId) || ctx.rootSpellId;
        // Push this node's children for DFS processing
        var bChildNode = ctx.nodeLookup[bNodeId];
        if (bChildNode && bChildNode.children) {
            var bcSorted = bChildNode.children.slice();
            bcSorted.sort(function(a, b) {
                return (ctx.subtreeSize[a] || 1) - (ctx.subtreeSize[b] || 1);
            });
            for (var bcsi = 0; bcsi < bcSorted.length; bcsi++) {
                if (!ctx.posMap[bcSorted[bcsi]]) {
                    branchDfsStack.push(bcSorted[bcsi]);
                    branchPushedBy[bcSorted[bcsi]] = bNodeId;
                }
            }
        }
    }
};

// =========================================================================
// PHASE 3: ROOT GROWTH
// =========================================================================

/**
 * Root growth: grow from root ring opposite to trunk direction.
 * Free placement (no grid constraint), round-robin across roots.
 * @param {Object} ctx - Per-school layout context
 */
TreeGrowthTree._placeRootGrowth = function(ctx) {
    var tierSp = ctx.tierSp;
    var rootSpread = ctx.settings.rootSpread || 2.5;
    var rootStepDist = tierSp * Math.max(0.8, rootSpread * 0.5);
    var rootGrowDx = -ctx.gdx; // opposite to trunk growth
    var rootGrowDy = -ctx.gdy;
    var numRoots = ctx.numRoots;

    if (ctx.rootGrowthTarget <= 0) return;

    // Collect unplaced nodes for root growth
    var rootUnplaced = [];
    for (var rui = 0; rui < ctx.allTreeNodes.length; rui++) {
        if (!ctx.posMap[ctx.allTreeNodes[rui].formId]) {
            rootUnplaced.push(ctx.allTreeNodes[rui].formId);
        }
    }

    // Initialize root growth frontiers — one per root position
    var rootFrontiers = [];
    for (var rfi = 0; rfi < numRoots; rfi++) {
        var rfPos = ctx.schoolRootPositions[rfi];
        rootFrontiers.push({
            tips: [{ x: rfPos.x, y: rfPos.y, depth: 0, formId: ctx.rootSpellId }],
            dirDx: rootGrowDx,
            dirDy: rootGrowDy
        });
    }

    var rootRR = 0; // round-robin index
    var rootIdx = 0; // index into rootUnplaced

    while (rootIdx < rootUnplaced.length && ctx.rootGrowthPlaced < ctx.rootGrowthTarget) {
        var rFront = rootFrontiers[rootRR % numRoots];
        rootRR++;

        if (rFront.tips.length === 0) continue;

        // Pick a tip — bias toward shallower (less depth) tips
        var rTipIdx = 0;
        var rTipBest = Infinity;
        for (var rti = 0; rti < rFront.tips.length; rti++) {
            var rScore = rFront.tips[rti].depth - Math.random() * 1.5;
            if (rScore < rTipBest) {
                rTipBest = rScore;
                rTipIdx = rti;
            }
        }
        var rTip = rFront.tips[rTipIdx];

        // Compute new position: step in root direction + random spread
        var rAngle = Math.atan2(rFront.dirDy, rFront.dirDx);
        var rSpreadAngle = (Math.random() - 0.5) * rootSpread * 0.5;
        var rFinalAngle = rAngle + rSpreadAngle;
        var rDist = rootStepDist * (0.7 + Math.random() * 0.6);

        var rNewX = rTip.x + Math.cos(rFinalAngle) * rDist;
        var rNewY = rTip.y + Math.sin(rFinalAngle) * rDist;

        // Place the node at computed position
        var rgNodeId = rootUnplaced[rootIdx];
        rootIdx++;

        ctx.posMap[rgNodeId] = { x: rNewX, y: rNewY };
        ctx.rootGrowthPlaced++;
        ctx.placedCount++;

        ctx.allNodes.push({
            x: rNewX, y: rNewY,
            color: ctx.schoolColor,
            skillLevel: ctx.nodeLookup[rgNodeId] ? ctx.nodeLookup[rgNodeId].skillLevel || '' : ''
        });

        // Edge from tip to new position
        ctx.allEdges.push({
            x1: rTip.x, y1: rTip.y,
            x2: rNewX, y2: rNewY,
            color: ctx.schoolColor
        });
        ctx.parentMap[rgNodeId] = rTip.formId || ctx.rootSpellId;
        // New position becomes a growth tip
        var rNewDepth = rTip.depth + 1;
        rFront.tips.push({ x: rNewX, y: rNewY, depth: rNewDepth, formId: rgNodeId });
        // Branching: deeper tips may be retired to encourage branching
        var rBranchChance = Math.min(0.7, 0.15 + rNewDepth * 0.1);
        if (Math.random() < rBranchChance) {
            // Remove old tip — linear growth from new position
            rFront.tips.splice(rTipIdx, 1);
        }
    }

    console.log('[TreeGrowthTree] ' + ctx.schoolName + ': root growth placed ' +
        ctx.rootGrowthPlaced + '/' + ctx.rootGrowthTarget +
        ' (unplaced available=' + rootUnplaced.length + ')');
};

// =========================================================================
// CATCH-ALL PLACEMENT
// =========================================================================

/**
 * Catch-all: place remaining unplaced nodes with dynamic grid expansion.
 * @param {Object} ctx - Per-school layout context
 */
TreeGrowthTree._placeCatchAll = function(ctx) {
    var schoolPts = ctx.schoolPts;
    var tierSp = ctx.tierSp;
    var baseMidX = ctx.baseMidX;
    var baseMidY = ctx.baseMidY;
    var trunkTipPos = ctx.trunkTipPos;

    var catchAllExpansions = 0;
    var catchAllExpSet = null; // lazy-init dedup set

    for (var umi = 0; umi < ctx.allTreeNodes.length; umi++) {
        if (ctx.placedCount >= ctx.maxPlaceable) break;
        var umNode = ctx.allTreeNodes[umi];
        if (ctx.posMap[umNode.formId]) continue;
        ctx.placeStats.globalFB++;

        var nearPos = trunkTipPos;
        var umIdx = -1;
        var umfDist = Infinity;
        for (var umf = 0; umf < schoolPts.length; umf++) {
            if (schoolPts[umf].used) continue;
            var umfx = schoolPts[umf].x - nearPos.x;
            var umfy = schoolPts[umf].y - nearPos.y;
            var umfd = umfx * umfx + umfy * umfy;
            if (umfd < umfDist) { umfDist = umfd; umIdx = umf; }
        }

        // Dynamic grid expansion: generate new points when grid is full
        if (umIdx < 0 && catchAllExpansions < 10) {
            catchAllExpansions++;
            if (!catchAllExpSet) {
                catchAllExpSet = {};
                for (var ces = 0; ces < schoolPts.length; ces++) {
                    catchAllExpSet[Math.round(schoolPts[ces].x) + ',' + Math.round(schoolPts[ces].y)] = true;
                }
            }
            var remaining = 0;
            for (var cri = umi; cri < ctx.allTreeNodes.length; cri++) {
                if (!ctx.posMap[ctx.allTreeNodes[cri].formId]) remaining++;
            }
            var ceNeeded = Math.max(remaining, 20);
            var ceAdded = 0;
            // Extend outward from placed nodes
            var cePlaced = [];
            for (var cpk in ctx.posMap) {
                if (ctx.posMap.hasOwnProperty(cpk)) cePlaced.push(ctx.posMap[cpk]);
            }
            // Sort by distance from center (outermost first)
            cePlaced.sort(function(a, b) {
                var ra = (a.x - baseMidX) * (a.x - baseMidX) + (a.y - baseMidY) * (a.y - baseMidY);
                var rb = (b.x - baseMidX) * (b.x - baseMidX) + (b.y - baseMidY) * (b.y - baseMidY);
                return rb - ra;
            });
            for (var cei = 0; cei < cePlaced.length && ceAdded < ceNeeded; cei++) {
                var cep = cePlaced[cei];
                var ceR = Math.sqrt((cep.x - baseMidX) * (cep.x - baseMidX) +
                                    (cep.y - baseMidY) * (cep.y - baseMidY));
                if (ceR < 1) continue;
                // Generate 2-3 points per seed: outward + lateral
                var ceAngles = [0, Math.PI / 6, -Math.PI / 6];
                var ceBaseAngle = Math.atan2(cep.y - baseMidY, cep.x - baseMidX);
                for (var ceai = 0; ceai < ceAngles.length && ceAdded < ceNeeded; ceai++) {
                    var ceAngle = ceBaseAngle + ceAngles[ceai];
                    var cenx = cep.x + Math.cos(ceAngle) * tierSp;
                    var ceny = cep.y + Math.sin(ceAngle) * tierSp;
                    var cenk = Math.round(cenx) + ',' + Math.round(ceny);
                    if (catchAllExpSet[cenk]) continue;
                    catchAllExpSet[cenk] = true;
                    // Find nearest existing point for neighbor link
                    var ceNearIdx = -1;
                    var ceNearD = Infinity;
                    var ceSearchStart = Math.max(0, schoolPts.length - 200);
                    for (var cesi = ceSearchStart; cesi < schoolPts.length; cesi++) {
                        var cesdx = schoolPts[cesi].x - cenx;
                        var cesdy = schoolPts[cesi].y - ceny;
                        var cesd = cesdx * cesdx + cesdy * cesdy;
                        if (cesd < ceNearD) { ceNearD = cesd; ceNearIdx = cesi; }
                    }
                    var newCeIdx = schoolPts.length;
                    var ceNbrs = ceNearIdx >= 0 ? [ceNearIdx] : [];
                    schoolPts.push({
                        x: cenx, y: ceny,
                        used: false,
                        neighbors: ceNbrs,
                        inCorridor: false,
                        _synthetic: true
                    });
                    if (ceNearIdx >= 0) schoolPts[ceNearIdx].neighbors.push(newCeIdx);
                    ceAdded++;
                }
            }
            console.log('[TreeGrowthTree] ' + ctx.schoolName + ': dynamic expansion #' +
                catchAllExpansions + ' added ' + ceAdded + ' points (now ' + schoolPts.length + ')');
            // Retry this node
            umi--;
            ctx.placeStats.globalFB--;
            continue;
        }

        if (umIdx < 0) break;

        schoolPts[umIdx].used = true;
        ctx.posMap[umNode.formId] = { x: schoolPts[umIdx].x, y: schoolPts[umIdx].y };
        ctx.gridIdxMap[umNode.formId] = umIdx;
        ctx.placedCount++;

        ctx.allNodes.push({
            x: schoolPts[umIdx].x, y: schoolPts[umIdx].y,
            color: ctx.schoolColor,
            skillLevel: umNode.skillLevel || ''
        });
        ctx.allEdges.push({
            x1: trunkTipPos.x, y1: trunkTipPos.y,
            x2: schoolPts[umIdx].x, y2: schoolPts[umIdx].y,
            color: ctx.schoolColor
        });
        ctx.parentMap[umNode.formId] = (ctx.branchOrigins.length > 0 ? ctx.branchOrigins[0].id : ctx.rootSpellId);
    }
};

// =========================================================================
// HELPERS / STATE
// =========================================================================

TreeGrowthTree._markDirty = function() {
    if (typeof TreeGrowth !== 'undefined') {
        TreeGrowth._markDirty();
    }
};

TreeGrowthTree.getSettings = function() {
    return {
        ghostOpacity: this.settings.ghostOpacity,
        nodeRadius: this.settings.nodeRadius,
        trunkThickness: this.settings.trunkThickness,
        branchSpread: this.settings.branchSpread,
        rootSpread: this.settings.rootSpread,
        pctBranches: this.settings.pctBranches,
        pctTrunk: this.settings.pctTrunk,
        pctRoot: this.settings.pctRoot
    };
};

// =========================================================================
// SELF-REGISTER — must be last
// =========================================================================

if (typeof TreeGrowth !== 'undefined') {
    TreeGrowth.registerMode('tree', TreeGrowthTree);
}
