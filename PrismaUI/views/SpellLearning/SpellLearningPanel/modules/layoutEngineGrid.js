/**
 * Layout Engine Grid - Shape-specific helpers, conformity, and density stretch
 *
 * Adds shape-enforcement and BFS growth helper methods to LayoutEngine:
 * - _getShapeBehaviorOverrides: Shape-specific growth behavior parameter overrides
 * - _getShapeTargetAngle: Shape-specific angular control for BFS placement
 * - _getShapeScoringWeights: Shape-specific scoring weights for position selection
 * - _shapeConformity: Forces node angles to conform to shape silhouettes
 * - _densityStretch: Expands trees outward from root respecting shape proportions
 *
 * Loaded after: layoutEngineCore.js
 * Loaded before: layoutEngineUtils.js, layoutEngineRadial.js
 *
 * Depends on:
 * - layoutEngineCore.js (LayoutEngine base object, _skseLog global)
 * - shapeProfiles.js (shape names)
 */

/**
 * Get shape-specific growth behavior overrides.
 * @param {string} shapeName - Shape name (e.g. 'spiky', 'explosion')
 * @returns {Object|null} - Override values or null for default behavior
 */
LayoutEngine._getShapeBehaviorOverrides = function(shapeName) {
    if (shapeName === 'spiky') {
        return { verticalBias: 0.9, angularWander: 2, layerFillThreshold: 0.1 };
    } else if (shapeName === 'swords') {
        return { verticalBias: 0.7, angularWander: 8, layerFillThreshold: 0.2 };
    } else if (shapeName === 'explosion') {
        return { verticalBias: 0.75, angularWander: 5, layerFillThreshold: 0.10 };
    } else if (shapeName === 'tree') {
        return { verticalBias: 0.7, angularWander: 4, layerFillThreshold: 0.15 };
    } else if (shapeName === 'mountain') {
        return { verticalBias: -0.8, layerFillThreshold: 0.9 };
    } else if (shapeName === 'cloud') {
        return { verticalBias: 0.0, angularWander: 40 };
    } else if (shapeName === 'cascade') {
        return { verticalBias: 0.3, layerFillThreshold: 0.5 };
    }
    // organic/radial/grid/linear: no override
    return null;
};

/**
 * Calculate shape-specific target angle for child node placement.
 * Each shape overrides the target angle to create its silhouette.
 * @param {string} shapeName - Shape name
 * @param {Object} params - { depthRatio, centerAngle, usableAngle, parentAngle, targetAngle, childTier, rng }
 * @returns {Object} - { targetAngle, childTier }
 */
