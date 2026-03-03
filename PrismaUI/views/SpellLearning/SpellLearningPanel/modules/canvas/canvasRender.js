/**
 * CanvasRenderer Render - Main rendering pipeline
 * Adds render loop, edge rendering, school dividers, and color utilities.
 *
 * Loaded after: canvasCore.js
 */

CanvasRenderer.startRenderLoop = function() {
    if (this._rafId) return;

    var self = this;
    console.log('[CanvasRenderer] Starting render loop');

    // Throttle animation renders to reduce CPU load
    var lastAnimationRender = 0;
    var animationThrottleMs = 50;  // ~20fps for passive animations

    function loop(timestamp) {
        var shouldRender = self._needsRender;

        // For animation-only updates, throttle to save CPU
        if (shouldRender && self._animationOnlyRender) {
            if (timestamp - lastAnimationRender < animationThrottleMs) {
                shouldRender = false;
            } else {
                lastAnimationRender = timestamp;
            }
        }

        if (shouldRender) {
            self._needsRender = false;
            self._animationOnlyRender = false;
            self.render();
        }

        self._rafId = requestAnimationFrame(loop);
    }

    loop(performance.now());
};

CanvasRenderer.stopRenderLoop = function() {
    if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
    }
};

CanvasRenderer.forceRender = function() {
    this._needsRender = true;
    this.render();
};

