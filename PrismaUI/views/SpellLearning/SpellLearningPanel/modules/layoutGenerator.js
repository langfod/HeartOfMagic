/**
 * Layout Generator Module - Visual-First Tree Building
 * 
 * Three-zone approach:
 * 1. INNER ZONE: First 3 rings (root + 2 more) are full circles, no shape influence
 *    - 2 tier gaps between inner rings for visual clarity
 * 2. SHAPE ZONE: Outer rings use shape masks for visual silhouette
 * 3. STAR ZONE: Optional scattered nodes in outer region
 * 
 * Depends on: TREE_CONFIG, settings, state
 */

// =============================================================================
// CONFIGURATION - Uses unified GRID_CONFIG from config.js
// =============================================================================

var LAYOUT_CONFIG = (function() {
    // Get unified grid config - single source of truth
    var gridCfg = (typeof GRID_CONFIG !== 'undefined') ? GRID_CONFIG.getComputedConfig() : {
        nodeSize: 75,
        baseRadius: 90,
        tierSpacing: 52,
        arcSpacing: 56,
        minNodeSpacing: 52,
        maxTiers: 25,
        schoolPadding: 15
    };
    
    return {
        baseRadius: gridCfg.baseRadius,
        tierSpacing: gridCfg.tierSpacing,
        arcSpacing: gridCfg.arcSpacing,
        gridDensity: 6,
        schoolPadding: gridCfg.schoolPadding,
        maxTiers: 60,  // More tiers for larger spell counts
        minNodeSpacing: gridCfg.minNodeSpacing,
        nodeSize: gridCfg.nodeSize,
        
        // Inner ring zone config - sparse inner rings
        innerRingCount: 3,
        innerRingGap: 2,
        innerRingTiers: [0, 3, 6],        // Tiers 0, 3, 6 get nodes; 1,2,4,5 are gaps
        innerRingMaxNodes: [1, 3, 5],     // Fewer nodes per inner ring for clean spacing
        
        // Star nodes
        starNodeChance: 0.12,
        starMinRadius: 1.5,
        starMaxRadius: 2.5
    };
})();

/**
 * Calculate dynamic spacing based on spell count.
 * For large trees, increase radius to prevent overlap.
 */
function getScaledConfig(spellCount, sectorAngle) {
    // Base config
    var config = {
        baseRadius: LAYOUT_CONFIG.baseRadius,
        tierSpacing: LAYOUT_CONFIG.tierSpacing,
        gridDensity: LAYOUT_CONFIG.gridDensity
    };
    
    // Calculate expected nodes per tier (fixed 5 tiers)
    var nodesPerTier = Math.ceil(spellCount / LAYOUT_CONFIG.maxTiers);
    
    // Calculate arc length at average radius (tier 2) for min spacing
    var avgRadius = config.baseRadius + (config.tierSpacing * 2);
    var arcLength = (sectorAngle / 360) * 2 * Math.PI * avgRadius;
    var requiredArcLength = nodesPerTier * LAYOUT_CONFIG.minNodeSpacing;
    
    // Always scale based on density requirements
    if (arcLength > 0) {
        var scaleFactor = requiredArcLength / arcLength;
        scaleFactor = Math.max(1.0, scaleFactor);  // At least 1x
        scaleFactor = Math.min(scaleFactor, 5.0);  // Cap at 5x
        
        if (scaleFactor > 1.0) {
            config.baseRadius *= scaleFactor;
            config.tierSpacing *= scaleFactor;
            
            console.log('[LayoutGenerator] Scaling for', spellCount, 'spells,', nodesPerTier, 'per tier: factor=', scaleFactor.toFixed(2), 'base_radius=', config.baseRadius.toFixed(0));
        }
    }
    
    return config;
}

// =============================================================================
// SLICE ALLOCATION
// =============================================================================

/**
 * Calculate pie slice angles for each school - EQUAL slices for symmetry.
 * All schools get the same sector angle regardless of spell count.
 */
function calculateSliceAngles(schools) {
    var schoolNames = Object.keys(schools);
    var numSchools = schoolNames.length;
    
    if (numSchools === 0) return {};
    
    // EQUAL SLICES - each school gets same angle
    var totalPadding = numSchools * LAYOUT_CONFIG.schoolPadding;
    var availableAngle = 360 - totalPadding;
    var sectorAngle = availableAngle / numSchools;  // Equal for all
    
    var sliceAngles = {};
    var currentAngle = -90;  // Start at top
    
    schoolNames.forEach(function(name) {
        var spokeAngle = currentAngle + sectorAngle / 2;
        
        sliceAngles[name] = {
            startAngle: currentAngle,
            endAngle: currentAngle + sectorAngle,
            sectorAngle: sectorAngle,
            spokeAngle: spokeAngle,
            weight: 1.0  // Equal weight
        };
        
        currentAngle += sectorAngle + LAYOUT_CONFIG.schoolPadding;
    });
    
    console.log('[LayoutGenerator] EQUAL slice allocation:', sectorAngle.toFixed(1) + '° per school');
    return sliceAngles;
}

