/**
 * Layout Generator Shapes — Shape mask and profile data for layout silhouettes.
 *
 * Loaded before: layoutGenerator.js (or alongside)
 *
 * Defines _LG_SHAPE_MASKS (shape mask functions) and _LG_SHAPE_PROFILES
 * (jitter multiplier profiles) consumed by layoutGenerator.js.
 *
 * Also provides seededRandom() used by the layout generator.
 *
 * Depends on: (none)
 */

// =============================================================================
// SHAPE MASKS - Define silhouettes for each shape
// =============================================================================

var _LG_SHAPE_MASKS = {
    // Always include all positions
    radial: function(tierProgress, angleNorm, rng) { return true; },

    // Natural organic with some randomness
    organic: function(tierProgress, angleNorm, rng) {
        return rng() > 0.15;
    },

    // Spiky rays emanating outward
    spiky: function(tierProgress, angleNorm, rng) {
        var rayCount = 5;
        var rayPhase = angleNorm * rayCount;
        var rayValue = Math.abs(Math.sin(rayPhase * Math.PI));
        var threshold = 0.3 + tierProgress * 0.4;
        return rayValue > threshold || rng() < 0.2;
    },

    // Mountain/triangle peak
    mountain: function(tierProgress, angleNorm, rng) {
        var peakWidth = 1.0 - tierProgress * 0.8;
        var distFromCenter = Math.abs(angleNorm - 0.5) * 2;
        return distFromCenter < peakWidth + rng() * 0.1;
    },

    // Puffy cloud clusters
    cloud: function(tierProgress, angleNorm, rng) {
        var bumpCount = 3;
        var bumpPhase = angleNorm * bumpCount * Math.PI;
        var bumpValue = Math.sin(bumpPhase) * 0.5 + 0.5;
        var cloudEdge = 0.7 + bumpValue * 0.3;
        return tierProgress < cloudEdge + rng() * 0.2;
    },

    // Cascading waterfall tiers
    cascade: function(tierProgress, angleNorm, rng) {
        var tierMod = tierProgress * 4;
        var tierBand = tierMod - Math.floor(tierMod);
        return tierBand > 0.3 || rng() < 0.3;
    },

    // Narrow linear beam
    linear: function(tierProgress, angleNorm, rng) {
        var beamWidth = 0.3;
        var distFromCenter = Math.abs(angleNorm - 0.5) * 2;
        return distFromCenter < beamWidth;
    },

    // Perfect grid
    grid: function(tierProgress, angleNorm, rng) { return true; },

    // Flame/fire shape
    flame: function(tierProgress, angleNorm, rng) {
        var flameWave = Math.sin(angleNorm * Math.PI * 4 + tierProgress * 2) * 0.3;
        var flameEdge = 0.8 - tierProgress * 0.5 + flameWave;
        var dist = Math.abs(angleNorm - 0.5) * 2;
        return dist < flameEdge + rng() * 0.15;
    },

    // Explosion/burst
    explosion: function(tierProgress, angleNorm, rng) {
        var burstCount = 8;
        var burstPhase = angleNorm * burstCount * Math.PI;
        var burstValue = Math.abs(Math.sin(burstPhase));
        return burstValue > 0.4 - tierProgress * 0.2 || tierProgress < 0.3;
    },

    // Lightning bolt
    lightning: function(tierProgress, angleNorm, rng) {
        var boltCenter = 0.5 + Math.sin(tierProgress * Math.PI * 3) * 0.2;
        var boltWidth = 0.25 - tierProgress * 0.1;
        var dist = Math.abs(angleNorm - boltCenter);
        return dist < boltWidth + rng() * 0.1;
    },

    // Castle towers
    castle: function(tierProgress, angleNorm, rng) {
        var towerCount = 3;
        var towerWidth = 0.12;
        var towerPositions = [];
        for (var i = 0; i < towerCount; i++) {
            towerPositions.push((i + 0.5) / towerCount);
        }
        for (var i = 0; i < towerPositions.length; i++) {
            if (Math.abs(angleNorm - towerPositions[i]) < towerWidth) return true;
        }
        return tierProgress < 0.4;
    },

    // Galaxy spiral arms
    galaxy: function(tierProgress, angleNorm, rng) {
        var armCount = 2;
        var spiralTwist = tierProgress * 1.5;
        var armPhase = (angleNorm * armCount + spiralTwist) * Math.PI;
        var armValue = Math.sin(armPhase) * 0.5 + 0.5;
        return armValue > 0.4 || rng() < 0.25;
    },

    // Tree branching
    tree: function(tierProgress, angleNorm, rng) {
        if (tierProgress < 0.3) {
            return Math.abs(angleNorm - 0.5) < 0.15;
        }
        var branchCount = 2 + Math.floor(tierProgress * 3);
        var branchPhase = angleNorm * branchCount * Math.PI;
        return Math.abs(Math.sin(branchPhase)) > 0.5 || rng() < 0.2;
    },

    // Heart shape
    heart: function(tierProgress, angleNorm, rng) {
        var t = (angleNorm - 0.5) * Math.PI;
        var heartX = 16 * Math.pow(Math.sin(t), 3);
        var heartY = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
        var heartR = Math.sqrt(heartX * heartX + heartY * heartY) / 20;
        return tierProgress < heartR + 0.2;
    },

    // Diamond shape
    diamond: function(tierProgress, angleNorm, rng) {
        var dist = Math.abs(angleNorm - 0.5) * 2;
        var diamondEdge = tierProgress < 0.5 ? tierProgress * 2 : 2 - tierProgress * 2;
        return dist < diamondEdge + 0.1;
    },

    // Crown
    crown: function(tierProgress, angleNorm, rng) {
        if (tierProgress < 0.3) return true;
        var pointCount = 5;
        var pointPhase = angleNorm * pointCount * Math.PI;
        var pointValue = Math.abs(Math.sin(pointPhase));
        return pointValue > 0.6 || tierProgress < 0.5;
    },

    // Wave pattern
    wave: function(tierProgress, angleNorm, rng) {
        var waveOffset = Math.sin(angleNorm * Math.PI * 3) * 0.2;
        var waveEdge = 0.7 + waveOffset;
        return tierProgress < waveEdge;
    },

    // Spiral
    spiral: function(tierProgress, angleNorm, rng) {
        var spiralPhase = (angleNorm + tierProgress * 2) % 1;
        var spiralWidth = 0.3;
        return spiralPhase < spiralWidth || spiralPhase > (1 - spiralWidth);
    },

    // Crescent moon
    crescent: function(tierProgress, angleNorm, rng) {
        var outerEdge = 0.9;
        var innerOffset = 0.3;
        var dist = Math.abs(angleNorm - 0.5) * 2;
        var inOuter = dist < outerEdge;
        var inInner = (angleNorm > 0.5) && (dist - innerOffset) < outerEdge * 0.6;
        return inOuter && !inInner;
    },

    // Star constellation
    star: function(tierProgress, angleNorm, rng) {
        var pointCount = 5;
        var innerRatio = 0.4;
        var pointPhase = angleNorm * pointCount * 2;
        var isPoint = (Math.floor(pointPhase) % 2 === 0);
        var effectiveRadius = isPoint ? 1.0 : innerRatio;
        return tierProgress < effectiveRadius;
    },

    // Big star with prominent points
    big_star: function(tierProgress, angleNorm, rng) {
        var pointCount = 5;
        var innerRatio = 0.35;
        var idx = angleNorm * pointCount * 2;
        var segmentProgress = idx - Math.floor(idx);
        var isPointSegment = (Math.floor(idx) % 2 === 0);
        var effectiveRadius;
        if (isPointSegment) {
            effectiveRadius = innerRatio + (1 - innerRatio) * (1 - Math.abs(segmentProgress - 0.5) * 2);
        } else {
            effectiveRadius = innerRatio + (1 - innerRatio) * Math.abs(segmentProgress - 0.5) * 2;
        }
        return tierProgress < effectiveRadius + rng() * 0.1;
    },

    // Ocean waves
    waves: function(tierProgress, angleNorm, rng) {
        var waveCount = 4;
        var wavePhase = tierProgress * waveCount * Math.PI;
        var waveAmplitude = 0.15 * (1 - tierProgress * 0.5);
        var waveOffset = Math.sin(wavePhase + angleNorm * Math.PI * 2) * waveAmplitude;
        var baseEdge = 0.2 + tierProgress * 0.6;
        var dist = Math.abs(angleNorm - 0.5) * 2;
        return dist < baseEdge + waveOffset + rng() * 0.05;
    },

    // Multiple swords/blades
    swords: function(tierProgress, angleNorm, rng) {
        var swordCount = 3;
        var swordWidth = 0.08;
        var guardTier = 0.25;
        var positions = [];
        for (var i = 0; i < swordCount; i++) {
            positions.push((i + 0.5) / swordCount);
        }
        for (var i = 0; i < positions.length; i++) {
            var dist = Math.abs(angleNorm - positions[i]);
            if (dist < swordWidth) return true;
            if (tierProgress < guardTier && tierProgress > guardTier - 0.1 && dist < swordWidth * 2.5) return true;
        }
        return false;
    }
};