LayoutEngine._getShapeTargetAngle = function(shapeName, params) {
    var targetAngle = params.targetAngle;
    var childTier = params.childTier;
    var depthRatio = params.depthRatio;
    var centerAngle = params.centerAngle;
    var usableAngle = params.usableAngle;
    var rng = params.rng;

    if (shapeName === 'spiky') {
        // SPIKY: Children LOCK onto parent's radial line
        // Almost no spread — creates 3 narrow rays from roots
        targetAngle = params.parentAngle;  // 100% parent angle = pure ray
        // Tiny jitter only to prevent exact overlap
        targetAngle += (rng() - 0.5) * 1.5;
        // Push children further out — elongate the spikes
        if (rng() < 0.45) childTier += 1;
        if (rng() < 0.15) childTier += 1; // occasional double skip
    } else if (shapeName === 'explosion') {
        // EXPLOSION: Tight core → sub-explosions → HOLLOW V-blast
        if (depthRatio < 0.10) {
            // CORE: Force all inner nodes to dead center
            targetAngle = centerAngle;
            targetAngle += (rng() - 0.5) * 1.5;
        } else if (depthRatio < 0.35) {
            // SUB-EXPLOSIONS: cluster nodes into 3 smaller blast points
            var subCenters = [
                centerAngle - usableAngle * 0.20,  // Left sub-blast
                centerAngle + usableAngle * 0.18,  // Right sub-blast
                centerAngle                         // Center secondary
            ];
            var si = Math.floor(rng() * subCenters.length);
            targetAngle = subCenters[si] + (rng() - 0.5) * usableAngle * 0.12;
        } else {
            // MAIN BLAST: Push nodes to sector edges with hollow center
            var blastProgress = (depthRatio - 0.35) / 0.65; // 0→1
            var sqrtBlast = Math.sqrt(blastProgress);
            var innerVoid = sqrtBlast * usableAngle * 0.22;
            var outerEnv = usableAngle * 0.45 * sqrtBlast;
            var pushDir = (rng() > 0.5) ? 1 : -1;
            var ringPos = innerVoid + rng() * Math.max(0, outerEnv - innerVoid);
            targetAngle = centerAngle + pushDir * ringPos;
            // 15% flame tendril
            if (rng() < 0.15) {
                targetAngle = centerAngle + (rng() - 0.5) * outerEnv * 2;
            }
        }
        // Push children further out for radial blast effect
        if (depthRatio > 0.1 && rng() < 0.30) childTier += 1;
    } else if (shapeName === 'tree') {
        // TREE: Trunk → branches → dome canopy curving back down
        if (depthRatio < 0.30) {
            // TRUNK: visible thickness
            targetAngle = centerAngle;
            targetAngle += (rng() - 0.5) * 4.0;
        } else if (depthRatio < 0.50) {
            // BRANCHES: spread children along 4 branch directions
            var branchT = (depthRatio - 0.30) / 0.20;
            var branchAngles = [-0.7, -0.3, 0.3, 0.7];
            var branchSpread = usableAngle * 0.35 * branchT;
            var bi = Math.floor(rng() * branchAngles.length);
            targetAngle = centerAngle + branchAngles[bi] * branchSpread;
            targetAngle += (rng() - 0.5) * 3.0;
        } else if (depthRatio < 0.72) {
            // CANOPY: wide dense fill
            var canopyT = (depthRatio - 0.50) / 0.22;
            var canopyWidth = usableAngle * (0.30 + canopyT * canopyT * 0.60);
            targetAngle = centerAngle + (rng() - 0.5) * canopyWidth;
        } else {
            // DROOP: canopy curves back toward center
            var droopT = (depthRatio - 0.72) / 0.28;
            var maxW = usableAngle * 0.90;
            var droopWidth = maxW - droopT * droopT * (maxW - usableAngle * 0.30);
            targetAngle = centerAngle + (rng() - 0.5) * droopWidth;
        }
    } else if (shapeName === 'mountain') {
        // MOUNTAIN: Sector-wide base at tier 0-1, VERY narrow peak at outer tiers
        // Cubic pull toward center with aggressive narrowing
        var peakPull = depthRatio * depthRatio * depthRatio * 0.98;
        targetAngle = targetAngle * (1 - peakPull) + centerAngle * peakPull;
        // At innermost tiers, push nodes to edges of sector for wide base
        if (depthRatio < 0.35) {
            var basePush = (0.35 - depthRatio) / 0.35; // 1→0
            var offsetFromCenter = targetAngle - centerAngle;
            targetAngle += offsetFromCenter * basePush * 0.7;
            // Extra wander to fill sector width
            targetAngle += (rng() - 0.5) * usableAngle * 0.15 * basePush;
        }
    } else if (shapeName === 'cloud') {
        // CLOUD: Completely random scatter within sector — no coherent shape
        // Abandon parent-following, place almost randomly in sector
        var randomAngle = centerAngle + (rng() - 0.5) * usableAngle * 0.85;
        targetAngle = targetAngle * 0.3 + randomAngle * 0.7;
        // Frequent gap jumps for irregular clusters
        if (rng() < 0.35) {
            targetAngle += (rng() > 0.5 ? 1 : -1) * usableAngle * 0.25;
        }
        // Heavily vary tier placement
        if (rng() < 0.4) childTier += Math.floor(rng() * 3);
    } else if (shapeName === 'cascade') {
        // CASCADE: Hard-snap to 5 discrete columns, alternating tier offsets
        var numColumns = 5;
        var colWidth = usableAngle / numColumns;
        var sectorStart = centerAngle - usableAngle / 2;
        // Strong stagger per tier
        var staggerOffset = (childTier % 2 === 0 ? 1 : -1) * (colWidth * 0.4);
        targetAngle += staggerOffset;
        // HARD snap to nearest column center (85% column, 15% natural)
        var nearestCol = Math.round((targetAngle - sectorStart) / colWidth);
        nearestCol = Math.max(0, Math.min(numColumns - 1, nearestCol));
        var colCenter = sectorStart + nearestCol * colWidth + colWidth / 2;
        targetAngle = targetAngle * 0.15 + colCenter * 0.85;
    }
    // organic/radial/grid/linear: no override, use natural BFS spread

    return { targetAngle: targetAngle, childTier: childTier };
};

