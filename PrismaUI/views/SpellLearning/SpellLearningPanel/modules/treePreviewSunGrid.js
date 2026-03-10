/**
 * TreePreviewSun Grid — Grid point computation and naive grid rendering.
 *
 * Extracted grid-related methods from TreePreviewSun:
 * - _addKNNNeighbors: K-nearest-neighbor spatial connections
 * - _collectGridPoints: Grid point generation for all grid types
 * - _renderNaiveGrid: Built-in naive radial grid renderer
 * - _drawArrow, _pseudoRandom, _hexToRgba: Utility delegates
 *
 * Loaded after: treePreviewSun.js
 */

/**
 * Add K-nearest-neighbor connections to points starting at startIdx.
 * Used for irregular grids (fibonacci, equal area) where structural
 * neighbors can't be pre-computed from ring/spoke indices.
 */
TreePreviewSun._addKNNNeighbors = function(points, startIdx, K) {
    var count = points.length - startIdx;
    if (count < 2) return;

    // Bounding box for spatial hash
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var bi = startIdx; bi < points.length; bi++) {
        if (points[bi].x < minX) minX = points[bi].x;
        if (points[bi].x > maxX) maxX = points[bi].x;
        if (points[bi].y < minY) minY = points[bi].y;
        if (points[bi].y > maxY) maxY = points[bi].y;
    }

    // Cell size: ~4 pts per cell on average -> 5x5 search gives ~100 candidates
    var area = Math.max(1, (maxX - minX) * (maxY - minY));
    var cellSize = Math.max(1, Math.sqrt(area / count) * 2);

    // Build spatial hash buckets
    var buckets = {};
    for (var gi = startIdx; gi < points.length; gi++) {
        var gcx = Math.floor((points[gi].x - minX) / cellSize);
        var gcy = Math.floor((points[gi].y - minY) / cellSize);
        var gkey = gcx + '_' + gcy;
        if (!buckets[gkey]) buckets[gkey] = [];
        buckets[gkey].push(gi);
    }

    // For each point, find K nearest from nearby cells (5x5 neighborhood)
    var searchRing = 2;
    for (var i = startIdx; i < points.length; i++) {
        var pi = points[i];
        var pcx = Math.floor((pi.x - minX) / cellSize);
        var pcy = Math.floor((pi.y - minY) / cellSize);

        var dists = [];
        for (var dx = -searchRing; dx <= searchRing; dx++) {
            for (var dy = -searchRing; dy <= searchRing; dy++) {
                var nkey = (pcx + dx) + '_' + (pcy + dy);
                var bucket = buckets[nkey];
                if (!bucket) continue;
                for (var ci = 0; ci < bucket.length; ci++) {
                    var j = bucket[ci];
                    if (i === j) continue;
                    var ddx = pi.x - points[j].x;
                    var ddy = pi.y - points[j].y;
                    dists.push({ idx: j, d: ddx * ddx + ddy * ddy });
                }
            }
        }

        dists.sort(function(a, b) { return a.d - b.d; });
        var nCount = Math.min(K, dists.length);
        for (var k = 0; k < nCount; k++) {
            pi._neighbors.push(dists[k].idx);
        }
    }
};

/**
 * Collect all grid point positions (matching the active grid module's layout).
 * Each point: { x, y, school }  (coords relative to center)
 */
