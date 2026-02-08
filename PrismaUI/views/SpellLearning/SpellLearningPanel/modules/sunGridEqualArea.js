/**
 * SUN Grid Distribution — Equal Area
 *
 * Ring radii follow a square-root distribution: r_k = sqrt(k/N) * maxRadius.
 * This ensures each ring band encloses the same area. Rings get closer
 * together toward the outer edge. Point count per ring scales with
 * circumference for consistent density.
 *
 * Self-contained module, no imports required.
 */

var SunGridEqualArea = {
    name: 'Equal Area',

    /**
     * Render an equal-area radial grid.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} cx - Center X
     * @param {number} cy - Center Y
     * @param {object} opts - tierSpacing, ringTier, ringRadius, spokes, tiers, maxExtent
     */
    renderGrid: function(ctx, cx, cy, opts) {
        var ringRadius = opts.ringRadius;
        var spokes = opts.spokes;
        var tiers = opts.tiers;
        var maxExtent = opts.maxExtent;

        // Equal Area: ring radii follow sqrt(k/N). Use 6× linear ring count
        // for reasonable inner ring visibility without excessive outer banding.
        // Circle strokes drawn every Nth ring to match other grid types.
        var maxRadius = maxExtent;
        var linearDensity = Math.ceil(maxExtent / opts.tierSpacing);
        var totalRings = Math.min(1500, linearDensity * 6);
        var circleSkip = Math.max(1, Math.round(totalRings / linearDensity));

        // Dots per ring scale with circumference. Golden angle offset per ring
        // breaks radial alignment at tight outer rings.
        var ring1Radius = Math.sqrt(1 / totalRings) * maxRadius;
        var baseSpacing = (2 * Math.PI * ring1Radius) / Math.max(spokes, 4);
        var goldenAngle = Math.PI * (3 - Math.sqrt(5));

        // --- Concentric rings with sqrt distribution ---
        var maxDots = opts.maxDots || 20000;
        var dotCount = 0;
        var rootRingK = -1;
        var bestRootDist = Infinity;

        // Pre-find the root ring index
        for (var rk = 1; rk <= totalRings; rk++) {
            var dist = Math.abs(Math.sqrt(rk / totalRings) * maxRadius - ringRadius);
            if (dist < bestRootDist) { bestRootDist = dist; rootRingK = rk; }
        }

        for (var k = 1; k <= totalRings; k++) {
            if (dotCount >= maxDots) break;
            var radius = Math.sqrt(k / totalRings) * maxRadius;
            var isRootRing = (k === rootRingK);

            // Only draw circle strokes every circleSkip rings (+ root ring)
            if (isRootRing || k % circleSkip === 0) {
                var isInner = (radius < ringRadius);
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                if (isRootRing) {
                    ctx.strokeStyle = 'rgba(184, 168, 120, 0.35)';
                    ctx.lineWidth = 1.5;
                } else if (isInner) {
                    ctx.strokeStyle = 'rgba(184, 168, 120, 0.1)';
                    ctx.lineWidth = 1;
                } else {
                    ctx.strokeStyle = 'rgba(184, 168, 120, 0.05)';
                    ctx.lineWidth = 1;
                }
                ctx.stroke();
            }

            // --- Grid dots on this ring (scaled with circumference) ---
            var circumference = 2 * Math.PI * radius;
            var pointCount = Math.max(spokes, Math.round(circumference / baseSpacing));
            var angleStep = (Math.PI * 2) / pointCount;
            var ringOffset = k * goldenAngle;
            var lastColor = '';

            for (var p = 0; p < pointCount; p++) {
                if (dotCount >= maxDots) break;
                var angle = p * angleStep + ringOffset;
                var color = opts.pointColorFn ? opts.pointColorFn(angle) : 'rgba(184, 168, 120, 0.15)';
                if (color !== lastColor) { ctx.fillStyle = color; lastColor = color; }
                ctx.fillRect(cx + Math.cos(angle) * radius - 1, cy + Math.sin(angle) * radius - 1, 3, 3);
                dotCount++;
            }
        }

        // --- Radial spokes from center to maxExtent ---
        var spokeStep = (Math.PI * 2) / spokes;
        for (var s = 0; s < spokes; s++) {
            var spokeAngle = s * spokeStep;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(
                cx + Math.cos(spokeAngle) * maxExtent,
                cy + Math.sin(spokeAngle) * maxExtent
            );
            ctx.strokeStyle = 'rgba(184, 168, 120, 0.08)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // --- Center dot ---
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(184, 168, 120, 0.5)';
        ctx.fill();
    }
};
