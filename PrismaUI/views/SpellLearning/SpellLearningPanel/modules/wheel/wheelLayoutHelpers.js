/**
 * WheelRenderer Layout Helpers - Gap filling, collision resolution, and overlap shrink.
 * Adds post-processing layout methods to WheelRenderer: fillGaps,
 * resolveCollisions, calculateOverlapShrink.
 *
 * Loaded after: wheelLayout.js
 */

// Fill empty gaps by pulling outer nodes inward AND scattering some toward root
WheelRenderer.fillGaps = function(nodes, spokeAngle, sectorAngle, cfg, maxDepth) {
    if (nodes.length < 5) return;  // Too few nodes to worry about gaps

    var self = this;

    // Calculate radius statistics
    var avgRadius = 0;
    var minRadius = Infinity;
    var maxRadius = 0;

    nodes.forEach(function(n) {
        avgRadius += n.radius;
        minRadius = Math.min(minRadius, n.radius);
        maxRadius = Math.max(maxRadius, n.radius);
    });
    avgRadius /= nodes.length;

    // Find root nodes
    var rootNodes = nodes.filter(function(n) { return n.isRoot || n.depth === 0; });
    var nonRootNodes = nodes.filter(function(n) { return !n.isRoot && n.depth > 0; });

    // STEP 1: Scatter some early-tier nodes closer to root
    // The area between center (0) and baseRadius is often empty
    var earlyTierNodes = nonRootNodes.filter(function(n) {
        return (n.depth <= 2) && !n._gapFilled;
    });

    if (earlyTierNodes.length > 2) {
        // Pull 15-25% of early tier nodes closer to root
        var scatterCount = Math.max(2, Math.floor(earlyTierNodes.length * 0.2));

        // Shuffle early tier nodes
        for (var i = earlyTierNodes.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = earlyTierNodes[i];
            earlyTierNodes[i] = earlyTierNodes[j];
            earlyTierNodes[j] = temp;
        }

        var halfSector = sectorAngle / 2;
        for (var i = 0; i < scatterCount && i < earlyTierNodes.length; i++) {
            var node = earlyTierNodes[i];

            // Pull closer to root - between baseRadius * 0.4 and baseRadius * 0.8
            var pullTarget = cfg.baseRadius * (0.4 + Math.random() * 0.4);
            var newRadius = Math.min(node.radius, pullTarget + Math.random() * cfg.tierSpacing * 0.3);

            // Add angular scatter within sector
            var angleJitter = (Math.random() - 0.5) * sectorAngle * 0.6;
            var newAngle = spokeAngle + angleJitter;

            // Clamp to sector
            newAngle = Math.max(spokeAngle - halfSector * 0.85, Math.min(spokeAngle + halfSector * 0.85, newAngle));

            node.radius = newRadius;
            node.angle = newAngle;
            node._gapFilled = true;

            var rad = newAngle * Math.PI / 180;
            node.x = Math.cos(rad) * newRadius;
            node.y = Math.sin(rad) * newRadius;
        }

        console.log('[WheelRenderer] Inner scatter: moved ' + scatterCount + ' nodes closer to center');
    }

    // STEP 2: Fill middle gaps by pulling outer nodes inward
    var midRadius = (minRadius + maxRadius) / 2;
    var innerNodes = nodes.filter(function(n) { return n.radius < midRadius && !n._gapFilled; });
    var outerNodes = nodes.filter(function(n) { return n.radius >= midRadius && !n._gapFilled && !n.isRoot; });

    var innerDensity = innerNodes.length / Math.max(1, midRadius - minRadius);
    var outerDensity = outerNodes.length / Math.max(1, maxRadius - midRadius);

    if (outerDensity > innerDensity * 1.3 && outerNodes.length > 3) {
        var pullCount = Math.min(Math.floor(outerNodes.length * 0.35), Math.floor(nodes.length * 0.25));

        // Sort by radius descending (outermost first)
        outerNodes.sort(function(a, b) { return b.radius - a.radius; });

        for (var i = 0; i < pullCount && i < outerNodes.length; i++) {
            var node = outerNodes[i];
            if (node._gapFilled) continue;

            // Pull 30-60% toward center
            var pullFactor = 0.3 + Math.random() * 0.3;
            var newRadius = node.radius * (1 - pullFactor) + avgRadius * pullFactor;

            // Angular jitter
            var angleJitter = (Math.random() - 0.5) * sectorAngle * 0.35;
            var newAngle = node.angle + angleJitter;

            var halfSector = sectorAngle / 2;
            newAngle = Math.max(spokeAngle - halfSector * 0.9, Math.min(spokeAngle + halfSector * 0.9, newAngle));

            node.radius = newRadius;
            node.angle = newAngle;
            node._gapFilled = true;

            var rad = newAngle * Math.PI / 180;
            node.x = Math.cos(rad) * newRadius;
            node.y = Math.sin(rad) * newRadius;
        }

        console.log('[WheelRenderer] Mid gap fill: pulled ' + pullCount + ' nodes inward');
    }
};

