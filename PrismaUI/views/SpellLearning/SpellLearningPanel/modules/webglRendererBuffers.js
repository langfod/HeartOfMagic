/**
 * WebGLRenderer Buffers — GPU buffer update methods.
 * Loaded after: webglRenderer.js
 *
 * Methods: updateNodeBuffer, _buildDiscoveryVisibleSet, getNodeColor,
 *          parseColor, updateEdgeBuffer, updateDividerBuffer
 *
 * Depends on: WebGLRenderer, WebGLShapes, DiscoveryVisibility,
 *             ColorUtils, TREE_CONFIG, settings
 */

// =========================================================================
// GPU BUFFER UPDATES
// =========================================================================

/**
 * Update node instance buffer with current node data.
 * Also builds per-shape instance buffers for renderNodes.
 */
WebGLRenderer.updateNodeBuffer = function() {
    var gl = this.gl;
    var self = this;

    // Reset color cache on data rebuild
    this._colorCache = {};

    // Build visibility set for discovery mode
    // In discovery mode: show unlocked, available, and locked nodes that are ONE STEP from available/unlocked
    var discoveryVisibleIds = null;
    if (settings.discoveryMode && !settings.cheatMode) {
        discoveryVisibleIds = this._buildDiscoveryVisibleSet();
    }

    // Count visible nodes
    var visibleNodes = [];
    for (var i = 0; i < this.nodes.length; i++) {
        var node = this.nodes[i];

        // Skip hidden schools
        if (settings.schoolVisibility && settings.schoolVisibility[node.school] === false) {
            continue;
        }

        // Discovery mode visibility check
        if (discoveryVisibleIds && !discoveryVisibleIds.has(node.id) && !discoveryVisibleIds.has(node.formId)) {
            continue;  // Not visible in discovery mode
        }

        visibleNodes.push(node);
    }

    this._visibleNodeCount = visibleNodes.length;
    this._visibleNodes = visibleNodes;  // Store for edge filtering
    this._discoveryVisibleIds = discoveryVisibleIds;  // Store for edge filtering

    // Create instance data array
    // Format: [x, y, size, r, g, b, a, state] per node
    var instanceData = new Float32Array(visibleNodes.length * 8);

    // Group nodes by shape index for per-shape buffers
    var shapeGroups = {};  // shapeIndex -> [indices into visibleNodes]

    for (var i = 0; i < visibleNodes.length; i++) {
        var node = visibleNodes[i];
        var offset = i * 8;

        // Position
        instanceData[offset + 0] = node.x;
        instanceData[offset + 1] = node.y;

        // Size based on state
        var size;
        if (node.state === 'unlocked') {
            size = 12;
        } else if (node.state === 'available') {
            size = 9;
        } else {
            size = 7;
        }

        // Increase size for selected/hovered
        if (this.selectedNode && this.selectedNode.id === node.id) {
            size += 4;
        } else if (this.hoveredNode && this.hoveredNode.id === node.id) {
            size += 3;
        }

        instanceData[offset + 2] = size;

        // Color (cached)
        var color = this.getNodeColor(node);
        instanceData[offset + 3] = color.r;
        instanceData[offset + 4] = color.g;
        instanceData[offset + 5] = color.b;
        instanceData[offset + 6] = color.a;

        // State (for shader effects)
        var stateVal = 0;
        if (node.state === 'unlocked') stateVal = 2;
        else if (node.state === 'available') stateVal = 1;
        if (this.selectedNode && this.selectedNode.id === node.id) stateVal = 3;

        // Mystery nodes in discovery mode (locked nodes that are visible)
        if (settings.discoveryMode && !settings.cheatMode && node.state === 'locked') {
            stateVal = 4;  // Mystery
        }

        instanceData[offset + 7] = stateVal;

        // Store shape index on node for rendering
        var shapeIdx = WebGLShapes.getShapeIndex(node.school);
        node._shapeIndex = shapeIdx;

        if (!shapeGroups[shapeIdx]) shapeGroups[shapeIdx] = [];
        shapeGroups[shapeIdx].push(i);
    }

    this._nodeInstanceData = instanceData;

    // Upload to GPU
    gl.bindBuffer(gl.ARRAY_BUFFER, this._nodeInstanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW);

    // Build per-shape instance buffers (used by renderNodes)
    var oldPerShape = this._perShapeInstances;
    this._perShapeInstances = {};

    for (var shapeIndex in shapeGroups) {
        var indices = shapeGroups[shapeIndex];
        var perShapeData = new Float32Array(indices.length * 8);

        for (var j = 0; j < indices.length; j++) {
            var srcOffset = indices[j] * 8;
            var dstOffset = j * 8;
            for (var f = 0; f < 8; f++) {
                perShapeData[dstOffset + f] = instanceData[srcOffset + f];
            }
        }

        // Reuse existing GL buffer if available, otherwise create
        var glBuf;
        if (oldPerShape && oldPerShape[shapeIndex]) {
            glBuf = oldPerShape[shapeIndex].buffer;
        } else {
            glBuf = gl.createBuffer();
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, glBuf);
        gl.bufferData(gl.ARRAY_BUFFER, perShapeData, gl.DYNAMIC_DRAW);

        this._perShapeInstances[shapeIndex] = {
            data: perShapeData,
            buffer: glBuf,
            count: indices.length
        };
    }

    // Delete buffers for shapes that no longer have nodes
    if (oldPerShape) {
        for (var oldIdx in oldPerShape) {
            if (!this._perShapeInstances[oldIdx]) {
                gl.deleteBuffer(oldPerShape[oldIdx].buffer);
            }
        }
    }

    this._nodeDataDirty = false;
};