/**
 * Get shape-specific scoring weights for BFS position selection.
 * @param {string} shapeName - Shape name
 * @param {number} depthRatio - Depth ratio (0 = near root, 1 = max depth)
 * @returns {Object} - { angleDiffWeight, tierDiffWeight, pickTopN }
 */
LayoutEngine._getShapeScoringWeights = function(shapeName, depthRatio) {
    var angleDiffWeight = 2;
    var tierDiffWeight = 40;
    var pickTopN = 3;

    if (shapeName === 'spiky') {
        angleDiffWeight = 15;   // EXTREME: lock to parent's ray angle
        tierDiffWeight = 5;     // Low: skip tiers freely for elongation
        pickTopN = 1;           // Always pick absolute best position
    } else if (shapeName === 'swords') {
        angleDiffWeight = 8;    // High: stay within blade width
        tierDiffWeight = 8;     // Moderate: advance along blade
        pickTopN = 2;           // Fairly precise
    } else if (shapeName === 'explosion') {
        if (depthRatio < 0.2) {
            angleDiffWeight = 20;  // EXTREME: pack core tightly
            tierDiffWeight = 15;   // Moderate: some depth in core
            pickTopN = 1;          // Precise center packing
        } else {
            angleDiffWeight = 0.3; // MINIMAL: scatter blast everywhere
            tierDiffWeight = 10;   // Moderate: advance outward
            pickTopN = 6;          // High randomness for blast scatter
        }
    } else if (shapeName === 'portals') {
        angleDiffWeight = 0.5;  // Low: spread organically
        tierDiffWeight = 15;    // Moderate: some depth structure
        pickTopN = 5;           // Randomness for organic feel
    } else if (shapeName === 'tree') {
        if (depthRatio < 0.30) {
            angleDiffWeight = 12;  // High: visible trunk
            tierDiffWeight = 10;   // Advance outward
            pickTopN = 2;
        } else if (depthRatio < 0.50) {
            angleDiffWeight = 10;  // High: snap to branch lines
            tierDiffWeight = 8;    // Advance through branches
            pickTopN = 2;
        } else if (depthRatio < 0.72) {
            angleDiffWeight = 0.3; // Low: wide canopy fill
            tierDiffWeight = 20;   // Advance outward
            pickTopN = 6;
        } else {
            angleDiffWeight = 3;   // Moderate: droop back in
            tierDiffWeight = 15;
            pickTopN = 3;
        }
    } else if (shapeName === 'mountain') {
        angleDiffWeight = 0.8;  // Low: allow wide spread at base
        tierDiffWeight = 80;    // EXTREME: pack into same/adjacent tiers
        pickTopN = 4;           // Some randomness for width
    } else if (shapeName === 'cloud') {
        angleDiffWeight = 0.3;  // MINIMAL: scatter freely in any direction
        tierDiffWeight = 5;     // MINIMAL: place at any depth
        pickTopN = 8;           // Maximum randomness for irregular clusters
    } else if (shapeName === 'cascade') {
        angleDiffWeight = 10;   // High: snap precisely to columns
        tierDiffWeight = 60;    // High: clear tier separation
        pickTopN = 2;           // Fairly precise placement
    }

    return { angleDiffWeight: angleDiffWeight, tierDiffWeight: tierDiffWeight, pickTopN: pickTopN };
};

// =============================================================================
// SHAPE CONFORMITY PASS
// =============================================================================

/**
 * Force all node angles to conform to the shape silhouette.
 * This is the PRIMARY shape enforcement — overrides BFS grid placement.
 *
 * @param {Object} ctx - Context from applyPositionsToTree containing:
 *   school, centerAngle, sliceAngle, shapeName, cfg, rng, schoolName
 */
