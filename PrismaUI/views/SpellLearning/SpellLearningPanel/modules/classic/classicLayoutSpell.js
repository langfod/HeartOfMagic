/**
 * ClassicLayout — Placement search, tree sanitization, and force-placement
 * (method extensions).
 *
 * Adds grid placement search methods (_findSlots, _snapToNearest),
 * tree sanitization (_sanitizeTree), and the Phase 4 force-placement
 * helper (_forcePlaceRemaining) used by _layoutOnGrid.
 *
 * Loaded after: classicLayoutCore.js
 */

// ---- PLACEMENT SEARCH --------------------------------------------------

/**
 * BFS from parentIdx to find 'count' unoccupied grid positions.
 * Scoring combines:
 *   - Growth direction alignment (cosine similarity with dir vector)
 *   - Radial outward bonus (prefer increasing distance from center)
 *   - Density penalty (penalize candidates surrounded by occupied points)
 *   - Hard radius floor (block placement inside root ring for outward growth)
 *
 * @param {{ points, adj }} gridGraph
 * @param {Object} occupied - grid index -> true
 * @param {number} parentIdx - starting grid point index
 * @param {number} count - how many slots to find
 * @param {number} growDirX - growth direction cos
 * @param {number} growDirY - growth direction sin
 * @param {number} minR2 - minimum squared radius (0 = no limit)
 * @param {string} [skillLevel] - skill level for tier zone scoring
 * @param {number} [bfsDepth] - current BFS depth for tier zone scoring
 * @param {string} [theme] - theme name for angular sector scoring
 * @returns {number[]} array of grid point indices
 */
