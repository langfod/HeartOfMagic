/**
 * CanvasRenderer Nodes - Node rendering, labels, color utilities, and particles
 * Adds node drawing methods at various LOD levels, label rendering,
 * color helpers, debug grid, and particle core.
 *
 * Loaded after: canvasCore.js, canvasRender.js
 */

/**
 * Minimal node rendering - batched fillRect dots grouped by school+state.
 * ~15 style changes + N fillRect calls instead of 8-18 canvas API calls per node.
 */
CanvasRenderer.renderNodesMinimal = function(ctx, viewLeft, viewRight, viewTop, viewBottom) {
    if (!this._nodeBuckets) return;

    var isEditActive = typeof EditMode !== 'undefined' && EditMode.isActive;
    var hasDiscovery = this._discoveryVisibleIds && !isEditActive;
    var schoolVis = settings.schoolVisibility;

    var bucketKeys = Object.keys(this._nodeBuckets);
    for (var b = 0; b < bucketKeys.length; b++) {
        var key = bucketKeys[b];
        var parts = key.split('|');
        var bucketSchool = parts[0];
        var bucketState = parts[1];
        var bucket = this._nodeBuckets[key];
        if (bucket.length === 0) continue;

        // Skip hidden schools
        if (schoolVis && schoolVis[bucketSchool] === false) continue;

        // Determine dot size and alpha by state
        var dotSize, alpha;
        if (bucketState === 'unlocked') {
            dotSize = 4; alpha = 1.0;
        } else if (bucketState === 'available' || bucketState === 'learning') {
            dotSize = 3; alpha = 0.8;
        } else {
            dotSize = 2; alpha = 0.4;
        }

        // Set style once per bucket
        var color = bucket[0]._cachedSchoolColor || this._getSchoolColor(bucketSchool);
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;

        var halfDot = dotSize / 2;

        for (var i = 0; i < bucket.length; i++) {
            var node = bucket[i];

            // Viewport culling
            if (node.x < viewLeft || node.x > viewRight || node.y < viewTop || node.y > viewBottom) continue;

            // Discovery visibility
            if (hasDiscovery) {
                if (!this._discoveryVisibleIds.has(node.id) && !this._discoveryVisibleIds.has(node.formId)) continue;
            }

            ctx.fillRect(node.x - halfDot, node.y - halfDot, dotSize, dotSize);
        }
    }

    // Render selected/hovered node as larger highlighted dot on top
    var highlight = this.selectedNode || this.hoveredNode;
    if (highlight) {
        var hColor = highlight._cachedSchoolColor || this._getSchoolColor(highlight.school);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 1.0;
        ctx.fillRect(highlight.x - 5, highlight.y - 5, 10, 10);
        ctx.fillStyle = hColor;
        ctx.fillRect(highlight.x - 3, highlight.y - 3, 6, 6);
    }

    ctx.globalAlpha = 1.0;
};

/**
 * Simple node rendering - shapes without rotation, lock overlays, or inner accents.
 * Still uses Path2D + save/translate/scale/fill/stroke/restore but skips atan2/rotate.
 */
