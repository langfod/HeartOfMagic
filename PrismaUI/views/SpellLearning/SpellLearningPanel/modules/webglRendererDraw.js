/**
 * WebGLRenderer Draw — Render pipeline and public API.
 * Loaded after: webglRenderer.js, webglRendererBuffers.js
 *
 * Methods: updateCanvasSize, startRenderLoop, stopRenderLoop, forceRender,
 *          render, createViewMatrixNoRotation, renderHub, renderDividers,
 *          renderEdges, renderNodes, renderLabels,
 *          rotateToNode, rotateSchoolToTop, animateRotation, handleNodeClickRotation,
 *          show, hide, centerView, setZoom, clear, shouldUseWebGL, refresh, updateNodeState
 *
 * Depends on: WebGLRenderer, WebGLShapes, ViewTransform, WheelRenderer, settings
 */

// =========================================================================
// RENDERING
// =========================================================================

WebGLRenderer.updateCanvasSize = function() {
    if (!this.container || !this.canvas) return;

    var rect = this.container.getBoundingClientRect();
    var width = rect.width || 800;
    var height = rect.height || 600;
    var dpr = window.devicePixelRatio || 1;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';

    this.labelCanvas.width = width * dpr;
    this.labelCanvas.height = height * dpr;
    this.labelCanvas.style.width = width + 'px';
    this.labelCanvas.style.height = height + 'px';

    this._width = width;
    this._height = height;

    // Update WebGL viewport
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // Invalidate cached rect (size/position changed)
    this._cachedRect = null;

    this._needsRender = true;
    this._needsLabelRender = true;
};

WebGLRenderer.startRenderLoop = function() {
    if (this._rafId) return;

    var self = this;
    console.log('[WebGLRenderer] Starting render loop');

    function loop() {
        if (self._needsRender) {
            self.render();
            self._needsRender = false;
        }
        if (self._needsLabelRender) {
            self.renderLabels();
            self._needsLabelRender = false;
        }
        self._rafId = requestAnimationFrame(loop);
    }

    loop();
};

WebGLRenderer.stopRenderLoop = function() {
    if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
    }
};

WebGLRenderer.forceRender = function() {
    this._needsRender = true;
    this._needsLabelRender = true;
    this.render();
    this.renderLabels();
};

WebGLRenderer.render = function() {
    var gl = this.gl;
    if (!gl) return;

    var startTime = performance.now();

    // Clear
    gl.clearColor(0, 0, 0, 0);  // Transparent background
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Enable blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Get view matrices - one with rotation (for tree), one without (for hub)
    var viewMatrix = this.createViewMatrix();
    var hubMatrix = this.createViewMatrixNoRotation();  // Hub doesn't rotate
    var resolution = new Float32Array([this._width, this._height]);

    // Render center hub FIRST (doesn't rotate with wheel)
    this.renderHub(hubMatrix, resolution);

    // Render school dividers (rotate with wheel)
    this.renderDividers(viewMatrix, resolution);

    // Render edges
    this.renderEdges(viewMatrix, resolution);

    // Render nodes (instanced by shape)
    this.renderNodes(viewMatrix, resolution);

    var elapsed = performance.now() - startTime;
    if (elapsed > 8) {
        console.log('[WebGLRenderer] Render:', Math.round(elapsed) + 'ms,',
                    this._visibleNodeCount, 'nodes,', this._edgeVertexCount / 2, 'edges');
    }
};

/**
 * Create view matrix WITHOUT rotation (for static elements like hub)
 */
WebGLRenderer.createViewMatrixNoRotation = function() {
    var cx = this._width / 2;
    var cy = this._height / 2;
    var z = this.zoom;

    // Matrix without rotation - just pan and zoom
    return new Float32Array([
        z, 0, 0,
        0, z, 0,
        cx + this.panX, cy + this.panY, 1
    ]);
};