/**
 * Build set of node IDs visible in discovery mode.
 * Delegates to shared DiscoveryVisibility module (DUP-R5).
 */
WebGLRenderer._buildDiscoveryVisibleSet = function() {
    return DiscoveryVisibility.build(this.nodes, this.edges);
};

/**
 * Get color for a node (cached per school+state combination)
 * @param {Object} node
 * @returns {Object} {r, g, b, a} normalized 0-1
 */
WebGLRenderer.getNodeColor = function(node) {
    var disc = (settings.discoveryMode && !settings.cheatMode) ? 1 : 0;
    var cacheKey = (node.school || '') + ':' + (node.state || '') + ':' + disc;
    if (this._colorCache && this._colorCache[cacheKey]) {
        return this._colorCache[cacheKey];
    }

    var schoolColor = TREE_CONFIG.getSchoolColor(node.school);
    var rgb = this.parseColor(schoolColor);

    if (!rgb) {
        return { r: 0.5, g: 0.5, b: 0.5, a: 1.0 };
    }

    var r = rgb.r / 255;
    var g = rgb.g / 255;
    var b = rgb.b / 255;
    var a = 1.0;

    if (node.state === 'unlocked') {
        // Full color
        a = 1.0;
    } else if (node.state === 'available') {
        // Slightly dimmed
        a = 0.8;
    } else {
        // Locked - dimmed
        r *= 0.5;
        g *= 0.5;
        b *= 0.5;
        a = 0.5;
    }

    // Discovery mode mystery
    if (settings.discoveryMode && !settings.cheatMode && node.state === 'locked') {
        r *= 0.4;
        g *= 0.4;
        b *= 0.4;
        a = 0.6;
    }

    var result = { r: r, g: g, b: b, a: a };
    if (this._colorCache) this._colorCache[cacheKey] = result;
    return result;
};

WebGLRenderer.parseColor = function(color) {
    return ColorUtils.parse(color);
};

/**
 * Update edge buffer with current edge data
 */
WebGLRenderer.updateEdgeBuffer = function() {
    var gl = this.gl;

    // Build edge vertices (2 vertices per edge)
    var vertices = [];
    var colors = [];

    for (var i = 0; i < this.edges.length; i++) {
        var edge = this.edges[i];
        var fromNode = this._nodeMap.get(edge.from);
        var toNode = this._nodeMap.get(edge.to);

        if (!fromNode || !toNode) continue;

        // Skip if either school is hidden
        if (settings.schoolVisibility) {
            if (settings.schoolVisibility[fromNode.school] === false) continue;
            if (settings.schoolVisibility[toNode.school] === false) continue;
        }

        // Discovery mode: only show edges where BOTH nodes are visible
        if (this._discoveryVisibleIds) {
            var fromVisible = this._discoveryVisibleIds.has(edge.from) || this._discoveryVisibleIds.has(fromNode.id);
            var toVisible = this._discoveryVisibleIds.has(edge.to) || this._discoveryVisibleIds.has(toNode.id);
            if (!fromVisible || !toVisible) continue;
        }

        // Add vertices
        vertices.push(fromNode.x, fromNode.y);
        vertices.push(toNode.x, toNode.y);

        // Color based on state
        var bothUnlocked = fromNode.state === 'unlocked' && toNode.state === 'unlocked';
        var color;
        var alpha;

        if (bothUnlocked) {
            color = this.parseColor(TREE_CONFIG.getSchoolColor(fromNode.school));
            alpha = 1.0;
        } else {
            color = { r: 51, g: 51, b: 51 };  // #333
            alpha = 0.3;
        }

        if (!color) color = { r: 51, g: 51, b: 51 };

        // Both vertices same color
        colors.push(color.r / 255, color.g / 255, color.b / 255, alpha);
        colors.push(color.r / 255, color.g / 255, color.b / 255, alpha);
    }

    this._edgeVertexCount = vertices.length / 2;

    // Upload to GPU
    gl.bindBuffer(gl.ARRAY_BUFFER, this._edgeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._edgeColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
};

/**
 * Update school divider lines buffer
 */
WebGLRenderer.updateDividerBuffer = function() {
    var gl = this.gl;
    var schoolNames = Object.keys(this.schools);

    if (schoolNames.length < 2) {
        this._dividerVertexCount = 0;
        return;
    }

    var sliceAngle = 360 / schoolNames.length;
    var radius = 800;
    var vertices = [];

    for (var i = 0; i < schoolNames.length; i++) {
        var angle = (i * sliceAngle - 90) * Math.PI / 180;
        vertices.push(0, 0);
        vertices.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }

    this._dividerVertexCount = vertices.length / 2;

    gl.bindBuffer(gl.ARRAY_BUFFER, this._dividerBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
};