// =============================================================================
// PHASE 1: GENERATE FULL GRID
// =============================================================================

/**
 * Generate positions using visual-first approach with inner ring zone.
 * 
 * ZONES:
 * - INNER ZONE (tiers 0, 3, 6): Sparse rings, no shape influence, minimal jitter
 *   - Root (tier 0): EXACTLY 1 node, centered on spoke
 *   - Ring 2 (tier 3): Few nodes, well spaced
 *   - Ring 3 (tier 6): More nodes, still spaced
 * - SHAPE ZONE (tier 7+): Shape masks control node placement
 * 
 * @param {Object} sliceInfo - {startAngle, endAngle, sectorAngle, spokeAngle}
 * @param {number} spellCount - Number of spells to place
 * @param {string} shape - Shape name for outer zone
 * @param {Object} config - Additional config
 * @returns {Array} - Array of position objects
 */
function generateFullGrid(sliceInfo, spellCount, shape, config) {
    var positions = [];
    shape = shape || 'organic';
    config = config || {};
    
    console.log('[LayoutGen] === generateFullGrid ===');
    console.log('[LayoutGen] Shape:', shape, ', SpellCount:', spellCount, ', Sector:', sliceInfo.sectorAngle.toFixed(1) + '°');
    
    // Calculate how many tiers we need
    var numTiers = calculateTiersNeeded(spellCount, sliceInfo.sectorAngle);
    var profile = (window.SHAPE_PROFILES || _LG_SHAPE_PROFILES)[shape] || (window.SHAPE_PROFILES || _LG_SHAPE_PROFILES).organic;
    var shapeMask = (window.SHAPE_MASKS || _LG_SHAPE_MASKS)[shape] || (window.SHAPE_MASKS || _LG_SHAPE_MASKS).radial;
    var rng = seededRandom(sliceInfo.spokeAngle * 1000);
    
    console.log('[LayoutGen] NumTiers:', numTiers, ', Profile:', profile ? 'found' : 'MISSING', ', Mask:', shapeMask ? 'found' : 'MISSING');
    
    // Get scaled config
    var scaledConfig = getScaledConfig(spellCount, sliceInfo.sectorAngle);
    var baseRadius = scaledConfig.baseRadius;
    var tierSpacing = scaledConfig.tierSpacing;
    var nodeSize = LAYOUT_CONFIG.nodeSize;  // FIX: Get nodeSize from config!
    
    // CONTINUOUS APPROACH - No gaps, gradual expansion from root
    // Every tier has nodes, no shape mask removal, just density control
    
    console.log('[LayoutGen] Continuous mode: spellCount=' + spellCount + ', numTiers=' + numTiers + ', nodeSize=' + nodeSize + ', baseRadius=' + baseRadius + ', tierSpacing=' + tierSpacing);
    
    var tierCounts = [];  // Track how many nodes per tier
    
    // Generate positions for each tier
    for (var tier = 0; tier < numTiers; tier++) {
        var radius = baseRadius + tier * tierSpacing;
        var tierProgress = numTiers > 1 ? tier / (numTiers - 1) : 0;
        
        // Tier 0 = single root node at CENTER of slice
        if (tier === 0) {
            var rootRad = sliceInfo.spokeAngle * Math.PI / 180;
            positions.push({
                tier: tier,
                radius: radius,
                angle: sliceInfo.spokeAngle,
                x: Math.cos(rootRad) * radius,
                y: Math.sin(rootRad) * radius,
                isRoot: true,
                gridRadius: radius,
                gridAngle: sliceInfo.spokeAngle
            });
            continue;
        }
        
        // NODE COUNT per tier - grows with radius to fill the arc
        var candidateCount;
        if (tier === 1) {
            candidateCount = 3;  // First ring: 3 nodes
        } else if (tier === 2) {
            candidateCount = 4;  // Second ring: 4 nodes  
        } else if (tier <= 4) {
            candidateCount = tier + 2;  // 5, 6 nodes
        } else {
            // Outer tiers: Scale with arc length, use unified arcSpacing
            var arcLength = (sliceInfo.sectorAngle / 360) * 2 * Math.PI * radius;
            candidateCount = Math.max(4, Math.floor(arcLength / LAYOUT_CONFIG.arcSpacing));
        }
        
        var usableAngle = sliceInfo.sectorAngle * 0.85;
        var startAngle = sliceInfo.spokeAngle - usableAngle / 2;
        var angleStep = candidateCount > 1 ? usableAngle / (candidateCount - 1) : 0;
        
        var addedThisTier = 0;
        for (var i = 0; i < candidateCount; i++) {
            var angleNorm = candidateCount > 1 ? i / (candidateCount - 1) : 0.5;
            var tierProgress = tier / numTiers;
            
            // APPLY SHAPE MASK - Skip nodes that don't fit the shape
            // But always keep some minimum nodes per tier for connectivity
            var minNodesPerTier = Math.max(2, Math.floor(candidateCount * 0.3));
            var passesShapeMask = shapeMask(tierProgress, angleNorm, rng);
            
            // Force include if we haven't met minimum OR if early tiers (for connectivity)
            if (!passesShapeMask && addedThisTier >= minNodesPerTier && tier > 3) {
                continue;  // Skip this position - doesn't fit shape
            }
            
            var baseAngle = candidateCount === 1 ? sliceInfo.spokeAngle : startAngle + i * angleStep;
            var baseRadius2 = radius;
            
            // Light jitter for organic look (but not too much)
            var jitterAmount = (config.jitter || 20) * (profile.jitterMult || 1);
            if (jitterAmount > 0 && shape !== 'grid' && tier > 2) {
                var angleJitter = (rng() - 0.5) * 4 * (jitterAmount / 100);
                var radiusJitter = (rng() - 0.5) * tierSpacing * 0.2 * (jitterAmount / 100);
                baseAngle += angleJitter;
                baseRadius2 += radiusJitter;
            }
            
            var rad = baseAngle * Math.PI / 180;
            positions.push({
                tier: tier,
                radius: baseRadius2,
                angle: baseAngle,
                x: Math.cos(rad) * baseRadius2,
                y: Math.sin(rad) * baseRadius2,
                isRoot: false,
                angleNorm: angleNorm,
                gridRadius: radius,
                gridAngle: baseAngle
            });
            addedThisTier++;
        }
        tierCounts.push(addedThisTier);
    }
    
    // Log tier breakdown
    console.log('[LayoutGen] Tier breakdown: ' + tierCounts.join(', ') + ' = ' + positions.length + ' total');
    
    // NO SPREADING - keep nodes in their grid positions
    var innerNodes = []; // Empty - no spreading needed
    var minSpreadDist = 0;
    var spreadIterations = 0;
    
    for (var iter = 0; iter < spreadIterations; iter++) {
        for (var ni = 0; ni < innerNodes.length; ni++) {
            var node = innerNodes[ni];
            
            // Find the closest neighbor (not self)
            var closestDist = Infinity;
            var closestNode = null;
            for (var nj = 0; nj < innerNodes.length; nj++) {
                if (ni === nj) continue;
                var other = innerNodes[nj];
                var dx = node.x - other.x;
                var dy = node.y - other.y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestNode = other;
                }
            }
            
            // Also check distance to root
            var rootNode = positions.find(function(p) { return p.isRoot; });
            if (rootNode) {
                var dxRoot = node.x - rootNode.x;
                var dyRoot = node.y - rootNode.y;
                var distToRoot = Math.sqrt(dxRoot * dxRoot + dyRoot * dyRoot);
                if (distToRoot < closestDist) {
                    closestDist = distToRoot;
                    closestNode = rootNode;
                }
            }
            
            // If too close to nearest neighbor, push apart
            if (closestNode && closestDist < minSpreadDist) {
                var dx = node.x - closestNode.x;
                var dy = node.y - closestNode.y;
                if (closestDist > 0.1) {
                    // Gradient: closer to center = stronger push (tier 1 = 100%, tier 5 = 40%)
                    var tierGradient = 1.0 - (node.tier - 1) * 0.15;
                    tierGradient = Math.max(0.4, tierGradient);
                    
                    var pushStrength = (minSpreadDist - closestDist) * 0.5 * tierGradient;
                    var nx = dx / closestDist;
                    var ny = dy / closestDist;
                    
                    node.x += nx * pushStrength;
                    node.y += ny * pushStrength;
                    
                    // Update angle and radius from new position
                    node.angle = Math.atan2(node.y, node.x) * 180 / Math.PI;
                    node.radius = Math.sqrt(node.x * node.x + node.y * node.y);
                }
            }
        }
    }
    
    console.log('[LayoutGen] Inner zone spreading applied to', innerNodes.length, 'nodes');
    
    // =========================================================================
    // SECTOR BOUNDARY CLAMPING - Ensure all nodes stay within their pie slice
    // =========================================================================
    
    // Helper to normalize angle difference (handles 360° wrapping)
    function angleDiff(a, b) {
        var d = a - b;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        return d;
    }
    
    // Sector bounds for clamping
    var sectorPadding = 8;  // Degrees of padding from edges (increased for safety)
    var spokeAngle = sliceInfo.spokeAngle;
    var halfSector = (sliceInfo.sectorAngle / 2) - sectorPadding;
    
    // Strict clamping function - forces position within sector
    function clampToSector(p) {
        if (p.isRoot) return false;  // Root is already centered
        
        var currentAngle = Math.atan2(p.y, p.x) * 180 / Math.PI;
        var radius = Math.sqrt(p.x * p.x + p.y * p.y);
        var diffFromSpoke = angleDiff(currentAngle, spokeAngle);
        
        if (Math.abs(diffFromSpoke) <= halfSector) {
            return false;  // Already within bounds
        }
        
        // Clamp to nearest boundary
        var clampedAngle = spokeAngle + (diffFromSpoke > 0 ? halfSector : -halfSector);
        var rad = clampedAngle * Math.PI / 180;
        p.x = Math.cos(rad) * radius;
        p.y = Math.sin(rad) * radius;
        p.angle = clampedAngle;
        return true;
    }
    
    // =========================================================================
    // SIMPLE OVERLAP RESOLUTION (spatial hash, O(n) amortized per iteration)
    // =========================================================================
    var minDist = LAYOUT_CONFIG.nodeSize * 1.0;
    var spreadIterations = 3;

    for (var iter = 0; iter < spreadIterations; iter++) {
        var moved = false;

        // Build spatial hash for this iteration
        var cells = {};
        var cs = minDist;
        for (var bi = 0; bi < positions.length; bi++) {
            var bcx = Math.floor(positions[bi].x / cs);
            var bcy = Math.floor(positions[bi].y / cs);
            var bkey = bcx + ',' + bcy;
            if (!cells[bkey]) cells[bkey] = [];
            cells[bkey].push(bi);
        }

        for (var i = 0; i < positions.length; i++) {
            var pi = positions[i];
            if (pi.isRoot) continue;

            var pcx = Math.floor(pi.x / cs);
            var pcy = Math.floor(pi.y / cs);

            for (var dcx = -1; dcx <= 1; dcx++) {
                for (var dcy = -1; dcy <= 1; dcy++) {
                    var nkey = (pcx + dcx) + ',' + (pcy + dcy);
                    var cell = cells[nkey];
                    if (!cell) continue;

                    for (var ci = 0; ci < cell.length; ci++) {
                        var j = cell[ci];
                        if (j <= i) continue;

                        var pj = positions[j];
                        var dx = pj.x - pi.x;
                        var dy = pj.y - pi.y;
                        var distSq = dx * dx + dy * dy;

                        if (distSq < minDist * minDist && distSq > 0.0001) {
                            var dist = Math.sqrt(distSq);
                            var overlap = minDist - dist;
                            var pushX = (dx / dist) * overlap * 0.4;
                            var pushY = (dy / dist) * overlap * 0.4;

                            if (!pj.isRoot) {
                                pj.x += pushX;
                                pj.y += pushY;
                            }
                            if (!pi.isRoot) {
                                pi.x -= pushX;
                                pi.y -= pushY;
                            }
                            moved = true;
                        }
                    }
                }
            }
        }
        if (!moved) break;
    }
    
    // =========================================================================
    // FINAL CLAMP PASS - Force ALL positions within sector bounds
    // =========================================================================
    var clampCount = 0;
    positions.forEach(function(p) {
        if (clampToSector(p)) clampCount++;
    });
    
    if (clampCount > 0) {
        console.log('[LayoutGen] Clamped', clampCount, 'positions to sector bounds (spoke:', spokeAngle.toFixed(1) + '°, half:', halfSector.toFixed(1) + '°)')
    }
    
    console.log('[LayoutGenerator] Generated', positions.length, 'candidate positions for', 
                sliceInfo.sectorAngle.toFixed(1) + '° slice, shape:', shape);
    
    return positions;
}

