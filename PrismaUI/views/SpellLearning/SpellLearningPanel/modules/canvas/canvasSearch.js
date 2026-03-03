/**
 * CanvasRenderer Search - Navigation, animation, public API, learning paths
 * Adds rotation/pan-to-node animation, show/hide/clear/refresh,
 * learning path building, and pulse animation.
 *
 * Loaded after: canvasCore.js, canvasRender.js, canvasNodes.js, canvasInteraction.js
 */

/**
 * Toggle debug grid visibility
 */
CanvasRenderer.toggleDebugGrid = function() {
    this.showDebugGrid = !this.showDebugGrid;
    this._needsRender = true;
    console.log('[CanvasRenderer] Debug grid:', this.showDebugGrid ? 'ON' : 'OFF');
    return this.showDebugGrid;
};

/**
 * Build the path from center (0,0) to a node, following prerequisite edges
 * Returns array of {x, y} points
 */
CanvasRenderer._buildPathToNode = function(nodeId) {
    var path = [];
    var visited = new Set();
    var node = this._nodeMap.get(nodeId);

    if (!node) return path;

    // Build path backwards from target to root, then reverse
    var current = node;
    var safety = 100;  // Prevent infinite loops

    while (current && safety-- > 0) {
        path.unshift({ x: current.x, y: current.y, node: current });
        visited.add(current.id);

        // Find prerequisite (parent node that connects to this one)
        var prereq = null;
        for (var i = 0; i < this.edges.length; i++) {
            var edge = this.edges[i];
            if (edge.to === current.id && !visited.has(edge.from)) {
                prereq = this._nodeMap.get(edge.from);
                break;
            }
        }

        if (!prereq) break;
        current = prereq;
    }

    // Add globe position at start (instead of hardcoded origin)
    var gd = (state.treeData && state.treeData.globe) || { x: 0, y: 0 };
    path.unshift({ x: gd.x, y: gd.y, node: null });

    return path;
};

/**
 * Trigger learning animation for a node
 * Call this when a spell is learned/unlocked
 */
CanvasRenderer.triggerLearningAnimation = function(nodeId) {
    var node = this._nodeMap ? this._nodeMap.get(nodeId) : null;
    if (!node) {
        console.warn('[CanvasRenderer] triggerLearningAnimation: node not found:', nodeId);
        return;
    }

    var path = this._buildPathToNode(nodeId);
    if (path.length < 2) {
        console.warn('[CanvasRenderer] triggerLearningAnimation: path too short');
        return;
    }

    var color = this._learningPathColor || '#00ffff';

    // Pre-compute segment lengths for animation (avoids sqrt per frame)
    var segmentLengths = [];
    var totalLength = 0;
    for (var si = 1; si < path.length; si++) {
        var sdx = path[si].x - path[si-1].x;
        var sdy = path[si].y - path[si-1].y;
        var slen = Math.sqrt(sdx * sdx + sdy * sdy);
        segmentLengths.push(slen);
        totalLength += slen;
    }

    this._learningPath = {
        nodeId: nodeId,
        path: path,
        progress: 0,
        startTime: performance.now(),
        color: color,
        segmentLengths: segmentLengths,
        totalLength: totalLength
    };

    // Store which nodes are in THIS specific animating path
    // (so we can hide only these during animation, not other learning paths)
    this._animatingPathNodes = new Set();
    for (var i = 0; i < path.length; i++) {
        if (path[i].node && path[i].node.id) {
            this._animatingPathNodes.add(path[i].node.id);
        }
    }

    // Don't show static learning path until animation completes
    this._learningPathAnimationComplete = false;

    console.log('[CanvasRenderer] Learning animation started for:', node.name, 'path length:', path.length, 'animating nodes:', this._animatingPathNodes.size);
    this._needsRender = true;
};

CanvasRenderer.rotateToNode = function(node) {
    if (this.noRotate) return;
    if (!node || typeof node.angle === 'undefined') return;
    var targetRotation = -node.angle;
    var delta = targetRotation - this.rotation;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    this.animateRotation(this.rotation + delta);
};

CanvasRenderer.rotateSchoolToTop = function(schoolName) {
    if (this.noRotate) return;
    var schoolConfig = this.schools[schoolName];
    if (!schoolConfig || schoolConfig.spokeAngle === undefined) return;

    // Formula: rotate so spokeAngle ends up at visual TOP (-90 degrees)
    // targetRotation = -90 - spokeAngle
    var targetRotation = -90 - schoolConfig.spokeAngle;
    var delta = targetRotation - this.rotation;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    this.animateRotation(this.rotation + delta);
};

