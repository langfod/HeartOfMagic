/**
 * Layout Engine Core - Base object with config, position, and grid methods
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
 * - layoutEngineBehavior.js (applyGrowthBehavior, _getPhaseParams,
 *     _createSeededRandom, distance, nodesOverlap, resolveOverlaps, _hashString)
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
    }
};

// Export early so extension files (layoutEngineBehavior, layoutEngineGrid,
// layoutEngineUtils, layoutEngineRadial) can attach methods.
// Final re-export in layoutEngineUtils.js.
window.LayoutEngine = LayoutEngine;
