/**
 * Starfield Module - Parallax twinkling star background
 *
 * Supports two modes:
 * - Fixed: stars are screen-space (drift + wrap around edges)
 * - World-space: seed-based stars that stay in place as user pans,
 *   with multiple parallax layers for depth effect
 *
 * Parallax layers:
 *   Layer 0 (far):  tiny dim stars,  move slowly  (depth 0.15)
 *   Layer 1 (mid):  medium stars,    move moderate (depth 0.40)
 *   Layer 2 (near): larger stars,    move fast     (depth 0.75)
 */

var Starfield = {
    // Star data (fixed mode only)
    stars: null,

    // Configuration
    enabled: true,
    starCount: 200,
    maxSize: 2.5,
    minSize: 0.5,
    twinkleSpeed: 0.02,
    driftSpeed: 0.05,
    color: { r: 255, g: 255, b: 255 },
    seed: 42,

    // Canvas dimensions (set by init)
    width: 0,
    height: 0,

    // Twinkle phase accumulator
    _twinklePhase: 0,

    // Parallax layer definitions
    // depth: 0 = fixed to screen, 1 = fixed to world
    _layers: [
        { depth: 0.12, sizeMin: 0.2,  sizeMax: 0.5,  opacityMin: 0.10, opacityMax: 0.30, densityMul: 0.6,  seedOffset: 0 },
        { depth: 0.35, sizeMin: 0.3,  sizeMax: 0.9,  opacityMin: 0.20, opacityMax: 0.45, densityMul: 0.8,  seedOffset: 7919 },
        { depth: 0.70, sizeMin: 0.5,  sizeMax: 1.0,  opacityMin: 0.30, opacityMax: 0.60, densityMul: 1.0,  seedOffset: 16381 }
    ],

    /**
     * Seeded pseudo-random number generator (mulberry32)
     * Returns a function that produces deterministic floats [0, 1)
     */
    _seededRng: function(seed) {
        var s = seed | 0;
        return function() {
            s = (s + 0x6D2B79F5) | 0;
            var t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    /**
     * Initialize starfield with seeded random star positions (fixed mode)
     */
    init: function(width, height) {
        this.width = width || 800;
        this.height = height || 600;
        this.stars = [];

        var rng = this._seededRng(this.seed);

        for (var i = 0; i < this.starCount; i++) {
            this.stars.push({
                x: rng() * this.width,
                y: rng() * this.height,
                size: this.minSize + rng() * (this.maxSize - this.minSize),
                phase: rng() * Math.PI * 2,
                twinkleRate: 0.5 + rng() * 1.5,
                baseOpacity: 0.3 + rng() * 0.5,
                dx: (rng() - 0.5) * this.driftSpeed,
                dy: (rng() - 0.5) * this.driftSpeed
            });
        }

        console.log('[Starfield] Initialized with', this.starCount, 'stars, seed:', this.seed);
    },

    /**
     * Update canvas dimensions (call on resize)
     */
    resize: function(width, height) {
        var oldWidth = this.width;
        var oldHeight = this.height;
        this.width = width;
        this.height = height;

        if (this.stars && oldWidth > 0 && oldHeight > 0) {
            var scaleX = width / oldWidth;
            var scaleY = height / oldHeight;
            for (var i = 0; i < this.stars.length; i++) {
                this.stars[i].x *= scaleX;
                this.stars[i].y *= scaleY;
            }
        }
    },

    /**
     * Update star positions and twinkle (fixed mode only)
     */
    update: function() {
        if (!this.stars) return;

        for (var i = 0; i < this.stars.length; i++) {
            var star = this.stars[i];
            star.phase += this.twinkleSpeed * star.twinkleRate;
            star.x += star.dx;
            star.y += star.dy;
            if (star.x < 0) star.x = this.width;
            if (star.x > this.width) star.x = 0;
            if (star.y < 0) star.y = this.height;
            if (star.y > this.height) star.y = 0;
        }
    },

    /**
     * Render stars (fixed to screen mode)
     */
    render: function(ctx) {
        if (!this.enabled || !this.stars) return;

        this.update();

        var rgb = this.color;

        for (var i = 0; i < this.stars.length; i++) {
            var star = this.stars[i];
            var twinkle = 0.5 + 0.5 * Math.sin(star.phase);
            var opacity = star.baseOpacity * twinkle;

            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + opacity.toFixed(2) + ')';
            ctx.fill();
        }
    },

    /**
     * Render a single parallax layer as a SCREEN-SPACE tile grid.
     *
     * Stars are generated in screen-space tiles that scroll with parallax.
     * Zoom has NO effect on star positions, sizes, or density — stars are
     * infinitely far away. Only panning shifts them, and each layer shifts
     * at a different rate (depth) for the parallax depth illusion.
     *
     * @param {CanvasRenderingContext2D} ctx - Screen-space context (DPR-scaled only)
     * @param {number} camX - Camera world-space X position (-panX/zoom)
     * @param {number} camY - Camera world-space Y position (-panY/zoom)
     * @param {number} canvasW - Canvas logical width
     * @param {number} canvasH - Canvas logical height
     * @param {object} layer - Layer definition { depth, sizeMin, sizeMax, ... }
     * @param {number} starsPerTile - Base stars per tile
     */
    _renderLayer: function(ctx, camX, camY, canvasW, canvasH, layer, starsPerTile) {
        var rgb = this.color;
        var tileSize = 500;
        var layerStars = Math.max(1, Math.round(starsPerTile * layer.densityMul));

        // Scroll offset for this layer (in screen-space tile units).
        // Camera world position × depth gives zoom-independent parallax.
        // Multiplied by a scale factor so the scroll rate feels natural.
        var scrollX = camX * layer.depth;
        var scrollY = camY * layer.depth;

        // The visible screen [0, canvasW] maps to tile-space [scrollX, scrollX + canvasW]
        var tileMinX = Math.floor(scrollX / tileSize);
        var tileMaxX = Math.floor((scrollX + canvasW) / tileSize);
        var tileMinY = Math.floor(scrollY / tileSize);
        var tileMaxY = Math.floor((scrollY + canvasH) / tileSize);

        // Cap to prevent explosion (shouldn't happen since tile count is canvasW/500 ≈ 4)
        var tileCount = (tileMaxX - tileMinX + 1) * (tileMaxY - tileMinY + 1);
        if (tileCount > 200) return;

        // Scale star sizes with user's maxSize setting
        var sizeScale = this.maxSize / 2.5;

        for (var tx = tileMinX; tx <= tileMaxX; tx++) {
            for (var ty = tileMinY; ty <= tileMaxY; ty++) {
                // Unique deterministic seed per tile per layer
                var tileSeed = (this.seed + layer.seedOffset) * 73856093 + tx * 19349663 + ty * 83492791;
                var rng = this._seededRng(tileSeed);

                for (var si = 0; si < layerStars; si++) {
                    // IMPORTANT: Always consume ALL rng() calls per star, even if
                    // the star is off-screen. Otherwise skipping a star shifts the
                    // RNG sequence and causes subsequent stars to teleport/blink.
                    var tsX = tx * tileSize + rng() * tileSize;
                    var tsY = ty * tileSize + rng() * tileSize;
                    var size = (layer.sizeMin + rng() * (layer.sizeMax - layer.sizeMin)) * sizeScale;
                    var baseOpacity = layer.opacityMin + rng() * (layer.opacityMax - layer.opacityMin);
                    var twinkleRate = 0.5 + rng() * 1.5;
                    var phaseOffset = rng() * Math.PI * 2;

                    // Convert tile-space → screen by subtracting the scroll offset
                    var screenX = tsX - scrollX;
                    var screenY = tsY - scrollY;

                    // Skip drawing if off screen (rng already consumed above)
                    if (screenX < -5 || screenX > canvasW + 5 ||
                        screenY < -5 || screenY > canvasH + 5) continue;

                    // Twinkle animation
                    var twinkle = 0.5 + 0.5 * Math.sin(this._twinklePhase * twinkleRate + phaseOffset);
                    var opacity = baseOpacity * twinkle;

                    ctx.beginPath();
                    ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + opacity.toFixed(2) + ')';
                    ctx.fill();
                }
            }
        }
    },

    /**
     * Render parallax starfield layers.
     *
     * Stars live in screen-space tiles, completely independent of zoom.
     * Each layer scrolls at a different rate based on the camera's world
     * position, creating a depth illusion. Zooming changes nothing — stars
     * are at infinity.
     *
     * @param {CanvasRenderingContext2D} ctx - Screen-space context (DPR-scaled only)
     * @param {number} panX - Current pan X offset (screen pixels)
     * @param {number} panY - Current pan Y offset (screen pixels)
     * @param {number} zoom - Current zoom level
     * @param {number} canvasW - Canvas logical width
     * @param {number} canvasH - Canvas logical height
     */
    renderWorldSpace: function(ctx, panX, panY, zoom, canvasW, canvasH) {
        if (!this.enabled) return;

        this._twinklePhase += this.twinkleSpeed;

        // Derive camera world position from pan/zoom.
        // This is approximately zoom-independent: pure zooming barely
        // changes the world center, so stars stay put.
        var camX = -panX / zoom;
        var camY = -panY / zoom;

        // Base stars per tile (scale with density setting)
        var starsPerTile = Math.max(2, Math.round(this.starCount / 10));

        // Render each parallax layer (far to near)
        for (var li = 0; li < this._layers.length; li++) {
            this._renderLayer(ctx, camX, camY, canvasW, canvasH, this._layers[li], starsPerTile);
        }
    },

    /**
     * Set star color from hex
     */
    setColor: function(hex) {
        if (!hex) return;
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            this.color = {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            };
        }
    },

    /**
     * Configure starfield
     */
    configure: function(options) {
        if (!options) return;

        var needsReinit = false;

        if (options.enabled !== undefined) this.enabled = options.enabled;
        if (options.starCount !== undefined && options.starCount !== this.starCount) {
            this.starCount = options.starCount;
            needsReinit = true;
        }
        if (options.seed !== undefined && options.seed !== this.seed) {
            this.seed = options.seed;
            needsReinit = true;
        }
        if (options.maxSize !== undefined) this.maxSize = options.maxSize;
        if (options.minSize !== undefined) this.minSize = options.minSize;
        if (options.twinkleSpeed !== undefined) this.twinkleSpeed = options.twinkleSpeed;
        if (options.driftSpeed !== undefined) this.driftSpeed = options.driftSpeed;
        if (options.color) this.setColor(options.color);

        if (needsReinit) {
            this.init(this.width, this.height);
        }
    }
};

window.Starfield = Starfield;