CanvasRenderer.render = function() {
    if (!this.ctx || !this.canvas) return;

    var startTime = performance.now();
    var ctx = this.ctx;
    var width = this._width || 800;
    var height = this._height || 600;

    if (width === 0 || height === 0) return;

    var cx = width / 2;
    var cy = height / 2;
    var dpr = window.devicePixelRatio || 1;

    // Compute LOD tier based on zoom
    this._lodTier = this._computeLODTier();

    // DPR reduction in MINIMAL tier (halve pixel work on HiDPI)
    var effectiveDpr = dpr;
    if (this._lodTier === 'minimal' && dpr > 1) {
        effectiveDpr = 1;
    }
    // Only resize canvas buffer when effective DPR changes (avoids per-frame resize)
    if (this._activeDpr !== effectiveDpr) {
        this._activeDpr = effectiveDpr;
        this.canvas.width = width * effectiveDpr;
        this.canvas.height = height * effectiveDpr;
        // CSS size stays the same — browser upscales
    }
    dpr = effectiveDpr;

    // FULL RESET - prevent ghosting
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

    // Clear the ENTIRE canvas buffer (including offscreen areas)
    ctx.fillStyle = this._bgColor || '#000000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Scale for DPR
    ctx.scale(dpr, dpr);

    // =====================================================================
    // RENDER STARFIELD BACKGROUND (behind everything)
    // =====================================================================
    if (this._starfieldEnabled && typeof Starfield !== 'undefined') {
        // Apply settings
        Starfield.setColor(this._starfieldColor || '#ffffff');
        Starfield.maxSize = this._starfieldMaxSize || 2.5;
        if (Starfield.seed !== this._starfieldSeed) {
            Starfield.seed = this._starfieldSeed || 42;
            Starfield.stars = null;  // Force reinit with new seed
        }
        if (Starfield.starCount !== this._starfieldDensity) {
            Starfield.starCount = this._starfieldDensity || 200;
            Starfield.stars = null;  // Force reinit
        }

        // Render - either fixed to screen or world-space (seed-based)
        if (this._starfieldFixed) {
            // Fixed mode: screen-space stars that drift
            if (!Starfield.stars || Starfield.width !== this._width || Starfield.height !== this._height) {
                Starfield.init(this._width, this._height);
            }
            Starfield.render(ctx);
        } else {
            // World-space: deterministic tile-based stars from seed
            Starfield.renderWorldSpace(ctx, this.panX, this.panY, this.zoom, this._width, this._height);
        }
        // Keep animation running (throttled)
        this._needsRender = true;
        this._animationOnlyRender = true;
    }

    // Calculate rotation values
    var rotRad = this.rotation * Math.PI / 180;
    var cos = Math.cos(rotRad);
    var sin = Math.sin(rotRad);

    // Calculate view bounds in WORLD coordinates (accounting for pan)
    // The view center in world space is at (-panX/zoom, -panY/zoom) before rotation
    var viewCenterX = -this.panX / this.zoom;
    var viewCenterY = -this.panY / this.zoom;

    // Undo rotation to get world-space view center
    var worldCenterX = viewCenterX * cos + viewCenterY * sin;
    var worldCenterY = -viewCenterX * sin + viewCenterY * cos;

    // View extent in world units (add generous padding)
    var viewExtent = Math.max(cx, cy) / this.zoom + 500;
    var viewLeft = worldCenterX - viewExtent;
    var viewRight = worldCenterX + viewExtent;
    var viewTop = worldCenterY - viewExtent;
    var viewBottom = worldCenterY + viewExtent;

    // =====================================================================
    // RENDER ROTATING ELEMENTS FIRST (dividers, edges, nodes)
    // =====================================================================
    ctx.save();
    ctx.translate(cx + this.panX, cy + this.panY);
    ctx.rotate(rotRad);  // Apply wheel rotation
    ctx.scale(this.zoom, this.zoom);

    // School dividers
    this.renderSchoolDividers(ctx);

    // Debug grid (behind edges/nodes)
    this.renderDebugGrid(ctx);

    // Edges
    this.renderEdges(ctx, viewLeft, viewRight, viewTop, viewBottom);

    // Learning path animation (glowing line from center to learned spell)
    this.renderLearningPath(ctx);

    // Detached particles (above lines, below nodes)
    if (typeof Globe3D !== 'undefined' && Globe3D.detachedParticles && Globe3D.detachedParticles.length > 0) {
        Globe3D._renderDetachedParticles(ctx);
    }

    // Nodes
    this.renderNodes(ctx, viewLeft, viewRight, viewTop, viewBottom);

    // Edit mode overlay (pen line, eraser path)
    if (typeof EditMode !== 'undefined' && EditMode.isActive) {
        EditMode.renderOverlay(ctx);
    }

    ctx.restore();

    // =====================================================================
    // RENDER CENTER HUB ON TOP (does NOT rotate with wheel) - with heartbeat
    // =====================================================================
    var globeData = (state.treeData && state.treeData.globe) || { x: 0, y: 0, radius: 45 };
    ctx.save();
    ctx.translate(cx + this.panX, cy + this.panY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(globeData.x, globeData.y);
    // No rotation applied to hub!

    // Heartbeat animation - pulsing scale with configurable delay between pulse groups
    var pulse = 0;
    var scale = 1;
    if (this._heartAnimationEnabled) {
        this._heartbeatPhase += this._heartbeatSpeed;

        // Heartbeat animation: double beat (systole-diastole) then delay
        // pulse_speed controls how fast each beat is
        // pulse_delay controls the pause between heartbeat groups

        // Convert delay from seconds to "phase units" at 60fps
        // At speed 0.06 and 60fps, one second = 0.06 * 60 = 3.6 phase units
        var phasePerSecond = this._heartbeatSpeed * 60;
        var pulseDelay = (this._heartPulseDelay || 2.0) * phasePerSecond;
        var beatDuration = Math.PI;  // The double-beat takes PI radians
        var cycleLength = beatDuration + pulseDelay;
        var cyclePos = this._heartbeatPhase % cycleLength;

        // Only pulse during the "beat" part of the cycle (first PI radians)
        if (cyclePos < beatDuration) {
            // Double-beat pattern: quick pulse, pause, quick pulse
            var beat1 = Math.max(0, Math.sin(cyclePos * 2));
            var beat2 = Math.max(0, Math.sin(cyclePos * 2 - 0.8));
            pulse = (beat1 + beat2 * 0.6) * 0.08;  // Max ~8% scale change
        }
        scale = 1 + pulse;

        // Global rising-edge detection — fires once per beat start
        var nowBeatingGlobal = cyclePos < beatDuration && cyclePos < 0.5;
        if (nowBeatingGlobal && !this._lastHeartbeatGlobal) {
            // Scatter globe particles on every heartbeat
            if (typeof Globe3D !== 'undefined' && Globe3D.onHeartbeat) {
                Globe3D.onHeartbeat(1.0);
            }
            // Boost particle core flash on heartbeat
            this._coreFlashBoost = 1.0;
        }
        this._lastHeartbeatGlobal = nowBeatingGlobal;
    }

    // Keep animation running for heartbeat or globe (throttled to reduce CPU)
    var globeEnabled = this._globeEnabled && (typeof Globe3D !== 'undefined') && Globe3D.enabled;
    if (this._heartAnimationEnabled || globeEnabled) {
        this._needsRender = true;
        this._animationOnlyRender = true;  // Mark as throttleable
    }

    ctx.scale(scale, scale);

    // Core Size: use settings.globeSize if available, else fall back to globeData
    var baseRadius = (typeof settings !== 'undefined' && settings.globeSize) ? settings.globeSize : (globeData.radius || 45);
    var ringColor = this._heartRingColor || '#b8a878';
    var bgColor = this._heartBgColor || '#000000';

    // Parse ring color for glow
    var ringRgb = this.parseColor(ringColor);
    var glowColor = ringRgb ? 'rgba(' + ringRgb.r + ',' + ringRgb.g + ',' + ringRgb.b + ',' : 'rgba(184, 168, 120, ';

    // Outer glow ring (pulses with heartbeat)
    var glowAlpha = 0.15 + pulse * 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius + 8, 0, Math.PI * 2);
    ctx.fillStyle = glowColor + glowAlpha + ')';
    ctx.fill();

    // Background circle (dark center) - toggleable on/off
    if (this._globeBgFill) {
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = bgColor;
        ctx.fill();
    }

    // Inner decorative ring
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius - 5, 0, Math.PI * 2);
    ctx.strokeStyle = glowColor + '0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Outer border ring
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Center content: particle core OR text
    if (this._particleCoreEnabled) {
        this._renderParticleCore(ctx, pulse);
    } else {
        // Globe text - use separate text color if set, supports \n for line breaks
        var textColor = this._magicTextColor || ringColor;
        var fontSize = this._globeTextSize || 16;
        var globeText = this._globeText || 'HoM';
        ctx.fillStyle = textColor;
        ctx.font = 'bold ' + fontSize + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Split by \n for multi-line support
        var lines = globeText.replace(/\\n/g, '\n').split('\n');
        var lineHeight = fontSize * 1.2;
        var totalHeight = (lines.length - 1) * lineHeight;
        var startY = -totalHeight / 2;

        for (var i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], 0, startY + i * lineHeight);
        }
    }

    // 3D Globe particle effect (uses Globe3D module)
    if (this._globeEnabled && typeof Globe3D !== 'undefined') {
        // Use globe color if set, otherwise ring color
        var globeColor = this._globeColor || ringColor;
        Globe3D.setColor(globeColor);
        Globe3D.render(ctx);
    }

    ctx.restore();

    // =====================================================================
    // RENDER LABELS (screen-aligned, do NOT rotate with wheel)
    // =====================================================================
    this.renderLabels(ctx, cx, cy, cos, sin);

    var elapsed = performance.now() - startTime;
    if (elapsed > 16 || this._logNextRender) {
        console.log('[CanvasRenderer] Render:', Math.round(elapsed) + 'ms,', this.nodes.length, 'nodes');
        this._logNextRender = false;
    }
};