CanvasRenderer.renderNodesSimple = function(ctx, viewLeft, viewRight, viewTop, viewBottom) {
    var isEditActive = typeof EditMode !== 'undefined' && EditMode.isActive;
    var hasDiscovery = this._discoveryVisibleIds && !isEditActive;
    var learningPathColor = this._learningPathColor || '#00ffff';

    for (var i = 0; i < this.nodes.length; i++) {
        var node = this.nodes[i];

        // Viewport culling
        if (node.x < viewLeft || node.x > viewRight || node.y < viewTop || node.y > viewBottom) continue;

        // Skip hidden schools
        if (settings.schoolVisibility && settings.schoolVisibility[node.school] === false) continue;

        // Discovery mode visibility
        if (hasDiscovery) {
            if (!this._discoveryVisibleIds.has(node.id) && !this._discoveryVisibleIds.has(node.formId)) continue;
            if (node.state === 'locked') {
                // Simplified mystery node - just a dim dot
                var dimColor = node._cachedSchoolColor || this._getSchoolColor(node.school);
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = dimColor;
                ctx.fillRect(node.x - 3, node.y - 3, 6, 6);
                continue;
            }
        }

        var schoolColor = node._cachedSchoolColor || this._getSchoolColor(node.school);
        var isSelected = this.selectedNode && this.selectedNode.id === node.id;
        var isHovered = this.hoveredNode && this.hoveredNode.id === node.id;
        var path = this._getShapePath(node.school);
        var isLearning = node.state === 'learning';

        var size, fillColor, strokeColor, strokeWidth, alpha;

        if (node.state === 'unlocked') {
            size = 12; fillColor = schoolColor; strokeColor = schoolColor;
            strokeWidth = 1.5; alpha = 1.0;
        } else if (isLearning) {
            size = 12; fillColor = learningPathColor; strokeColor = learningPathColor;
            strokeWidth = 1.5; alpha = 1.0;
        } else if (node.state === 'available') {
            size = 9; fillColor = '#1a1a2e'; strokeColor = schoolColor;
            strokeWidth = 1; alpha = 0.8;
        } else {
            size = 7; fillColor = '#1a1a2e'; strokeColor = schoolColor;
            strokeWidth = 1; alpha = 0.4;
        }

        if (isSelected || isHovered) {
            size += 1.5; strokeColor = '#fff'; strokeWidth = 1.5; alpha = 1.0;
        }

        ctx.save();
        ctx.translate(node.x, node.y);
        // NO rotation — skip atan2 + rotate (main LOD saving)
        ctx.scale(size, size);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth / size;
        ctx.fill(path);
        ctx.stroke(path);
        ctx.restore();
    }
    ctx.globalAlpha = 1.0;
};

CanvasRenderer.renderNodes = function(ctx, viewLeft, viewRight, viewTop, viewBottom) {
    // LOD dispatch
    if (this._lodTier === 'minimal') {
        this.renderNodesMinimal(ctx, viewLeft, viewRight, viewTop, viewBottom);
        return;
    }
    if (this._lodTier === 'simple') {
        this.renderNodesSimple(ctx, viewLeft, viewRight, viewTop, viewBottom);
        return;
    }

    for (var i = 0; i < this.nodes.length; i++) {
        var node = this.nodes[i];

        // Viewport culling
        if (node.x < viewLeft || node.x > viewRight || node.y < viewTop || node.y > viewBottom) {
            continue;
        }

        // Skip hidden schools
        if (settings.schoolVisibility && settings.schoolVisibility[node.school] === false) {
            continue;
        }

        // Discovery mode visibility (disabled in edit mode - show everything)
        if (this._discoveryVisibleIds && !(typeof EditMode !== 'undefined' && EditMode.isActive)) {
            if (!this._discoveryVisibleIds.has(node.id) && !this._discoveryVisibleIds.has(node.formId)) {
                continue;
            }

            // Show locked nodes as mystery
            if (node.state === 'locked') {
                this.renderMysteryNode(ctx, node);
                continue;
            }
        }

        this.renderNode(ctx, node);
    }
};

CanvasRenderer.renderMysteryNode = function(ctx, node) {
    var color = this._getSchoolColor(node.school);
    var dimmedColor = this.dimColor(color, 0.4);
    var size = 8;
    var path = this._getShapePath(node.school);

    ctx.save();
    ctx.translate(node.x, node.y);

    // Rotate all shapes so flat edge faces toward center (tangent to central circle)
    var angleToCenter = Math.atan2(node.y, node.x);
    var rotationOffset = 0;

    switch (node.school) {
        case 'Destruction':  // Diamond (4 sides)
            rotationOffset = Math.PI / 4;
            break;
        case 'Alteration':   // Hexagon (6 sides)
            rotationOffset = Math.PI / 6;
            break;
        case 'Conjuration':  // Pentagon (5 sides) - tip points toward center
            rotationOffset = Math.PI / 2;
            break;
        case 'Illusion':     // Triangle (3 sides)
            rotationOffset = Math.PI / 2;
            break;
    }

    if (rotationOffset !== 0) {
        ctx.rotate(angleToCenter + rotationOffset);
    }

    ctx.scale(size, size);

    ctx.fillStyle = 'rgba(20, 20, 30, 0.9)';
    ctx.strokeStyle = dimmedColor;
    ctx.lineWidth = 1 / size;
    ctx.globalAlpha = 0.6;

    ctx.fill(path);
    ctx.stroke(path);

    ctx.restore();

    // Draw "?" - counter-rotate so it stays screen-aligned
    ctx.save();
    ctx.translate(node.x, node.y);

    // Counter-rotate to cancel out the wheel rotation
    var rotRad = this.rotation * Math.PI / 180;
    ctx.rotate(-rotRad);

    ctx.globalAlpha = 0.8;
    ctx.fillStyle = dimmedColor;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, 0);

    ctx.restore();
    ctx.globalAlpha = 1.0;
};

