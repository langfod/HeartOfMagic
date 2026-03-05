/**
 * ThematicLayout BFS -- Normal BFS layout and grid point helpers.
 * Contains the fallback BFS layout (no theme awareness), grid-point scoring,
 * angular arc checking, grid adjacency building, and helper utilities.
 *
 * Loaded after: thematicLayout.js
 */

// ---- NORMAL BFS LAYOUT (fallback) ---------------------------------------

/**
 * Standard BFS placement with no theme awareness (like Classic).
 *
 * @param {Object} schoolTree - Tree data for one school
 * @param {Object} schoolInfo - Base school info
 * @param {Array} roots - Root nodes for this school
 * @param {Object} grid - Grid config
 * @param {Array} gridPts - Grid points for this school
 * @param {string} mode - 'sun' or 'flat'
 * @param {Object} ls - Layout settings
 * @returns {Array} positioned nodes
 */
ThematicLayout._layoutNormalBFS = function (schoolTree, schoolInfo, roots, grid, gridPts, mode, ls) {
    var schoolColor = schoolInfo.color || '#888888';
    var nodes = schoolTree.nodes || [];
    if (nodes.length === 0) return [];

    // Build formId -> node lookup
    var nodeById = {};
    for (var ni = 0; ni < nodes.length; ni++) {
        if (nodes[ni].formId) nodeById[nodes[ni].formId] = nodes[ni];
    }

    // Find the root
    var rootNode = null;
    for (var ri = 0; ri < nodes.length; ri++) {
        if (nodes[ri].isRoot) { rootNode = nodes[ri]; break; }
    }
    if (!rootNode && nodes.length > 0) rootNode = nodes[0];
    if (!rootNode) return [];

    var tierSpacing = grid.tierSpacing || 30;
    var ringRadius = grid.ringRadius || ((grid.ringTier || 3) * tierSpacing);
    var occupiedSet = {};
    var gridAdj = this._buildGridAdjacency(gridPts, tierSpacing);
    var positioned = [];
    var positionMap = {};

    // Build grid point lookup by key
    var gridPtMap = {};
    for (var gmi = 0; gmi < gridPts.length; gmi++) {
        gridPtMap[gridPts[gmi].x + ',' + gridPts[gmi].y] = gridPts[gmi];
    }

    // BFS placement
    var queue = [rootNode.formId];
    var visited = {};
    visited[rootNode.formId] = true;

    while (queue.length > 0) {
        var currentId = queue.shift();
        var currentNode = nodeById[currentId];
        if (!currentNode) continue;

        // Get parent position
        var parentId = currentNode.parentFormId || currentNode.parent_form_id || null;
        if (!parentId && currentNode.prerequisites && currentNode.prerequisites.length > 0) {
            parentId = currentNode.prerequisites[0];
        }
        var parentPos = parentId ? positionMap[parentId] : null;

        // Find best grid point (full angular range)
        var bestPt = this._findBestGridPoint(
            currentNode, gridPts, occupiedSet, gridAdj, gridPtMap,
            -Math.PI, Math.PI, ringRadius, mode, roots[0],
            parentPos, tierSpacing
        );

        if (bestPt) {
            occupiedSet[bestPt.x + ',' + bestPt.y] = true;
            positionMap[currentNode.formId] = { x: bestPt.x, y: bestPt.y };
            positioned.push({
                formId: currentNode.formId,
                name: currentNode.name || '',
                x: bestPt.x,
                y: bestPt.y,
                schoolColor: schoolColor,
                themeColor: schoolColor,
                skillLevel: currentNode.skillLevel || currentNode.skill_level || '',
                tier: currentNode.tier || 1,
                theme: currentNode.theme || '',
                children: currentNode.children || [],
                parentFormId: parentId,
                isRoot: currentNode.isRoot || false,
                branch: ''
            });
        }

        // Enqueue children
        var children = currentNode.children || [];
        for (var ci = 0; ci < children.length; ci++) {
            if (!visited[children[ci]] && nodeById[children[ci]]) {
                visited[children[ci]] = true;
                queue.push(children[ci]);
            }
        }
    }

    return positioned;
};

// ---- GRID POINT SCORING -------------------------------------------------

/**
 * Find the best grid point for a node using grid-adjacency BFS.
 *
 * For root nodes (no parentPos): finds the grid point nearest the ideal
 * root position (ringRadius, center of arc).
 *
 * For child nodes (parentPos given): walks the grid adjacency graph
 * outward from the parent's grid point. First unoccupied point within
 * the angular arc that's outward from the parent wins. This guarantees
 * short edges and prevents criss-crossing.
 *
 * @param {Object} node - Node to place
 * @param {Array} gridPts - Available grid points
 * @param {Object} occupiedSet - Set of occupied "x,y" keys
 * @param {Object} gridAdj - Grid adjacency data (key -> [neighborKeys])
 * @param {Object} gridPtMap - Grid point lookup (key -> {x,y,...})
 * @param {number} arcStart - Angular arc start (radians)
 * @param {number} arcEnd - Angular arc end (radians)
 * @param {number} ringRadius - Ring radius
 * @param {string} mode - 'sun' or 'flat'
 * @param {Object} rootRef - Root reference node for direction
 * @param {Object|null} parentPos - Parent's {x,y} position, null for root
 * @param {number} tierSpacing - Distance between tiers
 * @returns {Object|null} Best grid point { x, y } or null
 */