CanvasRenderer.renderSchoolDividers = function(ctx) {
    // Check if dividers are enabled
    if (!settings.showSchoolDividers) return;

    // LOD: Skip dividers entirely in MINIMAL tier
    if (this._lodTier === 'minimal') return;

    var schoolNames = Object.keys(this.schools);
    if (schoolNames.length < 2) return;

    var length = settings.dividerLength !== undefined ? settings.dividerLength : 800;
    var fade = (settings.dividerFade !== undefined ? settings.dividerFade : 50) / 100;  // Convert to 0-1
    var lineWidth = settings.dividerSpacing !== undefined ? settings.dividerSpacing : 3;
    var colorMode = settings.dividerColorMode || 'school';
    var customColor = settings.dividerCustomColor || '#ffffff';
    var gd = (state.treeData && state.treeData.globe) || { x: 0, y: 0 };

    // Build cache key from all settings that affect gradients
    var cacheKey = length + '|' + fade + '|' + lineWidth + '|' + colorMode + '|' + customColor + '|' + gd.x + '|' + gd.y + '|' + schoolNames.length;
    for (var ci = 0; ci < schoolNames.length; ci++) {
        var sch = this.schools[schoolNames[ci]];
        cacheKey += '|' + (sch.startAngle || 0);
        if (colorMode === 'school') cacheKey += '|' + this._getSchoolColor(schoolNames[ci]);
    }

    // Rebuild gradient cache if settings changed
    if (this._dividerCacheKey !== cacheKey || !this._cachedDividerGradients) {
        this._dividerCacheKey = cacheKey;
        this._cachedDividerGradients = [];
        var startAlpha = 0.8;
        var endAlpha = startAlpha * (1 - fade);

        for (var i = 0; i < schoolNames.length; i++) {
            var schoolName = schoolNames[i];
            var school = this.schools[schoolName];
            var angle = school.startAngle !== undefined ? school.startAngle : (i * (360 / schoolNames.length) - 90);
            var rad = angle * Math.PI / 180;

            var color;
            if (colorMode === 'custom') {
                color = customColor;
            } else {
                color = this._getSchoolColor(schoolName) || '#ffffff';
            }

            var endX = gd.x + Math.cos(rad) * length;
            var endY = gd.y + Math.sin(rad) * length;
            var gradient = ctx.createLinearGradient(gd.x, gd.y, endX, endY);

            var rgb = this._hexToRgb(color);
            gradient.addColorStop(0, 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + startAlpha + ')');
            gradient.addColorStop(0.5, 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + (startAlpha * 0.7 + endAlpha * 0.3) + ')');
            gradient.addColorStop(1, 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + endAlpha + ')');

            this._cachedDividerGradients.push({
                gradient: gradient,
                startX: gd.x, startY: gd.y,
                endX: endX, endY: endY
            });
        }
    }

    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';

    // Draw using cached gradients
    for (var i = 0; i < this._cachedDividerGradients.length; i++) {
        var cached = this._cachedDividerGradients[i];
        ctx.strokeStyle = cached.gradient;
        ctx.beginPath();
        ctx.moveTo(cached.startX, cached.startY);
        ctx.lineTo(cached.endX, cached.endY);
        ctx.stroke();
    }
};

