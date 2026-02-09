/**
 * spatial-hash.js - Uniform Spatial Hash Grid
 *
 * Provides O(1) nearest-node lookup for hover detection.
 * Nodes are bucketed by floor(coord / cellSize) so that radius queries
 * only need to check the 3x3 neighbourhood around the query cell.
 *
 * Global class: SpatialHashGrid
 * Dependencies: none
 */

class SpatialHashGrid {
    /**
     * @param {number} cellSize - Grid cell size in world-space pixels (50-100 recommended).
     */
    constructor(cellSize) {
        this.cellSize = cellSize || 80;
        this.invCellSize = 1 / this.cellSize;
        /** @type {Map<string, Array>} */
        this.cells = new Map();
    }

    /** Remove all nodes from the grid. */
    clear() {
        this.cells.clear();
    }

    /**
     * Insert a node into the grid cell corresponding to (node.x, node.y).
     * @param {object} node - Must have numeric x, y properties.
     */
    insert(node) {
        var key = this._key(node.x, node.y);
        var bucket = this.cells.get(key);
        if (bucket) {
            bucket.push(node);
        } else {
            this.cells.set(key, [node]);
        }
    }

    /**
     * Compute the cell key string for world coordinates.
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    _key(x, y) {
        var cx = (x * this.invCellSize) | 0;
        var cy = (y * this.invCellSize) | 0;
        // Handle negative coordinates: bitwise OR floors toward zero, we need floor.
        if (x < 0 && (x % this.cellSize) !== 0) cx -= 1;
        if (y < 0 && (y % this.cellSize) !== 0) cy -= 1;
        return cx + ',' + cy;
    }

    /**
     * Return all nodes within `radius` of world point (wx, wy).
     * Checks the containing cell plus all 8 neighbours.
     * @param {number} wx - World X
     * @param {number} wy - World Y
     * @param {number} radius - Search radius in world units
     * @returns {Array} Nodes within radius
     */
    queryRadius(wx, wy, radius) {
        var r2 = radius * radius;
        var results = [];
        var cx = Math.floor(wx * this.invCellSize);
        var cy = Math.floor(wy * this.invCellSize);

        for (var dx = -1; dx <= 1; dx++) {
            for (var dy = -1; dy <= 1; dy++) {
                var key = (cx + dx) + ',' + (cy + dy);
                var bucket = this.cells.get(key);
                if (!bucket) continue;
                for (var i = 0, len = bucket.length; i < len; i++) {
                    var n = bucket[i];
                    var ddx = n.x - wx;
                    var ddy = n.y - wy;
                    if (ddx * ddx + ddy * ddy <= r2) {
                        results.push(n);
                    }
                }
            }
        }
        return results;
    }

    /**
     * Return the single nearest node within maxRadius, or null.
     * @param {number} wx
     * @param {number} wy
     * @param {number} maxRadius
     * @returns {object|null}
     */
    nearest(wx, wy, maxRadius) {
        var candidates = this.queryRadius(wx, wy, maxRadius);
        if (candidates.length === 0) return null;

        var best = null;
        var bestD2 = Infinity;
        for (var i = 0, len = candidates.length; i < len; i++) {
            var n = candidates[i];
            var dx = n.x - wx;
            var dy = n.y - wy;
            var d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
                bestD2 = d2;
                best = n;
            }
        }
        return best;
    }
}