WebGLRenderer.renderHub = function(viewMatrix, resolution) {
    var gl = this.gl;
    var program = this._programs.hub;

    gl.useProgram(program);

    // Set uniforms - use non-rotating matrix so hub stays fixed
    gl.uniformMatrix3fv(this._programs.hubUniforms.u_viewMatrix, false, viewMatrix);
    gl.uniform2fv(this._programs.hubUniforms.u_resolution, resolution);

    // Draw filled hub
    gl.uniform4f(this._programs.hubUniforms.u_color, 0.72, 0.66, 0.47, 0.1);  // rgba(184, 168, 120, 0.1)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._hubBuffer);
    gl.enableVertexAttribArray(this._programs.hubAttribs.a_position);
    gl.vertexAttribPointer(this._programs.hubAttribs.a_position, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, this._hubVertexCount);
};

WebGLRenderer.renderDividers = function(viewMatrix, resolution) {
    if (this._dividerVertexCount === 0) return;

    var gl = this.gl;
    var program = this._programs.hub;  // Reuse simple shader

    gl.useProgram(program);
    gl.uniformMatrix3fv(this._programs.hubUniforms.u_viewMatrix, false, viewMatrix);
    gl.uniform2fv(this._programs.hubUniforms.u_resolution, resolution);
    gl.uniform4f(this._programs.hubUniforms.u_color, 1, 1, 1, 0.1);  // rgba(255, 255, 255, 0.1)

    gl.bindBuffer(gl.ARRAY_BUFFER, this._dividerBuffer);
    gl.enableVertexAttribArray(this._programs.hubAttribs.a_position);
    gl.vertexAttribPointer(this._programs.hubAttribs.a_position, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINES, 0, this._dividerVertexCount);
};

WebGLRenderer.renderEdges = function(viewMatrix, resolution) {
    if (this._edgeVertexCount === 0) return;

    var gl = this.gl;
    var program = this._programs.edge;

    gl.useProgram(program);
    gl.uniformMatrix3fv(this._programs.edgeUniforms.u_viewMatrix, false, viewMatrix);
    gl.uniform2fv(this._programs.edgeUniforms.u_resolution, resolution);

    // Position attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, this._edgeBuffer);
    gl.enableVertexAttribArray(this._programs.edgeAttribs.a_position);
    gl.vertexAttribPointer(this._programs.edgeAttribs.a_position, 2, gl.FLOAT, false, 0, 0);

    // Color attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, this._edgeColorBuffer);
    gl.enableVertexAttribArray(this._programs.edgeAttribs.a_color);
    gl.vertexAttribPointer(this._programs.edgeAttribs.a_color, 4, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINES, 0, this._edgeVertexCount);
};

