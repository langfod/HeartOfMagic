/**
 * Layout Engine Utils - Barycenter reordering, sitter nudge, orphan handling, and module export
 *
 * Adds graph-optimization post-processing and utility methods to LayoutEngine:
 * - _barycenterReorder: Reorders nodes within tiers to reduce edge crossings
 * - _sitterNudge: Nudges nodes sitting on unrelated edges
 * - _handleOrphans: Assigns positions to orphan nodes not reached by BFS
 *
 * Also exports LayoutEngine to window.
 *
 * Loaded after: layoutEngineCore.js, layoutEngineGrid.js
 * Loaded before: layoutEngineRadial.js
 *
 * Depends on:
 * - layoutEngineCore.js (LayoutEngine base object, _skseLog global)
 */

// =============================================================================
// PER-SCHOOL BARYCENTER REORDERING
// =============================================================================

/**
 * Reorder nodes WITHIN a school only, using existing positions.
 * Nodes stay in their school's sector -- just reorganize which node sits where.
 * This pulls connected nodes closer together, reducing edge crossings and sitters.
 *
 * @param {Object} ctx - Context from applyPositionsToTree containing:
 *   school, nodeByFormId, schoolName
 */
LayoutEngine._barycenterReorder = function(ctx) {
    var schoolNodes = ctx.school.nodes.filter(function(n) { return n.x !== undefined; });
    if (schoolNodes.length < 3) return;

    var nodeByFormId = ctx.nodeByFormId;
    var schoolName = ctx.schoolName;

    // Build tier buckets (non-root only — roots are pinned)
    var tierBuckets = {};
    var schoolNodeById = {};
    var schoolAdj = {};
    var schoolMaxTier = 0;

    schoolNodes.forEach(function(n) {
        schoolNodeById[n.formId] = n;
        var t = n._gridTier || 0;
        if (t > schoolMaxTier) schoolMaxTier = t;

        if (!n.isRoot) {
            if (!tierBuckets[t]) tierBuckets[t] = [];
            tierBuckets[t].push(n);
        }

        // Adjacency within this school
        schoolAdj[n.formId] = [];
        (n.children || []).forEach(function(cid) {
            if (nodeByFormId[cid]) schoolAdj[n.formId].push(cid);
        });
        (n.prerequisites || []).forEach(function(pid) {
            if (nodeByFormId[pid]) schoolAdj[n.formId].push(pid);
        });

        // Initial order = current angle
        n._baryOrder = n.angle || 0;
    });

    // 20 barycenter sweeps alternating direction
    for (var iter = 0; iter < 20; iter++) {
        var forward = (iter % 2 === 0);
        var start = forward ? 1 : schoolMaxTier;
        var end = forward ? schoolMaxTier + 1 : 0;
        var step = forward ? 1 : -1;

        for (var tier = start; tier !== end; tier += step) {
            var bucket = tierBuckets[tier];
            if (!bucket || bucket.length <= 1) continue;

            // Compute barycenter for each node from its neighbors' order
            bucket.forEach(function(node) {
                var neighbors = schoolAdj[node.formId] || [];
                var sum = 0, cnt = 0;
                neighbors.forEach(function(nid) {
                    var nb = schoolNodeById[nid];
                    if (!nb || nb.x === undefined) return;
                    var nbTier = nb._gridTier || 0;
                    if (Math.abs(nbTier - tier) <= 1) {
                        sum += nb._baryOrder;
                        cnt++;
                    }
                });
                node._barycenter = cnt > 0 ? sum / cnt : node._baryOrder;
            });

            // Sort by barycenter
            bucket.sort(function(a, b) { return a._barycenter - b._barycenter; });

            // Update order indices
            bucket.forEach(function(node, idx) { node._baryOrder = idx; });
        }
    }

    // Map new order back to existing positions within each tier
    var totalBarySwaps = 0;
    for (var bt in tierBuckets) {
        var bNodes = tierBuckets[bt];
        if (bNodes.length <= 1) continue;

        // Snapshot current positions sorted by angle
        var positions = bNodes.map(function(n) {
            return { x: n.x, y: n.y, angle: n.angle, radius: n.radius, _gridSlot: n._gridSlot, _gridTier: n._gridTier };
        });
        positions.sort(function(a, b) { return a.angle - b.angle; });

        // bNodes already sorted by barycenter. Assign angle-sorted positions to them.
        bNodes.forEach(function(node, idx) {
            if (idx < positions.length) {
                var oldAngle = node.angle;
                node.x = positions[idx].x;
                node.y = positions[idx].y;
                node.angle = positions[idx].angle;
                node.radius = positions[idx].radius;
                node._gridSlot = positions[idx]._gridSlot;
                node._gridTier = positions[idx]._gridTier;
                if (Math.abs(oldAngle - node.angle) > 0.5) totalBarySwaps++;
            }
        });
    }

    _skseLog(schoolName + ': Barycenter reordered ' + totalBarySwaps + ' nodes (within school only)');
};

