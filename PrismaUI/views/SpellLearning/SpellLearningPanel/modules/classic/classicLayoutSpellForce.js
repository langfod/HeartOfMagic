/**
 * Classic Layout Spell Force - Force placement for remaining unplaced spells.
 *
 * Phase 4 of the classic layout pipeline: ensures every tree node gets
 * placed on the grid, even if BFS and deferred passes missed it.
 *
 * Loaded after: classicLayoutSpell.js
 * Depends on: classicLayoutCore.js (ClassicLayout)
 */

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
