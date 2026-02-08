/**
 * Tree Growth — CLASSIC Mode
 *
 * Growth algorithm: for each school, generates candidate grid positions in the
 * growth direction from root nodes, then claims the closest candidates first.
 * Each root gets an equal share of its school's spell count. Closest-first
 * claiming naturally produces a symmetric fan shape.
 *
 * Nodes have no strict connections in Classic mode.
 *
 * Self-registers with TreeGrowth via registerMode().
 */

var TreeGrowthClassic = {

    settings: {
        ghostOpacity: 35,
        nodeRadius: 5
    },

    // Placement cache — only recompute when baseData changes
    _cache: null,
    _lastCacheKey: '',

    // =========================================================================
    // SETTINGS UI
    // =========================================================================

    buildSettingsHTML: function() {
        var s = this.settings;
        var H = TreePreviewUtils.settingHTML;
        return '' +
            '<div class="tree-preview-settings-title">Classic Growth Settings</div>' +
            '<div class="tree-preview-settings-grid">' +
                H('Ghost Opacity', 'tgClassicOpacity', 0, 100, 5, s.ghostOpacity, '%') +
                H('Node Size', 'tgClassicNodeSize', 1, 20, 1, s.nodeRadius) +
            '</div>';
    },

    bindEvents: function() {
        var self = this;
        var B = TreePreviewUtils.bindInput;
        var dirty = function() {
            self._cache = null;
            if (typeof TreeGrowth !== 'undefined') TreeGrowth._markDirty();
        };

        B('tgClassicOpacity', function(v) { self.settings.ghostOpacity = v; dirty(); });
        B('tgClassicNodeSize', function(v) { self.settings.nodeRadius = v; dirty(); });
    },

    // =========================================================================
    // RENDER
    // =========================================================================

    render: function(ctx, w, h, baseData) {
        if (!baseData) {
            ctx.font = '12px sans-serif';
            ctx.fillStyle = 'rgba(184, 168, 120, 0.4)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Scan spells to see preview', w / 2, h / 2);
            return;
        }

        // 1. Render base grid + root nodes underneath
        baseData.renderGrid(ctx, w, h);

        // 2. Compute or retrieve cached placements
        var placements = this._getOrCompute(baseData, w, h);
        if (!placements || placements.length === 0) return;

        // 3. Render ghost nodes
        this._renderGhostNodes(ctx, w, h, placements);
    },

    // =========================================================================
    // CACHE
    // =========================================================================

    _buildCacheKey: function(baseData) {
        var parts = [
            baseData.mode,
            JSON.stringify(baseData.grid),
            baseData.rootNodes.length
        ];
        var sd = baseData.schoolData;
        if (sd) {
            var keys = [];
            for (var k in sd) {
                if (sd.hasOwnProperty(k)) keys.push(k + ':' + sd[k]);
            }
            keys.sort();
            parts.push(keys.join(','));
        }
        // Include root positions for cache invalidation when settings change
        for (var ri = 0; ri < baseData.rootNodes.length; ri++) {
            var rn = baseData.rootNodes[ri];
            parts.push(Math.round(rn.x) + ',' + Math.round(rn.y) + ',' + Math.round(rn.dir * 100));
        }
        return parts.join('|');
    },

    _getOrCompute: function(baseData, w, h) {
        var key = this._buildCacheKey(baseData);
        if (this._cache && this._lastCacheKey === key) {
            return this._cache;
        }

        var placements;
        if (baseData.mode === 'sun') {
            placements = this._computeSun(baseData, w, h);
        } else if (baseData.mode === 'flat') {
            placements = this._computeFlat(baseData, w, h);
        } else {
            placements = [];
        }

        this._cache = placements;
        this._lastCacheKey = key;
        return placements;
    },

    // =========================================================================
    // SUN MODE — CANDIDATE GENERATION + CLAIMING
    // =========================================================================

    _computeSun: function(baseData, w, h) {
        var grid = baseData.grid;
        if (!grid || !grid.tierSpacing) return [];

        var schools = baseData.schools;
        var rootNodes = baseData.rootNodes;
        var schoolData = baseData.schoolData;
        var tierSpacing = grid.tierSpacing;
        var ringTier = grid.ringTier || 1;
        var placements = [];

        for (var si = 0; si < schools.length; si++) {
            var school = schools[si];
            var spellCount = schoolData[school.name] || 0;
            if (spellCount === 0) continue;

            // Gather roots for this school
            var schoolRoots = [];
            for (var ri = 0; ri < rootNodes.length; ri++) {
                if (rootNodes[ri].school === school.name) {
                    schoolRoots.push(rootNodes[ri]);
                }
            }
            if (schoolRoots.length === 0) continue;

            // Determine growth direction from first root
            var growsOutward = this._isOutward(schoolRoots[0]);

            // Generate candidates within this school's arc
            var candidates = this._genSunCandidates(
                school.arcStart, school.arcSize,
                tierSpacing, ringTier, growsOutward,
                spellCount, grid.spokes
            );

            // Claim closest-first per root
            var claimed = this._claimClosest(schoolRoots, candidates, spellCount, school.color);
            for (var ci = 0; ci < claimed.length; ci++) {
                placements.push(claimed[ci]);
            }
        }

        return placements;
    },

    _isOutward: function(rootNode) {
        // Root node position is relative to center.
        // dir angle pointing outward = same direction as position vector.
        var posAngle = Math.atan2(rootNode.y, rootNode.x);
        var diff = Math.abs(rootNode.dir - posAngle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        return diff < Math.PI / 2;
    },

    _genSunCandidates: function(arcStart, arcSize, tierSpacing, ringTier, growsOutward, maxNeeded, spokes) {
        var candidates = [];
        // Generate enough tiers to have plenty of candidates
        var maxTiers = Math.ceil(maxNeeded / 2) + 5;

        for (var t = 1; t <= maxTiers; t++) {
            var tier = growsOutward ? (ringTier + t) : (ringTier - t);
            if (tier < 1) break;

            var radius = tier * tierSpacing;

            // Points per tier scale with circumference fraction
            var arcLen = arcSize * radius;
            var pointsOnArc = Math.max(1, Math.round(arcLen / tierSpacing));
            pointsOnArc = Math.min(pointsOnArc, 60);

            for (var p = 0; p < pointsOnArc; p++) {
                var tFrac = (p + 0.5) / pointsOnArc;
                var angle = arcStart + tFrac * arcSize;
                candidates.push({
                    x: Math.cos(angle) * radius,
                    y: Math.sin(angle) * radius,
                    tier: tier,
                    claimed: false
                });
            }
        }

        return candidates;
    },

    // =========================================================================
    // FLAT MODE — CANDIDATE GENERATION + CLAIMING
    // =========================================================================

    _computeFlat: function(baseData, w, h) {
        var grid = baseData.grid;
        if (!grid || !grid.spacing) return [];

        var schools = baseData.schools;
        var rootNodes = baseData.rootNodes;
        var schoolData = baseData.schoolData;
        var spacing = grid.spacing;
        var isHoriz = grid.direction === 'horizontal';
        var placements = [];

        for (var si = 0; si < schools.length; si++) {
            var school = schools[si];
            var spellCount = schoolData[school.name] || 0;
            if (spellCount === 0) continue;

            var schoolRoots = [];
            for (var ri = 0; ri < rootNodes.length; ri++) {
                if (rootNodes[ri].school === school.name) {
                    schoolRoots.push(rootNodes[ri]);
                }
            }
            if (schoolRoots.length === 0) continue;

            var growDir = schoolRoots[0].dir;

            var candidates = this._genFlatCandidates(
                school.segStart, school.segSize,
                spacing, growDir, isHoriz, spellCount
            );

            var claimed = this._claimClosest(schoolRoots, candidates, spellCount, school.color);
            for (var ci = 0; ci < claimed.length; ci++) {
                placements.push(claimed[ci]);
            }
        }

        return placements;
    },

    _genFlatCandidates: function(segStart, segSize, spacing, growDir, isHoriz, maxNeeded) {
        var candidates = [];
        var alongCount = Math.max(1, Math.round(segSize / spacing));
        var maxRows = Math.ceil(maxNeeded / Math.max(1, alongCount)) + 3;

        var crossDirX = Math.cos(growDir);
        var crossDirY = Math.sin(growDir);

        for (var row = 1; row <= maxRows; row++) {
            var crossOffset = row * spacing;

            for (var col = 0; col < alongCount; col++) {
                var tFrac = (col + 0.5) / alongCount;
                var alongPos = segStart + tFrac * segSize;

                var x, y;
                if (isHoriz) {
                    x = alongPos + crossDirX * crossOffset;
                    y = crossDirY * crossOffset;
                } else {
                    x = crossDirX * crossOffset;
                    y = alongPos + crossDirY * crossOffset;
                }

                candidates.push({
                    x: x,
                    y: y,
                    row: row,
                    claimed: false
                });
            }
        }

        return candidates;
    },

    // =========================================================================
    // CLAIMING — SHARED BY SUN AND FLAT
    // =========================================================================

    _claimClosest: function(roots, candidates, spellCount, color) {
        var result = [];
        if (roots.length === 0 || candidates.length === 0 || spellCount === 0) return result;

        var perRoot = Math.ceil(spellCount / roots.length);
        var remaining = spellCount;

        for (var ri = 0; ri < roots.length; ri++) {
            var root = roots[ri];
            var rx = root.x;
            var ry = root.y;
            var quota = Math.min(perRoot, remaining);
            if (quota <= 0) break;

            // Build distance-sorted list of unclaimed candidates
            var scored = [];
            for (var ci = 0; ci < candidates.length; ci++) {
                if (candidates[ci].claimed) continue;
                var dx = candidates[ci].x - rx;
                var dy = candidates[ci].y - ry;
                scored.push({ idx: ci, dist: dx * dx + dy * dy });
            }

            scored.sort(function(a, b) { return a.dist - b.dist; });

            var claimed = 0;
            for (var si = 0; si < scored.length && claimed < quota; si++) {
                var cand = candidates[scored[si].idx];
                cand.claimed = true;
                result.push({
                    x: cand.x,
                    y: cand.y,
                    color: color,
                    connections: []
                });
                claimed++;
            }
            remaining -= claimed;
        }

        return result;
    },

    // =========================================================================
    // GHOST NODE RENDERING
    // =========================================================================

    _renderGhostNodes: function(ctx, w, h, placements) {
        var cx = w / 2;
        var cy = h / 2;
        var opacity = this.settings.ghostOpacity / 100;
        var nodeR = this.settings.nodeRadius;

        for (var i = 0; i < placements.length; i++) {
            var p = placements[i];
            var gx = cx + p.x;
            var gy = cy + p.y;

            // Glow
            ctx.beginPath();
            ctx.arc(gx, gy, nodeR + 2, 0, Math.PI * 2);
            ctx.fillStyle = this._hexToRgba(p.color, opacity * 0.3);
            ctx.fill();

            // Body
            ctx.beginPath();
            ctx.arc(gx, gy, nodeR, 0, Math.PI * 2);
            ctx.fillStyle = this._hexToRgba(p.color, opacity);
            ctx.fill();

            // Border
            ctx.strokeStyle = 'rgba(255, 255, 255, ' + (opacity * 0.3) + ')';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    },

    _hexToRgba: function(hex, alpha) {
        if (!hex || hex.charAt(0) !== '#') return 'rgba(136,136,136,' + alpha + ')';
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    },

    // =========================================================================
    // EXTERNAL API
    // =========================================================================

    getSettings: function() {
        return {
            ghostOpacity: this.settings.ghostOpacity,
            nodeRadius: this.settings.nodeRadius
        };
    }
};

// Self-register when TreeGrowth is available
if (typeof TreeGrowth !== 'undefined') {
    TreeGrowth.registerMode('classic', TreeGrowthClassic);
}
