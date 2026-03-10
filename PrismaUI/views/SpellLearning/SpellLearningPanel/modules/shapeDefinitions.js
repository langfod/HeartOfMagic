/**
 * Shape Definitions — Shared school shape geometry (DUP-R9)
 *
 * Provides canonical vertex arrays for the 5 Skyrim magic school shapes
 * (Diamond, Circle, Hexagon, Pentagon, Triangle) plus conversion helpers
 * for each renderer format (SVG polygon, Canvas Path2D, WebGL Float32Array).
 *
 * Single source of truth replacing:
 *   - wheelRender.js createSchoolShape()    (SVG polygon)
 *   - canvasCore.js _initShapePaths()       (Path2D)
 *   - webglShapes.js shape definitions      (Float32Array)
 *
 * Depends on: nothing (pure geometry math)
 */

var ShapeDefinitions = {

    // =========================================================================
    // SCHOOL → SHAPE MAPPING
    // =========================================================================

    /**
     * Canonical mapping from school name to shape name.
     */
    schoolShapeMap: {
        'Destruction': 'diamond',
        'Restoration': 'circle',
        'Alteration': 'hexagon',
        'Conjuration': 'pentagon',
        'Illusion': 'triangle'
    },

    /**
     * Get the shape name for a school. Falls back to 'diamond' for unknown schools.
     * @param {string} schoolName
     * @returns {string}
     */
    getSchoolShape: function (schoolName) {
        return ShapeDefinitions.schoolShapeMap[schoolName] || 'diamond';
    },

    // =========================================================================
    // CANONICAL VERTEX GENERATORS (unit coordinates, centered at origin)
    // =========================================================================

    /**
     * Diamond (Destruction). Points: top, right, bottom, left.
     * @param {number} [scale] - Half-extent (default 1)
     * @returns {Array<Array<number>>} Array of [x, y] pairs
     */
    diamond: function (scale) {
        var s = scale || 1;
        return [[0, -s], [s, 0], [0, s], [-s, 0]];
    },

    /**
     * Circle (Restoration). Approximated with n segments.
     * @param {number} [scale] - Radius (default 1)
     * @param {number} [segments] - Number of segments (default 16)
     * @returns {Array<Array<number>>} Array of [x, y] pairs
     */
    circle: function (scale, segments) {
        var s = scale || 1;
        var n = segments || 16;
        var pts = [];
        for (var i = 0; i < n; i++) {
            var angle = (i / n) * Math.PI * 2;
            pts.push([Math.cos(angle) * s, Math.sin(angle) * s]);
        }
        return pts;
    },

    /**
     * Hexagon (Alteration). Scaled 0.9 wide, 0.5 tall per original implementations.
     * @param {number} [scale] - Half-extent (default 1)
     * @returns {Array<Array<number>>} Array of [x, y] pairs
     */
    hexagon: function (scale) {
        var s = scale || 1;
        var w = s * 0.9;
        var h = s * 0.5;
        return [
            [0, -s],
            [w, -h],
            [w, h],
            [0, s],
            [-w, h],
            [-w, -h]
        ];
    },

    /**
     * Pentagon (Conjuration). 5 vertices at 72-degree intervals, rotated -90 degrees.
     * @param {number} [scale] - Radius (default 1)
     * @returns {Array<Array<number>>} Array of [x, y] pairs
     */
    pentagon: function (scale) {
        var s = scale || 1;
        var pts = [];
        for (var i = 0; i < 5; i++) {
            var angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
            pts.push([Math.cos(angle) * s, Math.sin(angle) * s]);
        }
        return pts;
    },

    /**
     * Triangle (Illusion). Inverted (tip pointing down) to match existing implementations.
     * @param {number} [scale] - Half-extent (default 1)
     * @returns {Array<Array<number>>} Array of [x, y] pairs
     */
    triangle: function (scale) {
        var s = scale || 1;
        return [[0, s], [-s * 0.85, -s * 0.6], [s * 0.85, -s * 0.6]];
    },

    /**
     * Get canonical vertices for a school.
     * @param {string} schoolName
     * @param {number} [scale]
     * @returns {Array<Array<number>>}
     */
    getSchoolVertices: function (schoolName, scale) {
        var shapeName = ShapeDefinitions.getSchoolShape(schoolName);
        var generator = ShapeDefinitions[shapeName];
        if (generator) return generator(scale);
        return ShapeDefinitions.diamond(scale);
    },

    // =========================================================================
    // RENDERER FORMAT CONVERTERS
    // =========================================================================

    /**
     * Convert vertices to SVG polygon points string.
     * @param {Array<Array<number>>} vertices - Array of [x, y] pairs
     * @returns {string} "x1,y1 x2,y2 ..."
     */
    toSvgPoints: function (vertices) {
        var parts = [];
        for (var i = 0; i < vertices.length; i++) {
            parts.push(vertices[i][0] + ',' + vertices[i][1]);
        }
        return parts.join(' ');
    },

    /**
     * Convert vertices to a Canvas Path2D object.
     * Vertices should be in unit coordinates (-1 to 1).
     * @param {Array<Array<number>>} vertices - Array of [x, y] pairs
     * @returns {Path2D}
     */
    toPath2D: function (vertices) {
        var path = new Path2D();
        if (vertices.length === 0) return path;
        path.moveTo(vertices[0][0], vertices[0][1]);
        for (var i = 1; i < vertices.length; i++) {
            path.lineTo(vertices[i][0], vertices[i][1]);
        }
        path.closePath();
        return path;
    },

    /**
     * Convert vertices to a WebGL-compatible Float32Array (triangle fan).
     * Adds center vertex (0,0) as first point for gl.TRIANGLE_FAN.
     * @param {Array<Array<number>>} vertices - Array of [x, y] pairs
     * @returns {Float32Array}
     */
    toFloat32Fan: function (vertices) {
        // Triangle fan: center + all vertices + first vertex again to close
        var count = vertices.length + 2;
        var arr = new Float32Array(count * 2);
        // Center vertex
        arr[0] = 0;
        arr[1] = 0;
        for (var i = 0; i < vertices.length; i++) {
            arr[(i + 1) * 2] = vertices[i][0];
            arr[(i + 1) * 2 + 1] = vertices[i][1];
        }
        // Close the fan
        arr[count * 2 - 2] = vertices[0][0];
        arr[count * 2 - 1] = vertices[0][1];
        return arr;
    },

    // =========================================================================
    // PRE-BUILT SHAPE CACHES
    // =========================================================================

    /** @private */
    _path2DCache: null,

    /**
     * Get or create cached Path2D shapes for all schools.
     * @returns {Object} Map of school name -> Path2D
     */
    getPath2DCache: function () {
        if (ShapeDefinitions._path2DCache) return ShapeDefinitions._path2DCache;

        var cache = {};
        for (var school in ShapeDefinitions.schoolShapeMap) {
            if (!ShapeDefinitions.schoolShapeMap.hasOwnProperty(school)) continue;
            cache[school] = ShapeDefinitions.toPath2D(ShapeDefinitions.getSchoolVertices(school, 1));
        }
        // Circle for Restoration needs special handling (Path2D arc is smoother)
        var circlePath = new Path2D();
        circlePath.arc(0, 0, 1, 0, Math.PI * 2);
        cache['Restoration'] = circlePath;
        // Default shape
        cache['default'] = circlePath;

        ShapeDefinitions._path2DCache = cache;
        return cache;
    },

    /**
     * Get a single cached Path2D shape for a school.
     * @param {string} schoolName
     * @returns {Path2D}
     */
    getPath2D: function (schoolName) {
        var cache = ShapeDefinitions.getPath2DCache();
        return cache[schoolName] || cache['default'];
    }
};

window.ShapeDefinitions = ShapeDefinitions;
