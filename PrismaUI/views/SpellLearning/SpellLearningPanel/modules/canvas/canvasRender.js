/**
 * CanvasRenderer Render - Main rendering pipeline
 * Adds render loop and main render method (background, hub, nodes, labels).
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