CanvasRenderer.renderNode = function(ctx, node) {
    var schoolColor = node.themeColor || this._getSchoolColor(node.school);
    var isSelected = this.selectedNode && this.selectedNode.id === node.id;
    var isHovered = this.hoveredNode && this.hoveredNode.id === node.id;
    var path = this._getShapePath(node.school);

    var size, fillColor, strokeColor, strokeWidth, alpha;
    var learningPathColor = this._learningPathColor || '#00ffff';
    var ringColor = this._heartRingColor || '#b8a878';  // Gold ring color for outlines
    // Check if on learning path
    var isOnLearningPath = (this._learningPathNodes instanceof Set) &&
                           this._learningPathNodes.has(node.id);
    var isLearning = (node.state === 'learning' || node.state === 'Learning');

    // Check if this node has hard prereqs (locks) - needs gray outline treatment
    var hasLockPrereqs = node.hardPrereqs && node.hardPrereqs.length > 0;

    // During animation, hide learning path styling ONLY for nodes in the animating path
    // (other learning paths remain visible)
    var isBeingAnimated = this._animatingPathNodes && this._animatingPathNodes.has(node.id);
    if (isOnLearningPath && isBeingAnimated) {
        isOnLearningPath = false;  // Hide path styling - animation will draw this
    }

    // If this is the learning node but it's being animated, don't show learning styling yet
    // (show as 'available' until animation completes and reaches this node)
    var showLearningStyle = isLearning && !isBeingAnimated;

    if (node.state === 'unlocked') {
        size = 12;
        fillColor = schoolColor;
        // Use ring color only if on learning path, else school color
        strokeColor = isOnLearningPath ? ringColor : schoolColor;
        strokeWidth = 1.5;
        alpha = 1.0;
    } else if (showLearningStyle) {
        // Learning state - cyan fill, ring color outline (only after animation completes)
        size = 12;  // Same as unlocked
        fillColor = learningPathColor;  // Cyan fill
        strokeColor = ringColor;  // Ring color outline for learning node
        strokeWidth = 1.5;
        alpha = 1.0;
    } else if (node.state === 'available' || (isLearning && isBeingAnimated)) {
        // Available nodes OR learning nodes still being animated (show as available temporarily)
        size = 9;
        fillColor = '#1a1a2e';
        strokeColor = schoolColor;  // Use school/tree color for available nodes
        strokeWidth = 1;
        alpha = 0.8;
    } else {
        size = 7;
        fillColor = '#1a1a2e';
        strokeColor = schoolColor;  // Use school/tree color for locked nodes (dimmed by alpha)
        strokeWidth = 1;
        alpha = 0.4;
    }

    if (isSelected || isHovered) {
        size += 1.5;  // Subtle hover expansion
        strokeColor = '#fff';
        strokeWidth = 1.5;
        alpha = 1.0;
    }

    // Lock visual overrides for nodes with hardPrereqs
    // Not-unlocked: gray fill + small school-colored center hole
    // Unlocked: normal look + gray outline ring
    var lockGrayFill = false;
    var lockGrayOutline = false;
    if (hasLockPrereqs) {
        if (node.state === 'unlocked') {
            lockGrayOutline = true;  // Unlocked but was locked: gray ring persists
        } else {
            lockGrayFill = true;     // Not yet unlocked: gray body + school color hole
        }
    }

    ctx.save();
    ctx.translate(node.x, node.y);

    // Rotate all shapes so flat edge faces toward center (tangent to central circle)
    var angleToCenter = Math.atan2(node.y, node.x);
    var rotationOffset = 0;

    switch (node.school) {
        case 'Destruction':  // Diamond (4 sides) - rotate 45° for flat edge
            rotationOffset = Math.PI / 4;
            break;
        case 'Alteration':   // Hexagon (6 sides) - rotate 30° for flat edge
            rotationOffset = Math.PI / 6;
            break;
        case 'Conjuration':  // Pentagon (5 sides) - rotate 90° so tip points toward center
            rotationOffset = Math.PI / 2;
            break;
        case 'Illusion':     // Triangle (3 sides) - rotate 90° so tip points in
            rotationOffset = Math.PI / 2;
            break;
        // Restoration (circle) needs no rotation
    }

    if (rotationOffset !== 0) {
        ctx.rotate(angleToCenter + rotationOffset);
    }

    if (lockGrayFill) {
        // === LOCKED NODE WITH HARD PREREQS ===
        // Outer: gray filled shape (the "lock shell")
        var outerSize = size + 2;
        ctx.save();
        ctx.scale(outerSize, outerSize);
        ctx.globalAlpha = Math.min(alpha + 0.2, 0.75);
        ctx.fillStyle = 'rgba(90, 90, 100, 0.7)';
        ctx.strokeStyle = 'rgba(140, 140, 155, 0.8)';
        ctx.lineWidth = 1.2 / outerSize;
        ctx.fill(path);
        ctx.stroke(path);
        ctx.restore();

        // Inner: small school-colored center hole
        var holeSize = Math.max(size * 0.45, 3);
        ctx.scale(holeSize, holeSize);
        ctx.globalAlpha = Math.min(alpha + 0.15, 0.65);
        ctx.fillStyle = schoolColor;
        ctx.fill(path);
    } else if (lockGrayOutline) {
        // === UNLOCKED NODE WITH HARD PREREQS ===
        // Gray outline ring behind the normal shape
        var ringSize = size + 3;
        ctx.save();
        ctx.scale(ringSize, ringSize);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = 'rgba(90, 90, 100, 0.25)';
        ctx.strokeStyle = 'rgba(150, 150, 160, 0.7)';
        ctx.lineWidth = 1.5 / ringSize;
        ctx.fill(path);
        ctx.stroke(path);
        ctx.restore();

        // Normal unlocked node on top
        ctx.scale(size, size);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth / size;
        ctx.fill(path);
        ctx.stroke(path);

        // Inner accent
        ctx.scale(0.5, 0.5);
        ctx.fillStyle = this.getInnerAccentColor(schoolColor);
        ctx.fill(path);
    } else {
        // === NORMAL NODE (no lock prereqs) ===
        ctx.scale(size, size);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth / size;
        ctx.fill(path);
        ctx.stroke(path);

        // Draw inner accent for unlocked nodes
        if (node.state === 'unlocked') {
            ctx.scale(0.5, 0.5);
            ctx.fillStyle = this.getInnerAccentColor(schoolColor);
            ctx.fill(path);
        }

        // Draw white center for learning node
        if (isLearning) {
            ctx.scale(0.4, 0.4);
            ctx.fillStyle = '#ffffff';
            ctx.fill(path);
        }
    }

    ctx.restore();
    ctx.globalAlpha = 1.0;
};

