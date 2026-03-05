/**
 * View Transform — Coordinate conversion utilities (DUP-R4)
 *
 * Consolidates the identical screenToWorld implementations from
 * canvasCore.js and webglRenderer.js.
 *
 * Depends on: nothing (pure math)
 */

var ViewTransform = {

    /**
     * Convert screen (pixel) coordinates to world coordinates.
     * Handles pan, zoom, and optional rotation.
     *
     * @param {number} sx - Screen X (e.g., e.clientX - rect.left)
     * @param {number} sy - Screen Y (e.g., e.clientY - rect.top)
     * @param {number} panX - Current pan X offset
     * @param {number} panY - Current pan Y offset
     * @param {number} zoom - Current zoom level
     * @param {number} rotation - Rotation angle in radians (0 if no rotation)
     * @param {number} width - Canvas/viewport width
     * @param {number} height - Canvas/viewport height
     * @returns {{x: number, y: number}}
     */
    screenToWorld: function (sx, sy, panX, panY, zoom, rotation, width, height) {
        var cx = width / 2;
        var cy = height / 2;

        // Undo pan and center offset
        var x = (sx - cx - panX) / zoom;
        var y = (sy - cy - panY) / zoom;

        // Undo rotation if present
        if (rotation) {
            var cos = Math.cos(-rotation);
            var sin = Math.sin(-rotation);
            var rx = x * cos - y * sin;
            var ry = x * sin + y * cos;
            x = rx;
            y = ry;
        }

        return { x: x, y: y };
    },

    /**
     * Convert world coordinates to screen (pixel) coordinates.
     * Inverse of screenToWorld.
     *
     * @param {number} wx - World X
     * @param {number} wy - World Y
     * @param {number} panX - Current pan X offset
     * @param {number} panY - Current pan Y offset
     * @param {number} zoom - Current zoom level
     * @param {number} rotation - Rotation angle in radians (0 if no rotation)
     * @param {number} width - Canvas/viewport width
     * @param {number} height - Canvas/viewport height
     * @returns {{x: number, y: number}}
     */
    worldToScreen: function (wx, wy, panX, panY, zoom, rotation, width, height) {
        var x = wx;
        var y = wy;

        // Apply rotation if present
        if (rotation) {
            var cos = Math.cos(rotation);
            var sin = Math.sin(rotation);
            var rx = x * cos - y * sin;
            var ry = x * sin + y * cos;
            x = rx;
            y = ry;
        }

        var cx = width / 2;
        var cy = height / 2;
        return {
            x: x * zoom + cx + panX,
            y: y * zoom + cy + panY
        };
    },

    /**
     * Animate rotation from current value to target using cubic ease-out.
     *
     * @param {Object} ctx        - Object with `rotation` and `isAnimating` properties
     * @param {number} target     - Target rotation in degrees
     * @param {number} [duration] - Animation duration in ms (default 300)
     * @param {Function} onFrame  - Called each frame after updating ctx.rotation
     */
    animateRotation: function (ctx, target, duration, onFrame) {
        if (ctx.isAnimating) return;

        var start = ctx.rotation;
        var dur = duration || 300;
        var startTime = performance.now();

        ctx.isAnimating = true;

        function animate(time) {
            var elapsed = (time || performance.now()) - startTime;
            var progress = Math.min(elapsed / dur, 1);
            var eased = 1 - Math.pow(1 - progress, 3);

            ctx.rotation = start + (target - start) * eased;

            if (progress < 1) {
                onFrame();
                requestAnimationFrame(animate);
            } else {
                ctx.rotation = target;
                ctx.isAnimating = false;
                onFrame();
            }
        }

        requestAnimationFrame(animate);
    },

    /**
     * Get x,y position along a path of {from, to} segments at a given progress (0-1).
     *
     * @param {Array} segments          - Array of { from: {x,y}, to: {x,y} } segments
     * @param {number} progress         - 0-1 fraction along total path
     * @param {Array} [cachedLengths]   - Pre-computed segment lengths (optional)
     * @param {number} [cachedTotal]    - Pre-computed total path length (optional)
     * @returns {{x: number, y: number}|null}
     */
    getPositionAlongPath: function (segments, progress, cachedLengths, cachedTotal) {
        if (!segments || segments.length === 0) return null;

        var totalLength, segmentLengths;
        if (cachedLengths && cachedTotal > 0) {
            segmentLengths = cachedLengths;
            totalLength = cachedTotal;
        } else {
            totalLength = 0;
            segmentLengths = [];
            for (var i = 0; i < segments.length; i++) {
                var seg = segments[i];
                var dx = seg.to.x - seg.from.x;
                var dy = seg.to.y - seg.from.y;
                var len = seg.length !== undefined ? seg.length : Math.sqrt(dx * dx + dy * dy);
                segmentLengths.push(len);
                totalLength += len;
            }
        }

        var targetDist = progress * totalLength;
        var distSoFar = 0;

        for (var j = 0; j < segments.length; j++) {
            var segLen = segmentLengths[j];
            if (distSoFar + segLen >= targetDist) {
                var segProgress = (targetDist - distSoFar) / segLen;
                var s = segments[j];
                return {
                    x: s.from.x + (s.to.x - s.from.x) * segProgress,
                    y: s.from.y + (s.to.y - s.from.y) * segProgress
                };
            }
            distSoFar += segLen;
        }

        var last = segments[segments.length - 1];
        return { x: last.to.x, y: last.to.y };
    }
};

window.ViewTransform = ViewTransform;