WebGLRenderer.renderNodes = function(viewMatrix, resolution) {
    if (this._visibleNodeCount === 0) return;

    var gl = this.gl;
    var program = this._programs.node;

    gl.useProgram(program);
    gl.uniformMatrix3fv(this._programs.nodeUniforms.u_viewMatrix, false, viewMatrix);
    gl.uniform2fv(this._programs.nodeUniforms.u_resolution, resolution);

    // Rebuild per-shape instance data if dirty (hover/select/data change)
    if (this._nodeDataDirty || !this._perShapeInstances) {
        this.updateNodeBuffer();
    }

    var perShape = this._perShapeInstances;
    if (!perShape) return;

    // Render each shape type using pre-built per-shape buffers
    for (var shapeIndex in perShape) {
        var shapeInfo = this._shapeBuffers.byIndex[shapeIndex];
        if (!shapeInfo) continue;

        var inst = perShape[shapeIndex];
        if (!inst || inst.count === 0) continue;

        // Bind shape template
        gl.bindBuffer(gl.ARRAY_BUFFER, shapeInfo.buffer);
        gl.enableVertexAttribArray(this._programs.nodeAttribs.a_shapeVertex);
        gl.vertexAttribPointer(this._programs.nodeAttribs.a_shapeVertex, 2, gl.FLOAT, false, 0, 0);

        // Bind cached instance buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, inst.buffer);

        // Set up instanced attributes
        var stride = 8 * 4;  // 8 floats * 4 bytes

        gl.enableVertexAttribArray(this._programs.nodeAttribs.a_position);
        gl.vertexAttribPointer(this._programs.nodeAttribs.a_position, 2, gl.FLOAT, false, stride, 0);
        gl.vertexAttribDivisor(this._programs.nodeAttribs.a_position, 1);

        gl.enableVertexAttribArray(this._programs.nodeAttribs.a_size);
        gl.vertexAttribPointer(this._programs.nodeAttribs.a_size, 1, gl.FLOAT, false, stride, 8);
        gl.vertexAttribDivisor(this._programs.nodeAttribs.a_size, 1);

        gl.enableVertexAttribArray(this._programs.nodeAttribs.a_color);
        gl.vertexAttribPointer(this._programs.nodeAttribs.a_color, 4, gl.FLOAT, false, stride, 12);
        gl.vertexAttribDivisor(this._programs.nodeAttribs.a_color, 1);

        gl.enableVertexAttribArray(this._programs.nodeAttribs.a_state);
        gl.vertexAttribPointer(this._programs.nodeAttribs.a_state, 1, gl.FLOAT, false, stride, 28);
        gl.vertexAttribDivisor(this._programs.nodeAttribs.a_state, 1);

        // Draw instanced
        gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, shapeInfo.vertexCount, inst.count);

        // Reset divisors
        gl.vertexAttribDivisor(this._programs.nodeAttribs.a_position, 0);
        gl.vertexAttribDivisor(this._programs.nodeAttribs.a_size, 0);
        gl.vertexAttribDivisor(this._programs.nodeAttribs.a_color, 0);
        gl.vertexAttribDivisor(this._programs.nodeAttribs.a_state, 0);
    }
};

WebGLRenderer.renderLabels = function() {
    var ctx = this.labelCtx;
    if (!ctx) return;

    var dpr = window.devicePixelRatio || 1;

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);
    ctx.scale(dpr, dpr);

    var cx = this._width / 2;
    var cy = this._height / 2;
    var rotRad = this.rotation * Math.PI / 180;
    var cos = Math.cos(rotRad);
    var sin = Math.sin(rotRad);

    // Draw center hub text FIRST (doesn't rotate, stays at center)
    ctx.fillStyle = '#b8a878';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MAGIC', cx + this.panX, cy + this.panY);

    // Only show node labels when zoomed in
    if (this.zoom < 0.8) return;

    // Draw labels for unlocked nodes
    // Text stays SCREEN-ALIGNED (doesn't rotate with wheel)
    // But positions DO rotate with the wheel
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.textBaseline = 'top';

    var labelsDrawn = 0;
    var maxLabels = 100;

    for (var i = 0; i < this.nodes.length && labelsDrawn < maxLabels; i++) {
        var node = this.nodes[i];

        if (node.state !== 'unlocked') continue;
        if (!node.name) continue;
        if (settings.schoolVisibility && settings.schoolVisibility[node.school] === false) continue;

        // Transform node position WITH rotation, but text stays screen-aligned
        var rotatedX = node.x * cos - node.y * sin;
        var rotatedY = node.x * sin + node.y * cos;

        var screenX = rotatedX * this.zoom + this.panX + cx;
        var screenY = rotatedY * this.zoom + this.panY + cy;

        // Viewport check
        if (screenX < -50 || screenX > this._width + 50 || screenY < -50 || screenY > this._height + 50) {
            continue;
        }

        // Draw text at screen position (no rotation applied to text itself)
        ctx.fillText(node.name.substring(0, 12), screenX, screenY + 14 * this.zoom);
        labelsDrawn++;
    }
};

// =========================================================================
// ROTATION
// =========================================================================

WebGLRenderer.rotateToNode = function(node) {
    if (!node || typeof node.angle === 'undefined') return;
    var targetRotation = -node.angle;
    var delta = targetRotation - this.rotation;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    this.animateRotation(this.rotation + delta);
};