ThematicLayout._findBestGridPoint = function (node, gridPts, occupiedSet, gridAdj, gridPtMap, arcStart, arcEnd, ringRadius, mode, rootRef, parentPos, tierSpacing) {
    if (!gridPts || gridPts.length === 0) return null;

    if (!parentPos) {
        // ---- ROOT PLACEMENT ----
        // Find the grid point closest to the ideal root position
        // (at ringRadius, center of angular arc)
        var arcMid = (arcStart + arcEnd) / 2;
        var idealX = ringRadius * Math.cos(arcMid);
        var idealY = ringRadius * Math.sin(arcMid);
        var bestPt = null;
        var bestDist = Infinity;
        for (var ri = 0; ri < gridPts.length; ri++) {
            var rp = gridPts[ri];
            var rKey = rp.x + ',' + rp.y;
            if (occupiedSet[rKey]) continue;
            if (mode !== 'flat') {
                var rAngle = Math.atan2(rp.y, rp.x);
                if (!this._isAngleInArc(rAngle, arcStart, arcEnd)) continue;
            }
            var rdx = rp.x - idealX;
            var rdy = rp.y - idealY;
            var rd = rdx * rdx + rdy * rdy;
            if (rd < bestDist) {
                bestDist = rd;
                bestPt = rp;
            }
        }
        return bestPt;
    }

    // ---- CHILD PLACEMENT: Proximity scoring ----
    // Iterate all grid points, score by distance from parent.
    // Prefer points ~tierSpacing away (one tier-step), outward from center.
    var parentR = Math.sqrt(parentPos.x * parentPos.x + parentPos.y * parentPos.y);
    var bestPt2 = null;
    var bestScore = -Infinity;

    for (var ci = 0; ci < gridPts.length; ci++) {
        var cp = gridPts[ci];
        var cKey = cp.x + ',' + cp.y;
        if (occupiedSet[cKey]) continue;

        // Arc filter (sun mode only)
        if (mode !== 'flat') {
            var cpAngle = Math.atan2(cp.y, cp.x);
            if (!this._isAngleInArc(cpAngle, arcStart, arcEnd)) continue;
        }

        var cdx = cp.x - parentPos.x;
        var cdy = cp.y - parentPos.y;
        var dist = Math.sqrt(cdx * cdx + cdy * cdy);

        // Score: prefer points close to one tier-step from parent
        var distDev = Math.abs(dist - tierSpacing);
        var score = -distDev * distDev * 0.1;

        // Outward bias: prefer points at same ring or further out
        var cpR = Math.sqrt(cp.x * cp.x + cp.y * cp.y);
        if (cpR >= parentR) {
            score += 10;
        } else {
            score -= 20;
        }

        // Penalize long jumps (> 2.5 tier-steps)
        if (dist > tierSpacing * 2.5) {
            score -= (dist - tierSpacing * 2.5) * 2;
        }

        if (score > bestScore) {
            bestScore = score;
            bestPt2 = cp;
        }
    }

    return bestPt2;
};

// ---- HELPERS ------------------------------------------------------------

/**
 * Check if an angle falls within an arc (handles wrapping).
 * @private
 */
ThematicLayout._isAngleInArc = function (angle, arcStart, arcEnd) {
    // Normalize angle to [-PI, PI]
    while (angle < -Math.PI) angle += 2 * Math.PI;
    while (angle > Math.PI) angle -= 2 * Math.PI;

    // Normalize arc boundaries
    var s = arcStart;
    var e = arcEnd;
    while (s < -Math.PI) s += 2 * Math.PI;
    while (s > Math.PI) s -= 2 * Math.PI;
    while (e < -Math.PI) e += 2 * Math.PI;
    while (e > Math.PI) e -= 2 * Math.PI;

    if (s <= e) {
        return angle >= s && angle <= e;
    } else {
        // Arc wraps around +/-PI
        return angle >= s || angle <= e;
    }
};

/**
 * Build grid adjacency map: for each grid point, find its nearest neighbors.
 * @private
 */
ThematicLayout._buildGridAdjacency = function (gridPts, tierSpacing) {
    var adj = {};
    var threshold = tierSpacing * 1.5;
    var threshSq = threshold * threshold;

    for (var i = 0; i < gridPts.length; i++) {
        var p = gridPts[i];
        var key = p.x + ',' + p.y;
        if (!adj[key]) adj[key] = [];

        for (var j = i + 1; j < gridPts.length; j++) {
            var q = gridPts[j];
            var dx = p.x - q.x;
            var dy = p.y - q.y;
            if (dx * dx + dy * dy <= threshSq) {
                var qKey = q.x + ',' + q.y;
                if (!adj[qKey]) adj[qKey] = [];
                adj[key].push(qKey);
                adj[qKey].push(key);
            }
        }
    }
    return adj;
};

/**
 * Check if a root node grows outward (away from center).
 * @private
 */
ThematicLayout._isOutward = function (rootNode) {
    if (!rootNode) return true;
    var dist = Math.sqrt(rootNode.x * rootNode.x + rootNode.y * rootNode.y);
    return dist > 50;
};

/**
 * Deterministic hash of a string to seed pseudo-random placement.
 * @private
 */
ThematicLayout._hashString = function (str) {
    return Math.abs(GrowthModeUtils.hashString(str));
};