LayoutEngine._shapeConformity = function(ctx) {
    var positioned = ctx.school.nodes.filter(function(n) {
        return n.x !== undefined && !n.isRoot;
    });
    if (positioned.length < 2) return;

    var anchorAngle = ctx.centerAngle;
    var halfSector = ctx.sliceAngle * 0.85 / 2;
    var shapeName = ctx.shapeName;
    var cfg = ctx.cfg;
    var rng = ctx.rng;
    var schoolName = ctx.schoolName;

    positioned.forEach(function(node) {
        var nodeAngle = node.angle;
        if (nodeAngle === undefined) return;
        var nodeRadius = node.radius || 0;
        var maxR = cfg.baseRadius + (cfg.maxTiers || 20) * cfg.tierSpacing;
        var depthNorm = Math.min(1.0, (nodeRadius - cfg.baseRadius) / Math.max(maxR - cfg.baseRadius, 1));
        // Normalize angle within sector (0 = sector start, 1 = sector end)
        var angleNorm = halfSector > 0 ? (nodeAngle - (anchorAngle - halfSector)) / (halfSector * 2) : 0.5;
        // Clamp to 0-1
        angleNorm = Math.max(0, Math.min(1, angleNorm));

        var newAngle = nodeAngle;  // default: keep original

        if (shapeName === 'spiky') {
            // Snap to nearest of 3 ray centers
            var rayPositions = [0.0, 0.333, 0.667];
            var nearestRay = rayPositions[0];
            var nearestDist = 999;
            for (var ri = 0; ri < rayPositions.length; ri++) {
                var d = Math.abs(angleNorm - rayPositions[ri]);
                if (d < nearestDist) { nearestDist = d; nearestRay = rayPositions[ri]; }
            }
            // Also check wrap-around (ray at 1.0 = ray at 0.0)
            if (Math.abs(angleNorm - 1.0) < nearestDist) nearestRay = 1.0;
            // Convert back to absolute angle
            newAngle = (anchorAngle - halfSector) + nearestRay * halfSector * 2;
            // Add tiny jitter to prevent exact overlap
            newAngle += (rng() - 0.5) * 1.5;

        } else if (shapeName === 'swords') {
            // Swords: Two broad blade wedges with gap in center
            // Blade 1 centered at angleNorm 0.20 (left side of sector)
            // Blade 2 centered at angleNorm 0.80 (right side of sector)
            var blade1Norm = 0.20;
            var blade2Norm = 0.80;
            var bladeHalfWidth = 0.15 * (1.0 - depthNorm * 0.5); // Taper at tips
            var blade1Angle = (anchorAngle - halfSector) + blade1Norm * halfSector * 2;
            var blade2Angle = (anchorAngle - halfSector) + blade2Norm * halfSector * 2;
            // Snap to nearest blade center
            var d1 = Math.abs(angleNorm - blade1Norm);
            var d2 = Math.abs(angleNorm - blade2Norm);
            if (d1 <= d2) {
                newAngle = blade1Angle + (rng() - 0.5) * bladeHalfWidth * halfSector * 2 * 0.8;
            } else {
                newAngle = blade2Angle + (rng() - 0.5) * bladeHalfWidth * halfSector * 2 * 0.8;
            }

        } else if (shapeName === 'explosion') {
            // Explosion: tight core → sub-explosions → HOLLOW V-blast
            var coreEnd = 0.10;
            var subBlastEnd = 0.35;
            if (depthNorm < coreEnd) {
                // CORE: force all to dead center
                newAngle = anchorAngle + (rng() - 0.5) * 1.2;
            } else if (depthNorm < subBlastEnd) {
                // SUB-EXPLOSIONS: snap to one of 3 cluster centers
                var subCenters = [
                    anchorAngle - halfSector * 0.40,
                    anchorAngle + halfSector * 0.36,
                    anchorAngle
                ];
                var offsetFromCenter = nodeAngle - anchorAngle;
                var nearestSub = subCenters[0], nearestD = 999;
                for (var si = 0; si < subCenters.length; si++) {
                    var sd = Math.abs(nodeAngle - subCenters[si]);
                    if (sd < nearestD) { nearestD = sd; nearestSub = subCenters[si]; }
                }
                newAngle = nearestSub + (rng() - 0.5) * halfSector * 0.20;
            } else {
                var t = (depthNorm - subBlastEnd) / (1.0 - subBlastEnd);
                var sqrtT = Math.sqrt(t);
                var outerWidth = sqrtT * halfSector * 0.90;
                var innerVoid = sqrtT * halfSector * 0.50;
                var offsetFromCenter = nodeAngle - anchorAngle;
                var absOffset = Math.abs(offsetFromCenter);

                var hash = (Math.abs(nodeAngle * 7.3 + nodeRadius * 0.13)) % 1;
                var isTendril = hash < 0.15;

                if (!isTendril && absOffset < innerVoid) {
                    var pushDir = offsetFromCenter >= 0 ? 1 : -1;
                    if (absOffset < 1.0) pushDir = (rng() > 0.5) ? 1 : -1;
                    var ringSpan = Math.max(1, outerWidth - innerVoid);
                    newAngle = anchorAngle + pushDir * (innerVoid + rng() * ringSpan);
                }
                if (Math.abs(newAngle - anchorAngle) > outerWidth) {
                    newAngle = anchorAngle + Math.sign(newAngle - anchorAngle) * outerWidth;
                }
            }

        } else if (shapeName === 'tree') {
            // Tree: trunk → branches → dome canopy curving back down
            var trunkEnd = 0.30;
            var branchEnd = 0.50;
            var canopyPeak = 0.72;

            if (depthNorm < trunkEnd) {
                // TRUNK: visible thickness — allow ±3° from center
                var trunkHalfWidth = 3.0;
                var offsetFromCenter = nodeAngle - anchorAngle;
                if (Math.abs(offsetFromCenter) > trunkHalfWidth) {
                    newAngle = anchorAngle + Math.sign(offsetFromCenter) * trunkHalfWidth;
                }
            } else if (depthNorm < branchEnd) {
                // BRANCHES: snap to one of 4 branch lines spreading from trunk
                var branchT = (depthNorm - trunkEnd) / (branchEnd - trunkEnd);
                var branchSpread = halfSector * 0.70 * branchT; // branches spread outward
                var branchPositions = [-0.7, -0.3, 0.3, 0.7]; // relative to halfSector
                var offsetFromCenter = nodeAngle - anchorAngle;
                var nearestBranch = branchPositions[0] * branchSpread;
                var nearestDist = 999;
                for (var bi = 0; bi < branchPositions.length; bi++) {
                    var bp = branchPositions[bi] * branchSpread;
                    var bd = Math.abs(offsetFromCenter - bp);
                    if (bd < nearestDist) { nearestDist = bd; nearestBranch = bp; }
                }
                // Also allow trunk continuation
                if (Math.abs(offsetFromCenter) < 2.0) nearestBranch = offsetFromCenter;
                newAngle = anchorAngle + nearestBranch + (rng() - 0.5) * 2.0;
            } else if (depthNorm < canopyPeak) {
                // CANOPY EXPANSION: rapid widening
                var t = (depthNorm - branchEnd) / (canopyPeak - branchEnd);
                var allowedWidth = halfSector * (0.30 + t * t * 0.65);
                var offsetFromCenter = nodeAngle - anchorAngle;
                if (Math.abs(offsetFromCenter) > allowedWidth) {
                    newAngle = anchorAngle + Math.sign(offsetFromCenter) * allowedWidth;
                }
            } else {
                // CANOPY DROOP: curves back toward center (dome shape)
                var t = (depthNorm - canopyPeak) / (1.0 - canopyPeak);
                var maxW = halfSector * 0.95;
                var droopWidth = maxW - t * t * (maxW - halfSector * 0.30);
                var offsetFromCenter = nodeAngle - anchorAngle;
                if (Math.abs(offsetFromCenter) > droopWidth) {
                    newAngle = anchorAngle + Math.sign(offsetFromCenter) * droopWidth;
                }
            }

        } else if (shapeName === 'mountain') {
            // Aggressive triangular taper: full width at base, 5% at peak
            // Use quadratic taper for more dramatic narrowing
            var peakWidth = 0.05;
            var taper = depthNorm * depthNorm;  // Quadratic: narrows faster
            var allowedFraction = 1.0 - taper * (1.0 - peakWidth);
            var maxOffset = halfSector * allowedFraction;
            var offset = nodeAngle - anchorAngle;
            // ALWAYS clamp toward center (even if within bounds, pull inward)
            var pullFactor = Math.min(1.0, depthNorm * 0.4);
            var targetOffset = offset * (1.0 - pullFactor);
            if (Math.abs(targetOffset) > maxOffset) {
                targetOffset = Math.sign(offset) * maxOffset;
            }
            newAngle = anchorAngle + targetOffset;

        } else if (shapeName === 'cascade') {
            // Snap to nearest of 5 column centers
            var numCols = 5;
            var sectorStart = anchorAngle - halfSector;
            var colWidth = (halfSector * 2) / numCols;
            var relAngle = nodeAngle - sectorStart;
            var colIndex = Math.round(relAngle / colWidth - 0.5);
            colIndex = Math.max(0, Math.min(numCols - 1, colIndex));
            newAngle = sectorStart + colIndex * colWidth + colWidth / 2;
            // Tiny jitter within column
            newAngle += (rng() - 0.5) * colWidth * 0.15;
        } else if (shapeName === 'portals') {
            // Portals: push nodes OUT of the doorway arch
            var doorBottom = 0.08;
            var doorTop = 0.85;
            var doorHalfWidth = 0.35;

            if (depthNorm >= doorBottom && depthNorm <= doorTop) {
                var doorProgress = (depthNorm - doorBottom) / (doorTop - doorBottom);
                var archFactor = Math.sqrt(1.0 - doorProgress * doorProgress);
                var archWidth = doorHalfWidth * archFactor;
                // angleNorm relative to sector
                var anNorm = halfSector > 0 ? (nodeAngle - (anchorAngle - halfSector)) / (halfSector * 2) : 0.5;
                anNorm = Math.max(0, Math.min(1, anNorm));
                var distFromCenter = Math.abs(anNorm - 0.5);

                if (distFromCenter < archWidth) {
                    // Node is INSIDE the doorway hole → push to nearest frame edge
                    var pushDir = (anNorm >= 0.5) ? 1 : -1;
                    var frameEdgeNorm = 0.5 + pushDir * (archWidth + 0.02);
                    newAngle = (anchorAngle - halfSector) + frameEdgeNorm * halfSector * 2;
                    newAngle += (rng() - 0.5) * 2.0;
                }
            }
        }
        // cloud: no conformity needed (scattered is the shape)

        if (newAngle !== nodeAngle) {
            node.angle = newAngle;
            var rad = newAngle * Math.PI / 180;
            node.x = Math.cos(rad) * nodeRadius;
            node.y = Math.sin(rad) * nodeRadius;
        }
    });

    _skseLog(schoolName + ': Shape conformity pass applied for ' + shapeName);
};