WebGLRenderer.rotateSchoolToTop = function(schoolName) {
    var schoolConfig = this.schools[schoolName];
    if (!schoolConfig) return;
    var targetRotation = -(schoolConfig.startAngle + schoolConfig.angleSpan / 2);
    var delta = targetRotation - this.rotation;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    this.animateRotation(this.rotation + delta);
};

WebGLRenderer.animateRotation = function(target) {
    var self = this;
    ViewTransform.animateRotation(this, target, 300, function() {
        self._needsRender = true;
        self._needsLabelRender = true;
    });
};

WebGLRenderer.handleNodeClickRotation = function(node) {
    if (!node) return;

    // ALWAYS rotate the clicked node's school to top
    this.rotateSchoolToTop(node.school);
};

// =========================================================================
// PUBLIC API
// =========================================================================

WebGLRenderer.show = function() {
    if (!this.canvas || !this.container) {
        console.error('[WebGLRenderer] Cannot show - not initialized');
        return;
    }

    // Hide SVG and Canvas
    var svg = document.getElementById('tree-svg');
    if (svg) svg.style.display = 'none';

    var canvas2d = document.getElementById('tree-canvas');
    if (canvas2d) canvas2d.style.display = 'none';

    // Append WebGL canvas
    if (!this.canvas.parentNode) {
        this.container.appendChild(this.canvas);
        this.container.appendChild(this.labelCanvas);
    }

    this.updateCanvasSize();
    this.startRenderLoop();
    this.forceRender();

    console.log('[WebGLRenderer] Shown with', this.nodes.length, 'nodes');
};

WebGLRenderer.hide = function() {
    this.stopRenderLoop();

    if (this.canvas && this.canvas.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas);
    }
    if (this.labelCanvas && this.labelCanvas.parentNode) {
        this.labelCanvas.parentNode.removeChild(this.labelCanvas);
    }

    var svg = document.getElementById('tree-svg');
    if (svg) svg.style.display = 'block';
};

WebGLRenderer.centerView = function() {
    this.panX = 0;
    this.panY = 0;
    this.zoom = 0.75;
    this.rotation = 0;
    this._needsRender = true;
    this._needsLabelRender = true;

    var zoomEl = document.getElementById('zoom-level');
    if (zoomEl) zoomEl.textContent = Math.round(this.zoom * 100) + '%';
};

WebGLRenderer.setZoom = function(z) {
    this.zoom = Math.max(0.1, Math.min(5, z));
    this._needsRender = true;
    this._needsLabelRender = true;

    var zoomEl = document.getElementById('zoom-level');
    if (zoomEl) zoomEl.textContent = Math.round(this.zoom * 100) + '%';
};

WebGLRenderer.clear = function() {
    this.nodes = [];
    this.edges = [];
    this.schools = {};
    this._nodeMap = new Map();
    this._nodeByFormId = new Map();
    this._nodeGrid = {};
    this.selectedNode = null;
    this.hoveredNode = null;
    this._visibleNodeCount = 0;
    this._edgeVertexCount = 0;

    this._needsRender = true;
    this._needsLabelRender = true;
};

/**
 * Check if WebGL mode should be used
 * @param {number} nodeCount
 * @returns {boolean}
 */
WebGLRenderer.shouldUseWebGL = function(nodeCount) {
    return this.checkWebGLSupport() && nodeCount > 800;
};

/**
 * Refresh the renderer when node states change (e.g., spell unlocked)
 * Call this after spell unlock/progression changes
 */
WebGLRenderer.refresh = function() {
    if (!this.gl) return;

    console.log('[WebGLRenderer] Refreshing node/edge states');

    // Rebuild buffers with current node states
    this.updateNodeBuffer();
    this.updateEdgeBuffer();

    // Trigger re-render
    this._needsRender = true;
    this._needsLabelRender = true;
};

/**
 * Update a specific node's state and refresh
 * @param {string|number} nodeId - Node ID or formId
 * @param {string} newState - 'locked', 'available', 'unlocked'
 */
WebGLRenderer.updateNodeState = function(nodeId, newState) {
    var node = this._nodeMap.get(nodeId);
    if (node) {
        node.state = newState;
        this.refresh();
    }
};