/**
 * Render debug grid showing all candidate positions
 * Called within the rotated context
 * Uses ACTUAL school data for alignment
 */
CanvasRenderer.renderDebugGrid = function(ctx) {
    if (!this.showDebugGrid) return;

    var spacing = 50;
    var extent = 1300;

    ctx.fillStyle = 'rgba(184, 168, 120, 0.35)';
    for (var gx = -extent; gx <= extent; gx += spacing) {
        for (var gy = -extent; gy <= extent; gy += spacing) {
            ctx.beginPath();
            ctx.arc(gx, gy, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
};

/**
 * Render the learning path animation (glowing line from center to spell)
 * Called within rotated context
 */
CanvasRenderer.renderLearningPath = function(ctx) {
    if (!this._learningPath) return;

    var lp = this._learningPath;
    var elapsed = performance.now() - lp.startTime;
    var progress = Math.min(elapsed / this._learningPathDuration, 1);

    // Ease-out for smooth arrival
    var easedProgress = 1 - Math.pow(1 - progress, 2);

    var path = lp.path;
    if (path.length < 2) return;

    // Use pre-computed segment lengths (cached in triggerLearningAnimation)
    var segmentLengths = lp.segmentLengths;
    var totalLength = lp.totalLength;

    // How far along the path we are
    var targetLength = totalLength * easedProgress;

    // Draw the glowing path up to the current progress point
    ctx.save();

    // Outer glow
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);

    var drawnLength = 0;
    var lastPoint = path[0];

    for (var i = 1; i < path.length; i++) {
        var segLen = segmentLengths[i-1];

        if (drawnLength + segLen <= targetLength) {
            // Full segment
            ctx.lineTo(path[i].x, path[i].y);
            lastPoint = path[i];
            drawnLength += segLen;
        } else {
            // Partial segment - interpolate
            var remaining = targetLength - drawnLength;
            var t = remaining / segLen;
            var interpX = path[i-1].x + (path[i].x - path[i-1].x) * t;
            var interpY = path[i-1].y + (path[i].y - path[i-1].y) * t;
            ctx.lineTo(interpX, interpY);
            lastPoint = { x: interpX, y: interpY };
            break;
        }
    }

    // Draw line - same style as static learning path
    var learningPathColor = this._learningPathColor || '#00ffff';
    ctx.strokeStyle = learningPathColor;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.restore();

    // Continue animation or end it
    if (progress >= 1) {
        // Animation complete - mark as done so static path can show
        this._learningPathAnimationComplete = true;
        this._animatingPathNodes = null;  // Clear animating nodes - all paths now visible

        // Clear the animation object shortly after completion
        if (elapsed > this._learningPathDuration + 200) {
            this._learningPath = null;
        }
    }

    // Keep rendering while animation is active (throttled)
    if (this._learningPath) {
        this._needsRender = true;
        this._animationOnlyRender = true;
    }
};

/**
 * Render labels - SCREEN ALIGNED (don't rotate with wheel)
 */
CanvasRenderer.renderLabels = function(ctx, cx, cy, cos, sin) {
    if (this.zoom < 0.6) return;  // Show labels at lower zoom too
    if (settings.showNodeNames === false) return;

    var fontSize = settings.nodeFontSize || 10;
    ctx.font = fontSize + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    var labelsDrawn = 0;
    var maxLabels = 150;  // Allow more labels

    for (var i = 0; i < this.nodes.length && labelsDrawn < maxLabels; i++) {
        var node = this.nodes[i];

        // In edit mode: show ALL labels. Otherwise: only unlocked/learning/available
        var isEditActive = typeof EditMode !== 'undefined' && EditMode.isActive;
        if (!isEditActive && node.state !== 'unlocked' && node.state !== 'learning' && node.state !== 'available') continue;
        if (!node.name && !isEditActive) continue;
        if (settings.schoolVisibility && settings.schoolVisibility[node.school] === false) continue;

        // Check if name should be revealed based on XP progress
        var labelText = node.name || node.formId;
        if (!isEditActive && node.state !== 'unlocked' && settings.cheatMode !== true) {
            var _canonId = (typeof getCanonicalFormId === 'function') ? getCanonicalFormId(node) : node.formId;
            var _prog = state.spellProgress ? state.spellProgress[_canonId] : null;
            var _pct = _prog && _prog.required > 0 ? (_prog.xp / _prog.required) * 100 : 0;
            var _threshold = settings.revealName !== undefined ? settings.revealName : 10;
            if (_pct < _threshold && node.state !== 'learning') {
                labelText = '???';
            }
        }

        // Set color based on state
        if (node.state === 'unlocked') {
            ctx.fillStyle = '#fff';
        } else if (node.state === 'learning') {
            // Learning - static cyan text
            ctx.fillStyle = this._learningPathColor || '#00ffff';
        } else if (labelText === '???') {
            // Hidden name - very dim
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        } else {
            // Available/learnable - use dimmer color
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        }

        // Transform node position WITH rotation, but text stays screen-aligned
        var rotatedX = node.x * cos - node.y * sin;
        var rotatedY = node.x * sin + node.y * cos;

        var screenX = rotatedX * this.zoom + this.panX + cx;
        var screenY = rotatedY * this.zoom + this.panY + cy;

        // Viewport check
        if (screenX < -50 || screenX > this._width + 50 || screenY < -50 || screenY > this._height + 50) {
            continue;
        }

        // Draw text at screen position (no rotation)
        ctx.fillText(labelText.substring(0, 12), screenX, screenY + (fontSize + 4) * this.zoom);
        labelsDrawn++;
    }
};

// =========================================================================
// COLOR UTILITIES
// =========================================================================

CanvasRenderer.dimColor = function(color, factor) {
    var rgb = this.parseColor(color);
    if (!rgb) return color;
    return 'rgb(' + Math.round(rgb.r * factor) + ',' +
                    Math.round(rgb.g * factor) + ',' +
                    Math.round(rgb.b * factor) + ')';
};

CanvasRenderer.brightenColor = function(color, factor) {
    var rgb = this.parseColor(color);
    if (!rgb) return color;
    return 'rgb(' + Math.min(255, Math.round(rgb.r + (255 - rgb.r) * (factor - 1))) + ',' +
                    Math.min(255, Math.round(rgb.g + (255 - rgb.g) * (factor - 1))) + ',' +
                    Math.min(255, Math.round(rgb.b + (255 - rgb.b) * (factor - 1))) + ')';
};

CanvasRenderer.blendColors = function(color1, color2, t) {
    var rgb1 = this.parseColor(color1);
    var rgb2 = this.parseColor(color2);
    if (!rgb1 || !rgb2) return color1;
    return 'rgb(' + Math.round(rgb1.r + (rgb2.r - rgb1.r) * t) + ',' +
                    Math.round(rgb1.g + (rgb2.g - rgb1.g) * t) + ',' +
                    Math.round(rgb1.b + (rgb2.b - rgb1.b) * t) + ')';
};

CanvasRenderer.getInnerAccentColor = function(color) {
    var rgb = this.parseColor(color);
    if (!rgb) return '#1a1a2e';
    return 'rgb(' + Math.round(rgb.r * 0.35) + ',' +
                    Math.round(rgb.g * 0.3) + ',' +
                    Math.round(rgb.b * 0.4) + ')';
};

// =========================================================================
// PARTICLE CORE (replaces center text when enabled)
// =========================================================================

CanvasRenderer._initParticleCore = function() {
    this._coreParticles = [];
    var count = 35;
    for (var i = 0; i < count; i++) {
        var r = Math.random() * 8;
        var angle = Math.random() * Math.PI * 2;
        this._coreParticles.push({
            baseX: Math.cos(angle) * r,
            baseY: Math.sin(angle) * r,
            size: 1 + Math.random() * 1.5,
            flashPhase: Math.random() * Math.PI * 2,
            flashSpeed: 0.08 + Math.random() * 0.15,
            jitterAmount: 1.5 + Math.random() * 3
        });
    }
    this._coreFrame = 0;
    this._coreFlashBoost = 0;
};

CanvasRenderer._renderParticleCore = function(ctx, pulse) {
    if (!this._coreParticles) this._initParticleCore();

    this._coreFrame++;

    // Decay heartbeat boost
    if (this._coreFlashBoost > 0.01) {
        this._coreFlashBoost *= 0.9;
    } else {
        this._coreFlashBoost = 0;
    }

    var boost = this._coreFlashBoost || 0;
    var jitterMult = 1 + boost * 3;    // Heartbeat amplifies jitter
    var speedMult = 1 + boost * 2;     // Heartbeat speeds up flash
    var frame = this._coreFrame;

    for (var i = 0; i < this._coreParticles.length; i++) {
        var p = this._coreParticles[i];

        // Vibrate position
        var jx = p.jitterAmount * jitterMult * (Math.random() - 0.5);
        var jy = p.jitterAmount * jitterMult * (Math.random() - 0.5);
        var x = p.baseX + jx;
        var y = p.baseY + jy;

        // Flash between black and white
        var flash = Math.sin(frame * p.flashSpeed * speedMult + p.flashPhase);
        var brightness = Math.round((flash * 0.5 + 0.5) * 255);
        var alpha = 0.6 + Math.abs(flash) * 0.4;

        // Slight size variation
        var size = p.size * (0.8 + Math.random() * 0.4);

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + brightness + ',' + brightness + ',' + brightness + ',' + alpha.toFixed(2) + ')';
        ctx.fill();
    }
};

CanvasRenderer.parseColor = function(color) {
    if (!color) return null;
    if (color.startsWith('#')) {
        return {
            r: parseInt(color.slice(1, 3), 16),
            g: parseInt(color.slice(3, 5), 16),
            b: parseInt(color.slice(5, 7), 16)
        };
    }
    var match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
        return {
            r: parseInt(match[1]),
            g: parseInt(match[2]),
            b: parseInt(match[3])
        };
    }
    return null;
};