CanvasRenderer.animateRotation = function(target) {
    var self = this;
    var start = this.rotation;
    var duration = 300;
    var startTime = performance.now();

    if (this.isAnimating) return;
    this.isAnimating = true;

    function animate() {
        var elapsed = performance.now() - startTime;
        var progress = Math.min(elapsed / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);

        self.rotation = start + (target - start) * eased;
        self._needsRender = true;

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            self.rotation = target;
            self.isAnimating = false;
        }
    }

    animate();
};

CanvasRenderer.show = function() {
    if (!this.canvas || !this.container) {
        console.error('[CanvasRenderer] Cannot show - not initialized');
        return;
    }

    var svg = document.getElementById('tree-svg');
    if (svg) svg.style.display = 'none';

    if (!this.canvas.parentNode) {
        this.container.appendChild(this.canvas);
    }

    // Update canvas size immediately
    this.updateCanvasSize();
    this.startRenderLoop();
    this.forceRender();

    // Also update after a brief delay to catch layout changes
    var self = this;
    setTimeout(function() {
        self.updateCanvasSize();
    }, 100);

    console.log('[CanvasRenderer] Shown with', this.nodes.length, 'nodes');
};

CanvasRenderer.hide = function() {
    this.stopRenderLoop();

    // Clear any pending resize timeout
    if (this._resizeTimeout) {
        clearTimeout(this._resizeTimeout);
        this._resizeTimeout = null;
    }

    if (this.canvas && this.canvas.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas);
    }

    var svg = document.getElementById('tree-svg');
    if (svg) svg.style.display = 'block';
};

CanvasRenderer.centerView = function() {
    this.panX = 0;
    this.panY = 0;
    this.zoom = 0.75;
    this.rotation = 0;
    this._needsRender = true;

    var zoomEl = this._zoomLevelEl || document.getElementById('zoom-level');
    if (zoomEl) zoomEl.textContent = Math.round(this.zoom * 100) + '%';
};

CanvasRenderer.setZoom = function(z) {
    this.zoom = Math.max(0.1, Math.min(5, z));
    this._needsRender = true;

    var zoomEl = this._zoomLevelEl || document.getElementById('zoom-level');
    if (zoomEl) zoomEl.textContent = Math.round(this.zoom * 100) + '%';
};