// =============================================================================
// SITTER NUDGE
// =============================================================================

/**
 * If a node sits on an unrelated edge, nudge it perpendicular to that edge.
 * Pick the nudge direction that's away from previously nudged nodes.
 * Single pass, O(nodes x edges) -- no trial swaps.
 *
 * @param {Object} ctx - Context from applyPositionsToTree containing:
 *   cfg, school, nodeByFormId, schoolName
 */
LayoutEngine._sitterNudge = function(ctx) {
    var cfg = ctx.cfg;
    var school = ctx.school;
    var nodeByFormId = ctx.nodeByFormId;
    var schoolName = ctx.schoolName;

    var nudgeDist = (cfg.arcSpacing || 56) * 0.45;
    var threshold = (cfg.arcSpacing || 56) * 0.4;
    var thresholdSq = threshold * threshold;

    // Build connection lookup
    var connected = new Set();
    school.nodes.forEach(function(n) {
        (n.children || []).forEach(function(cid) {
            connected.add(n.formId + '|' + cid);
            connected.add(cid + '|' + n.formId);
        });
        (n.prerequisites || []).forEach(function(pid) {
            connected.add(n.formId + '|' + pid);
            connected.add(pid + '|' + n.formId);
        });
    });

    // Collect edges
    var edges = [];
    var eSet = new Set();
    school.nodes.forEach(function(n) {
        if (n.x === undefined) return;
        (n.children || []).forEach(function(cid) {
            var c = nodeByFormId[cid];
            if (c && c.x !== undefined) {
                var k = n.formId + '>' + cid;
                if (!eSet.has(k)) { eSet.add(k); edges.push({ from: n, to: c }); }
            }
        });
        (n.prerequisites || []).forEach(function(pid) {
            var p = nodeByFormId[pid];
            if (p && p.x !== undefined) {
                var k = pid + '>' + n.formId;
                if (!eSet.has(k)) { eSet.add(k); edges.push({ from: p, to: n }); }
            }
        });
    });

    // Track nudged positions to bias direction
    var nudgedPositions = [];
    var nudgeCount = 0;

    school.nodes.forEach(function(node) {
        if (node.x === undefined || node.isRoot) return;

        // Find the closest edge this node sits on
        var closestEdge = null;
        var closestDistSq = Infinity;
        var closestT = 0;

        for (var ei = 0; ei < edges.length; ei++) {
            var e = edges[ei];
            if (e.from === node || e.to === node) continue;
            if (connected.has(e.from.formId + '|' + node.formId) ||
                connected.has(e.to.formId + '|' + node.formId)) continue;

            var dx = e.to.x - e.from.x, dy = e.to.y - e.from.y;
            var lenSq = dx * dx + dy * dy;
            if (lenSq < 25) continue;
            var t = ((node.x - e.from.x) * dx + (node.y - e.from.y) * dy) / lenSq;
            if (t < 0.05 || t > 0.95) continue;
            var projX = e.from.x + t * dx, projY = e.from.y + t * dy;
            var dSq = (node.x - projX) * (node.x - projX) + (node.y - projY) * (node.y - projY);

            if (dSq < thresholdSq && dSq < closestDistSq) {
                closestDistSq = dSq;
                closestEdge = e;
                closestT = t;
            }
        }

        if (!closestEdge) return;

        // Perpendicular to edge (two directions)
        var edx = closestEdge.to.x - closestEdge.from.x;
        var edy = closestEdge.to.y - closestEdge.from.y;
        var eLen = Math.sqrt(edx * edx + edy * edy);
        if (eLen < 1) return;
        var perpX = -edy / eLen;
        var perpY = edx / eLen;

        // Pick direction: away from nearest nudged node
        var dirSign = 1;
        if (nudgedPositions.length > 0) {
            // Find the closest nudged node
            var nearestDist = Infinity;
            var nearestX = 0, nearestY = 0;
            for (var ni = 0; ni < nudgedPositions.length; ni++) {
                var ndx = nudgedPositions[ni].x - node.x;
                var ndy = nudgedPositions[ni].y - node.y;
                var nd = ndx * ndx + ndy * ndy;
                if (nd < nearestDist) {
                    nearestDist = nd;
                    nearestX = nudgedPositions[ni].x;
                    nearestY = nudgedPositions[ni].y;
                }
            }
            // Which perpendicular direction points away from nearest nudged?
            var toNearX = nearestX - node.x, toNearY = nearestY - node.y;
            var dot = perpX * toNearX + perpY * toNearY;
            dirSign = dot > 0 ? -1 : 1;
        } else {
            // First nudge: go away from center (0,0)
            var dot0 = perpX * node.x + perpY * node.y;
            dirSign = dot0 > 0 ? 1 : -1;
        }

        node.x += perpX * nudgeDist * dirSign;
        node.y += perpY * nudgeDist * dirSign;
        nudgedPositions.push({ x: node.x, y: node.y });
        nudgeCount++;
    });

    if (nudgeCount > 0) {
        _skseLog(schoolName + ': Nudged ' + nudgeCount + ' sitter nodes off edges');
    }
};

