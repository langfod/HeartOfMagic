/**
 * SUN Grid Distribution — Linear
 *
 * Points per ring scale linearly with radius. Each ring k has a point
 * count proportional to its circumference, derived from the base spoke
 * count on ring 1. Produces evenly spaced concentric rings with
 * increasing point density outward.
 *
 * Self-contained module, no imports required.
 */

var SunGridLinear = {
    name: 'Linear',

    /**
     * Render a linear-distribution radial grid.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} cx - Center X
     * @param {number} cy - Center Y
     * @param {object} opts - tierSpacing, ringTier, ringRadius, spokes, tiers, maxExtent
     */
    renderGrid: function(ctx, cx, cy, opts) {
        var tierSpacing = opts.tierSpacing;
        var ringTier = opts.ringTier;
        var ringRadius = opts.ringRadius;
        var spokes = opts.spokes;
        var maxExtent = opts.maxExtent;
        var totalTiers = Math.ceil(maxExtent / tierSpacing);

        // Base spacing: circumference of ring 1 divided by spoke count
        var baseSpacing = (2 * Math.PI * tierSpacing) / spokes;

        // --- Concentric tier rings ---
        for (var r = 1; r <= totalTiers; r++) {
            var radius = r * tierSpacing;
            var isRootRing = (r === ringTier);
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            if (isRootRing) {
                ctx.strokeStyle = 'rgba(184, 168, 120, 0.35)';
                ctx.lineWidth = 1.5;
            } else if (r < ringTier) {
                ctx.strokeStyle = 'rgba(184, 168, 120, 0.1)';
                ctx.lineWidth = 1;
            } else {
                ctx.strokeStyle = 'rgba(184, 168, 120, 0.05)';
                ctx.lineWidth = 1;
            }
            ctx.stroke();
        }

        // --- Grid dots per ring (scaled point count, capped for perf) ---
        var maxDots = opts.maxDots || 10000;
        var dotCount = 0;
        for (var r2 = 1; r2 <= totalTiers; r2++) {
            if (dotCount >= maxDots) break;
            var ringR = r2 * tierSpacing;
            var circumference = 2 * Math.PI * ringR;
            var pointCount = Math.max(spokes, Math.round(circumference / baseSpacing));
            var angleStep = (Math.PI * 2) / pointCount;
            var lastColor = '';

            for (var p = 0; p < pointCount; p++) {
                if (dotCount >= maxDots) break;
                var angle = p * angleStep;
                var color = opts.pointColorFn ? opts.pointColorFn(angle) : 'rgba(184, 168, 120, 0.15)';
                if (color !== lastColor) { ctx.fillStyle = color; lastColor = color; }
                ctx.fillRect(cx + Math.cos(angle) * ringR - 1, cy + Math.sin(angle) * ringR - 1, 3, 3);
                dotCount++;
            }
        }

        // --- Base spokes (radial lines at base spoke angles) ---
        var baseAngleStep = (Math.PI * 2) / spokes;
        for (var s = 0; s < spokes; s++) {
            var spokeAngle = s * baseAngleStep;
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