/**
 * Select best positions to match spell count.
 * SIMPLIFIED: Just take positions from inner to outer until we have enough
 */
function selectPositions(positions, spellCount) {
    var targetCount = spellCount;
    
    console.log('[LayoutGenerator] selectPositions: need', targetCount, 'from', positions.length, 'available');
    
    if (positions.length <= targetCount) {
        console.log('[LayoutGenerator] Returning all', positions.length, 'positions (less than target)');
        return positions;  // Already at or below target
    }
    
    // Simple approach: Sort by tier (roots first, then inner to outer), take first targetCount
    var sorted = positions.slice().sort(function(a, b) {
        // Roots first
        if (a.isRoot && !b.isRoot) return -1;
        if (!a.isRoot && b.isRoot) return 1;
        // Then by tier
        return a.tier - b.tier;
    });
    
    var selected = sorted.slice(0, targetCount);
    
    // Count types for logging
    var roots = selected.filter(function(p) { return p.isRoot; }).length;
    var regular = selected.length - roots;
    
    console.log('[LayoutGenerator] Selected', selected.length, 'positions: roots=' + roots + 
                ', regular=' + regular);
    
    return selected;
}

/**
 * Calculate how many tiers we need for a given spell count.
 * Generates MORE tiers than strictly needed so shape masks have candidates to filter.
 */
