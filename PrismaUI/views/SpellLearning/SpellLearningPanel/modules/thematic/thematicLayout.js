/**
 * ThematicLayout -- Grid-aware layout for Thematic Growth mode.
 *
 * Positions NLP tree nodes ON actual grid dot positions from the Root Base
 * preview, with two layout strategies:
 *
 *   Themed BFS: Divides each school's angular sector into sub-arcs
 *               proportional to branch spell count, with branchSpacing degree
 *               gaps between theme wedges. BFS-places each branch's spells
 *               within its allocated sub-arc. Trunk theme centered.
 *
 *   Normal BFS: Standard BFS placement like Classic (no theme sub-arcs).
 *               Uses school colors, no theme awareness in layout.
 *
 * Usage:
 *   var result = ThematicLayout.layoutAllSchools(treeData, baseData, settings);
 *   // result.schools["Destruction"] => { nodes: [...], color: "#C85050", branches: [...] }
 *
 * Depends on: state.js (state.lastSpellData for spell lookups)
 */
var ThematicLayout = {

    _seed: 0,

    // ---- PUBLIC API ---------------------------------------------------------

    /**
     * Layout all schools, dispatching to themed or normal mode.
     *
     * @param {Object} treeData - Tree data from C++ backend
     * @param {Object} baseData - Output from TreePreview.getOutput()
     * @param {Object} settings - Layout settings
     * @returns {{ schools: Object }} Result with positioned nodes per school
     */
    layoutAllSchools: function (treeData, baseData, layoutSettings) {
        var result = { schools: {} };
        if (!treeData || !treeData.schools || !baseData) return result;

        var ls = layoutSettings || {};
        var layoutMode = ls.layoutMode || 'themed';

        var mode = baseData.mode || 'sun';
        var grid = baseData.grid;
        var baseSchools = baseData.schools || [];
        var rootNodes = baseData.rootNodes || [];
        var allGridPoints = baseData.gridPoints || [];
        var tierSpacing = grid.tierSpacing || 30;
        var ringRadius = grid.ringRadius || ((grid.ringTier || 3) * tierSpacing);

        console.log('[ThematicLayout] mode=' + mode + ' layoutMode=' + layoutMode +
            ' baseSchools=' + baseSchools.length + ' rootNodes=' + rootNodes.length +
            ' gridPoints=' + allGridPoints.length);

        // ---- Pre-compute per-school data (grid points, info, roots) ----
        var schoolDataList = [];
        for (var schoolName in treeData.schools) {
            if (!treeData.schools.hasOwnProperty(schoolName)) continue;

            var schoolTree = treeData.schools[schoolName];
            var schoolInfo = null;
            for (var si = 0; si < baseSchools.length; si++) {
                if (baseSchools[si].name === schoolName) { schoolInfo = baseSchools[si]; break; }
            }
            if (!schoolInfo) {
                console.warn('[ThematicLayout] No baseSchool match for "' + schoolName + '"');
                continue;
            }

            var schoolRoots = [];
            for (var ri = 0; ri < rootNodes.length; ri++) {
                if (rootNodes[ri].school === schoolName) schoolRoots.push(rootNodes[ri]);
            }
            if (schoolRoots.length === 0) {
                console.warn('[ThematicLayout] No rootNodes for "' + schoolName + '"');
                continue;
            }

            // Filter grid points belonging to this school
            var schoolGridPts = [];
            if (mode === 'flat') {
                for (var gpi = 0; gpi < allGridPoints.length; gpi++) {
                    if (allGridPoints[gpi].school === schoolName) {
                        schoolGridPts.push(allGridPoints[gpi]);
                    }
                }
            } else {
                var growsOutward = this._isOutward(schoolRoots[0]);
                var minLayoutR;
                if (growsOutward) {
                    minLayoutR = ringRadius - tierSpacing;
                } else {
                    minLayoutR = tierSpacing;
                }
                for (var gpi2 = 0; gpi2 < allGridPoints.length; gpi2++) {
                    var gp = allGridPoints[gpi2];
                    if (gp.school !== schoolName) continue;
                    var gpR = Math.sqrt(gp.x * gp.x + gp.y * gp.y);
                    if (gpR >= minLayoutR) {
                        schoolGridPts.push(gp);
                    }
                }
            }

            schoolDataList.push({
                name: schoolName,
                tree: schoolTree,
                info: schoolInfo,
                roots: schoolRoots,
                gridPts: schoolGridPts
            });
        }

        // ---- Layout each school ----
        for (var sdi = 0; sdi < schoolDataList.length; sdi++) {
            var sd = schoolDataList[sdi];
            this._seed = this._hashString(sd.name);
            var schoolColor = sd.info.color || '#888888';

            var positioned;
            var branches;
            if (layoutMode === 'themed') {
                var themedResult = this._layoutThemedBFS(sd.tree, sd.info, sd.roots, grid, sd.gridPts, mode, ls);
                positioned = themedResult.nodes;
                branches = themedResult.branches;
            } else {
                positioned = this._layoutNormalBFS(sd.tree, sd.info, sd.roots, grid, sd.gridPts, mode, ls);
                branches = [];
            }

            result.schools[sd.name] = {
                nodes: positioned,
                color: schoolColor,
                branches: branches
            };

            console.log('[ThematicLayout] ' + sd.name + ': ' + positioned.length +
                ' nodes, ' + branches.length + ' branches (' + layoutMode + ')');
        }

        return result;
    },

    /**
     * Extract branch metadata from a school tree for the renderer.
     *
     * @param {Object} schoolTree - Tree data for one school
     * @param {string} schoolColor - Fallback color
     * @returns {Array} branches - Array of { name, themeColor, nodeFormIds }
     */
    buildBranchMeta: function (schoolTree, schoolColor) {
        var branches = [];
        if (!schoolTree || !schoolTree.branches) return branches;

        for (var bi = 0; bi < schoolTree.branches.length; bi++) {
            var b = schoolTree.branches[bi];
            branches.push({
                name: b.name || b.theme || ('Branch ' + bi),
                themeColor: b.color || schoolColor || '#888888',
                nodeFormIds: b.spellIds || b.spell_ids || [],
                isTrunk: !!b.is_trunk
            });
        }
        return branches;
    },

    // ---- THEMED BFS LAYOUT --------------------------------------------------

    /**
     * Themed BFS: angular sub-arcs per theme branch within the school's sector.
     *
     * @param {Object} schoolTree - Tree data for one school
     * @param {Object} schoolInfo - Base school info (color, etc.)
     * @param {Array} roots - Root nodes for this school
     * @param {Object} grid - Grid config
     * @param {Array} gridPts - Grid points for this school
     * @param {string} mode - 'sun' or 'flat'
     * @param {Object} ls - Layout settings
     * @returns {{ nodes: Array, branches: Array }}
     */
    _layoutThemedBFS: function (schoolTree, schoolInfo, roots, grid, gridPts, mode, ls) {
        var branchSpacing = ls.branchSpacing !== undefined ? ls.branchSpacing : 30;
        var schoolColor = schoolInfo.color || '#888888';
        var nodes = schoolTree.nodes || [];
        var srcBranches = schoolTree.branches || [];

        // Build branch metadata
        var branches = this.buildBranchMeta(schoolTree, schoolColor);

        if (branches.length === 0 || nodes.length === 0) {
            // Fallback: treat all nodes as one branch
            return {
                nodes: this._layoutNormalBFS(schoolTree, schoolInfo, roots, grid, gridPts, mode, ls),
                branches: branches
            };
        }

        // Build formId -> node lookup
        var nodeById = {};
        for (var ni = 0; ni < nodes.length; ni++) {
            if (nodes[ni].formId) nodeById[nodes[ni].formId] = nodes[ni];
        }

        // Compute school's angular sector from root direction
        var rootDir = roots[0].dir || 0;
        var numSchools = 1;
        if (typeof TreePreview !== 'undefined' && TreePreview.getOutput) {
            var preview = TreePreview.getOutput();
            if (preview && preview.schools) numSchools = preview.schools.length || 1;
        }
        var sectorWidth = (2 * Math.PI) / numSchools;
        var sectorStart = rootDir - sectorWidth / 2;

        // Compute total spell count across branches for proportional arcs
        var totalSpells = 0;
        for (var bi = 0; bi < branches.length; bi++) {
            totalSpells += (branches[bi].nodeFormIds || []).length;
        }
        if (totalSpells === 0) totalSpells = 1;

        // Allocate angular sub-arcs, trunk first (center), then sides
        // Adaptive spacing: gaps use at most 15% of sector, rest for branches
        var numGaps = Math.max(0, branches.length - 1);
        var maxGapBudget = sectorWidth * 0.15;
        var spacingRad = numGaps > 0
            ? Math.min((branchSpacing * Math.PI) / 180, maxGapBudget / numGaps)
            : 0;
        var totalGap = spacingRad * numGaps;
        var usableArc = sectorWidth - totalGap;
        if (usableArc < 0.2) usableArc = 0.2;

        // Sort: trunk branch first, then by spell count descending
        var sortedBranches = branches.slice().sort(function (a, b) {
            if (a.isTrunk && !b.isTrunk) return -1;
            if (!a.isTrunk && b.isTrunk) return 1;
            return (b.nodeFormIds || []).length - (a.nodeFormIds || []).length;
        });

        // Assign angular arcs proportionally
        var branchArcs = [];
        var currentAngle = sectorStart;
        for (var ai = 0; ai < sortedBranches.length; ai++) {
            var brSpellCount = (sortedBranches[ai].nodeFormIds || []).length;
            var arcSize = (brSpellCount / totalSpells) * usableArc;
            if (arcSize < 0.05) arcSize = 0.05;

            branchArcs.push({
                branch: sortedBranches[ai],
                startAngle: currentAngle,
                endAngle: currentAngle + arcSize,
                midAngle: currentAngle + arcSize / 2
            });
            currentAngle += arcSize + spacingRad;
        }

        // BFS-place each branch within its angular arc
        var allPositioned = [];
        var occupiedSet = {};
        var tierSpacing = grid.tierSpacing || 30;
        var gridAdj = this._buildGridAdjacency(gridPts, tierSpacing);
        var ringRadius = grid.ringRadius || ((grid.ringTier || 3) * tierSpacing);

        // Build grid point lookup by key for adjacency-based search
        var gridPtMap = {};
        for (var gmi = 0; gmi < gridPts.length; gmi++) {
            gridPtMap[gridPts[gmi].x + ',' + gridPts[gmi].y] = gridPts[gmi];
        }

        // Position map: formId -> {x, y} — tracks where each node was placed
        var positionMap = {};

        for (var bai = 0; bai < branchArcs.length; bai++) {
            var arc = branchArcs[bai];
            var branchFormIds = arc.branch.nodeFormIds || [];
            var themeColor = arc.branch.themeColor;
            var branchName = arc.branch.name;

            // Build fast lookup set for branch membership
            var branchSet = {};
            for (var bsi = 0; bsi < branchFormIds.length; bsi++) {
                branchSet[branchFormIds[bsi]] = true;
            }

            // Get the root node for this branch (first in list or parent attachment)
            var branchRoot = null;
            if (branchFormIds.length > 0) {
                branchRoot = nodeById[branchFormIds[0]];
            }
            if (!branchRoot) continue;

            // BFS through the branch nodes, placing them within the angular arc
            var queue = [branchRoot.formId];
            var visited = {};
            visited[branchRoot.formId] = true;

            while (queue.length > 0) {
                var currentId = queue.shift();
                var currentNode = nodeById[currentId];
                if (!currentNode) continue;

                // Get parent position for grid-local search
                var pId = currentNode.parentFormId || currentNode.parent_form_id || null;
                if (!pId && currentNode.prerequisites && currentNode.prerequisites.length > 0) {
                    pId = currentNode.prerequisites[0];
                }
                var parentPos = pId ? positionMap[pId] : null;

                // Find best grid point: adjacency walk from parent
                var bestPt = this._findBestGridPoint(
                    currentNode, gridPts, occupiedSet, gridAdj, gridPtMap,
                    arc.startAngle, arc.endAngle, ringRadius, mode, roots[0],
                    parentPos, tierSpacing
                );

                if (bestPt) {
                    occupiedSet[bestPt.x + ',' + bestPt.y] = true;
                    positionMap[currentNode.formId] = { x: bestPt.x, y: bestPt.y };
                    allPositioned.push({
                        formId: currentNode.formId,
                        name: currentNode.name || '',
                        x: bestPt.x,
                        y: bestPt.y,
                        schoolColor: schoolColor,
                        themeColor: themeColor,
                        skillLevel: currentNode.skillLevel || currentNode.skill_level || '',
                        tier: currentNode.tier || 1,
                        theme: branchName,
                        children: currentNode.children || [],
                        parentFormId: pId,
                        isRoot: currentNode.isRoot || false,
                        branch: branchName
                    });
                }

                // Enqueue children from this branch
                var children = currentNode.children || [];
                for (var ci = 0; ci < children.length; ci++) {
                    var childId = children[ci];
                    if (!visited[childId] && nodeById[childId] && branchSet[childId]) {
                        visited[childId] = true;
                        queue.push(childId);
                    }
                }
            }
        }

        // Sweep any nodes not yet positioned (orphans, cross-branch children, etc.)
        var positionedSet = {};
        for (var psi = 0; psi < allPositioned.length; psi++) {
            positionedSet[allPositioned[psi].formId] = true;
        }
        for (var nid in nodeById) {
            if (!nodeById.hasOwnProperty(nid) || positionedSet[nid]) continue;
            var orphanNode = nodeById[nid];
            var oPId = orphanNode.parentFormId || orphanNode.parent_form_id || null;
            if (!oPId && orphanNode.prerequisites && orphanNode.prerequisites.length > 0) {
                oPId = orphanNode.prerequisites[0];
            }
            var oParentPos = oPId ? positionMap[oPId] : null;
            var bestPt = this._findBestGridPoint(
                orphanNode, gridPts, occupiedSet, gridAdj, gridPtMap,
                -Math.PI, Math.PI, ringRadius, mode, roots[0],
                oParentPos, tierSpacing
            );
            if (bestPt) {
                occupiedSet[bestPt.x + ',' + bestPt.y] = true;
                positionMap[orphanNode.formId] = { x: bestPt.x, y: bestPt.y };
                allPositioned.push({
                    formId: orphanNode.formId,
                    name: orphanNode.name || '',
                    x: bestPt.x,
                    y: bestPt.y,
                    schoolColor: schoolColor,
                    themeColor: orphanNode.themeColor || schoolColor,
                    skillLevel: orphanNode.skillLevel || orphanNode.skill_level || '',
                    tier: orphanNode.tier || 1,
                    theme: 'other',
                    children: orphanNode.children || [],
                    parentFormId: oPId,
                    isRoot: orphanNode.isRoot || false,
                    branch: 'other'
                });
            }
        }

        return { nodes: allPositioned, branches: branches };
    }
};

console.log('[ThematicLayout] Loaded');