// =============================================================================
// SHAPE-AWARE DENSITY STRETCH
// =============================================================================

/**
 * Expand tree outward FROM ROOT, but respect shape proportions.
 * Spiky = narrow+tall, mountain = wide base+tapered, organic = balanced.
 *
 * @param {Object} ctx - Context from applyPositionsToTree containing:
 *   school, allRootNodes, usableAngle, centerAngle, cfg, shapeName,
 *   shapSpreadMult, shapTierMult, shapHasTaper, shapTaperAmount, schoolName
 */
LayoutEngine._densityStretch = function(ctx) {
    var positioned = ctx.school.nodes.filter(function(n) {
        return n.x !== undefined && !n.isRoot;
    });
    if (positioned.length < 2) return;

    var allRootNodes = ctx.allRootNodes;
    var usableAngle = ctx.usableAngle;
    var centerAngle = ctx.centerAngle;
    var cfg = ctx.cfg;
    var shapeName = ctx.shapeName;
    var shapSpreadMult = ctx.shapSpreadMult;
    var shapTierMult = ctx.shapTierMult;
    var shapHasTaper = ctx.shapHasTaper;
    var shapTaperAmount = ctx.shapTaperAmount;
    var schoolName = ctx.schoolName;

    // Anchor = average root position (stays fixed)
    var anchorAngle = 0, anchorRadius = 0;
    allRootNodes.forEach(function(r) { anchorAngle += r.angle || 0; anchorRadius += r.radius || 0; });
    anchorAngle /= allRootNodes.length;
    anchorRadius /= allRootNodes.length;

    // Measure current extent relative to root
    var maxAngleOffset = 0, maxRadiusOffset = 0;
    positioned.forEach(function(n) {
        var aOff = Math.abs(n.angle - anchorAngle);
        var rOff = n.radius - anchorRadius;
        if (aOff > maxAngleOffset) maxAngleOffset = aOff;
        if (rOff > maxRadiusOffset) maxRadiusOffset = rOff;
    });

    if (maxAngleOffset < 1 || maxRadiusOffset < 1) return;

    // Available sector bounds
    var sectorHalfAngle = usableAngle / 2;
    var sectorMinAngle = centerAngle - sectorHalfAngle;
    var sectorMaxAngle = centerAngle + sectorHalfAngle;

    // Max radius: furthest tier in grid
    var maxGridRadius = cfg.baseRadius + (cfg.maxTiers - 1) * cfg.tierSpacing;
    var availableRadiusFromRoot = maxGridRadius - anchorRadius;

    // Shape-aware stretch targets:
    // CRITICAL: Some shapes MUST stay narrow/sparse to look distinct.
    // Stretching them to fill the sector erases their visual identity.
    var baseTarget = 0.85;
    var angleTarget, radiusTarget;
    if (shapeName === 'spiky') {
        // Spiky: NO angle stretch at all — stay as narrow rays
        angleTarget = 0.0;
        radiusTarget = 0.95;
    } else if (shapeName === 'swords') {
        // Swords: moderate angle spread for blade width, stretch outward
        angleTarget = 0.5;  // Half sector — two blades don't fill whole sector
        radiusTarget = 0.9;
    } else if (shapeName === 'explosion') {
        // Explosion: wide blast filling sector, stretching outward
        angleTarget = 0.85;  // Nearly full sector (blast fills wide)
        radiusTarget = 0.9;  // Stretch outward for dramatic blast radius
    } else if (shapeName === 'tree') {
        // Tree: wider spread for thick canopy visibility
        angleTarget = 0.70;
        radiusTarget = 0.85;
    } else if (shapeName === 'cloud') {
        // Cloud: moderate scatter, don't compress or expand
        angleTarget = 0.65;
        radiusTarget = 0.7;
    } else if (shapeName === 'cascade') {
        // Cascade: moderate width for column spread
        angleTarget = 0.75;
        radiusTarget = 0.9;
    } else if (shapeName === 'mountain') {
        // Mountain: wide base, but taper re-applied after stretch
        angleTarget = 0.9;
        radiusTarget = 0.6;  // Keep compact (wide base, not tall)
    } else if (shapeName === 'portals') {
        // Portals: fill most of sector (holes are in the mask, not the stretch)
        angleTarget = 0.8;
        radiusTarget = 0.75;
    } else {
        // Organic and others: fill more of the sector
        angleTarget = baseTarget * shapSpreadMult;
        radiusTarget = baseTarget;
        if (shapTierMult < 0.9) {
            radiusTarget = baseTarget * (0.5 + shapTierMult * 0.5);
        }
    }

    var angleStretch = Math.min(3.5, Math.max(1.0, (sectorHalfAngle * angleTarget) / maxAngleOffset));
    var radiusStretch = Math.min(3.0, Math.max(1.0, (availableRadiusFromRoot * radiusTarget) / maxRadiusOffset));

    if (angleStretch <= 1.02 && radiusStretch <= 1.02) return;

    // Apply stretch: scale outward FROM ROOT
    positioned.forEach(function(n) {
        var newAngle = anchorAngle + (n.angle - anchorAngle) * angleStretch;
        newAngle = Math.max(sectorMinAngle + 0.5, Math.min(sectorMaxAngle - 0.5, newAngle));

        var newRadius = anchorRadius + (n.radius - anchorRadius) * radiusStretch;
        newRadius = Math.max(anchorRadius + cfg.tierSpacing * 0.5, Math.min(maxGridRadius, newRadius));

        // Re-apply taper AFTER stretch for tapering shapes (mountain)
        if (shapHasTaper) {
            var depthRatio = (newRadius - anchorRadius) / Math.max(availableRadiusFromRoot * radiusTarget, 1);
            var taperRatio = Math.max(shapTaperAmount, 1.0 - depthRatio * (1.0 - shapTaperAmount));
            newAngle = anchorAngle + (newAngle - anchorAngle) * taperRatio;
        }

        n.angle = newAngle;
        n.radius = newRadius;
        var rad = newAngle * Math.PI / 180;
        n.x = Math.cos(rad) * newRadius;
        n.y = Math.sin(rad) * newRadius;
    });

    _skseLog(schoolName + ': Density stretch (shape=' + shapeName +
        ', angleTarget=' + (angleTarget * 100).toFixed(0) + '%' +
        ', radiusTarget=' + (radiusTarget * 100).toFixed(0) + '%' +
        ', angle x' + angleStretch.toFixed(2) +
        ', radius x' + radiusStretch.toFixed(2) + ')');
};