CanvasRenderer.clear = function() {
    this.nodes = [];
    this.edges = [];
    this.schools = {};
    this._nodeMap = new Map();
    this._nodeByFormId = new Map();
    this._nodeGrid = {};
    this._discoveryVisibleIds = null;
    this._nodeBuckets = null;
    this._cachedDividerGradients = null;
    this._dividerCacheKey = '';
    this._activeDpr = 0;
    this.selectedNode = null;
    this.hoveredNode = null;

    if (this.ctx && this.canvas) {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    this._needsRender = true;
};

/**
 * Refresh renderer when node states change (e.g., spell unlocked)
 */
CanvasRenderer.refresh = function() {
    // Rebuild discovery visibility if in discovery mode
    this._buildDiscoveryVisibility();
    this._buildLearningPaths();
    this._buildNodeBuckets();
    this._needsRender = true;
};

/**
 * Build persistent learning paths - tracks nodes in learning state
 * and the path from center to each learning node
 */
CanvasRenderer._buildLearningPaths = function() {
    var log = window.debugOutput || console.log;
    log('[CANVAS] _buildLearningPaths called');

    // Clear any traveling particles from previous learning target
    if (typeof Globe3D !== 'undefined' && Globe3D.clearDetachedParticles) {
        Globe3D.clearDetachedParticles();
    }

    // Initialize sets (can't use new Set() in property definition for compatibility)
    this._learningNodeIds = new Set();
    this._learningPathNodes = new Set();
    this._learningPathSegments = [];  // Clear cached segments
    this._learningPulses = [];  // Clear active pulses

    if (!this.nodes || this.nodes.length === 0) {
        log('[CANVAS] No nodes available');
        return;
    }

    log('[CANVAS] Checking ' + this.nodes.length + ' nodes for learning state...');

    // Debug: log all unique states
    var statesFound = {};
    for (var s = 0; s < this.nodes.length; s++) {
        var st = this.nodes[s].state || 'undefined';
        statesFound[st] = (statesFound[st] || 0) + 1;
    }
    log('[CANVAS] Node states: ' + JSON.stringify(statesFound));

    // Find all nodes in learning state
    var learningFound = [];
    for (var i = 0; i < this.nodes.length; i++) {
        var node = this.nodes[i];
        var nodeState = (node.state || '').toLowerCase();

        // Check various possible learning state values
        if (nodeState === 'learning') {
            log('[CANVAS] FOUND learning: ' + node.name + ' (id:' + node.id + ')');
            this._learningNodeIds.add(node.id);
            learningFound.push(node.name || node.id);

            // Build path from this node back to root
            var pathNodes = this._getPathToRoot(node.id);
            log('[CANVAS] Path for ' + node.name + ': ' + pathNodes.length + ' nodes');
            for (var j = 0; j < pathNodes.length; j++) {
                this._learningPathNodes.add(pathNodes[j]);
            }
        }
    }

    log('[CANVAS] RESULT: ' + this._learningNodeIds.size + ' learning, ' + this._learningPathNodes.size + ' path nodes');
    if (learningFound.length > 0) {
        log('[CANVAS] Learning: ' + learningFound.join(', '));
    }
};

/**
 * Get all node IDs from a node back to root (or center)
 */
CanvasRenderer._getPathToRoot = function(nodeId) {
    var log = window.debugOutput || console.log;
    var path = [nodeId];
    var visited = new Set([nodeId]);
    var current = nodeId;
    var safety = 100;

    // Get the starting node to check if it's already a root
    var startNode = this._nodeMap ? this._nodeMap.get(nodeId) : null;
    if (startNode && (startNode.isRoot || startNode.tier === 1)) {
        log('[CANVAS] Node ' + (startNode.name || nodeId) + ' is root, path = [self]');
        return path;
    }

    while (safety-- > 0) {
        // Find prerequisite (parent) node
        var prereqId = null;
        for (var i = 0; i < this.edges.length; i++) {
            var edge = this.edges[i];
            // Try both exact match and formId match
            var formIdNode = this._nodeByFormId ? this._nodeByFormId.get(current) : null;
            var altId = formIdNode ? formIdNode.id : null;
            if ((edge.to === current || (altId && edge.to === altId)) && !visited.has(edge.from)) {
                prereqId = edge.from;
                break;
            }
        }

        if (!prereqId) break;

        path.push(prereqId);
        visited.add(prereqId);
        current = prereqId;

        // Check if we reached root
        var currentNode = this._nodeMap ? this._nodeMap.get(current) : null;
        if (currentNode && (currentNode.isRoot || currentNode.tier === 1)) {
            log('[CANVAS] Reached root: ' + (currentNode.name || current));
            break;
        }
    }

    log('[CANVAS] Path built: ' + path.length + ' nodes -> ' + path.join(' -> '));
    return path;
};

/**
 * Build path segments for pulse animation
 * Returns array of {from: {x,y}, to: {x,y}} segments from center to learning nodes
 */
CanvasRenderer._buildLearningPathSegments = function() {
    this._learningPathSegments = [];

    if (!this._learningNodeIds || this._learningNodeIds.size === 0) return;
    if (!this._nodeMap) return;

    var self = this;

    // For each learning node, build segments from center through path
    this._learningNodeIds.forEach(function(learningId) {
        var pathNodeIds = self._getPathToRoot(learningId);
        if (pathNodeIds.length === 0) return;

        // Reverse so we go from root to learning node
        pathNodeIds.reverse();

        var segments = [];

        // First segment: globe center to root node
        var gd = (state.treeData && state.treeData.globe) || { x: 0, y: 0 };
        var rootNode = self._nodeMap.get(pathNodeIds[0]);
        if (rootNode) {
            var sdx = rootNode.x - gd.x, sdy = rootNode.y - gd.y;
            segments.push({
                from: { x: gd.x, y: gd.y },
                to: { x: rootNode.x, y: rootNode.y },
                length: Math.sqrt(sdx * sdx + sdy * sdy)
            });
        }

        // Subsequent segments: node to node
        for (var i = 0; i < pathNodeIds.length - 1; i++) {
            var fromNode = self._nodeMap.get(pathNodeIds[i]);
            var toNode = self._nodeMap.get(pathNodeIds[i + 1]);
            if (fromNode && toNode) {
                var sdx2 = toNode.x - fromNode.x, sdy2 = toNode.y - fromNode.y;
                segments.push({
                    from: { x: fromNode.x, y: fromNode.y },
                    to: { x: toNode.x, y: toNode.y },
                    length: Math.sqrt(sdx2 * sdx2 + sdy2 * sdy2)
                });
            }
        }

        if (segments.length > 0) {
            // Pre-compute segmentLengths array and totalLength for pulse animation
            var segLengths = [];
            var totalLen = 0;
            for (var si = 0; si < segments.length; si++) {
                segLengths.push(segments[si].length);
                totalLen += segments[si].length;
            }
            self._learningPathSegments.push({
                learningNodeId: learningId,
                segments: segments,
                segmentLengths: segLengths,
                totalLength: totalLen
            });
        }
    });
};

/**
 * Calculate total length of path segments
 */
CanvasRenderer._calculatePathLength = function(segments) {
    var total = 0;
    for (var i = 0; i < segments.length; i++) {
        var seg = segments[i];
        var dx = seg.to.x - seg.from.x;
        var dy = seg.to.y - seg.from.y;
        total += Math.sqrt(dx * dx + dy * dy);
    }
    return total;
};

/**
 * Detach a globe particle to travel along learning paths (called on heartbeat)
 */
CanvasRenderer._detachGlobeParticleToLearningPath = function() {
    if (typeof Globe3D === 'undefined' || !Globe3D.enabled) return;

    if (!this._learningPathSegments || this._learningPathSegments.length === 0) {
        this._buildLearningPathSegments();
    }

    if (!this._learningPathSegments || this._learningPathSegments.length === 0) return;

    // For each learning path, detach a globe particle with learning color
    var learningColor = this._learningPathColor || '#00ffff';
    for (var i = 0; i < this._learningPathSegments.length; i++) {
        var pathData = this._learningPathSegments[i];
        Globe3D.detachParticleToPath(pathData.segments, this._learningPulseSpeed, learningColor);
    }
};

/**
 * Update traveling pulses
 */
CanvasRenderer._updateLearningPulses = function() {
    if (!this._learningPulses || this._learningPulses.length === 0) return;

    // Update each pulse
    for (var i = this._learningPulses.length - 1; i >= 0; i--) {
        var pulse = this._learningPulses[i];
        pulse.progress += pulse.speed;

        // Fade out near the end
        if (pulse.progress > 0.8) {
            pulse.alpha = Math.max(0, 1 - (pulse.progress - 0.8) / 0.2);
        }

        // Remove completed pulses
        if (pulse.progress >= 1.0) {
            this._learningPulses.splice(i, 1);
        }
    }
};

/**
 * Render traveling pulses
 */
CanvasRenderer._renderLearningPulses = function(ctx) {
    if (!this._learningPulses || this._learningPulses.length === 0) return;
    if (!this._learningPathSegments || this._learningPathSegments.length === 0) return;

    var learningPathColor = this._learningPathColor || '#00ffff';

    for (var i = 0; i < this._learningPulses.length; i++) {
        var pulse = this._learningPulses[i];
        var pathData = this._learningPathSegments[pulse.pathIndex];

        if (!pathData) continue;

        // Find position along path (use cached segment lengths)
        var pos = this._getPositionAlongPath(pathData.segments, pulse.progress, pathData.segmentLengths, pathData.totalLength);
        if (!pos) continue;

        // Draw glowing pulse
        ctx.save();
        ctx.globalAlpha = pulse.alpha * 0.9;

        // Outer glow
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pulse.size * 2, 0, Math.PI * 2);
        ctx.fillStyle = learningPathColor;
        ctx.globalAlpha = pulse.alpha * 0.3;
        ctx.fill();

        // Inner bright core
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pulse.size, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = pulse.alpha * 0.9;
        ctx.fill();

        ctx.restore();
    }
};