TreePreviewSun._collectGridPoints = function(gridType, opts, schools, arcStarts, arcSizes) {
    var points = [];
    var tierSpacing = opts.tierSpacing;
    var spokes = opts.spokes;
    var maxExtent = opts.maxExtent;
    var maxDots = opts.maxDots || 20000;
    var PI2 = Math.PI * 2;
    var schoolCount = schools.length;
    var self = this;
    console.log('[TreePreviewSun] _collectGridPoints gridType=' + gridType + ' spokes=' + spokes + ' tierSpacing=' + tierSpacing);

    function getSchool(angle) {
        if (schoolCount === 0) return '';
        var a = ((angle % PI2) + PI2) % PI2;
        for (var i = 0; i < schoolCount; i++) {
            var start = arcStarts[i];
            var end = start + arcSizes[i];
            if (end > PI2) {
                if (a >= start || a < end - PI2) return schools[i];
            } else {
                if (a >= start && a < end) return schools[i];
            }
        }
        return schools[schoolCount - 1];
    }

    if (gridType === 'equalArea') {
        var maxRadius = maxExtent;
        var linearDensity = Math.ceil(maxExtent / tierSpacing);
        var totalRings = Math.min(500, linearDensity * 4);
        var ring1R = Math.sqrt(1 / totalRings) * maxRadius;
        var eaBs = (PI2 * ring1R) / Math.max(spokes, 4);
        var ga = Math.PI * (3 - Math.sqrt(5));
        var eaBase = points.length;
        for (var k = 1; k <= totalRings && points.length < maxDots; k++) {
            var eaR = Math.sqrt(k / totalRings) * maxRadius;
            var eaC = PI2 * eaR;
            var eaPc = Math.max(spokes, Math.round(eaC / eaBs));
            var eaAs = PI2 / eaPc;
            var rOff = k * ga;
            for (var ep = 0; ep < eaPc && points.length < maxDots; ep++) {
                var eaA = ep * eaAs + rOff;
                points.push({
                    x: Math.cos(eaA) * eaR, y: Math.sin(eaA) * eaR,
                    school: getSchool(eaA),
                    _ptIdx: points.length, _moveDir: eaA, _neighbors: []
                });
            }
        }
        // KNN neighbors for equal area (irregular structure)
        self._addKNNNeighbors(points, eaBase, 8);
    } else if (gridType === 'fibonacci') {
        var fibGa = Math.PI * (3 - Math.sqrt(5));
        var fibR = maxExtent;
        var fibTiers = Math.ceil(maxExtent / tierSpacing);
        var fibTotal = Math.min(Math.round(0.5 * spokes * fibTiers * fibTiers), maxDots);
        var fibBase = points.length;
        for (var fi = 1; fi <= fibTotal; fi++) {
            var fr = fibR * Math.sqrt(fi / fibTotal);
            var fa = fi * fibGa;
            points.push({
                x: Math.cos(fa) * fr, y: Math.sin(fa) * fr,
                school: getSchool(fa),
                _ptIdx: points.length, _moveDir: fa, _neighbors: []
            });
        }
        // KNN neighbors for fibonacci (spiral, no regular grid)
        self._addKNNNeighbors(points, fibBase, 8);
    } else if (gridType === 'square') {
        // Square grid with 8-connected neighbor pre-computation
        var sqHc = Math.ceil(maxExtent / tierSpacing);
        var sqIdxMap = {}; // "gx,gy" -> index
        for (var gx = -sqHc; gx <= sqHc && points.length < maxDots; gx++) {
            for (var gy = -sqHc; gy <= sqHc && points.length < maxDots; gy++) {
                if (gx === 0 && gy === 0) continue;
                var sqDx = gx * tierSpacing;
                var sqDy = gy * tierSpacing;
                var sqA = Math.atan2(sqDy, sqDx);
                if (sqA < 0) sqA += PI2;
                sqIdxMap[gx + ',' + gy] = points.length;
                points.push({
                    x: sqDx, y: sqDy, school: getSchool(sqA),
                    _ptIdx: points.length, _gx: gx, _gy: gy,
                    _moveDir: sqA, _neighbors: []
                });
            }
        }
        // 8-connected neighbors
        var sqDirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (var sqi = 0; sqi < points.length; sqi++) {
            var sqPt = points[sqi];
            if (sqPt._gx === undefined) continue;
            for (var sd = 0; sd < sqDirs.length; sd++) {
                var sqNk = (sqPt._gx + sqDirs[sd][0]) + ',' + (sqPt._gy + sqDirs[sd][1]);
                if (sqIdxMap[sqNk] !== undefined) {
                    sqPt._neighbors.push(sqIdxMap[sqNk]);
                }
            }
        }
    } else if (gridType === 'naive') {
        // Naive grid with 8-connected ring/spoke neighbor pre-computation
        console.log('[TreePreviewSun] NAIVE branch: dotsPerRing=' + (spokes * 3));
        var naiveDotsPerRing = spokes * 3;
        var naiveAngleStep = PI2 / naiveDotsPerRing;
        var naiveTotalTiers = Math.ceil(maxExtent / tierSpacing);
        var naiveDotTiers = Math.min(naiveTotalTiers, Math.floor(maxDots / Math.max(1, naiveDotsPerRing)));
        var naiveBase = points.length; // offset for index calculation
        for (var nr = 1; nr <= naiveDotTiers && points.length < maxDots; nr++) {
            var naiveR = nr * tierSpacing;
            for (var ng = 0; ng < naiveDotsPerRing && points.length < maxDots; ng++) {
                var naiveA = ng * naiveAngleStep;
                points.push({
                    x: Math.cos(naiveA) * naiveR,
                    y: Math.sin(naiveA) * naiveR,
                    school: getSchool(naiveA),
                    _ptIdx: points.length,
                    _moveDir: naiveA, // radially outward
                    _neighbors: []
                });
            }
        }
        // Build 8-connected neighbors: ring +/-1, spoke +/-1
        var dpr = naiveDotsPerRing;
        for (var npi = naiveBase; npi < points.length; npi++) {
            var npt = points[npi];
            var ri = Math.floor((npi - naiveBase) / dpr) + 1; // 1-indexed ring
            var si = (npi - naiveBase) % dpr;
            var prevS = (si - 1 + dpr) % dpr;
            var nextS = (si + 1) % dpr;
            // Same ring: prev/next spoke
            npt._neighbors.push(naiveBase + (ri - 1) * dpr + prevS);
            npt._neighbors.push(naiveBase + (ri - 1) * dpr + nextS);
            // Inner ring (ring - 1)
            if (ri > 1) {
                npt._neighbors.push(naiveBase + (ri - 2) * dpr + si);
                npt._neighbors.push(naiveBase + (ri - 2) * dpr + prevS);
                npt._neighbors.push(naiveBase + (ri - 2) * dpr + nextS);
            }
            // Outer ring (ring + 1)
            if (ri < naiveDotTiers) {
                npt._neighbors.push(naiveBase + ri * dpr + si);
                npt._neighbors.push(naiveBase + ri * dpr + prevS);
                npt._neighbors.push(naiveBase + ri * dpr + nextS);
            }
        }
    } else {
        // Linear (default) - variable dots per ring, with neighbor pre-computation
        var baseSpacing = (PI2 * tierSpacing) / spokes;
        var totalTiers = Math.ceil(maxExtent / tierSpacing);
        var linBase = points.length;
        var linRingStart = []; // ringIndex -> start offset in points
        var linRingCount = []; // ringIndex -> point count in that ring
        for (var lr = 1; lr <= totalTiers && points.length < maxDots; lr++) {
            var lrR = lr * tierSpacing;
            var lrC = PI2 * lrR;
            var lrPc = Math.max(spokes, Math.round(lrC / baseSpacing));
            var lrAs = PI2 / lrPc;
            linRingStart.push(points.length - linBase);
            linRingCount.push(lrPc);
            for (var lp = 0; lp < lrPc && points.length < maxDots; lp++) {
                var lrA = lp * lrAs;
                points.push({
                    x: Math.cos(lrA) * lrR,
                    y: Math.sin(lrA) * lrR,
                    school: getSchool(lrA),
                    _ptIdx: points.length,
                    _moveDir: lrA,
                    _ring: lr - 1, _spoke: lp,
                    _neighbors: []
                });
            }
        }
        // Neighbors for linear: same ring +/-1 spoke, adjacent rings nearest angle
        for (var lni = linBase; lni < points.length; lni++) {
            var lpt = points[lni];
            var lri = lpt._ring;
            var lsi = lpt._spoke;
            var lrc = linRingCount[lri];
            // Same ring neighbors
            lpt._neighbors.push(linBase + linRingStart[lri] + ((lsi - 1 + lrc) % lrc));
            lpt._neighbors.push(linBase + linRingStart[lri] + ((lsi + 1) % lrc));
            // Inner ring: find closest angular match
            if (lri > 0) {
                var irc = linRingCount[lri - 1];
                var irBase = linBase + linRingStart[lri - 1];
                var irMap = Math.round(lsi * irc / lrc);
                if (irMap >= irc) irMap = irc - 1;
                lpt._neighbors.push(irBase + irMap);
                if (irMap > 0) lpt._neighbors.push(irBase + irMap - 1);
                if (irMap < irc - 1) lpt._neighbors.push(irBase + irMap + 1);
            }
            // Outer ring
            if (lri < linRingCount.length - 1) {
                var orc = linRingCount[lri + 1];
                var orBase = linBase + linRingStart[lri + 1];
                var orMap = Math.round(lsi * orc / lrc);
                if (orMap >= orc) orMap = orc - 1;
                lpt._neighbors.push(orBase + orMap);
                if (orMap > 0) lpt._neighbors.push(orBase + orMap - 1);
                if (orMap < orc - 1) lpt._neighbors.push(orBase + orMap + 1);
            }
        }
    }

    return points;
};