ClassicLayout._findSlots = function (gridGraph, occupied, parentIdx, count, growDirX, growDirY, minR2, skillLevel, bfsDepth, theme) {
    if (count <= 0 || parentIdx < 0) return [];
    minR2 = minR2 || 0;

    // More hops to allow deep trees to spread across grid
    var MAX_HOPS = this._tierZones ? 12 : 8;
    var points = gridGraph.points;
    var adj = gridGraph.adj;
    var parent = points[parentIdx];
    if (!parent) return [];

    var parentR = Math.sqrt(parent.x * parent.x + parent.y * parent.y);
    var result = [];
    var visited = {};
    visited[parentIdx] = true;

    // Depth-limited BFS: each entry is { idx, depth }
    var queue = [{ idx: parentIdx, depth: 0 }];

    while (queue.length > 0 && result.length < count) {
        var cur = queue.shift();
        var curIdx = cur.idx;
        var curDepth = cur.depth;

        // Don't expand beyond max hops
        if (curDepth >= MAX_HOPS) continue;

        var neighbors = adj[curIdx] || [];

        // Score neighbors with direction + density + radial awareness
        var scored = [];
        for (var i = 0; i < neighbors.length; i++) {
            var nIdx = neighbors[i];
            if (visited[nIdx]) continue;
            visited[nIdx] = true;

            var n = points[nIdx];

            // Hard filter: enforce minimum radius from globe (no growth inside mask)
            var gdx = n.x - (this._globeX || 0);
            var gdy = n.y - (this._globeY || 0);
            var nR2 = gdx * gdx + gdy * gdy;
            if (minR2 > 0 && nR2 < minR2) {
                // Still traverse through for BFS connectivity but don't place here
                queue.push({ idx: nIdx, depth: curDepth + 1 });
                continue;
            }

            // Skip occupied — traverse through them but don't select
            if (occupied[nIdx]) {
                queue.push({ idx: nIdx, depth: curDepth + 1 });
                continue;
            }

            // Hard density filter: count occupied neighbors, reject if too crowded
            var occupiedNearby = 0;
            var nAdj = adj[nIdx] || [];
            for (var oi = 0; oi < nAdj.length; oi++) {
                if (occupied[nAdj[oi]]) occupiedNearby++;
            }
            var maxOcc = this._maxOccupiedNeighbors || 8;
            if (occupiedNearby > maxOcc) {
                // Too dense — skip placement but keep traversing
                queue.push({ idx: nIdx, depth: curDepth + 1 });
                continue;
            }

            // Direction score: alignment with growth direction from parent
            var dx = n.x - parent.x;
            var dy = n.y - parent.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            var dirScore = dist > 0.001 ? (dx * growDirX + dy * growDirY) / dist : 0;

            // Radial outward bonus: prefer moving away from center
            // At radialBias=100, this is ±3.0 which dominates dirScore (±1.0)
            var nR = Math.sqrt(nR2);
            var rw = this._radialWeight || 0;
            var radialBonus = (nR > parentR) ? rw : -rw;

            // Prefer closer hops (depth penalty)
            var depthPenalty = curDepth * 0.3;

            var finalScore = dirScore + radialBonus - depthPenalty;

            // Tier zone scoring: bias placement toward correct RADIAL zone
            // Uses physical radius from center so candidates at different rings
            // get different scores, even at the same BFS depth.
            var tz = this._tierZones;
            if (tz && skillLevel) {
                var tzZone = tz[skillLevel];
                if (tzZone) {
                    var nRadius = Math.sqrt(nR2);
                    var ringR = this._ringRadius || 0;
                    var maxGR = this._simulatedMaxRadius || this._maxGridRadius || 1;
                    var growRange = maxGR - ringR;
                    var radiusPct = growRange > 1 ? ((nRadius - ringR) / growRange) * 100 : 50;
                    if (radiusPct < 0) radiusPct = 0;
                    if (radiusPct > 100) radiusPct = 100;

                    if (radiusPct < tzZone.min) {
                        var belowDist = (tzZone.min - radiusPct) / 100;
                        finalScore -= 5.0 + belowDist * 10.0;
                    } else if (radiusPct > tzZone.max) {
                        var aboveDist = (radiusPct - tzZone.max) / 100;
                        finalScore -= 5.0 + aboveDist * 10.0;
                    } else {
                        var zoneMid = (tzZone.min + tzZone.max) / 2;
                        var zoneHalf = (tzZone.max - tzZone.min) / 2;
                        var centeredness = zoneHalf > 0 ? 1.0 - Math.abs(radiusPct - zoneMid) / zoneHalf : 1.0;
                        finalScore += 3.0 * centeredness;
                    }
                }
            }

            // Theme sector angular scoring: prefer grid points in this theme's sector
            if (this._currentThemeSectors && theme) {
                var tSector = this._currentThemeSectors[theme];
                if (tSector) {
                    var candAngle = Math.atan2(n.y, n.x);
                    var angleDiff = candAngle - tSector.center;
                    // Normalize to [-PI, PI]
                    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                    var absDiff = Math.abs(angleDiff);
                    // +2.5 at sector center, 0 at ~65°, -1.0 at opposite side
                    finalScore += 2.5 - absDiff * (3.5 / Math.PI);
                }
            }

            scored.push({ idx: nIdx, score: finalScore, depth: curDepth + 1 });
        }

        // Sort: highest score first (growth direction + sparse areas preferred)
        scored.sort(function (a, b) { return b.score - a.score; });

        for (var j = 0; j < scored.length; j++) {
            var s = scored[j];
            result.push(s.idx);
            queue.push({ idx: s.idx, depth: s.depth });
            if (result.length >= count) break;
        }
    }

    return result;
};

// ---- TREE SANITIZATION ---------------------------------------------------

/**
 * Sanitize tree structure before layout: rescue orphans and cap fan-out.
 *
 * Phase A: BFS from root to find unreachable nodes. Attaches each orphan
 *          to the best-scoring reachable parent (theme match, tier proximity,
 *          load balance).
 *
 * Phase B: Iteratively reduces over-capacity nodes (>5 children) by
 *          grouping excess children by theme, electing a leader per group,
 *          and reparenting siblings under their leader.
 *
 * @param {Object} nodeLookup - formId -> node (mutated in place)
 * @param {string} rootFormId - Root node's formId
 */
