/**
 * ClassicLayout — Core definition and helpers for grid-aware Classic Growth layout.
 *
 * Positions NLP tree nodes ON actual grid dot positions from the Root Base
 * preview. Consumes gridPoints[] from TreePreview.getOutput() which contains
 * every rendered grid dot tagged with its school name.
 *
 * Algorithm:
 *   1. Filter gridPoints to this school's dots
 *   2. Build adjacency graph (8 nearest neighbors within distance threshold)
 *   3. Snap root to nearest grid dot to physical root position
 *   4. BFS: children placed at adjacent unoccupied grid dots, preferring
 *      the growth direction (outward/inward per root node's dir)
 *
 * Usage:
 *   var result = ClassicLayout.layoutAllSchools(treeData, baseData);
 *   // result.schools["Destruction"] => { nodes: [...], color: "#C85050" }
 *
 * Extended by: classicLayoutGrid.js, classicLayoutSpell.js
 * Depends on: state.js (state.lastSpellData for spell lookups)
 */
var ClassicLayout = {

    _seed: 0,

    // ---- PUBLIC API ---------------------------------------------------------

    layoutAllSchools: function (treeData, baseData, layoutSettings) {
        var result = { schools: {} };
        if (!treeData || !treeData.schools || !baseData) return result;

        var ls = layoutSettings || {};
        var spread = ls.spread !== undefined ? ls.spread : 50;
        var radialBias = ls.radialBias !== undefined ? ls.radialBias : 50;

        // Spread → hard cap on how many occupied neighbors a candidate can have.
        // 0 = no limit (8), 100 = very strict (max 1 occupied neighbor)
        this._maxOccupiedNeighbors = Math.max(1, Math.round(8 - spread * 0.07));

        // Radial Bias → weight of radial outward bonus in scoring.
        // 0 = no radial preference, 100 = radial dominates direction score (~3x)
        // Direction score is ±1.0, so radialWeight of 3.0 at max fully overrides it.
        this._radialWeight = radialBias * 0.03;

        // Spell Matching: 'simple' = no theme scoring, 'layered'/'smart' = theme-aware
        var matchMode = ls.spellMatching || 'layered';
        this._useThemeScoring = (matchMode === 'layered' || matchMode === 'smart');
        this._smartThemes = (matchMode === 'smart');

        // Dynamic grid expansion: expand grid when a school runs out of placement space
        this._dynamicGridExpansion = ls.dynamicGridExpansion !== false;

        var mode = baseData.mode || 'sun';
        var grid = baseData.grid;
        var baseSchools = baseData.schools || [];
        var rootNodes = baseData.rootNodes || [];
        var allGridPoints = baseData.gridPoints || [];
        var tierSpacing = grid.tierSpacing || 30;

        // Tier zone config for two-pass layout
        var tierZones = ls.tierZones || null;
        var estimatedMaxDepth = 0;
        if (tierZones) {
            estimatedMaxDepth = this._estimateMaxDepth(treeData);
        }
        this._tierZones = tierZones;
        this._estimatedMaxDepth = estimatedMaxDepth;
        this._centerMask = ls.centerMask !== undefined ? ls.centerMask : 0;

        // Globe offset for mask — read from CORE panel (independent of loaded tree)
        var globeOff = (typeof TreeCore !== 'undefined' && TreeCore.getOutput)
            ? TreeCore.getOutput() : { x: 0, y: 0 };
        this._globeX = globeOff.x;
        this._globeY = globeOff.y;

        console.log('[ClassicLayout] mode=' + mode + ' baseSchools=' + baseSchools.length +
            ' rootNodes=' + rootNodes.length + ' gridPoints=' + allGridPoints.length +
            ' maxOccNeighbors=' + this._maxOccupiedNeighbors + ' radialW=' + this._radialWeight.toFixed(2) +
            ' tierZones=' + (tierZones ? 'yes' : 'no') + ' estMaxDepth=' + estimatedMaxDepth);
        if (tierZones) {
            for (var tzKey in tierZones) {
                if (tierZones.hasOwnProperty(tzKey)) {
                    console.log('[ClassicLayout]   ' + tzKey + ': ' + tierZones[tzKey].min + '%-' + tierZones[tzKey].max + '%');
                }
            }
        }

        // Debug: show grid point distribution per ring (first school)
        if (allGridPoints.length > 0) {
            var ringCounts = {};
            for (var dbi = 0; dbi < Math.min(allGridPoints.length, 5000); dbi++) {
                var dbp = allGridPoints[dbi];
                var dbr = Math.round(Math.sqrt(dbp.x * dbp.x + dbp.y * dbp.y));
                ringCounts[dbr] = (ringCounts[dbr] || 0) + 1;
            }
            var ringKeys = Object.keys(ringCounts).sort(function(a, b) { return Number(a) - Number(b); });
            var sample = ringKeys.slice(0, 8).map(function(k) { return 'r' + k + ':' + ringCounts[k]; });
            console.log('[ClassicLayout] Grid points per ring (first 8): ' + sample.join(', '));
        }

        var ringRadius = grid.ringRadius || ((grid.ringTier || 3) * tierSpacing);

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
                console.warn('[ClassicLayout] No baseSchool match for "' + schoolName + '"');
                continue;
            }

            var schoolRoots = [];
            for (var ri = 0; ri < rootNodes.length; ri++) {
                if (rootNodes[ri].school === schoolName) schoolRoots.push(rootNodes[ri]);
            }
            if (schoolRoots.length === 0) {
                console.warn('[ClassicLayout] No rootNodes for "' + schoolName + '"');
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

        // ---- Pass 1: Layout WITHOUT tier zones to measure per-school tree height ----
        var schoolHeights = {}; // schoolName -> max radius of placed nodes
        if (tierZones) {
            this._tierZones = null; // disable tier zones for pass 1
            this._simulatedMaxRadius = 0;
            for (var p1i = 0; p1i < schoolDataList.length; p1i++) {
                var sd1 = schoolDataList[p1i];
                this._seed = this._hashString(sd1.name);
                var pass1Nodes = this._layoutOnGrid(
                    sd1.tree, sd1.info, sd1.roots, grid, sd1.gridPts, mode
                );
                var schoolMaxR = 0;
                for (var p1n = 0; p1n < pass1Nodes.length; p1n++) {
                    var p1r = Math.sqrt(pass1Nodes[p1n].x * pass1Nodes[p1n].x +
                                        pass1Nodes[p1n].y * pass1Nodes[p1n].y);
                    if (p1r > schoolMaxR) schoolMaxR = p1r;
                }
                schoolHeights[sd1.name] = schoolMaxR;
                console.log('[ClassicLayout] Pass 1: ' + sd1.name + ' tree height radius = ' + schoolMaxR.toFixed(1));
            }
            this._tierZones = tierZones; // re-enable for pass 2
        }

        // ---- Pass 2 (or only pass): Layout with tier zones using per-school height ----
        var globalMaxGridR = 0;
        for (var p2i = 0; p2i < schoolDataList.length; p2i++) {
            var sd2 = schoolDataList[p2i];
            // Set per-school simulated max radius for tier zone scoring
            this._simulatedMaxRadius = schoolHeights[sd2.name] || 0;
            this._seed = this._hashString(sd2.name);
            var positioned = this._layoutOnGrid(
                sd2.tree, sd2.info, sd2.roots, grid, sd2.gridPts, mode
            );
            result.schools[sd2.name] = {
                nodes: positioned,
                color: sd2.info.color || '#888888',
                treeMaxRadius: schoolHeights[sd2.name] || this._maxGridRadius
            };
            if (this._maxGridRadius > globalMaxGridR) globalMaxGridR = this._maxGridRadius;
            console.log('[ClassicLayout] ' + sd2.name + ': ' + positioned.length +
                ' nodes on ' + sd2.gridPts.length + ' grid points');
        }

        // Store zone info for visual debug rendering
        result.zoneInfo = {
            ringRadius: ringRadius,
            maxGridRadius: globalMaxGridR
        };

        return result;
    },

    // ---- TREE DEPTH ESTIMATION (pass 1 for tier zones) --------------------

    /**
     * Estimate max BFS depth across all schools by traversing the tree
     * structure without grid placement. Used for tier zone percentage calc.
     *
     * @param {Object} treeData - { schools: { name: { root, nodes[] } } }
     * @returns {number} max BFS depth across all schools
     */
    _estimateMaxDepth: function (treeData) {
        var maxDepth = 0;
        for (var schoolName in treeData.schools) {
            if (!treeData.schools.hasOwnProperty(schoolName)) continue;
            var school = treeData.schools[schoolName];
            var lookup = this._buildNodeLookup(school.nodes);
            var rootId = school.root;
            if (!lookup[rootId]) continue;

            // BFS the tree structure
            var queue = [{ formId: rootId, depth: 0 }];
            var visited = {};
            visited[rootId] = true;
            while (queue.length > 0) {
                var cur = queue.shift();
                if (cur.depth > maxDepth) maxDepth = cur.depth;
                var node = lookup[cur.formId];
                if (!node || !node.children) continue;
                for (var ci = 0; ci < node.children.length; ci++) {
                    var childId = node.children[ci];
                    if (!visited[childId]) {
                        visited[childId] = true;
                        queue.push({ formId: childId, depth: cur.depth + 1 });
                    }
                }
            }
        }
        return maxDepth;
    },

    // ---- GRID GRAPH CONSTRUCTION -------------------------------------------

    /**
     * Build an adjacency graph from grid points.
     * Each point gets up to 8 nearest neighbors within distance threshold.
     * Works for all grid types (naive, linear, equalArea, fibonacci, square).
     *
     * @param {Array} points - [{x, y, school}]
     * @param {number} tierSpacing - Grid tier spacing (used for distance threshold)
     * @returns {{ points: Array, adj: Object }}
     */
    _buildGridGraph: function (points, tierSpacing) {
        // Distance threshold: covers diagonal neighbors on any grid type
        var maxDist = tierSpacing * 2.0;
        var maxDist2 = maxDist * maxDist;
        var maxNeighbors = 8;
        var adj = {};

        // Spatial hash: O(N) amortized instead of O(N²)
        var cellSize = maxDist;
        var cells = {};
        for (var hi = 0; hi < points.length; hi++) {
            var hcx = Math.floor(points[hi].x / cellSize);
            var hcy = Math.floor(points[hi].y / cellSize);
            var hk = hcx + ',' + hcy;
            if (!cells[hk]) cells[hk] = [];
            cells[hk].push(hi);
        }

        for (var i = 0; i < points.length; i++) {
            var pi = points[i];
            var cx = Math.floor(pi.x / cellSize);
            var cy = Math.floor(pi.y / cellSize);
            var candidates = [];
            // Check 3x3 cell neighborhood
            for (var dcx = -1; dcx <= 1; dcx++) {
                for (var dcy = -1; dcy <= 1; dcy++) {
                    var nk = (cx + dcx) + ',' + (cy + dcy);
                    var cell = cells[nk];
                    if (!cell) continue;
                    for (var ci = 0; ci < cell.length; ci++) {
                        var j = cell[ci];
                        if (i === j) continue;
                        var dx = points[j].x - pi.x;
                        var dy = points[j].y - pi.y;
                        var d2 = dx * dx + dy * dy;
                        if (d2 <= maxDist2) {
                            candidates.push({ idx: j, dist: d2 });
                        }
                    }
                }
            }
            candidates.sort(function (a, b) { return a.dist - b.dist; });
            adj[i] = [];
            for (var k = 0; k < Math.min(maxNeighbors, candidates.length); k++) {
                adj[i].push(candidates[k].idx);
            }
        }

        return { points: points, adj: adj };
    },

    // ---- GROUP BUILDING (balanced for multiple physical roots) ---------------

    /**
     * Builds groups mapping tree seeds to physical root positions.
     *
     * Single root: one group, seed = [rootFormId]
     * Multi root:  rootFormId is virtual (not placed). First-level children
     *   are distributed across physical roots balanced by subtree size.
     *   Uses greedy scheduling: always assign next-largest subtree to the
     *   group with the smallest total so far.
     */
    _buildGroups: function (rootFormId, rootChildren, physicalRoots, nodeLookup) {
        var physCount = physicalRoots.length;

        if (physCount <= 1) {
            return [{ physicalRoot: physicalRoots[0], seedIds: [rootFormId] }];
        }

        // Count subtree sizes for each first-level child
        var childSizes = [];
        for (var i = 0; i < rootChildren.length; i++) {
            var visited = {};
            visited[rootFormId] = true; // don't traverse back through root
            var size = this._countSubtree(rootChildren[i], nodeLookup, visited);
            childSizes.push({ formId: rootChildren[i], size: size });
        }

        // Sort by subtree size descending (assign largest subtrees first)
        childSizes.sort(function (a, b) { return b.size - a.size; });

        // Greedy balanced assignment: each child goes to the group with
        // the smallest total subtree size so far
        var groups = [];
        var groupTotals = [];
        for (var pi = 0; pi < physCount; pi++) {
            groups.push({ physicalRoot: physicalRoots[pi], seedIds: [] });
            groupTotals.push(0);
        }

        for (var ci = 0; ci < childSizes.length; ci++) {
            var minIdx = 0;
            for (var gi = 1; gi < physCount; gi++) {
                if (groupTotals[gi] < groupTotals[minIdx]) minIdx = gi;
            }
            groups[minIdx].seedIds.push(childSizes[ci].formId);
            groupTotals[minIdx] += childSizes[ci].size;
        }

        console.log('[ClassicLayout] Group distribution: ' +
            groups.map(function (g, i) {
                return 'G' + i + '=' + g.seedIds.length + ' seeds (' + groupTotals[i] + ' nodes)';
            }).join(', '));

        return groups;
    },

    /**
     * Count total nodes in a subtree (recursive).
     * @param {string} formId - Root of subtree
     * @param {Object} nodeLookup - formId -> node
     * @param {Object} visited - already-counted formIds (prevents cycles)
     * @returns {number} total node count including this node
     */
    _countSubtree: function (formId, nodeLookup, visited) {
        if (visited[formId]) return 0;
        visited[formId] = true;
        var node = nodeLookup[formId];
        if (!node) return 0;
        var count = 1;
        var children = node.children || [];
        for (var i = 0; i < children.length; i++) {
            count += this._countSubtree(children[i], nodeLookup, visited);
        }
        return count;
    },

    // ---- HELPERS ------------------------------------------------------------

    _isOutward: function (rootNode) {
        var posAngle = Math.atan2(rootNode.y, rootNode.x);
        var diff = Math.abs((rootNode.dir || 0) - posAngle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        return diff < Math.PI / 2;
    },

    _buildNodeLookup: function (nodes) {
        var lookup = {};
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].formId != null) lookup[nodes[i].formId] = nodes[i];
        }
        return lookup;
    },

    _getSpellData: function () {
        if (typeof state !== 'undefined' && state.lastSpellData && state.lastSpellData.spells) {
            return state.lastSpellData.spells;
        }
        return null;
    },

    _findSpell: function (formId, spells) {
        if (!formId) return null;
        // Use pre-built map for O(1) lookup
        if (this._spellMap) return this._spellMap[formId] || null;
        if (!spells) return null;
        for (var i = 0; i < spells.length; i++) {
            if (spells[i].formId === formId) return spells[i];
        }
        return null;
    },

    _shuffleArray: function (arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(this._seededRandom() * (i + 1));
            var tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
    },

    _seededRandom: function () {
        this._seed = (this._seed * 1664525 + 1013904223) & 0xFFFFFFFF;
        return (this._seed >>> 0) / 4294967296;
    },

    /**
     * Densify a school's grid by adding midpoints between existing grid points.
     * Called when a school has more tree nodes than grid points.
     * Adds points at midpoints of the outermost ring edges first (most space),
     * then progressively inward. Preserves the school tag from neighbors.
     */
    _densifyGrid: function (pts, needed, tierSpacing) {
        var result = pts.slice(); // copy original
        var added = 0;
        var existingSet = {};
        for (var ei = 0; ei < result.length; ei++) {
            var ek = Math.round(result[ei].x) + ',' + Math.round(result[ei].y);
            existingSet[ek] = true;
        }
        var school = pts.length > 0 ? pts[0].school : '';
        var maxDist = tierSpacing * 2.2;
        var maxDist2 = maxDist * maxDist;

        // Build pairs sorted by radius (outermost first, most room to add)
        // Spatial hash for O(N) pair discovery instead of O(N²)
        var pairCellSize = maxDist;
        var pairCells = {};
        for (var phi = 0; phi < pts.length; phi++) {
            var phcx = Math.floor(pts[phi].x / pairCellSize);
            var phcy = Math.floor(pts[phi].y / pairCellSize);
            var phk = phcx + ',' + phcy;
            if (!pairCells[phk]) pairCells[phk] = [];
            pairCells[phk].push(phi);
        }
        var pairs = [];
        for (var i = 0; i < pts.length; i++) {
            var pcx = Math.floor(pts[i].x / pairCellSize);
            var pcy = Math.floor(pts[i].y / pairCellSize);
            for (var pdcx = -1; pdcx <= 1; pdcx++) {
                for (var pdcy = -1; pdcy <= 1; pdcy++) {
                    var pnk = (pcx + pdcx) + ',' + (pcy + pdcy);
                    var pCell = pairCells[pnk];
                    if (!pCell) continue;
                    for (var pci = 0; pci < pCell.length; pci++) {
                        var j = pCell[pci];
                        if (j <= i) continue; // avoid duplicate pairs
                        var dx = pts[j].x - pts[i].x;
                        var dy = pts[j].y - pts[i].y;
                        var d2 = dx * dx + dy * dy;
                        if (d2 <= maxDist2 && d2 > 1) {
                            var avgR = (Math.sqrt(pts[i].x * pts[i].x + pts[i].y * pts[i].y) +
                                        Math.sqrt(pts[j].x * pts[j].x + pts[j].y * pts[j].y)) / 2;
                            pairs.push({ i: i, j: j, avgR: avgR });
                        }
                    }
                }
            }
        }
        pairs.sort(function (a, b) { return b.avgR - a.avgR; });

        for (var pi = 0; pi < pairs.length && added < needed; pi++) {
            var p = pairs[pi];
            var mx = (pts[p.i].x + pts[p.j].x) / 2;
            var my = (pts[p.i].y + pts[p.j].y) / 2;
            var mk = Math.round(mx) + ',' + Math.round(my);
            if (existingSet[mk]) continue;
            existingSet[mk] = true;
            result.push({ x: mx, y: my, school: school });
            added++;
        }

        // Multi-round radial extension: keep adding outward tiers until we have enough
        var extensionRound = 0;
        var seedStart = 0; // index into result to start scanning for outermost seeds
        while (added < needed && extensionRound < 50) {
            extensionRound++;
            var addedThisRound = 0;
            // Sort unprocessed points by radius descending (outermost first)
            var seeds = result.slice(seedStart).sort(function (a, b) {
                var ra = a.x * a.x + a.y * a.y;
                var rb = b.x * b.x + b.y * b.y;
                return rb - ra;
            });
            seedStart = result.length; // next round starts from new points
            for (var oi = 0; oi < seeds.length && added < needed; oi++) {
                var op = seeds[oi];
                var oR = Math.sqrt(op.x * op.x + op.y * op.y);
                if (oR < 1) continue;
                var nx = op.x * (1 + tierSpacing / oR);
                var ny = op.y * (1 + tierSpacing / oR);
                var nk = Math.round(nx) + ',' + Math.round(ny);
                if (existingSet[nk]) continue;
                existingSet[nk] = true;
                result.push({ x: nx, y: ny, school: school });
                added++;
                addedThisRound++;
            }
            if (addedThisRound === 0) break; // no progress, stop
        }

        console.log('[ClassicLayout] Densified grid: ' + pts.length + ' -> ' + result.length +
            ' points (added ' + added + '/' + needed + ')');
        return result;
    },

    _hashString: function (str) {
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash | 0;
        }
        return hash;
    },

    /**
     * Compute angular sub-sectors for each theme within a school.
     * Themes are proportionally sized by spell count, centered on the growth direction.
     *
     * @param {Array} schoolNodes - nodes from the tree data (must have .theme)
     * @param {number} dirX - growth direction cos
     * @param {number} dirY - growth direction sin
     * @returns {Object|null} theme -> { center, min, max } angles, or null if no themes
     */
    _computeThemeSectors: function (schoolNodes, dirX, dirY) {
        var counts = {};
        var total = 0;
        for (var i = 0; i < schoolNodes.length; i++) {
            var t = schoolNodes[i].theme || '_none';
            counts[t] = (counts[t] || 0) + 1;
            total++;
        }
        if (total === 0) return null;

        // Sort themes largest-first (biggest gets center position)
        var themes = Object.keys(counts).sort(function (a, b) {
            return counts[b] - counts[a];
        });

        var baseAngle = Math.atan2(dirY, dirX);
        var spread = Math.PI * 0.78; // ~70° each side of growth direction
        var startAngle = baseAngle - spread / 2;

        var sectors = {};
        var cursor = startAngle;
        for (var ti = 0; ti < themes.length; ti++) {
            var theme = themes[ti];
            var proportion = counts[theme] / total;
            var size = spread * proportion;
            sectors[theme] = {
                center: cursor + size / 2,
                min: cursor,
                max: cursor + size
            };
            cursor += size;
        }

        console.log('[ClassicLayout] Theme sectors (' + themes.length + ' themes): ' +
            themes.slice(0, 5).map(function (t) {
                return t + ':' + counts[t];
            }).join(', '));

        return sectors;
    }
};
