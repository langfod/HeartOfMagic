/**
 * CanvasRenderer Node Helpers -- Color utilities, particle core, and parseColor.
 * Thin wrappers around ColorUtils, particle initialization/rendering for the
 * canvas center core, and color parsing.
 *
 * Loaded after: canvasNodes.js
 */

// =========================================================================
// COLOR UTILITIES
// =========================================================================

CanvasRenderer.dimColor = function(color, factor) {
    return ColorUtils.dim(color, factor);
};

CanvasRenderer.brightenColor = function(color, factor) {
    return ColorUtils.brighten(color, factor);
};

CanvasRenderer.blendColors = function(color1, color2, t) {
    return ColorUtils.blend(color1, color2, t);
};

CanvasRenderer.getInnerAccentColor = function(color) {
    return ColorUtils.innerAccent(color);
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
    return ColorUtils.parse(color);
};
