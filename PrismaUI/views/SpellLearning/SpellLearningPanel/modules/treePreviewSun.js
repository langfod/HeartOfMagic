/**
 * Tree Preview — SUN Mode
 *
 * Root base settings and renderer for the SUN (radial/wheel) layout.
 * Grid rendering is delegated to pluggable grid modules (Naive, Linear,
 * Equal Area, Fibonacci) that register via registerGrid().
 * The root ring sits on a specific tier. School root nodes are placed
 * centered within their arc sections.
 *
 * Self-registers with TreePreview via registerMode().
 *
 * Depends on: treePreviewUtils.js (drag inputs), treePreview.js (registers into it)
 * Grid modules: sunGridLinear.js, sunGridEqualArea.js, sunGridFibonacci.js
 */

var TreePreviewSun = {

    settings: {
        ringTier: 3,
        nodeSize: 8,
        rootsPerSchool: 1,
        gridDensity: 10,
        tierDensity: 5,
        rootClumping: 0,
        rootRandomness: 0,
        gridType: 'naive',
        proportional: false,
        invertGrowth: false
    },

    // Pluggable grid renderers
    _grids: {},
    _gridOrder: ['naive', 'linear', 'equalArea', 'fibonacci', 'square'],

    // Grid point cache (avoids recomputing KNN every frame)
    _gridPointCache: null,
    _gridPointCacheKey: '',

    // Offscreen canvas cache (avoids redrawing thousands of dots every frame)
    _gridCanvas: null,
    _gridCanvasKey: '',
    _gridCanvasW: 0,
    _gridCanvasH: 0,

    registerGrid: function(name, module) {
        this._grids[name] = module;
        console.log('[TreePreviewSun] Registered grid: ' + name);
    },

    // School colors matching CSS variables
    _schoolColors: {
        'Destruction': '#C85050',
        'Restoration': '#C8B850',
        'Alteration': '#50A868',
        'Conjuration': '#9068C8',
        'Illusion': '#5098C8'
    },

    /**
     * Build the settings panel HTML for SUN mode
     */
    buildSettingsHTML: function() {
        var s = this.settings;
        var H = TreePreviewUtils.settingHTML;
        return '' +
            '<div class="tree-preview-settings-title">' + t('preview.sun.title') + '</div>' +

            // --- Toggles at top ---
            '<div class="tree-preview-setting">' +
                '<label class="tree-preview-label">' + t('preview.sun.gridType') + '</label>' +
                '<div class="tree-preview-toggle-row tree-preview-toggle-wrap">' +
                    '<button class="tree-preview-toggle-btn' + (s.gridType === 'naive' ? ' active' : '') + '" ' +
                        'id="tpSunGridNaive" data-grid="naive">' + t('preview.sun.naive') + '</button>' +
                    '<button class="tree-preview-toggle-btn' + (s.gridType === 'linear' ? ' active' : '') + '" ' +
                        'id="tpSunGridLinear" data-grid="linear">' + t('preview.sun.linear') + '</button>' +
                    '<button class="tree-preview-toggle-btn' + (s.gridType === 'equalArea' ? ' active' : '') + '" ' +
                        'id="tpSunGridEqArea" data-grid="equalArea">' + t('preview.sun.equalArea') + '</button>' +
                    '<button class="tree-preview-toggle-btn' + (s.gridType === 'fibonacci' ? ' active' : '') + '" ' +
                        'id="tpSunGridFib" data-grid="fibonacci">' + t('preview.sun.fibonacci') + '</button>' +
                    '<button class="tree-preview-toggle-btn' + (s.gridType === 'square' ? ' active' : '') + '" ' +
                        'id="tpSunGridSquare" data-grid="square">' + t('preview.sun.square') + '</button>' +
                '</div>' +
            '</div>' +

            '<div class="tree-preview-setting">' +
                '<label class="tree-preview-label">' + t('preview.sectionSplit') + '</label>' +
                '<div class="tree-preview-toggle-row">' +
                    '<button class="tree-preview-toggle-btn' + (!s.proportional ? ' active' : '') + '" ' +
                        'id="tpSunSplitEqual">' + t('preview.equal') + '</button>' +
                    '<button class="tree-preview-toggle-btn' + (s.proportional ? ' active' : '') + '" ' +
                        'id="tpSunSplitProp">' + t('preview.proportional') + '</button>' +
                '</div>' +
            '</div>' +

            '<div class="tree-preview-setting">' +
                '<label class="tree-preview-label">' + t('preview.growthDirection') + '</label>' +
                '<div class="tree-preview-toggle-row tree-preview-toggle-wrap">' +
                    '<button class="tree-preview-toggle-btn' + (!s.invertGrowth ? ' active' : '') + '" ' +
                        'id="tpSunGrowNormal">' + t('preview.sun.outward') + '</button>' +
                    '<button class="tree-preview-toggle-btn' + (s.invertGrowth ? ' active' : '') + '" ' +
                        'id="tpSunGrowInvert">' + t('preview.sun.inward') + '</button>' +
                '</div>' +
            '</div>' +

            // --- Numeric inputs in responsive grid ---
            '<div class="tree-preview-settings-grid">' +
                H(t('preview.sun.ringTier'), 'tpSunRingTier', 1, 9999, 1, s.ringTier) +
                H(t('preview.nodeSize'), 'tpSunNodeSize', 1, 9999, 1, s.nodeSize) +
                H(t('preview.rootsPerSchool'), 'tpSunRoots', 1, 9999, 1, s.rootsPerSchool) +
                H(t('preview.sun.spokeDensity'), 'tpSunGrid', 5, 9999, 5, s.gridDensity) +
                H(t('preview.sun.tierDensity'), 'tpSunTiers', 5, 9999, 5, s.tierDensity) +
                H(t('preview.clumping'), 'tpSunClump', 0, 100, 1, s.rootClumping, '%') +
                H(t('preview.randomness'), 'tpSunRand', 0, 100, 1, s.rootRandomness, '%') +
            '</div>';
    },

    /**
     * Bind change events to settings inputs
     */
    bindEvents: function() {
        var self = this;
        var B = TreePreviewUtils.bindInput;
        var dirty = function() { if (typeof TreePreview !== 'undefined') TreePreview._markDirty(true); };

        B('tpSunRingTier', function(v) { self.settings.ringTier = v; dirty(); });
        B('tpSunNodeSize', function(v) { self.settings.nodeSize = v; dirty(); });
        B('tpSunRoots', function(v) { self.settings.rootsPerSchool = v; dirty(); });
        B('tpSunGrid', function(v) { self.settings.gridDensity = v; dirty(); });
        B('tpSunTiers', function(v) { self.settings.tierDensity = v; dirty(); });
        B('tpSunClump', function(v) { self.settings.rootClumping = v; dirty(); });
        B('tpSunRand', function(v) { self.settings.rootRandomness = v; dirty(); });

        // Growth direction toggle
        var growBtnIds = ['tpSunGrowNormal', 'tpSunGrowInvert'];
        growBtnIds.forEach(function(btnId) {
            var btn = document.getElementById(btnId);
            if (!btn) return;
            btn.addEventListener('click', function() {
                self.settings.invertGrowth = (btnId === 'tpSunGrowInvert');
                growBtnIds.forEach(function(id) {
                    var b = document.getElementById(id);
                    if (b) b.classList.remove('active');
                });
                this.classList.add('active');
                if (typeof TreePreview !== 'undefined') TreePreview._markDirty(true);
            });
        });

        // Grid type toggle
        var gridBtnIds = ['tpSunGridNaive', 'tpSunGridLinear', 'tpSunGridEqArea', 'tpSunGridFib', 'tpSunGridSquare'];
        gridBtnIds.forEach(function(btnId) {
            var btn = document.getElementById(btnId);
            if (!btn) return;
            btn.addEventListener('click', function() {
                self.settings.gridType = this.getAttribute('data-grid');
                gridBtnIds.forEach(function(id) {
                    var b = document.getElementById(id);
                    if (b) b.classList.remove('active');
                });
                this.classList.add('active');
                if (typeof TreePreview !== 'undefined') TreePreview._markDirty(true);
            });
        });

        // Section split toggle
        var btnEqual = document.getElementById('tpSunSplitEqual');
        var btnProp = document.getElementById('tpSunSplitProp');
        if (btnEqual) {
            btnEqual.addEventListener('click', function() {
                self.settings.proportional = false;
                btnEqual.classList.add('active');
                if (btnProp) btnProp.classList.remove('active');
                if (typeof TreePreview !== 'undefined') TreePreview._markDirty(true);
            });
        }
        if (btnProp) {
            btnProp.addEventListener('click', function() {
                self.settings.proportional = true;
                btnProp.classList.add('active');
                if (btnEqual) btnEqual.classList.remove('active');
                if (typeof TreePreview !== 'undefined') TreePreview._markDirty(true);
            });
        }
    },

    /**
     * Render the SUN radial grid and root ring onto the canvas.
     * Delegates grid drawing to the active grid module, or uses built-in naive grid.
     */
    render: function(ctx, w, h, schoolData) {
        var s = this.settings;
        var cx = w / 2;
        var cy = h / 2;
        var schools = Object.keys(schoolData || {});
        if (schools.length === 0) schools = Object.keys(this._schoolColors);
        var schoolCount = schools.length;

        var spokes = s.gridDensity;
        var tiers = s.tierDensity;

        // Tier spacing scales to keep things fitting nicely
        var tierSpacing = Math.min(40, 250 / tiers);
        var ringRadius = s.ringTier * tierSpacing;
        var maxExtent = Math.sqrt(w * w + h * h) * 3;

        // --- Calculate school arcs early (needed for grid point coloring) ---
        var totalAngle = Math.PI * 2;
        var arcSizes = [];
        var arcStarts = [];

        if (schoolCount > 0) {
            if (s.proportional && schoolData) {
                var totalSpells = 0;
                for (var si = 0; si < schoolCount; si++) {
                    totalSpells += (schoolData[schools[si]] || 1);
                }
                for (var si2 = 0; si2 < schoolCount; si2++) {
                    arcSizes.push(totalAngle * (schoolData[schools[si2]] || 1) / totalSpells);
                }
            } else {
                var equalArc = totalAngle / schoolCount;
                for (var si3 = 0; si3 < schoolCount; si3++) {
                    arcSizes.push(equalArc);
                }
            }
            // Offset so first school is centered at the top (-π/2)
            var cumAngle = -Math.PI / 2 - arcSizes[0] / 2;
            for (var ai = 0; ai < schoolCount; ai++) {
                arcStarts.push(((cumAngle % totalAngle) + totalAngle) % totalAngle);
                cumAngle += arcSizes[ai];
            }
        }

        // Build school-colored point function for grid modules
        var schoolRgba = [];
        for (var ci = 0; ci < schoolCount; ci++) {
            schoolRgba.push(this._hexToRgba(this._schoolColors[schools[ci]] || '#888888', 0.25));
        }

        var pointColorFn = schoolCount > 0 ? function(angle) {
            var a = ((angle % totalAngle) + totalAngle) % totalAngle;
            for (var pi = 0; pi < schoolCount; pi++) {
                var start = arcStarts[pi];
                var end = start + arcSizes[pi];
                if (end > totalAngle) {
                    // Arc wraps around 2π
                    if (a >= start || a < end - totalAngle) return schoolRgba[pi];
                } else {
                    if (a >= start && a < end) return schoolRgba[pi];
                }
            }
            return schoolRgba[schoolCount - 1];
        } : null;

        // Cache for getGridData()
        this._lastRenderData = {
            schools: schools,
            arcStarts: arcStarts,
            arcSizes: arcSizes,
            tierSpacing: tierSpacing,
            ringRadius: ringRadius,
            spokes: spokes,
            tiers: tiers
        };

        // --- Draw grid (delegate or built-in naive) ---
        // Cap dot count for expensive grids
        var isExpensiveGrid = (s.gridType === 'fibonacci' || s.gridType === 'equalArea');
        var gridOpts = {
            tierSpacing: tierSpacing,
            ringTier: s.ringTier,
            ringRadius: ringRadius,
            spokes: spokes,
            tiers: tiers,
            maxExtent: maxExtent,
            pointColorFn: pointColorFn,
            maxDots: isExpensiveGrid ? 5000 : 20000
        };

        // Render grid directly (batched paths, no offscreen canvas needed)
        var gridModule = this._grids[s.gridType];
        if (gridModule && typeof gridModule.renderGrid === 'function') {
            gridModule.renderGrid(ctx, cx, cy, gridOpts);
        } else {
            this._renderNaiveGrid(ctx, cx, cy, gridOpts);
        }
        // Clean up old offscreen canvas from previous caching approach
        if (this._gridCanvas) { this._gridCanvas = null; this._gridCacheKey = null; }

        // Collect grid point positions for downstream modules (cached)
        var gpCacheKey = s.gridType + '|' + spokes + '|' + tiers + '|' + tierSpacing + '|' +
            schoolCount + '|' + (s.proportional ? 1 : 0) + '|' + (s.invertGrowth ? 1 : 0);
        if (this._gridPointCache && this._gridPointCacheKey === gpCacheKey) {
            this._lastRenderData.gridPoints = this._gridPointCache;
        } else {
            this._lastRenderData.gridPoints = this._collectGridPoints(
                s.gridType, gridOpts, schools, arcStarts, arcSizes
            );
            this._gridPointCache = this._lastRenderData.gridPoints;
            this._gridPointCacheKey = gpCacheKey;
        }

        if (schoolCount === 0) return;

        // --- School divider spokes + root nodes + labels ---
        var arcStart = -Math.PI / 2 - arcSizes[0] / 2;
        var rootNodes = [];

        for (var i = 0; i < schoolCount; i++) {
            var school = schools[i];
            var color = this._schoolColors[school] || '#888888';
            var arcSize = arcSizes[i];

            // School divider spoke (slightly brighter, extends to edge)
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(
                cx + Math.cos(arcStart) * maxExtent,
                cy + Math.sin(arcStart) * maxExtent
            );
            ctx.strokeStyle = 'rgba(184, 168, 120, 0.2)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Place roots within this school's arc on the ring tier
            var roots = s.rootsPerSchool;
            var clumpF = s.rootClumping / 100;
            var randF = s.rootRandomness / 100;
            for (var j = 0; j < roots; j++) {
                var tEven = (j + 0.5) / roots;
                var t = tEven + (0.5 - tEven) * clumpF;
                if (randF > 0) {
                    var rnd = this._pseudoRandom(i * 17 + j * 31);
                    t = t + (rnd - 0.5) * randF * (1 / Math.max(1, roots));
                }
                t = Math.max(0.02, Math.min(0.98, t));
                var nodeAngle = arcStart + t * arcSize;
                var nx = cx + Math.cos(nodeAngle) * ringRadius;
                var ny = cy + Math.sin(nodeAngle) * ringRadius;

                // Growth direction: outward (default) or inward (inverted)
                var dirAngle = s.invertGrowth ? nodeAngle + Math.PI : nodeAngle;

                rootNodes.push({ x: nx - cx, y: ny - cy, school: school, color: color, dir: dirAngle, rootIndex: j });

                // Node glow
                ctx.beginPath();
                ctx.arc(nx, ny, s.nodeSize + 3, 0, Math.PI * 2);
                ctx.fillStyle = this._hexToRgba(color, 0.15);
                ctx.fill();

                // Node body
                ctx.beginPath();
                ctx.arc(nx, ny, s.nodeSize, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();

                // Node border
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Growth direction arrow
                this._drawArrow(ctx, nx, ny, dirAngle, s.nodeSize, color);
            }

            // School label at center of arc, just outside the root ring
            var labelAngle = arcStart + arcSize / 2;
            var labelDist = ringRadius + 25;
            var lx = cx + Math.cos(labelAngle) * labelDist;
            var ly = cy + Math.sin(labelAngle) * labelDist;

            ctx.save();
            ctx.translate(lx, ly);
            var textAngle = labelAngle;
            if (textAngle > Math.PI / 2 && textAngle < Math.PI * 1.5) {
                textAngle += Math.PI;
            }
            ctx.rotate(textAngle);
            ctx.font = '10px sans-serif';
            ctx.fillStyle = 'rgba(184, 168, 120, 0.7)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(school, 0, 0);
            ctx.restore();

            arcStart += arcSize;
        }

        this._lastRenderData.rootNodes = rootNodes;
    },

    /**
     * Return current settings for external consumption
     */
    getSettings: function() {
        return JSON.parse(JSON.stringify(this.settings));
    },

    /**
     * Return grid data with school assignments for the next build section.
     * Contains school boundaries and grid structure from the last render.
     */
    getGridData: function() {
        var d = this._lastRenderData;
        if (!d) return null;
        var self = this;
        var totalAngle = Math.PI * 2;
        return {
            mode: 'sun',
            gridType: self.settings.gridType,
            gridPoints: d.gridPoints || [],
            grid: {
                spokes: d.spokes,
                tiers: d.tiers,
                tierSpacing: d.tierSpacing,
                ringRadius: d.ringRadius,
                ringTier: self.settings.ringTier
            },
            schools: d.schools.map(function(name, i) {
                var a1 = d.arcStarts[i];
                var a2 = a1 + d.arcSizes[i];
                var r = d.ringRadius;
                return {
                    name: name,
                    color: self._schoolColors[name] || '#888888',
                    arcStart: a1,
                    arcSize: d.arcSizes[i],
                    rootLine: {
                        p1: { x: Math.cos(a1) * r, y: Math.sin(a1) * r },
                        p2: { x: Math.cos(a2) * r, y: Math.sin(a2) * r },
                        angle1: a1,
                        angle2: a2
                    }
                };
            }),
            getSchoolAtAngle: function(angle) {
                var a = ((angle % totalAngle) + totalAngle) % totalAngle;
                for (var i = 0; i < d.schools.length; i++) {
                    var start = d.arcStarts[i];
                    var end = start + d.arcSizes[i];
                    if (end > totalAngle) {
                        if (a >= start || a < end - totalAngle) return d.schools[i];
                    } else {
                        if (a >= start && a < end) return d.schools[i];
                    }
                }
                return d.schools[d.schools.length - 1];
            }
        };
    }
};

// Register grid modules that loaded before us
if (typeof SunGridLinear !== 'undefined') {
    TreePreviewSun.registerGrid('linear', SunGridLinear);
}
if (typeof SunGridEqualArea !== 'undefined') {
    TreePreviewSun.registerGrid('equalArea', SunGridEqualArea);
}
if (typeof SunGridFibonacci !== 'undefined') {
    TreePreviewSun.registerGrid('fibonacci', SunGridFibonacci);
}
if (typeof SunGridSquare !== 'undefined') {
    TreePreviewSun.registerGrid('square', SunGridSquare);
}

// Self-register when TreePreview is available
if (typeof TreePreview !== 'undefined') {
    TreePreview.registerMode('sun', TreePreviewSun);
}
