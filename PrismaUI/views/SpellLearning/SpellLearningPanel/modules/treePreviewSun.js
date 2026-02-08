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
            '<div class="tree-preview-settings-title">Root Ring Settings</div>' +

            // --- Toggles at top ---
            '<div class="tree-preview-setting">' +
                '<label class="tree-preview-label">Grid Type</label>' +
                '<div class="tree-preview-toggle-row tree-preview-toggle-wrap">' +
                    '<button class="tree-preview-toggle-btn' + (s.gridType === 'naive' ? ' active' : '') + '" ' +
                        'id="tpSunGridNaive" data-grid="naive">Naive</button>' +
                    '<button class="tree-preview-toggle-btn' + (s.gridType === 'linear' ? ' active' : '') + '" ' +
                        'id="tpSunGridLinear" data-grid="linear">Linear</button>' +
                    '<button class="tree-preview-toggle-btn' + (s.gridType === 'equalArea' ? ' active' : '') + '" ' +
                        'id="tpSunGridEqArea" data-grid="equalArea">Equal Area</button>' +
                    '<button class="tree-preview-toggle-btn' + (s.gridType === 'fibonacci' ? ' active' : '') + '" ' +
                        'id="tpSunGridFib" data-grid="fibonacci">Fibonacci</button>' +
                    '<button class="tree-preview-toggle-btn' + (s.gridType === 'square' ? ' active' : '') + '" ' +
                        'id="tpSunGridSquare" data-grid="square">Square</button>' +
                '</div>' +
            '</div>' +

            '<div class="tree-preview-setting">' +
                '<label class="tree-preview-label">Section Split</label>' +
                '<div class="tree-preview-toggle-row">' +
                    '<button class="tree-preview-toggle-btn' + (!s.proportional ? ' active' : '') + '" ' +
                        'id="tpSunSplitEqual">Equal</button>' +
                    '<button class="tree-preview-toggle-btn' + (s.proportional ? ' active' : '') + '" ' +
                        'id="tpSunSplitProp">Proportional</button>' +
                '</div>' +
            '</div>' +

            '<div class="tree-preview-setting">' +
                '<label class="tree-preview-label">Growth Direction</label>' +
                '<div class="tree-preview-toggle-row tree-preview-toggle-wrap">' +
                    '<button class="tree-preview-toggle-btn' + (!s.invertGrowth ? ' active' : '') + '" ' +
                        'id="tpSunGrowNormal">Outward</button>' +
                    '<button class="tree-preview-toggle-btn' + (s.invertGrowth ? ' active' : '') + '" ' +
                        'id="tpSunGrowInvert">Inward</button>' +
                '</div>' +
            '</div>' +

            // --- Numeric inputs in responsive grid ---
            '<div class="tree-preview-settings-grid">' +
                H('Ring Tier', 'tpSunRingTier', 1, 9999, 1, s.ringTier) +
                H('Node Size', 'tpSunNodeSize', 1, 9999, 1, s.nodeSize) +
                H('Roots / School', 'tpSunRoots', 1, 9999, 1, s.rootsPerSchool) +
                H('Spoke Density', 'tpSunGrid', 5, 9999, 5, s.gridDensity) +
                H('Tier Density', 'tpSunTiers', 5, 9999, 5, s.tierDensity) +
                H('Clumping', 'tpSunClump', 0, 100, 1, s.rootClumping, '%') +
                H('Randomness', 'tpSunRand', 0, 100, 1, s.rootRandomness, '%') +
            '</div>';
    },

    /**
     * Bind change events to settings inputs
     */
    bindEvents: function() {
        var self = this;
        var B = TreePreviewUtils.bindInput;
        var dirty = function() { if (typeof TreePreview !== 'undefined') TreePreview._markDirty(); };

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
                if (typeof TreePreview !== 'undefined') TreePreview._markDirty();
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
                if (typeof TreePreview !== 'undefined') TreePreview._markDirty();
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
                if (typeof TreePreview !== 'undefined') TreePreview._markDirty();
            });
        }
        if (btnProp) {
            btnProp.addEventListener('click', function() {
                self.settings.proportional = true;
                btnProp.classList.add('active');
                if (btnEqual) btnEqual.classList.remove('active');
                if (typeof TreePreview !== 'undefined') TreePreview._markDirty();
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
        var gridOpts = {
            tierSpacing: tierSpacing,
            ringTier: s.ringTier,
            ringRadius: ringRadius,
            spokes: spokes,
            tiers: tiers,
            maxExtent: maxExtent,
            pointColorFn: pointColorFn,
            maxDots: 20000
        };

        var gridModule = this._grids[s.gridType];
        if (gridModule && typeof gridModule.renderGrid === 'function') {
            gridModule.renderGrid(ctx, cx, cy, gridOpts);
        } else {
            this._renderNaiveGrid(ctx, cx, cy, gridOpts);
        }

        // Collect grid point positions for downstream modules
        this._lastRenderData.gridPoints = this._collectGridPoints(
            s.gridType, gridOpts, schools, arcStarts, arcSizes
        );

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

                rootNodes.push({ x: nx - cx, y: ny - cy, school: school, color: color, dir: dirAngle });

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
     * Collect all grid point positions (matching the active grid module's layout).
     * Each point: { x, y, school }  (coords relative to center)
     */
    _collectGridPoints: function(gridType, opts, schools, arcStarts, arcSizes) {
        var points = [];
        var tierSpacing = opts.tierSpacing;
        var spokes = opts.spokes;
        var maxExtent = opts.maxExtent;
        var maxDots = opts.maxDots || 20000;
        var PI2 = Math.PI * 2;
        var schoolCount = schools.length;
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
            var totalRings = Math.min(1500, linearDensity * 6);
            var ring1R = Math.sqrt(1 / totalRings) * maxRadius;
            var eaBs = (PI2 * ring1R) / Math.max(spokes, 4);
            var ga = Math.PI * (3 - Math.sqrt(5));
            for (var k = 1; k <= totalRings && points.length < maxDots; k++) {
                var eaR = Math.sqrt(k / totalRings) * maxRadius;
                var eaC = PI2 * eaR;
                var eaPc = Math.max(spokes, Math.round(eaC / eaBs));
                var eaAs = PI2 / eaPc;
                var rOff = k * ga;
                for (var ep = 0; ep < eaPc && points.length < maxDots; ep++) {
                    var eaA = ep * eaAs + rOff;
                    points.push({ x: Math.cos(eaA) * eaR, y: Math.sin(eaA) * eaR, school: getSchool(eaA) });
                }
            }
        } else if (gridType === 'fibonacci') {
            var fibGa = Math.PI * (3 - Math.sqrt(5));
            var fibR = maxExtent;
            var fibTiers = Math.ceil(maxExtent / tierSpacing);
            var fibTotal = Math.min(Math.round(0.5 * spokes * fibTiers * fibTiers), maxDots);
            for (var fi = 1; fi <= fibTotal; fi++) {
                var fr = fibR * Math.sqrt(fi / fibTotal);
                var fa = fi * fibGa;
                points.push({ x: Math.cos(fa) * fr, y: Math.sin(fa) * fr, school: getSchool(fa) });
            }
        } else if (gridType === 'square') {
            var sqHc = Math.ceil(maxExtent / tierSpacing);
            for (var gx = -sqHc; gx <= sqHc && points.length < maxDots; gx++) {
                for (var gy = -sqHc; gy <= sqHc && points.length < maxDots; gy++) {
                    if (gx === 0 && gy === 0) continue;
                    var sqDx = gx * tierSpacing;
                    var sqDy = gy * tierSpacing;
                    var sqA = Math.atan2(sqDy, sqDx);
                    if (sqA < 0) sqA += PI2;
                    points.push({ x: sqDx, y: sqDy, school: getSchool(sqA) });
                }
            }
        } else if (gridType === 'naive') {
            // Naive grid: fixed dotsPerRing = spokes * 3, matching _renderNaiveGrid
            console.log('[TreePreviewSun] NAIVE branch: dotsPerRing=' + (spokes * 3));
            var naiveDotsPerRing = spokes * 3;
            var naiveAngleStep = PI2 / naiveDotsPerRing;
            var naiveTotalTiers = Math.ceil(maxExtent / tierSpacing);
            var naiveDotTiers = Math.min(naiveTotalTiers, Math.floor(maxDots / Math.max(1, naiveDotsPerRing)));
            for (var nr = 1; nr <= naiveDotTiers && points.length < maxDots; nr++) {
                var naiveR = nr * tierSpacing;
                for (var ng = 0; ng < naiveDotsPerRing && points.length < maxDots; ng++) {
                    var naiveA = ng * naiveAngleStep;
                    points.push({ x: Math.cos(naiveA) * naiveR, y: Math.sin(naiveA) * naiveR, school: getSchool(naiveA) });
                }
            }
        } else {
            // Linear (default)
            var baseSpacing = (PI2 * tierSpacing) / spokes;
            var totalTiers = Math.ceil(maxExtent / tierSpacing);
            for (var lr = 1; lr <= totalTiers && points.length < maxDots; lr++) {
                var lrR = lr * tierSpacing;
                var lrC = PI2 * lrR;
                var lrPc = Math.max(spokes, Math.round(lrC / baseSpacing));
                var lrAs = PI2 / lrPc;
                for (var lp = 0; lp < lrPc && points.length < maxDots; lp++) {
                    var lrA = lp * lrAs;
                    points.push({ x: Math.cos(lrA) * lrR, y: Math.sin(lrA) * lrR, school: getSchool(lrA) });
                }
            }
        }

        return points;
    },

    /**
     * Built-in naive grid: fixed angular divisions, same point count per ring
     */
    _renderNaiveGrid: function(ctx, cx, cy, opts) {
        var tierSpacing = opts.tierSpacing;
        var spokes = opts.spokes;
        var maxExtent = opts.maxExtent;
        var ringTier = opts.ringTier;
        var ringRadius = opts.ringRadius;
        var totalTiers = Math.ceil(maxExtent / tierSpacing);
        var angleStep = (Math.PI * 2) / spokes;

        // Concentric tier rings
        for (var r = 1; r <= totalTiers; r++) {
            var ringR = r * tierSpacing;
            ctx.beginPath();
            ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
            if (r === ringTier) {
                ctx.strokeStyle = 'rgba(184, 168, 120, 0.35)';
                ctx.lineWidth = 1.5;
            } else if (r <= ringTier) {
                ctx.strokeStyle = 'rgba(184, 168, 120, 0.1)';
                ctx.lineWidth = 1;
            } else {
                ctx.strokeStyle = 'rgba(184, 168, 120, 0.05)';
                ctx.lineWidth = 1;
            }
            ctx.stroke();
        }

        // Radial spokes
        for (var g = 0; g < spokes; g++) {
            var angle = g * angleStep;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(angle) * maxExtent, cy + Math.sin(angle) * maxExtent);
            ctx.strokeStyle = 'rgba(184, 168, 120, 0.08)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Grid dots on all visible tiers (3× spoke density for comparable
        // visible density with Linear/Fibonacci, batched by angle for perf)
        var maxDots = opts.maxDots || 20000;
        var dotsPerRing = spokes * 3;
        var dotAngleStep = (Math.PI * 2) / dotsPerRing;
        var dotTiers = Math.min(totalTiers, Math.floor(maxDots / Math.max(1, dotsPerRing)));
        for (var g2 = 0; g2 < dotsPerRing; g2++) {
            var dotAngle = g2 * dotAngleStep;
            var cosA = Math.cos(dotAngle);
            var sinA = Math.sin(dotAngle);
            ctx.fillStyle = opts.pointColorFn ? opts.pointColorFn(dotAngle) : 'rgba(184, 168, 120, 0.15)';
            for (var r2 = 1; r2 <= dotTiers; r2++) {
                var dotR = r2 * tierSpacing;
                ctx.fillRect(cx + cosA * dotR - 1, cy + sinA * dotR - 1, 3, 3);
            }
        }

        // Center dot
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(184, 168, 120, 0.5)';
        ctx.fill();
    },

    /**
     * Draw a direction arrow from node edge outward
     */
    _drawArrow: function(ctx, nx, ny, angle, nodeSize, color) {
        var arrowLen = 16;
        var headLen = 6;
        var headAngle = Math.PI / 6;
        var sx = nx + Math.cos(angle) * (nodeSize + 2);
        var sy = ny + Math.sin(angle) * (nodeSize + 2);
        var ex = sx + Math.cos(angle) * arrowLen;
        var ey = sy + Math.sin(angle) * arrowLen;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(angle - headAngle) * headLen, ey - Math.sin(angle - headAngle) * headLen);
        ctx.lineTo(ex - Math.cos(angle + headAngle) * headLen, ey - Math.sin(angle + headAngle) * headLen);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    },

    /**
     * Deterministic pseudo-random from seed (consistent per frame)
     */
    _pseudoRandom: function(seed) {
        var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
        return x - Math.floor(x);
    },

    /**
     * Convert hex color to rgba string
     */
    _hexToRgba: function(hex, alpha) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
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