ClassicLayout._sanitizeTree = function (nodeLookup, rootFormId) {
    var MAX_CHILDREN = 5;
    var MAX_ITERATIONS = 10;

    // ==== Phase A: Rescue orphans ====
    // BFS from root to find all reachable nodes
    var reachable = {};
    var bfsQ = [rootFormId];
    reachable[rootFormId] = true;
    while (bfsQ.length > 0) {
        var cur = bfsQ.shift();
        var curNode = nodeLookup[cur];
        if (!curNode) continue;
        var curChildren = curNode.children || [];
        for (var ci = 0; ci < curChildren.length; ci++) {
            var cid = curChildren[ci];
            if (!reachable[cid] && nodeLookup[cid]) {
                reachable[cid] = true;
                bfsQ.push(cid);
            }
        }
    }

    // Collect orphans
    var allIds = Object.keys(nodeLookup);
    var orphans = [];
    for (var oi = 0; oi < allIds.length; oi++) {
        if (!reachable[allIds[oi]] && allIds[oi] !== rootFormId) {
            orphans.push(allIds[oi]);
        }
    }

    if (orphans.length > 0) {
        // Sort by tier ascending so lower-tier orphans are placed first
        // and become available as parents for higher-tier orphans
        orphans.sort(function (a, b) {
            var ta = (nodeLookup[a] && nodeLookup[a].tier) || 1;
            var tb = (nodeLookup[b] && nodeLookup[b].tier) || 1;
            return ta - tb;
        });

        for (var orpi = 0; orpi < orphans.length; orpi++) {
            var orphanId = orphans[orpi];
            var orphanNode = nodeLookup[orphanId];
            if (!orphanNode) continue;
            var orphanTheme = orphanNode.theme || '';
            var orphanTier = orphanNode.tier || 1;

            // Score all reachable nodes as candidate parents
            var bestParent = null;
            var bestScore = -Infinity;
            for (var rid in reachable) {
                if (!reachable.hasOwnProperty(rid)) continue;
                var rNode = nodeLookup[rid];
                if (!rNode) continue;

                var score = 0;
                var rTheme = rNode.theme || '';
                var rTier = rNode.tier || 1;
                var rChildCount = (rNode.children || []).length;

                // Theme match
                if (rTheme && orphanTheme && rTheme === orphanTheme) score += 50;

                // Tier proximity
                score -= Math.abs(rTier - orphanTier) * 5;

                // Penalize parent at higher tier than orphan (wrong direction)
                // Must be strong enough to override theme match (+50)
                if (rTier > orphanTier) score -= 200;

                // Load balance: prefer less-loaded nodes
                score -= rChildCount * 3;

                // Heavy penalty if already at cap
                if (rChildCount >= MAX_CHILDREN) score -= 100;

                if (score > bestScore) {
                    bestScore = score;
                    bestParent = rid;
                }
            }

            if (bestParent) {
                if (!nodeLookup[bestParent].children) nodeLookup[bestParent].children = [];
                nodeLookup[bestParent].children.push(orphanId);
                reachable[orphanId] = true;
                console.log('[Sanitize] Rescued orphan "' +
                    (orphanNode.name || orphanId) + '" → parent "' +
                    (nodeLookup[bestParent].name || bestParent) + '"');
            }
        }

        console.log('[Sanitize] Rescued ' + orphans.length + ' orphan(s)');
    }

    // ==== Phase B: Cap fan-out (iterative) ====
    for (var iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        // Find over-capacity nodes
        var overCap = [];
        for (var fid in nodeLookup) {
            if (!nodeLookup.hasOwnProperty(fid)) continue;
            var nd = nodeLookup[fid];
            if (nd.children && nd.children.length > MAX_CHILDREN) {
                overCap.push(fid);
            }
        }

        if (overCap.length === 0) {
            if (iteration > 0) {
                console.log('[Sanitize] Fan-out resolved after ' + iteration + ' iteration(s)');
            }
            break;
        }

        for (var oci = 0; oci < overCap.length; oci++) {
            var parentId = overCap[oci];
            var parentNode = nodeLookup[parentId];
            var children = parentNode.children;
            if (!children || children.length <= MAX_CHILDREN) continue;

            var origCount = children.length;

            // Group children by theme
            var themeGroups = {};
            for (var gi = 0; gi < children.length; gi++) {
                var gChildId = children[gi];
                var gChild = nodeLookup[gChildId];
                var gTheme = (gChild && gChild.theme) ? gChild.theme : '_none';
                if (!themeGroups[gTheme]) themeGroups[gTheme] = [];
                themeGroups[gTheme].push(gChildId);
            }

            // Sort theme groups by size descending
            var themeKeys = Object.keys(themeGroups);
            themeKeys.sort(function (a, b) {
                return themeGroups[b].length - themeGroups[a].length;
            });

            // Elect leader per group and build reparent operations
            var keepDirect = [];
            var reparentOps = [];

            for (var ti = 0; ti < themeKeys.length; ti++) {
                var tKey = themeKeys[ti];
                var group = themeGroups[tKey];

                if (group.length <= 1) {
                    keepDirect.push(group[0]);
                    continue;
                }

                // Elect leader: lowest tier, fewest existing children
                var leaderId = group[0];
                var leaderTier = (nodeLookup[leaderId] && nodeLookup[leaderId].tier) || 99;
                var leaderCC = (nodeLookup[leaderId] && nodeLookup[leaderId].children)
                    ? nodeLookup[leaderId].children.length : 0;

                for (var li = 1; li < group.length; li++) {
                    var lCand = group[li];
                    var lNode = nodeLookup[lCand];
                    var lTier = (lNode && lNode.tier) || 99;
                    var lCC = (lNode && lNode.children) ? lNode.children.length : 0;

                    if (lTier < leaderTier || (lTier === leaderTier && lCC < leaderCC)) {
                        leaderId = lCand;
                        leaderTier = lTier;
                        leaderCC = lCC;
                    }
                }

                // Leader stays direct
                keepDirect.push(leaderId);

                // Siblings reparent under leader
                for (var si = 0; si < group.length; si++) {
                    if (group[si] !== leaderId) {
                        reparentOps.push({ childId: group[si], newParentId: leaderId });
                    }
                }
            }

            // If still too many leaders, merge smallest groups
            if (keepDirect.length > MAX_CHILDREN) {
                // Sort by group size ascending (smallest first for merging)
                var leaderSizes = {};
                for (var lsi = 0; lsi < keepDirect.length; lsi++) {
                    leaderSizes[keepDirect[lsi]] = 0;
                }
                for (var rsi = 0; rsi < reparentOps.length; rsi++) {
                    var rpId = reparentOps[rsi].newParentId;
                    if (leaderSizes[rpId] !== undefined) leaderSizes[rpId]++;
                }
                keepDirect.sort(function (a, b) {
                    return (leaderSizes[a] || 0) - (leaderSizes[b] || 0);
                });

                while (keepDirect.length > MAX_CHILDREN) {
                    var mergeId = keepDirect.shift();
                    var mergeTheme = (nodeLookup[mergeId] && nodeLookup[mergeId].theme) || '_none';

                    // Find best target among remaining leaders
                    var bestTarget = keepDirect[0];
                    var bestTScore = -Infinity;
                    for (var bti = 0; bti < keepDirect.length; bti++) {
                        var targId = keepDirect[bti];
                        var targTheme = (nodeLookup[targId] && nodeLookup[targId].theme) || '_none';
                        var tsc = 0;
                        if (targTheme === mergeTheme) tsc += 20;
                        tsc -= (leaderSizes[targId] || 0) * 2;
                        if (tsc > bestTScore) {
                            bestTScore = tsc;
                            bestTarget = targId;
                        }
                    }

                    // Reparent the merged leader under the best target
                    reparentOps.push({ childId: mergeId, newParentId: bestTarget });
                }
            }

            // Apply: rebuild parent's children array
            parentNode.children = keepDirect.slice();

            // Apply reparent operations
            for (var rpi = 0; rpi < reparentOps.length; rpi++) {
                var op = reparentOps[rpi];
                var newParent = nodeLookup[op.newParentId];
                if (!newParent) continue;
                if (!newParent.children) newParent.children = [];
                // Avoid self-loops and duplicates
                if (op.childId !== op.newParentId &&
                    newParent.children.indexOf(op.childId) < 0) {
                    newParent.children.push(op.childId);
                }
            }

            console.log('[Sanitize] Capped "' + (parentNode.name || parentId) +
                '": ' + origCount + ' → ' + keepDirect.length + ' children (' +
                reparentOps.length + ' reparented)');
        }
    }

    if (iteration >= MAX_ITERATIONS) {
        console.log('[Sanitize] WARNING: hit iteration limit, some nodes may still exceed cap');
    }
};