CanvasRenderer._hexToRgb = function(hex) {
    hex = hex.replace('#', '');
    return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
    };
};

CanvasRenderer._hexToRgba = function(hex, alpha) { return hexToRgba(hex, alpha); };

/**
 * Draw an edge path between two points (straight or curved Bezier).
 * Call between ctx.beginPath() and ctx.stroke().
 */
CanvasRenderer._drawEdgePath = function(ctx, x1, y1, x2, y2, curved) {
    ctx.moveTo(x1, y1);
    if (curved) {
        var cpx = (x1 + x2) / 2 + (y2 - y1) * 0.15;
        var cpy = (y1 + y2) / 2 - (x2 - x1) * 0.15;
        ctx.quadraticCurveTo(cpx, cpy, x2, y2);
    } else {
        ctx.lineTo(x2, y2);
    }
};

CanvasRenderer.renderEdges = function(ctx, viewLeft, viewRight, viewTop, viewBottom) {
    var learningPathColor = this._learningPathColor || '#00ffff';
    var hasLearningPaths = this._learningPathNodes instanceof Set && this._learningPathNodes.size > 0;
    var curved = settings.edgeStyle === 'curved';

    // Detect heartbeat for spawning traveling pulses
    var isHeartbeating = false;
    if (hasLearningPaths && this._heartAnimationEnabled) {
        var phasePerSecond = this._heartbeatSpeed * 60;
        var pulseDelay = (this._heartPulseDelay || 2.0) * phasePerSecond;
        var beatDuration = Math.PI;
        var cycleLength = beatDuration + pulseDelay;
        var cyclePos = this._heartbeatPhase % cycleLength;

        // Detect start of heartbeat (rising edge) for learning path particles
        var nowBeating = cyclePos < beatDuration && cyclePos < 0.5;
        if (nowBeating && !this._lastHeartbeatPulse) {
            this._detachGlobeParticleToLearningPath();
        }
        this._lastHeartbeatPulse = nowBeating;
        isHeartbeating = cyclePos < beatDuration;
    }

    // =====================================================================
    // FIRST: Draw lines from CENTER to ROOT NODES
    // =====================================================================
    for (var i = 0; i < this.nodes.length; i++) {
        var node = this.nodes[i];

        // Check if this is a root node ONLY (not tier 1)
        if (!node.isRoot) continue;

        // Skip if hidden school
        if (settings.schoolVisibility && settings.schoolVisibility[node.school] === false) continue;

        // Check if this node is on a learning path
        var isOnLearningPath = this._learningPathNodes instanceof Set &&
                               this._learningPathNodes.has(node.id);

        // During animation, hide ONLY the nodes in the currently animating path
        // (let animation draw that path progressively, but keep other learning paths visible)
        if (isOnLearningPath && this._animatingPathNodes && this._animatingPathNodes.has(node.id)) {
            isOnLearningPath = false;  // Hide - animation will draw this
        }

        // Draw if unlocked OR if on a learning path (after animation)
        if (node.state !== 'unlocked' && !isOnLearningPath) continue;

        // Check if this root is on the selected path
        var isRootOnSelectedPath = this._selectedPathNodes && this._selectedPathNodes.has(node.id);
        var hasSelectedPath = this._selectedPathEdges && this._selectedPathEdges.size > 0;
        var showSelectionPathRoot = settings.showSelectionPath !== false;

        // Draw line from globe center to root node
        var gd = (state.treeData && state.treeData.globe) || { x: 0, y: 0 };
        ctx.beginPath();
        ctx.moveTo(gd.x, gd.y);
        ctx.lineTo(node.x, node.y);

        if (isOnLearningPath) {
            // Glowing learning path style - static, pulses travel along it
            ctx.strokeStyle = learningPathColor;
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.7;
        } else if (isRootOnSelectedPath && showSelectionPathRoot) {
            // Root is on selected path - WHITE highlight (if enabled)
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.45;
        } else {
            // Normal unlocked root line - always visible regardless of selection
            ctx.strokeStyle = this._getSchoolColor(node.school);
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.4;
        }
        ctx.stroke();
    }

    // =====================================================================
    // SECOND: Draw regular edges (3-pass for z-order)
    // Pass 1: Dim/normal edges (bottom)
    // Pass 2: Selected path edges (WHITE, middle)
    // Pass 3: Learning path edges (top)
    // =====================================================================
    var hasSelectedPath = this._selectedPathEdges && this._selectedPathEdges.size > 0;
    var self = this;

    // Helper to check visibility and culling
    function shouldDrawEdge(edge) {
        var fromNode = self._nodeMap.get(edge.from);
        var toNode = self._nodeMap.get(edge.to);
        if (!fromNode || !toNode) return null;

        // Discovery mode: skip if either node not visible
        if (self._discoveryVisibleIds && !(typeof EditMode !== 'undefined' && EditMode.isActive)) {
            var fromVisible = self._discoveryVisibleIds.has(edge.from) || self._discoveryVisibleIds.has(fromNode.id);
            var toVisible = self._discoveryVisibleIds.has(edge.to) || self._discoveryVisibleIds.has(toNode.id);
            if (!fromVisible || !toVisible) return null;
        }

        // Viewport culling
        var minX = Math.min(fromNode.x, toNode.x);
        var maxX = Math.max(fromNode.x, toNode.x);
        var minY = Math.min(fromNode.y, toNode.y);
        var maxY = Math.max(fromNode.y, toNode.y);
        if (maxX < viewLeft || minX > viewRight || maxY < viewTop || minY > viewBottom) {
            return null;
        }

        return { fromNode: fromNode, toNode: toNode };
    }

    // === PASS 1: Dim/normal edges (background) ===
    // LOD: Skip entirely in MINIMAL (biggest edge savings)
    if (this._lodTier !== 'minimal') {
    // Check if base connections should be shown (setting)
    var showBaseConnections = settings.showBaseConnections !== false;
    var lodSimple = this._lodTier === 'simple';

    ctx.lineWidth = 1;
    for (var i = 0; i < this.edges.length; i++) {
        var edge = this.edges[i];
        var nodes = shouldDrawEdge(edge);
        if (!nodes) continue;

        var fromNode = nodes.fromNode;
        var toNode = nodes.toNode;
        var edgeKey = edge.from + '->' + edge.to;
        var isOnSelectedPath = this._selectedPathEdges && this._selectedPathEdges.has(edgeKey);
        var fromOnPath = hasLearningPaths && this._learningPathNodes.has(fromNode.id);
        var toOnPath = hasLearningPaths && this._learningPathNodes.has(toNode.id);
        var isLearningEdge = fromOnPath && toOnPath;

        // Skip selected and learning edges - they go in later passes
        if (isOnSelectedPath || isLearningEdge) continue;

        var bothUnlocked = fromNode.state === 'unlocked' && toNode.state === 'unlocked';

        // LOD SIMPLE: skip edges where neither node is unlocked
        if (lodSimple && !bothUnlocked) continue;

        // Unlocked connections always show; base connections respect setting
        if (!bothUnlocked && !showBaseConnections) continue;

        // Only dim when selection path highlighting is enabled
        var showSelectionPathDim = settings.showSelectionPath !== false;

        if (hasSelectedPath && showSelectionPathDim) {
            // Node selected but this edge NOT on path - dim heavily
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.08;
        } else if (bothUnlocked) {
            // Unlocked connections always visible at full opacity
            ctx.strokeStyle = this._getSchoolColor(fromNode.school);
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.5;
        } else {
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.15;
        }

        ctx.beginPath();
        this._drawEdgePath(ctx, fromNode.x, fromNode.y, toNode.x, toNode.y, curved);
        ctx.stroke();
    }
    } // end LOD skip for MINIMAL

    // === PASS 2: Selected path edges (WHITE, middle layer) ===
    // LOD: Skip in MINIMAL tier
    // Only draw if selection path highlighting is enabled
    var showSelectionPath = settings.showSelectionPath !== false;

    if (this._lodTier !== 'minimal' && hasSelectedPath && showSelectionPath) {
        for (var i = 0; i < this.edges.length; i++) {
            var edge = this.edges[i];
            var nodes = shouldDrawEdge(edge);
            if (!nodes) continue;

            var edgeKey = edge.from + '->' + edge.to;
            if (!this._selectedPathEdges.has(edgeKey)) continue;

            // Don't draw over learning edges - they get their own pass
            var fromOnPath = hasLearningPaths && this._learningPathNodes.has(nodes.fromNode.id);
            var toOnPath = hasLearningPaths && this._learningPathNodes.has(nodes.toNode.id);
            if (fromOnPath && toOnPath) continue;

            ctx.strokeStyle = '#555555';  // Gray highlight (not pure white)
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.5;

            ctx.beginPath();
            this._drawEdgePath(ctx, nodes.fromNode.x, nodes.fromNode.y, nodes.toNode.x, nodes.toNode.y, curved);
            ctx.stroke();
        }
    }

    // === PASS 3: Learning path edges (top layer) ===
    if (hasLearningPaths) {
        for (var i = 0; i < this.edges.length; i++) {
            var edge = this.edges[i];
            var nodes = shouldDrawEdge(edge);
            if (!nodes) continue;

            var fromNode = nodes.fromNode;
            var toNode = nodes.toNode;
            var fromOnPath = this._learningPathNodes.has(fromNode.id);
            var toOnPath = this._learningPathNodes.has(toNode.id);

            if (!fromOnPath || !toOnPath) continue;

            // Skip if animating
            if (this._animatingPathNodes) {
                if (this._animatingPathNodes.has(fromNode.id) && this._animatingPathNodes.has(toNode.id)) {
                    continue;
                }
            }

            var toLearning = toNode.state === 'learning';
            ctx.strokeStyle = learningPathColor;
            ctx.lineWidth = toLearning ? 3 : 2;
            ctx.globalAlpha = 0.7;

            ctx.beginPath();
            this._drawEdgePath(ctx, fromNode.x, fromNode.y, toNode.x, toNode.y, curved);
            ctx.stroke();
        }
    }

    // === PASS 4: Chain edges for hardPrereqs on selected node ===
    // LOD: Skip in MINIMAL and SIMPLE tiers (chains are expensive + low visibility)
    if (this._lodTier === 'full' && this.selectedNode && this.selectedNode.hardPrereqs && this.selectedNode.hardPrereqs.length > 0) {
        var selNode = this.selectedNode;

        for (var li = 0; li < selNode.hardPrereqs.length; li++) {
            var hpId = selNode.hardPrereqs[li];
            var hpNode = this._nodeMap ? this._nodeMap.get(hpId) : null;
            if (!hpNode) continue;

            // Chain goes FROM hardPrereq TO selected node
            var fromNode = hpNode;
            var toNode = selNode;

            // Viewport culling
            if (fromNode.x < viewLeft && toNode.x < viewLeft) continue;
            if (fromNode.x > viewRight && toNode.x > viewRight) continue;
            if (fromNode.y < viewTop && toNode.y < viewTop) continue;
            if (fromNode.y > viewBottom && toNode.y > viewBottom) continue;

            var dx = toNode.x - fromNode.x;
            var dy = toNode.y - fromNode.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 1) continue;

            // Chain-link parameters
            var linkW = 5;       // Link width (along chain)
            var linkH = 3.2;     // Link height (perpendicular)
            var linkSpacing = linkW * 1.15; // Center-to-center distance
            var numLinks = Math.max(3, Math.round(dist / linkSpacing));
            var angle = Math.atan2(dy, dx);

            // Lazy-create chain link sprite (once, ~12x10px offscreen canvas)
            if (!this._chainSprite) {
                var linkThick = 1.8;
                var pad = Math.ceil(linkThick) + 1;
                var sprW = Math.ceil(linkW + pad * 2); if (sprW % 2 !== 0) sprW++;
                var sprH = Math.ceil(linkH + pad * 2); if (sprH % 2 !== 0) sprH++;
                var sc = document.createElement('canvas'); sc.width = sprW; sc.height = sprH;
                var sctx = sc.getContext('2d');
                var scx = sprW / 2, scy = sprH / 2;
                var hw = linkW * 0.5, hh = linkH * 0.5, cr = Math.min(hw, hh) * 0.8;
                sctx.beginPath();
                sctx.moveTo(scx-hw+cr, scy-hh); sctx.lineTo(scx+hw-cr, scy-hh);
                sctx.arcTo(scx+hw, scy-hh, scx+hw, scy-hh+cr, cr); sctx.lineTo(scx+hw, scy+hh-cr);
                sctx.arcTo(scx+hw, scy+hh, scx+hw-cr, scy+hh, cr); sctx.lineTo(scx-hw+cr, scy+hh);
                sctx.arcTo(scx-hw, scy+hh, scx-hw, scy+hh-cr, cr); sctx.lineTo(scx-hw, scy-hh+cr);
                sctx.arcTo(scx-hw, scy-hh, scx-hw+cr, scy-hh, cr); sctx.closePath();
                sctx.fillStyle = 'rgba(130, 130, 140, 0.6)';
                sctx.strokeStyle = 'rgba(80, 80, 90, 0.9)';
                sctx.lineWidth = linkThick; sctx.fill(); sctx.stroke();
                var ihw = hw * 0.45, ihh = hh * 0.35, ir = Math.min(ihw, ihh) * 0.6;
                sctx.beginPath();
                sctx.moveTo(scx-ihw+ir, scy-ihh); sctx.lineTo(scx+ihw-ir, scy-ihh);
                sctx.arcTo(scx+ihw, scy-ihh, scx+ihw, scy-ihh+ir, ir); sctx.lineTo(scx+ihw, scy+ihh-ir);
                sctx.arcTo(scx+ihw, scy+ihh, scx+ihw-ir, scy+ihh, ir); sctx.lineTo(scx-ihw+ir, scy+ihh);
                sctx.arcTo(scx-ihw, scy+ihh, scx-ihw, scy+ihh-ir, ir); sctx.lineTo(scx-ihw, scy-ihh+ir);
                sctx.arcTo(scx-ihw, scy-ihh, scx-ihw+ir, scy-ihh, ir); sctx.closePath();
                sctx.fillStyle = 'rgba(20, 20, 30, 0.7)'; sctx.fill();
                this._chainSprite = sc;
            }
            var spr = this._chainSprite;
            var sprHW = spr.width / 2, sprHH = spr.height / 2;

            ctx.globalAlpha = 0.8;

            // Draw chain links using pre-rendered sprite
            for (var cl = 0; cl < numLinks; cl++) {
                var t = (cl + 0.5) / numLinks;
                var cx = fromNode.x + dx * t;
                var cy = fromNode.y + dy * t;

                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(angle);
                if (cl % 2 !== 0) ctx.rotate(Math.PI / 2);
                ctx.drawImage(spr, -sprHW, -sprHH);
                ctx.restore();
            }
        }
    }

    ctx.globalAlpha = 1.0;
};
