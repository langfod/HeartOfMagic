/**
 * Layout Engine Behavior - Growth behavior application and collision resolution
 *
 * Extracted from layoutEngineCore.js to keep files under 600 LOC.
 * Adds growth behavior, overlap resolution, and utility methods to LayoutEngine.
 *
 * Loaded after: layoutEngineCore.js
 * Loaded before: layoutEngineGrid.js, layoutEngineUtils.js, layoutEngineRadial.js
 *
 * Extends (global):
 * - LayoutEngine (adds behavior and utility methods)
 */

// =============================================================================
// GROWTH BEHAVIOR APPLICATION
// =============================================================================

/**
 * Apply growth behavior to positions
 * @param {Array} positions - Array of position objects
 * @param {string} behaviorName - Growth behavior name
 * @param {function} rng - Random number generator
 * @returns {Array} - Modified positions
 */
LayoutEngine.applyGrowthBehavior = function(positions, behaviorName, rng) {
    if (typeof GROWTH_BEHAVIORS === 'undefined') {
        console.log('[LayoutEngine] GROWTH_BEHAVIORS not available, skipping');
        return positions;
    }

    var behavior = GROWTH_BEHAVIORS[behaviorName];
    if (!behavior) {
        console.log('[LayoutEngine] Unknown behavior:', behaviorName);
        return positions;
    }

    var cfg = this.getConfig();
    var self = this;

    return positions.map(function(pos, idx) {
        var progress = idx / positions.length;
        var phase = self._getPhaseParams(behavior, progress);

        // Apply vertical bias
        var verticalBias = phase.verticalBias !== undefined ? phase.verticalBias : behavior.verticalBias || 0;
        var radiusAdjust = 1 + verticalBias * 0.2;
        var newRadius = pos.radius * radiusAdjust;

        // Apply spread factor
        var spreadFactor = phase.spreadFactor !== undefined ? phase.spreadFactor : behavior.spreadFactor || 0.5;
        var centerAngle = (pos.baseAngle || pos.angle);
        var spreadAmount = (pos.angle - centerAngle) * spreadFactor;
        var newAngle = centerAngle + spreadAmount;

        // Apply angular wander
        var wander = behavior.angularWander || 0;
        newAngle += (rng() - 0.5) * wander;

        // Apply wave if present
        if (behavior.waveAmplitude) {
            var wavePhase = progress * Math.PI * 2 * (behavior.waveFrequency || 1);
            newAngle += Math.sin(wavePhase) * behavior.waveAmplitude;
        }

        var angleRad = newAngle * Math.PI / 180;

        return Object.assign({}, pos, {
            x: Math.cos(angleRad) * newRadius,
            y: Math.sin(angleRad) * newRadius,
            radius: newRadius,
            angle: newAngle,
            behaviorApplied: behaviorName
        });
    });
};

/**
 * Get phase-adjusted parameters based on progress
 */
LayoutEngine._getPhaseParams = function(behavior, progress) {
    if (!behavior.phases || behavior.phases.length === 0) {
        return {};
    }

    // Find active phase
    var activePhase = null;
    for (var i = behavior.phases.length - 1; i >= 0; i--) {
        if (progress >= behavior.phases[i].at) {
            activePhase = behavior.phases[i];
            break;
        }
    }

    return activePhase ? activePhase.changes : {};
};

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Create a seeded random number generator
 */
LayoutEngine._createSeededRandom = function(seed) {
    var m = 0x80000000;
    var a = 1103515245;
    var c = 12345;
    var state = seed || Date.now();

    return function() {
        state = (a * state + c) % m;
        return state / m;
    };
};

/**
 * Calculate distance between two points
 */
LayoutEngine.distance = function(p1, p2) {
    var dx = p1.x - p2.x;
    var dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Check if two nodes overlap
 */
LayoutEngine.nodesOverlap = function(n1, n2, minSpacing) {
    var cfg = this.getConfig();
    minSpacing = minSpacing || cfg.minNodeSpacing;
    return this.distance(n1, n2) < minSpacing;
};

/**
 * Resolve overlaps by nudging nodes
 */
LayoutEngine.resolveOverlaps = function(positions, iterations) {
    var cfg = this.getConfig();
    var minSpacing = cfg.minNodeSpacing;
    iterations = iterations || 3;

    for (var iter = 0; iter < iterations; iter++) {
        var moved = false;

        for (var i = 0; i < positions.length; i++) {
            for (var j = i + 1; j < positions.length; j++) {
                var dist = this.distance(positions[i], positions[j]);

                if (dist < minSpacing && dist > 0) {
                    // Calculate push direction
                    var dx = positions[j].x - positions[i].x;
                    var dy = positions[j].y - positions[i].y;
                    var pushDist = (minSpacing - dist) / 2;
                    var pushX = (dx / dist) * pushDist;
                    var pushY = (dy / dist) * pushDist;

                    // Push nodes apart
                    positions[i].x -= pushX;
                    positions[i].y -= pushY;
                    positions[j].x += pushX;
                    positions[j].y += pushY;

                    moved = true;
                }
            }
        }

        if (!moved) break;
    }

    return positions;
};

// =============================================================================
// STRING HASHING
// =============================================================================

/**
 * Simple string hash for generating school-specific seeds
 */
LayoutEngine._hashString = function(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash);
};
