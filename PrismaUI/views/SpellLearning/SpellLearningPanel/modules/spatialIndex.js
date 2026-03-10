/**
 * Spatial Index — Grid-based spatial hash for node hit testing (DUP-R3)
 *
 * Consolidates the identical buildSpatialIndex/findNodeAt implementations
 * from canvasCore.js and webglRenderer.js into a single reusable utility.
 *
 * Depends on: nothing (pure data structure)
 */

var SpatialIndex = {

    /**
     * Build a grid-based spatial hash from positioned nodes.
     *
     * @param {Array} nodes - Array of objects with x, y properties
     * @param {number} [cellSize] - Grid cell size in world units (default 50)
     * @returns {Object} { grid: {}, cellSize: number }
     */
    build: function (nodes, cellSize) {
        var cs = cellSize || 50;
        var grid = {};
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (n.x === undefined || n.y === undefined) continue;
            var cx = Math.floor(n.x / cs);
            var cy = Math.floor(n.y / cs);
            var key = cx + ',' + cy;
            if (!grid[key]) grid[key] = [];
            grid[key].push(n);
        }
        return { grid: grid, cellSize: cs };
    },

    /**
     * Find the closest node at world coordinates using 3x3 neighborhood search.
     *
     * @param {Object} index - Result from build()
     * @param {number} worldX - World X coordinate
     * @param {number} worldY - World Y coordinate
     * @param {Function} [hitRadiusFn] - Optional function(node) returning hit radius.
     *                                   Default: 14 for unlocked nodes, 10 otherwise.
     * @returns {Object|null} The closest node within hit radius, or null
     */
    findAt: function (index, worldX, worldY, hitRadiusFn) {
        if (!index || !index.grid) return null;
        var cs = index.cellSize;
        var cx = Math.floor(worldX / cs);
        var cy = Math.floor(worldY / cs);
        var bestNode = null;
        var bestDist = Infinity;

        // Check 3x3 neighborhood
        for (var dx = -1; dx <= 1; dx++) {
            for (var dy = -1; dy <= 1; dy++) {
                var key = (cx + dx) + ',' + (cy + dy);
                var cell = index.grid[key];
                if (!cell) continue;
                for (var i = 0; i < cell.length; i++) {
                    var n = cell[i];
                    var ddx = n.x - worldX;
                    var ddy = n.y - worldY;
                    var dist = Math.sqrt(ddx * ddx + ddy * ddy);
                    var hitR = hitRadiusFn ? hitRadiusFn(n) : (n.unlocked ? 14 : 10);
                    if (dist < hitR && dist < bestDist) {
                        bestDist = dist;
                        bestNode = n;
                    }
                }
            }
        }
        return bestNode;
    }
};

window.SpatialIndex = SpatialIndex;