// ---- FORCE PLACEMENT (Phase 4) -------------------------------------------

/**
 * Phase 4: Force-place remaining unplaced nodes at nearest open grid points.
 * Scores attachment by parent match, theme affinity, tier ordering, and
 * fan-out cap. Dynamically expands the grid when enabled and space runs out.
 *
 * Called by _layoutOnGrid after Phases 1-3 to ensure every tree node gets
 * placed on the grid, even if BFS and deferred passes missed it.
 *
 * @param {Object} ctx - Layout context from _layoutOnGrid containing:
 *   nodeLookup, placed, occupied, positioned, gridGraph, spells,
 *   parentChildCount, fanOutCap, schoolGridPts, tierSpacing,
 *   unplacedIds, allNodeIds
 */
ClassicLayout._forcePlaceRemaining = function (ctx) {
    var nodeLookup = ctx.nodeLookup, placed = ctx.placed, occupied = ctx.occupied;
    var positioned = ctx.positioned, gridGraph = ctx.gridGraph, spells = ctx.spells;
    var parentChildCount = ctx.parentChildCount, FAN_OUT_CAP = ctx.fanOutCap;
    var schoolGridPts = ctx.schoolGridPts, tierSpacing = ctx.tierSpacing;
    var unplacedIds = ctx.unplacedIds, allNodeIds = ctx.allNodeIds;

    console.log('[ClassicLayout] Phase 4: force-placing ' + unplacedIds.length + ' remaining nodes');

    // Build list of open grid point indices
    var openGridPts = [];
    for (var ogi = 0; ogi < gridGraph.points.length; ogi++) {
        if (!occupied[ogi]) openGridPts.push(ogi);
    }

    // Sort unplaced by tier (Novice first)
    var p4TierOrd = { 'Novice': 0, 'Apprentice': 1, 'Adept': 2, 'Expert': 3, 'Master': 4 };
    unplacedIds.sort(function (a, b) {
        var sa = nodeLookup[a], sb = nodeLookup[b];
        var la = sa ? (p4TierOrd[sa.skillLevel] || 3) : 3;
        var lb = sb ? (p4TierOrd[sb.skillLevel] || 3) : 3;
        return la - lb;
    });

    var expansionAttempts = 0;

    // For each unplaced node, find nearest open grid point to any placed neighbor
    for (var fp = 0; fp < unplacedIds.length && openGridPts.length > 0; fp++) {
        var fpId = unplacedIds[fp];
        if (placed[fpId]) continue;

        // Find best placed node to attach near, scoring by parent match + theme
        var fpNode = nodeLookup[fpId];
        var fpParentId = fpNode && fpNode.prerequisites ? fpNode.prerequisites[0] : null;
        var fpTheme = fpNode ? fpNode.theme : null;
        var nearGridIdx = -1;

        var fpBestScore = -Infinity;
        var fpBestGridIdx = -1;
        var fpBestParent = fpParentId;
        for (var fpi = 0; fpi < positioned.length; fpi++) {
            var fpCandidate = positioned[fpi];
            if (fpCandidate.gridIdx === undefined) continue;
            var fpCAdj = gridGraph.adj[fpCandidate.gridIdx] || [];
            var fpOpenIdx = -1;
            for (var fpai = 0; fpai < fpCAdj.length; fpai++) {
                if (!occupied[fpCAdj[fpai]]) { fpOpenIdx = fpCAdj[fpai]; break; }
            }
            if (fpOpenIdx < 0) continue;

            var fpScore = 0;
            // Original parent bonus
            if (fpCandidate.formId === fpParentId) fpScore += 200;
            // Theme affinity (layered mode)
            if (this._useThemeScoring && fpTheme && fpTheme !== '_none') {
                var fpCandNode = nodeLookup[fpCandidate.formId];
                var fpCandTheme = fpCandNode ? fpCandNode.theme : null;
                if (fpCandTheme === fpTheme) fpScore += 100;
                else if (fpCandTheme && fpCandTheme !== '_none') fpScore -= 20;
            }
            // Tier ordering: parent should be at lower or equal tier
            var fpTierMap = { 'Novice': 1, 'Apprentice': 2, 'Adept': 3, 'Expert': 4, 'Master': 5 };
            var fpNodeTier = fpTierMap[fpNode ? (fpNode.skillLevel || '') : ''] || 3;
            var fpCandTier = fpTierMap[fpCandidate.skillLevel || ''] || 3;
            if (fpCandTier > fpNodeTier) {
                fpScore -= 300; // Wrong direction
            } else if (fpCandTier === fpNodeTier - 1) {
                fpScore += 30; // Ideal predecessor tier
            }

            // Fan-out cap: strongly discourage parents already at limit
            var fpCandCC = parentChildCount[fpCandidate.formId] || 0;
            if (fpCandCC >= FAN_OUT_CAP) fpScore -= 500;
            if (fpScore > fpBestScore) {
                fpBestScore = fpScore;
                fpBestGridIdx = fpOpenIdx;
                fpBestParent = fpCandidate.formId;
            }
        }
        if (fpBestGridIdx >= 0) {
            nearGridIdx = fpBestGridIdx;
            fpParentId = fpBestParent;
        }

        // Last resort: any open grid point
        if (nearGridIdx < 0 && openGridPts.length > 0) {
            nearGridIdx = openGridPts[0];
        }

        // Dynamic grid expansion: grow grid when out of space (infinite expansion)
        if (nearGridIdx < 0 && this._dynamicGridExpansion) {
            expansionAttempts++;
            var remaining = unplacedIds.length - fp;
            var oldCount = schoolGridPts.length;
            schoolGridPts = this._densifyGrid(schoolGridPts, Math.max(remaining, 20), tierSpacing);

            // Stop if densify made no progress (can't grow further)
            if (schoolGridPts.length <= oldCount) {
                console.warn('[ClassicLayout] Expansion #' + expansionAttempts +
                    ' made no progress, stopping (' + remaining + ' nodes unplaced)');
                break;
            }

            console.log('[ClassicLayout] Dynamic expansion #' + expansionAttempts +
                ': ' + oldCount + ' -> ' + schoolGridPts.length + ' points (' + remaining + ' nodes remaining)');

            // Rebuild grid graph with expanded points
            gridGraph = this._buildGridGraph(schoolGridPts, tierSpacing);

            // Rebuild occupied array (preserve existing placements)
            var newOccupied = new Array(gridGraph.points.length);
            for (var noi = 0; noi < newOccupied.length; noi++) newOccupied[noi] = false;
            // Mark points that match existing placed positions
            for (var poi = 0; poi < positioned.length; poi++) {
                if (positioned[poi].gridIdx !== undefined && positioned[poi].gridIdx < newOccupied.length) {
                    newOccupied[positioned[poi].gridIdx] = true;
                }
            }
            occupied = newOccupied;

            // Rebuild open grid points list
            openGridPts = [];
            for (var nogi = 0; nogi < gridGraph.points.length; nogi++) {
                if (!occupied[nogi]) openGridPts.push(nogi);
            }

            // Retry this node
            fp--;
            continue;
        }

        if (nearGridIdx < 0) break; // truly out of space (no progress possible)

        occupied[nearGridIdx] = true;
        placed[fpId] = true;
        // Remove from open list
        var openIdx = openGridPts.indexOf(nearGridIdx);
        if (openIdx >= 0) openGridPts.splice(openIdx, 1);

        var fpPt = gridGraph.points[nearGridIdx];
        var fpSpell = this._findSpell(fpId, spells);
        positioned.push({
            formId: fpId,
            x: fpPt.x,
            y: fpPt.y,
            parentFormId: fpParentId,
            tier: fpNode ? fpNode.tier : 0,
            skillLevel: fpSpell ? fpSpell.skillLevel : '',
            theme: fpNode ? fpNode.theme : '',
            name: fpSpell ? fpSpell.name : fpId,
            isRoot: false,
            gridIdx: nearGridIdx
        });
        if (fpParentId) {
            parentChildCount[fpParentId] = (parentChildCount[fpParentId] || 0) + 1;
        }
    }

    var stillUnplaced = 0;
    for (var sui = 0; sui < allNodeIds.length; sui++) {
        if (!placed[allNodeIds[sui]]) stillUnplaced++;
    }
    console.log('[ClassicLayout] Phase 4 done: ' + (unplacedIds.length - stillUnplaced) +
        ' force-placed, ' + stillUnplaced + ' could not fit (grid full)');
};