// =============================================================================
// ORPHAN HANDLING (used by BFS growth in layoutEngineRadial.js)
// =============================================================================

/**
 * Assign positions to orphan nodes not reached by BFS traversal.
 * Orphans are placed in remaining valid positions, then fallback to all grid positions.
 *
 * @param {Object} params - Parameters:
 *   school, processedFormIds, validPositions, allGridPositions,
 *   usedPositions (Set, modified in-place), schoolName, assignedCount
 * @returns {number} - Updated assignedCount
 */
LayoutEngine._handleOrphans = function(params) {
    var school = params.school;
    var processedFormIds = params.processedFormIds;
    var validPositions = params.validPositions;
    var allGridPositions = params.allGridPositions;
    var usedPositions = params.usedPositions;
    var schoolName = params.schoolName;
    var assignedCount = params.assignedCount;

    var orphanNodes = school.nodes.filter(function(n) {
        return !processedFormIds.has(n.formId);
    });

    if (orphanNodes.length === 0) return assignedCount;

    console.log('[LayoutEngine]', schoolName + ':', orphanNodes.length, 'orphan nodes to assign');

    orphanNodes.sort(function(a, b) { return (a.tier || 0) - (b.tier || 0); });

    var remainingPositions = validPositions.filter(function(p) {
        return !usedPositions.has(p.tier + '_' + p.slotIndex);
    }).sort(function(a, b) {
        if (a.tier !== b.tier) return a.tier - b.tier;
        return a.slotIndex - b.slotIndex;
    });

    orphanNodes.forEach(function(node, idx) {
        if (idx < remainingPositions.length) {
            var pos = remainingPositions[idx];
            node.x = pos.x;
            node.y = pos.y;
            node.radius = pos.radius;
            node.angle = pos.angle;
            node._gridTier = pos.tier;
            node._fromLayoutEngine = true;
            node._gridSlot = pos.tier + '_' + pos.slotIndex;
            node._isOrphan = true;
            usedPositions.add(node._gridSlot);
            assignedCount++;
        } else {
            // Fallback to all grid positions
            var fallbackPos = allGridPositions.find(function(p) {
                return !usedPositions.has(p.tier + '_' + p.slotIndex);
            });
            if (fallbackPos) {
                node.x = fallbackPos.x;
                node.y = fallbackPos.y;
                node.radius = fallbackPos.radius;
                node.angle = fallbackPos.angle;
                node._gridTier = fallbackPos.tier;
                node._fromLayoutEngine = true;
                node._gridSlot = fallbackPos.tier + '_' + fallbackPos.slotIndex;
                node._isOrphan = true;
                usedPositions.add(node._gridSlot);
                assignedCount++;
            } else {
                console.warn('[LayoutEngine] No position for orphan:', node.name || node.formId);
                node.x = 0;
                node.y = 0;
                node._fromLayoutEngine = true;
                node._overflow = true;
            }
        }
    });

    return assignedCount;
};

// =============================================================================
// EXPORTS
// =============================================================================

window.LayoutEngine = LayoutEngine;

console.log('[LayoutEngine] Module loaded');
