/**
 * Globe3D Module - 3D particle sphere effect for central hub
 *
 * Renders a rotating sphere of particles using 2D Canvas API.
 * Core: init, projection, lifecycle, render, configure, heartbeat.
 *
 * Depends on: colorUtils.js
 */

var Globe3D = {
    // Particle data
    particles: null,

    // Rotation state (single value for smooth rotation)
    rotation: 0,

    // Configuration
    enabled: true,
    particleCount: 200,       // More particles for denser look
    radius: 30,               // Globe radius
    dotSizeMin: 1,            // Minimum dot size
    dotSizeMax: 3,            // Maximum dot size
    fieldOfView: 80,          // Perspective field of view
    globeCenterZ: -30,        // Globe center behind camera (creates wrap effect)
    rotationSpeed: 0.008,     // Single rotation speed

    // Color (will be updated from renderer settings)
    color: { r: 184, g: 168, b: 120 },

    // Orbiting stars with trails (disabled by default)
    orbitingStarsEnabled: false,
    orbitingStars: [],
    orbitRadius: 42,
    orbitTrailLength: 12,
    starSpawnTimer: 0,

    // Detached particles traveling along paths
    detachedParticles: [],
    particleRegenerationQueue: [],
    trailEnabled: true,  // Whether to show particle trail

    /**
     * Initialize globe particles with random spherical distribution
     */
    init: function() {
        this.particles = [];
        var count = this.particleCount;
        var radius = this.radius;
        var centerZ = this.globeCenterZ;
        var sizeMin = this.dotSizeMin || 1;
        var sizeMax = this.dotSizeMax || 3;
        var sizeRange = sizeMax - sizeMin;

        for (var i = 0; i < count; i++) {
            // Random spherical distribution (uniform on sphere surface)
            var theta = Math.random() * 2 * Math.PI;           // Random [0, 2PI]
            var phi = Math.acos((Math.random() * 2) - 1);      // Random [-1, 1] -> uniform on sphere

            // Calculate 3D coordinates
            var x = radius * Math.sin(phi) * Math.cos(theta);
            var y = radius * Math.sin(phi) * Math.sin(theta);
            var z = (radius * Math.cos(phi)) + centerZ;

            // Random size within range
            var particleSize = sizeMin + Math.random() * sizeRange;

            this.particles.push({
                // Base 3D position (before rotation)
                baseX: x,
                baseY: y,
                baseZ: z,
                // Current 3D position (after rotation)
                x: x,
                y: y,
                z: z,
                // 2D projected coords
                projX: 0,
                projY: 0,
                projScale: 1,
                // Visual properties
                size: particleSize,
                currentSize: particleSize,
                alpha: 0.7 + Math.random() * 0.3,
                // Lifecycle
                phase: 'hold',
                phaseTimer: Math.floor(Math.random() * 120),
                holdDuration: 60 + Math.floor(Math.random() * 100),
                baseAlpha: 0.6 + Math.random() * 0.4,
                // Surface drift
                driftTheta: 0,
                driftPhi: 0,
                driftSpeedTheta: (Math.random() - 0.5) * 0.002,
                driftSpeedPhi: (Math.random() - 0.5) * 0.002,
                // Heartbeat scatter
                scatterOffset: 0,
                scatterVelocity: 0
            });
        }

        console.log('[Globe3D] Initialized with', count, 'particles, size range:', sizeMin, '-', sizeMax);
    },

    /**
     * Set color from hex string
     */
    setColor: function(hex) {
        if (!hex) return;
        var rgb = ColorUtils.parse(hex);
        if (rgb) {
            this.color = rgb;
        }
    },

    /**
     * Project all particles from 3D to 2D based on current rotation
     * Uses improved projection math for better depth effect
     */
    project: function() {
        if (!this.particles) return;

        var fov = this.fieldOfView;
        var centerZ = this.globeCenterZ;
        var sin = Math.sin(this.rotation);
        var cos = Math.cos(this.rotation);
        var minScale = Infinity;
        var maxScale = -Infinity;

        for (var i = 0; i < this.particles.length; i++) {
            var p = this.particles[i];

            // Apply drift + scatter to get effective position
            var effectiveRadius = this.radius + p.scatterOffset;
            var origR = Math.sqrt(p.baseX * p.baseX + p.baseY * p.baseY);
            var origTheta = Math.atan2(p.baseY, p.baseX);
            var origPhi = Math.atan2(origR, p.baseZ - centerZ);

            var theta = origTheta + p.driftTheta;
            var phi = origPhi + p.driftPhi;

            var driftX = effectiveRadius * Math.sin(phi) * Math.cos(theta);
            var driftY = effectiveRadius * Math.sin(phi) * Math.sin(theta);
            var driftZ = (effectiveRadius * Math.cos(phi)) + centerZ;

            // Rotate around Y axis (relative to globe center)
            var rotX = cos * driftX + sin * (driftZ - centerZ);
            var rotZ = -sin * driftX + cos * (driftZ - centerZ) + centerZ;

            // Perspective projection with field of view
            var scale = fov / (fov - rotZ);

            p.x = rotX;
            p.y = driftY;
            p.z = rotZ;
            p.projX = rotX * scale;
            p.projY = driftY * scale;
            p.projScale = scale;

            if (scale < minScale) minScale = scale;
            if (scale > maxScale) maxScale = scale;
        }

        // Store for depth-based rendering
        this._minScale = minScale;
        this._maxScale = maxScale;

        // Depth sort (back to front)
        this.particles.sort(function(a, b) {
            return a.z - b.z;
        });
    },

    /**
     * Update rotation (call each frame)
     */
    update: function() {
        this.rotation += this.rotationSpeed;

        // Update particle lifecycles (attack/hold/decay/dead + drift + scatter)
        this._updateLifecycles();

        // Update orbiting stars
        this._updateOrbitingStars();

        // Update detached particles
        this._updateDetachedParticles();
    },

    /**
     * Update particle lifecycles (attack/hold/decay/dead phases)
     */
    _updateLifecycles: function() {
        if (!this.particles) return;

        for (var i = 0; i < this.particles.length; i++) {
            var p = this.particles[i];
            if (p.regenerating) continue;

            p.phaseTimer++;

            // Drift: slowly wander on sphere surface
            p.driftTheta += p.driftSpeedTheta;
            p.driftPhi += p.driftSpeedPhi;

            // Heartbeat scatter: apply velocity then decay back to sphere
            if (p.scatterVelocity > 0.1 || p.scatterOffset > 0.1) {
                p.scatterOffset += p.scatterVelocity;
                p.scatterVelocity *= 0.92;
                p.scatterOffset *= 0.95;
            } else {
                p.scatterOffset = 0;
                p.scatterVelocity = 0;
            }

            switch (p.phase) {
                case 'attack':
                    var tA = Math.min(1, p.phaseTimer / 20);
                    p.alpha = p.baseAlpha * tA;
                    p.currentSize = p.size * tA;
                    if (tA >= 1) { p.phase = 'hold'; p.phaseTimer = 0; }
                    break;

                case 'hold':
                    p.alpha = p.baseAlpha * (0.9 + 0.1 * Math.sin(p.phaseTimer * 0.15));
                    p.currentSize = p.size;
                    if (p.phaseTimer >= p.holdDuration) { p.phase = 'decay'; p.phaseTimer = 0; }
                    break;

                case 'decay':
                    var tD = Math.min(1, p.phaseTimer / 30);
                    p.alpha = p.baseAlpha * (1 - tD);
                    p.currentSize = p.size * (1 - tD * 0.5);
                    if (tD >= 1) { p.phase = 'dead'; }
                    break;

                case 'dead':
                    var theta = Math.random() * 2 * Math.PI;
                    var phi = Math.acos((Math.random() * 2) - 1);
                    p.baseX = this.radius * Math.sin(phi) * Math.cos(theta);
                    p.baseY = this.radius * Math.sin(phi) * Math.sin(theta);
                    p.baseZ = (this.radius * Math.cos(phi)) + this.globeCenterZ;
                    p.holdDuration = 60 + Math.floor(Math.random() * 100);
                    p.driftTheta = 0;
                    p.driftPhi = 0;
                    p.driftSpeedTheta = (Math.random() - 0.5) * 0.002;
                    p.driftSpeedPhi = (Math.random() - 0.5) * 0.002;
                    p.phase = 'attack';
                    p.phaseTimer = 0;
                    break;
            }
        }
    },

    /**
     * Render the globe particles
     * @param {CanvasRenderingContext2D} ctx - Canvas context (should be at center position)
     */
    render: function(ctx) {
        if (!this.enabled || !this.particles) return;

        // Update rotation and project
        this.update();
        this.project();

        var rgb = this.color;
        var centerZ = this.globeCenterZ;
        var radius = this.radius;
        var minScale = this._minScale || 0.5;
        var maxScale = this._maxScale || 1.5;
        var scaleRange = maxScale - minScale;
        if (scaleRange < 0.01) scaleRange = 1;

        // Frontmost particles get radial gradient glow (capped for performance)
        var glowStart = Math.max(0, this.particles.length - 18);

        // Draw particles (sorted back to front)
        for (var i = 0; i < this.particles.length; i++) {
            var p = this.particles[i];

            // Skip regenerating particles that are too small
            if (p.regenerating && p.size < 0.5) continue;

            // Depth factor: 0 (far back) to 1 (closest)
            var depthNorm = (p.projScale - minScale) / scaleRange;
            if (depthNorm < 0) depthNorm = 0;
            if (depthNorm > 1) depthNorm = 1;

            // Fresnel: edge particles brighter, center particles dimmer
            // Surface normal Z component vs camera view direction (0,0,-1)
            var normalZ = (p.z - centerZ) / radius;
            if (normalZ > 1) normalZ = 1;
            if (normalZ < -1) normalZ = -1;
            var fresnel = 1 - Math.abs(normalZ);  // 0 at front/back poles, 1 at silhouette edge
            var fresnelFactor = 0.35 + 0.65 * fresnel;  // 0.35 center, 1.0 edge

            // Size with projection, using lifecycle currentSize
            var size = (p.currentSize || p.size) * p.projScale;

            // Alpha: combine depth, lifecycle, and fresnel
            var alpha = p.alpha * (0.15 + 0.85 * depthNorm) * fresnelFactor;
            if (alpha > 1) alpha = 1;

            if (i >= glowStart && size > 1.5) {
                // Radial gradient glow for frontmost particles
                var glowRadius = size * 2.5;
                var grad = ctx.createRadialGradient(p.projX, p.projY, 0, p.projX, p.projY, glowRadius);
                grad.addColorStop(0, 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + (alpha * 0.9).toFixed(2) + ')');
                grad.addColorStop(0.4, 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + (alpha * 0.4).toFixed(2) + ')');
                grad.addColorStop(1, 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0)');
                ctx.beginPath();
                ctx.arc(p.projX, p.projY, glowRadius, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();
            } else {
                // Simple fill for back/mid particles
                ctx.beginPath();
                ctx.arc(p.projX, p.projY, Math.max(0.5, size), 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha.toFixed(2) + ')';
                ctx.fill();
            }
        }

        // Draw orbiting stars on top (if enabled)
        this._renderOrbitingStars(ctx);

        // NOTE: Detached particles are rendered separately by canvasRenderer
        // in the wheel's rotated context (not here in the hub's context)
    },

    /**
     * Configure globe settings
     */
    configure: function(options) {
        if (!options) return;

        if (options.enabled !== undefined) this.enabled = options.enabled;
        if (options.particleCount !== undefined) {
            this.particleCount = options.particleCount;
            this.init();  // Reinitialize with new count
        }
        if (options.radius !== undefined) {
            this.radius = options.radius;
            this.globeCenterZ = -options.radius;  // Keep center behind camera
        }
        if (options.fieldOfView !== undefined) this.fieldOfView = options.fieldOfView;
        if (options.dotRadius !== undefined) this.dotRadius = options.dotRadius;
        if (options.rotationSpeed !== undefined) this.rotationSpeed = options.rotationSpeed;
        if (options.color) this.setColor(options.color);
    },

    /**
     * Clear all detached particles (call when learning target changes)
     */
    clearDetachedParticles: function() {
        this.detachedParticles = [];
        console.log('[Globe3D] Cleared detached particles');
    },

    /**
     * React to heartbeat — scatter particles outward
     * @param {number} intensity - Beat intensity 0-1 (typically 1.0)
     */
    onHeartbeat: function(intensity) {
        if (!this.particles) return;

        var baseForce = 3.0 + (intensity || 1.0) * 5.0;
        var minScale = this._minScale || 0.5;
        var maxScale = this._maxScale || 1.5;
        var scaleRange = maxScale - minScale;
        if (scaleRange < 0.01) scaleRange = 1;

        for (var i = 0; i < this.particles.length; i++) {
            var p = this.particles[i];
            if (p.regenerating) continue;

            // Depth factor: front particles (high projScale) scatter more,
            // back particles scatter less — mimics perspective amplification
            var depthFactor = (p.projScale - minScale) / scaleRange;
            depthFactor = 0.2 + depthFactor * 0.8;  // Range 0.2 (back) to 1.0 (front)

            // Wide random variation so particles don't move in unison
            var reactivity = 0.15 + Math.random() * 0.85;

            p.scatterVelocity += baseForce * depthFactor * reactivity;
        }
    }
};

// Auto-initialize
Globe3D.init();

window.Globe3D = Globe3D;
