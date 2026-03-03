/**
 * Layout Engine Core - Base object with config, position, grid, and utility methods
 *
 * This is THE SINGLE SOURCE OF TRUTH for all position calculations.
 * Both tree builders and renderers should use this engine.
 *
 * Depends on:
 * - config.js (GRID_CONFIG)
 * - shapeProfiles.js (SHAPE_PROFILES, SHAPE_MASKS)
 * - growthBehaviors.js (GROWTH_BEHAVIORS) - optional
 *
 * Extended by:
 * - layoutEngineGrid.js (_getShapeBehaviorOverrides, _getShapeTargetAngle,
 *     _getShapeScoringWeights, _shapeConformity, _densityStretch)
 * - layoutEngineUtils.js (_barycenterReorder, _sitterNudge, _handleOrphans, exports)
 * - layoutEngineRadial.js (applyPositionsToTree)
 *
 * Exports (global):
 * - LayoutEngine (base object, extended by other modules)
 */

// =============================================================================
// LAYOUT ENGINE CORE
// =============================================================================

// Log to SKSE log file via C++ bridge (visible in Documents/My Games/.../SKSE/SpellLearning.log)
function _skseLog(msg) {
    if (window.callCpp) {
        window.callCpp('LogMessage', JSON.stringify({ level: 'info', message: '[LayoutEngine] ' + msg }));
    }
    console.log('[LayoutEngine] ' + msg);
}