function calculateTiersNeeded(spellCount, sectorAngle) {
    // Base calculation: estimate nodes per ring based on sector angle
    // With 72° slice and ~6 nodes per tier average, need spellCount/6 tiers
    var avgNodesPerTier = Math.max(4, Math.floor(sectorAngle / 12));
    var neededTiers = Math.ceil(spellCount / avgNodesPerTier) + 3;  // +3 for safety
    console.log('[LayoutGen] Tiers needed for', spellCount, 'spells:', neededTiers, '(avg', avgNodesPerTier, 'per tier)');
    return Math.min(neededTiers, LAYOUT_CONFIG.maxTiers);
}

// _LG_SHAPE_MASKS, _LG_SHAPE_PROFILES, and seededRandom() are defined in
// layoutGeneratorShapes.js which must be loaded before this file.

// =============================================================================
// MAIN LAYOUT GENERATION
// =============================================================================

/**
 * Generate complete layout for all schools.
 * 
 * @param {Object} schoolsData - Map of school name to {spell_count, spells, config}
 * @param {number} seed - Random seed
 * @returns {Object} - {schools: {name: {positions, sliceInfo}}, sliceAngles}
 */
function generateLayout(schoolsData, seed) {
    console.log('[LayoutGenerator] Generating layout for', Object.keys(schoolsData).length, 'schools');
    
    // Step 1: Calculate slice angles
    var sliceAngles = calculateSliceAngles(schoolsData);
    
    var result = {
        schools: {},
        sliceAngles: sliceAngles
    };
    
    for (var schoolName in schoolsData) {
        var school = schoolsData[schoolName];
        var sliceInfo = sliceAngles[schoolName];
        var config = school.config || {};
        var spellCount = school.spell_count || school.spells?.length || 0;
        var shape = config.shape || 'organic';
        
        // Generate positions using shape-based approach
        var positions = generateFullGrid(sliceInfo, spellCount, shape, config);
        
        // Select best positions to match spell count
        positions = selectPositions(positions, spellCount);
        
        result.schools[schoolName] = {
            positions: positions,
            sliceInfo: sliceInfo,
            config: config,
            spellCount: spellCount
        };
        
        console.log('[LayoutGenerator]', schoolName + ':', 
                    positions.length, 'positions,',
                    'slice:', sliceInfo.sectorAngle.toFixed(1) + '°,',
                    'shape:', shape);
    }
    
    return result;
}

/**
 * Simple string hash for seeding.
 */
function hashString(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

// =============================================================================
// EXPORTS
// =============================================================================

window.LayoutGenerator = {
    generateLayout: generateLayout,
    calculateSliceAngles: calculateSliceAngles,
    generateFullGrid: generateFullGrid,
    calculateTiersNeeded: calculateTiersNeeded,
    selectPositions: selectPositions,
    SHAPE_MASKS: _LG_SHAPE_MASKS,
    SHAPE_PROFILES: _LG_SHAPE_PROFILES,
    LAYOUT_CONFIG: LAYOUT_CONFIG
};

window.generateLayout = generateLayout;
window.calculateSliceAngles = calculateSliceAngles;
// NOTE: SHAPE_MASKS and SHAPE_PROFILES are defined in shapeProfiles.js
// Do NOT overwrite them here — shapeProfiles.js is the authoritative source