/**
 * Built-in naive grid: fixed angular divisions, same point count per ring
 */
TreePreviewSun._renderNaiveGrid = function(ctx, cx, cy, opts) {
    var tierSpacing = opts.tierSpacing;
    var spokes = opts.spokes;
    var maxExtent = opts.maxExtent;
    var ringTier = opts.ringTier;
    var ringRadius = opts.ringRadius;
    var totalTiers = Math.ceil(maxExtent / tierSpacing);
    var angleStep = (Math.PI * 2) / spokes;

    // Concentric tier rings - batch by style
    var innerRings = [];
    var outerRings = [];
    var rootRingR = -1;
    for (var r = 1; r <= totalTiers; r++) {
        var ringR = r * tierSpacing;
        if (r === ringTier) {
            rootRingR = ringR;
        } else if (r < ringTier) {
            innerRings.push(ringR);
        } else {
            outerRings.push(ringR);
        }
    }
    if (outerRings.length > 0) {
        ctx.strokeStyle = 'rgba(184, 168, 120, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var ori = 0; ori < outerRings.length; ori++) { ctx.moveTo(cx + outerRings[ori], cy); ctx.arc(cx, cy, outerRings[ori], 0, Math.PI * 2); }
        ctx.stroke();
    }
    if (innerRings.length > 0) {
        ctx.strokeStyle = 'rgba(184, 168, 120, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var iri = 0; iri < innerRings.length; iri++) { ctx.moveTo(cx + innerRings[iri], cy); ctx.arc(cx, cy, innerRings[iri], 0, Math.PI * 2); }
        ctx.stroke();
    }
    if (rootRingR > 0) {
        ctx.strokeStyle = 'rgba(184, 168, 120, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + rootRingR, cy);
        ctx.arc(cx, cy, rootRingR, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Radial spokes - single batched path
    ctx.strokeStyle = 'rgba(184, 168, 120, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var g = 0; g < spokes; g++) {
        var angle = g * angleStep;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * maxExtent, cy + Math.sin(angle) * maxExtent);
    }
    ctx.stroke();

    // Grid dots - batch by color for single path per color
    var maxDots = opts.maxDots || 20000;
    var dotsPerRing = spokes * 3;
    var dotAngleStep = (Math.PI * 2) / dotsPerRing;
    var dotTiers = Math.min(totalTiers, Math.floor(maxDots / Math.max(1, dotsPerRing)));
    var naiveBuckets = {};
    for (var g2 = 0; g2 < dotsPerRing; g2++) {
        var dotAngle = g2 * dotAngleStep;
        var cosA = Math.cos(dotAngle);
        var sinA = Math.sin(dotAngle);
        var dotColor = opts.pointColorFn ? opts.pointColorFn(dotAngle) : 'rgba(184, 168, 120, 0.15)';
        if (!naiveBuckets[dotColor]) naiveBuckets[dotColor] = [];
        var nbucket = naiveBuckets[dotColor];
        for (var r2 = 1; r2 <= dotTiers; r2++) {
            var dotR = r2 * tierSpacing;
            nbucket.push(cx + cosA * dotR, cy + sinA * dotR);
        }
    }
    for (var nbColor in naiveBuckets) {
        var nbPts = naiveBuckets[nbColor];
        ctx.fillStyle = nbColor;
        ctx.beginPath();
        for (var nbi = 0; nbi < nbPts.length; nbi += 2) {
            ctx.rect(nbPts[nbi] - 1, nbPts[nbi + 1] - 1, 3, 3);
        }
        ctx.fill();
    }

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(184, 168, 120, 0.5)';
    ctx.fill();
};

/**
 * Draw a direction arrow from node edge outward (delegates to TreePreviewUtils)
 */
TreePreviewSun._drawArrow = function(ctx, nx, ny, angle, nodeSize, color) {
    TreePreviewUtils.drawArrow(ctx, nx, ny, angle, nodeSize, color);
};

/**
 * Deterministic pseudo-random from seed (delegates to TreePreviewUtils)
 */
TreePreviewSun._pseudoRandom = function(seed) {
    return TreePreviewUtils.pseudoRandom(seed);
};

/**
 * Convert hex color to rgba string (delegates to TreePreviewUtils)
 */
TreePreviewSun._hexToRgba = function(hex, alpha) { return TreePreviewUtils.hexToRgba(hex, alpha); };