WheelRenderer.resolveCollisions = function(nodes, spokeAngle, maxSpread) {
    var cfg = TREE_CONFIG.wheel;
    var minDistance = Math.sqrt(cfg.nodeWidth * cfg.nodeWidth + cfg.nodeHeight * cfg.nodeHeight) * 0.7;
    var iterations = 5;
    var pushStrength = 0.3;
    var halfSpread = maxSpread / 2;

    for (var iter = 0; iter < iterations; iter++) {
        var moved = false;

        for (var i = 0; i < nodes.length; i++) {
            for (var j = i + 1; j < nodes.length; j++) {
                var a = nodes[i];
                var b = nodes[j];

                var dx = b.x - a.x;
                var dy = b.y - a.y;
                var dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < minDistance && dist > 0) {
                    var overlap = minDistance - dist;
                    var pushX = (dx / dist) * overlap * pushStrength;
                    var pushY = (dy / dist) * overlap * pushStrength;

                    var newAx = a.x - pushX;
                    var newAy = a.y - pushY;
                    var newBx = b.x + pushX;
                    var newBy = b.y + pushY;

                    var aAngle = Math.atan2(newAy, newAx) * 180 / Math.PI;
                    var bAngle = Math.atan2(newBy, newBx) * 180 / Math.PI;

                    if (Math.abs(aAngle - spokeAngle) <= halfSpread) {
                        a.x = newAx;
                        a.y = newAy;
                        a.angle = aAngle;
                        moved = true;
                    }
                    if (Math.abs(bAngle - spokeAngle) <= halfSpread) {
                        b.x = newBx;
                        b.y = newBy;
                        b.angle = bAngle;
                        moved = true;
                    }
                }
            }
        }

        if (!moved) break;
    }
};

// Calculate shrink factors for overlapping nodes
WheelRenderer.calculateOverlapShrink = function() {
    var cfg = TREE_CONFIG.wheel;
    var baseMinDist = Math.sqrt(cfg.nodeWidth * cfg.nodeWidth + cfg.nodeHeight * cfg.nodeHeight) * 0.6;

    // Reset all shrink factors
    this.nodes.forEach(function(node) {
        node._shrinkFactor = 1.0;
    });

    // Check all pairs for overlap
    var self = this;
    var overlapCount = 0;

    for (var i = 0; i < this.nodes.length; i++) {
        var a = this.nodes[i];
        var aNeighborCount = 0;
        var closestDist = Infinity;

        for (var j = 0; j < this.nodes.length; j++) {
            if (i === j) continue;
            var b = this.nodes[j];

            var dx = b.x - a.x;
            var dy = b.y - a.y;
            var dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < baseMinDist * 1.5) {
                aNeighborCount++;
                closestDist = Math.min(closestDist, dist);
            }
        }

        // If node has many close neighbors, shrink it
        if (aNeighborCount >= 2 || closestDist < baseMinDist * 0.8) {
            // Shrink based on how close neighbors are
            var shrinkFactor = Math.max(0.5, Math.min(1.0, closestDist / baseMinDist));
            // Also shrink more if many neighbors
            if (aNeighborCount >= 3) shrinkFactor *= 0.85;
            if (aNeighborCount >= 5) shrinkFactor *= 0.85;

            a._shrinkFactor = shrinkFactor;
            overlapCount++;
        }
    }

    if (overlapCount > 0) {
        console.log('[WheelRenderer] Shrink factors applied to ' + overlapCount + ' overlapping nodes');
    }
};