var LayoutEngine = {
    // Cached configuration
    _config: null,

    // =================================================================
    // INITIALIZATION
    // =================================================================

    /**
     * Get the base layout configuration
     * @returns {Object} - Layout config from GRID_CONFIG
     */
    getConfig: function() {
        if (this._config) return this._config;

        // Use GRID_CONFIG as the single source
        if (typeof GRID_CONFIG !== 'undefined') {
            this._config = GRID_CONFIG.getComputedConfig();
        } else {
            // Fallback defaults (should never happen)
            this._config = {
                nodeSize: 75,
                baseRadius: 90,
                tierSpacing: 52,
                arcSpacing: 56,
                minNodeSpacing: 52,
                maxTiers: 25,
                schoolPadding: 15
            };
        }
        return this._config;
    },

    /**
     * Clear cached config (call after GRID_CONFIG changes)
     */
    clearCache: function() {
        this._config = null;
    },

    // =================================================================
    // CORE POSITION CALCULATION
    // =================================================================

    /**
     * Calculate x,y position from tier and angle
     * @param {number} tier - Tier index (0 = center)
     * @param {number} angleDeg - Angle in degrees
     * @param {Object} shapeConfig - Optional shape-adjusted config
     * @returns {Object} - {x, y, radius, angle}
     */
    getNodePosition: function(tier, angleDeg, shapeConfig) {
        var cfg = shapeConfig || this.getConfig();
        var radius = cfg.baseRadius + tier * cfg.tierSpacing;
        var angleRad = angleDeg * Math.PI / 180;

        return {
            x: Math.cos(angleRad) * radius,
            y: Math.sin(angleRad) * radius,
            radius: radius,
            angle: angleDeg
        };
    },

    /**
     * Calculate positions with jitter applied
     * @param {number} tier
     * @param {number} angleDeg
     * @param {string} shapeName - Shape profile to use
     * @param {function} rng - Random number generator
     * @returns {Object} - {x, y, radius, angle} with jitter
     */
    getNodePositionWithJitter: function(tier, angleDeg, shapeName, rng) {
        var cfg = this.getConfig();

        // Get profile with guaranteed defaults
        var profile = { radiusJitter: 0.1, angleJitter: 5 };
        if (typeof getShapeProfile === 'function') {
            var p = getShapeProfile(shapeName);
            if (p) {
                profile.radiusJitter = typeof p.radiusJitter === 'number' ? p.radiusJitter : 0.1;
                profile.angleJitter = typeof p.angleJitter === 'number' ? p.angleJitter : 5;
            }
        }

        var baseRadius = cfg.baseRadius + (tier || 0) * cfg.tierSpacing;

        // Apply radius jitter (with NaN protection)
        var radiusJitter = (rng() - 0.5) * 2 * profile.radiusJitter * baseRadius;
        var radius = baseRadius + (isFinite(radiusJitter) ? radiusJitter : 0);

        // Apply angle jitter (with NaN protection)
        var angleJitter = (rng() - 0.5) * 2 * profile.angleJitter;
        var angleDegJittered = (angleDeg || 0) + (isFinite(angleJitter) ? angleJitter : 0);

        var angleRad = angleDegJittered * Math.PI / 180;

        return {
            x: Math.cos(angleRad) * radius,
            y: Math.sin(angleRad) * radius,
            radius: radius,
            angle: angleDegJittered,
            baseRadius: baseRadius,
            baseAngle: angleDeg || 0
        };
    },

    // =================================================================
    // SECTOR CALCULATION
    // =================================================================

    /**
     * Calculate sector info for a school
     * @param {number} schoolIndex - Index of school (0-4 for 5 schools)
     * @param {number} totalSchools - Total number of schools
     * @returns {Object} - {spokeAngle, sectorAngle, startAngle, endAngle}
     */
    calculateSector: function(schoolIndex, totalSchools) {
        var cfg = this.getConfig();
        var sectorAngle = 360 / totalSchools;
        var spokeAngle = schoolIndex * sectorAngle + sectorAngle / 2;

        return {
            spokeAngle: spokeAngle,
            sectorAngle: sectorAngle,
            startAngle: spokeAngle - sectorAngle / 2 + cfg.schoolPadding / 2,
            endAngle: spokeAngle + sectorAngle / 2 - cfg.schoolPadding / 2,
            usableAngle: sectorAngle - cfg.schoolPadding
        };
    },

    // =================================================================
    // FIXED GRID POSITIONS - Single source of truth matching debug grid
    // =================================================================

    /**
     * Get ALL fixed grid positions for a school sector.
     * These are the EXACT same positions shown by the debug grid toggle.
     * This is the centralized grid system - all tree generation should use this.
     *
     * @param {number} schoolIndex - Index of school (0-4 for 5 schools)
     * @param {number} totalSchools - Total number of schools (default 5)
     * @returns {Array} - Array of {x, y, tier, slotIndex, angle, radius} for ALL valid positions
     */
    getFixedGridPositions: function(schoolIndex, totalSchools) {
        var cfg = this.getConfig();
        totalSchools = totalSchools || 5;

        // Account for school padding to align with wheelRenderer sector borders
        var totalPadding = totalSchools * (cfg.schoolPadding || 5);
        var availableAngle = 360 - totalPadding;
        var sliceAngle = availableAngle / totalSchools;
        var startAngle = schoolIndex * (sliceAngle + (cfg.schoolPadding || 5)) - 90;
        var usableAngle = sliceAngle * 0.85;
        var centerAngle = startAngle + sliceAngle / 2;
        var halfSpread = usableAngle / 2;

        var positions = [];

        // Generate positions for each tier (same logic as renderDebugGrid)
        for (var tier = 0; tier < cfg.maxTiers; tier++) {
            var radius = cfg.baseRadius + tier * cfg.tierSpacing;

            // Calculate arc length and candidate count (same as renderDebugGrid)
            var arcLength = (sliceAngle / 360) * 2 * Math.PI * radius;
            var candidateCount = Math.max(3, Math.floor(arcLength / cfg.arcSpacing));

            var angleStep = candidateCount > 1 ? usableAngle / (candidateCount - 1) : 0;

            for (var i = 0; i < candidateCount; i++) {
                var angle = candidateCount === 1
                    ? centerAngle
                    : (centerAngle - halfSpread + i * angleStep);
                var rad = angle * Math.PI / 180;
                var x = Math.cos(rad) * radius;
                var y = Math.sin(rad) * radius;

                positions.push({
                    x: x,
                    y: y,
                    tier: tier,
                    slotIndex: i,
                    slotsInTier: candidateCount,
                    angle: angle,
                    radius: radius,
                    schoolIndex: schoolIndex,
                    _isFixedGrid: true
                });
            }
        }

        console.log('[LayoutEngine] Generated', positions.length, 'fixed grid positions for school', schoolIndex);
        return positions;
    },

    /**
     * Get fixed grid positions filtered by tier range
     * @param {number} schoolIndex
     * @param {number} totalSchools
     * @param {number} maxTier - Only include positions up to this tier
     * @returns {Array}
     */
    getFixedGridPositionsForTiers: function(schoolIndex, totalSchools, maxTier) {
        var allPositions = this.getFixedGridPositions(schoolIndex, totalSchools);
        return allPositions.filter(function(p) {
            return p.tier <= maxTier;
        });
    },

    /**
     * Find the nearest unoccupied grid position for a spell
     * @param {Object} spell - Spell with tier info
     * @param {Array} availablePositions - Array of unoccupied positions
     * @param {number} preferredTier - Tier to prefer (usually spell's tier)
     * @returns {Object|null} - Best matching position or null
     */
    findBestGridPosition: function(spell, availablePositions, preferredTier) {
        if (!availablePositions || availablePositions.length === 0) return null;

        // First try to find a position at the preferred tier
        var sameTier = availablePositions.filter(function(p) {
            return p.tier === preferredTier;
        });

        if (sameTier.length > 0) {
            // Return the middle position of this tier for balanced distribution
            return sameTier[Math.floor(sameTier.length / 2)];
        }

        // If no positions at preferred tier, find closest tier
        var sorted = availablePositions.slice().sort(function(a, b) {
            return Math.abs(a.tier - preferredTier) - Math.abs(b.tier - preferredTier);
        });

        return sorted[0];
    },

    // =================================================================
    // LEGACY GRID GENERATION (kept for backwards compatibility)
    // =================================================================

    /**
     * Generate a grid of positions for a school sector
     * @deprecated Use getFixedGridPositions instead
     * @param {Object} sector - Sector info from calculateSector
     * @param {number} spellCount - Number of spells to place
     * @param {string} shapeName - Shape profile to use
     * @param {number} seed - Random seed for reproducibility
     * @returns {Array} - Array of position objects
     */
    generateGrid: function(sector, spellCount, shapeName, seed) {
        var cfg = this.getConfig();

        // Safety check for invalid inputs
        if (!sector || !spellCount || spellCount <= 0) {
            console.warn('[LayoutEngine] generateGrid: Invalid sector or spellCount');
            return [];
        }

        // Get profile with fallback
        var profile = { radiusJitter: 0.1, angleJitter: 5, tierSpacingMult: 1, densityMult: 1 };
        if (typeof getShapeProfile === 'function') {
            profile = getShapeProfile(shapeName) || profile;
        } else if (typeof SHAPE_PROFILES !== 'undefined' && SHAPE_PROFILES[shapeName]) {
            profile = SHAPE_PROFILES[shapeName];
        }

        var mask = typeof getShapeMask === 'function'
            ? getShapeMask(shapeName)
            : function() { return true; };

        var rng = this._createSeededRandom(seed);
        var positions = [];

        // Calculate how many tiers we need (ensure at least 1)
        var numTiers = Math.max(1, Math.min(cfg.maxTiers, Math.ceil(Math.sqrt(spellCount) * 1.5)));

        // Adjust tier spacing for shape (ensure positive)
        var tierSpacing = Math.max(10, cfg.tierSpacing * (profile.tierSpacingMult || 1));

        // Validate sector angles
        var usableAngle = sector.usableAngle || 60;  // Default to 60 degrees if missing
        var startAngle = sector.startAngle || 0;

        // Generate positions tier by tier
        for (var tier = 0; tier < numTiers; tier++) {
            var radius = cfg.baseRadius + tier * tierSpacing;
            var arcLength = (usableAngle / 360) * 2 * Math.PI * radius;

            // How many nodes can fit on this tier (ensure at least 1)
            var nodesOnTier = Math.max(1, Math.floor(arcLength / cfg.arcSpacing));

            // Apply taper for mountain shape
            if (profile.taperSpread) {
                var taperAmount = profile.taperAmount || 0.5;
                var depthNorm = numTiers > 1 ? tier / (numTiers - 1) : 0;
                nodesOnTier = Math.max(1, Math.floor(nodesOnTier * (1 - depthNorm * (1 - taperAmount))));
            }

            // Apply density multiplier (ensure at least 1 node per tier)
            var densityMult = profile.densityMult || 1;
            nodesOnTier = Math.max(1, Math.floor(nodesOnTier * densityMult));

            // Generate node positions on this tier
            for (var i = 0; i < nodesOnTier; i++) {
                var angleNorm = nodesOnTier > 1 ? i / (nodesOnTier - 1) : 0.5;
                var angle = startAngle + angleNorm * usableAngle;

                // Check shape mask (use safe depthNorm)
                var tierDepthNorm = numTiers > 1 ? tier / (numTiers - 1) : 0;
                if (!mask(tierDepthNorm, angleNorm, rng, profile)) {
                    continue;
                }

                // Get position with jitter
                var pos = this.getNodePositionWithJitter(tier, angle, shapeName, rng);

                // Validate position values (prevent NaN)
                var x = isFinite(pos.x) ? pos.x : 0;
                var y = isFinite(pos.y) ? pos.y : 0;

                positions.push({
                    tier: tier,
                    tierNorm: tierDepthNorm,
                    angleNorm: angleNorm,
                    x: x,
                    y: y,
                    radius: isFinite(pos.radius) ? pos.radius : cfg.baseRadius,
                    angle: isFinite(pos.angle) ? pos.angle : angle,
                    baseRadius: isFinite(pos.baseRadius) ? pos.baseRadius : cfg.baseRadius,
                    baseAngle: isFinite(pos.baseAngle) ? pos.baseAngle : angle,
                    shape: shapeName,
                    isRoot: tier === 0 && i === Math.floor(nodesOnTier / 2)
                });
            }

            // Early exit if we have enough positions
            if (positions.length >= spellCount * 1.2) break;
        }

        return positions;
    },

    // =================================================================
    // GROWTH BEHAVIOR APPLICATION
    // =================================================================

    /**
     * Apply growth behavior to positions
     * @param {Array} positions - Array of position objects
     * @param {string} behaviorName - Growth behavior name
     * @param {function} rng - Random number generator
     * @returns {Array} - Modified positions
     */
    applyGrowthBehavior: function(positions, behaviorName, rng) {
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
    },

    /**
     * Get phase-adjusted parameters based on progress
     */
    _getPhaseParams: function(behavior, progress) {
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
    },

    // =================================================================
    // FULL LAYOUT CALCULATION
    // =================================================================

    /**
     * Calculate full layout for a school's spells
     * @param {Array} spells - Array of spell objects
     * @param {Object} schoolConfig - School configuration
     * @param {Object} options - Layout options
     * @returns {Array} - Spells with positions assigned
     */
    calculatePositions: function(spells, schoolConfig, options) {
        options = options || {};

        var cfg = this.getConfig();
        var shapeName = schoolConfig.shape || options.shape || 'organic';
        var behaviorName = schoolConfig.growthBehavior || options.growthBehavior || null;
        var seed = options.seed || Date.now();

        var rng = this._createSeededRandom(seed);

        // Get sector info
        var sector = this.calculateSector(
            schoolConfig.index || 0,
            schoolConfig.totalSchools || 5
        );

        // Generate grid positions
        var positions = this.generateGrid(sector, spells.length, shapeName, seed);

        // Apply growth behavior if specified
        if (behaviorName && typeof GROWTH_BEHAVIORS !== 'undefined') {
            positions = this.applyGrowthBehavior(positions, behaviorName, rng);
        }

        // Sort spells by tier
        var sortedSpells = spells.slice().sort(function(a, b) {
            var tierA = typeof getSpellTier === 'function' ? getSpellTier(a) : (a.tier || 0);
            var tierB = typeof getSpellTier === 'function' ? getSpellTier(b) : (b.tier || 0);
            return tierA - tierB;
        });

        // Assign spells to positions
        var result = [];
        for (var i = 0; i < sortedSpells.length && i < positions.length; i++) {
            var spell = sortedSpells[i];
            var pos = positions[i];

            result.push(Object.assign({}, spell, {
                x: pos.x,
                y: pos.y,
                radius: pos.radius,
                angle: pos.angle,
                tier: pos.tier,
                isRoot: pos.isRoot,
                shape: pos.shape,
                _fromLayoutEngine: true
            }));
        }

        return result;
    },

    // =================================================================
    // UTILITIES
    // =================================================================

    /**
     * Create a seeded random number generator
     */
    _createSeededRandom: function(seed) {
        var m = 0x80000000;
        var a = 1103515245;
        var c = 12345;
        var state = seed || Date.now();

        return function() {
            state = (a * state + c) % m;
            return state / m;
        };
    },

    /**
     * Calculate distance between two points
     */
    distance: function(p1, p2) {
        var dx = p1.x - p2.x;
        var dy = p1.y - p2.y;
        return Math.sqrt(dx * dx + dy * dy);
    },

    /**
     * Check if two nodes overlap
     */
    nodesOverlap: function(n1, n2, minSpacing) {
        var cfg = this.getConfig();
        minSpacing = minSpacing || cfg.minNodeSpacing;
        return this.distance(n1, n2) < minSpacing;
    },

    /**
     * Resolve overlaps by nudging nodes
     */
    resolveOverlaps: function(positions, iterations) {
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
    },

    // =================================================================
    // STRING HASHING
    // =================================================================

    /**
     * Simple string hash for generating school-specific seeds
     */
    _hashString: function(str) {
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
};

// Export early so extension files (layoutEngineGrid, layoutEngineUtils, layoutEngineRadial)
// can attach methods. Final re-export in layoutEngineUtils.js.
window.LayoutEngine = LayoutEngine;