// =============================================================================
// SHAPE JITTER PROFILES
// =============================================================================

var _LG_SHAPE_PROFILES = {
    organic:    { jitterMult: 0.6 },
    radial:     { jitterMult: 0.2 },
    spiky:      { jitterMult: 0.8 },
    mountain:   { jitterMult: 0.4 },
    cloud:      { jitterMult: 0.7 },
    cascade:    { jitterMult: 0.3 },
    linear:     { jitterMult: 0.15 },
    grid:       { jitterMult: 0.0 },
    flame:      { jitterMult: 0.5 },
    explosion:  { jitterMult: 0.7 },
    lightning:  { jitterMult: 0.4 },
    castle:     { jitterMult: 0.2 },
    galaxy:     { jitterMult: 0.5 },
    tree:       { jitterMult: 0.4 },
    heart:      { jitterMult: 0.3 },
    diamond:    { jitterMult: 0.25 },
    crown:      { jitterMult: 0.35 },
    wave:       { jitterMult: 0.5 },
    spiral:     { jitterMult: 0.4 },
    crescent:   { jitterMult: 0.3 },
    star:       { jitterMult: 0.3 },
    big_star:   { jitterMult: 0.3 },
    waves:      { jitterMult: 0.5 },
    swords:     { jitterMult: 0.2 }
};

// =============================================================================
// SEEDED RANDOM
// =============================================================================

/**
 * Simple seeded random number generator.
 */
function seededRandom(seed) {
    var state = seed || Date.now();
    return function() {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}