/**
 * Get x,y position along a path given progress (0-1)
 */
CanvasRenderer._getPositionAlongPath = function(segments, progress, cachedSegLengths, cachedTotalLength) {
    if (!segments || segments.length === 0) return null;

    // Use pre-cached lengths if available, else compute
    var totalLength, segmentLengths;
    if (cachedSegLengths && cachedTotalLength > 0) {
        segmentLengths = cachedSegLengths;
        totalLength = cachedTotalLength;
    } else {
        totalLength = 0;
        segmentLengths = [];
        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            var len = seg.length !== undefined ? seg.length : Math.sqrt(
                (seg.to.x - seg.from.x) * (seg.to.x - seg.from.x) +
                (seg.to.y - seg.from.y) * (seg.to.y - seg.from.y)
            );
            segmentLengths.push(len);
            totalLength += len;
        }
    }

    // Find position
    var targetDist = progress * totalLength;
    var distSoFar = 0;

    for (var i = 0; i < segments.length; i++) {
        var segLen = segmentLengths[i];

        if (distSoFar + segLen >= targetDist) {
            var segProgress = (targetDist - distSoFar) / segLen;
            var seg = segments[i];
            return {
                x: seg.from.x + (seg.to.x - seg.from.x) * segProgress,
                y: seg.from.y + (seg.to.y - seg.from.y) * segProgress
            };
        }

        distSoFar += segLen;
    }

    // Return end position
    var lastSeg = segments[segments.length - 1];
    return { x: lastSeg.to.x, y: lastSeg.to.y };
};

window.CanvasRenderer = CanvasRenderer;
